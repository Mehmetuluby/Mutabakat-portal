
// --- Throttled refresh (ONLY for Dashboard) to prevent excessive redraws on frequent snapshot updates ---
let _dashRefreshTimer = null;
function safeRefreshDashboard(){
  if(_dashRefreshTimer) return;
  _dashRefreshTimer = setTimeout(() => {
    _dashRefreshTimer = null;
    try{ refreshMudurDashboard(); }catch(e){}
  }, 800);
}
// -------------------------------------------------------------------------------

// --- Delegated UI handlers (survive dynamic panel re-renders) ---
(function(){
  if (window.__uiDelegatedHandlersInstalled) return;
  window.__uiDelegatedHandlersInstalled = true;

  document.addEventListener('click', function(e){
    const btn = e.target.closest('button[data-action="toggle-owner-edit"]');
    if (btn) {
      e.preventDefault();
      if (typeof window.toggleOwnerEdit === 'function') {
        window.toggleOwnerEdit(btn);
      }
      return;
    }
  });
})();

// --- Lazy loaders for heavy libraries (Chart.js, XLSX) ---
const __libLoaders = {
  chart: null,
  xlsx: null
};

function loadScriptOnce(src){
  return new Promise((resolve, reject)=>{
    // already present?
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s=document.createElement('script');
    s.src=src;
    s.defer=true;
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error("Failed to load "+src));
    document.head.appendChild(s);
  });
}

async function ensureChartJs(){
  if (window.Chart) return;
  if (!__libLoaders.chart){
    __libLoaders.chart = loadScriptOnce("https://cdn.jsdelivr.net/npm/chart.js");
  }
  await __libLoaders.chart;
}

async function ensureXlsx(){
  if (window.XLSX) return;
  if (!__libLoaders.xlsx){
    __libLoaders.xlsx = loadScriptOnce("https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js");
  }
  await __libLoaders.xlsx;
}
// --- End lazy loaders ---


// Auto-logout on fresh tab open (but not on F5 reload)
try {
  const nav = performance.getEntriesByType("navigation")[0];
  if (nav && nav.type === "navigate") {
    localStorage.removeItem("mp_session_entegre_v1"); // clear saved login
  }
} catch(e){}

// ==== FIREBASE & FIRESTORE AYARI ==== (firebase.js içine taşındı)
function __getVisibleEmailInputValue(){
    const candidates = Array.from(document.querySelectorAll('#authEmail')).filter(el => {
      if (!el) return false;
      const cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetParent !== null;
    });
    const el = candidates[0] || document.querySelector('#authEmail') || document.querySelector('input[type="email"]');
    return (el && el.value ? String(el.value).trim() : '');
  }

// XSS güvenliği için basit HTML escape
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtDateTimeTR(v){
  if(!v) return "";
  try{
    const d = (typeof v.toDate === "function") ? v.toDate() : new Date(v);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("tr-TR");
  }catch(e){
    return "";
  }
}


function linkifyText(text){
  const safe = escapeHtml(text || "");
  // linkify http/https URLs
  return safe.replace(/(https?:\/\/[^\s<]+)/g, (m)=>{
    return `<a href="${m}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:underline;">${m}</a>`;
  });
}



