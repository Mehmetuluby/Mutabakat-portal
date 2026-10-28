

/* ===== extra scripts moved from monolith ===== */

// Mark as not-ready ASAP (in case cached HTML had auth-ready)
  document.documentElement.classList.add('auth-loading');
  document.documentElement.classList.remove('auth-ready');
  document.addEventListener('DOMContentLoaded', function(){
    document.body && document.body.classList.remove('auth-ready');
  });

(function(){
  function $(id){return document.getElementById(id);}
  const gate = $("authGate");
  const errEl = $("authErr");
  const btnLogin = $("authLoginBtn");
  const btnLogout = $("authLogoutBtn");
  const emailEl = $("authEmail");
  const passEl = $("authPass");
  const rememberEl = $("rememberMe");
  const splash = $("authSplash");
  function showSplash(){ if(splash) splash.classList.remove("hidden"); }
  function hideSplash(){ if(splash) splash.classList.add("hidden"); }


  // Remember-me behavior:
  // - If "Beni hatırla" checked (saved), keep LOCAL persistence and allow auto-login.
  // - Otherwise force a fresh login on each page load using NONE persistence.
  const REMEMBER_KEY = "mp_remember_me_v1";
  const remembered = (function(){
    try{ return localStorage.getItem(REMEMBER_KEY) === "1"; }catch(_){ return false; }
  })();
  if(rememberEl) rememberEl.checked = remembered;

  try{
    firebase.auth().setPersistence(
      remembered ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION
    );
  }catch(e){}
  function showGate(){
    try{ document.body && document.body.classList.add("auth-mode"); }catch(_){}
    if(!gate) return;
    gate.style.display = "flex";
    gate.setAttribute("aria-hidden","false");
    document.documentElement.style.overflow = "hidden";
  }
  function hideGate(){
    try{ document.body && document.body.classList.remove("auth-mode"); }catch(_){}
    if(!gate) return;
    gate.style.display = "none";
    gate.setAttribute("aria-hidden","true");
    document.documentElement.style.overflow = "";
  }
  function cleanEmail(v){
    return (v||"").replace(/[\u200B-\u200D\uFEFF]/g,"").trim().toLowerCase();
  }

  // Always start gated until auth state arrives
  showGate();
  if(errEl) errEl.textContent = "";

  
  function trAuthError(e){
    const code = (e && e.code) ? String(e.code) : "";
    // For login failures, avoid revealing whether email exists.
    const generic = "E-posta veya şifre hatalı.";
    if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential" || code === "auth/invalid-login-credentials") return generic;
    if (code === "auth/invalid-email") return "E-posta formatı hatalı.";
    if (code === "auth/too-many-requests") return "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.";
    if (code === "auth/user-disabled") return "Bu kullanıcı devre dışı bırakılmış.";
    // Default
    return (e && e.message) ? e.message : "İşlem başarısız.";
  }
  window.trAuthError = trAuthError;
let __loginInFlight = false;
  async function performLogin(){
    if(__loginInFlight) return;
    if(errEl) errEl.textContent = "";
    const email = cleanEmail(emailEl && emailEl.value);
    const pass = (passEl && passEl.value) || "";
    // Giriş animasyonu: buton yükleme durumuna geçer (spinner + "Giriş yapılıyor...")
    __loginInFlight = true;
    const __btnOldHtml = btnLogin ? btnLogin.innerHTML : "";
    if(btnLogin){
      btnLogin.disabled = true;
      btnLogin.classList.add("btn-loading");
      btnLogin.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>Giriş yapılıyor...</span>';
    }
    try{
      // Apply persistence based on checkbox
      const wantRemember = !!(rememberEl && rememberEl.checked);
      try{
        await firebase.auth().setPersistence(
          wantRemember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION
        );
        try{ localStorage.setItem(REMEMBER_KEY, wantRemember ? "1" : "0"); }catch(_){ }
      }catch(_){
        // ignore persistence failures
      }
      // ÖNEMLİ: giriş başarılı olur olmaz onAuthStateChanged splash'i açıp
      // login kutusunu anında kapatıyor. Bu yüzden spinner'ı GİRİŞTEN ÖNCE bir
      // süre gösteriyoruz — o an henüz auth state değişmediği için animasyon
      // kesin görünür.
      await new Promise(r=>setTimeout(r, 700));
      await firebase.auth().signInWithEmailAndPassword(email, pass);
      // Başarılı: giriş kutusunu yumuşakça soldurup yukarı süzülerek çıkar
      const gate = document.getElementById("authGate");
      if(gate){ gate.classList.add("auth-success"); }
      // onAuthStateChanged devralır; butonu başarı durumunda bırak
    }catch(e){
      if(errEl) errEl.textContent = trAuthError(e);
      // Hata: butonu eski haline döndür
      if(btnLogin){
        btnLogin.disabled = false;
        btnLogin.classList.remove("btn-loading");
        btnLogin.innerHTML = __btnOldHtml || "Giriş Yap";
      }
      __loginInFlight = false;
    }
  }

  btnLogin && (btnLogin.onclick = performLogin);

  [emailEl, passEl].forEach((el)=>{
    if(!el) return;
    el.addEventListener("keydown", function(e){
      if(e.key === "Enter"){
        e.preventDefault();
        performLogin();
      }
    });
  });

  btnLogout && (btnLogout.onclick = async function(){
    try{ await firebase.auth().signOut(); }catch(_){}
  });

  firebase.auth().onAuthStateChanged(async function(user){
    showSplash();

    if(!user){
      if(btnLogout) btnLogout.style.display = "none";
      const lp0=document.getElementById("loginPage"); if(lp0) lp0.style.display="none";
      const ar0=document.getElementById("appRoot"); if(ar0) ar0.style.display="none";
      hideSplash();
      showGate();
      return;
    }

    // Logged in: hide auth gate and keep splash while we load role/sube.
    if(btnLogout) btnLogout.style.display = "none";
    hideGate();
    const lp1=document.getElementById("loginPage"); if(lp1) lp1.style.display="none";
    const ar1=document.getElementById("appRoot"); if(ar1) ar1.style.display="none";

    const lp2 = document.getElementById("loginPage");
    const ar2 = document.getElementById("appRoot");
    if(lp2) lp2.style.display = "none";
    if(ar2) ar2.style.display = "none";

    try{
      // Fetch role/sube from Firestore users/{uid}
      if(typeof db !== "undefined" && db && db.collection){
        const uSnap = await db.collection("users").doc(user.uid).get();
        if(!uSnap.exists){
          if(errEl) errEl.textContent = "Rol tanımlı değil (Firestore users/"+user.uid+").";
          showGate();
          return;
        }
        const u = uSnap.data() || {};
        window.currentRole = u.role || window.currentRole;
        window.currentSube = u.sube || window.currentSube;

        // Persist role/sube into the portal session so other scripts can proceed.
        try{
          const key = (typeof SESSION_KEY !== "undefined") ? SESSION_KEY : "mp_session_entegre_v1";
          localStorage.setItem(key, JSON.stringify({ role: (window.currentRole||"sube"), sube: (window.currentSube||"") }));
        }catch(_){ }
      }

      // Now show the main app and close the gate.
      if(lp2) lp2.style.display = "none";
      if(ar2) ar2.style.display = "block";
      hideGate();
      hideSplash();
      document.documentElement.classList.remove("auth-loading");
    }catch(e){
      if(errEl) errEl.textContent = (e && e.message) ? e.message : "Rol okunamadı";
      hideSplash();
      document.documentElement.classList.remove("auth-loading");
      showGate();
    }
  });
})();

