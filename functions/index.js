const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

function isValidEmail(email) {
  if (!email) return false;
  const s = String(email).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}


function getSmtpConfig() {
  const cfg = functions.config().smtp || {};
  const host = cfg.host || process.env.SMTP_HOST;
  const port = cfg.port || process.env.SMTP_PORT;
  const secure = cfg.secure || process.env.SMTP_SECURE;
  const user = cfg.user || process.env.SMTP_USER;
  const pass = cfg.pass || process.env.SMTP_PASS;
  const fromEmail = cfg.from_email || cfg.fromEmail || process.env.SMTP_FROM_EMAIL || cfg.from;
  const fromName = cfg.from_name || cfg.fromName || process.env.SMTP_FROM_NAME || "Mutabakat Portal";
  const replyTo = cfg.reply_to || cfg.replyTo || process.env.SMTP_REPLY_TO || "";

  if (!host || !port || !user || !pass || !fromEmail) {
    throw new Error(
      "Missing SMTP config. Please set: smtp.host, smtp.port, smtp.secure, smtp.user, smtp.pass, and smtp.from or smtp.from_email"
    );
  }
  return {
    ...cfg,
    host,
    port,
    secure,
    user,
    pass,
    from: buildFromAddress(fromEmail, fromName),
    replyTo: String(replyTo || "").trim(),
  };
}

function buildFromAddress(email, name) {
  const rawEmail = String(email || "").trim();
  if (!rawEmail) return "";
  if (rawEmail.includes("<") && rawEmail.includes(">")) return rawEmail;

  const rawName = String(name || "").trim();
  if (!rawName) return rawEmail;

  const safeName = rawName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${safeName}" <${rawEmail}>`;
}

function getMailDefaults() {
  const cfg = getSmtpConfig();
  return {
    from: cfg.from,
    ...(cfg.replyTo ? { replyTo: cfg.replyTo } : {}),
  };
}

function createTransporter() {
  const cfg = getSmtpConfig();
  return nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port),
    secure: String(cfg.secure) === "true", // 465 => true, 587 => false
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

function getPortalUrl() {
  const cfg = functions.config();
  return (cfg.app && cfg.app.portal_url) || "https://mutabakatportali.web.app/";
}

function appendPortalLink(html) {
  const portalUrl = getPortalUrl();
  const block = `
    <div style="margin-top:16px; padding-top:12px; border-top:1px solid #ddd;">
      <div style="margin-bottom:6px;"><b>Detayları görüntülemek için:</b></div>
      <a href="${portalUrl}">${portalUrl}</a>
    </div>
  `;
  return `${String(html || "")}${block}`;
}

function formatDateTR(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("tr-TR");
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 1) Enqueue: New notification -> add a pending item to mailQueue.
 */
exports.enqueueMailOnNewBildirim = functions.firestore
  .document("bildirimler/{id}")
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    const cikisDepo = data.cikisDepo;

    if (!cikisDepo) {
      console.log("cikisDepo empty, skip enqueue");
      return null;
    }

    await admin.firestore().collection("mailQueue").add({
      bildirimId: context.params.id,
      cikisDepo: String(cikisDepo),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "pending",
    });

    console.log("Enqueued mailQueue item for:", cikisDepo, context.params.id);
    return null;
  });

/**
 * 2) Scheduler: Every 1 minute -> send one digest email per `cikisDepo` for all pending items.
 * Later you can change schedule to: "every 10 minutes"
 */