// HTML attribute içinde JS string güvenliği (tek tırnak kaçırma)
function __jsStr(str){
  if(str === null || str === undefined) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

// Firestore referansı
// ===== Firebase Auth Gate (added) =====
const __loginPanel = document.getElementById("loginPanel");
const __authLoginBtn = document.getElementById("authLoginBtn");
const __logoutBtn = document.getElementById("logoutBtn");
const __feedbackBtn = document.getElementById("feedbackBtn");
const __appVersionEl = document.getElementById("appVersionLabel");
const __feedbackOverlay = document.getElementById("feedbackOverlay");
const __fbVersionLabel = document.getElementById("fbVersionLabel");
const __fbType = document.getElementById("fbType");
const __fbMessage = document.getElementById("fbMessage");
const __fbContact = document.getElementById("fbContact");
const __fbSendBtn = document.getElementById("fbSendBtn");
const __fbStatus = document.getElementById("fbStatus");

(function setVersionLabels(){
  const v = window.APP_VERSION ? ("v" + window.APP_VERSION) : "";
  if(__appVersionEl) __appVersionEl.textContent = v;
  if(__fbVersionLabel) __fbVersionLabel.textContent = v;
})();

function openFeedbackOverlay(){
  if(!__feedbackOverlay) return;
  __fbStatus && (__fbStatus.textContent = "");
  if(__fbType) __fbType.value = "bug";
  if(__fbMessage) __fbMessage.value = "";
  if(__fbContact) __fbContact.value = "";
  __feedbackOverlay.classList.remove("hidden");
  setTimeout(()=>{ try{ __fbMessage && __fbMessage.focus(); }catch(_e){} }, 0);
}

function closeFeedbackOverlay(){
  if(!__feedbackOverlay) return;
  __feedbackOverlay.classList.add("hidden");
}

window.openFeedbackOverlay = openFeedbackOverlay;
window.closeFeedbackOverlay = closeFeedbackOverlay;

async function submitFeedback(){
  try{
    const msg = (__fbMessage?.value || "").trim();
    const type = (__fbType?.value || "diger").trim();
    const contact = (__fbContact?.value || "").trim();

    if(msg.length < 5){
      if(window.showToast) showToast("error", "Eksik bilgi", "Lütfen en az 5 karakterlik bir mesaj yazın.", 2600);
      return;
    }
    if(!window.db || !window.FieldValue){
      if(window.showToast) showToast("error", "Firebase", "Firestore erişimi bulunamadı.", 2600);
      return;
    }

    __fbStatus && (__fbStatus.textContent = "Gönderiliyor");
    __fbSendBtn && (__fbSendBtn.disabled = true);

    const user = (firebase && firebase.auth) ? firebase.auth().currentUser : null;

    const role = localStorage.getItem("mp_role") || window.currentRole || null;
    const sube = localStorage.getItem("mp_sube") || null;

    await window.db.collection("geriBildirimler").add({
      createdAt: window.FieldValue.serverTimestamp(),
      uid: user ? user.uid : null,
      email: user ? user.email : null,
      role,
      sube,
      type,
      message: msg,
      contact: contact || null,
      page: (window.__activePageId || document.querySelector(".page:not(.hidden)")?.id || null),
      version: window.APP_VERSION || null,
      userAgent: navigator.userAgent
    });

    if(window.showToast) showToast("success", "Teşekkürler", "Geri bildiriminiz alındı.", 2200);
    closeFeedbackOverlay();
  }catch(err){
    if(window.showToast) showToast("error", "Gönderilemedi", ((err?.code ? (err.code + ": ") : "") + (err?.message || String(err))), 4200);
    __fbStatus && (__fbStatus.textContent = "Gönderilemedi. Lütfen tekrar deneyin.");
  }finally{
    __fbSendBtn && (__fbSendBtn.disabled = false);
  }
}

if(__feedbackBtn){
  __feedbackBtn.addEventListener("click", openFeedbackOverlay);
}
if(__fbSendBtn){
  __fbSendBtn.addEventListener("click", submitFeedback);
}

const __loginErr = document.getElementById("loginErr") || document.getElementById("authErr");

function __showLogin(show) {
  if (!__loginPanel) return;
  __loginPanel.style.display = show ? "block" : "none";
}

async function __safeSignIn(email, pass) {
  __loginErr && (__loginErr.textContent = "", __loginErr.style.display = "none");
  const remember = !!document.getElementById("rememberMe")?.checked;

  if (!email || !pass) {
    const m = "Lütfen email ve şifre girin.";
    __loginErr && (__loginErr.textContent = m, __loginErr.style.display = "block");
    if (window.showToast) showToast("error", "Eksik bilgi", m, 2600);
    return;
  }

  // Giriş animasyonu: butonu spinner + "Giriş yapılıyor..." durumuna al
  const __btn = document.getElementById("authLoginBtn");
  const __btnOldHtml = __btn ? __btn.innerHTML : "";
  if (__btn) {
    __btn.disabled = true;
    __btn.classList.add("btn-loading");
    __btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>Giriş yapılıyor...</span>';
  }

  try {
    window.setUILoading && setUILoading(true, { btnIds: ["authLoginBtn"] });

    // Firebase persistence: remember -> LOCAL, else SESSION
    try {
      const persistence = remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
      await firebase.auth().setPersistence(persistence);
    } catch (pErr) {
      console.warn("Persistence set edilemedi:", pErr);
    }

    // ÖNEMLİ: giriş başarılı olur olmaz onAuthStateChanged splash'i açıp login
    // kutusunu anında kapatıyor. Spinner'ı GİRİŞTEN ÖNCE göstererek animasyonun
    // görünmesini garantiliyoruz (o an henüz auth state değişmemiş oluyor).
    await new Promise(r => setTimeout(r, 700));

    await firebase.auth().signInWithEmailAndPassword(email, pass);
    // Başarılı: giriş kutusunu yumuşakça soldurup yukarı süzülerek çıkar
    const gate = document.getElementById("authGate");
    if (gate) gate.classList.add("auth-success");
    if (window.showToast) showToast("success", "Giriş başarılı", "Hoş geldiniz.", 1800);
  } catch (e) {
    const friendly = window.trAuthError ? window.trAuthError(e) : ((e && e.message) ? e.message : "Giriş başarısız");
    __loginErr && (__loginErr.textContent = friendly, __loginErr.style.display = "block");
    if (window.showToast) showToast("error", "Giriş başarısız", friendly, 3600);
    console.error(e);
    // Hata: butonu eski haline döndür
    if (__btn) {
      __btn.disabled = false;
      __btn.classList.remove("btn-loading");
      __btn.innerHTML = __btnOldHtml || "Giriş Yap";
    }
  } finally {
    window.setUILoading && setUILoading(false, { btnIds: ["authLoginBtn"] });
  }
}

if (__authLoginBtn) {
  __authLoginBtn.onclick = () => {
    const email = (document.getElementById("authEmail") || {}).value?.trim?.() || "";
    const pass = (document.getElementById("authPass") || {}).value || "";
    __safeSignIn(email, pass);
  };
}
initFeedbackModal();

if (__logoutBtn) {
  __logoutBtn.onclick = async () => {
    try { await firebase.auth().signOut(); } catch (e) { console.error(e); }
  };
}


// ===== Feedback Modal =====
let __feedbackRating = 0;
let __feedbackModalShown = false;
function __feedbackEls(){
  return {
    modal: document.getElementById("feedbackModal"),
    stars: Array.from(document.querySelectorAll("#feedbackStars .feedback-star")),
    comment: document.getElementById("feedbackComment"),
    err: document.getElementById("feedbackErr"),
    submit: document.getElementById("feedbackSubmitBtn"),
  };
}
function openFeedbackModal(){
  const {modal, err, comment} = __feedbackEls();
  if(!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden","false");
  document.body.classList.add("feedback-open");
  if(err) err.textContent = "";
  if(comment) comment.value = "";
  __feedbackRating = 0;
  renderFeedbackStars();
}
function closeFeedbackModal(){
  const {modal, err} = __feedbackEls();
  if(!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden","true");
  document.body.classList.remove("feedback-open");
  if(err) err.textContent = "";
}
function renderFeedbackStars(){
  const {stars} = __feedbackEls();
  stars.forEach(btn => {
    const n = Number(btn.dataset.star || 0);
    btn.classList.toggle("active", n <= __feedbackRating);
  });
}
function initFeedbackModal(){
  const {stars, submit, comment, err} = __feedbackEls();
  if(!stars.length || window.__feedbackInitDone) return;
  window.__feedbackInitDone = true;
  stars.forEach(btn => btn.addEventListener("click", () => {
    __feedbackRating = Number(btn.dataset.star || 0);
    renderFeedbackStars();
    if(err) err.textContent = "";
  }));
  comment && comment.addEventListener("input", () => { if(err) err.textContent = ""; });
  submit && submit.addEventListener("click", async () => {
    const user = firebase.auth().currentUser;
    if(!user) return;
    const {comment, err, submit} = __feedbackEls();
    if(!__feedbackRating){ if(err) err.textContent = "Lütfen yıldız seçin."; return; }
    try{
      submit.disabled = true; submit.style.opacity = "0.7";
      const userSnap = await window.db.collection("users").doc(user.uid).get();
      const userData = userSnap.exists ? (userSnap.data() || {}) : {};
      await window.db.collection("geriBildirimler").add({
        uid: user.uid,
        email: user.email || "",
        role: userData.role || currentRole || "",
        sube: userData.sube || currentSube || "",
        puan: __feedbackRating,
        yorum: (comment && comment.value ? comment.value.trim() : ""),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await window.db.collection("users").doc(user.uid).set({
        feedbackSubmitted: true,
        feedbackSubmittedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      closeFeedbackModal();
      if(window.showToast) showToast("success", "Teşekkürler", "Değerlendirmeniz kaydedildi.", 2200);
    }catch(e){
      console.error("Feedback kaydedilemedi:", e);
      if(err) err.textContent = "Değerlendirme kaydedilemedi. Lütfen tekrar deneyin.";
    }finally{ submit.disabled = false; submit.style.opacity = ""; }
  });
}
async function maybeShowFeedbackModal(user){
  if(!user || __feedbackModalShown) return;
  try{
    const snap = await window.db.collection("users").doc(user.uid).get();
    const data = snap.exists ? (snap.data() || {}) : {};
    if(!data.feedbackSubmitted){
      __feedbackModalShown = true;
      openFeedbackModal();
    }
  }catch(e){ console.warn("Feedback kontrolü yapılamadı:", e); }
}
// ===== /Feedback Modal =====

// Block app UI until logged in
firebase.auth().onAuthStateChanged(async (user) => {

// ✅ Kullanıcı profilini Firestore'dan al (role/sube/name)
try {
  if (user) {
    const uid = user.uid;
    const userDoc = await window.db.collection("users").doc(uid).get();
    if (userDoc.exists) {
      const data = userDoc.data() || {};
      currentRole = data.role || currentRole || null;
      currentSube = data.sube || currentSube || null;
      currentUserName = data.name || currentUserName || "";
    }
  }
} catch (e) {
  console.warn("users/{uid} okunamadı:", e);
}

  // Remove preload/loader ASAP to avoid ugly "splash" on refresh.
  try {
    document.documentElement.classList.remove('preload');
    const tp = document.getElementById('topProgress');
    if (tp) tp.style.opacity = '0';
  } catch (e) {}

  document.body && document.body.classList.add("auth-ready");
  const root = document.getElementById("appRoot") || document.body; // fallback
  if (!user) {
    __showLogin(true);
    if (__logoutBtn) __logoutBtn.style.display = "none";
    // Çıkışta: giriş başarısı animasyonunu ve buton yükleme durumunu sıfırla,
    // yoksa login kutusu (auth-success ile) gizli kalıyor.
    const __gate = document.getElementById("authGate");
    if (__gate) __gate.classList.remove("auth-success");
    const __lb = document.getElementById("authLoginBtn");
    if (__lb) {
      __lb.disabled = false;
      __lb.classList.remove("btn-loading");
      __lb.innerHTML = "Giriş Yap";
    }
    // Optional: dim the app while logged out
    if (root) root.style.filter = "blur(2px)";
    return;
  }
  __showLogin(false);
  if (__logoutBtn) __logoutBtn.style.display = "block";
  if (root) root.style.filter = "";
  try { await maybeShowFeedbackModal(user); } catch(e) { console.warn("Feedback modal acilamadi:", e); }
});
// ===== /Firebase Auth Gate =====



// Yeni koleksiyon bazlı mimari (tek doküman yok)
const bildirimlerCol = window.db.collection("bildirimler");
const silinenCol = window.db.collection("silinenBildirimler");

let unsubBildirimler = null;
const REALTIME_LIMIT = 5000;
let unsubSilinen = null;

function startRealtime(){
  stopRealtime();

  // Bildirimler (ana veri)
  unsubBildirimler = bildirimlerCol.orderBy("id","desc").limit(REALTIME_LIMIT).onSnapshot((snap)=>{
    bildirimler = snap.docs.map(d=>d.data()).filter(x=>!x.isDeleted);
    refreshAll();
    if(typeof updateNotifyUI==="function") updateNotifyUI();
    // aktif sayfa tablosunu yenile
    if(typeof refreshTable==="function") refreshTable();
    if(typeof refreshSilinenTable==="function") refreshSilinenTable();
    if(selectedId!=null) showDetail(selectedId);
  }, (err)=>console.error("bildirimler snapshot:", err));

  // Silinenler
  unsubSilinen = silinenCol.orderBy("id","desc").limit(REALTIME_LIMIT).onSnapshot((snap)=>{
    silinenBildirimler = snap.docs.map(d=>d.data());
    if(typeof refreshSilinenTable==="function") refreshSilinenTable();
  }, (err)=>console.error("silinen snapshot:", err));
}

function stopRealtime(){
  if(typeof unsubBildirimler==="function"){ unsubBildirimler(); unsubBildirimler=null; }
  if(typeof unsubSilinen==="function"){ unsubSilinen(); unsubSilinen=null; }
}

async function upsertBildirim(kayit){
  const id = kayit.id ?? Date.now();
  kayit.id = id;
  await bildirimlerCol.doc(String(id)).set(kayit, {merge:true});
  return id;
}

async function updateBildirim(id, patch){
  await bildirimlerCol.doc(String(id)).update(patch);
}

async function softDeleteBildirim(id, neden){
  const k = bildirimler.find(x=>x.id===id);
  if(!k) return;
  const user = firebase.auth().currentUser;
  const silenRol = (currentRole === "sube" ? currentSube : currentRole);
  const payload = Object.assign({}, k, {
    // Yeni alanlar
    deletedReason: neden || "",
    deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
    deletedByUid: user ? user.uid : null,
    deletedByRole: silenRol,

    // Geriye dönük uyumluluk (silinen paneli eski isimlerle bekliyor olabilir)
    silmeNedeni: neden || "",
    silenRol: silenRol
  });
  await silinenCol.doc(String(id)).set(payload, {merge:true});
  await bildirimlerCol.doc(String(id)).update({
    isDeleted: true,
    deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
    deletedByUid: user ? user.uid : null,
    deletedByRole: silenRol
  });
}
/*** GLOBAL STATE ***/
const SESSION_KEY = "mp_session_entegre_v1";
const SUBELER = ["İZMİR","ANADOLU","TRAKYA","TRF transfer","BURSA","ANKARA","DİYARBAKIR","ANTALYA","KONYA","ERZURUM","SAMSUN","GAZİANTEP","ADANA"];
const SUBE_KOD = {
  "İZMİR":"IZM",
  "ANADOLU":"ANA",
  "TRAKYA":"TRA",
  "TRF transfer":"TRF",
  "BURSA":"BUR",
  "ANKARA":"ANK",
  "DİYARBAKIR":"DIY",
  "ANTALYA":"ANT",
  "KONYA":"KON",
  "ERZURUM":"ERZ",
  "SAMSUN":"SAM",
  "GAZİANTEP":"GAZ",
  "ADANA":"ADA"
};
const STOK_KATEGORILERI = [
  "Depodan eksik gönderim tespit edildi.",
  "Fazla transferi yapıldı.",
  "Gönderildiği tespit edildi.",
  "Kameradan kontrol sağlanamıyor.",
  "Farklı partiden raflanmış.",
  "Geri çekildi.",
  "Şubede tespit edildi.",
  "Yanlış şubeye gönderildi.",
  "Negatif/Pozitif yapıldı.",
  "Geç bildirim."
];

let currentRole = null; // 'sube' | 'merkez' | 'stok'
let currentPageId = "page-raporlar";
let currentSube = null; // şube adı (şube rolünde)
let bildirimler = [];
let silinenBildirimler = [];
let bulkMerkezSelectedIds = new Set();
let lastBulkToggledId = null;
let bulkSelectModeActive = false;
// Stok rolü özel filtresi: "Açıklama eklenenler" (ilgili şube açıklaması olan
// VE durumu Açık olan kayıtlar). Buton ile açılıp kapanır.
let stokAckOnlyFilter = false;
// Özel çıkış depo tipleri (sadece stok panelinde görünür)
const SPECIAL_CIKIS_DEPOLAR = [
  "Müşteriden Gelen",
  "Tedarikçiden Gelen",
  "Sayım / Raf Fazlası",
  "Merkez Malkabul"
];
const LS_KEY = "mp_bildirimler_entegre_v1";
const LS_DEL_KEY = "mp_silinen_entegre_v1";
const LS_NOTIFY_KEY = "mp_notify_seen_v1";

// CHART instances
let chartByBranch, chartByStatus, chartTrend, chartByDepo;

/*** LOGIN ***/
const loginRoleEl = document.getElementById("loginRole");
const loginSubeSelectWrapper = document.getElementById("loginSubeSelectWrapper");
const loginSubeSelect = document.getElementById("loginSubeSelect");

if(loginRoleEl) loginRoleEl.addEventListener("change", ()=>{
  const role = loginRoleEl ? loginRoleEl.value : null;
  if(!role) return;
  if(role === "sube"){
    loginSubeSelectWrapper.classList.remove("hidden");
  } else {
    loginSubeSelectWrapper.classList.add("hidden");
  }
});

function handleLogin(){
  const role = loginRoleEl ? loginRoleEl.value : null;
  if(!role) return;

  if (role === "sube") {
    const sube = loginSubeSelect.value;
    currentRole = "sube";
    currentSube = sube;
  } else if (role === "merkez") {
    currentRole = "merkez";
    currentSube = null;
  } else if (role === "malkabul") {
    // Merkez Malkabul artık şube mantığında çalışır
    currentRole = "sube";
    currentSube = "Merkez Malkabul";
  } else if (role === "kayseri") {
    // Kayseri Depo da şube mantığında çalışır
    currentRole = "sube";
    currentSube = "Kayseri Depo";
  } else { // stok
    currentRole = "stok";
    currentSube = null;
  }

  afterLogin();
}

function afterLogin(){
  // Bildirim durumu yükle ve arayüzü hazırla
  loadNotifyState();

  // Firestore + local yedek veriyi yükle
  try{ loadLocal(); }catch(e){ console.error(e); }

  // Rol bazlı body class
  document.body.classList.remove(
    "role-kayseri","role-merkez","role-sube","role-stok","role-malkabul",
    "role-mudur","role-admin"
  );

  const loginWrap = document.getElementById("authGate");
  if(loginWrap){ loginWrap.style.display = "none"; }
  const appRoot = document.getElementById("appRoot");
  if(appRoot){ appRoot.style.display = "block"; appRoot.classList.remove("hidden"); }

  // topbar & footer
  const topUser = document.getElementById("topbarUserLeft");
  const sidebarVersion = document.getElementById("sidebarVersion");
  const navFooter = document.getElementById("navFooter");

  if(currentRole === "sube"){
    topUser.innerHTML = currentSube + " Şube";
    if(sidebarVersion) sidebarVersion.textContent = "Şube";
    if(navFooter) navFooter.innerHTML = "Oturum: " + currentSube + " Şube<br>Rol: Şube";
    document.getElementById("nbSube").value = currentSube;
    document.body.classList.add("role-sube");
  } else if(currentRole === "merkez"){
    topUser.innerHTML = "Merkez Şube Kontrol Kullanıcısı";
    if(sidebarVersion) sidebarVersion.textContent = "Merkez Şube Kontrol";
    if(navFooter) navFooter.innerHTML = "Oturum: Merkez<br>Rol: Merkez Şube Kontrol";
    document.body.classList.add("role-merkez");
  } else if(currentRole === "mudur"){
    topUser.innerHTML = "Yönetici Paneli";
    if(sidebarVersion) sidebarVersion.textContent = "Yönetici";
    if(navFooter) navFooter.innerHTML = "Oturum: Yönetici<br>Rol: Müdür";
    document.body.classList.add("role-mudur");
    try{ document.getElementById("nbSube").value = "TÜM ŞUBELER"; }catch(e){}

  } else if(currentRole === "admin"){
    // Admin UI'da mudur ile aynı panelleri görsün, ama Firestore'da role alanı "admin" kalsın.
    topUser.innerHTML = "Yönetici Paneli";
    if(sidebarVersion) sidebarVersion.textContent = "Yönetici";
    if(navFooter) navFooter.innerHTML = "Oturum: Yönetici<br>Rol: Admin";
    document.body.classList.add("role-mudur","role-admin");
    try{ document.getElementById("nbSube").value = "TÜM ŞUBELER"; }catch(e){}
  
  } else if(currentRole === "malkabul"){
    topUser.innerHTML = "Merkez Malkabul Kullanıcısı";
    if(sidebarVersion) sidebarVersion.textContent = "Merkez Malkabul";
    if(navFooter) navFooter.innerHTML = "Oturum: Mal Kabul<br>Rol: Merkez Malkabul";
    document.getElementById("nbSube").value = "MAL KABUL";
    document.body.classList.add("role-malkabul");
  } else if(currentRole === "kayseri"){
    topUser.innerHTML = "Kayseri Depo Kullanıcısı";
    if(sidebarVersion) sidebarVersion.textContent = "Kayseri Depo";
    if(navFooter) navFooter.innerHTML = "Oturum: Kayseri Depo<br>Rol: Kayseri Depo";
    document.body.classList.add("role-kayseri");
    document.getElementById("nbSube").value = "Kayseri Depo";
  } else {
    topUser.innerHTML = "Stok Kontrol Kullanıcısı";
    if(sidebarVersion) sidebarVersion.textContent = "Stok Kontrol";
    if(navFooter) navFooter.innerHTML = "Oturum: Stok<br>Rol: Stok Kontrol";
    document.body.classList.add("role-stok");
  }

  // oturumu sakla
  localStorage.setItem(SESSION_KEY, JSON.stringify({role: currentRole, sube: currentSube}));

  // Kullanıcı profilini Firestore'a yaz (Storage/Firestore rules için)
  try{ syncUserProfile(); }catch(e){ console.warn("syncUserProfile:", e); }

  buildNav();
  loadLocal();
  refreshAll();
  updateNotifyUI();
  // varsayılan sayfa
  const defaultPage = (currentRole === "mudur" || currentRole === "admin") ? "page-mudur-dashboard" : "page-raporlar";
  const defaultNavEl = Array.from(document.querySelectorAll(".nav-item")).find(n=>n.dataset.page===defaultPage);
  showPage(defaultPage, defaultNavEl);
}


async function syncUserProfile(){
  const user = firebase.auth().currentUser;
  if(!user || !window.db) return;
  const payload = {
    uid: user.uid,
    email: user.email || "",
    role: currentRole || "",
    sube: currentSube || "",
    name: currentUserName || "",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  await window.db.collection("users").doc(user.uid).set(payload, {merge:true});
}

/*** NAV ***/
function buildNav(){
  const nav = document.getElementById("navItems");
  nav.innerHTML = "";
  let items = [];
  if(currentRole === "sube"){
    items = [
      {page:"page-raporlar", label:"Raporlar", icon:"📊"},
      {page:"page-yeni-bildirim", label:"Yeni Bildirim", icon:"➕"},
      {page:"page-gelen-bildirimler", label:"Gelen Bildirimler", icon:"📥"},
      {page:"page-bildirimler", label:"Yapılan Bildirimler", icon:"📋"},
      {page:"page-silinen", label:"Silinen Bildirimler", icon:"🗑️"}
    ];
  } else if(currentRole === "merkez"){
    items = [
      {page:"page-raporlar", label:"Raporlar", icon:"📊"},
      {page:"page-bildirimler", label:"Bildirim Talepleri", icon:"📥"},
      {page:"page-silinen", label:"Silinen Bildirimler", icon:"🗑️"}
    ];
    } else if(currentRole === "mudur" || currentRole === "admin"){
    items = [
      {page:"page-mudur-dashboard", label:"Genel Bakış", icon:"🏠"},
      {page:"page-bildirimler", label:"Bildirimler", icon:"📄"},
      // {page:"page-mudur-sube-perf", label:"Mutabakat Oranı", icon:"🏬"}, // kaldırıldı
      {page:"page-mudur-stok", label:"Top 20", icon:"📦"},
      {page:"page-mudur-depo-takip", label:"Depo Takip", icon:"🏭"},
      {page:"page-raporlar", label:"Raporlar", icon:"📊"},
      {page:"page-silinen", label:"Silinen Bildirimler", icon:"🗑️"}
    ];
  } else if(currentRole === "malkabul"){
    items = [
      {page:"page-raporlar", label:"Raporlar", icon:"📊"},
      {page:"page-yeni-bildirim", label:"Yeni Bildirim", icon:"➕"},
      {page:"page-malkabul-yapilan", label:"Yapılan Bildirimler", icon:"📋"},
      {page:"page-bildirimler", label:"Merkez Malkabul Bildirimleri", icon:"📥"},
      {page:"page-silinen", label:"Silinen Bildirimler", icon:"🗑️"}
    ];
  } else if(currentRole === "kayseri"){
    items = [
      {page:"page-raporlar", label:"Raporlar", icon:"📊"},
      {page:"page-yeni-bildirim", label:"Yeni Bildirim", icon:"➕"},
      {page:"page-kayseri-yapilan", label:"Yapılan Bildirimler", icon:"📋"},
      {page:"page-bildirimler", label:"Bildirim Talepleri", icon:"📥"},
      {page:"page-silinen", label:"Silinen Bildirimler", icon:"🗑️"}
    ];
  } else { // stok
    items = [
      {page:"page-raporlar", label:"Raporlar", icon:"📊"},
      {page:"page-bildirimler", label:"Bildirim İnceleme", icon:"📦"},
      {page:"page-silinen", label:"Silinen Bildirimler", icon:"🗑️"}
    ];
  }
  items.forEach(it=>{
    const div = document.createElement("div");
    div.className = "nav-item";
    div.dataset.page = it.page;
    div.innerHTML = `<span class="icon">${it.icon}</span><span>${it.label}</span>`;
    div.addEventListener("click", ()=>showPage(it.page, div));
    nav.appendChild(div);
  });
}

function showPage(pageId, el){
  currentPageId = pageId;
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  const pageEl = document.getElementById(pageId);
  if(!pageEl){
    console.error("[showPage] Page element not found:", pageId);
    return;
  }
  pageEl.classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));
  if(el) el.classList.add("active");

  // KPI counters (Reports)
  if(pageId === "page-raporlar") {
    setTimeout(()=>{ try{ animateKpiCounts(); }catch(e){} }, 80);
  }

  if(pageId === "page-mudur-dashboard"){
    if(typeof refreshMudurDashboard === "function") safeRefreshDashboard();
  } else if(pageId === "page-mudur-sube-perf"){
    // Mutabakat Oranı ekranı kaldırıldı; tablo Depo Takip içinde çalıştırılıyor.
  } else if(pageId === "page-mudur-stok"){
    if(typeof refreshMudurStok === "function") refreshMudurStok();
  } else if(pageId === "page-mudur-depo-takip"){
    if(typeof refreshMudurDepoTakip === "function") refreshMudurDepoTakip();
    if(typeof refreshMudurSubePerf === "function") refreshMudurSubePerf();
    if(typeof refreshMudurSonBildirim === "function") refreshMudurSonBildirim();
  } else if(pageId === "page-raporlar"){
    updateRaporTexts();
    updateKPIs();
    updateCharts().catch(console.error);
updatePivot();
  } else if(pageId === "page-gelen-bildirimler"){
    if(typeof window.refreshGelenBildirimler === "function"){
      window.refreshGelenBildirimler();
    }
  } else if(pageId === "page-bildirimler"){
    updateBildirimPageTexts();
    refreshTable();
  } else if(pageId === "page-kayseri-yapilan"){
    if(typeof window.refreshKayseriYapilanTable === "function"){
      window.refreshKayseriYapilanTable();
    }
  } else if(pageId === "page-malkabul-yapilan"){
    if(typeof window.refreshMalkabulYapilanTable === "function"){
      window.refreshMalkabulYapilanTable();
    }
  } else if(pageId === "page-silinen"){
    updateSilinenTexts();
    refreshSilinenTable();
  }

  // Tablo alanlarını ekrana göre ayarla
  adjustTableScrollHeights();

  // Filtre select'lerine küçük "×" temizleme butonu ekle
  if(typeof initFilterClearButtons === "function") initFilterClearButtons();

  // Seçili satırı sayfa değişiminde de vurgula
  if(typeof updateRowSelection === "function") updateRowSelection();

  // ✅ Detay paneli: Sayfalar arası geçişte kaybolmaması için
  // seçili kaydı (selectedId) yeniden ekrana bas.
  // Böylece video linkleri ve ekler her sayfada tekrar render edilir.
  try{
    if(typeof selectedId !== "undefined" && selectedId != null){
      showDetail(selectedId);
    }
  }catch(e){/* no-op */}
}

// ==== UI HELPERS (Filters / Selection / Accordion) ====
function initFilterClearButtons(){
  try{
    document.querySelectorAll('.filter-row label').forEach((label)=>{
      const sel = label.querySelector('select');
      if(!sel) return;

      // ensure wrapper for select + clear button
      let wrap = label.querySelector('.select-with-clear');
      if(!wrap){
        wrap = document.createElement('div');
        wrap.className = 'select-with-clear';
        sel.parentNode.insertBefore(wrap, sel);
        wrap.appendChild(sel);
      }

      let btn = label.querySelector('.filter-clear');
      if(!btn){
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'filter-clear';
        btn.textContent = '×';
        btn.title = 'Temizle';
        btn.addEventListener('click', (e)=>{
          e.preventDefault();
          e.stopPropagation();
          sel.value = 'tum';
          sel.dispatchEvent(new Event('change'));
        });
        wrap.appendChild(btn);
      }

      const toggleBtn = ()=>{
        const active = (sel.value && sel.value !== 'tum');
        btn.style.display = active ? 'inline-flex' : 'none';
      };

      // initial + on change
      toggleBtn();
      sel.addEventListener('change', toggleBtn);
    });
  }catch(e){}
}

function clearAllFilters(mode){
  const setTum = (id)=>{ const el=document.getElementById(id); if(el) el.value='tum'; };
  if(mode === 'gelen'){
    ['fltGelenSube','fltGelenCikisDepo','fltGelenDurum','fltGelenMutabakat','fltGelenStokAck'].forEach(setTum);
    if(typeof refreshGelenBildirimler === 'function') refreshGelenBildirimler();
    return;
  }
  if(mode === 'bildirimler'){
    ['fltSube','fltCikisDepo','fltDurum','fltMutabakat','fltStokAck'].forEach(setTum);
    if(typeof refreshTable === 'function') refreshTable();
    return;
  }
}

function updateRowSelection(){
  try{
    document.querySelectorAll('tr.row-selected').forEach(tr=>tr.classList.remove('row-selected'));
    if(!selectedId) return;
    const page = document.getElementById(currentPageId);
    if(!page) return;
    const tr = page.querySelector('tr[data-id="' + selectedId + '"]');
    if(tr) tr.classList.add('row-selected');
  }catch(e){}
}


function adjustTableScrollHeights(){
  // Görünür sayfadaki .table-scroll.autoheight ve .detail-autoheight (sağ detay
  // paneli) kapsayıcılarını ekrana göre uzat ve SABİTLE. Detay paneli, checkbox
  // ile önizlenen kayıt değiştikçe (not/ek sayısı farklı olduğundan) yüksekliği
  // serbestçe değişiyordu; bu da tablonun bulunduğu sütunla aynı satırda
  // (.flex) toplam yükseklik değiştiği için görünür bir "zıplamaya" sebep
  // oluyordu. Tablo gibi, paneli de sayfaya girildiğinde bir kere ölçüp sabit
  // pixel yüksekliğe kilitliyoruz; içerik ne olursa olsun bu yükseklik hiç
  // değişmiyor, taşan içerik panelin kendi içinde kayıyor.
  try{
    const page = document.getElementById(currentPageId);
    if(!page) return;
    const scrollBoxes = page.querySelectorAll(".table-scroll.autoheight, .detail-autoheight");
    scrollBoxes.forEach(box=>{
      const rect = box.getBoundingClientRect();
      // Alt boşluk: 24px (kart padding + nefes)
      const bottomGap = 24;
      const h = Math.max(180, Math.floor(window.innerHeight - rect.top - bottomGap));
      box.style.height = h + "px";
      box.style.maxHeight = h + "px";
      box.style.overflow = "auto";
    });
  }catch(e){}
}
window.addEventListener("resize", ()=>adjustTableScrollHeights());

/*** LOCAL STORAGE + FIRESTORE ***/
function loadLocal(){
  // Eski modelde localStorage + global-v1 vardı.
  // Yeni modelde: localStorage sadece hızlı açılış için; asıl kaynak Firestore snapshot'tır.
  try{
    const ls = localStorage.getItem(LS_KEY);
    const lsDel = localStorage.getItem(LS_DEL_KEY);
    if(ls) bildirimler = JSON.parse(ls) || [];
    if(lsDel) silinenBildirimler = JSON.parse(lsDel) || [];
  }catch(e){}
  refreshAll();
  if(typeof updateNotifyUI==="function") updateNotifyUI();
  // Firestore canlı dinlemeyi başlat
  startRealtime();
}

function saveLocal(){
  // Yeni modelde Firestore yazımı doğrudan ilgili dokümana yapılır.
  // localStorage sadece offline/fast cache amaçlı tutulur.
  try{
    localStorage.setItem(LS_KEY, JSON.stringify(bildirimler));
    localStorage.setItem(LS_DEL_KEY, JSON.stringify(silinenBildirimler));
  }catch(e){}
}

/*** NOTIFICATION STATE ***/
let notifySeen = {};

function getNotifyRoleKey(){
  if(currentRole === "sube"){
    return "sube_" + (currentSube || "");
  }
  return currentRole || "genel";
}

function loadNotifyState(){
  try{
    const raw = localStorage.getItem(LS_NOTIFY_KEY);
    if(raw){
      notifySeen = JSON.parse(raw) || {};
    } else {
      notifySeen = {};
    }
  }catch(e){
    notifySeen = {};
  }
}

function saveNotifyState(){
  try{
    localStorage.setItem(LS_NOTIFY_KEY, JSON.stringify(notifySeen));
  }catch(e){}
}

function getRelevantNotifications(){
  if(!currentRole) return [];
  if(currentRole === "merkez"){
    return bildirimler.filter(k =>
      (!k.cikisDepo || k.cikisDepo === "Merkez Depo") &&
      !SPECIAL_CIKIS_DEPOLAR.includes(k.cikisDepo || "")
    );
  } else if(currentRole === "malkabul"){
    return bildirimler.filter(k => k.cikisDepo === "Merkez Malkabul");
  } else if(currentRole === "kayseri"){
    return bildirimler.filter(k => k.cikisDepo === "Kayseri Depo" && k.sube !== "Kayseri Depo");
  } else if(currentRole === "stok"){
    return bildirimler.slice();
  } else if(currentRole === "sube"){
    // Şube rolünde hem kendi açtığı kayıtlara gelen cevaplar
    // hem de çıkış deposu şubenin kendisi olan "gelen bildirimler" gösterilir.
    return bildirimler.filter(k => {
      const benimKaydim = (k.sube === currentSube);
      const banaGelen = (k.cikisDepo === currentSube && k.sube !== currentSube);

      let cevapVar = false;
      if(benimKaydim){
        cevapVar =
          (k.stokAck && k.stokAck.trim() !== "") ||
          (k.merkezAck && k.merkezAck.trim() !== "") ||
          (k.malKabulAck && k.malKabulAck.trim() !== "") ||
          (k.kayseriAck && k.kayseriAck.trim() !== "") ||
          (k.mutabakat && k.mutabakat !== "Beklemede");
      }

      return banaGelen || cevapVar;
    });
  }
  return [];
}

function updateNotifyUI(){
  const badge = document.getElementById("notifyCount");
  const dropdown = document.getElementById("notifyDropdown");
  if(!badge || !dropdown) return;

  const key = getNotifyRoleKey();
  const lastSeen = notifySeen[key] || 0;
  const relevant = getRelevantNotifications();
  const unread = relevant.filter(k => k.id > lastSeen);
  const count = unread.length;

  if(count > 0){
    badge.textContent = count > 9 ? "9+" : String(count);
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }

  const recent = relevant.slice().sort((a,b)=>b.id - a.id).slice(0,20);
  if(recent.length === 0){
    dropdown.innerHTML = '<div class="notify-empty">Yeni bildiriminiz yok.</div>';
  } else {
    
  dropdown.innerHTML = recent.map(k=>{
    const isUnread = k.id > lastSeen;
    const cls = "notify-item" + (isUnread ? " notify-item-unread" : "");

    // Kaynağa göre rozet rengi (Sistem yok, sadece gerçekten cevap veren birimler)
    let sourceClass = null;
    if (k.stokAck && k.stokAck.trim() !== "") sourceClass = "stok";
    else if (k.merkezAck && k.merkezAck.trim() !== "") sourceClass = "merkez";
    else if (k.malKabulAck && k.malKabulAck.trim() !== "") sourceClass = "mk";
    else if (k.kayseriAck && k.kayseriAck.trim() !== "") sourceClass = "kayseri";

    const sourceBadge = sourceClass
      ? '<span class="nb-badge ' + sourceClass + '">' +
          (sourceClass === "stok" ? "Stok" :
           sourceClass === "merkez" ? "Merkez" :
           sourceClass === "mk" ? "Mal Kabul" : "Kayseri") +
        "</span>"
      : "";

    const title = (k.parti || k.urun || "");
    const header = (k.sube || "-") + " • " + (k.cikisDepo || "-");

    return '<div class="' + cls + '" onclick="openFromNotification(' + k.id + ')">' +
             '<div>' + sourceBadge + '<strong>' + (title || "Bildirim") + '</strong></div>' +
             '<div class="small-text">' + header + '</div>' +
             '<div class="small-text">' + (k.tarih || "") + ' • Eksik: ' + k.eksik + ' Fazla: ' + k.fazla + '</div>' +
           '</div>';
  }).join("");

  }
}

function markNotificationsSeen(){
  const key = getNotifyRoleKey();
  const relevant = getRelevantNotifications();
  const maxId = relevant.reduce((m,k)=> k.id > m ? k.id : m, 0);
  notifySeen[key] = maxId;
  saveNotifyState();
}

function toggleNotifyPanel(ev){
  if(ev) ev.stopPropagation();
  const dropdown = document.getElementById("notifyDropdown");
  if(!dropdown) return;

  // Render dropdown as a real overlay (not trapped in topbar stacking context)
  // and position it relative to the bell.
  const ensureNotifyOverlay = () => {
    // 1) Move to <body> once so it is not limited by any parent z-index/overflow.
    if(dropdown.parentElement !== document.body){
      document.body.appendChild(dropdown);
    }

    // 2) Prevent inside clicks from bubbling to the window click handler.
    if(!dropdown.__notifyStopperBound){
      dropdown.addEventListener("click", (e)=> e.stopPropagation());
      dropdown.__notifyStopperBound = true;
    }

    // 3) Position: align dropdown's top-right to bell's bottom-right.
    const bell = document.getElementById("notifyBell");
    if(!bell) return;
    const r = bell.getBoundingClientRect();
    const margin = 8;

    // Prefer right alignment; fall back if it would overflow left.
    const desiredLeft = Math.max(margin, r.right - dropdown.offsetWidth);
    let left = r.right;
    let top = r.bottom + margin;

    // Keep inside viewport horizontally.
    const maxLeft = Math.max(margin, window.innerWidth - dropdown.offsetWidth - margin);
    left = Math.min(left, maxLeft);

    // If bottom would overflow viewport, open upwards.
    const maxTop = window.innerHeight - dropdown.offsetHeight - margin;
    if(top > maxTop && r.top - dropdown.offsetHeight - margin >= margin){
      top = r.top - dropdown.offsetHeight - margin;
    } else {
      top = Math.min(top, maxTop);
    }

    dropdown.style.left = left + "px";
    dropdown.style.top = top + "px";
  };

  const isHidden = dropdown.classList.contains("hidden");
  if(isHidden){
    markNotificationsSeen();
    updateNotifyUI();
    // Must be visible before measuring for correct positioning.
    dropdown.classList.remove("hidden");
    ensureNotifyOverlay();

    // Reposition on resize/scroll while open.
    if(!window.__notifyRepositionBound){
      const handler = ()=>{
        const dd = document.getElementById("notifyDropdown");
        if(dd && !dd.classList.contains("hidden")){
          // re-use positioning logic by triggering toggle open branch safely
          // without changing visibility.
          // (We call the inner function via a small wrapper.)
          try{
            const bell = document.getElementById("notifyBell");
            if(!bell) return;
            const r = bell.getBoundingClientRect();
            const margin = 8;
            const right = Math.max(margin, r.right - dd.offsetWidth);
            let left = Math.min(desiredLeft, Math.max(margin, window.innerWidth - dd.offsetWidth - margin));
            let top = r.bottom + margin;
            const maxTop = window.innerHeight - dd.offsetHeight - margin;
            if(top > maxTop && r.top - dd.offsetHeight - margin >= margin){
              top = r.top - dd.offsetHeight - margin;
            } else {
              top = Math.min(top, maxTop);
            }
            dd.style.left = left + "px";
            dd.style.top = top + "px";
          } catch(_e){}
        }
      };
      window.addEventListener("resize", handler);
      // Use capture so we reposition early during scroll in nested containers.
      window.addEventListener("scroll", handler, true);
      window.__notifyRepositionBound = true;
    }
  } else {
    dropdown.classList.add("hidden");
  }
}

function openFromNotification(id){
  // Bildirimler sayfasına geç ve ilgili kaydı aç
  const navItems = document.querySelectorAll(".nav-item");
  let targetNav = null;
  navItems.forEach(it=>{
    if(it.dataset.page === "page-bildirimler") targetNav = it;
  });
  if(targetNav){
    showPage("page-bildirimler", targetNav);
  } else {
    showPage("page-bildirimler");
  }
  showDetail(id);
  const dropdown = document.getElementById("notifyDropdown");
  if(dropdown) dropdown.classList.add("hidden");
}

// Sayfanın herhangi bir yerine tıklayınca paneli kapat
window.addEventListener("click", function(){
  const dropdown = document.getElementById("notifyDropdown");
  if(dropdown) dropdown.classList.add("hidden");
});

/*** UTIL ***/

function exportArrayToCSV(filename, rows){
  if(!rows || !rows.length){
    showToast("Aktarılacak veri bulunamadı.", "error");
    return;
  }
  const escapeCell = (v) => {
    if(v === null || v === undefined) return "";
    v = String(v).replace(/"/g,'""');
    return `"${v}"`;
  };

  const csv = rows.map(r=>r.map(escapeCell).join(";")).join("\r\n");

  // Excel Türkçe karakterleri düzgün görsün diye UTF-8 BOM ekliyoruz
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csv], {type:"text/csv;charset=utf-8;"});

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

}



function exportTbodyToCSV(filename, headers, tbodyId){
  const tbody = document.getElementById(tbodyId);
  if(!tbody){
    showToast("Tablo bulunamadı: " + tbodyId, "error");
    return;
  }
  const rows = [];
  if(headers && headers.length) rows.push(headers);
  const trs = Array.from(tbody.querySelectorAll("tr"));
  trs.forEach(tr=>{
    const tds = Array.from(tr.children);
    rows.push(tds.map(td=> (td.textContent || "").trim()));
  });
  exportArrayToCSV(filename, rows);
}

function exportMudurDashboardToCSV(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,"0");
  const d = String(now.getDate()).padStart(2,"0");
  const fname = `yonetici_genel_bakis_${y}-${m}-${d}.csv`;

  const get = (id)=> (document.getElementById(id)?.textContent || "0").trim();

  const rows = [];
  rows.push(["Yönetici Paneli - Genel Bakış"]);
  rows.push(["Tarih", `${d}.${m}.${y}`]);
  rows.push([]);
  rows.push(["KPI", "Değer"]);
  rows.push(["Toplam Bildirim", get("mudurKpiMutabik")]);
  rows.push(["Açık Bildirim", get("mudurKpiAcik")]);
  rows.push(["Kapandı", get("mudurKpiBeklemede")]);
  rows.push(["Toplam Eksik", get("mudurKpiEksik")]);
  rows.push(["Toplam Fazla", get("mudurKpiFazla")]);
  rows.push(["Mutabık Kalınmayan Toplam Eksik", get("mudurKpiMutabikDegilEksik")]);
  rows.push(["Bugün Açılan", get("mudurKpiToday")]);
  rows.push(["Silinen", get("mudurKpiDeleted")]);

  rows.push([]);
  rows.push(["7+ Gün Açık/Beklemede"]);
  rows.push(["Bildirim","Şube","Gün","Eksik","Fazla"]);
  const overdue = document.getElementById("mudurOverdueTbody");
  if(overdue){
    Array.from(overdue.querySelectorAll("tr")).forEach(tr=>{
      rows.push(Array.from(tr.children).map(td=>(td.textContent||"").trim()));
    });
  }

  rows.push([]);
  rows.push(["En Problemli Ürünler (Top 5)"]);
  rows.push(["Ürün","Bildirim","Sapma"]);
  const topU = document.getElementById("mudurTopUrunTbody");
  if(topU){
    Array.from(topU.querySelectorAll("tr")).forEach(tr=>{
      rows.push(Array.from(tr.children).map(td=>(td.textContent||"").trim()));
    });
  }

  rows.push([]);
  rows.push(["Riskli Partiler (Top 5)"]);
  rows.push(["Parti","Bildirim","Sapma"]);
  const topP = document.getElementById("mudurTopPartiTbody");
  if(topP){
    Array.from(topP.querySelectorAll("tr")).forEach(tr=>{
      rows.push(Array.from(tr.children).map(td=>(td.textContent||"").trim()));
    });
  }

  rows.push([]);
  rows.push(["Cevapsız Kalan Notlar"]);
  rows.push(["Bildirim","Şube","Son Not","Gün"]);
  const un = document.getElementById("mudurUnansweredTbody");
  if(un){
    Array.from(un.querySelectorAll("tr")).forEach(tr=>{
      rows.push(Array.from(tr.children).map(td=>(td.textContent||"").trim()));
    });
  }

  exportArrayToCSV(fname, rows);
}

function exportMudurSubePerfToCSV(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,"0");
  const d = String(now.getDate()).padStart(2,"0");
  exportTbodyToCSV(`yonetici_sube_performansi_${y}-${m}-${d}.csv`,
    ["Şube","Toplam Bildirim","Açık","Beklemede","Mutabık","Mutabakat Oranı","Toplam Eksik","Toplam Fazla"],
    "tblMudurSubePerf"
  );
}

function exportMudurStokToCSV(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,"0");
  const d = String(now.getDate()).padStart(2,"0");
  const fname = `yonetici_stok_mutabakat_${y}-${m}-${d}.csv`;

  const rows = [];
  rows.push(["Yönetici Paneli - Stok & Mutabakat"]);
  rows.push(["Tarih", `${d}.${m}.${y}`]);
  rows.push([]);

  rows.push(["En Çok Bildirimi Yapılan Ürünler (Top 20)"]);
  rows.push(["Ürün","Bildirim"]);
  const tu = document.getElementById("tblMudurTopUrun");
  if(tu){
    Array.from(tu.querySelectorAll("tr")).forEach(tr=>{
      rows.push(Array.from(tr.children).map(td=>(td.textContent||"").trim()));
    });
  }

  rows.push([]);
  rows.push(["Riskli Partiler (Top 20)"]);
  rows.push(["Parti No","Bildirim"]);
  const tp = document.getElementById("tblMudurTopParti");
  if(tp){
    Array.from(tp.querySelectorAll("tr")).forEach(tr=>{
      rows.push(Array.from(tr.children).map(td=>(td.textContent||"").trim()));
    });
  }

  exportArrayToCSV(fname, rows);
}

function exportMudurNotlarToCSV(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,"0");
  const d = String(now.getDate()).padStart(2,"0");
  exportTbodyToCSV(`yonetici_notlar_${y}-${m}-${d}.csv`,
    ["Bildirim","Şube","Ürün","Parti","Son Not","Yazan"],
    "tblMudurNotlar"
  );
}




// Backward-compat: some HTML templates still call toggleBranchEdit()
function toggleBranchEdit(){
  try{ return toggleOwnerEdit(); }catch(e){ console.warn("toggleBranchEdit:", e); }
}
window.toggleBranchEdit = toggleBranchEdit;

function toggleOwnerEdit(btn){
  // ✅ buton hangi sayfadaysa paneli oradan bul
  let scope = null;

  try{
    scope = btn ? (btn.closest(".page") || btn.closest("#detayPanel, #gelenDetayPanel, #detayPanelKayseri, #detayPanelMalkabul")) : null;
  }catch(e){}

  if(!scope){
    // fallback: aktif sayfa
    scope = document.getElementById(currentPageId) || document;
  }

  const panel = scope.querySelector("#ownerEditPanel");
  if(!panel) return;

  const isVisible = (panel.style.display && panel.style.display !== "none") ||
    (!panel.style.display && window.getComputedStyle(panel).display !== "none");

  const newVisible = !isVisible;
  ownerEditVisible = newVisible;
  panel.style.display = newVisible ? "block" : "none";

  if(newVisible){
    try{
      panel.scrollIntoView({behavior:"smooth", block:"start"});
    }catch(e){}
  }
}
window.toggleOwnerEdit = toggleOwnerEdit;
window.toggleOwnerEdit = toggleOwnerEdit;



async function saveMalKabulAck(){
  if(selectedId == null) return;
  const k = bildirimler.find(x=>x.id===selectedId);
  if(!k) return;
  if(currentRole !== "malkabul"){
    showToast("Mal Kabul açıklamasını yalnızca Mal Kabul rolü güncelleyebilir.", "error");
    return;
  }
  const ta = document.getElementById("detMalKabulAck");
  if(!ta) return;
  const val = ta.value.trim();
  try{
    const patch = { malKabulAck: val, kayseriAck: val };
    if(val && !k.firstResponseAt) patch.firstResponseAt = (window.FieldValue || firebase.firestore.FieldValue).serverTimestamp();
    await updateBildirim(selectedId, patch);
    k.malKabulAck = val;
    k.kayseriAck = val;
    k.kayseriAckAt = new Date();
    saveLocal();
    refreshTable();
    showDetail(selectedId);
  }catch(err){
    console.error("saveMalKabulAck:", err);
    showToast("Kaydedilemedi: " + (err?.message || err), "error");
  }
}

async function saveKayseriAck(){
  if(selectedId == null) return;
  const k = bildirimler.find(x=>x.id===selectedId);
  if(!k) return;

  if(currentRole !== "kayseri"){
    showToast("Kayseri depo açıklamasını yalnızca Kayseri Depo rolü güncelleyebilir.", "error");
    return;
  }
  const ta = document.getElementById("detKayseriAck");
  if(!ta) return;
  const val = ta.value.trim();
  try{
    const patch = { kayseriAck: val, kayseriAckAt: (window.FieldValue || firebase.firestore.FieldValue).serverTimestamp() };
    if(val && !k.firstResponseAt) patch.firstResponseAt = (window.FieldValue || firebase.firestore.FieldValue).serverTimestamp();
    await updateBildirim(selectedId, patch);
    k.kayseriAck = val;
    saveLocal();
    refreshTable();
    showDetail(selectedId);
  }catch(err){
    console.error("saveKayseriAck:", err);
    showToast("Kaydedilemedi: " + (err?.message || err), "error");
  }
}

async function saveIlgiliSubeAck(){
  if(selectedId == null) return;
  const k = bildirimler.find(x=>x.id===selectedId);
  if(!k) return;

  if(currentRole !== "sube"){
    showToast("İlgili şube açıklamasını yalnızca şube rolü güncelleyebilir.", "error");
    return;
  }
  const ta = document.getElementById("detIlgiliSubeAck");
  if(!ta) return;
  const val = ta.value.trim();

  // Not alanı (varsa) — açıklama ile birlikte kaydedilir
  const scope = document.getElementById("gelenDetayPanel") || document;
  const noteTa = scope.querySelector("#yeniNot");
  const noteText = noteTa ? (noteTa.value || "").trim() : "";

  const bulkActive = bulkMerkezSelectedIds.size > 1 && bulkMerkezSelectedIds.has(String(selectedId));
  const targetIds = bulkActive ? Array.from(bulkMerkezSelectedIds) : [selectedId];
  if(bulkActive && !confirm(targetIds.length + " kayda aynı açıklama" + (noteText ? " ve not" : "") + " yazılacak. Devam edilsin mi?")) return;

  const stamp = () => (window.FieldValue || firebase.firestore.FieldValue).serverTimestamp();
  // Ortak not objesi (varsa)
  const noteObj = noteText ? {
    yazan: (currentSube || "Şube"),
    tarih: new Date().toLocaleString("tr-TR"),
    metin: noteText, ek: "", ekler: []
  } : null;

  try{
    await Promise.all(targetIds.map(async (id)=>{
      const rec = bildirimler.find(x=>String(x.id)===String(id));
      if(!rec) return;
      const patch = { kayseriAck: val, kayseriAckAt: stamp() };
      if(noteObj){
        if(!rec.notlar) rec.notlar = [];
        patch.notlar = (rec.notlar || []).slice().concat([noteObj]);
      }
      await updateBildirim(rec.id, patch);
      rec.kayseriAck = val;
      if(patch.notlar) rec.notlar = patch.notlar;
    }));
    saveLocal();
    if(noteTa) noteTa.value = "";
    if(bulkActive){
      showToast(targetIds.length + " kayıt güncellendi" + (noteObj ? " (not dahil)" : "") + ".", "success");
      exitBulkSelectMode();
    }
    if(typeof window.refreshGelenBildirimler === "function"){
      window.refreshGelenBildirimler();
    }
    refreshTable();
    showDetail(selectedId);
  }catch(err){
    console.error("saveIlgiliSubeAck:", err);
    showToast("Kaydedilemedi: " + (err?.message || err), "error");
  }
}

async function saveSubeEdit(btn){
  if(!selectedId) return;
  const k = bildirimler.find(x=>x.id===selectedId);
  if(!k) return;

  // Yetki kontrolü
  if(!(currentRole === "admin" || currentRole === "stok" || currentRole === "sube" || currentRole === "kayseri" || currentRole === "malkabul")){
    showToast("Bu kaydı düzenleme yetkiniz yok.", "error");
    return;
  }
  if((currentRole === "sube" && k.sube !== currentSube)){
    showToast("Bu kaydı düzenleme yetkiniz yok.", "error");
    return;
  }

  // ✅ aynı ID'ler farklı sayfalarda olabildiği için, butonun bulunduğu paneli scope al
  let scope = null;
  try{
    scope = btn ? (btn.closest("#detayPanel, #gelenDetayPanel, #detayPanelKayseri, #detayPanelMalkabul") || btn.closest(".page")) : null;
  }catch(e){}

  if(!scope){
    scope = document.getElementById(currentPageId) || document;
  }

  const cikisDepoEl = scope.querySelector("#editCikisDepo");
  const partiEl = scope.querySelector("#editParti");
  const urunEl = scope.querySelector("#editUrun");
  const urunAckEl = scope.querySelector("#editUrunAck");
  const editBeklenenEl = scope.querySelector("#editBeklenenUrun");
  const editGelenEl = scope.querySelector("#editGelenUrun");
  const eksikEl = scope.querySelector("#editEksik");
  const fazlaEl = scope.querySelector("#editFazla");

  const patch = {};

  if(cikisDepoEl) patch.cikisDepo = cikisDepoEl.value;

  if(currentRole !== "stok"){
    if(partiEl) patch.parti = (partiEl.value || "").trim();
    if(urunEl) patch.urun = (urunEl.value || "").trim();
    if(urunAckEl) patch.urunAck = (urunAckEl.value || "").trim();
    if(editBeklenenEl) patch.beklenenUrun = (editBeklenenEl.value || "").trim();
    if(editGelenEl) patch.gelenUrun = (editGelenEl.value || "").trim();
    const videoLinkEl = scope.querySelector("#detVideoLink");
    if(videoLinkEl) patch.videoLink = (videoLinkEl.value || "").trim();
    if(eksikEl) patch.eksik = parseInt(eksikEl.value || "0", 10);
    if(fazlaEl) patch.fazla = parseInt(fazlaEl.value || "0", 10);
  }

  return updateBildirim(selectedId, patch)
    .then(() => {
      Object.assign(k, patch);
      saveLocal();
      refreshTable();
      showDetail(selectedId);
      showToast("Kaydedildi.", "success");
    })
    .catch((err) => {
      console.error("saveSubeEdit:", err);
      showToast("Kaydedilemedi: " + (err?.message || err), "error");
    });
}
window.saveSubeEdit = saveSubeEdit;

function exportBildirimlerToCSV(){
  const headers = ["Tarih","Şube","Çıkış Depo","Parti No","Ürün","Ürün Açıklama","Eksik","Fazla","Durum","Mutabakat","Stok Açıklama","İlgili Şube Açıklama"];
  const rows = [headers];
  let data = filteredForRole();

  data = (data || []).filter(k => !k.silindi);

  if(currentRole === "kayseri"){
    data = data.filter(k => k.cikisDepo === "Kayseri Depo" && k.sube !== "Kayseri Depo");
  }

  // Bildirimler sayfasının filtre kutularını YALNIZCA o sayfadayken uygula.
  // Bu fonksiyon Raporlar sayfasından da çağrılıyor; oranın kendi filtresi yok,
  // dolayısıyla Bildirimler'de kalan (gizli) filtre değerleri Raporlar
  // export'unu yanlışlıkla boşaltıyordu (örn. Malkabul kayıtları elenir).
  const applyBildirimFilters = (currentPageId === "page-bildirimler");
  const fSubeEl = document.getElementById("fltSube");
  const fDepoEl = document.getElementById("fltCikisDepo");
  const fDurumEl = document.getElementById("fltDurum");
  const fMutEl = document.getElementById("fltMutabakat");
  const fStokEl = document.getElementById("fltStokAck");

  const fSube = (applyBildirimFilters && fSubeEl) ? fSubeEl.value : "tum";
  const fDepo = (applyBildirimFilters && fDepoEl) ? fDepoEl.value : "tum";
  const fDurum = (applyBildirimFilters && fDurumEl) ? fDurumEl.value : "tum";
  const fMut = (applyBildirimFilters && fMutEl) ? fMutEl.value : "tum";
  const fStok = (applyBildirimFilters && fStokEl) ? fStokEl.value : "tum";

  data.forEach(k=>{
    if(fSube !== "tum" && k.sube !== fSube) return;
    if(fDepo !== "tum" && k.cikisDepo !== fDepo) return;
    if(fDurum !== "tum" && k.durum !== fDurum) return;
    if(fMut !== "tum" && k.mutabakat !== fMut) return;
    if(fStok !== "tum" && k.stokAck !== fStok) return;

    const ilgiliAck = (() => {
      if (currentRole === "merkez") return k.merkezAck || "";
      const depo = k.cikisDepo || "";
      if (depo === "Merkez Depo") return k.merkezAck || "";
      return k.kayseriAck || "";
    })();

    rows.push([
      k.tarih || "",
      k.sube || "",
      k.cikisDepo || "",
      k.parti || "",
      k.urun || "",
      k.urunAck || "",
      k.eksik,
      k.fazla,
      k.durum || "",
      k.mutabakat || "",
      k.stokAck || "",
      ilgiliAck
    ]);
  });
  exportArrayToCSV("bildirimler.csv", rows);
}


function exportMalkabulYapilanToCSV(){
  const headers = ["Tarih","Şube","Çıkış Depo","Parti No","Ürün","Ürün Açıklama","Eksik","Fazla","Durum","Mutabakat","Stok Kontrol Açıklama","İlgili Şube Açıklama"];
  const rows = [headers];
  let data = bildirimler.filter(k => {
    const s = (k.sube || "").toUpperCase();
    return s.includes("MAL KABUL");
  });

  const fDepoEl = document.getElementById("fltMalkabulCikisDepo");
  const fDurumEl = document.getElementById("fltMalkabulDurum");
  const fMutEl = document.getElementById("fltMalkabulMutabakat");
  const fStokEl = document.getElementById("fltMalkabulStokAck");

  const fDepo = fDepoEl ? fDepoEl.value : "tum";
  const fDurum = fDurumEl ? fDurumEl.value : "tum";
  const fMut = fMutEl ? fMutEl.value : "tum";
  const fStok = fStokEl ? fStokEl.value : "tum";

  data.forEach(k=>{
    if(fDepo !== "tum" && (k.cikisDepo || "-") !== fDepo) return;
    if(fDurum !== "tum" && k.durum !== fDurum) return;
    if(fMut !== "tum" && k.mutabakat !== fMut) return;
    if(fStok !== "tum" && k.stokAck !== fStok) return;

    rows.push([
      k.tarih,
      k.sube,
      k.cikisDepo || "-",
      k.parti,
      k.urun,
      k.urunAck || "-",
      k.eksik,
      k.fazla,
      k.durum,
      k.mutabakat,
      k.stokAck || "-",
      k.kayseriAck || "-"
    ]);
  });

  exportArrayToCSV("malkabul_yapilan_bildirimler.csv", rows);
}
function exportGelenToCSV(){
  if(currentRole !== "sube") return;
  const headers = ["Tarih","Gönderen Şube","Çıkış Depo","Parti No","Ürün","Eksik","Fazla","Durum","Mutabakat","Stok Kontrol Açıklama","İlgili Şube Açıklama"];
  const rows = [headers];

  const fSubeEl = document.getElementById("fltGelenSube");
  const fDepoEl = document.getElementById("fltGelenCikisDepo");
  const fDurumEl = document.getElementById("fltGelenDurum");
  const fMutEl = document.getElementById("fltGelenMutabakat");
  const fStokEl = document.getElementById("fltGelenStokAck");

  const fSube = fSubeEl ? fSubeEl.value : "tum";
  const fDepo = fDepoEl ? fDepoEl.value : "tum";
  const fDurum = fDurumEl ? fDurumEl.value : "tum";
  const fMut = fMutEl ? fMutEl.value : "tum";
  const fStok = fStokEl ? fStokEl.value : "tum";

  let data = bildirimler.filter(k=>!k.silindi && k.cikisDepo === currentSube && k.sube !== currentSube);

  data.forEach(k=>{
    if(fSube !== "tum" && k.sube !== fSube) return;
    if(fDepo !== "tum" && k.cikisDepo !== fDepo) return;
    if(fDurum !== "tum" && k.durum !== fDurum) return;
    if(fMut !== "tum" && k.mutabakat !== fMut) return;
    if(fStok !== "tum" && k.stokAck !== fStok) return;

    rows.push([
      k.tarih || "",
      k.sube || "",
      k.cikisDepo || "",
      k.parti || "",
      k.urun || "",
      k.eksik,
      k.fazla,
      k.durum,
      k.mutabakat,
      k.stokAck || "",
      k.kayseriAck || ""
    ]);
  });

  exportArrayToCSV("gelen_bildirimler.csv", rows);
}

function exportSilinenToCSV(){
  const headers = ["Tarih","Şube","Parti No","Ürün","Eksik","Fazla","Silme Nedeni","Silen Rol"];
  const rows = [headers];
  let data = silinenBildirimler.slice();
  if(currentRole === "sube"){
    data = data.filter(k=>k.sube === currentSube);
  }
  data.forEach(k=>{
    const silmeNedeni = (k.silmeNedeni ?? k.deletedReason ?? "");
    const silenRol = (k.silenRol ?? k.deletedByRole ?? "");
    rows.push([
      k.tarih,
      k.sube,
      k.parti,
      k.urun,
      (k.eksik ?? ""),
      (k.fazla ?? ""),
      silmeNedeni,
      silenRol
    ]);
  });
  exportArrayToCSV("silinen_bildirimler.csv", rows);
}

function durumBadgeHTML(d){
  if(d==="Açık") return `<span class="badge badge-open">Açık</span>`;
  if(d==="Kapandı") return `<span class="badge badge-closed">Kapandı</span>`;
  if(d==="İnceleniyor") return `<span class="badge badge-review">İnceleniyor</span>`;
  return d;
}
function mutabakatBadgeHTML(m){
  if(m==="Beklemede") return `<span class="badge badge-wait">Beklemede</span>`;
  if(m==="Görüşülüyor") return `<span class="badge badge-review">Görüşülüyor</span>`;
  if(m==="Mutabık") return `<span class="badge badge-ok">Mutabık</span>`;
  if(m==="Mutabık Değil") return `<span class="badge badge-nok">Mutabık Değil</span>`;
  return m;
}
function isNegatifPozitifKayit(k){
  return !!(k && (k.bildirimTipi === "negatifPozitif" || k.negatifPozitif === true));
}
function negatifPozitifBadgeHTML(k){
  if(!isNegatifPozitifKayit(k)) return "";
  return `<span class="np-sign np-sign-both">+/-</span>`;
}
function negatifPozitifInlineHTML(k){
  if(!isNegatifPozitifKayit(k)) return "";
  return `<span class="np-sign-inline">+/-</span>`;
}
function renderNegatifPozitifUrunHTML(k, urunHtml){
  if(!isNegatifPozitifKayit(k)) return urunHtml;
  return `<span class="np-inline-wrap">${negatifPozitifInlineHTML(k)}${urunHtml}</span>`;
}
function negatifPozitifDetayHTML(k){
  if(!isNegatifPozitifKayit(k)) return "";
  return `
    <div style="margin-top:10px;">
      <strong>Negatif / Pozitif Detayı</strong>
      <div class="small-text" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:8px;">
        <div><strong>Gelmesi Gereken Ürün:</strong><div class="ack-box">${escapeHtml(k.beklenenUrun || "-")}</div></div>
        <div><strong>Gelen Ürün:</strong><div class="ack-box">${escapeHtml(k.gelenUrun || "-")}</div></div>
      </div>
    </div>
  `;
}

/*** RAPORLAR ***/
function updateRaporTexts(){
  const sub = document.getElementById("raporSubTitle");
  if(currentRole === "sube"){
    sub.textContent = currentSube + " şubesinin yaptığı ve şubesine gelen bildirimlerin özeti.";
  } else if(currentRole === "merkez"){
    sub.textContent = "Tüm şubelerden gelen mutabakat bildirimlerinin özeti.";
  } else if(currentRole === "kayseri"){
    sub.textContent = "Kayseri Depo için tüm şubelerden gelen mutabakat bildirimlerinin özeti.";
  } else {
    sub.textContent = "Stok açısından tüm şubelerin bildirim özeti.";
  }
}
function filteredForRole(){
  if(currentRole === "sube"){
    // Şube hem kendi yaptığı hem de çıkış deposu kendi şubesi olan bildirimleri görür
    return bildirimler.filter(k=>
      (k.sube === currentSube) ||
      (k.cikisDepo === currentSube && k.sube !== currentSube)
    );
  } else if(currentRole === "merkez"){
    // Merkez, çıkış deposu Merkez olan veya eski kayıtlarda depo seçilmemiş bildirimleri görür
    return bildirimler.filter(k=>
      (!k.cikisDepo || k.cikisDepo === "Merkez Depo") &&
      !SPECIAL_CIKIS_DEPOLAR.includes(k.cikisDepo || "")
    );
  } else if(currentRole === "malkabul"){
    // Merkez Malkabul, diğer depoların Mal Kabul'e gönderdiği bildirimleri görür (çıkış depo Merkez Malkabul, şube MAL KABUL olmayan)
    return bildirimler.filter(k=>k.cikisDepo === "Merkez Malkabul" && k.sube !== "MAL KABUL");
  } else if(currentRole === "kayseri"){
    // Kayseri Depo hem kendi yaptığı bildirimleri hem de çıkış deposu Kayseri Depo olanları görür
    // Özel çıkış depo tipleri (müşteri / tedarikçi / sayım / Merkez Malkabul) Kayseri panelinde görünmez
    return bildirimler.filter(k=>
      (k.sube === "Kayseri Depo" || k.cikisDepo === "Kayseri Depo") &&
      !SPECIAL_CIKIS_DEPOLAR.includes(k.cikisDepo || "")
    );
  }
  // Stok rolü tüm kayıtları görür (özel tipler dahil)
  return bildirimler;
}
function updateKPIs(){
  const data = filteredForRole();
  const toplam = data.length;
  const acik = data.filter(k=>k.durum==="Açık").length;
  const beklemede = data.filter(k=>k.mutabakat==="Beklemede").length;
  const kapali = data.filter(k=>k.durum==="Kapandı").length;

  // 3 gün ve üzeri açık bildirimler (takvim günü bazlı)
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDayMs = 1000 * 60 * 60 * 24;

  const acik3Gun = data.filter(k => {
    if (k.durum !== "Açık") return false;
    if (!k.tarihISO) return false;
    const d = new Date(k.tarihISO + "T00:00:00");
    const recMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = (todayMidnight - recMidnight) / oneDayMs;
    return diffDays >= 3;
  }).length;

  document.getElementById("kpiToplam").textContent = toplam;
  document.getElementById("kpiAcik").textContent = acik;
  document.getElementById("kpiBeklemede").textContent = beklemede;
  document.getElementById("kpiKapali").textContent = kapali;

  const kpi3GunEl = document.getElementById("kpiAcik3Gun");
  if (kpi3GunEl){
    kpi3GunEl.textContent = acik3Gun;
  }
}
async function updateCharts(){
  await ensureChartJs();
  const ctxBranch = document.getElementById('chartByBranch');
  const ctxStatus = document.getElementById('chartByStatus');
  const ctxTrend = document.getElementById('chartTrend');
  const ctxDepo = document.getElementById('chartByDepo');
  if(!ctxBranch || !ctxStatus || !ctxTrend) return;

  const data = filteredForRole();

  // Şubelere göre bildirim (en yüksekten küçüğe sıralı)
  const perBranch = {};
  data.forEach(k=>{
    perBranch[k.sube] = (perBranch[k.sube] || 0) + 1;
  });
  const branchSorted = Object.entries(perBranch).sort((a, b) => b[1] - a[1]);
  const branchLabels = branchSorted.map(e => e[0]);
  const branchData = branchSorted.map(e => e[1]);

  // Eksik / Fazla dağılımı (2 kategori)
  const eksikSayi = data.filter(k => Number(k.eksik) > 0).length;
  const fazlaSayi = data.filter(k => Number(k.fazla) > 0).length;

  const eksikFazlaLabels = ["Eksik", "Fazla"];
  const eksikFazlaCounts = [eksikSayi, fazlaSayi];

  // 7 günlük trend
  const today = new Date();
  const dates = [];
  const trendData = [];
  for(let i=6;i>=0;i--){
    const d = new Date(today);
    d.setDate(d.getDate()-i);
    const iso = d.toISOString().slice(0,10);
    const label = iso.slice(8,10) + "." + iso.slice(5,7);
    dates.push(label);
    const count = data.filter(k=>k.tarihISO===iso).length;
    trendData.push(count);
  }

  // Depolara göre çıkış dağılımı
  // İstenen ana kategorileri ayrı ayrı göster; diğer tüm değerleri tek kovada topla.
  const depoOrder = ["Merkez Depo","Merkez Malkabul","Kayseri Depo","TRF transfer","ANADOLU"];
  const depoCounts = {
    "Merkez Depo": 0,
    "Merkez Malkabul": 0,
    "Kayseri Depo": 0,
    "TRF transfer": 0,
    "ANADOLU": 0,
    "Diğer/Belirsiz": 0
  };

  data.forEach(k=>{
    const d = (k.cikisDepo || "").trim();
    if(!d){
      depoCounts["Diğer/Belirsiz"] += 1;
      return;
    }
    if(Object.prototype.hasOwnProperty.call(depoCounts, d) && d !== "Diğer/Belirsiz"){
      depoCounts[d] += 1;
    } else {
      depoCounts["Diğer/Belirsiz"] += 1;
    }
  });

  const depoLabels = depoOrder.filter(label => depoCounts[label] > 0);
  if(depoCounts["Diğer/Belirsiz"] > 0) depoLabels.push("Diğer/Belirsiz");
  const depoData = depoLabels.map(label => depoCounts[label]);

  if(chartByBranch) chartByBranch.destroy();
  chartByBranch = new Chart(ctxBranch, {
    type: 'bar',
    data: {
      labels: branchLabels,
      datasets: [{ label:'Bildirim Sayısı', data:branchData, borderWidth:1 }]
    },
    options: { plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{precision:0}} } }
  });

  if(chartByStatus) chartByStatus.destroy();
  chartByStatus = new Chart(ctxStatus, {
    type: 'doughnut',
    data: { labels: eksikFazlaLabels, datasets:[{ data: eksikFazlaCounts }] },
    options:{ plugins:{legend:{position:'bottom'}} }
  });

  if(chartTrend) chartTrend.destroy();
  chartTrend = new Chart(ctxTrend, {
    type:'line',
    data:{ labels:dates, datasets:[{label:'Günlük Bildirim', data:trendData, tension:0.3}]},
    options:{ plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{precision:0}} } }
  });

  if(ctxDepo){
    if(chartByDepo) chartByDepo.destroy();
    chartByDepo = new Chart(ctxDepo, {
      type: 'doughnut',
      data: { labels:depoLabels, datasets:[{data:depoData}] },
      options:{ plugins:{legend:{position:'bottom'}} }
    });
  }
}