(function(){
  // ===== Hard lock role/sube based on Firestore users/{uid} =====
  // This prevents selecting another branch (e.g., TRAKYA) even if UI shows it.
  let __lockedRole = null;
  let __lockedSube = null;

  function __getDb(){
    try{
      // db is defined in main code
      if (typeof db !== "undefined") return db;
    }catch(e){}
    try{
      if (typeof firebase !== "undefined" && firebase.firestore) return firebase.firestore();
    }catch(e){}
    return null;
  }

  async function __fetchLock(user){
    try{
      const _db = __getDb();
      if(!_db) return;
      const snap = await _db.collection("users").doc(user.uid).get();
      if(!snap.exists) return;
      const data = snap.data() || {};
      __lockedRole = (data.role || "").toString();
      __lockedSube = (data.sube || "").toString();
      // Apply immediately
      if(__lockedRole){ window.currentRole = __lockedRole; try{ currentRole = __lockedRole; }catch(e){} }
      if(__lockedSube){ window.currentSube = __lockedSube; try{ currentSube = __lockedSube; }catch(e){} }

      // Lock UI selects if present
      const roleSel = document.querySelector('#roleSelect, #role, select[name="role"], select#roleSelect, select#role');
      const subeSel = document.querySelector('#subeSelect, #sube, select[name="sube"], select#subeSelect, select#sube');
      if(roleSel && __lockedRole){
        // try set matching option by value or text
        const v = __lockedRole;
        if ([...roleSel.options].some(o=>o.value===v)) roleSel.value = v;
        else {
          const opt = [...roleSel.options].find(o=> (o.textContent||"").toLowerCase().includes(v));
          if(opt) roleSel.value = opt.value;
        }
        roleSel.dispatchEvent(new Event("change"));
        roleSel.disabled = true;
      }
      if(subeSel && __lockedSube){
        if ([...subeSel.options].some(o=>o.value===__lockedSube)) subeSel.value = __lockedSube;
        else {
          const opt = [...subeSel.options].find(o=> (o.textContent||"").trim().toUpperCase() === __lockedSube.toUpperCase());
          if(opt) subeSel.value = opt.value;
        }
        subeSel.dispatchEvent(new Event("change"));
        if(__lockedRole === "sube") subeSel.disabled = true;
      }

      // Also force portal session in localStorage to match locked values
      try{
        const key = (typeof SESSION_KEY !== "undefined") ? SESSION_KEY : "mp_session_entegre_v1";
        localStorage.setItem(key, JSON.stringify({ role: (__lockedRole||"sube"), sube: (__lockedSube||"") }));
      }catch(e){}
    }catch(e){
      console.error("[LOCK] fetchLock error", e);
    }
  }

  // Block any restoreSession that violates lock
  try{
    const _origRestore = window.restoreSessionIfAny;
    window.restoreSessionIfAny = function(){
      try{
        const key = (typeof SESSION_KEY !== "undefined") ? SESSION_KEY : "mp_session_entegre_v1";
        const raw = localStorage.getItem(key);
        if(raw){
          const s = JSON.parse(raw);
          if(__lockedSube && s && s.sube && s.sube.toUpperCase() !== __lockedSube.toUpperCase()){
            localStorage.setItem(key, JSON.stringify({ role: (__lockedRole||s.role||"sube"), sube: __lockedSube }));
          }
        }
      }catch(e){}
      if (typeof _origRestore === "function") return _origRestore();
    };
  }catch(e){}

  // Hook afterLogin to re-apply lock right before showing app
  try{
    const _origAfter = window.afterLogin || (typeof afterLogin === "function" ? afterLogin : null);
    if(_origAfter){
      const wrapped = function(){
        try{
          if(__lockedRole){ try{ currentRole = __lockedRole; }catch(e){} window.currentRole = __lockedRole; }
          if(__lockedSube){ try{ currentSube = __lockedSube; }catch(e){} window.currentSube = __lockedSube; }
        }catch(e){}
        return _origAfter.apply(this, arguments);
      };
      window.afterLogin = wrapped;
      try{ afterLogin = wrapped; }catch(e){}
    }
  }catch(e){}

  // Make sure we fetch lock as soon as auth is available
  document.addEventListener("DOMContentLoaded", () => {
    try{
      if (typeof firebase === "undefined" || !firebase.auth) return;
      firebase.auth().onAuthStateChanged((user) => {
        if(user) __fetchLock(user);
      });
    }catch(e){ console.error("[LOCK] auth bind error", e); }
  });
})();

