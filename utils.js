// Basit toast + hata dönüştürücü yardımcıları
(function(){
  const TOAST_ID = "toastContainer";

  function ensureContainer(){
    let c = document.getElementById(TOAST_ID);
    if(!c){
      c = document.createElement("div");
      c.id = TOAST_ID;
      c.className = "toast-wrap";
      document.body.appendChild(c);
    }
    return c;
  }

  function safeMsg(err){
    if(!err) return "Bilinmeyen hata";
    const code = err.code || err?.error?.code;
    const msg = err.message || String(err);
    const map = {
      "auth/invalid-email": "E‑posta adresi geçersiz.",
      "auth/user-not-found": "Kullanıcı bulunamadı.",
      "auth/wrong-password": "Şifre hatalı.",
      "auth/too-many-requests": "Çok fazla deneme yapıldı. Lütfen biraz bekleyin.",
      "auth/network-request-failed": "Ağ hatası. İnternet bağlantısını kontrol edin.",
      "auth/api-key-not-valid-please-pass-a-valid-api-key.": "Firebase API anahtarı geçersiz. Firebase config / domain kısıtlarını kontrol edin."
    };
    if(code && map[code]) return map[code];
    if(msg && msg.includes("api-key-not-valid")) return map["auth/api-key-not-valid-please-pass-a-valid-api-key."];
    return msg;
  }

  // Desteklenen çağrım tipleri:
  // 1) showToast(text, type)
  // 2) showToast(type, title, message, durationMs)
  function showToast(a, b, c, d){
    let type = "info";
    let title = "";
    let message = "";
    let durationMs;

    const types = new Set(["success","error","info","warn","warning"]);

    if(typeof a === "string" && types.has(a) && (typeof b === "string" || typeof c === "string")){
      // (type, title, message, duration)
      type = (a === "warning") ? "warn" : a;
      title = typeof b === "string" ? b : "";
      message = typeof c === "string" ? c : "";
      durationMs = typeof d === "number" ? d : undefined;
    } else {
      // (text, type)
      message = (typeof a === "string") ? a : String(a);
      type = (typeof b === "string") ? b : "info";
      type = (type === "warning") ? "warn" : type;
      durationMs = undefined;
    }

    const ctn = ensureContainer();
    const el = document.createElement("div");
    el.className = "toast " + (type || "info");

    const dot = document.createElement("span");
    dot.className = "dot";

    const body = document.createElement("div");
    body.className = "body";

    if(title){
      const t = document.createElement("div");
      t.className = "title";
      t.textContent = title;
      body.appendChild(t);
    }

    const msgEl = document.createElement("div");
    msgEl.className = "msg";
    msgEl.textContent = message;
    body.appendChild(msgEl);

    el.appendChild(dot);
    el.appendChild(body);

    ctn.appendChild(el);
    setTimeout(()=>{ el.classList.add("show"); }, 10);

    const ttl = (typeof durationMs === "number") ? durationMs : ((type === "error") ? 5500 : 2600);
    setTimeout(()=>{
      el.classList.remove("show");
      setTimeout(()=>{ try{ ctn.removeChild(el);}catch(_){} }, 220);
    }, ttl);
  }

  function handleError(err, fallback){
    console.error(err);
    showToast(fallback ? (fallback + " " + safeMsg(err)) : safeMsg(err), "error");
  }

  window.showToast = window.showToast || showToast;
  window.safeMsg = window.safeMsg || safeMsg;
  window.handleError = window.handleError || handleError;
})();