function updatePivot(){
  const tbl = document.getElementById("pivotTable");
  if(!tbl) return;
  tbl.innerHTML = "";
  const data = filteredForRole();

  if(currentRole === "sube"){
    const sube = currentSube;
    const kayitlar = data;
    const toplam = kayitlar.length;
    const beklemede = kayitlar.filter(k=>k.mutabakat==="Beklemede").length;
    const kategoriSayilari = {};
    STOK_KATEGORILERI.forEach(k=>kategoriSayilari[k]=0);
    kayitlar.forEach(k=>{
      if(STOK_KATEGORILERI.includes(k.stokAck)){
        kategoriSayilari[k.stokAck] += 1;
      }
    });
    const genelToplam = STOK_KATEGORILERI.reduce((s,ad)=>s+kategoriSayilari[ad],0);

    const headers = ["GİRİŞ DEPO","Toplam Bildirim","Beklemede", ...STOK_KATEGORILERI, "Genel Toplam"];
    const theadTr = document.createElement("tr");
    headers.forEach((h,i)=>{
      const th = document.createElement("th");
      th.textContent = h;
      th.className = i===0 ? "pivot-header-main" : "pivot-header-sub";
      theadTr.appendChild(th);
    });
    tbl.appendChild(theadTr);

    const trBranch = document.createElement("tr");
    trBranch.className = "pivot-row-branch";
    const cellsBranch = [sube, toplam, beklemede, ...STOK_KATEGORILERI.map(k=>kategoriSayilari[k]), genelToplam];
    cellsBranch.forEach(v=>{
      const td = document.createElement("td"); td.textContent=v; trBranch.appendChild(td);
    });
    tbl.appendChild(trBranch);

    const trTotal = document.createElement("tr");
    trTotal.className = "pivot-row-total";
    const cellsTotal = ["Genel Toplam", toplam, beklemede, ...STOK_KATEGORILERI.map(k=>kategoriSayilari[k]), genelToplam];
    cellsTotal.forEach(v=>{
      const td = document.createElement("td"); td.textContent=v; trTotal.appendChild(td);
    });
    tbl.appendChild(trTotal);
  } else {
    const headers = ["GİRİŞ DEPO","Toplam Bildirim","Beklemede", ...STOK_KATEGORILERI, "Genel Toplam"];
    const theadTr = document.createElement("tr");
    headers.forEach((h,i)=>{
      const th = document.createElement("th");
      th.textContent = h;
      th.className = i===0 ? "pivot-header-main" : "pivot-header-sub";
      theadTr.appendChild(th);
    });
    tbl.appendChild(theadTr);

    const subeler = Array.from(new Set(data.map(k=>k.sube))).sort();
    let genToplamBildirim=0, genBeklemede=0;
    const genKategoriSayilari={};
    STOK_KATEGORILERI.forEach(k=>genKategoriSayilari[k]=0);

    subeler.forEach(sube=>{
      const kayitlar = data.filter(k=>k.sube===sube);
      const toplam = kayitlar.length;
      const beklemede = kayitlar.filter(k=>k.mutabakat==="Beklemede").length;
      const kategoriSayilari={}; STOK_KATEGORILERI.forEach(k=>kategoriSayilari[k]=0);
      kayitlar.forEach(k=>{
        if(STOK_KATEGORILERI.includes(k.stokAck)){
          kategoriSayilari[k.stokAck]+=1;
        }
      });
      const genelToplam = STOK_KATEGORILERI.reduce((s,ad)=>s+kategoriSayilari[ad],0);

      genToplamBildirim+=toplam;
      genBeklemede+=beklemede;
      STOK_KATEGORILERI.forEach(ad=>genKategoriSayilari[ad]+=kategoriSayilari[ad]);

      const tr = document.createElement("tr");
      tr.className = "pivot-row-branch";
      // Kategori sayıları tek bir hücreye dizi olarak düşmesin diye spread kullanıyoruz.
      // Aksi halde kolonlar kaymış gibi görünür.
      const cells=[sube,toplam,beklemede, ...STOK_KATEGORILERI.map(k=>kategoriSayilari[k]), genelToplam];
      cells.forEach(v=>{
        const td=document.createElement("td");td.textContent=v;tr.appendChild(td);
      });
      tbl.appendChild(tr);
    });

    const genToplam = STOK_KATEGORILERI.reduce((s,ad)=>s+genKategoriSayilari[ad],0);
    const trTotal=document.createElement("tr");
    trTotal.className="pivot-row-total";
    const cellsTotal=["Genel Toplam",genToplamBildirim,genBeklemede, ...STOK_KATEGORILERI.map(k=>genKategoriSayilari[k]), genToplam];
    cellsTotal.forEach(v=>{
      const td=document.createElement("td");td.textContent=v;trTotal.appendChild(td);
    });
    tbl.appendChild(trTotal);
  }
}

/*** BİLDİRİMLER SAYFASI ***/
function updateBildirimPageTexts(){
  const title = document.getElementById("bildirimlerTitle");
  const sub = document.getElementById("bildirimlerSubTitle");
  const fltSubeWrapper = document.getElementById("fltSubeWrapper");
  if(currentRole === "sube"){
    title.textContent = "Yapılan Bildirimler";
    sub.textContent = currentSube + " şubesinin kendi bildirimleri listelenir.";
    fltSubeWrapper.classList.add("hidden");
  } else if(currentRole === "merkez"){
    title.textContent = "Bildirim Talepleri";
    sub.textContent = "Tüm şubelerден gelen bildirimler. Mutabakat durumu ve merkez açıklamasını buradan takip edin.";
    fltSubeWrapper.classList.remove("hidden");
  } else if(currentRole === "malkabul"){
    title.textContent = "Mal Kabul Bildirimleri";
    sub.textContent = "Çıkış deposu 'Merkez Malkabul' olan bildirimler listelenir. Mal Kabul açıklamasını buradan yönetebilirsiniz.";
    fltSubeWrapper.classList.remove("hidden");
  } else if(currentRole === "kayseri"){
    title.textContent = "Bildirim Talepleri";
    sub.textContent = "Kayseri Depo kullanıcısı olarak tüm şubelerden gelen bildirimleri görüntüleyebilir ve yeni bildirim oluşturabilirsiniz.";
    fltSubeWrapper.classList.remove("hidden");
  } else {
    title.textContent = "Bildirim İnceleme";
    sub.textContent = "Tüm şubelerden gelen bildirimleri stok açısından inceleyin.";
    fltSubeWrapper.classList.remove("hidden");
  }
  fillSubeFilter();
}

function fillSubeFilter(){
  const sel = document.getElementById("fltSube");
  const current = sel.value;
  sel.innerHTML = '<option value="tum">Tümü</option>';
  const data = bildirimler;
  const subeler = Array.from(new Set(data.map(k=>k.sube))).sort();
  subeler.forEach(s=>{
    const opt = document.createElement("option");
    opt.value = s; opt.textContent = s;
    sel.appendChild(opt);
  });
  if(currentRole === "sube"){
    // filtre gizli ama yine de currentSube uygulanacak
    sel.value = currentSube;
  } else if(current) {
    sel.value = current;
  }
}

function describeBildirimQuickFilter(){
  const parts = [];
  const kpiAgeDays = Number(window.__kpiAgeFilterDays || 0);
  const kpiQtyFilter = String(window.__kpiQuantityFilter || "").trim();
  const fSubeEl = document.getElementById("fltSube");
  const fDepoEl = document.getElementById("fltCikisDepo");
  const fDurumEl = document.getElementById("fltDurum");
  const fMutEl = document.getElementById("fltMutabakat");
  const fStokEl = document.getElementById("fltStokAck");
  const fSube = fSubeEl ? fSubeEl.value : "tum";
  const fDepo = fDepoEl ? fDepoEl.value : "tum";
  const fDurum = fDurumEl ? fDurumEl.value : "tum";
  const fMut = fMutEl ? fMutEl.value : "tum";
  const fStok = fStokEl ? fStokEl.value : "tum";

  if(kpiAgeDays > 0) parts.push(`${kpiAgeDays}+ Gün Açık`);
  if(kpiQtyFilter === "eksik") parts.push("Eksik > 0");
  if(kpiQtyFilter === "fazla") parts.push("Fazla > 0");
  if(kpiQtyFilter === "mutabikDegilEksik") parts.push("Mutabık Kalınmayan Eksik");
  if(currentRole !== "sube" && fSube !== "tum") parts.push(`Şube: ${fSube}`);
  if(fDepo !== "tum") parts.push(`Çıkış Depo: ${fDepo}`);
  if(fDurum !== "tum") parts.push(`Durum: ${fDurum}`);
  if(fMut !== "tum") parts.push(`Mutabakat: ${fMut}`);
  if(fStok !== "tum") parts.push(`Stok Açıklama: ${fStok}`);

  return parts;
}

function updateBildirimFilterUi(){
  const infoEl = document.getElementById("bildirimQuickFilterInfo");
  const btnEl = document.getElementById("btnClearBildirimFilters");
  const parts = describeBildirimQuickFilter();
  const hasActive = parts.length > 0;
  if(infoEl){
    infoEl.textContent = hasActive ? `Aktif filtre: ${parts.join(" • ")}` : "";
    infoEl.classList.toggle("hidden", !hasActive);
  }
  if(btnEl){
    btnEl.classList.toggle("hidden", !hasActive);
  }
}

function clearAllBildirimFilters(){
  const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
  setVal("fltSube", "tum");
  setVal("fltCikisDepo", "tum");
  setVal("fltDurum", "tum");
  setVal("fltMutabakat", "tum");
  setVal("fltStokAck", "tum");
  window.__kpiAgeFilterDays = 0;
  window.__kpiQuantityFilter = "";
  // Stok "Açıklama eklenenler" özel filtresini de sıfırla
  stokAckOnlyFilter = false;
  const stokBtn = document.getElementById('btnStokAckFilter');
  if(stokBtn) stokBtn.classList.remove('active');
  try{
    const url = new URL(window.location.href);
    url.searchParams.delete("filter");
    history.replaceState({}, "", url);
  }catch(_e){}
  if(typeof refreshTable === "function") refreshTable();
}