exports.sendDigestMails = functions.pubsub
  .schedule("every 30 minutes")
  .timeZone("Europe/Istanbul")
  .onRun(async () => {
    const db = admin.firestore();
    const transporter = createTransporter();

    const pendingSnap = await db.collection("mailQueue")
      .where("status", "==", "pending")
      .get();

    if (pendingSnap.empty) {
      console.log("No pending mailQueue items.");
      return null;
    }

    const grouped = {};
    pendingSnap.forEach((doc) => {
      const q = doc.data();
      const dep = q.cikisDepo;
      if (!grouped[dep]) grouped[dep] = [];
      grouped[dep].push({ queueId: doc.id, ...q });
    });

    for (const cikisDepo of Object.keys(grouped)) {
      const items = grouped[cikisDepo];

      const usersSnap = await db.collection("users")
        .where("sube", "==", cikisDepo)
        .get();

      const emails = [];
      const invalidEmails = [];

      usersSnap.forEach((doc) => {
        const u = doc.data() || {};
        const raw = u.email;
        const cleaned = raw ? String(raw).trim() : "";
        if (isValidEmail(cleaned)) {
          emails.push(cleaned);
        } else if (cleaned) {
          invalidEmails.push(cleaned);
        }
      });

      const uniqueEmails = Array.from(new Set(emails));

      if (uniqueEmails.length === 0) {
        console.log(
          "No recipients found for:",
          cikisDepo,
          "| users matched:",
          usersSnap.size,
          "| invalid emails:",
          invalidEmails.length
        );
        if (invalidEmails.length) {
          console.log("Invalid emails:", invalidEmails.slice(0, 10).join(", "));
        }
        // Do not mark queue as sent; keep pending so it can be retried after fixing users.
        continue;
      }

if (uniqueEmails.length === 0) {
        console.log("No recipients found for cikisDepo:", cikisDepo);
        continue;
      }

      
// Build digest content: group notifications by `sube` name instead of listing IDs.
const bildirimRefs = items.map((x) => db.collection("bildirimler").doc(String(x.bildirimId)));
const bildirimDocs = bildirimRefs.length ? await db.getAll(...bildirimRefs) : [];

const subeCounts = new Map();
let unknownCount = 0;

for (const d of bildirimDocs) {
  if (!d.exists) {
    unknownCount += 1;
    continue;
  }
  const b = d.data() || {};
  const subeAdi = b.sube ? String(b.sube) : "Bilinmeyen Şube";
  subeCounts.set(subeAdi, (subeCounts.get(subeAdi) || 0) + 1);
}

// If any bildirim docs were missing, count them under "Bilinmeyen Şube"
if (unknownCount) {
  subeCounts.set("Bilinmeyen Şube", (subeCounts.get("Bilinmeyen Şube") || 0) + unknownCount);
}

// Render list (top N by count)
const maxList = 25;
const entries = Array.from(subeCounts.entries()).sort((a, b) => b[1] - a[1]);
const shown = entries.slice(0, maxList);
const listHtml = shown
  .map(([subeAdi, count]) => `<li><b>${subeAdi}:</b> ${count} bildirim</li>`)
  .join("");

// If we truncated the list, summarize the remaining notifications (not the remaining branches)
const hiddenCount = entries.length > maxList
  ? entries.slice(maxList).reduce((acc, [, c]) => acc + c, 0)
  : 0;

const subject = `📌 ${cikisDepo} - Son 1 dk: ${items.length} yeni bildirim`;
const html = `
  <h3>${cikisDepo} için bildirim özeti</h3>
  <p>Son 1 dakikada <b>${items.length}</b> adet yeni bildirim oluşturuldu.</p>
  <ul>${listHtml || "<li>Yeni bildirim yok</li>"}</ul>
  ${hiddenCount ? `<p>+${hiddenCount} bildirim (diğer şubeler)</p>` : ""}
  <hr/>
  <p style="font-size:12px;color:#666;">
    Bu e-posta otomatik olarak Mutabakat Portal tarafından gönderilmiştir.
  </p>
`;


      await transporter.sendMail({
        ...getMailDefaults(),
        to: uniqueEmails.join(", "),
        subject,
        html: appendPortalLink(html),
      });

      console.log("Digest email sent:", cikisDepo, "| pending items:", items.length, "| recipients:", uniqueEmails.length, "| sample recipients:", uniqueEmails.slice(0, 3).join(", "));
      if (invalidEmails.length) {
        console.log("Invalid emails skipped:", invalidEmails.slice(0, 10).join(", "));
      }

      const batch = db.batch();
      items.forEach((x) => {
        batch.update(db.collection("mailQueue").doc(x.queueId), {
          status: "sent",
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }

    return null;
  });

// 3) Mudur daily summary mail (opened/closed/open counts)
exports.sendMudurDailySummary = functions.pubsub
  .schedule("0 9 * * 1") // Pazartesi 09:00 
  .timeZone("Europe/Istanbul")
  .onRun(async () => {
    try {
      const db = admin.firestore();

      // Get mudur recipients
      const mudurSnap = await db.collection("users")
        .where("role", "==", "mudur")
        .get();

      const mudurEmails = [];
      mudurSnap.forEach((doc) => {
        const u = doc.data() || {};
        const cleaned = u.email ? String(u.email).trim() : "";
        if (isValidEmail(cleaned)) mudurEmails.push(cleaned);
      });

      const uniqueMudurEmails = Array.from(new Set(mudurEmails));
      if (!uniqueMudurEmails.length) {
        console.log("Mudur summary: no recipients found.", "| mudur users:", mudurSnap.size);
        return null;
      }

      // Last 7 days window (rolling)
      const now = new Date();
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const end = now;

      // Use Firestore Timestamp for range queries (more robust than Date objects)
      const startTs = admin.firestore.Timestamp.fromDate(start);
      const endTs = admin.firestore.Timestamp.fromDate(end);

      // 1) Opened in last 7 days (createdAt in range)
      const openedSnap = await db.collection("bildirimler")
        .where("createdAt", ">=", startTs)
        .where("createdAt", "<=", endTs)
        .get();

      // 2) Closed in last 7 days:
      // Avoid composite index by NOT combining "durum == Kapandı" with closedAt range in the query.
      const closedRangeSnap = await db.collection("bildirimler")
        .where("closedAt", ">=", startTs)
        .where("closedAt", "<=", endTs)
        .get();

      const closedCount = closedRangeSnap.docs.filter(d => (d.data()?.durum === "Kapandı")).length;

      // 3) Current open count
      const openSnap = await db.collection("bildirimler")
        .where("durum", "==", "Açık")
        .get();

      const openedCount = openedSnap.size;
      const openCount = openSnap.size;

      // Şube bazlı kırılım (bildirim yapan şube = sube)
      const bySube = {};
      function ensureSube(key) {
        const k = String(key || "Bilinmiyor").trim() || "Bilinmiyor";
        if (!bySube[k]) bySube[k] = { opened: 0, closed: 0, open: 0 };
        return k;
      }

      openedSnap.forEach((doc) => {
        const d = doc.data() || {};
        const sube = ensureSube(d.sube);
        bySube[sube].opened += 1;
      });

      closedRangeSnap.forEach((doc) => {
        const d = doc.data() || {};
        if (d.durum === "Kapandı") {
          const sube = ensureSube(d.sube);
          bySube[sube].closed += 1;
        }
      });

      openSnap.forEach((doc) => {
        const d = doc.data() || {};
        const sube = ensureSube(d.sube);
        bySube[sube].open += 1;
      });

      const subeRows = Object.entries(bySube)
        .map(([sube, v]) => ({ sube, ...v }))
        .sort((a, b) => (b.open - a.open) || (b.opened - a.opened) || (b.closed - a.closed));

      const startStr = start.toLocaleDateString("tr-TR");
      const endStr = end.toLocaleDateString("tr-TR");

      const subject = `Haftalık Bildirim Özeti (Son 7 Gün) - ${endStr}`;
      const html = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.7; color: #222;">
  <div style="font-weight: 700; font-size: 16px; margin-bottom: 12px;">
    Haftalık Bildirim Özeti (Son 7 Gün)
  </div>

  <div style="margin-bottom: 12px;">
    Sayın Yetkili,
    <br/>
    <b>${startStr} - ${endStr}</b> aralığındaki bildirim durum özetini aşağıda bilgilerinize sunarız.
  </div>

  <div style="background:#f7f7f7; border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:14px;">
    <div style="font-weight:700; margin-bottom:6px;">Genel Özet</div>
    <div>• <b>Son 7 günde oluşturulan bildirim sayısı:</b> ${openedCount}</div>
    <div>• <b>Son 7 günde kapatılan bildirim sayısı:</b> ${closedCount}</div>
    <div>• <b>Güncel açık bildirim toplamı:</b> ${openCount}</div>
  </div>

  <div style="font-weight:700; margin: 10px 0 8px 0;">Bildirim Yapılan Şubeler</div>

  <table style="border-collapse: collapse; width: 100%; font-size: 13px;">
    <thead>
      <tr style="background:#fafafa;">
        <th style="padding:8px 10px; border:1px solid #e5e5e5; text-align:left;">Şube</th>
        <th style="padding:8px 10px; border:1px solid #e5e5e5;">Son 7 Gün Açılan</th>
        <th style="padding:8px 10px; border:1px solid #e5e5e5;">Son 7 Gün Kapanan</th>
        <th style="padding:8px 10px; border:1px solid #e5e5e5;">Güncel Açık</th>
      </tr>
    </thead>
    <tbody>
      ${
        subeRows.length
          ? subeRows.map((r) => `
              <tr>
                <td style="padding:8px 10px; border:1px solid #e5e5e5;">${r.sube}</td>
                <td style="padding:8px 10px; border:1px solid #e5e5e5; text-align:center;">${r.opened}</td>
                <td style="padding:8px 10px; border:1px solid #e5e5e5; text-align:center;">${r.closed}</td>
                <td style="padding:8px 10px; border:1px solid #e5e5e5; text-align:center; font-weight:700;">${r.open}</td>
              </tr>
            `).join("")
          : `
              <tr>
                <td colspan="4" style="padding:10px; border:1px solid #e5e5e5; text-align:center; color:#777;">
                  Şube kırılımı bulunamadı.
                </td>
              </tr>
            `
      }
    </tbody>
  </table>

  <hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;" />

  <div style="color: #666; margin-top: 10px;">
    Saygılarımızla,
    <br/>
    <b>Mutabakat Portal | Basbug</b>
  </div>

  <div style="color: #888; font-size: 12px; margin-top: 12px;">
    Bu e-posta otomatik olarak Mutabakat Portal tarafından oluşturulmuştur.
  </div>
</div>
`;

      const transporter = createTransporter();
      await transporter.sendMail({
        ...getMailDefaults(),
        to: uniqueMudurEmails.join(", "),
        subject,
        html: appendPortalLink(html),
      });

      console.log(
        "Mudur weekly-style summary sent:",
        `${startStr} - ${endStr}`,
        "| recipients:",
        uniqueMudurEmails.length,
        "| opened:",
        openedCount,
        "| closed:",
        closedCount,
        "| open:",
        openCount
      );

      return null;
    } catch (err) {
      console.error("Mudur summary FAILED:", err);
      return null;
    }
  });

// 4) Admin Daily Summary: same style as Mudur summary but DAILY (last 24h)
exports.sendAdminDailySummary = functions.pubsub
  .schedule("0 9 * * *") // Her gun 09:00
  .timeZone("Europe/Istanbul")
  .onRun(async () => {
    try {
      const db = admin.firestore();

      // Get admin recipients
      const adminSnap = await db.collection("users")
        .where("role", "==", "admin")
        .get();

      const adminEmails = [];
      adminSnap.forEach((doc) => {
        const u = doc.data() || {};
        const cleaned = u.email ? String(u.email).trim() : "";
        if (isValidEmail(cleaned)) adminEmails.push(cleaned);
      });

      const uniqueAdminEmails = Array.from(new Set(adminEmails));
      if (!uniqueAdminEmails.length) {
        console.log("Admin summary: no recipients found.", "| admin users:", adminSnap.size);
        return null;
      }

      // Last 24 hours window (rolling)
      const now = new Date();
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const end = now;

      const startTs = admin.firestore.Timestamp.fromDate(start);
      const endTs = admin.firestore.Timestamp.fromDate(end);

      // 1) Opened in last 24 hours (createdAt in range)
      const openedSnap = await db.collection("bildirimler")
        .where("createdAt", ">=", startTs)
        .where("createdAt", "<=", endTs)
        .get();

      // 2) Closed in last 24 hours (range first, then filter by durum to avoid composite index)
      const closedRangeSnap = await db.collection("bildirimler")
        .where("closedAt", ">=", startTs)
        .where("closedAt", "<=", endTs)
        .get();

      const closedCount = closedRangeSnap.docs.filter(d => (d.data()?.durum === "Kapandı")).length;

      // 3) Current open count
      const openSnap = await db.collection("bildirimler")
        .where("durum", "==", "Açık")
        .get();

      const openedCount = openedSnap.size;
      const openCount = openSnap.size;

      // Şube bazlı kırılım (bildirim yapan şube = sube)
      const bySube = {};
      function ensureSube(key) {
        const k = String(key || "Bilinmiyor").trim() || "Bilinmiyor";
        if (!bySube[k]) bySube[k] = { opened: 0, closed: 0, open: 0 };
        return k;
      }

      openedSnap.forEach((doc) => {
        const d = doc.data() || {};
        const sube = ensureSube(d.sube);
        bySube[sube].opened += 1;
      });

      closedRangeSnap.forEach((doc) => {
        const d = doc.data() || {};
        if (d.durum === "Kapandı") {
          const sube = ensureSube(d.sube);
          bySube[sube].closed += 1;
        }
      });

      openSnap.forEach((doc) => {
        const d = doc.data() || {};
        const sube = ensureSube(d.sube);
        bySube[sube].open += 1;
      });

      const subeRows = Object.entries(bySube)
        .map(([sube, v]) => ({ sube, ...v }))
        .sort((a, b) => (b.open - a.open) || (b.opened - a.opened) || (b.closed - a.closed));

      const startStr = start.toLocaleString("tr-TR");
      const endStr = end.toLocaleString("tr-TR");
      const endDateStr = end.toLocaleDateString("tr-TR");

      const subject = `Günlük Bildirim Özeti (Son 24 Saat) - ${endDateStr}`;
      const html = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.7; color: #222;">
  <div style="font-weight: 700; font-size: 16px; margin-bottom: 12px;">
    Günlük Bildirim özeti (Son 24 Saat)
  </div>

  <div style="margin-bottom: 12px;">
    Sayın Yetkili,
    <br/>
    <b>${startStr} - ${endStr}</b> aralığındaki bildirim durum özetini aşagıda bilgilerinize sunarız.
  </div>

  <div style="background:#f7f7f7; border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:14px;">
    <div style="font-weight:700; margin-bottom:6px;">Genel özet</div>
    <div>• <b>Son 24 saatte oluşturulan bildirim sayısı:</b> ${openedCount}</div>
    <div>• <b>Son 24 saatte kapatılan bildirim sayısı:</b> ${closedCount}</div>
    <div>• <b>Güncel açık bildirim toplamı:</b> ${openCount}</div>
  </div>

  <div style="font-weight:700; margin: 10px 0 8px 0;">Bildirim Yapan Şubeler</div>

  <table style="border-collapse: collapse; width: 100%; font-size: 13px;">
    <thead>
      <tr style="background:#fafafa;">
        <th style="padding:8px 10px; border:1px solid #e5e5e5; text-align:left;">Şube</th>
        <th style="padding:8px 10px; border:1px solid #e5e5e5;">Son 24 Saat Açılan</th>
        <th style="padding:8px 10px; border:1px solid #e5e5e5;">Son 24 Saat Kapanan</th>
        <th style="padding:8px 10px; border:1px solid #e5e5e5;">Güncel Açık</th>
      </tr>
    </thead>
    <tbody>
      ${
        subeRows.length
          ? subeRows.map((r) => `
              <tr>
                <td style="padding:8px 10px; border:1px solid #e5e5e5;">${r.sube}</td>
                <td style="padding:8px 10px; border:1px solid #e5e5e5; text-align:center;">${r.opened}</td>
                <td style="padding:8px 10px; border:1px solid #e5e5e5; text-align:center;">${r.closed}</td>
                <td style="padding:8px 10px; border:1px solid #e5e5e5; text-align:center; font-weight:700;">${r.open}</td>
              </tr>
            `).join("")
          : `
              <tr>
                <td colspan="4" style="padding:10px; border:1px solid #e5e5e5; text-align:center; color:#777;">
                  Sube kirilimi bulunamadi.
                </td>
              </tr>
            `
      }
    </tbody>
  </table>

  <hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;" />

  <div style="color: #666; margin-top: 10px;">
    Saygılarımızla,
    <br/>
    <b>Mutabakat Portal | Başbuğ</b>
  </div>

  <div style="color: #888; font-size: 12px; margin-top: 12px;">
    Bu e-posta otomatik olarak Mutabakat Portal tarafindan olusturulmustur.
  </div>
</div>
`;

      const transporter = createTransporter();
      await transporter.sendMail({
        ...getMailDefaults(),
        to: uniqueAdminEmails.join(", "),
        subject,
        html: appendPortalLink(html),
      });

      console.log(
        "Admin daily summary sent:",
        `${startStr} - ${endStr}`,
        "| recipients:",
        uniqueAdminEmails.length,
        "| opened:",
        openedCount,
        "| closed:",
        closedCount,
        "| open:",
        openCount
      );

      return null;
    } catch (err) {
      console.error("Admin summary FAILED:", err);
      return null;
    }
  });

exports.setClosedAtOnStatusChange = functions.firestore
  .document("bildirimler/{id}")
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};

    const beforeDurum = before.durum;
    const afterDurum = after.durum;

    // Kapandı'ya yeni geçtiyse ve closedAt yoksa ekle
    if (beforeDurum !== "Kapandı" && afterDurum === "Kapandı" && !after.closedAt) {
      console.log("Setting closedAt for:", context.params.id);

      await change.after.ref.update({
        closedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return null;
  });
// 5) Stok Hourly Summary: last 1 hour opened -> group by cikisDepo
exports.sendStokHourlySummary = functions.pubsub
  .schedule("0 * * * *") // her saat başı
  .timeZone("Europe/Istanbul")
  .onRun(async () => {
    const db = admin.firestore();
    const transporter = createTransporter();

    // Stok recipients
    const stokSnap = await db.collection("users")
      .where("role", "==", "stok")
      .get();

    const stokEmails = [];
    stokSnap.forEach((doc) => {
      const u = doc.data() || {};
      const cleaned = u.email ? String(u.email).trim() : "";
      if (isValidEmail(cleaned)) stokEmails.push(cleaned);
    });

    const uniqueStokEmails = Array.from(new Set(stokEmails));
    if (!uniqueStokEmails.length) {
      console.log("Stok hourly summary: no recipients found.");
      return null;
    }

    // Last 1 hour window (based on Firestore Timestamp)
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const startTs = admin.firestore.Timestamp.fromDate(oneHourAgo);

    const openedSnap = await db.collection("bildirimler")
      .where("createdAt", ">=", startTs)
      .get();

    if (openedSnap.empty) {
      console.log("Stok hourly summary: no new bildirim in last 1 hour.");
      return null;
    }

    // Group by bildirim yapan Şube (sube)
const counts = {};
openedSnap.forEach((doc) => {
  const d = doc.data() || {};
  const sube = String(d.sube || "Bilinmeyen Şube").trim() || "Bilinmeyen Şube";
  counts[sube] = (counts[sube] || 0) + 1;
});

const rows = Object.entries(counts)
  .map(([sube, count]) => ({ sube, count }))
  .sort((a, b) => b.count - a.count);

    const periodStr =
      `${oneHourAgo.toLocaleString("tr-TR")} - ${now.toLocaleString("tr-TR")}`;

    const tableRowsHtml = rows
      .map(
        (r) => `
          <tr>
            <td style="padding:8px 10px; border:1px solid #e5e5e5;">${r.sube}</td>
            <td style="padding:8px 10px; border:1px solid #e5e5e5; text-align:center; font-weight:700;">${r.count}</td>
          </tr>
        `
      )
      .join("");

    const subject = `Stok - Saatlik Bildirim Özeti (${now.toLocaleString("tr-TR")})`;

    const html = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.7; color: #222;">
        <div style="font-weight: 700; font-size: 16px; margin-bottom: 12px;">
          Stok - Son 1 Saatlik Bildirim Özeti
        </div>

        <div style="margin-bottom: 12px;">
          <b>Aralık:</b> ${periodStr}
        </div>

        <div style="margin: 10px 0 8px 0; font-weight:700;">Bildirim Yapan Şube Bazlı Özet</div>

        <table style="border-collapse: collapse; width: 100%; font-size: 13px;">
          <thead>
            <tr style="background:#fafafa;">
              <th style="padding:8px 10px; border:1px solid #e5e5e5; text-align:left;">Şube</th>
              <th style="padding:8px 10px; border:1px solid #e5e5e5;">Bildirim Sayısı</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;" />

        <div style="color: #888; font-size: 12px; margin-top: 12px;">
          Bu e-posta otomatik olarak Mutabakat Portal tarafından oluşturulmuştur.
        </div>
      </div>
    `;

    await transporter.sendMail({
      ...getMailDefaults(),
      to: uniqueStokEmails.join(", "),
      subject,
      html: appendPortalLink(html),
    });

    console.log(
      "Stok hourly summary sent:",
      "| recipients:",
      uniqueStokEmails.length,
      "| opened last hour:",
      openedSnap.size
    );

    return null;
  });

/**
 * 5) Close Digest (SUBE role):
 * - When a bildirim first becomes "Kapandı", enqueue a pending item into `closedDigestQueue`.
 * - Every 10 minutes, send one digest email per `sube` for all still-pending closures
 *   (effectively: "since the last successful digest run").
 *
 * NOTE: Window is 10 minutes for now (requested). Later you can change it to 2 hours.
 */

exports.enqueueClosedForSubeDigest = functions.firestore
  .document("bildirimler/{id}")
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};

    // Only on first transition to Kapandı
    if (before.durum === "Kapandı" || after.durum !== "Kapandı") return null;

    const sube = String(after.sube || "").trim();
    if (!sube) return null;

    // Ensure queryable timestamp
    const closedAt = after.closedAt || admin.firestore.Timestamp.now();

    await admin.firestore().collection("closedDigestQueue").add({
      bildirimId: context.params.id,
      sube,
      closedAt,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log("Enqueued closedDigestQueue item:", sube, context.params.id);
    return null;
  });

exports.sendClosedDigestToSubeRoleUsers = functions.pubsub
  .schedule("0 */2 * * *") // every 2 hours
  .timeZone("Europe/Istanbul")
  .onRun(async () => {
    const db = admin.firestore();
    const transporter = createTransporter();

    // IMPORTANT:
    // Do NOT filter by a moving time window (e.g. closedAt >= now-10m).
    // Cloud Scheduler can run late, and we'd miss some items forever.
    // Instead, we send all "pending" closures since the last successful digest run.
    const qSnap = await db.collection("closedDigestQueue")
      .where("status", "==", "pending")
      .get();

    if (qSnap.empty) {
      console.log("Closed digest: no pending items.");
      return null;
    }

    // Group by sube
    const bySube = {};
    qSnap.forEach((doc) => {
      const d = doc.data() || {};
      const sube = String(d.sube || "Bilinmiyor").trim() || "Bilinmiyor";
      if (!bySube[sube]) bySube[sube] = [];
      bySube[sube].push({ queueId: doc.id, ...d });
    });

    for (const [sube, items] of Object.entries(bySube)) {
      // recipients: users with role == "sube" and sube == <sube>
      const usersSnap = await db.collection("users")
        .where("role", "==", "sube")
        .where("sube", "==", sube)
        .get();

      const emails = [];
      const invalidEmails = [];

      usersSnap.forEach((doc) => {
        const u = doc.data() || {};
        const cleaned = u.email ? String(u.email).trim() : "";
        if (isValidEmail(cleaned)) emails.push(cleaned);
        else if (cleaned) invalidEmails.push(cleaned);
      });

      const to = Array.from(new Set(emails));
      if (!to.length) {
        console.log(
          "Closed digest: no recipients for sube:",
          sube,
          "| users matched:",
          usersSnap.size,
          "| invalid emails:",
          invalidEmails.length
        );
        continue; // keep items pending
      }

      const subject = `Bildirim Kapanis Ozeti - ${sube} (Son 2 Saat)`;
      const html = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.7; color: #222;">
          <div style="font-weight:700; font-size:16px; margin-bottom:10px;">
            ${sube} - Son 2 saat için Kapanis Ozeti
          </div>
          <div>
            Son 2 saat icinde <b>${items.length}</b> bildiriminiz kapandi.
          </div>
          <hr style="border:none;border-top:1px solid #ddd;margin:16px 0;" />
          <div style="color:#888; font-size:12px;">Bu e-posta otomatik olarak gonderilmistir.</div>
        </div>
      `;

      await transporter.sendMail({
        ...getMailDefaults(),
        to: to.join(", "),
        subject,
        html: appendPortalLink(html),
      });

      // Mark sent
      const batch = db.batch();
      items.forEach((it) => {
        batch.update(db.collection("closedDigestQueue").doc(it.queueId), {
          status: "sent",
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();

      console.log(
        "Closed digest sent:",
        sube,
        "| recipients:",
        to.length,
        "| closed items:",
        items.length
      );
    }

    return null;
  });


/**
 * 6) Inactivity escalation:
 * - 7+ days: one grouped mail to affected sube users
 * - 14+ days: one grouped mail to affected sube users + admins
 * - 25+ days: one grouped mail to affected sube users + admins + mudur
 *
 * Uses collection `subeInactivityAlerts/{sube}` to avoid spamming the same threshold repeatedly.
 */
exports.sendSubeInactivityEscalation = functions.pubsub
  .schedule("15 9 * * *")
  .timeZone("Europe/Istanbul")
  .onRun(async () => {
    const db = admin.firestore();
    const transporter = createTransporter();

    const usersSnap = await db.collection("users").get();
    if (usersSnap.empty) {
      console.log("Inactivity escalation: no users found.");
      return null;
    }

    const subeUsers = new Map();
    const adminEmails = new Set();
    const mudurEmails = new Set();

    usersSnap.forEach((doc) => {
      const u = doc.data() || {};
      const role = String(u.role || "").trim().toLowerCase();
      const email = u.email ? String(u.email).trim() : "";
      if (role === "admin" && isValidEmail(email)) adminEmails.add(email);
      if (role === "mudur" && isValidEmail(email)) mudurEmails.add(email);
      if (role === "sube") {
        const sube = String(u.sube || "").trim();
        if (!sube) return;
        if (!subeUsers.has(sube)) subeUsers.set(sube, new Set());
        if (isValidEmail(email)) subeUsers.get(sube).add(email);
      }
    });

    const subeler = Array.from(subeUsers.keys()).sort((a, b) => a.localeCompare(b, "tr"));
    if (!subeler.length) {
      console.log("Inactivity escalation: no sube users found.");
      return null;
    }

    const level7Rows = [];
    const level14Rows = [];
    const level25Rows = [];
    const stateUpdates = [];
    const now = new Date();

    for (const sube of subeler) {
      const latestSnap = await db.collection("bildirimler")
        .where("sube", "==", sube)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

      const stateRef = db.collection("subeInactivityAlerts").doc(sube);
      const stateSnap = await stateRef.get();
      const state = stateSnap.exists ? (stateSnap.data() || {}) : {};
      const lastLevel = Number(state.lastLevel || 0);

      if (latestSnap.empty) {
        continue;
      }

      const latestData = latestSnap.docs[0].data() || {};
      const createdAt = latestData.createdAt && typeof latestData.createdAt.toDate === "function"
        ? latestData.createdAt.toDate()
        : null;
      if (!createdAt) continue;

      const days = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      if (days < 7) {
        if (lastLevel !== 0) {
          stateUpdates.push({ stateRef, targetLevel: 0, createdAt, days });
        }
        continue;
      }

      let targetLevel = 0;
      if (days >= 25 && lastLevel < 25) {
        targetLevel = 25;
      } else if (days >= 14 && days < 25 && lastLevel < 14) {
        targetLevel = 14;
      } else if (days >= 7 && days < 14 && lastLevel < 7) {
        targetLevel = 7;
      }

      if (!targetLevel) continue;

      const row = {
        sube,
        days,
        lastNotificationDate: createdAt,
        emails: Array.from(subeUsers.get(sube) || []),
      };

      if (targetLevel === 7) level7Rows.push(row);
      if (targetLevel === 14) level14Rows.push(row);
      if (targetLevel === 25) level25Rows.push(row);

      stateUpdates.push({ stateRef, targetLevel, createdAt, days });
    }

    async function sendSingleBranchMail(row) {
      const recipients = Array.from(new Set(row.emails || []));
      if (!recipients.length) {
        console.log(`Inactivity escalation 7: no recipients for ${row.sube}.`);
        return;
      }

      const html = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.7; color: #222;">
          <div style="font-weight:700; font-size:16px; margin-bottom:12px;">7 Gündür Bildirim Yapılmadı</div>
          <div style="margin-bottom:12px;"><b>${escapeHtml(row.sube)}</b> şubesi son <b>${row.days}</b> gündür bildirim oluşturmamaktadır.</div>
          <div style="margin-bottom:12px;"><b>Son Bildirim Tarihi:</b> ${formatDateTR(row.lastNotificationDate)}</div>
          <div style="color:#888; font-size:12px; margin-top:12px;">Bu e-posta otomatik olarak Mutabakat Portal tarafından oluşturulmuştur.</div>
        </div>
      `;

      await transporter.sendMail({
        ...getMailDefaults(),
        to: recipients.join(", "),
        subject: `⚠️ 7 Gündür Bildirim Yapılmadı - ${row.sube}`,
        html: appendPortalLink(html),
      });

      console.log(`Inactivity escalation 7 mail sent for ${row.sube}.`, "| recipients:", recipients.length);
    }

    async function sendGroupedMail(level, rows, extraRecipients) {
      if (!rows.length) return;
      const recipientSet = new Set(extraRecipients || []);
      rows.forEach((r) => (r.emails || []).forEach((email) => recipientSet.add(email)));
      const recipients = Array.from(recipientSet);
      if (!recipients.length) {
        console.log(`Inactivity escalation ${level}: no recipients.`);
        return;
      }

      const title = level === 25
        ? "25+ Gündür Bildirim Yapmayan Şubeler"
        : "14+ Gündür Bildirim Yapmayan Şubeler";

      const intro = level === 25
        ? "Aşağıdaki şubeler 25 gündür veya daha uzun süredir bildirim oluşturmamaktadır."
        : "Aşağıdaki şubeler 14 gündür veya daha uzun süredir bildirim oluşturmamaktadır.";

      const rowsHtml = rows
        .sort((a, b) => b.days - a.days || a.sube.localeCompare(b.sube, "tr"))
        .map((r) => `
          <tr>
            <td style="padding:8px 10px; border:1px solid #e5e5e5;">${escapeHtml(r.sube)}</td>
            <td style="padding:8px 10px; border:1px solid #e5e5e5; text-align:center;">${formatDateTR(r.lastNotificationDate)}</td>
            <td style="padding:8px 10px; border:1px solid #e5e5e5; text-align:center; font-weight:700;">${r.days}</td>
          </tr>
        `)
        .join("");

      const html = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.7; color: #222;">
          <div style="font-weight:700; font-size:16px; margin-bottom:12px;">${title}</div>
          <div style="margin-bottom:12px;">${intro}</div>
          <div style="margin-bottom:12px;"><b>Toplam şube sayısı:</b> ${rows.length}</div>
          <table style="border-collapse: collapse; width: 100%; font-size: 13px;">
            <thead>
              <tr style="background:#fafafa;">
                <th style="padding:8px 10px; border:1px solid #e5e5e5; text-align:left;">Şube</th>
                <th style="padding:8px 10px; border:1px solid #e5e5e5;">Son Bildirim Tarihi</th>
                <th style="padding:8px 10px; border:1px solid #e5e5e5;">Gün</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div style="color:#888; font-size:12px; margin-top:12px;">Bu e-posta otomatik olarak Mutabakat Portal tarafından oluşturulmuştur.</div>
        </div>
      `;

      await transporter.sendMail({
        ...getMailDefaults(),
        to: recipients.join(", "),
        subject: `⚠️ ${title}`,
        html: appendPortalLink(html),
      });

      console.log(`Inactivity escalation ${level} mail sent.`, "| recipients:", recipients.length, "| sube:", rows.length);
    }

    for (const row of level7Rows) {
      await sendSingleBranchMail(row);
    }
    await sendGroupedMail(14, level14Rows, Array.from(adminEmails));
    await sendGroupedMail(25, level25Rows, [...adminEmails, ...mudurEmails]);

    if (stateUpdates.length) {
      const batch = db.batch();
      stateUpdates.forEach(({ stateRef, targetLevel, createdAt, days }) => {
        batch.set(stateRef, {
          lastLevel: targetLevel,
          lastWarningSentAt: admin.firestore.FieldValue.serverTimestamp(),
          lastNotificationDate: admin.firestore.Timestamp.fromDate(createdAt),
          lastKnownInactiveDays: days,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
    }

    return null;
  });

/**
 * 8) Okuma API'si: Merkez Şube Kontrol'e açılan bildirimler (Başbuğ pano sync'i okur).
 *    GET ?bas=YYYY-MM-DD&bit=YYYY-MM-DD  (tarihISO'ya göre, en çok 31 gün)
 *    Authorization: Bearer <MUTABAKAT_API_ANAHTAR>  (functions/.env)
 *    Filtre portaldaki "merkez" rolüyle aynı: çıkış depo boş ya da "Merkez Depo", silinmemiş.
 */
const MERKEZ_API_MAX_GUN = 31;

function apiAnahtari() {
  const cfg = functions.config().api || {};
  return String(process.env.MUTABAKAT_API_ANAHTAR || cfg.anahtar || "").trim();
}

function anahtarEsit(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && require("crypto").timingSafeEqual(x, y);
}

function isoGun(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? String(s) : "";
}

function tsMs(v) {
  return v && typeof v.toMillis === "function" ? v.toMillis() : null;
}

function merkezBildirimiMi(k) {
  if (!k || k.isDeleted) return false;
  const depo = String(k.cikisDepo || "").trim();
  return !depo || depo === "Merkez Depo";
}

exports.merkezBildirimleri = functions.https.onRequest(async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.status(405).json({ hata: "Yalnız GET" });
    return;
  }

  const beklenen = apiAnahtari();
  const gelen = String(req.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!beklenen || !anahtarEsit(gelen, beklenen)) {
    res.status(401).json({ hata: "Yetkisiz" });
    return;
  }

  const bugun = new Date().toISOString().slice(0, 10);
  const bit = isoGun(req.query.bit) || bugun;
  const bas = isoGun(req.query.bas) || bit;
  const gun = (Date.parse(bit) - Date.parse(bas)) / 86400000;
  if (gun < 0 || gun > MERKEZ_API_MAX_GUN) {
    res.status(400).json({ hata: `bas/bit hatalı (en çok ${MERKEZ_API_MAX_GUN} gün)` });
    return;
  }

  try {
    const snap = await admin.firestore().collection("bildirimler")
      .where("tarihISO", ">=", bas)
      .where("tarihISO", "<=", bit)
      .get();

    const bildirimler = [];
    snap.forEach((doc) => {
      const k = doc.data() || {};
      if (!merkezBildirimiMi(k)) return;
      bildirimler.push({
        id: String(k.id || doc.id),
        tarih: k.tarihISO || "",
        sube: k.sube || "",
        cikisDepo: k.cikisDepo || "",
        parti: k.parti || "",
        urun: k.urun || "",
        urunAck: k.urunAck || "",
        eksik: Number(k.eksik) || 0,
        fazla: Number(k.fazla) || 0,
        bildirimTipi: k.bildirimTipi || "standart",
        beklenenUrun: k.beklenenUrun || "",
        gelenUrun: k.gelenUrun || "",
        durum: k.durum || "",
        mutabakat: k.mutabakat || "",
        merkezAck: k.merkezAck || "",
        stokAck: k.stokAck || "",
        subeAck: k.subeAck || "",
        createdAtMs: tsMs(k.createdAt) || k.clientCreatedAtMs || null,
        closedAtMs: tsMs(k.closedAt),
      });
    });

    bildirimler.sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0));
    res.json({ bas, bit, adet: bildirimler.length, bildirimler });
  } catch (err) {
    console.error("merkezBildirimleri FAILED:", err);
    res.status(500).json({ hata: "Sunucu hatası" });
  }
});