(function(){
  const SESSION_KEY = "mp_session_entegre_v1";
  function $(id){ return document.getElementById(id); }

  async function getUserInfo(user){
    try{
      const db = window.db || (window.firebase && window.firebase.firestore ? window.firebase.firestore() : null);
      if(!db) return null;
      const snap = await db.collection("users").doc(user.uid).get();
      if(!snap.exists) return null;
      const d = snap.data() || {};
      return { role: (d.role||"").toString().trim(), sube: (d.sube||"").toString().trim() };
    }catch(e){
      console.error("users/{uid} read failed:", e);
      return null;
    }
  }

  function forceSession(role, sube){
    try{ localStorage.setItem(SESSION_KEY, JSON.stringify({role, sube})); }catch(e){}
  }

  function normalizeSelect(sel, v){
    if(!sel) return null;
    const tgt = (v||"").trim();
    const opts = Array.from(sel.options||[]);
    const exact = opts.find(o => (o.value||"").trim()===tgt || (o.text||"").trim()===tgt);
    if(exact) return exact.value;
    const up = tgt.toUpperCase();
    const upm = opts.find(o => ((o.value||"").trim().toUpperCase()===up) || ((o.text||"").trim().toUpperCase()===up));
    return upm ? upm.value : null;
  }

  function applyRoleSube(role, sube){
    // Try common ids in this project
    const roleSel = document.querySelector("#roleSelect, #role, select[name='role']");
    const subeSel = document.querySelector("#subeSelect, #sube, select[name='sube']");
    if(roleSel && role){
      const rv = normalizeSelect(roleSel, role) || normalizeSelect(roleSel, "Şubeler") || normalizeSelect(roleSel, "ŞUBE") || roleSel.value;
      roleSel.value = rv;
      roleSel.dispatchEvent(new Event("change"));
      roleSel.disabled = true;
    }
    if(subeSel && sube){
      const sv = normalizeSelect(subeSel, sube) || subeSel.value;
      subeSel.value = sv;
      subeSel.dispatchEvent(new Event("change"));
      subeSel.disabled = true;
    }
  }

  function hideGate(){
    const g = $("authGate");
    if(g) g.style.display = "none";
    document.body.classList.add("__authed");
    try{ document.body.classList.remove("auth-mode"); }catch(_){}
  }
  function showGate(){
    const g = $("authGate");
    if(g) g.style.display = "flex";
    document.body.classList.remove("__authed");
    try{ document.body.classList.add("auth-mode"); }catch(_){}
  }

  async function safeAfterLogin(){
    try{ if(typeof window.loadLocal==="function") window.loadLocal(); }catch(e){ console.error(e); }
    try{ if(typeof window.afterLogin==="function") window.afterLogin(); }catch(e){ console.error(e); }
    try{ if(typeof window.refreshAll==="function") window.refreshAll(); }catch(e){ console.error(e); }
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    const auth = window.firebase?.auth ? window.firebase.auth() : null;
    if(!auth) return;

    // Wire existing topbar logout button to firebase.signOut too
    const topLogout = document.querySelector("#logoutBtn, #btnLogout, #cikisBtn, button[title='Çıkış Yap']");
    if(topLogout && !topLogout.__wired){
      topLogout.__wired = true;
      topLogout.addEventListener('click', async ()=>{ try{ await firebase.auth().signOut(); }catch(e){} });
    }

    auth.onAuthStateChanged(async (user)=>{
      if(!user){
        try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
        showGate();
        return;
      }
      const info = await getUserInfo(user);
      if(info && info.role){
        forceSession(info.role, info.sube||"");
        applyRoleSube(info.role, info.sube||"");
      }
      hideGate();
      await safeAfterLogin();
    });
  });
})();