function refreshTable(){
  // Toplu seçim (Toplu seçim butonu + checkbox kolonu) merkez, stok ve şube
  // (kendi "Yapılan Bildirimler"i) rollerinde açık.
  const bulkRolActive = (currentRole === "merkez" || currentRole === "stok" || currentRole === "sube");
  document.body.classList.toggle("role-merkez-bulk", bulkRolActive);
  document.body.classList.toggle("role-stok", currentRole === "stok");

  // ✅ Tarih sıralaması (desc): tarihISO varsa ona göre, yoksa id'ye göre
  const list = (bildirimler || []).slice().sort((a, b) => {
    const ta = a?.tarihISO || "";
    const tb = b?.tarihISO || "";
    if (ta && tb && ta !== tb) return tb.localeCompare(ta);
    const ia = Number(a?.id || 0);
    const ib = Number(b?.id || 0);
    return ib - ia;
  });
const tbody = document.getElementById("tblBildirimler");
  tbody.innerHTML = "";
  const fSube = document.getElementById("fltSube").value;
  const fDurum = document.getElementById("fltDurum").value;
  const fMut = document.getElementById("fltMutabakat").value;
  const fStok = document.getElementById("fltStokAck").value;
  const depoSelect = document.getElementById("fltCikisDepo");
  const fDepo = depoSelect ? depoSelect.value : "tum";

  let data = filteredForRole();

// ✅ Tablo sıralaması (desc): rol filtrelerinden sonra da tarihISO'ya göre sırala
data = (data || []).slice().sort((a, b) => {
  const ta = a?.tarihISO || "";
  const tb = b?.tarihISO || "";
  if (ta && tb && ta !== tb) return tb.localeCompare(ta);
  const ia = Number(a?.id || 0);
  const ib = Number(b?.id || 0);
  return ib - ia;
});
  if(currentRole === "kayseri"){
    // Kayseri Depo'ya gelen talepler: şube != Kayseri Depo ve çıkış deposu Kayseri Depo olanlar
    data = list.filter(k => k.cikisDepo === "Kayseri Depo" && k.sube !== "Kayseri Depo");
  }
  let shown = 0;
  // KPI kartlarından gelen ekstra filtreler (örn: 3+ gün açık, sadece eksik/fazla)
  const kpiAgeDays = Number(window.__kpiAgeFilterDays || 0);
  const kpiQtyFilter = String(window.__kpiQuantityFilter || "").trim();
  const parseTrDate = (s)=>{
    const t = (s==null ? "" : String(s)).trim();
    if(!t) return null;
    // ISO varsa en güvenlisi
    const dIso = new Date(t);
    if(Number.isFinite(dIso.getTime())) return dIso;
    // dd.mm.yyyy veya dd/mm/yyyy
    const m = t.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})/);
    if(m){
      const dd = parseInt(m[1],10);
      const mm = parseInt(m[2],10);
      const yy = parseInt(m[3],10);
      const d = new Date(yy, mm-1, dd);
      if(Number.isFinite(d.getTime())) return d;
    }
    return null;
  };
  const diffDays = (d)=>{
    if(!d) return 0;
    const now = new Date();
    // Gün hesabında saat farkı şaşırtmasın diye midnight normalize
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.floor((a - b) / 86400000);
  };
  data.forEach(k=>{
    if(kpiAgeDays > 0){
      // Bu ekstra filtre, mantıken sadece "Açık" kayıtlar için anlamlı
      if(String(k.durum||"") !== "Açık") return;
      const d = parseTrDate(k.tarihISO || k.tarih);
      const days = diffDays(d);
      if(days < kpiAgeDays) return;
    }
    if(kpiQtyFilter === "eksik" && !(Number(k.eksik || 0) > 0)) return;
    if(kpiQtyFilter === "fazla" && !(Number(k.fazla || 0) > 0)) return;
    if(kpiQtyFilter === "mutabikDegilEksik"){
      const hasEksik = Number(k.eksik || 0) > 0;
      const isMutabik = String(k.mutabakat || "") === "Mutabık";
      if(!(hasEksik && !isMutabik)) return;
    }
    if(fSube !== "tum" && k.sube !== fSube) return;
    if(fDurum !== "tum" && k.durum !== fDurum) return;
    if(fMut !== "tum" && k.mutabakat !== fMut) return;
    if(fStok !== "tum" && k.stokAck !== fStok) return;
    if(fDepo !== "tum" && k.cikisDepo !== fDepo) return;

    // Stok "Açıklama eklenenler" filtresi: ilgili şube açıklaması dolu VE
    // durum "Açık" olan kayıtları göster.
    if(stokAckOnlyFilter && currentRole === "stok"){
      const ackVal = ((k.cikisDepo || "") === "Merkez Depo") ? (k.merkezAck || "") : (k.kayseriAck || "");
      const hasAck = ackVal && String(ackVal).trim() && String(ackVal).trim() !== "-";
      if(!(String(k.durum || "") === "Açık" && hasAck)) return;
    }

    const tr = document.createElement("tr");
    tr.dataset.id = k.id;
    if(selectedId && String(selectedId) === String(k.id)) tr.classList.add('row-selected');
    const ilgiliAck = (() => {
      if (currentRole === "merkez") {
        return k.merkezAck || "-";
      }
      const depo = k.cikisDepo || "";
      if (depo === "Merkez Depo") {
        return k.merkezAck || "-";
      }
      return k.kayseriAck || "-";
    })();
    const __cell = (v)=>{
      const t = (v==null ? "" : String(v));
      const safe = escapeHtml(t);
      return `<span class="cell-ellipsis" title="${safe}">${safe || "-"}</span>`;
    };
    const bulkChecked = bulkMerkezSelectedIds.has(String(k.id));
    tr.innerHTML = `
      <td class="bulk-select-col"><input type="checkbox" class="bulk-check" ${bulkChecked ? "checked" : ""} onclick="event.stopPropagation()" onchange="toggleBulkMerkezSelection('${k.id}', this.checked)"/></td>
      <td>${__cell(k.tarih)}</td>
      <td>${__cell(k.sube)}</td>
      <td>${__cell(k.cikisDepo || "-")}</td>
      <td>${__cell(k.parti)}</td>
      <td>${renderNegatifPozitifUrunHTML(k, __cell(k.urun))}</td>
      <td>${__cell(k.urunAck || "-")}</td>
      <td>${k.eksik}</td>
      <td>${k.fazla}</td>
      <td>${durumBadgeHTML(k.durum)}</td>
      <td>${mutabakatBadgeHTML(k.mutabakat)}</td>
      <td>${__cell(k.stokAck || "-")}</td>
      <td class="col-kayseri-ack" style="text-align:left;">${__cell(ilgiliAck)}</td>
    `;
    tr.addEventListener("click", ()=>{
      // Satıra tıklamak her zaman o kaydın tam detayını açar (toplu seçim
      // aktifken de) — showDetail zaten güncel bulkMerkezSelectedIds'e göre
      // "N kayıt seçili" notunu kendi içinde basıyor.
      showDetail(k.id);
      updateRowSelection();
    });
    tbody.appendChild(tr);
    shown++;
  });

  const cnt = document.getElementById('countBildirimler');
  if(cnt) cnt.textContent = shown + ' kayıt';

  updateBildirimFilterUi();
  updateBulkMerkezBar();
  refreshSilinenTable();
  updateKPIs();
  updateCharts().catch(console.error);
updatePivot();
}

// Toplu seçim hangi sayfada aktifse o sayfanın tablosunu/panelini/toggle
// butonunu döndüren yardımcı. Böylece aynı bulk altyapısı hem "Bildirim
// Talepleri" (page-bildirimler) hem "Gelen Bildirimler" (page-gelen-bildirimler)
// sayfasında çalışır.
function bulkCtx(){
  if(currentPageId === "page-gelen-bildirimler"){
    return { tableId:"tblGelenBildirimler", panelId:"gelenDetayPanel", toggleBtnId:"btnToggleBulkSelectModeGelen", selectAllId:"bulkGelenSelectAll" };
  }
  if(currentPageId === "page-kayseri-yapilan"){
    return { tableId:"tblKayseriYapilan", panelId:"detayPanelKayseri", toggleBtnId:"btnToggleBulkSelectModeKayseri", selectAllId:"bulkKayseriSelectAll" };
  }
  if(currentPageId === "page-malkabul-yapilan"){
    return { tableId:"tblMalkabulYapilan", panelId:"detayPanelMalkabul", toggleBtnId:"btnToggleBulkSelectModeMalkabul", selectAllId:"bulkMalkabulSelectAll" };
  }
  return { tableId:"tblBildirimler", panelId:"detayPanel", toggleBtnId:"btnToggleBulkSelectMode", selectAllId:"bulkMerkezSelectAll" };
}

// Varsayılan olarak checkbox'lar gizli — tablo düz görünür. "Toplu seçim"
// butonuna basınca satır checkbox'ları açılır. Kaydet/İptal ile tekrar gizlenir.
function toggleBulkSelectMode(){
  if(bulkSelectModeActive){
    exitBulkSelectMode({ closePanel:true });
  } else {
    bulkSelectModeActive = true;
    document.body.classList.add('bulk-select-mode');
    const btn = document.getElementById(bulkCtx().toggleBtnId);
    if(btn) btn.textContent = 'İptal';  // ikon CSS ::before ile gelir
  }
}

function exitBulkSelectMode(opts){
  const closePanel = !!(opts && opts.closePanel);
  const ctx = bulkCtx();
  bulkSelectModeActive = false;
  document.body.classList.remove('bulk-select-mode');
  bulkMerkezSelectedIds.clear();
  lastBulkToggledId = null;
  document.querySelectorAll('#' + ctx.tableId + ' .bulk-check').forEach(cb=>{ cb.checked = false; });
  const selectAll = document.getElementById(ctx.selectAllId);
  if(selectAll){ selectAll.checked = false; selectAll.indeterminate = false; }
  const btn = document.getElementById(ctx.toggleBtnId);
  if(btn) btn.textContent = 'Toplu seçim';
  if(closePanel){
    selectedId = null;
    const panel = document.getElementById(ctx.panelId);
    if(panel) panel.innerHTML = "<strong>Bir bildirim seçiniz</strong><p class='small-text'>Soldan kaydı seçin.</p>";
    if(typeof updateRowSelection === "function") updateRowSelection();
  } else {
    renderDetayPanelForSelection();
  }
}
window.toggleBulkSelectMode = toggleBulkSelectMode;
window.exitBulkSelectMode = exitBulkSelectMode;

// Stok "Açıklama eklenenler" filtresini aç/kapat.
function toggleStokAckFilter(){
  stokAckOnlyFilter = !stokAckOnlyFilter;
  const btn = document.getElementById('btnStokAckFilter');
  if(btn) btn.classList.toggle('active', stokAckOnlyFilter);
  refreshTable();
}
window.toggleStokAckFilter = toggleStokAckFilter;

function toggleBulkMerkezSelection(id, checked){
  const key = String(id);
  if(checked){
    bulkMerkezSelectedIds.add(key);
    lastBulkToggledId = key;
  } else {
    bulkMerkezSelectedIds.delete(key);
    if(lastBulkToggledId === key) lastBulkToggledId = null;
  }
  updateBulkMerkezBar();
  // Bir kutu işaretlenince o kaydın detayını sağ panelde göster. (Artık güvenli:
  // zıplamanın sebebi satır yüksekliğiydi, o CSS ile sabitlendi — panel
  // güncellemesi tabloyu oynatmıyor.) İşaret kaldırılırsa, hâlâ seçili başka
  // kayıt varsa onların sonuncusunu, yoksa mevcut açık kaydı korur.
  if(checked){
    const rec = bildirimler.find(x=>String(x.id)===key);
    if(rec) showDetail(rec.id);
  } else {
    const ids = Array.from(bulkMerkezSelectedIds);
    if(ids.length > 0){
      const rec = bildirimler.find(x=>String(x.id)===String(ids[ids.length-1]));
      if(rec) showDetail(rec.id);
    }
  }
}

function toggleAllVisibleMerkezSelections(checked){
  const ctx = bulkCtx();
  document.querySelectorAll('#' + ctx.tableId + ' tr[data-id]').forEach(tr=>{
    const id = tr.dataset.id;
    if(id == null) return;
    const box = tr.querySelector('.bulk-check');
    if(box) box.checked = checked;
    if(checked){
      bulkMerkezSelectedIds.add(String(id));
      lastBulkToggledId = String(id);
    } else {
      bulkMerkezSelectedIds.delete(String(id));
    }
  });
  if(!checked) lastBulkToggledId = null;
  updateBulkMerkezBar();
}
window.toggleAllVisibleMerkezSelections = toggleAllVisibleMerkezSelections;

function updateBulkMerkezBar(){
  const ctx = bulkCtx();
  const selectAll = document.getElementById(ctx.selectAllId);
  if(selectAll){
    const visibleIds = Array.from(document.querySelectorAll('#' + ctx.tableId + ' tr[data-id]')).map(tr=>String(tr.dataset.id));
    const allSelected = visibleIds.length > 0 && visibleIds.every(id=>bulkMerkezSelectedIds.has(id));
    const someSelected = visibleIds.some(id=>bulkMerkezSelectedIds.has(id));
    selectAll.checked = allSelected;
    selectAll.indeterminate = !allSelected && someSelected;
  }
  // ÖNEMLİ: checkbox tıklamasında sağ panele DOKUNMUYORUZ. Panelin (özellikle
  // "N kayıt seçili" notunun) her tıklamada güncellenmesi/görünüp kaybolması
  // layout'u oynatıp görünür bir "zıplamaya" sebep oluyordu. Panel yalnızca
  // bir satıra (satır gövdesine) tıklanınca showDetail ile açılır; o an
  // showDetail güncel seçim sayısını zaten gösterir.
}

// Checkbox ile toplu seçim, sağ detay panelini ARTIK HİÇBİR ZAMAN kendisi
// açıp değiştirmez — panel sadece satıra (satır gövdesine) tıklanınca açılır
// (bkz. tblBildirimler satır render'ındaki tr.addEventListener("click",...)).
// Önceki tasarımda checkbox işaretlenince en son işaretlenen kaydın detayı
// otomatik "önizleme" olarak paneле basılıyordu; bu tam yeniden çizim (showDetail)
// tablo/filtre alanında görünür bir "zıplamaya" sebep oluyordu. Artık checkbox
// sadece: (a) zaten açık bir kayıt varsa oradaki "N kayıt seçili" notunu
// günceller, (b) hiç kayıt açık değilse hafif bir özet metni gösterir.
function renderDetayPanelForSelection(){
  const ctx = bulkCtx();
  const panel = document.getElementById(ctx.panelId);
  if(!panel) return;
  const ids = Array.from(bulkMerkezSelectedIds);

  // Zaten açık bir kayıt varsa sadece "N kayıt seçili" notunu güncelle
  if(selectedId != null && panel.querySelector("#bulkSelNote")){
    updateBulkSelNoteInPlace(ids.length);
    return;
  }

  if(selectedId == null){
    if(ids.length > 0){
      panel.innerHTML = `<div class="small-text" style="margin-bottom:6px;font-weight:600;color:#4338ca;">${ids.length} kayıt seçili.</div><p class="small-text">Detayları görmek ve işlem yapmak için soldan bir kayda (satıra) tıklayın.</p>`;
    } else {
      panel.innerHTML = "<strong>Bir bildirim seçiniz</strong><p class='small-text'>Soldan kaydı seçin.</p>";
    }
  }
}

function updateBulkSelNoteInPlace(count){
  const note = document.getElementById("bulkSelNote");
  if(note){
    if(count > 1){
      note.textContent = count + " kayıt seçili — kaydettiğinde açıklama ve çıkış deposu değişiklikleri hepsine yazılır.";
      note.style.display = "";
    } else {
      note.textContent = "";
      note.style.display = "none";
    }
  }
  const btn = document.getElementById("btnClearBulkSel");
  if(btn){
    btn.textContent = "Seçimi Temizle (" + count + ")";
    btn.style.display = count > 1 ? "" : "none";
  }
}

function clearBulkMerkezSelection(){
  bulkMerkezSelectedIds.clear();
  lastBulkToggledId = null;
  // Aktif sayfanın tablosunu yenile
  if(currentPageId === "page-gelen-bildirimler"){ if(typeof refreshGelenBildirimler==="function") refreshGelenBildirimler(); }
  else if(currentPageId === "page-kayseri-yapilan"){ if(typeof refreshKayseriYapilanTable==="function") refreshKayseriYapilanTable(); }
  else if(currentPageId === "page-malkabul-yapilan"){ if(typeof refreshMalkabulYapilanTable==="function") refreshMalkabulYapilanTable(); }
  else refreshTable();
}
window.clearBulkMerkezSelection = clearBulkMerkezSelection;

function refreshGelenBildirimler(){
  window.setUILoading && setUILoading(true, { btnIds: ["btnGelenFiltrele","btnGelenYenile","btnGelenExcel"] });
  const tbody = document.getElementById("tblGelenBildirimler");
  if(!tbody) return;
  tbody.innerHTML = "";
  if(currentRole !== "sube") return;

  const fSubeEl = document.getElementById("fltGelenSube");
  const fDepoEl = document.getElementById("fltGelenCikisDepo");
  const fDurumEl = document.getElementById("fltGelenDurum");
  const fMutEl = document.getElementById("fltGelenMutabakat");
  const fStokEl = document.getElementById("fltGelenStokAck");

  const fSube = fSubeEl ? fSubeEl.value : "tum";
  const fDepo = fDepoEl ? fDepoEl.value : "tum";
  const fDurum = fDurumEl ? fDurumEl.value : "tum";
  const fMut = fMutEl ? fMutEl.value : "tum";
  const fStok = fStokEl ? fStokEl.value : "tum";

  let data = bildirimler.filter(k=>!k.silindi && k.cikisDepo === currentSube && k.sube !== currentSube);

  let shown = 0;
  data.forEach(k=>{
    if(fSube !== "tum" && k.sube !== fSube) return;
    if(fDepo !== "tum" && k.cikisDepo !== fDepo) return;
    if(fDurum !== "tum" && k.durum !== fDurum) return;
    if(fMut !== "tum" && k.mutabakat !== fMut) return;
    if(fStok !== "tum" && k.stokAck !== fStok) return;

    const tr = document.createElement("tr");
    tr.dataset.id = k.id;
    if(selectedId && String(selectedId) === String(k.id)) tr.classList.add('row-selected');
    const __cell = (v)=>{
      const t = (v==null ? "" : String(v));
      const safe = escapeHtml(t);
      return `<span class="cell-ellipsis" title="${safe}">${safe || "-"}</span>`;
    };
    const bulkChecked = bulkMerkezSelectedIds.has(String(k.id));
    tr.innerHTML = `
      <td class="bulk-select-col"><input type="checkbox" class="bulk-check" ${bulkChecked ? "checked" : ""} onclick="event.stopPropagation()" onchange="toggleBulkMerkezSelection('${k.id}', this.checked)"/></td>
      <td>${__cell(k.tarih || "")}</td>
      <td>${__cell(k.sube || "")}</td>
      <td>${__cell(k.cikisDepo || "-")}</td>
      <td>${__cell(k.parti || "")}</td>
      <td>${renderNegatifPozitifUrunHTML(k, __cell(k.urun || ""))}</td>
      <td>${__cell(k.urunAck || "-")}</td>
      <td>${k.eksik}</td>
      <td>${k.fazla}</td>
      <td>${durumBadgeHTML(k.durum)}</td>
      <td>${mutabakatBadgeHTML(k.mutabakat)}</td>
      <td>${__cell(k.stokAck || "-")}</td>
      <td>${__cell(k.kayseriAck || "-")}</td>
    `;
    tr.addEventListener("click", ()=>{
      if(typeof showDetail === "function"){
        showDetail(k.id);
      }
      updateRowSelection();
    });
    tbody.appendChild(tr);
    shown++;
  });

  const cnt = document.getElementById('countGelen');
  if(cnt) cnt.textContent = shown + ' kayıt';

  const detayPanel = document.getElementById("gelenDetayPanel");
  if(detayPanel && !selectedId){
    detayPanel.innerHTML = "<strong>Bir bildirim seçiniz</strong><p class='small-text'>Soldan kaydı seçin.</p>";
  }
  window.setUILoading && setUILoading(false, { btnIds: ["btnGelenFiltrele","btnGelenYenile","btnGelenExcel"] });
}



let selectedId = null;
let ownerEditVisible = false;

function ensureEkDosyalar(k){
  if(!k) return;
  if(!Array.isArray(k.ekDosyalar)){
    k.ekDosyalar = [];
  }
  if(k.ekDosya && k.ekDosya.dataUrl){
    var already = k.ekDosyalar.some(function(e){ return e.dataUrl === k.ekDosya.dataUrl; });
    if(!already){
      k.ekDosyalar.push({
        id: kayitId,
        name: k.ekDosya.name || "Ek",
        type: k.ekDosya.type || "",
        dataUrl: k.ekDosya.dataUrl,
        addedBy: (k.sube || "bilinmiyor")
      });
    }
  }
  k.ekDosyalar.forEach(function(e){
    if(!e.addedBy){
      e.addedBy = k.sube || "bilinmiyor";
    }
  });
}

function normalizeEkDosyalarAll(){
  if(Array.isArray(bildirimler)){
    bildirimler.forEach(ensureEkDosyalar);
  }
}


// ==== EK DOSYA (FOTO/PDF/EXCEL) UPLOAD HELPERS (Firebase Storage) ====
function __sanitizeFileName(name){
  return String(name || "dosya")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 120);
}
function __humanSize(bytes){
  const b = Number(bytes || 0);
  if(!b) return "0 B";
  const units = ["B","KB","MB","GB"];
  let v=b, i=0;
  while(v>=1024 && i<units.length-1){ v/=1024; i++; }
  return (v>=10 || i===0 ? v.toFixed(0) : v.toFixed(1)) + " " + units[i];
}
function __isAllowedEkDosyaType(file){
  const name = (file && (file.name||"") || "").toLowerCase();
  const type = (file && (file.type||"") || "").toLowerCase();

  // Images
  const isImage = type.startsWith("image/");

  // PDF
  const isPdf = type === "application/pdf";

  // Excel / CSV by extension or MIME
  const isExcelOrCsv =
    name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv") ||
    type === "application/vnd.ms-excel" ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "text/csv";

  return isImage || isPdf || isExcelOrCsv;
}
async function uploadEkDosyalarToStorage(files, kayitId, addedByLabel, allowedSubes, progressIds){
  if(!files || !files.length) return [];
  if(!window.storage){
    throw new Error("Firebase Storage başlatılamadı. index.html içinde firebase-storage-compat.js yüklü olmalı.");
  }

  const user = firebase.auth().currentUser;
  if(!user){
    throw new Error("Oturum bulunamadı. Dosya yüklemek için giriş yapmalısınız.");
  }

  const MAX_FILES = 8;
  // Video ekleri için limitleri biraz yükselttik.
  const MAX_FILE_MB = 50; // her bir dosya limiti
  const MAX_TOTAL_MB = 120; // toplam limit
  const list = Array.from(files).slice(0, MAX_FILES);

  let totalBytes = 0;
  list.forEach(f => totalBytes += (f.size || 0));
  if(totalBytes > MAX_TOTAL_MB * 1024 * 1024){
    throw new Error("Toplam dosya boyutu çok büyük (max " + MAX_TOTAL_MB + " MB).");
  }

  // Upload progress (overall)
  const __wrapId = (progressIds && progressIds.wrapId) || "uploadProgressWrap";
  const __barId  = (progressIds && progressIds.barId)  || "uploadProgressBar";
  const __textId = (progressIds && progressIds.textId) || "uploadProgressText";
  const __progWrap = document.getElementById(__wrapId);
  const __progBar  = document.getElementById(__barId);
  const __progText = document.getElementById(__textId);
  let overallTransferred = 0;
  const perFileTransferred = new Map();
  function setProg(pct, text){
    if(__progWrap) __progWrap.classList.remove("hidden");
    if(__progBar) __progBar.style.width = Math.max(0, Math.min(100, pct)) + "%";
    if(__progText) __progText.textContent = text || "";
  }
  function hideProg(){
    if(__progWrap) __progWrap.classList.add("hidden");
    if(__progBar) __progBar.style.width = "0%";
    if(__progText) __progText.textContent = "";
  }

  const uploads = [];
  const allowed = Array.isArray(allowedSubes) ? allowedSubes.filter(Boolean) : [];
  // Storage metadata içinde virgüllü string olarak tutulur (Rules read kontrolü için)
  const allowedSubesStr = allowed.join(",");
  for(const f of list){
    if(!__isAllowedEkDosyaType(f)){
      throw new Error("İzin verilmeyen dosya: " + (f.name || ""));
    }
    if((f.size||0) > MAX_FILE_MB * 1024 * 1024){
      throw new Error("Dosya çok büyük: " + (f.name || "") + " (max " + MAX_FILE_MB + " MB).");
    }

    const safeName = __sanitizeFileName(f.name);
    const fileId = String(Date.now()) + "_" + String(Math.floor(Math.random()*1e9));
    // Path: mutabakatEkler/{kayitId}/{fileId}/{filename}
    const path = "mutabakatEkler/" + kayitId + "/" + fileId + "/" + safeName;
    const ref = window.storage.ref().child(path);

    // IMPORTANT:
    // Edge/Tracking Prevention + yetkili indirme için downloadURL almadan önce READ gerekiyor.
    // READ kontrolünü Firestore'a bağlamak race-condition yaratıyordu.
    // Bu yüzden ownerUid ve allowedSubes'ı Storage customMetadata olarak yazıyoruz.
    // Video yükleme kaldırıldı. Tüm dosyalar inline olarak işaretlenir.

    const task = ref.put(f, {
      contentType: f.type || undefined,
      contentDisposition: "inline",
      customMetadata: {
        ownerUid: user.uid,
        allowedSubes: allowedSubesStr
      }
    });

    // Progress
    await new Promise((resolve, reject) => {
      task.on("state_changed", (snap) => {
        const prev = perFileTransferred.get(fileId) || 0;
        const cur = snap.bytesTransferred || 0;
        perFileTransferred.set(fileId, cur);
        overallTransferred += Math.max(0, cur - prev);
        const pct = totalBytes ? (overallTransferred / totalBytes) * 100 : 0;
        setProg(pct, "Yükleniyor: " + (f.name || "dosya") + " (" + Math.floor(pct) + "%)");
      }, (err) => {
        reject(err);
      }, () => {
        resolve();
      });
    });

    const snap = await task;
    const url = await snap.ref.getDownloadURL();

    const ek = {
      id: fileId,
      name: f.name,
      type: f.type || "",
      size: f.size || 0,
      sizeText: __humanSize(f.size || 0),
      url,
      storagePath: path,
      storageFileId: fileId,
      addedBy: addedByLabel || "",
      uploadedByUid: user.uid
    };
    uploads.push(ek);

    // Yetki/metaveri (rules için yardımcı): ekler/{fileId}
    try{
      await window.db.collection("ekler").doc(fileId).set({
        fileId,
        kayitId: String(kayitId),
        ownerUid: user.uid,
        name: f.name || "",
        type: f.type || "",
        size: f.size || 0,
        storagePath: path,
        allowedSubes: allowed,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, {merge:true});
    }catch(metaErr){
      console.warn("Ek metaverisi yazılamadı (devam ediyorum):", metaErr);
    }
  }
  setProg(100, "Yükleme tamamlandı.");
  setTimeout(hideProg, 900);
  return uploads;
}

// Programatik indirme
// Not: Firebase Storage "alt=media" linki tarayıcıda video player olarak açılabiliyor.
// En stabil yöntem: URL'ye response-content-disposition=attachment parametresi eklemek.
function __buildAttachmentUrl(url, filename){
  if(!url) return url;
  if(/response-content-disposition=/i.test(url)) return url;
  const safeName = (filename || "dosya").replace(/[\\/:*?"<>|]+/g, "_");
  const disp = `attachment; filename="${safeName}"`;
  const sep = url.includes("?") ? "&" : "?";
  // response-content-type=application/octet-stream: tarayıcının video player açmasını engeller
  return url + sep
    + "response-content-disposition=" + encodeURIComponent(disp)
    + "&response-content-type=" + encodeURIComponent("application/octet-stream");
}

async function indirDosya(url, filename, storagePath){
  if(!url) return;
  const safeName = (filename || "dosya").replace(/[\\/:*?"<>|]+/g, "_");

  // 0) Mümkünse Storage metadata'yı "attachment" yap (özellikle daha önce yüklenmiş videolar için)
  // Not: Kullanıcının o dosyada write yetkisi yoksa hata alır; sessizce geçiyoruz.
  try{
    if(storagePath && window.storage && window.storage.ref){
      await window.storage.ref().child(storagePath).updateMetadata({
        contentDisposition: `attachment; filename="${safeName}"`,
        // player açılmasını azaltmak için
        contentType: "application/octet-stream"
      });
    }
  }catch(e){ /* ignore */ }

  // 1) Önce "attachment" parametreli URL ile indir (CORS'a takılmaz)
  try{
    const a = document.createElement("a");
    a.href = __buildAttachmentUrl(url, safeName);
    a.download = safeName; // bazı tarayıcılar cross-origin'de ignore edebilir; header zaten işi görür
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }catch(e){
    // devam
  }

  // 2) Alternatif: Blob ile indir (CORS izin veriyorsa çalışır)
  try{
    const res = await fetch(url, { mode: "cors" });
    if(!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = safeName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(objectUrl), 1500);
  }catch(err){
    console.warn("İndirme başarısız:", err);
    showToast("Dosya indirilemedi. Tarayıcı indirimi engelliyor olabilir. Sağ tık → Bağlantıyı farklı kaydet deneyin.", "error");
  }
}

// ===== File Viewer (X ile kapatıp önceki ekrana dönme) =====
const __fvOverlay = document.getElementById("fileViewerOverlay");
const __fvTitle = document.getElementById("fvTitle");
const __fvBody = document.getElementById("fvBody");
const __fvDownloadBtn = document.getElementById("fvDownloadBtn");

function closeFileViewer(){
  if(!__fvOverlay) return;
  __fvOverlay.classList.add("hidden");
  if(__fvBody) __fvBody.innerHTML = "";
  if(__fvTitle) __fvTitle.textContent = "";
  if(__fvDownloadBtn) __fvDownloadBtn.onclick = null;
}

// Esc ile kapat
document.addEventListener("keydown", (e) => {
  if(e.key === "Escape" && __fvOverlay && !__fvOverlay.classList.contains("hidden")){
    closeFileViewer();
  }
});

function openFileViewer(url, mimeType, displayName){
  if(!url) return;
  const name = displayName || "Dosya";
  const type = (mimeType || "").toLowerCase();

  // Excel / CSV gibi dosyalarda önizleme her tarayıcıda iyi değil, direkt indir.
  const isImage = type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(name);
  const isPdf = type === "application/pdf" || /\.pdf$/i.test(name);
  const isVideo = type.startsWith("video/") || /\.(mp4|mov|mkv|webm)$/i.test(name);
  const isOffice = /\.(xlsx|xls|csv)$/i.test(name) || type.includes("spreadsheet") || type.includes("excel");

  // Video dosyaları: tarayıcıda önizleme yerine direkt indir (masaüstüne kaydedilebilir).
  if(isVideo){
    indirDosya(url, name);
    return;
  }

  if(isOffice && !__fvOverlay){
    indirDosya(url, name);
    return;
  }

  if(!__fvOverlay || !__fvBody || !__fvTitle){
    // Overlay yoksa fallback
    indirDosya(url, name);
    return;
  }

  __fvTitle.textContent = name;
  __fvBody.innerHTML = "";

  if(__fvDownloadBtn){
    __fvDownloadBtn.onclick = () => indirDosya(url, name);
  }

  if(isImage){
    const img = document.createElement("img");
    img.src = url;
    img.alt = name;
    __fvBody.appendChild(img);
  } else if(isVideo){
    // Bu noktaya normalde düşmeyiz (video direkt indiriliyor)
    indirDosya(url, name);
    return;
  } else if(isPdf){
    const iframe = document.createElement("iframe");
    iframe.className = "fv-iframe";
    iframe.src = url;
    iframe.setAttribute("title", name);
    __fvBody.appendChild(iframe);
  } else {
    // Diğer türler: indir veya yeni sekme
    const p = document.createElement("div");
    p.className = "small-text";
    p.textContent = "Bu dosya türü tarayıcıda önizlenemiyor. İndir butonunu kullan.";
    __fvBody.appendChild(p);
  }

  __fvOverlay.classList.remove("hidden");
}

function canViewEkForRecord(k){
  if(!k) return false;
  // Merkez, Stok ve Müdür her zaman görebilir
  if(currentRole === "merkez" || currentRole === "stok" || currentRole === "mudur" || currentRole === "admin") return true;
  // Şube rolünde: sadece ilgili şube (k.sube) veya çıkış deposu (k.cikisDepo) görebilir
  const subeLabel = currentSube || "";
  return (subeLabel && (subeLabel === (k.sube || "") || subeLabel === (k.cikisDepo || "")));
}



function renderVideoLinkInline(k){
  try{
    const link = (k && k.videoLink || "").trim();
    if(!link) return '<span class="muted">-</span>';
    const safe = escapeHtml(link);
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:underline;">Video linki</a>`;
  }catch(e){
    return '<span class="muted">-</span>';
  }
}

function renderEkDosyalar(k){
  if(!k) return "-";
  ensureEkDosyalar(k);
  if(!k.ekDosyalar || !k.ekDosyalar.length) return "-";

  const user = firebase.auth().currentUser;
  const uid = user ? user.uid : null;
  const gorur = canViewEkForRecord(k);

  return k.ekDosyalar.map(function(e, idx){
    var displayName = e.name || ("Ek " + (idx+1));
    var ekId = e.id != null ? e.id : idx;
    var silebilir = (uid && e.uploadedByUid && e.uploadedByUid === uid);
    var href = (e.url || e.dataUrl || "");
    var __t = (e.type || "").toLowerCase();
    var __n = (displayName || "").toLowerCase();
    var __isVideo = (__t.startsWith("video/") || /\.(mp4|mov|mkv|webm)$/.test(__n));

    var base = '<div class="ekdosya-item">';
    base += '<div>';
    base += '<strong>' + displayName + '</strong>';
    if(e.sizeText){ base += ' <span class="small-text">(' + e.sizeText + ')</span>'; }
    base += '</div>';

    if(!href){
      base += '<div class="small-text">(yüklenmedi)</div>';
    } else if(!gorur){
      base += '<div class="small-text">Bu eki indirme yetkiniz yok.</div>';
    } else {
      if(__isVideo){
        base += '<div><button class="secondary" onclick="indirDosya(\'' + __jsStr(href) + '\',\'' + __jsStr(displayName) + '\',\'' + __jsStr(e.storagePath||'') + '\')">İndir</button></div>';
      } else {
        base += '<div><button class="secondary" onclick="openFileViewer(\'' + __jsStr(href) + '\',\'' + __jsStr(e.type||'') + '\',\'' + __jsStr(displayName) + '\')">Aç</button></div>';
      }
    }

    if(silebilir){
      base += ' <button class="secondary ekdosya-delete" onclick="deleteEkDosya(' + k.id + ',\'' + ekId + '\')">Sil</button>';
    }

    base += '</div>';
    return base;
  }).join("");
}

async function deleteEkDosya(kayitId, ekId){
  var kayit = bildirimler.find(function(x){ return x.id === kayitId; });
  if(!kayit) return;
  ensureEkDosyalar(kayit);

  const user = firebase.auth().currentUser;
  const uid = user ? user.uid : null;

  var hedef = null;
  kayit.ekDosyalar.forEach(function(e, idx){
    var curId = e.id != null ? e.id : idx;
    if(String(curId) === String(ekId)) hedef = e;
  });
  if(!hedef) return;

  if(!uid || !hedef.uploadedByUid || hedef.uploadedByUid !== uid){
    showToast("Sadece eki yükleyen kişi silebilir.", "error");
    return;
  }

  if(!confirm("Bu eki silmek istiyor musunuz?")) return;

  // Storage'dan sil
  if(hedef.storagePath && window.storage){
    await window.storage.ref().child(hedef.storagePath).delete();
  }

  kayit.ekDosyalar = kayit.ekDosyalar.filter(function(e, idx){
    var curId = e.id != null ? e.id : idx;
    return String(curId) !== String(ekId);
  });

  // ekler metadata doc'unu da sil (varsa)
  try{
    if(hedef.storageFileId){
      await window.db.collection("ekler").doc(String(hedef.storageFileId)).delete();
    }
  }catch(e){
    console.warn("Ek metadata silinemedi (devam ediyorum):", e);
  }

  try{
    await updateBildirim(kayitId, { ekDosyalar: kayit.ekDosyalar });
    saveLocal();
    showDetail(kayitId);
  }catch(err){
    console.error("deleteEkDosya:", err);
    showToast("Ek silinemedi: " + (err?.message || err), "error");
  }
}

function showDetail(id){
  const k = bildirimler.find(x=>x.id===id);
  if(!k) return;
  selectedId = id;
  if(typeof updateRowSelection === 'function') updateRowSelection();
  __notesAccordionOpen = true;
  const panel = document.getElementById("detayPanel");
  const panelKayseri = document.getElementById("detayPanelKayseri");
  const panelMalkabul = document.getElementById("detayPanelMalkabul");
  const panelGelen = document.getElementById("gelenDetayPanel");
  let malKabulSection = "";

  const isOwnerEditable = (
    (currentRole === "sube"    && k.sube === currentSube) ||
    (currentRole === "kayseri" && k.sube === currentSube) ||
    (currentRole === "malkabul" && ((k.sube || "").toUpperCase().includes("MAL KABUL")))
  );
  let roleControls = "";
  // Toplu seçim yardımcıları (Gelen/Yapılan Bildirimler panellerinde kullanılır)
  const __bulkCount = bulkMerkezSelectedIds.size;
  const __bulkActiveForThis = __bulkCount > 1 && bulkMerkezSelectedIds.has(String(k.id));
  const bulkNoteHtml = (msg) => __bulkActiveForThis
    ? `<div id="bulkSelNote" class="stok-bulk-note">${__bulkCount} kayıt seçili — ${msg}</div>`
    : `<div id="bulkSelNote" class="stok-bulk-note" style="display:none;"></div>`;
  const bulkClearBtn = `<button id="btnClearBulkSel" type="button" class="secondary" onclick="clearBulkMerkezSelection()" style="${__bulkCount > 1 ? "" : "display:none;"}">Seçimi Temizle (${__bulkCount})</button>`;
  if(currentRole === "malkabul"){
    malKabulSection = `
      <div style="margin-top:10px;">
        <label style="font-size:12px;">Mal Kabul Açıklama
          <textarea id="detMalKabulAck" placeholder="Mal Kabul açıklamasını girin">${k.malKabulAck || ""}</textarea>
        </label>
        <div class="small-text">Mal Kabul sadece kendi açıklamasını yazar.</div>
        <div style="margin-top:8px;">
          <button onclick="saveMalKabulAck()">Mal Kabul Açıklamasını Kaydet</button>
        </div>
      </div>
    `;
  }

  if(currentRole === "sube"){
    if(currentPageId === "page-gelen-bildirimler"){
      // Gelen Bildirimler ekranında ilgili şube kendi açıklamasını yazar
      roleControls = `
      <div style="margin-top:6px;">
        <label style="font-size:12px;">İlgili Şube Açıklama <span class="small-text" style="margin-left:6px;">${k.kayseriAckAt ? ("(" + fmtDateTimeTR(k.kayseriAckAt) + ")") : ""}</span>
          <textarea id="detIlgiliSubeAck" placeholder="Şube açıklamasını girin">${k.kayseriAck || ""}</textarea>
        </label>
        ${bulkNoteHtml("kaydettiğinde açıklama ve not seçili tüm kayıtlara yazılır.")}
        <div class="small-text">Çıkış deposu şubeniz olan kayıtlara açıklama ekleyebilirsiniz.</div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button onclick="saveIlgiliSubeAck()">Açıklamayı Kaydet</button>
          ${bulkClearBtn}
        </div>
      </div>
      `;
    } else {
      roleControls = `
      <div class="small-text" style="margin-top:6px;">Durum, mutabakat ve stok açıklaması şube tarafından değiştirilemez.</div>
      ${bulkNoteHtml("Bildirim Sil ile hepsi silinir. Not yazıp \"Notu Kaydet\"e basarsanız not da seçili tüm kayıtlara eklenir.")}
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        ${isOwnerEditable ? `<button class="secondary" data-action="toggle-owner-edit">Düzenle</button>` : ``}
        <button class="secondary" onclick="deleteRecord('Şube')">Bildirim Sil</button>
        ${bulkClearBtn}
      </div>
      `;
    }
  } else if(currentRole === "merkez"){
    const bulkCount = bulkMerkezSelectedIds.size;
    const bulkActiveForThis = bulkCount > 1 && bulkMerkezSelectedIds.has(String(k.id));
    const bulkNote = bulkActiveForThis
      ? `<div id="bulkSelNote" class="small-text" style="margin-top:6px;color:#4338ca;font-weight:600;">${bulkCount} kayıt seçili — kaydettiğinde açıklama ve çıkış deposu değişiklikleri hepsine yazılır.</div>`
      : `<div id="bulkSelNote" class="small-text" style="margin-top:6px;color:#4338ca;font-weight:600;display:none;"></div>`;
    roleControls = `
      <div style="margin-top:6px;">
        <label style="font-size:12px;">Merkez Şube Açıklama <span class="small-text" style="margin-left:6px;">${k.merkezAckAt ? ("(" + fmtDateTimeTR(k.merkezAckAt) + ")") : ""}</span>
          <textarea id="detMerkezAck" placeholder="Merkez açıklamasını girin">${k.merkezAck || ""}</textarea>
        </label>
        ${bulkNote}
        <div class="small-text">Mutabakat durumu stok tarafından güncellenir. Merkez kendi açıklamasını yazar ve gerekirse çıkış deposunu değiştirebilir.</div>
        <div id="bulkSelActions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button onclick="saveMerkezAck()">Merkez Açıklamasını Kaydet</button>
          <button type="button" class="secondary" onclick="toggleMerkezCikisDepoEditor()">Çıkış Deposu Değiştir</button>
          <button id="btnClearBulkSel" type="button" class="secondary" onclick="clearBulkMerkezSelection()" style="${bulkCount > 1 ? "" : "display:none;"}">Seçimi Temizle (${bulkCount})</button>
        </div>
        <div id="merkezCikisDepoEditor" style="display:none;margin-top:10px;max-width:280px;">
          <label style="font-size:12px;">Yeni Çıkış Depo
            <select id="detMerkezCikisDepo">
              <option value="Merkez Depo">Merkez Depo</option>
              <option value="Kayseri Depo">Kayseri Depo</option>
              <option value="İZMİR">İZMİR</option>
              <option value="ANADOLU">ANADOLU</option>
              <option value="TRAKYA">TRAKYA</option>
              <option value="TRF transfer">TRF transfer</option>
              <option value="BURSA">BURSA</option>
              <option value="ANKARA">ANKARA</option>
              <option value="DİYARBAKIR">DİYARBAKIR</option>
              <option value="ANTALYA">ANTALYA</option>
              <option value="KONYA">KONYA</option>
              <option value="ERZURUM">ERZURUM</option>
              <option value="SAMSUN">SAMSUN</option>
              <option value="GAZİANTEP">GAZİANTEP</option>
              <option value="ADANA">ADANA</option>
              <option value="Müşteriden Gelen">Müşteriden Gelen</option>
              <option value="Tedarikçiden Gelen">Tedarikçiden Gelen</option>
              <option value="Sayım / Raf Fazlası">Sayım / Raf Fazlası</option>
              <option value="Merkez Malkabul">Merkez Malkabul</option>
            </select>
          </label>
          <div style="margin-top:8px;">
            <button type="button" onclick="saveMerkezCikisDepo()">Çıkış Deposu Kaydet</button>
          </div>
        </div>
      </div>
    `;
  } else if(currentRole === "kayseri"){
    // Kayseri Depo, kendisine gelen taleplerde açıklama yazar.
    // Kendi oluşturduğu kayıtlarda sadece silme yetkisi olsun (açıklama alanı gösterilmez).
    if(k.sube !== "Kayseri Depo"){
      roleControls = `
      <div style="margin-top:6px;">
        <label style="font-size:12px;">Kayseri Depo Açıklama
          <textarea id="detKayseriAck" placeholder="Kayseri depo açıklamasını girin">${k.kayseriAck || ""}</textarea>
        </label>
        <div class="small-text">Kayseri Depo sadece kendi açıklamasını yazar.</div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
          ${isOwnerEditable ? `<button class="secondary" data-action="toggle-owner-edit">Düzenle</button>` : ``}
          <button onclick="saveKayseriAck()">Kayseri Depo Açıklamasını Kaydet</button>
          <button class="secondary" onclick="deleteRecord('Kayseri Depo')">Bildirim Sil</button>
        </div>
      </div>
      `;
    } else {
      roleControls = `
      <div class="small-text" style="margin-top:6px;">Kayseri Depo kendi oluşturduğu kayıtlarda bazı alanları düzenleyebilir ve silebilir.</div>
      ${bulkNoteHtml("Bildirim Sil ile hepsi silinir. Not yazıp \"Notu Kaydet\"e basarsanız not da seçili tüm kayıtlara eklenir.")}
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        ${isOwnerEditable ? `<button class="secondary" data-action="toggle-owner-edit">Düzenle</button>` : ``}
        <button class="secondary" onclick="deleteRecord('Kayseri Depo')">Bildirim Sil</button>
        ${bulkClearBtn}
      </div>
      `;
    }
  } else if(currentRole === "malkabul"){
    roleControls = `
      <div class="small-text" style="margin-top:6px;">Mal Kabul kendi oluşturduğu kayıtlarda bazı alanları düzenleyebilir ve silebilir.</div>
      ${bulkNoteHtml("Bildirim Sil ile hepsi silinir. Not yazıp \"Notu Kaydet\"e basarsanız not da seçili tüm kayıtlara eklenir.")}
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        ${isOwnerEditable ? `<button class="secondary" data-action="toggle-owner-edit">Düzenle</button>` : ``}
        <button class="secondary" onclick="deleteRecord('Mal Kabul')">Bildirim Sil</button>
        ${bulkClearBtn}
      </div>
    `;
  } else if(currentRole === "stok"){
    roleControls = `
      <div class="stok-islemleri">
        <div class="stok-islemleri-title">Stok İşlemleri</div>
        <div class="stok-islemleri-grid">
          <label class="stok-field">Durum
            <select id="detDurum">
              <option value="Açık">Açık</option>
              <option value="İnceleniyor">İnceleniyor</option>
              <option value="Kapandı">Kapandı</option>
            </select>
          </label>
          <label class="stok-field">Mutabakat Durumu
            <select id="detMutabakat">
              <option value="Beklemede">Beklemede</option>
              <option value="Görüşülüyor">Görüşülüyor</option>
              <option value="Mutabık">Mutabık</option>
              <option value="Mutabık Değil">Mutabık Değil</option>
            </select>
          </label>
          <label class="stok-field stok-field-full">Stok Açıklama
            <select id="detStokAck">
              <option value="">Seçiniz</option>
              ${STOK_KATEGORILERI.map(s=>`<option value="${s}">${s}</option>`).join("")}
            </select>
          </label>
          <label class="stok-field stok-field-full">Çıkış Depo
            <select id="detCikisDepo">
              <option value="Merkez Depo">Merkez Depo</option>
              <option value="Kayseri Depo">Kayseri Depo</option>
<option value="İZMİR">İZMİR</option>
<option value="ANADOLU">ANADOLU</option>
<option value="TRAKYA">TRAKYA</option>
<option value="TRF transfer">TRF transfer</option>
<option value="BURSA">BURSA</option>
<option value="ANKARA">ANKARA</option>
<option value="DİYARBAKIR">DİYARBAKIR</option>
<option value="ANTALYA">ANTALYA</option>
<option value="KONYA">KONYA</option>
<option value="ERZURUM">ERZURUM</option>
<option value="SAMSUN">SAMSUN</option>
<option value="GAZİANTEP">GAZİANTEP</option>
<option value="ADANA">ADANA</option>

              <option value="Müşteriden Gelen">Müşteriden Gelen</option>
              <option value="Tedarikçiden Gelen">Tedarikçiden Gelen</option>
              <option value="Sayım / Raf Fazlası">Sayım / Raf Fazlası</option>
              <option value="Merkez Malkabul">Merkez Malkabul</option>
            </select>
          </label>
        </div>
        <div class="small-text stok-islemleri-hint">Merkez açıklamasına stok müdahale edemez.</div>
        ${(() => {
          const bulkCount = bulkMerkezSelectedIds.size;
          const bulkActiveForThis = bulkCount > 1 && bulkMerkezSelectedIds.has(String(k.id));
          return bulkActiveForThis
            ? `<div id="bulkSelNote" class="stok-bulk-note">${bulkCount} kayıt seçili — kaydettiğinde Durum, Mutabakat, Stok Açıklama ve Çıkış Depo değerleri hepsine yazılır.</div>`
            : `<div id="bulkSelNote" class="stok-bulk-note" style="display:none;"></div>`;
        })()}
        <div class="stok-islemleri-actions">
          <button onclick="saveStokChanges()">Değişiklikleri Kaydet</button>
          <button class="secondary" onclick="deleteRecord('Stok')">Bildirim Sil</button>
          <button id="btnClearBulkSel" type="button" class="secondary" onclick="clearBulkMerkezSelection()" style="${bulkMerkezSelectedIds.size > 1 ? "" : "display:none;"}">Seçimi Temizle (${bulkMerkezSelectedIds.size})</button>
        </div>
      </div>
    `;
  }

  
  const notlarHTML = (k.notlar && k.notlar.length)
    ? k.notlar.map(n=>{
        let cls = "note-rol-diger";
        if(n.yazan === "Merkez") cls = "note-rol-merkez";
        else if(n.yazan === "Stok") cls = "note-rol-stok";
        else cls = "note-rol-sube";

        let ekHtml = "";
        if(Array.isArray(n.ekler) && n.ekler.length){
          const items = n.ekler.map((e)=>{
            const safeName = (e && e.name) ? e.name : "ek";
            const url = e && (e.url || e.dataUrl);
            if(url){
              const __t = (e.type||'').toLowerCase();
              const __n = (safeName||'').toLowerCase();
              const __isVideo = (__t.startsWith('video/') || /\.(mp4|mov|mkv|webm)$/.test(__n));
              if(__isVideo){
                return `<button class="btn-mini" onclick="indirDosya('${__jsStr(url)}','${__jsStr(safeName)}')">İndir: ${escapeHtml(safeName)}</button>`;
              }
              return `<button class="btn-mini" onclick="openFileViewer('${__jsStr(url)}','${__jsStr((e.type||''))}','${__jsStr(safeName)}')">Aç: ${escapeHtml(safeName)}</button>`;
            }
            return `<span class="small-text">(Ek: ${escapeHtml(safeName)} yüklenemedi)</span>`;
          }).join(" ");
          ekHtml = `<div style="margin-top:6px;">${items}</div>`;
        } else if(n.ek && n.ekDataUrl){
          const __t = (n.ekType||'').toLowerCase();
          const __n = (n.ek||'').toLowerCase();
          const __isVideo = (__t.startsWith('video/') || /\.(mp4|mov|mkv|webm)$/.test(__n));
          if(__isVideo){
            ekHtml = `<div style="margin-top:6px;"><button class="btn-mini" onclick="indirDosya('${__jsStr(n.ekDataUrl)}','${__jsStr(n.ek)}')">İndir: ${escapeHtml(n.ek)}</button></div>`;
          } else {
            ekHtml = `<div style="margin-top:6px;"><button class="btn-mini" onclick="openFileViewer('${__jsStr(n.ekDataUrl)}','${__jsStr(n.ekType||'')}','${__jsStr(n.ek)}')">Aç: ${escapeHtml(n.ek)}</button></div>`;
          }
        } else if(n.ek){
          ekHtml = `<div class="small-text" style="margin-top:6px;">(Ek: ${escapeHtml(n.ek)})</div>`;
        }

        return `<div class="note-item ${cls}">
  <div class="note-meta"><strong>${escapeHtml(n.yazan || "")}</strong> - ${escapeHtml(n.tarih || "")}</div>
  <div class="note-text">${linkifyText(n.metin || "")}</div>
  ${ekHtml}
</div>`;
      }).join("")
    : "<div class='small-text'>Henüz not yok.</div>";

  const notlarHTMLWithMalkabul = notlarHTML + malKabulSection;

    const kayseriAckLine = "";
const detailHtml = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div>
        <strong>${k.parti} – ${k.sube}</strong><br>
        <span class="small-text">${negatifPozitifBadgeHTML(k)} ${escapeHtml(k.tarih || "")} • ${escapeHtml(k.urun || "")} – ${escapeHtml(k.urunAck || "-")}</span>
      </div>
      ${durumBadgeHTML(k.durum)}
    </div>
    <div class="small-text" style="display:flex;gap:24px;margin-bottom:10px;flex-wrap:wrap;">
      <div>
        <div><strong>Şube:</strong> ${k.sube}</div>
        <div><strong>Çıkış Depo:</strong> ${k.cikisDepo || "-"}</div>
        <div><strong>Eksik / Fazla:</strong> Eksik: ${k.eksik} • Fazla: ${k.fazla}</div>
        <div><strong>Şube Açıklaması:</strong>
          <div class="ack-box">${escapeHtml(k.subeAck || "-")}</div>
        </div>
      </div>
      <div>
        ${kayseriAckLine}
        <div><strong>Mutabakat:</strong> ${mutabakatBadgeHTML(k.mutabakat)}</div>
        <div><strong>Ek Dosya:</strong> ${renderEkDosyalar(k)}</div>

      </div>
    </div>
    ${negatifPozitifDetayHTML(k)}
    ${roleControls}
    <div id="ownerEditPanel" class="card" style="display:none;margin-top:10px;padding:8px 10px;border-radius:8px;background:#f8fafc;">
      <strong>Bildirim Düzenleme</strong>
      <p class="small-text">Şube, Kayseri Depo ve Mal Kabul kendi oluşturduğu bildirimde bazı alanları ve çıkış deposunu güncelleyebilir.</p>
      <div class="small-text" style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px;">
        
        <div style="min-width:200px;">
          <label style="font-size:12px;">Çıkış Depo
            <select id="editCikisDepo">
              ${["Merkez Depo","Kayseri Depo","İZMİR","ANADOLU","TRAKYA","TRF transfer","BURSA","ANKARA","DİYARBAKIR","ANTALYA","KONYA","ERZURUM","SAMSUN","GAZİANTEP","ADANA","Müşteriden Gelen","Tedarikçiden Gelen","Sayım / Raf Fazlası","Merkez Malkabul"]
                .concat((k.cikisDepo && !["Merkez Depo","Kayseri Depo","İZMİR","ANADOLU","TRAKYA","TRF transfer","BURSA","ANKARA","DİYARBAKIR","ANTALYA","KONYA","ERZURUM","SAMSUN","GAZİANTEP","ADANA","Müşteriden Gelen","Tedarikçiden Gelen","Sayım / Raf Fazlası","Merkez Malkabul"].includes(k.cikisDepo)) ? [k.cikisDepo] : [])
                .map(d=>`<option value="${escapeHtml(d)}" ${k.cikisDepo === d ? "selected" : ""}>${escapeHtml(d)}</option>`).join("")}
            </select>
          </label>
        </div>
        <div style="min-width:160px;">
          <label style="font-size:12px;">Parti / Sevk No
            <input id="editParti" value="${k.parti || ""}">
          </label>
        </div>
        <div style="min-width:200px;">
          <label style="font-size:12px;">${isNegatifPozitifKayit(k) ? "Gelmesi Gereken Ürün" : "Ürün"}
            <input id="editUrun" value="${k.urun || ""}">
          </label>
        </div>
        <div style="min-width:220px;">
          <label style="font-size:12px;">Ürün Açıklama
            <input id="editUrunAck" value="${k.urunAck || ""}">
          </label>
        </div>
        ${isNegatifPozitifKayit(k) ? `
        <div style="min-width:220px;">
          <label style="font-size:12px;">Gelmesi Gereken Ürün
            <input id="editBeklenenUrun" value="${k.beklenenUrun || ""}">
          </label>
        </div>
        <div style="min-width:220px;">
          <label style="font-size:12px;">Gelen Ürün
            <input id="editGelenUrun" value="${k.gelenUrun || ""}">
          </label>
        </div>` : ``}
      </div>
      <div class="small-text" style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px;">
        <div style="min-width:120px;">
          <label style="font-size:12px;">Eksik Adet
            <input id="editEksik" type="number" min="0" value="${k.eksik || 0}">
          </label>
        </div>
        <div style="min-width:120px;">
          <label style="font-size:12px;">Fazla Adet
            <input id="editFazla" type="number" min="0" value="${k.fazla || 0}">
          </label>
        </div>
      </div>
      <button onclick="saveSubeEdit(this)">Değişiklikleri Kaydet</button>
    </div>
    <hr style="margin:12px 0;">
    <h3 style="margin:10px 0 6px;">Notlar & Ekler</h3>
    <p class="small-text" style="margin-top:0;">Şube, merkez ve stok arası yazışmalar.</p>
    <div id="notListesi">${notlarHTMLWithMalkabul}</div>
    <div style="margin-top:10px;">
      <label>Yeni not ekle
        <textarea id="yeniNot" placeholder="Mesajı yazın"></textarea>
      </label>
      ${currentRole === "stok" ? `` : `<button onclick="addNote(this)" style="margin-top:8px;">Notu Kaydet</button>`}
      <label>Ek Dosya (PDF, Excel, Görsel)
        <input type="file" id="yeniNotEk" multiple accept="image/*,application/pdf,.xls,.xlsx,.csv">
      <div id="noteUploadProgressWrap" class="upload-progress hidden" aria-live="polite" style="margin-top:6px;">
        <div id="noteUploadProgressBar" class="upload-progress-bar"></div>
        <div id="noteUploadProgressText" class="upload-progress-text"></div>
      </div>
      </label>
      <div class="field" style="margin-top:8px;">
        <label>Video Dosyası</label>
        <div id="detVideoLinks" data-video-links-wrap class="small-text" style="margin-top:6px;"></div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">
          <input id="detVideoLinkInput" data-video-link-input type="url" placeholder="https://..." style="min-width:260px;flex:1;" />
          <button type="button" data-video-link-add>Link Ekle</button>
        </div>
        <div class="small-text" style="margin-top:6px;opacity:.85;">En fazla 6 link eklenebilir.</div>
      </div>
    </div>
  `;
  if(currentPageId === "page-gelen-bildirimler" && currentRole === "sube"){
    // Şube Gelen Bildirimler ekranı: detayları gelenDetayPanel'de göster
    if(panelGelen) panelGelen.innerHTML = detailHtml;
    if(panel) panel.innerHTML = "";
    if(panelKayseri) panelKayseri.innerHTML = "";
    if(panelMalkabul) panelMalkabul.innerHTML = "";

    // Video link UI'yi aktif panel içine bağla
    try{ bindDetailVideoLinkUI(panelGelen, k); }catch(e){}
  } else if(currentRole === "kayseri" && currentPageId === "page-kayseri-yapilan"){
    // Kayseri'nin kendi yaptığı bildirimler sayfası
    if(panelKayseri) panelKayseri.innerHTML = detailHtml;
    if(panel) panel.innerHTML = "";
    if(panelMalkabul) panelMalkabul.innerHTML = "";

    try{ bindDetailVideoLinkUI(panelKayseri, k); }catch(e){}
  } else if(currentRole === "malkabul" && currentPageId === "page-malkabul-yapilan"){
    // Merkez Malkabul'ün kendi yaptığı bildirimler sayfası
    if(panelMalkabul) panelMalkabul.innerHTML = detailHtml;
    if(panel) panel.innerHTML = "";
    if(panelKayseri) panelKayseri.innerHTML = "";

    try{ bindDetailVideoLinkUI(panelMalkabul, k); }catch(e){}
  } else {
    // Diğer tüm sayfalarda standart detay paneli kullan
    if(panel) panel.innerHTML = detailHtml;

    try{ bindDetailVideoLinkUI(panel, k); }catch(e){}

    if(panelKayseri) panelKayseri.innerHTML = "";
    if(panelMalkabul) panelMalkabul.innerHTML = "";
  }


  if(currentRole === "stok"){
    const detCikisDepo = document.getElementById("detCikisDepo");
    if(detCikisDepo && k.cikisDepo){ detCikisDepo.value = k.cikisDepo; }
    const selD = document.getElementById("detDurum");
    const selM = document.getElementById("detMutabakat");
    const selS = document.getElementById("detStokAck");
    if(selD) selD.value = k.durum || "Açık";
    if(selM) selM.value = k.mutabakat || "Beklemede";
    if(selS && k.stokAck) selS.value = k.stokAck;
  }

  const ownerPanel = document.getElementById("ownerEditPanel");
  if(ownerPanel){
    ownerEditVisible = false;
    ownerPanel.style.display = "none";
  }
}
function refreshKayseriYapilanTable(){
  const tbody = document.getElementById("tblKayseriYapilan");
  if(!tbody) return;
  tbody.innerHTML = "";

  // Sadece Kayseri Depo tarafından oluşturulan kayıtlar (Şube = Kayseri Depo)
  // Özel çıkış depo tipleri bu listede gösterilmez
  const data = bildirimler.filter(k =>
    k.sube === "Kayseri Depo" && !SPECIAL_CIKIS_DEPOLAR.includes(k.cikisDepo || "")
  );

  data.forEach(k=>{
    const tr = document.createElement("tr");
    tr.dataset.id = k.id;
    if(selectedId && String(selectedId) === String(k.id)) tr.classList.add('row-selected');
    const bulkChecked = bulkMerkezSelectedIds.has(String(k.id));
    tr.innerHTML = `
      <td class="bulk-select-col"><input type="checkbox" class="bulk-check" ${bulkChecked ? "checked" : ""} onclick="event.stopPropagation()" onchange="toggleBulkMerkezSelection('${k.id}', this.checked)"/></td>
      <td>${k.tarih}</td>
      <td>${k.sube}</td>
      <td>${k.cikisDepo || "-"}</td>
      <td>${k.parti}</td>
      <td>${renderNegatifPozitifUrunHTML(k, escapeHtml(k.urun || ""))}</td>
      <td>${k.urunAck || "-"}</td>
      <td>${k.eksik}</td>
      <td>${k.fazla}</td>
      <td>${durumBadgeHTML(k.durum)}</td>
      <td>${mutabakatBadgeHTML(k.mutabakat)}</td>
      <td>${k.stokAck || "-"}</td>
      <td class="col-kayseri-ack">${k.kayseriAck || "-"}</td>
    `;
    tr.addEventListener("click", ()=>{ showDetail(k.id); updateRowSelection(); });
    tbody.appendChild(tr);
  });

function refreshMalkabulYapilanTable(){
  const tbody = document.getElementById("tblMalkabulYapilan");
  if(!tbody) return;
  tbody.innerHTML = "";

  // Sadece Merkez Malkabul tarafından oluşturulan kayıtlar (Şube içinde 'MAL KABUL' geçenler)
  const data = bildirimler.filter(k => {
    const s = (k.sube || "").toUpperCase();
    return s.includes("MAL KABUL");
  });

  data.forEach(k=>{
    const tr = document.createElement("tr");
    tr.dataset.id = k.id;
    if(selectedId && String(selectedId) === String(k.id)) tr.classList.add('row-selected');
    const bulkChecked = bulkMerkezSelectedIds.has(String(k.id));
    tr.innerHTML = `
      <td class="bulk-select-col"><input type="checkbox" class="bulk-check" ${bulkChecked ? "checked" : ""} onclick="event.stopPropagation()" onchange="toggleBulkMerkezSelection('${k.id}', this.checked)"/></td>
      <td>${k.tarih}</td>
      <td>${k.sube}</td>
      <td>${k.cikisDepo || "-"}</td>
      <td>${k.parti}</td>
      <td>${renderNegatifPozitifUrunHTML(k, escapeHtml(k.urun || ""))}</td>
      <td>${k.urunAck || "-"}</td>
      <td>${k.eksik}</td>
      <td>${k.fazla}</td>
      <td>${durumBadgeHTML(k.durum)}</td>
      <td>${mutabakatBadgeHTML(k.mutabakat)}</td>
      <td>${k.stokAck || "-"}</td>
      <td class="col-kayseri-ack">${k.kayseriAck || "-"}</td>
    `;
    tr.addEventListener("click", ()=>{ showDetail(k.id); updateRowSelection(); });
    tbody.appendChild(tr);
  });
}


window.refreshMalkabulYapilanTable = refreshMalkabulYapilanTable;
}


async function saveMerkezAck(){
  if(selectedId == null) return;
  const k = bildirimler.find(x=>x.id===selectedId);
  if(!k) return;
  const ta = document.getElementById("detMerkezAck");
  if(!ta) return;
  const val = ta.value.trim();

  const bulkActive = bulkMerkezSelectedIds.size > 1 && bulkMerkezSelectedIds.has(String(selectedId));
  const targetIds = bulkActive ? Array.from(bulkMerkezSelectedIds) : [selectedId];
  if(bulkActive && !confirm(targetIds.length + " kayda aynı açıklama yazılacak. Devam edilsin mi?")) return;

  try{
    const stamp = () => (window.FieldValue || firebase.firestore.FieldValue).serverTimestamp();
    await Promise.all(targetIds.map(async (id)=>{
      const rec = bildirimler.find(x=>String(x.id)===String(id));
      if(!rec) return;
      const patch = { merkezAck: val, merkezAckAt: stamp() };
      if(val && !rec.firstResponseAt) patch.firstResponseAt = stamp();
      await updateBildirim(rec.id, patch);
      rec.merkezAck = val;
      rec.merkezAckAt = new Date();
    }));
    saveLocal();
    if(bulkActive){
      showToast(targetIds.length + " kayda açıklama kaydedildi.", "success");
      exitBulkSelectMode();
    }
    refreshTable();
    showDetail(selectedId);
  }catch(err){
    console.error("saveMerkezAck:", err);
    showToast("Kaydedilemedi: " + (err?.message || err), "error");
  }
}



function toggleMerkezCikisDepoEditor(){
  const wrap = document.getElementById("merkezCikisDepoEditor");
  if(!wrap) return;
  const willOpen = wrap.style.display === "none" || !wrap.style.display;
  wrap.style.display = willOpen ? "block" : "none";
  if(willOpen){
    const k = bildirimler.find(x=>x.id===selectedId);
    const sel = document.getElementById("detMerkezCikisDepo");
    if(k && sel) sel.value = k.cikisDepo || "Merkez Depo";
  }
}

async function saveMerkezCikisDepo(){
  if(selectedId == null) return;
  const k = bildirimler.find(x=>x.id===selectedId);
  if(!k) return;
  const sel = document.getElementById("detMerkezCikisDepo");
  if(!sel) return;
  const yeniDepo = (sel.value || "").trim();
  if(!yeniDepo) return;

  const bulkActive = bulkMerkezSelectedIds.size > 1 && bulkMerkezSelectedIds.has(String(selectedId));
  const targetIds = bulkActive ? Array.from(bulkMerkezSelectedIds) : [selectedId];
  if(bulkActive && !confirm(targetIds.length + " kaydın çıkış deposu \"" + yeniDepo + "\" olarak değiştirilecek. Devam edilsin mi?")) return;

  try{
    const stamp = () => (window.FieldValue || firebase.firestore.FieldValue).serverTimestamp();
    await Promise.all(targetIds.map(async (id)=>{
      const rec = bildirimler.find(x=>String(x.id)===String(id));
      if(!rec) return;
      await updateBildirim(rec.id, { cikisDepo: yeniDepo, merkezCikisDepoChangedAt: stamp() });
      rec.cikisDepo = yeniDepo;
      rec.merkezCikisDepoChangedAt = new Date();
    }));
    saveLocal();
    showToast(bulkActive ? (targetIds.length + " kaydın çıkış deposu güncellendi.") : "Çıkış deposu güncellendi.", "success");
    if(bulkActive){
      exitBulkSelectMode();
    }
    refreshTable();
    showDetail(selectedId);
  }catch(err){
    console.error("saveMerkezCikisDepo:", err);
    showToast("Çıkış deposu güncellenemedi: " + (err?.message || err), "error");
  }
}

async function saveStokChanges(){
  if(selectedId == null) return;
  const k = bildirimler.find(x=>x.id===selectedId);
  if(!k) return;
  const selD = document.getElementById("detDurum");
  const selM = document.getElementById("detMutabakat");
  const selS = document.getElementById("detStokAck");
  const selC = document.getElementById("detCikisDepo");

  // Paneldeki ortak yeni değerler (tüm seçili kayıtlara aynısı yazılacak)
  const common = {};
  if(selD) common.durum = selD.value;
  if(selM) common.mutabakat = selM.value;
  if(selS) common.stokAck = selS.value;
  if(selC) common.cikisDepo = selC.value;

  const user = (firebase && firebase.auth) ? firebase.auth().currentUser : null;
  const actorEmail = ((user && user.email) || "").trim();
  const actorName = (currentUserName || "").trim();
  const actorUid = user ? user.uid : null;
  const ts = () => (window.FieldValue || firebase.firestore.FieldValue).serverTimestamp();

  // "Notu Kaydet" ile aynı işi tek butonda yapmak için: not alanında metin
  // ya da ek dosya varsa, bu kaydetme sırasında not olarak da eklenir.
  const scope = document.getElementById("detayPanel") || document;
  const noteTa = scope.querySelector("#yeniNot");
  const noteEkInput = scope.querySelector("#yeniNotEk");
  const noteText = noteTa ? (noteTa.value || "").trim() : "";
  const noteHasFile = !!(noteEkInput && noteEkInput.files && noteEkInput.files.length);
  const willAddNote = !!(noteText || noteHasFile);
  let noteObj = null; // ekler yüklendikten sonra try içinde doldurulur

  const bulkActive = bulkMerkezSelectedIds.size > 1 && bulkMerkezSelectedIds.has(String(selectedId));
  const targetIds = bulkActive ? Array.from(bulkMerkezSelectedIds) : [selectedId];
  if(bulkActive){
    const msg = targetIds.length + " kayda aynı Durum / Mutabakat / Stok Açıklama / Çıkış Depo"
      + (willAddNote ? " değerleri ve not" : " değerleri") + " yazılacak. Devam edilsin mi?";
    if(!confirm(msg)) return;
  }

  // Not için indirme yetkisi (ekler)
  const MERKEZ_SUBE_ADI = "Merkez Malkabu";
  const noteAllowedSubes = Array.from(new Set([k.sube, k.cikisDepo, MERKEZ_SUBE_ADI].filter(Boolean)));

  // Her kayıt için patch'i o kaydın kendi eski değerine göre hesapla (metadata
  // damgaları — kim/ne zaman değiştirdi — kayda özel olmalı).
  const buildPatch = (rec) => {
    const patch = Object.assign({}, common);
    if(willAddNote && noteObj){
      if(!rec.notlar) rec.notlar = [];
      ensureEkDosyalar(rec);
      const newNotlar = (rec.notlar || []).slice();
      newNotlar.push(noteObj);
      patch.notlar = newNotlar;
      if(Array.isArray(noteObj.ekler) && noteObj.ekler.length){
        patch.ekDosyalar = (rec.ekDosyalar || []).slice().concat(noteObj.ekler);
      }
    }
    if(currentRole === "stok" && actorEmail){
      patch.stokLastActorUid = actorUid;
      patch.stokLastActorEmail = actorEmail;
      patch.stokLastActorName = actorName;
      patch.stokLastActionAt = ts();

      const oldStokAck = (rec.stokAck == null ? "" : String(rec.stokAck));
      const newStokAck = (patch.stokAck == null ? oldStokAck : String(patch.stokAck));
      if(newStokAck !== oldStokAck){
        patch.stokAckByUid = actorUid;
        patch.stokAckByEmail = actorEmail;
        patch.stokAckByName = actorName;
        patch.stokAckAt = ts();
      }

      const oldDurum = (rec.durum == null ? "" : String(rec.durum));
      const newDurum = (patch.durum == null ? oldDurum : String(patch.durum));
      if(newDurum !== oldDurum){
        patch.durumChangedByUid = actorUid;
        patch.durumChangedByEmail = actorEmail;
        patch.durumChangedByName = actorName;
        patch.durumChangedAt = ts();
        if(newDurum === "Kapandı"){
          patch.closedByUid = actorUid;
          patch.closedByEmail = actorEmail;
          patch.closedByName = actorName;
          patch.closedAt = ts();
          if(!rec.firstResponseAt) patch.firstResponseAt = ts();
        }
      }
    }
    return patch;
  };

  try{
    // Not varsa: ekleri bir kez yükle ve not objesini oluştur (aynı obje tüm
    // seçili kayıtlara yazılır — buildPatch içinde kullanılıyor).
    if(willAddNote){
      let eklerList = [];
      if(noteHasFile){
        window.setUILoading && setUILoading(true, { btnIds: [] });
        eklerList = await uploadEkDosyalarToStorage(Array.from(noteEkInput.files), String(selectedId), "stok", noteAllowedSubes, { wrapId: "noteUploadProgressWrap", barId: "noteUploadProgressBar", textId: "noteUploadProgressText" });
      }
      noteObj = {
        yazan: "Stok",
        tarih: new Date().toLocaleString("tr-TR"),
        metin: noteText,
        ek: (eklerList && eklerList.length) ? (eklerList[0].name || "") : "",
        ekler: (eklerList && eklerList.length) ? eklerList : []
      };
    }

    await Promise.all(targetIds.map(async (id)=>{
      const rec = bildirimler.find(x=>String(x.id)===String(id));
      if(!rec) return;
      const patch = buildPatch(rec);
      await updateBildirim(rec.id, patch);
      Object.assign(rec, patch);
    }));
    saveLocal();
    if(noteTa) noteTa.value = "";
    if(noteEkInput) noteEkInput.value = "";
    if(bulkActive){
      showToast(targetIds.length + " kayıt güncellendi" + (willAddNote ? " (not dahil)" : "") + ".", "success");
      exitBulkSelectMode();
    } else if(willAddNote){
      showToast("Değişiklikler ve not kaydedildi.", "success");
    }
    refreshTable();
    showDetail(selectedId);
  }catch(err){
    console.error("saveStokChanges:", err);
    showToast("Kaydedilemedi: " + (err?.message || err), "error");
  }finally{
    window.setUILoading && setUILoading(false);
  }
}

// ------------------------
// Video Linkleri (En fazla 6)
// ------------------------
function normalizeVideoLinks(k){
  // Yeni yapı: k.videoLinks = [{ url, addedByUid, addedByRole, addedByName, addedAtMs }]
  // Geriye dönük: k.videoLink (string)
  let arr = Array.isArray(k && k.videoLinks) ? k.videoLinks.slice() : [];
  // legacy alan varsa ve listede yoksa ilk elemana ekle
  const legacy = (k && typeof k.videoLink === "string" ? k.videoLink.trim() : "");
  if(legacy){
    const exists = arr.some(x => (x && (x.url||"").trim()) === legacy);
    if(!exists){
      arr.unshift({ url: legacy, addedByUid: k.createdByUid || null, addedByRole: k.createdByRole || null, addedByName: k.createdByName || null, addedAtMs: null, __legacy: true });
    }
  }
  // url boş olanları temizle
  arr = arr.filter(x => x && (x.url||"").trim());
  // max 6
  if(arr.length > 6) arr = arr.slice(0,6);
  return arr;
}

// Video linkleri detay panelinde birden fazla farklı container içinde render edilebiliyor.
// Bu yüzden global id ile değil, verilen wrapper element içine render ediyoruz.
function renderVideoLinksDetailInto(wrap, k){
  if(!wrap) return;
  const user = (firebase && firebase.auth) ? firebase.auth().currentUser : null;
  const uid = user ? user.uid : null;
  const links = normalizeVideoLinks(k);

  if(!links.length){
    wrap.innerHTML = "<div class='small-text' style='opacity:.8;'>Henüz video linki eklenmedi.</div>";
    return;
  }

  let html = "";
  links.forEach((item, i) => {
    if(!item || !item.url) return;
    const label = `Video linki ${i+1}`;
    const safe = escapeHtml(item.url);
    const canRemove = uid && item.addedByUid && uid === item.addedByUid;
    html += `
      <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;padding:6px 8px;border:1px solid #e6e6e6;border-radius:8px;margin-bottom:6px;">
        <div style="display:flex;gap:10px;align-items:center;min-width:0;">
          <span style="font-weight:600;min-width:110px;">${label}</span>
          <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            🔗 <a href="${safe}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:underline;">Linki aç</a>
          </span>
        </div>
        ${canRemove ? `<button type="button" onclick="removeVideoLinkFromDetail(${i})" style="background:#d93025;color:#fff;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;">Kaldır</button>` : ""}
      </div>
    `;
  });
  wrap.innerHTML = html;
}

// Geriye dönük: eski çağrıları bozmamak için (tek id'li wrapper varsa) yine çalışsın.
function renderVideoLinksDetail(k){
  const wrap = document.getElementById("detVideoLinks");
  if(!wrap) return;
  renderVideoLinksDetailInto(wrap, k);
}

// Detay paneli DOM'u her sayfa geçişinde yeniden basıldığı için,
// video link input/button eventlerini de *aktif panelin içine* bağlarız.
function bindDetailVideoLinkUI(activePanelEl, k){
  if(!activePanelEl || !k) return;
  const wrap = activePanelEl.querySelector('[data-video-links-wrap]') || activePanelEl.querySelector('#detVideoLinks');
  const input = activePanelEl.querySelector('[data-video-link-input]') || activePanelEl.querySelector('#detVideoLinkInput');
  const btn = activePanelEl.querySelector('[data-video-link-add]');

  // Render list
  try{ renderVideoLinksDetailInto(wrap, k); }catch(e){}

  // Re-bind add button (inline onclick yerine burada bağlıyoruz)
  if(btn){
    btn.onclick = async function(){
      const url = (input && input.value ? String(input.value) : '').trim();
      try{
        await addVideoLinkToRecord(k.id, url);
        if(input) input.value = '';
        // Listeyi anında güncelle
        try{ renderVideoLinksDetailInto(wrap, k); }catch(e){}
        showToast('Video linki eklendi.', 'success');
      }catch(err){
        showToast((err?.message || err), 'error');
      }
    };
  }
}

async function addVideoLinkToRecord(recordId, url){
  const link = (url || "").trim();
  if(!link) throw new Error("Link boş olamaz.");
  if(!/^https?:\/\/.+$/i.test(link)) throw new Error("Geçerli bir link giriniz.");

  const k = bildirimler.find(x=>x.id===recordId);
  if(!k) throw new Error("Kayıt bulunamadı.");

  const user = (firebase && firebase.auth) ? firebase.auth().currentUser : null;
  const uid = user ? user.uid : null;

  const existing = normalizeVideoLinks(k);
  if(existing.length >= 6) throw new Error("En fazla 6 video linki ekleyebilirsin.");
  if(existing.some(x => (x.url||"").trim() === link)) throw new Error("Bu link zaten ekli.");

  const item = {
    url: link,
    addedByUid: uid,
    addedByRole: currentRole || null,
    addedByName: (currentRole === "sube" ? currentSube : currentRole) || null,
    addedAtMs: Date.now()
  };
  const newLinks = existing.concat([item]);
  const patch = { videoLinks: newLinks };

  await updateBildirim(recordId, patch);
  k.videoLinks = newLinks;
  saveLocal();
}

async function addVideoLinkFromDetail(btnEl){
  if(selectedId == null) return;
  // Sayfalar arası geçişlerde aynı ID'li input farklı panellerde birden fazla kez oluşabiliyor.
  // querySelector ilk bulduğunu döndürdüğü için (çoğu zaman boş olanı) "Link boş olamaz" hatası alıyorduk.
  // Bu yüzden butonun *yanındaki* input'u hedefliyoruz.
  let input = null;
  try{
    if(btnEl && btnEl.closest){
      const row = btnEl.closest('div');
      if(row) input = row.querySelector('input[type="url"], input#detVideoLinkInput');
    }
  }catch(e){}
  if(!input){
    // Fallback: aktif detail panel içindeki input
    const activePanel = document.querySelector('#detayPanel, #gelenDetayPanel, #kayseriDetayPanel, #malkabulDetayPanel');
    if(activePanel) input = activePanel.querySelector('#detVideoLinkInput');
  }
  if(!input){
    // son çare
    input = document.getElementById('detVideoLinkInput');
  }
  const url = (input && input.value ? String(input.value) : "").trim();
  try{
    await addVideoLinkToRecord(selectedId, url);
    if(input) input.value = "";
    showDetail(selectedId);
    showToast("Video linki eklendi.", "success");
  }catch(err){
    showToast((err?.message || err), "error");
  }
}

async function removeVideoLinkFromDetail(index){
  if(selectedId == null) return;
  const k = bildirimler.find(x=>x.id===selectedId);
  if(!k) return;

  const user = (firebase && firebase.auth) ? firebase.auth().currentUser : null;
  const uid = user ? user.uid : null;

  const links = normalizeVideoLinks(k);
  const item = links[index];
  if(!item){
    showToast("Link bulunamadı.", "error");
    return;
  }

  if(!uid || !item.addedByUid || uid !== item.addedByUid){
    showToast("Sadece linki ekleyen kaldırabilir.", "error");
    return;
  }

  const newLinks = links.slice();
  newLinks.splice(index,1);
  try{
    // Backward-compat:
    // Some older records still have the legacy single-link fields (videoLink, videoLinkAddedByUid, ...).
    // UI normalizes those into the list, but if we only update videoLinks, the legacy field would
    // continue to re-appear on next render. So we also clear the legacy fields.
    await updateBildirim(selectedId, {
      videoLinks: newLinks,
      videoLink: null,
      videoLinkAddedByUid: null,
      videoLinkAddedAtMs: null
    });
    k.videoLinks = newLinks;
    // also clear local legacy fields to avoid re-adding it during normalization
    k.videoLink = null;
    k.videoLinkAddedByUid = null;
    k.videoLinkAddedAtMs = null;
    saveLocal();
    showDetail(selectedId);
    showToast("Video linki kaldırıldı.", "success");
  }catch(err){
    console.error("removeVideoLinkFromDetail:", err);
    showToast("Kaldırılamadı: " + (err?.message || err), "error");
  }
}


async function addNote(btn){
  if(selectedId == null) return;
  const k = bildirimler.find(x=>x.id===selectedId);
  if(!k) return;

  const scope = (() => { try { return btn ? (btn.closest("#detayPanel, #gelenDetayPanel, #detayPanelKayseri, #detayPanelMalkabul") || btn.closest(".page")) : null; } catch(e) { return null; } })() || document.getElementById(currentPageId) || document;
  const ta = scope.querySelector("#yeniNot");
  const ekInput = scope.querySelector("#yeniNotEk");
  if(!ta){
    showToast("Not alanı bulunamadı.", "error");
    return;
  }

  const raw = (ta.value || "").trim();

  const hasFile = !!(ekInput && ekInput.files && ekInput.files.length);

  // Eğer kullanıcı not alanına sadece link yapıştırdıysa (ve ek dosya yoksa),
  // bunu not olarak değil video linki olarak kaydedelim.
  const rawIsOnlyUrl = !hasFile && raw && /^https?:\/\/.+$/i.test(raw) && raw.trim() === raw;
  if(rawIsOnlyUrl){
    // Not alanına sadece link yapıştırıldıysa bunu Video Linki olarak ekleyelim.
    try{
      await addVideoLinkToRecord(selectedId, raw);
      ta.value = "";
      showDetail(selectedId);
      showToast("Video linki eklendi.", "success");
      return;
    }catch(err){
      console.error("addVideoLinkFromNote:", err);
      showToast((err?.message || err), "error");
      return;
    }
  }

  // Not metni boş olamaz (dosya eklenmediyse)
  if(!raw && !hasFile){
    showToast("Not boş olamaz.", "error");
    return;
  }

  const metin = raw;

  const now = new Date();

  const tarih = now.toLocaleString("tr-TR");

  if(!k.notlar) k.notlar = [];
  ensureEkDosyalar(k);

  let yazan = "Şube";

if (currentRole === "mudur" || currentRole === "admin") {
  const displayName = currentUserName || currentSube || "";
  yazan = displayName ? `Yönetici (${displayName})` : "Yönetici";
}
else if (currentRole === "merkez") yazan = "Merkez";
else if (currentRole === "stok") yazan = "Stok";
else if (currentRole === "kayseri") yazan = "Kayseri Depo";
else if (currentRole === "malkabul") yazan = "Merkez Malkabu";
else if (currentRole === "sube" && currentSube) {
  const nm = (currentUserName || "").trim();
  yazan = nm ? `${currentSube} (${nm})` : currentSube;
}

// Eğer panel/DB tarafı addedByLabel'ı kullanıyorsa, şube için isim de ekleyelim:
const nm2 = (currentUserName || "").trim();
const addedByLabel =
  currentRole === "sube"
    ? (nm2 ? `${currentSube} (${nm2})` : currentSube)
    : currentRole;

  // İndirme yetkisi: ilgili şube + çıkış deposu + Merkez Malkabu
  const MERKEZ_SUBE_ADI = "Merkez Malkabu";
  const allowedSubes = Array.from(new Set([k.sube, k.cikisDepo, MERKEZ_SUBE_ADI].filter(Boolean)));

  // Toplu seçim aktifse notu seçili TÜM kayıtlara yaz. Ekler bir kez yüklenir,
  // aynı not objesi (dolayısıyla aynı ek URL'leri) tüm kayıtlara kopyalanır.
  const bulkActive = bulkMerkezSelectedIds.size > 1 && bulkMerkezSelectedIds.has(String(selectedId));
  const targetIds = bulkActive ? Array.from(bulkMerkezSelectedIds) : [selectedId];

  const pushAndPersist = async (noteObj, eklerList) => {
    if(bulkActive && !confirm(targetIds.length + " kayda aynı not yazılacak. Devam edilsin mi?")) return;
    try{
      await Promise.all(targetIds.map(async (id)=>{
        const rec = bildirimler.find(x=>String(x.id)===String(id));
        if(!rec) return;
        if(!rec.notlar) rec.notlar = [];
        ensureEkDosyalar(rec);
        const newNotlar = (rec.notlar || []).slice();
        newNotlar.push(noteObj);
        const patch = { notlar: newNotlar };
        if(Array.isArray(eklerList) && eklerList.length){
          const newEkl = (rec.ekDosyalar || []).slice();
          eklerList.forEach(e=>newEkl.push(e));
          patch.ekDosyalar = newEkl;
        }
        await updateBildirim(rec.id, patch);
        rec.notlar = newNotlar;
        if(patch.ekDosyalar) rec.ekDosyalar = patch.ekDosyalar;
      }));
      saveLocal();
      ta.value = "";
      if(ekInput) ekInput.value = "";
      if(bulkActive){
        showToast(targetIds.length + " kayda not eklendi.", "success");
        exitBulkSelectMode();
      }
      showDetail(selectedId);
    }catch(err){
      console.error("addNote:", err);
      showToast("Not kaydedilemedi: " + (err?.message || err), "error");
    }
  };

  (async ()=>{
    try{
      let eklerList = [];
      if(ekInput && ekInput.files && ekInput.files.length){
        window.setUILoading && setUILoading(true, { btnIds: [] });
        eklerList = await uploadEkDosyalarToStorage(Array.from(ekInput.files), String(selectedId), addedByLabel, allowedSubes, { wrapId: "noteUploadProgressWrap", barId: "noteUploadProgressBar", textId: "noteUploadProgressText" });
      }

      const noteObj = {
        yazan,
        tarih,
        metin: metin,
        ek: (eklerList && eklerList.length) ? (eklerList[0].name || "") : "",
        ekler: (eklerList && eklerList.length) ? eklerList : []
      };

      await pushAndPersist(noteObj, eklerList);
    }catch(err){
      console.error("Ek dosya upload hatası (note):", err);
      showToast("Not ek dosyası yükleme hatası: " + (err?.message || err), "error");
    }finally{
      window.setUILoading && setUILoading(false);
    }
  })();
}



async function deleteRecord(roleLabel){
  if(selectedId == null) return;
  const k = bildirimler.find(x=>x.id===selectedId);
  if(!k) return;

  
// Sadece oluşturan kişi silebilsin (soft delete)
const user = firebase.auth().currentUser;
if(!user){
  showToast("Oturum bulunamadı.", "error");
  return;
}

if(k.createdByUid){
  if(k.createdByUid !== user.uid){
    showToast("Yalnızca kendi oluşturduğunuz bildirimi silebilirsiniz.", "error");
    return;
  }
} else {
  // Eski kayıtlar için geriye dönük kontrol (createdByUid yoksa)
  if(currentRole === "sube" || currentRole === "kayseri"){
    if(k.sube !== currentSube){
      showToast("Bu rolde yalnızca kendi oluşturduğunuz bildirimleri silebilirsiniz.", "error");
      return;
    }
  } else if(currentRole === "malkabul"){
    const s = (k.sube || "").toUpperCase();
    if(!s.includes("MAL KABUL") && (k.sube || "") !== "Merkez Malkabu"){
      showToast("Bu rolde yalnızca kendi oluşturduğunuz bildirimleri silebilirsiniz.", "error");
      return;
    }
  }
}

  // Toplu seçim aktifse seçili tüm (silme yetkisi olan) kayıtları sil
  const bulkActive = bulkMerkezSelectedIds.size > 1 && bulkMerkezSelectedIds.has(String(selectedId));
  const targetIds = bulkActive ? Array.from(bulkMerkezSelectedIds) : [selectedId];

  const neden = prompt(bulkActive ? (targetIds.length + " kayıt silinecek. Silme nedeni nedir?") : "Silme nedeni nedir?");
  if(!neden) return;

  try{
    let silinen = 0;
    for(const id of targetIds){
      const rec = bildirimler.find(x=>String(x.id)===String(id));
      if(!rec) continue;
      // Yetki kontrolü (kendi kaydı mı)
      if(rec.createdByUid){
        if(rec.createdByUid !== user.uid) continue;
      } else if(currentRole === "sube" || currentRole === "kayseri"){
        if(rec.sube !== currentSube) continue;
      } else if(currentRole === "malkabul"){
        const s = (rec.sube || "").toUpperCase();
        if(!s.includes("MAL KABUL") && (rec.sube || "") !== "Merkez Malkabu") continue;
      }
      await softDeleteBildirim(rec.id, neden);
      silinen++;
    }
    selectedId = null;
    const ctx = bulkCtx();
    const panel = document.getElementById(ctx.panelId);
    if(panel) panel.innerHTML = "<strong>Bir bildirim seçiniz</strong><p class='small-text'>Soldan kaydı seçin.</p>";
    if(bulkActive){
      showToast(silinen + " kayıt silindi.", "success");
      exitBulkSelectMode();
    }
    // Aktif sayfayı yenile
    if(currentPageId === "page-gelen-bildirimler" && typeof refreshGelenBildirimler==="function") refreshGelenBildirimler();
    else if(currentPageId === "page-kayseri-yapilan" && typeof refreshKayseriYapilanTable==="function") refreshKayseriYapilanTable();
    else if(currentPageId === "page-malkabul-yapilan" && typeof refreshMalkabulYapilanTable==="function") refreshMalkabulYapilanTable();
    refreshTable();
    if(typeof updateNotifyUI === "function") updateNotifyUI();
  }catch(err){
    console.error("deleteRecord:", err);
    showToast("Silinemedi: " + (err?.message || err), "error");
  }
}

/*** SİLİNENLER ***/
function updateSilinenTexts(){
  const sub = document.getElementById("silinenSubTitle");
  if(currentRole === "sube"){
    sub.textContent = currentSube + " şubesinin sildiği veya bu şubeye ait silinen kayıtlar.";
  } else if(currentRole === "merkez"){
    sub.textContent = "Tüm şubelerden silinen kayıtlar ve silme nedenleri.";
  } else if(currentRole === "kayseri"){
    sub.textContent = "Kayseri Depo kullanıcısı olarak tüm şubelerden silinen kayıtları görüntüleyebilirsiniz.";
  } else {
    sub.textContent = "Stok ve şubeler tarafından silinen tüm kayıtlar.";
  }
}
function refreshSilinenTable(){
  const tbody = document.getElementById("tblSilinen");
  tbody.innerHTML = "";
  let data = silinenBildirimler.slice();
  if(currentRole === "sube"){
    data = data.filter(k=>k.sube===currentSube);
  }
  data.forEach(k=>{
    const silmeNedeni = (k.silmeNedeni ?? k.deletedReason ?? "-");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${k.tarih}</td>
      <td>${k.sube}</td>
      <td>${k.parti}</td>
      <td>${renderNegatifPozitifUrunHTML(k, escapeHtml(k.urun || ""))}</td>
      <td>${(k.eksik ?? 0)}</td>
      <td>${(k.fazla ?? 0)}</td>
      <td>${silmeNedeni || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

/*** YENİ BİLDİRİM (ŞUBE) ***/
const formYeni = document.getElementById("formYeni");
let negatifPozitifMode = false;
function syncNegatifPozitifUI(){
  const wrap = document.getElementById("nbNegatifPozitifFields");
  const info = document.getElementById("nbNegatifPozitifInfo");
  const btn = document.getElementById("btnNegatifPozitif");
  const urunLabel = document.getElementById("nbUrunLabel");
  const urunInput = document.getElementById("nbUrun");
  if(wrap) wrap.classList.toggle("hidden", !negatifPozitifMode);
  if(info) info.textContent = negatifPozitifMode ? "Aktif: gelen ürün alanı açık." : "Aktif değil.";
  if(urunLabel) urunLabel.childNodes[0].textContent = negatifPozitifMode ? "Gelmesi Gereken Ürün" : "Ürün";
  if(urunInput) urunInput.placeholder = negatifPozitifMode ? "Gelmesi gereken ürün" : "BSG 30-116-217";
  if(btn){
    btn.classList.toggle("btn-primary", negatifPozitifMode);
    btn.classList.toggle("btn-secondary", !negatifPozitifMode);
  }
  // Negatif/Pozitif aktifken forma bir işaret class'ı ekle — "Gelmesi Gereken
  // Ürün" ve "Gelen Ürün" etiketleri CSS ile kırmızıya döner.
  const form = document.getElementById("formYeni");
  if(form) form.classList.toggle("np-active", negatifPozitifMode);
}
(function initNegatifPozitifToggle(){
  const btn = document.getElementById("btnNegatifPozitif");
  if(!btn) return;
  btn.addEventListener("click", ()=>{
    negatifPozitifMode = !negatifPozitifMode;
    syncNegatifPozitifUI();
  });
  syncNegatifPozitifUI();
})();

// Yeni bildirim ek dosya listeleme
(function(){
  const fi = document.getElementById("nbFile");
  const listEl = document.getElementById("nbFileList");
  if(!fi || !listEl) return;

  function renderList(){
    const files = fi.files ? Array.from(fi.files) : [];
    if(!files.length){
      listEl.textContent = "";
      return;
    }
    listEl.innerHTML = files.map(f => "• " + (f.name || "dosya") + " (" + __humanSize(f.size || 0) + ")").join("<br/>");
  }
  fi.addEventListener("change", renderList);
  renderList();
})();

formYeni.addEventListener("submit", async function(e){
  e.preventDefault();
  if(currentRole !== "sube" && currentRole !== "kayseri" && currentRole !== "malkabul"){
    showToast("Yeni bildirim sadece Şube, Kayseri Depo veya Mal Kabul rolünde oluşturulabilir.", "error");
    return;
  }
  // Excel dosyası seçildiyse "Bildirimi Gönder" toplu göndermeyi tetikler
  // (ayrı bir "Excel'den Toplu Gönder" butonuna gerek kalmasın diye).
  const __bulkInput = document.getElementById("bulkExcelInput");
  const __bulkBtn = document.getElementById("bulkExcelUploadBtn");
  if(__bulkInput && __bulkInput.files && __bulkInput.files.length && __bulkBtn){
    __bulkBtn.click();
    return;
  }
  const sube = currentSube;
  const cikisDepoEl = document.getElementById("nbCikisDepo");
  const cikisDepo = cikisDepoEl ? cikisDepoEl.value : "Merkez Depo";
  const parti = document.getElementById("nbParti").value.trim();
  const urun = document.getElementById("nbUrun").value.trim();
  const urunAck = document.getElementById("nbUrunAck").value.trim();
  const gelenUrun = (document.getElementById("nbGelenUrun")?.value || "").trim();
  const eksik = parseInt(document.getElementById("nbEksik").value || "0",10);
  const fazla = parseInt(document.getElementById("nbFazla").value || "0",10);
  const subeAck = document.getElementById("nbSubeAck").value.trim();
  const fileInput = document.getElementById("nbFile");
  const nbVideoLinkEl = document.getElementById("nbVideoLink");
  const nbVideoLink = (nbVideoLinkEl && nbVideoLinkEl.value || "").trim();

  const isSpecialDepo = SPECIAL_CIKIS_DEPOLAR.includes(cikisDepo);
  const partiBos = !parti;
  const urunBos = !urun;

  // Standart bildirimde ürün zorunlu. Negatif/Pozitif modunda gelmesi gereken/gelen ürün alanları esas alınır.
  // Parti sadece şube rolünde ve özel depo tiplerinde opsiyonel
  if((!negatifPozitifMode && urunBos) || (partiBos && !(currentRole === "sube" && isSpecialDepo))){
    showToast("Lütfen ürün bilgisini ve gerekli durumlarda Parti / Sevk No bilgisini giriniz.", "error");
    return;
  }
  if(negatifPozitifMode && (!urun || !gelenUrun)){
    showToast("Negatif/Pozitif bildirim için gelmesi gereken ürün ve gelen ürün alanlarını doldurunuz.", "error");
    return;
  }

  const now = new Date();
  const tarihISO = now.toISOString().slice(0,10);
  const tarih = tarihISO.split("-").reverse().join(".");

  async function kaydiOlusturVeKaydet(payload){
        // payload: null | eklerArray | { __kayitId, ekler }
    let kayitId = Date.now();
    let ekler = payload;
    if(payload && typeof payload === "object" && payload.__kayitId){
      kayitId = payload.__kayitId;
      ekler = payload.ekler || [];
    }

const user = firebase.auth().currentUser;

    const addedByLabel = (currentRole === "sube" ? currentSube : currentRole);

    // ekler: Storage'dan dönen array beklenir (url/storagePath içerir).
    // Geriye dönük uyumluluk için tek ek (dataUrl) gelirse array'e çevir.
    const ekDosyalarFinal = Array.isArray(ekler) ? ekler : (ekler ? [{
      id: Date.now(),
      name: ekler.name,
      type: ekler.type,
      dataUrl: ekler.dataUrl,
      addedBy: addedByLabel
    }] : []);

    const legacyEkDosya = ekDosyalarFinal.length ? ekDosyalarFinal[0] : null;
    const kayit = {
      id: kayitId,
      tarih,
      tarihISO,
      sube,
      cikisDepo,
      parti,
      urun,
      urunAck,
      bildirimTipi: negatifPozitifMode ? "negatifPozitif" : "standart",
      negatifPozitif: !!negatifPozitifMode,
      beklenenUrun: negatifPozitifMode ? urun : "",
      gelenUrun: negatifPozitifMode ? gelenUrun : "",
      eksik,
      fazla,
      durum: "Açık",
      mutabakat: "Beklemede",
      stokAck: "",
      merkezAck: "",
      malKabulAck: "",
      kayseriAck: "",
      subeAck: subeAck || "",
      ekDosya: legacyEkDosya || null,
      ekDosyalar: ekDosyalarFinal,
      // Yeni: videoLinks (max 6). Eski alan videoLink geriye dönük bırakıldı.
      videoLinks: (nbVideoLink ? [{
        url: nbVideoLink,
        addedByUid: user ? user.uid : null,
        addedByRole: currentRole || null,
        addedByName: (currentRole === "sube" ? currentSube : currentRole) || null,
        addedAtMs: Date.now()
      }] : []),
      videoLink: nbVideoLink || "",
      notlar: [],
      isDeleted: false,
      deletedAt: null,
      deletedByUid: null,
      deletedByRole: null,
      createdByUid: user ? user.uid : null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      clientCreatedAtMs: Date.now()
    };

    try {
      await bildirimlerCol.doc(String(kayitId)).set(kayit, { merge: true });

      clearYeniForm();
      showToast("success", "Bildirim yapıldı", "", 2200);
      // Kaydetten sonra kullanıcı Yeni Bildirim ekranında kalsın
      // (isteğe bağlı: burada sayfa yönlendirmesi yapılmıyor)
    } catch (err) {
      console.error("Bildirim kaydetme hatası:", err);
      showToast(
        "Bildirim kaydedilemedi: " +
          ((err && err.message) ? err.message : err),
        "error"
      );
    }
  }

  // Ek dosyalar varsa Storage'a yükle, yoksa direkt kaydet
  try{
    const addedByLabel = (currentRole === "sube" ? currentSube : currentRole);
    const files = (fileInput && fileInput.files) ? Array.from(fileInput.files) : [];
    if(files.length){
      window.setUILoading && setUILoading(true, { btnIds: [] });
      const kayitId = Date.now(); // kayit id'si ile klasörleyeceğiz
      // İndirme yetkisi: ilgili şube + çıkış deposu + Merkez
      // Sizde merkez "Merkez Malkabu" adıyla tutuluyor (users/{uid}.sube).
      const MERKEZ_SUBE_ADI = "Merkez Malkabu";
      const allowedSubes = Array.from(new Set([sube, cikisDepo, MERKEZ_SUBE_ADI].filter(Boolean)));
      const ekler = await uploadEkDosyalarToStorage(files, kayitId, addedByLabel, allowedSubes);

      // Kaydı aynı id ile oluşturmak için kaydiOlusturVeKaydet içinde Date.now() yerine sabit id kullanacağız
      // Bu yüzden ek olarak kayitId'yi geçiyoruz:
      await kaydiOlusturVeKaydet({ __kayitId: kayitId, ekler: ekler });
    } else {
      await kaydiOlusturVeKaydet(null);
    }
  }catch(err){
    console.error("Ek dosya upload hatası:", err);
    showToast("Dosya yükleme hatası: " + (err?.message || err), "error");
    // İstersen dosyasız da kaydedebilir:
    // kaydiOlusturVeKaydet(null);
  } finally {
    window.setUILoading && setUILoading(false, { btnIds: [] });
  }
});
function clearYeniForm(){
  document.getElementById("nbParti").value = "";
  document.getElementById("nbUrun").value = "";
  document.getElementById("nbUrunAck").value = "";
  document.getElementById("nbEksik").value = "0";
  document.getElementById("nbFazla").value = "0";
  document.getElementById("nbSubeAck").value = "";
  const nbBeklenen = document.getElementById("nbBeklenenUrun"); if(nbBeklenen) nbBeklenen.value = "";
  const nbGelen = document.getElementById("nbGelenUrun"); if(nbGelen) nbGelen.value = "";
  negatifPozitifMode = false;
  syncNegatifPozitifUI();
  document.getElementById("nbFile").value = "";
  const nbvl = document.getElementById("nbVideoLink"); if(nbvl) nbvl.value = "";
  const fl = document.getElementById("nbFileList"); if(fl) fl.textContent = "";
}

/*** FİLTRE EVENTS ***/
["fltSube","fltDurum","fltMutabakat","fltStokAck"].forEach(id=>{
  const el = document.getElementById(id);
  el.addEventListener("change", refreshTable);
});


/*** SESSION & LOGOUT ***/
function restoreSessionIfAny(){
  try{
    const raw = localStorage.getItem(SESSION_KEY);
    if(!raw) return;
    const s = JSON.parse(raw);
    if(!s || !s.role) return;
    currentRole = s.role;
    currentSube = s.sube || null;
    // login ekranını gizle ve app'i aç
    const loginWrap = document.getElementById("authGate");
    if(loginWrap){ loginWrap.style.display = "none"; }
    const appRoot = document.getElementById("appRoot");
    if(appRoot){ appRoot.style.display = "block"; appRoot.classList.remove("hidden"); }
    afterLogin();
  }catch(e){
    console.error(e);
  }
}

async function logout(){
  try{
    // Clear app session first (UI state)
    localStorage.removeItem(SESSION_KEY);
    currentRole = null;
    currentSube = null;
    selectedId = null;
    selectedStatus = null;
    // If Firebase Auth is available, sign out as the source of truth
    if (window.firebase && firebase.auth) {
      try { await firebase.auth().signOut(); } catch(e){ console.warn("Firebase signOut failed:", e); }
    }
  } finally {
    // Always fall back to showing login
    document.getElementById("appShell").classList.add("hidden");
    document.getElementById("authGate").classList.remove("hidden");
  }
}

/*** INIT (sadece login ekranı açık) ***/
function refreshAll(){
  // Sync role/sube from global (auth.js writes window.currentRole/currentSube)
  try{
    if(typeof window.currentRole !== "undefined" && window.currentRole) currentRole = window.currentRole;
    if(typeof window.currentSube !== "undefined" && window.currentSube) currentSube = window.currentSube;
  }catch(_){}
  normalizeEkDosyalarAll();
  updateRaporTexts();
  updateKPIs();
  updateCharts().catch(console.error);
updatePivot();
  updateBildirimPageTexts();
  refreshTable();
  refreshKayseriYapilanTable();
  updateSilinenTexts();
  refreshSilinenTable();

  // Realtime veri geldikçe aktif sayfayı da yenile.
  // Özellikle müdür dashboard grafikleri ilk login'de snapshot sonradan geldiği için boş kalabiliyor.
  try{
    if(currentRole === "mudur"){
      if(currentPageId === "page-mudur-dashboard" && typeof refreshMudurDashboard === "function"){
        safeRefreshDashboard();
      }
      if(currentPageId === "page-mudur-stok" && typeof refreshMudurStok === "function"){
        refreshMudurStok();
      }
      if(currentPageId === "page-mudur-depo-takip"){
        if(typeof refreshMudurDepoTakip === "function") refreshMudurDepoTakip();
        if(typeof refreshMudurSubePerf === "function") refreshMudurSubePerf();
        if(typeof refreshMudurSonBildirim === "function") refreshMudurSonBildirim();
      }
    }
  }catch(e){ /* no-op */ }
}


function refreshMudurDashboard(){
  // KPI + Dashboard blokları
  const now = new Date();

  const toDate = (v)=>{
    if(!v) return null;
    if(typeof v.toDate === "function") return v.toDate();
    if(v instanceof Date) return v;
    // ISO / ms / string
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  const pad = (n)=> String(n).padStart(2,"0");
  const dateKey = (d)=> `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  const todayKey = dateKey(now);

  let acik = 0, kapali = 0, toplam = 0;
  let eksikSum = 0, fazlaSum = 0, mutabikDegilEksikSum = 0;
  let todayCount = 0;
  let delCount = (silinenBildirimler || []).length;

  // Bugün özetleri
  let todayOpened = 0, todayClosed = 0, todayDeleted = 0, todayAttachments = 0;

  // Overdue 7+ gün
  const overdue = [];

  // Şube bazlı açık/beklemede
  const bySube = {}; // {sube: {acik: n, bek: n}}
  const addSube = (sube, field)=>{
    const k = (sube || "Bilinmeyen");
    bySube[k] = bySube[k] || {acik:0, bek:0};
    bySube[k][field] = (bySube[k][field]||0) + 1;
  };

  // Ürün / Parti toplamlari
  const byUrun = {};   // key -> {count, sapma}
  const byParti = {};  // key -> {count, sapma}

  // Cevapsız notlar
  const unanswered = [];

  (bildirimler || []).forEach(k=>{
    const created = toDate(k.createdAt || k.tarihISO || k.tarih);
    const updated = toDate(k.updatedAt);
    const mut = (k.mutabakat || "Beklemede");
    const durum = (k.durum || k.status || "Açık");
    toplam++;

    const e = Number(k.eksik || 0);
    const f = Number(k.fazla || 0);
    const sapma = (isFinite(e)?e:0) + (isFinite(f)?f:0);

    // KPI'lar müdür isteğine göre 'Durum' alanından hesaplanır
    if(durum === "Açık" || durum === "Acik") {
      acik++;
    } else if(durum === "Kapandı" || durum === "Kapandi" || durum === "Kapalı" || durum === "Kapali" || durum === "Kapatıldı" || durum === "Kapatildi") {
      kapali++;
    }

    if(durum === "Açık" || durum === "Acik"){
      eksikSum += isFinite(e) ? e : 0;
      fazlaSum += isFinite(f) ? f : 0;
    }

    if(mut === "Mutabık Değil"){
      mutabikDegilEksikSum += isFinite(e) ? e : 0;
    }

    if(created){
      const cKey = dateKey(created);
      if(cKey === todayKey){
        todayCount++;
        todayOpened++;
        const ekLen = Array.isArray(k.ekDosyalar) ? k.ekDosyalar.length : 0;
        if(ekLen > 0) todayAttachments++;
      }
      // 7+ gün açık/beklemede
      const diffDays = Math.floor((now.getTime() - created.getTime()) / 86400000);
      if(diffDays >= 7 && (mut === "Açık" || mut === "Beklemede")){
        overdue.push({ id: k.id || k.docId || "", sube: k.sube || "", cikisDepo: k.cikisDepo || "", urun: (k.urun || k.urunAdi || k.urunKodu || ""), days: diffDays, eksik: e||0, fazla: f||0 });
      }
    }

    // Bugün mutabık (updatedAt bazlı)
    if(updated){
      const uKey = dateKey(updated);
      if(uKey === todayKey && mut === "Mutabık") todayClosed++;
    }

    // Şube dağılımı (açık/beklemede)
    if(mut === "Açık") addSube(k.sube, "acik");
    if(mut === "Beklemede") addSube(k.sube, "bek");

    // Ürün / Parti top 5 (sapmaya göre)
    const urunKey = (k.urun || k.urunAdi || k.urunKodu || "Bilinmeyen");
    const partiKey = (k.partiNo || k.parti || "—");

    byUrun[urunKey] = byUrun[urunKey] || {count:0, sapma:0};
    byUrun[urunKey].count += 1;
    byUrun[urunKey].sapma += sapma;

    byParti[partiKey] = byParti[partiKey] || {count:0, sapma:0};
    byParti[partiKey].count += 1;
    byParti[partiKey].sapma += sapma;

    // Cevapsız notlar: son not 2+ gün önce + kayıt açık/beklemede
    if((mut === "Açık" || mut === "Beklemede") && Array.isArray(k.notlar) && k.notlar.length){
      const last = k.notlar[k.notlar.length-1] || {};
      const lastDt = toDate(last.tarih || last.createdAt || last.ts);
      if(lastDt){
        const d = Math.floor((now.getTime() - lastDt.getTime()) / 86400000);
        if(d >= 2){
          const text = (last.text || last.mesaj || "").toString();
          unanswered.push({
            id: k.id || k.docId || "",
            sube: k.sube || "",
            text,
            days: d
          });
        }
      }
    }
  });

  // Silinenler bugün (silinenBildirimler içinde deletedAt varsa)
  (silinenBildirimler || []).forEach(s=>{
    const d = toDate(s.deletedAt);
    if(d && dateKey(d) === todayKey) todayDeleted++;
  });

  const setText = (id, val)=>{
    const el = document.getElementById(id);
    if(el) el.textContent = String(val);
  };

  // 1) KPI
  setText("mudurKpiAcik", acik);
  setText("mudurKpiBeklemede", kapali);
  setText("mudurKpiMutabik", toplam);
  setText("mudurKpiEksik", eksikSum);
  setText("mudurKpiFazla", fazlaSum);
  setText("mudurKpiMutabikDegilEksik", mutabikDegilEksikSum);
  setText("mudurKpiToday", todayCount);
  setText("mudurKpiDeleted", delCount);

  // 4) Bugün ne oldu
  setText("mudurTodayOpened", todayOpened);
  setText("mudurTodayClosed", todayClosed);
  setText("mudurTodayDeleted", todayDeleted);
  setText("mudurTodayAttachments", todayAttachments);

  // 2) Overdue tablosu
  const overdueBody = document.getElementById("mudurOverdueTbody");
  if(overdueBody){
    overdueBody.innerHTML = "";
    overdue.sort((a,b)=> b.days - a.days).slice(0,10).forEach(r=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
      <td>${escapeHtml(r.sube || "")}</td>
      <td>${escapeHtml(r.cikisDepo || "-")}</td>
      <td>${escapeHtml(r.urun || "-")}</td>
      <td>${escapeHtml(String(r.eksik || 0))}</td>
      <td>${escapeHtml(String(r.fazla || 0))}</td>
      <td>${escapeHtml(String(r.days || 0))}</td>
    `;
      overdueBody.appendChild(tr);
    });
    if(!overdue.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" style="color:#666;">7+ gün açık/beklemede kayıt yok.</td>`;
      overdueBody.appendChild(tr);
    }
  }

  // 5) Top ürünler / partiler
  const topUrunBody = document.getElementById("mudurTopUrunTbody");
  if(topUrunBody){
    topUrunBody.innerHTML = "";
    Object.entries(byUrun)
      .sort((a,b)=> (b[1].sapma||0) - (a[1].sapma||0))
      .slice(0,5)
      .forEach(([name, v])=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td title="${escapeHtml(name)}">${escapeHtml(name).slice(0,24)}${name.length>24?"…":""}</td>
          <td>${escapeHtml(String(v.count||0))}</td>
          <td>${escapeHtml(String(v.sapma||0))}</td>
        `;
        topUrunBody.appendChild(tr);
      });
    if(!Object.keys(byUrun).length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="3" style="color:#666;">Veri yok.</td>`;
      topUrunBody.appendChild(tr);
    }
  }

  const topPartiBody = document.getElementById("mudurTopPartiTbody");
  if(topPartiBody){
    topPartiBody.innerHTML = "";
    Object.entries(byParti)
      .sort((a,b)=> (b[1].sapma||0) - (a[1].sapma||0))
      .slice(0,5)
      .forEach(([name, v])=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td title="${escapeHtml(name)}">${escapeHtml(String(name)).slice(0,24)}${String(name).length>24?"…":""}</td>
          <td>${escapeHtml(String(v.count||0))}</td>
          <td>${escapeHtml(String(v.sapma||0))}</td>
        `;
        topPartiBody.appendChild(tr);
      });
    if(!Object.keys(byParti).length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="3" style="color:#666;">Veri yok.</td>`;
      topPartiBody.appendChild(tr);
    }
  }

  // 6) Cevapsız notlar
  const unBody = document.getElementById("mudurUnansweredTbody");
  if(unBody){
    unBody.innerHTML = "";
    unanswered.sort((a,b)=> b.days - a.days).slice(0,10).forEach(r=>{
      const tr = document.createElement("tr");
      const short = (r.text||"").slice(0,40) + ((r.text||"").length>40 ? "…" : "");
      tr.innerHTML = `
        <td>${escapeHtml(r.id || "")}</td>
        <td>${escapeHtml(r.sube || "")}</td>
        <td title="${escapeHtml(r.text || "")}">${escapeHtml(short)}</td>
        <td>${escapeHtml(String(r.days))}</td>
      `;
      unBody.appendChild(tr);
    });
    if(!unanswered.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" style="color:#666;">Cevapsız kalan not yok.</td>`;
      unBody.appendChild(tr);
    }
  }

  // 3) Şubeye göre açık/beklemede chart
  const c = document.getElementById("mudurChartOpenByBranch");
  if(c && typeof Chart !== "undefined"){
    const labels = Object.keys(bySube);
    // Sadece Beklemede grafiği: yüksekten düşüğe sırala
    labels.sort((a,b)=> (bySube[b]?.bek||0) - (bySube[a]?.bek||0));
    const bekData  = labels.map(l=> (bySube[l]?.bek||0));

    if(window.chartMudurOpenByBranch) window.chartMudurOpenByBranch.destroy();
    window.chartMudurOpenByBranch = new Chart(c, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Beklemede",
            data: bekData,
            backgroundColor: "rgba(59,130,246,0.85)",
            borderColor: "rgba(37,99,235,1)",
            borderWidth: 1,
            borderRadius: 10,
            maxBarThickness: 48
          }
        ]
},
      options: {
        responsive: true,
        onClick: (_evt, elements, chart) => {
          if(!elements || !elements.length) return;
          const idx = elements[0].index;
          const sube = chart?.data?.labels?.[idx];
          if(!sube) return;
          const navEl = Array.from(document.querySelectorAll(".nav-item")).find(x=>x.dataset && x.dataset.page==="page-bildirimler") || null;
          if(typeof showPage === "function") showPage("page-bildirimler", navEl);
          setTimeout(()=>{
            const subeEl = document.getElementById("fltSube");
            const mutEl = document.getElementById("fltMutabakat");
            const durumEl = document.getElementById("fltDurum");
            if(subeEl) subeEl.value = String(sube);
            if(mutEl) mutEl.value = "Beklemede";
            if(durumEl) durumEl.value = "tum";
            window.__kpiAgeFilterDays = 0;
            window.__kpiQuantityFilter = "";
            if(typeof refreshTable === "function") refreshTable();
          }, 50);
        },
        plugins: { 
          legend: { position: "bottom" },
          tooltip: { enabled: true }
        },
        scales: {
          x: { stacked: false },
          y: { stacked: false, beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
    try { c.style.cursor = "pointer"; } catch(e) {}
  }
}



function refreshMudurSubePerf(){
  const tbody = document.getElementById("tblMudurSubePerf");
  if(!tbody) return;
  tbody.innerHTML = "";
  const rows = {};
  (bildirimler || []).forEach(k=>{
    const s = (k.sube || "Bilinmiyor");
    if(!rows[s]) rows[s] = {sube:s, total:0, acik:0, bek:0, mut:0, eksik:0, fazla:0};
    const r = rows[s];
    r.total++;
    const mut = (k.mutabakat || "Beklemede");
    const durum = (k.durum || k.status || "Açık");
    if(mut && mut !== "Beklemede") r.mut++;
    else r.bek++;
    // "Açık" kavramını beklemede gibi sayıyoruz
    r.acik = r.bek;
    r.eksik += Number(k.eksik || 0) || 0;
    r.fazla += Number(k.fazla || 0) || 0;
  });

  const list = Object.values(rows).sort((a,b)=> (b.total-a.total));
  list.forEach(r=>{
    const oran = r.total ? Math.round((r.mut / r.total) * 100) : 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.sube)}</td>
      <td>${r.total}</td>
      <td>${r.acik}</td>
      <td>${r.bek}</td>
      <td>${r.mut}</td>
      <td>%${oran}</td>
`;
    tbody.appendChild(tr);
  });

  if(!list.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="text-muted">Kayıt bulunamadı.</td>`;
    tbody.appendChild(tr);
  }
}

function refreshMudurStok(){
  const urunTbl = document.getElementById("tblMudurTopUrun");
  const urunBody = urunTbl ? urunTbl.querySelector("tbody") : null;
  const partiTbl = document.getElementById("tblMudurTopParti");
  const partiBody = partiTbl ? partiTbl.querySelector("tbody") : null;
  const subeTbl = document.getElementById("tblMudurTopSube");
  const subeBody = subeTbl ? subeTbl.querySelector("tbody") : null;
  if(!urunBody || !partiBody || !subeBody) return;
  urunBody.innerHTML = "";
  partiBody.innerHTML = "";
  subeBody.innerHTML = "";

  const byUrun = {};
  const byParti = {};
  const bySube = {};

  (bildirimler || []).forEach(k=>{
    const urun = (k.urun || k.urunAdi || k.urunKodu || "Bilinmiyor");
    const parti = (k.partiNo || k.parti || k.parti_no || k.batch || "-");
    const e = Number(k.eksik || 0) || 0;
    const f = Number(k.fazla || 0) || 0;

    const sube = (k.sube || k.subeAdi || k.subeAd || "Bilinmiyor");

    if(!bySube[sube]) bySube[sube] = {key:sube, count:0, eksik:0, fazla:0};
    bySube[sube].count++;
    bySube[sube].eksik += e;
    bySube[sube].fazla += f;


    if(!byUrun[urun]) byUrun[urun] = {key:urun, count:0, eksik:0, fazla:0};
    byUrun[urun].count++; byUrun[urun].eksik += e; byUrun[urun].fazla += f;

    if(!byParti[parti]) byParti[parti] = {key:parti, count:0, eksik:0, fazla:0};
    byParti[parti].count++; byParti[parti].eksik += e; byParti[parti].fazla += f;
  });

  const topUrun = Object.values(byUrun).sort((a,b)=> (b.count - a.count)).slice(0,20);
  const topParti = Object.values(byParti).sort((a,b)=> (b.count - a.count)).slice(0,20);

  topUrun.forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.key)}</td>
      <td class="text-end"><span class="count-badge">${r.count}</span></td>
    `;
    urunBody.appendChild(tr);
  });
  if(!topUrun.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="2" class="text-muted">Veri yok.</td>`;
    urunBody.appendChild(tr);
  }

  topParti.forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.key)}</td>
      <td class="text-end"><span class="count-badge">${r.count}</span></td>
    `;
    partiBody.appendChild(tr);
  });
  if(!topParti.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="2" class="text-muted">Veri yok.</td>`;
    partiBody.appendChild(tr);
  }
  
  const topSube = Object.values(bySube).sort((a,b)=> (b.count - a.count) || ((b.eksik+b.fazla)-(a.eksik+a.fazla))).slice(0,20);
  topSube.forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.key)}</td>
      <td class="text-end"><span class="count-badge">${r.count}</span></td>
    `;
    subeBody.appendChild(tr);
  });
  if(!topSube.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="2" class="text-muted">Veri yok.</td>`;
    subeBody.appendChild(tr);
  }
}