(function(){
  function hideBar(){
    if(!document.body.classList.contains("__authed")) return;
    const nodes = Array.from(document.querySelectorAll("button, a, div, footer, section, header"));
    for(const el of nodes){
      const t = (el.innerText || "").trim();
      if(t === "Giriş Yap"){
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const wide = r.width > window.innerWidth * 0.6;
        const bottomish = r.top > window.innerHeight * 0.6;
        const fixedish = (s.position === "fixed" || s.position === "sticky");
        if(wide && (bottomish || fixedish)){
          el.style.display = "none";
          el.style.visibility = "hidden";
          el.style.height = "0";
        }
      }
    }
  }
  window.addEventListener("resize", hideBar);
  // poll a bit because some layouts render later
  let n=0;
  const iv=setInterval(()=>{ hideBar(); n++; if(n>10) clearInterval(iv); }, 500);
})();

(function(){
  function isMostlyEmpty(el){
    const t = (el.innerText || "").trim();
    if(t.length) return false;
    // ignore if it contains inputs/selects/canvas/table
    if(el.querySelector("input,select,textarea,canvas,table,button,a")) return false;
    const r = el.getBoundingClientRect();
    return r.height >= 20 && r.height <= 120 && r.width > window.innerWidth * 0.6;
  }

  function hide(){
    if(!document.body.classList.contains("__authed")) return;
    // 1) hide the red "Giriş Yap" bottom bar
    const all = Array.from(document.querySelectorAll("button, a, div, footer, section, header"));
    for(const el of all){
      const t = (el.innerText || "").trim();
      if(t === "Giriş Yap"){
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const wide = r.width > window.innerWidth * 0.6;
        const bottomish = r.top > window.innerHeight * 0.55;
        const fixedish = (s.position === "fixed" || s.position === "sticky");
        if(wide && (bottomish || fixedish)){
          el.classList.add("__bottomLoginStrip");
          el.style.display = "none";
          // try parent too (often the parent gives height)
          if(el.parentElement && el.parentElement.getBoundingClientRect().height <= 140){
            el.parentElement.style.display = "none";
          }
        }
      }
    }

    // 2) hide two blank footer rows near the bottom (screenshot shows two white strips)
    const candidates = Array.from(document.querySelectorAll("div, section, footer"));
    for(const el of candidates){
      const r = el.getBoundingClientRect();
      const nearBottom = r.top > window.innerHeight * 0.55;
      if(nearBottom && isMostlyEmpty(el)){
        el.style.display = "none";
      }
    }
  }

  window.addEventListener("resize", hide);
  let n=0;
  const iv=setInterval(()=>{ hide(); n++; if(n>20) clearInterval(iv); }, 400);
})();