function refreshMudurNotlar(){
  const tbody = document.getElementById("tblMudurNotlar");
  if(!tbody) return;
  tbody.innerHTML = "";

  // Bildirimlerdeki notları flatten et (son not öncelikli)
  const flat = [];
  (bildirimler || []).forEach(k=>{
    const arr = (k.notlar && Array.isArray(k.notlar)) ? k.notlar : [];
    if(!arr.length) return;
    const last = arr[arr.length-1];
    flat.push({
      createdAt: (last.tarih || last.createdAt || k.createdAt || k.tarihISO || k.tarih || ""),
      sube: k.sube || "",
      urun: k.urun || "",
      parti: k.partiNo || "",
      text: last.mesaj || last.text || "",
      yazan: last.yazan || ""
    });
  });

  flat.sort((a,b)=> (String(b.createdAt).localeCompare(String(a.createdAt))));
  flat.slice(0,200).forEach(n=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(String(n.createdAt).slice(0,10))}</td>
      <td>${escapeHtml(n.sube)}</td>
      <td>${escapeHtml(n.urun)}</td>
      <td>${escapeHtml(n.parti)}</td>
      <td title="${escapeHtml(n.text)}">${escapeHtml(n.text).slice(0,80)}${n.text && n.text.length>80 ? "…" : ""}</td>
      <td>${escapeHtml(n.yazan)}</td>
    `;
    tbody.appendChild(tr);
  });

  if(!flat.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="text-muted">Not bulunamadı.</td>`;
    tbody.appendChild(tr);
  }
}






// Sayfa yüklendiğinde varsa oturumu geri yükle
// window.addEventListener('load', restoreSessionIfAny); // disabled: AuthGate controls session


function globalSearch(q){
  var query = (q || "").toLowerCase();
  var ids = ["tblBildirimler","tblGelenBildirimler","tblKayseriYapilan","tblKayseriGelen"];
  ids.forEach(function(id){
    var tbody = document.getElementById(id);
    if(!tbody) return;
    Array.prototype.forEach.call(tbody.getElementsByTagName("tr"), function(tr){
      var text = tr.textContent.toLowerCase();
      tr.style.display = !query || text.indexOf(query) !== -1 ? "" : "none";
    });
  });
}

function refreshActiveTable(){
  try { if(typeof refreshTable === "function") refreshTable(); } catch(e){}
  try { if(typeof refreshGelenBildirimler === "function") refreshGelenBildirimler(); } catch(e){}
  try { if(typeof refreshKayseriYapilan === "function") refreshKayseriYapilan(); } catch(e){}
  try { if(typeof refreshKayseriGelen === "function") refreshKayseriGelen(); } catch(e){}
}

(function bindForgotPasswordOnce(){
  const btn = document.getElementById("forgotBtn");
  if (!btn) return;
  if (btn.dataset.boundForgotHandler === "1") return;
  btn.dataset.boundForgotHandler = "1";

  btn.addEventListener("click", async () => {
    if (window.__forgotPasswordInFlight) return;

    const auth = firebase.auth();
    const email = __getVisibleEmailInputValue();
    const msg = document.getElementById("forgotMsg");
    const setMsg = (text, ok) => {
      if (!msg) return;
      msg.textContent = text || "";
      msg.style.color = ok ? "#15803d" : "#b91c1c";
    };

    // 30sn cooldown (spam önleme)
    if (btn?.dataset?.cooldownUntil) {
      const until = parseInt(btn.dataset.cooldownUntil, 10) || 0;
      if (Date.now() < until) {
        const left = Math.ceil((until - Date.now()) / 1000);
        setMsg(`Lütfen ${left} sn bekleyin.`, false);
        if (window.showToast) showToast("info", "Bilgi", `Lütfen ${left} sn bekleyin.`, 1800);
        return;
      }
    }

    if (!email) {
      setMsg("Lütfen email adresinizi yazın.", false);
      if (window.showToast) showToast("error", "Eksik bilgi", "Lütfen email adresinizi yazın.", 2600);
      return;
    }

    try {
      window.__forgotPasswordInFlight = true;
      btn.disabled = true;
      btn.style.opacity = "0.7";
      btn.style.cursor = "not-allowed";
      if (window.showToast) showToast("info","Sıfırlama","Şu adrese gönderiliyor: " + email, 2000);
      await auth.sendPasswordResetEmail(email);
      setMsg("Şifre sıfırlama bağlantısı email adresinize gönderildi.", true);
      if (window.showToast) showToast("success", "Gönderildi", "Şifre sıfırlama bağlantısı email adresinize gönderildi.", 3200);

      const until = Date.now() + 30000; // 30 saniye
      btn.dataset.cooldownUntil = String(until);
      const tick = () => {
        const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        if (left > 0) {
          btn.textContent = `Şifremi Unuttum (${left})`;
          btn.disabled = true;
          setTimeout(tick, 500);
        } else {
          btn.textContent = "Şifremi Unuttum";
          btn.disabled = false;
          btn.style.opacity = "";
          btn.style.cursor = "pointer";
          delete btn.dataset.cooldownUntil;
        }
      };
      tick();
    } catch (e) {
      console.error(e);
      const friendly = window.trAuthError ? window.trAuthError(e) : (e?.message || e);
      setMsg("Gönderilemedi: " + friendly, false);
      if (window.showToast) showToast("error", "Gönderilemedi", friendly, 3600);
      btn.disabled = false;
      btn.style.opacity = "";
      btn.style.cursor = "pointer";
    } finally {
      window.__forgotPasswordInFlight = false;
    }
  });
})();