(function(){
  // ---- Toast ----
  function el(id){ return document.getElementById(id); }
  function ensureWrap(){
    var w = el("toastWrap");
    if(!w){
      w = document.createElement("div");
      w.id="toastWrap";
      w.className="toast-wrap";
      document.body.appendChild(w);
    }
    return w;
  }
  window.showToast = function(a, b, c, d){
    // Desteklenen çağrım tipleri:
    // 1) showToast(text, type)
    // 2) showToast(type, title, message, timeoutMs)
    try{
      var types = {success:1, error:1, info:1, warn:1, warning:1};
      var type="info", title="", message="", timeout;

      if(typeof a==="string" && types[a]){
        // (type, title, message, timeout)
        type = (a==="warning") ? "warn" : a;
        title = (typeof b==="string") ? b : "";
        message = (typeof c==="string") ? c : "";
        timeout = d;
      }else{
        // (text, type)
        message = (typeof a==="string") ? a : "";
        type = (typeof b==="string" && types[b]) ? ((b==="warning")?"warn":b) : "info";
        timeout = c;
      }

      var wrap = ensureWrap();
      var t = document.createElement("div");
      t.className = "toast " + (type || "info");
      t.innerHTML = '<div class="dot"></div><div><div class="title"></div><div class="msg"></div></div>';
      t.querySelector(".title").textContent = title || "";
      t.querySelector(".msg").textContent = message || "";
      wrap.appendChild(t);
      // animate in
      setTimeout(function(){ t.classList.add("show"); }, 10);
      var ms = (typeof timeout === "number" ? timeout : 3200);
      setTimeout(function(){
        t.classList.remove("show");
        setTimeout(function(){ t.remove(); }, 220);
      }, ms);
    }catch(e){ console.log(a, b, c); }
  };

  // ---- Auth error TR map ----
  window.trAuthError = function(err){
    var code = (err && (err.code || err.name)) ? String(err.code || err.name) : "";
    code = code.toLowerCase();
    var msg = (err && err.message) ? String(err.message) : "";
    var map = {
      "auth/invalid-email": "Email formatı hatalı. Lütfen kontrol edin.",
      "auth/missing-email": "Lütfen email adresinizi yazın.",
      "auth/user-disabled": "Bu kullanıcı devre dışı bırakılmış.",
      "auth/user-not-found": "Bu email ile kayıtlı kullanıcı bulunamadı.",
      "auth/wrong-password": "Şifre hatalı. Tekrar deneyin.",
      "auth/too-many-requests": "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.",
      "auth/network-request-failed": "Ağ hatası. İnternet bağlantınızı kontrol edin.",
      "auth/internal-error": "Sistem hatası. Lütfen tekrar deneyin.",
      "auth/invalid-login-credentials": "Email veya şifre hatalı.",
      "auth/invalid-credential": "E-posta veya şifre hatalı.",
      "auth/operation-not-allowed": "Email/şifre ile giriş bu projede kapalı."
    };
    if(map[code]) return map[code];

    // Heuristics
    if(/no firebase app/i.test(msg)) return "Sistem hazırlanamıyor (Firebase başlatılamadı). Sayfayı yenileyip tekrar deneyin.";
    if(/network/i.test(msg)) return "Ağ hatası. İnternet bağlantınızı kontrol edin.";
    return msg || "Bir hata oluştu. Lütfen tekrar deneyin.";
  };

  // ---- Loading state helper (minimal intrusion) ----
  window.setUILoading = function(isLoading, opts){
    opts = opts || {};
    var btnIds = opts.btnIds || ["authLoginBtn", "loginBtn", "btnLogin", "girisBtn"]; // best-effort
    btnIds.forEach(function(id){
      var b = el(id);
      if(b){
        b.disabled = !!isLoading;
        b.style.opacity = isLoading ? "0.7" : "";
        b.style.cursor = isLoading ? "not-allowed" : "";
      }
    });

    // Try common table container for "Gelen Bildirimler"
    var t = el("gelenBildirimlerTable") || el("tblGelenBildirimler") || el("gelenBildirimler") || el("tableGelenBildirimler");
    var holder = el("gelenLoadingHint");
    if(isLoading){
      if(t && !holder){
        holder = document.createElement("div");
        holder.id = "gelenLoadingHint";
        holder.style.margin = "10px 0";
        holder.style.fontSize = "12px";
        holder.style.color = "#555";
        holder.textContent = "Yükleniyor…";
        t.parentNode.insertBefore(holder, t);
      }
    }else{
      if(holder) holder.remove();
    }
  };

  // Patch empty-state if table body is empty (best-effort, call after refresh)
  window.ensureEmptyState = function(tbodyEl){
    try{
      if(!tbodyEl) return;
      var rows = tbodyEl.querySelectorAll("tr");
      if(rows.length === 0){
        var tr = document.createElement("tr");
        tr.innerHTML = '<td colspan="99" style="padding:14px;text-align:center;color:#666;font-size:13px;">Kayıt bulunamadı.</td>';
        tbodyEl.appendChild(tr);
      }
    }catch(e){}
  };

})();

(function(){
  function isEmptyBar(el){
    const txt = (el.textContent || "").replace(/\s+/g,'').trim();
    if(txt.length) return false;
    if(el.querySelector("input,select,textarea,button,a,canvas,table,svg,img")) return false;
    const r = el.getBoundingClientRect();
    if(r.width < window.innerWidth * 0.7) return false;
    if(r.height < 10 || r.height > 200) return false;
    if(r.top < window.innerHeight * 0.45) return false;
    return true;
  }

  function nuke(){
    if(!document.body.classList.contains("__authed")) return;
    const els = Array.from(document.querySelectorAll("footer, .footer, .page-footer, .bottom-bar, .bottom, div, section, main"));
    for(const el of els){
      if(isEmptyBar(el)){
        el.style.display = "none";
        el.style.height = "0";
        el.style.margin = "0";
        el.style.padding = "0";
      }
    }
    document.body.style.paddingBottom = "0";
    document.body.style.marginBottom = "0";
  }

  window.addEventListener("resize", nuke);
  let i=0;
  const iv=setInterval(()=>{ nuke(); i++; if(i>30) clearInterval(iv); }, 300);
})();