// Müdür dashboard hızlı aksiyon butonları
document.addEventListener("click", (e)=>{
  const btn = e.target && e.target.closest ? e.target.closest("[data-quick-nav]") : null;
  if(!btn) return;
  const page = btn.getAttribute("data-quick-nav");
  if(!page) return;
  const navEl = Array.from(document.querySelectorAll(".nav-item")).find(x=>x.dataset && x.dataset.page===page) || null;
  if(typeof showPage === "function"){
    showPage(page, navEl);
  }
});


// KPI kartları (Raporlar + Müdür Dashboard) -> Bildirimler sayfasına hızlı yönlendirme
// Not: Ekstra maliyet oluşturmaz; mevcut filtre/sorgu akışını sadece tetikler.
(function initKpiCardNavigation(){
  function safeText(v){ return (v==null ? "" : String(v)).trim(); }

  function navTo(pageId){
    const navEl = Array.from(document.querySelectorAll(".nav-item")).find(x=>x.dataset && x.dataset.page===pageId) || null;
    if(typeof showPage === "function") showPage(pageId, navEl);
  }

  function setSelect(id, value){
    const el = document.getElementById(id);
    if(!el) return false;
    el.value = value;
    return true;
  }

  function clearKpiExtra(){
    window.__kpiAgeFilterDays = 0;
    window.__kpiQuantityFilter = "";
  }

  function applyKpiToBildirimler(label){
    // Varsayılan: tüm ek filtreleri temizle
    clearKpiExtra();

    // Genel Bildirim filtreleri
    if(label === "Toplam Bildirim"){
      setSelect("fltDurum", "tum");
      setSelect("fltMutabakat", "tum");
      return;
    }
    if(label === "Açık Bildirim"){
      setSelect("fltDurum", "Açık");
      return;
    }
    if(label === "Kapanan Bildirim" || label === "Kapandı"){
      setSelect("fltDurum", "Kapandı");
      return;
    }
    if(label === "Beklemede Mutabakat"){
      setSelect("fltMutabakat", "Beklemede");
      return;
    }
    if(label === "3+ Gün Açık Bildirim"){
      setSelect("fltDurum", "Açık");
      window.__kpiAgeFilterDays = 3;
      return;
    }

    if(label === "Toplam Eksik"){
      window.__kpiQuantityFilter = "eksik";
      return;
    }
    if(label === "Toplam Fazla"){
      window.__kpiQuantityFilter = "fazla";
      return;
    }
    if(label === "Mutabık Kalınmayan Toplam Eksik"){
      window.__kpiQuantityFilter = "mutabikDegilEksik";
      return;
    }
    if(label === "Bugün Açılan" || label === "Silinen"){
      return;
    }
  }

  function bindCards(){
    const cards = document.querySelectorAll("#page-raporlar .kpi-card, #page-mudur-dashboard .kpi-card");
    cards.forEach(card=>{
      if(card.dataset.kpiNavBound === "1") return;
      card.dataset.kpiNavBound = "1";
      card.style.cursor = "pointer";
      card.setAttribute("role","button");
      card.tabIndex = 0;

      const act = ()=>{
        const label = safeText(card.querySelector('.kpi-label')?.textContent);

        // Müdür panelinde "Silinen" kartı -> Silinen Bildirimler sayfasına git
        if(label === "Silinen"){
          navTo("page-silinen");
          setTimeout(()=>{
            if(typeof updateSilinenTexts === "function") updateSilinenTexts();
            if(typeof refreshSilinenTable === "function") refreshSilinenTable();
          }, 50);
          return;
        }

        // Diğer KPI'lar -> Bildirimler sayfasında ilgili filtreleri uygula
        navTo("page-bildirimler");
        // Sayfa render + select'ler hazır olsun
        setTimeout(()=>{
          applyKpiToBildirimler(label);
          if(typeof refreshTable === "function") refreshTable();
        }, 50);
      };

      card.addEventListener("click", act);
      card.addEventListener("keydown", (e)=>{
        if(e.key === "Enter" || e.key === " "){
          e.preventDefault();
          act();
        }
      });
    });

    // Kullanıcı manuel filtre değiştirirse KPI ekstra filtresini temizle (sürpriz davranışı engelle)
    ["fltSube","fltCikisDepo","fltDurum","fltMutabakat","fltStokAck"].forEach(id=>{
      const el = document.getElementById(id);
      if(!el || el.dataset.kpiClearBound === "1") return;
      el.dataset.kpiClearBound = "1";
      el.addEventListener("change", ()=>{ clearKpiExtra(); updateBildirimFilterUi(); });
    });
  }

  // İlk yükte ve sayfa geçişlerinde tekrar dene (DOM hazır olmayabilir)
  document.addEventListener("DOMContentLoaded", bindCards);
  setTimeout(bindCards, 200);
  setTimeout(bindCards, 1000);
})();





// =====================
// Bulk Excel Upload (Max 50 rows) - Çıkış Depo dropdown'lu şablon
// =====================
(function initBulkExcelUpload(){
  function el(id){ return document.getElementById(id); }

  const input = el("bulkExcelInput");
  const btnSelect = el("bulkExcelSelectBtn");
  const btnUpload = el("bulkExcelUploadBtn");
  const status = el("bulkExcelStatus");

  if(!input || !btnSelect || !btnUpload) return;

  let parsedRows = [];

  function setStatus(msg, type){
    if(!status) return;
    status.textContent = msg || "";
    status.style.color = (type==="error") ? "#b00020" : (type==="success" ? "#0a7a0a" : "#333");
  }

  function normalizeKey(k){
    return String(k||"")
      .trim().toLowerCase()
      .replace(/\s+/g,"_")
      .replace(/ı/g,"i").replace(/ş/g,"s").replace(/ğ/g,"g")
      .replace(/ü/g,"u").replace(/ö/g,"o").replace(/ç/g,"c");
  }

  function toInt(v){
    if(v === null || v === undefined || v === "") return 0;
    const n = parseInt(String(v).trim(), 10);
    return isNaN(n) ? 0 : n;
  }

  function validateRow(r){
    const errors=[];    if(!r.parti_sevk_no) errors.push("parti_sevk_no boş");
    if(!r.cikis_depo) errors.push("cikis_depo boş");
    if(!r.urun) errors.push("urun boş");
    return errors;
  }

  async function readExcel(file){
    await ensureXlsx();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:"array"});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, {defval:""});
    const rows = raw.map(obj=>{
      const out={};
      Object.keys(obj).forEach(k=>{
        out[normalizeKey(k)] = (typeof obj[k]==="string") ? obj[k].trim() : obj[k];
      });
      return out;
    }).filter(r=>{
      // ignore completely empty rows
      return Object.values(r).some(v=> String(v||"").trim() !== "");
    });
    return rows;
  }

  btnSelect.addEventListener("click", ()=> input.click());

  input.addEventListener("change", async ()=>{
    parsedRows = [];
    const file = input.files && input.files[0];
    if(!file){ setStatus("", ""); return; }

    try{
      setStatus("Excel okunuyor", "");
      const rows = await readExcel(file);

      if(rows.length === 0){
        setStatus("Excel içinde veri bulunamadı.", "error");
        return;
      }
      if(rows.length > 50){
        setStatus(`Excel'de ${rows.length} satır var. Maksimum 50 satır yükleyebilirsiniz.`, "error");
        return;
      }

      // required columns check (by keys)
      const required = ["parti_sevk_no","cikis_depo","urun","urun_aciklama","eksik_adet","fazla_adet"];
      const keys = Object.keys(rows[0] || {});
      const missing = required.filter(k=> !keys.includes(k));
      if(missing.length){
        setStatus("Excel kolonları eksik: " + missing.join(", "), "error");
        return;
      }

      // validate
      let ok=0, fail=0, dup=0;
      const report=[];
      const currentSube = getActiveSubeForBulk();
      if (!currentSube) { showToast("Şube bulunamadı. Önce şube seçip giriş yapın.", "error"); return; }
      rows.forEach((r, idx)=>{
        // bulk upload: şube excelde yok, aktif şube kullanılır
        if (!r.sube) r.sube = currentSube;
        r.sube = currentSube;
        const errs = validateRow(r);
        if(errs.length){ fail++; report.push(`Satır ${idx+2}: ${errs.join(" | ")}`); }
        else ok++;
      });

      parsedRows = rows;
      if(fail){
        setStatus(`Excel yüklendi. Geçerli: ${ok}, Hatalı: ${fail}. (Eksik alanları düzeltin)`, "error");
        console.warn("Bulk Excel validation errors:\n" + report.join("\n"));
      }else{
        setStatus(`Excel yüklendi. ${ok} satır hazır.`, "success");
      }
    }catch(e){
      console.error(e);
      setStatus("Excel okunamadı: " + (e.message || e), "error");
    }
  });

  btnUpload.addEventListener("click", async ()=>{
      const currentSube = getActiveSubeForBulk();
      if(!currentSube){ setStatus("Şube bulunamadı. Önce şube seçip giriş yapın.", "error"); return; }
      const seenDedup = new Set();
    if(!parsedRows.length){
      setStatus("Önce Excel seçin.", "error");
      return;
    }

    // validate again
    const bad = parsedRows.filter(r=> validateRow(r).length);
    if(bad.length){
      setStatus(`Gönderim iptal: ${bad.length} satır hatalı.`, "error");
      return;
    }

    // role gate (same as single create)
    if(!["sube","kayseri","malkabul"].includes(currentRole)){
      showToast("Toplu bildirim sadece Şube, Kayseri Depo veya Mal Kabul rolünde oluşturulabilir.", "error");
      return;
    }

    btnUpload.disabled = true;
    btnSelect.disabled = true;

    try{
      const now = new Date();
      const tarihISO = now.toISOString().slice(0,10);
      const tarih = tarihISO.split("-").reverse().join(".");

      let done=0, dup=0;
      const report=[];
      for(let idx=0; idx<parsedRows.length; idx++){
        const r = parsedRows[idx];
        const kayit = {
          id: "",
          tarih,
          tarihISO,
          sube: String(currentSube||"").trim(),
          cikisDepo: String(r.cikis_depo||"").trim(),
          parti: String(r.parti_sevk_no||"").trim(),
          urun: String(r.urun||"").trim(),
          urunAck: String(r.urun_aciklama||"").trim(),
          eksik: toInt(r.eksik_adet),
          fazla: toInt(r.fazla_adet),
          durum: "Açık",
          mutabakat: "Beklemede",
          stokAck: "",
          merkezAck: "",
          malKabulAck: "",
          kayseriAck: "",
          subeAck: "",
          ekDosya: null,
          ekDosyalar: [],
          notlar: []
        };

        const dedupId = await makeBulkDedupId(currentSube, kayit.parti, kayit.urun, kayit.cikisDepo);
          if(seenDedup.has(dedupId)){
            dup++;
            report.push({
              "Satır": idx + 2,
              "Şube": currentSube,
              "Parti/Sevk No": kayit.parti,
              "Ürün": kayit.urun,
              "Çıkış Depo": kayit.cikisDepo,
              "Tekrar Nedeni": "Excel içinde tekrarlanan satır"
            });
          } else {
            seenDedup.add(dedupId);
            const docRef = db.collection("bildirimler").doc(dedupId);
            const snap = await docRef.get();
            if(snap.exists){
              dup++;
              report.push({
                "Satır": idx + 2,
                "Şube": currentSube,
                "Parti/Sevk No": kayit.parti,
                "Ürün": kayit.urun,
                "Çıkış Depo": kayit.cikisDepo,
                "Tekrar Nedeni": "Sistemde zaten var"
              });
            } else {
              kayit.id = dedupId;
              await docRef.set(kayit);
              done++;
            }
          }
        setStatus(`Gönderiliyor ${done}/${parsedRows.length}`, "");
      }

      setStatus(`Toplu gönderim tamamlandı: ${done}/${parsedRows.length}`, "success");
      showToast(`Toplu gönderim tamamlandı: ${done} kayıt (Tekrarlanan: ${dup})`, "success");
      if (report.length){
        const want = confirm("Tekrarlanan satırlar raporu indirilsin mi?");
        if (want) downloadCsv(`tekrarlanan_satirlar_${Date.now()}.csv`, report);
      }
      parsedRows = [];
      input.value = "";
    }catch(e){
      console.error(e);
      setStatus("Toplu gönderim hatası: " + (e.message || e), "error");
      showToast("Toplu gönderim sırasında hata oluştu.", "error");
    }finally{
      btnUpload.disabled = false;
      btnSelect.disabled = false;
    }
  });

})();


// === BULK EXCEL HELPERS ===
function getActiveSubeForBulk() {
  // Prefer global state if exists
  if (window.appState && window.appState.currentSube) return window.appState.currentSube;
  if (window.state && window.state.currentSube) return window.state.currentSube;

  // NEW: Prefer New-Bildirim formundaki Şube alanı (readonly)
  const nb = document.getElementById("nbSube");
  if (nb && nb.value) return nb.value;

  // Try other currently selected UI elements
  const el = document.getElementById("loginSubeSelect") || document.getElementById("subeSelect");
  if (el && el.value) return el.value;

  // Fallback: try localStorage keys used by the app
  try {
    const ls = localStorage.getItem("currentSube") || localStorage.getItem("sube") || localStorage.getItem("selectedSube");
    if (ls) return ls;
  } catch (e) {}
  return "";
}


// === BULK EXCEL DEDUP HELPERS ===
async function makeBulkDedupId(currentSube, partiSevkNo, urun, cikisDepo) {
  // Build a stable, normalized dedup key to prevent false duplicates
  const normalizeKey = (v) =>
    String(v ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  const raw = [
    normalizeKey(currentSube),
    normalizeKey(partiSevkNo),
    normalizeKey(urun),
    normalizeKey(cikisDepo),
  ].join("|");

  // Fast non-crypto hash (FNV-1a 32-bit) – deterministic and synchronous
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to unsigned 32-bit hex
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return "BULK_" + hex;
}


function downloadCsv(filename, rows) {
  if (!rows || !rows.length) return;
  const escape = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  };
  const keys = Object.keys(rows[0] || {});
  const csv = [keys.join(",")].concat(rows.map(r => keys.map(k => escape(r[k])).join(","))).join("\n");
  const blob = new Blob(["\ufeff" + csv], {type:"text/csv;charset=utf-8;"});
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}



/** Smoothly counts up KPI numbers on the Reports page */
function animateKpiCounts(){
  const kpiEls = document.querySelectorAll("#page-raporlar .kpi-value, #page-raporlar .kpi-number, #page-raporlar .kpi-card .kpi-value, #page-raporlar .kpi-card h2");
  kpiEls.forEach(el=>{
    const raw = (el.dataset.targetValue || el.textContent || "").trim();
    const target = parseInt(raw.replace(/[^\d]/g,""), 10);
    if(!Number.isFinite(target)) return;
    // avoid re-animating the same element repeatedly
    if(el.dataset.animated === "1") return;
    el.dataset.animated = "1";
    el.dataset.targetValue = String(target);
    el.textContent = "0";
    countUp(el, target, 700);
  });
}

/** requestAnimationFrame based counter */
function countUp(el, target, durationMs){
  const start = performance.now();
  const from = 0;
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

  function frame(now){
    const t = Math.min(1, (now - start) / durationMs);
    const v = Math.round(from + (target - from) * easeOutCubic(t));
    el.textContent = v.toLocaleString("tr-TR");
    if(t < 1){
      requestAnimationFrame(frame);
    }else{
      // tiny "pop" when reaching the final value
      try{
        el.classList.remove("kpi-number-pop");
        // force reflow to restart animation
        void el.offsetWidth;
        el.classList.add("kpi-number-pop");
      }catch(_){}
    }
  }
  requestAnimationFrame(frame);
}

// Ensure functions are accessible on window even if script is loaded as module or re-executed
try{
  window.toggleOwnerEdit = toggleOwnerEdit;
  window.toggleBranchEdit = toggleBranchEdit;
  window.toggleAllOwnerEdits = toggleAllOwnerEdits;
}catch(e){}


function refreshMudurDepoTakip(){
  try{
    const tbody = document.getElementById("tblMudurDepoTakip");
    if(!tbody) return;

    const depolar = ["Merkez Depo","Kayseri Depo","TRF transfer","ANADOLU","Merkez Malkabul"];
    const safeTrim = (v)=> (v==null ? "" : String(v)).trim();
    const lower = (v)=> safeTrim(v).toLocaleLowerCase('tr-TR');
    const isClosed = (value)=> lower(value) === "kapandı";
    const hasText = (value)=> safeTrim(value) !== "";
    const toDate = (v)=>{
      if(!v) return null;
      if(typeof v.toDate === "function") return v.toDate();
      if(v instanceof Date) return v;
      if(typeof v === "object" && typeof v.seconds === "number") return new Date(v.seconds * 1000);
      const d = new Date(v);
      return Number.isFinite(d.getTime()) ? d : null;
    };
    const responseAtFor = (r, depo)=>{
      const created = toDate(r.createdAt || r.tarihISO || r.tarih);
      if(!created) return null;
      const firstResponse = toDate(r.firstResponseAt);
      const closedAt = toDate(r.closedAt);
      const ackAt = depo === "Merkez Depo"
        ? toDate(r.merkezAckAt)
        : toDate(r.kayseriAckAt || r.malKabulAckAt);
      return firstResponse || ackAt || closedAt || null;
    };
    const isAnsweredForDepo = (r, depo)=>{
      const ilgiliSubeAciklamaDolu = depo === "Merkez Depo"
        ? hasText(r.merkezAck)
        : hasText(r.kayseriAck) || hasText(r.malKabulAck);
      return isClosed(r.durum) || ilgiliSubeAciklamaDolu;
    };
    const formatAvgDays = (value)=> value > 0 ? `${value.toFixed(1)} gün` : "0 gün";

    const rows = depolar.map((depo)=>{
      const list = (bildirimler || []).filter(r => safeTrim(r.cikisDepo) === depo);
      const toplam = list.length;
      const cevaplanmisList = list.filter(r => isAnsweredForDepo(r, depo));
      const cevaplanmis = cevaplanmisList.length;
      const bekleyen = Math.max(0, toplam - cevaplanmis);
      const oran = toplam > 0 ? Math.round((cevaplanmis/toplam)*100) : 0;

      let toplamGun = 0;
      let sureAdet = 0;
      cevaplanmisList.forEach(r => {
        const created = toDate(r.createdAt || r.tarihISO || r.tarih);
        const responseAt = responseAtFor(r, depo);
        if(!created || !responseAt) return;
        const diffMs = responseAt.getTime() - created.getTime();
        if(diffMs < 0) return;
        toplamGun += diffMs / 86400000;
        sureAdet += 1;
      });
      const ortSure = sureAdet > 0 ? (toplamGun / sureAdet) : 0;

      return {depo, toplam, cevaplanmis, bekleyen, oran, ortSure};
    });

    tbody.innerHTML = rows.map(r=>`
      <tr>
        <td><strong>${r.depo}</strong></td>
        <td>${r.toplam}</td>
        <td>${r.cevaplanmis}</td>
        <td>${r.bekleyen}</td>
        <td>%${r.oran}</td>
        <td>${formatAvgDays(r.ortSure)}</td>
      </tr>
    `).join("");

    if(typeof refreshMudurStokKontrolPerf==="function") refreshMudurStokKontrolPerf();
    if(typeof refreshMudurSonBildirim==="function") refreshMudurSonBildirim();
  }catch(e){
    console.error("refreshMudurDepoTakip error", e);
  }
}



function refreshMudurSonBildirim(){
  try{
    const tbody = document.getElementById("tblMudurSonBildirim");
    if(!tbody) return;

    const parseDate = (value)=>{
      const t = (value == null ? "" : String(value)).trim();
      if(!t) return null;
      if(/^\d{4}-\d{2}-\d{2}/.test(t)){
        const d = new Date(t.slice(0,10) + "T00:00:00");
        return Number.isFinite(d.getTime()) ? d : null;
      }
      const m = t.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
      if(m){
        const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        return Number.isFinite(d.getTime()) ? d : null;
      }
      const d = new Date(t);
      return Number.isFinite(d.getTime()) ? d : null;
    };
    const formatDate = (date)=>{
      if(!date) return "YOK";
      const dd = String(date.getDate()).padStart(2, "0");
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const yy = date.getFullYear();
      return `${dd}.${mm}.${yy}`;
    };
    const getIdleDays = (date)=>{
      if(!date) return null;
      const today = new Date();
      const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const lastOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      return Math.max(0, Math.floor((todayOnly - lastOnly) / 86400000));
    };

    const subeler = Array.from(new Set([...(SUBELER || []), ...((bildirimler || []).map(k => (k.sube || "").trim()).filter(Boolean))])).filter(s => s !== "TRF transfer");

    const rows = subeler.map((sube)=>{
      const list = (bildirimler || []).filter(k => String(k.sube || "").trim() === sube);
      let last = null;
      list.forEach((k)=>{
        const d = parseDate(k.tarihISO || k.tarih || k.createdAt);
        if(d && (!last || d > last)) last = d;
      });
      const idleDays = getIdleDays(last);
      return { sube, last, display: formatDate(last), idleDays };
    }).sort((a,b)=>{
      if(!a.last && !b.last) return a.sube.localeCompare(b.sube, 'tr');
      if(!a.last) return -1;
      if(!b.last) return 1;
      if(a.last.getTime() !== b.last.getTime()) return a.last - b.last;
      return a.sube.localeCompare(b.sube, 'tr');
    });

    tbody.innerHTML = rows.map(r => `
      <tr class="${!r.last ? 'depo-no-data-row' : (r.idleDays != null && r.idleDays > 20 ? 'depo-stale-row' : '')}">
        <td><strong>${escapeHtml(r.sube)}</strong></td>
        <td class="text-center depo-mid-cell">${r.last ? escapeHtml(r.display) : '<span class="depo-empty-date">YOK</span>'}</td>
        <td class="text-center depo-mid-cell">${r.idleDays == null ? '<span class="depo-empty-date">YOK</span>' : `${r.idleDays} gün`}</td>
      </tr>
    `).join('');
  }catch(e){
    console.error("refreshMudurSonBildirim error", e);
  }
}

async function refreshMudurStokKontrolPerf(){
  try{
    const tbody = document.getElementById("tblMudurStokKontrolPerf");
    if(!tbody) return;
    const safeTrim = (v)=> (v==null ? "" : String(v)).trim();
    const lower = (v)=> safeTrim(v).toLocaleLowerCase('tr-TR');
    const list = (bildirimler || []).slice();

    let stokUsers = [];
    try{
      if(window.db && typeof window.db.collection === "function"){
        const snap = await window.db.collection("users").where("role", "==", "stok").get();
        stokUsers = snap.docs.map(d => {
          const u = d.data() || {};
          return {
            email: safeTrim(u.email),
            name: safeTrim(u.name) || safeTrim(u.email) || "Stok Kullanıcısı"
          };
        }).filter(u => !!u.email);
      }
    }catch(_e){
      stokUsers = [];
    }

    const seen = new Set();
    const rows = [];
    stokUsers.forEach(u => {
      const key = lower(u.email);
      if(!key || seen.has(key)) return;
      seen.add(key);
      rows.push({ email: u.email, name: u.name });
    });

    list.forEach(r => {
      [r.stokLastActorEmail, r.stokAckByEmail, r.closedByEmail].forEach(v => {
        const email = safeTrim(v);
        const key = lower(email);
        if(!key || seen.has(key)) return;
        seen.add(key);
        rows.push({ email, name: email });
      });
    });

    const getOwnerEmail = (r) => safeTrim(r.stokLastActorEmail || r.stokAckByEmail || r.closedByEmail);

    if(!rows.length){
      const toplam = list.length;
      const cevaplanmis = list.filter(r=> safeTrim(r.stokAck).length > 0).length;
      const bekleyen = Math.max(0, toplam - cevaplanmis);
      const oran = toplam > 0 ? Math.round((cevaplanmis/toplam)*100) : 0;
      const kapatilan = list.filter(r=> safeTrim(r.durum) === "Kapandı").length;
      tbody.innerHTML = `
        <tr>
          <td><strong>Tüm Bildirimler</strong></td>
          <td>${toplam}</td>
          <td>${cevaplanmis}</td>
          <td>${bekleyen}</td>
          <td>%${oran}</td>
          <td>${kapatilan}</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rows.map(u => {
      const owned = list.filter(r => lower(getOwnerEmail(r)) === lower(u.email));
      const toplam = owned.length;
      const cevaplanmis = owned.filter(r => safeTrim(r.stokAck).length > 0).length;
      const bekleyen = Math.max(0, toplam - cevaplanmis);
      const oran = toplam > 0 ? Math.round((cevaplanmis/toplam)*100) : 0;
      const kapatilan = list.filter(r => lower(r.closedByEmail) === lower(u.email) && safeTrim(r.durum) === "Kapandı").length;
      return `
        <tr>
          <td><strong>${escapeHtml(u.name)}</strong><div class="small-text" style="opacity:.8;">${escapeHtml(u.email)}</div></td>
          <td>${toplam}</td>
          <td>${cevaplanmis}</td>
          <td>${bekleyen}</td>
          <td>%${oran}</td>
          <td>${kapatilan}</td>
        </tr>
      `;
    }).join('');
  }catch(e){
    console.error("refreshMudurStokKontrolPerf error", e);
  }
}
