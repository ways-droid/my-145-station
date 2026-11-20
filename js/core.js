"use strict";
/* ======================= état & stockage ======================= */
const COLS = ["staff", "roster", "handovers", "shiftItems", "chargeLines", "partMoves", "needs", "situations", "expiries", "forms", "travel", "hotels", "aircraft", "clients", "products", "vehicles", "vehEvents", "faults", "driverLogs", "tires", "tools", "labs", "adminDocs", "adminFolders", "notes", "userPrefs", "links"];
const S = { settings: {}, loaded: {}, slow: false };
COLS.forEach(c => S[c] = []);
let db = null, assets = null, downloads = null, userCap = null, mode = "loading", readOnly = false;
const UI = { q: "", filter: "tous", tab: {}, nav: {} };

const DEFAULT_SETTINGS = {
  name: "my-145-station", approval: "", vat: "", address: "", email: "", phone: "", stationCode: "", stationName: "", timeZone: "", acTypes: "B747, B767, B777"
};
const settings = () => Object.assign({}, DEFAULT_SETTINGS, S.settings);
/* fuseau horaire de la station : celui des Paramètres, sinon déduit du code station (TLV par défaut), jamais celui de l'appareil
   (un navigateur en Belgique ne doit pas décider du shift en cours à Tel Aviv) */
const STATION_TZ = { TLV: "Asia/Jerusalem", ETM: "Asia/Jerusalem", HFA: "Asia/Jerusalem", LGG: "Europe/Brussels", BRU: "Europe/Brussels", CRL: "Europe/Brussels", OST: "Europe/Brussels",
  CGN: "Europe/Berlin", FRA: "Europe/Berlin", LEJ: "Europe/Berlin", MLA: "Europe/Malta", AMS: "Europe/Amsterdam", CDG: "Europe/Paris", LHR: "Europe/London", JFK: "America/New_York", HKG: "Asia/Hong_Kong", DWC: "Asia/Dubai", DXB: "Asia/Dubai" };
const stationTz = () => { const s = settings(); return s.timeZone || STATION_TZ[(s.stationCode || "TLV").toUpperCase()] || ""; };

/* ======================= utilitaires ======================= */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* langue : interface (choix de chaque utilisateur, gardé dans son navigateur) ; LANG peut être changé
   temporairement pour produire un PDF ou un e-mail dans la langue d'un client */
let UI_LANG = (() => { try { return localStorage.getItem("st-lang") === "en" ? "en" : "fr"; } catch { return "fr"; } })();
let LANG = UI_LANG;
const LOCALES = { fr: "fr-BE", en: "en-IE" };
const _fmt = {};
const nf = (k, o) => { const key = LANG + k; return _fmt[key] || (_fmt[key] = new Intl.NumberFormat(LOCALES[LANG], o)); };
const fmtN = { format: n => nf("n").format(n) };
const eur = n => nf("e", { style: "currency", currency: "EUR" }).format(+n || 0);
const eur0 = n => nf("e0", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(+n || 0);
const pad = (n, l = 2) => String(n).padStart(l, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const addMonths = (s, n) => { const d = new Date(s + "T12:00:00"); d.setMonth(d.getMonth() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
const fmtDT = iso => { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString(LANG === "en" ? "en-IE" : "fr-BE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); };
const fmtDate = s => s ? new Date(s + "T12:00:00").toLocaleDateString(LOCALES[LANG], { day: "2-digit", month: "short", year: "numeric" }) : "—";
const MONTHS_L = { fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."], en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };
const MONTHS = new Proxy([], { get: (t, k) => MONTHS_L[LANG][k] });
const r2 = n => Math.round((+n || 0) * 100) / 100;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr");
const client = id => S.clients.find(c => c.id === id);
const clientName = id => client(id)?.name || "—";
const val = id => { const e = document.getElementById(id); return e ? e.value.trim() : ""; };
const strip = o => { const c = Object.assign({}, o); delete c.id; return c; };
const clone = o => JSON.parse(JSON.stringify(o));
const plural = (n, s, p) => `${fmtN.format(n)} ${n > 1 ? (p || s + "s") : s}`;
function dueChip(date, soon = 30) {
  if (!date) return `<span class="muted">—</span>`;
  const d = daysBetween(today(), date);
  if (d < 0) return `<span class="chip bad">Dépassé · ${fmtDate(date)}</span>`;
  if (d <= soon) return `<span class="chip warn">${d === 0 ? "Aujourd'hui" : "Dans " + d + " j"} · ${fmtDate(date)}</span>`;
  return `<span class="num">${fmtDate(date)}</span>`;
}
/* messages système : empilés, chacun reste assez longtemps pour être lu, et ils partent dans l'ordre d'arrivée (FIFO).
   Les 3 derniers jours sont gardés dans ce navigateur (bouton « Messages » en haut à droite). */
const TOAST_LS = "st-toasts", TOAST_MAX = 5;
let toastLast = 0;
function toastLog() { try { const a = JSON.parse(localStorage.getItem(TOAST_LS) || "[]"); const lim = Date.now() - 3 * 86400000; return Array.isArray(a) ? a.filter(x => x.at > lim) : []; } catch { return []; } }
function toast(msg) {
  msg = String(msg ?? ""); if (!msg) return;
  try { const a = toastLog(); a.push({ at: Date.now(), msg }); localStorage.setItem(TOAST_LS, JSON.stringify(a.slice(-300))); } catch { }
  const box = document.getElementById("toast");
  const t = document.createElement("div"); t.className = "toast-i"; t.setAttribute("role", "status");
  const txt = document.createElement("span"); txt.textContent = msg;
  const x = document.createElement("button"); x.type = "button"; x.className = "toast-x"; x.setAttribute("aria-label", tr("Fermer")); x.textContent = "×";
  t.append(txt, x); box.append(t);
  while (box.children.length > TOAST_MAX) box.firstElementChild.remove();
  requestAnimationFrame(() => t.classList.add("show"));
  const gone = () => { if (!t.isConnected) return; t.classList.remove("show"); setTimeout(() => t.remove(), 250); };
  x.onclick = gone;
  /* durée selon la longueur (6 à 14 s), et jamais avant le message précédent : premier arrivé, premier parti */
  const due = Math.max(Date.now() + Math.min(14000, 6000 + msg.length * 45), toastLast + 900);
  toastLast = due;
  let left = due - Date.now(), timer = setTimeout(gone, left), t0 = Date.now();
  t.addEventListener("mouseenter", () => { clearTimeout(timer); left -= Date.now() - t0; });
  t.addEventListener("mouseleave", () => { t0 = Date.now(); timer = setTimeout(gone, Math.max(1500, left)); });
  document.querySelectorAll("[data-toast-n]").forEach(b => b.textContent = toastLog().length);
}
function toastLogOpen() {
  const a = toastLog().reverse();
  const when = at => new Date(at).toLocaleString(LANG === "en" ? "en-GB" : "fr-BE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const m = modal(`${mHead("Messages système")}<div class="body stack-s"><div class="muted small">${esc(tr("Messages affichés dans ce navigateur au cours des 3 derniers jours."))}</div>
    ${a.length ? `<ol class="toast-log">${a.map(x => `<li><span class="hist-t">${esc(when(x.at))}</span><span>${esc(tr(x.msg))}</span></li>`).join("")}</ol>` : `<div class="empty">${esc(tr("Aucun message."))}</div>`}</div>
    <footer>${a.length ? `<div class="left"><button class="btn" id="tl-clear">Effacer l'historique</button></div>` : ""}<button class="btn primary" data-close>Fermer</button></footer>`);
  const c = m.querySelector("#tl-clear"); if (c) c.onclick = () => { try { localStorage.removeItem(TOAST_LS); } catch { } closeModal(); toast("Historique des messages effacé"); };
};
async function waitFind(col, id) {
  for (let i = 0; i < 25; i++) { const x = S[col].find(x => x.id === id); if (x) return x; await new Promise(r => setTimeout(r, 120)); }
  return null;
}
function nextSeq(list, prefix) {
  let max = 0;
  for (const d of list) if (String(d.number || "").startsWith(prefix)) max = Math.max(max, parseInt(d.number.slice(prefix.length), 10) || 0);
  return prefix + pad(max + 1, 3);
}

/* ======================= base de données ======================= */
function onErr(e) {
  const code = e && e.code;
  if (code === "invalid_argument") { readOnly = true; render(true); toast("Accès en lecture seule : la modification n'a pas été enregistrée."); }
  else if (code === "quota_exceeded") toast("La base est pleine : supprimez d'anciens documents pour continuer.");
  else toast("Enregistrement impossible pour l'instant. Réessayez dans un instant." + (API && e && e.message ? " (" + e.message + ")" : ""));
  throw e;
}
function memUpsert(col, id, data, merge) {
  const arr = S[col]; const i = arr.findIndex(x => x.id === id);
  if (i >= 0) arr[i] = merge ? Object.assign({}, arr[i], data) : Object.assign({ id }, data);
  else arr.push(Object.assign({ id }, data));
  render();
}
async function save(col, id, data) {
  id = id || uid();
  if (!db) { memUpsert(col, id, data); return id; }
  try { await db.collection(col).doc(id).set(data); } catch (e) { onErr(e); }
  return id;
}
async function patch(col, id, data) {
  if (!db) { memUpsert(col, id, data, true); return id; }
  try { await db.collection(col).doc(id).update(data); } catch (e) { onErr(e); }
  return id;
}
async function remove(col, id) {
  if (!db) { S[col] = S[col].filter(x => x.id !== id); render(); return; }
  try { await db.collection(col).doc(id).delete(); } catch (e) { onErr(e); }
}
/* repère visuel des données d'exemple */
const demoTag = x => x && x.demo ? ` <span class="demo-tag" title="Donnée d'exemple : supprimable en un clic dans Paramètres">Exemple</span>` : "";
/* suppression de plusieurs documents d'une collection (en lot sur le serveur) */
async function removeMany(col, ids, onStep) {
  if (!ids.length) return 0;
  if (!db) { S[col] = S[col].filter(x => !ids.includes(x.id)); render(); return ids.length; }
  if (API) {
    for (let i = 0; i < ids.length; i += 200) { await API.removeMany(col, ids.slice(i, i + 200)); onStep && onStep(Math.min(i + 200, ids.length)); }
    return ids.length;
  }
  for (let i = 0; i < ids.length; i++) { await db.collection(col).doc(ids[i]).delete(); onStep && onStep(i + 1); }
  return ids.length;
}
async function saveSettings(data) {
  const full = Object.assign(settings(), data);
  if (!db) { S.settings = full; render(true); return; }
  try { await db.doc("settings/company").set(full); } catch (e) { onErr(e); }
}

/* ======================= serveur (API PHP) ======================= */
/* Hors claude.ai, l'application parle à l'API PHP du dossier api/ (client/ways-api.js).
   La clé d'accès provisoire est demandée une fois et gardée dans ce navigateur (en attendant le login). */
let API = null;
const SERVER = !(window.claude && window.claude.use) && /^https?:$/.test(location.protocol);
const blobUrl = id => API ? API.fileUrl(id) : "/_blob/" + encodeURIComponent(id);
const KEY_LS = "st-api-key";
function keyGate(msg) {
  return new Promise(resolve => {
    const w = document.createElement("div"); w.className = "keygate";
    w.innerHTML = `<form class="keybox"><h2>my-145-station</h2>
      <p class="muted small">${tr("Saisissez la clé d'accès de ce serveur (fournie par la page d'installation). Elle reste enregistrée dans ce navigateur.")}</p>
      ${msg ? `<div class="err">${esc(tr(msg))}</div>` : ""}
      <input type="password" id="kg-key" autocomplete="current-password" placeholder="${esc(tr("Clé d'accès"))}" required>
      <button class="btn primary">${tr("Se connecter")}</button></form>`;
    document.body.appendChild(w);
    const f = w.querySelector("form"), i = w.querySelector("#kg-key"); setTimeout(() => i.focus(), 30);
    f.onsubmit = e => { e.preventDefault(); const k = i.value.trim(); if (!k) return; w.remove(); resolve(k); };
  });
}
/* utilisateur connecté (version serveur) : { name, role, email } ; rôles : admin, bureau, terrain */
let ME = null, SBX = null;   /* SBX : environnement de test actif pour cette session ({since}) */
const SESSION_LS = "st-session";
const ROLE_LBL = { admin: "Administrateur", bureau: "Bureau", terrain: "Terrain" };
const isAdmin = () => !SERVER || !ME || ME.role === "admin";
/* modules masqués pour le rôle Terrain (pas de clients, de prix ni d'administration) */
const ROLE_HIDE = { terrain: ["charge", "clients", "produits", "admin", "historique", "parametres", "headquarters"], bureau: ["headquarters"] };
const isOffice = () => !ME || ME.key || ["admin", "bureau"].includes(ME.role);
const allowed = r => !ME || !(ROLE_HIDE[ME.role] || []).includes(r);
const lsGet = k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const lsSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { } };
async function apiPublic(method, path, body) {
  const r = await fetch("api/" + path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || "Erreur " + r.status); e.status = r.status; throw e; }
  return d;
}
/* écran de connexion : nom → code à 8 chiffres reçu par e-mail (ou code maître) */
function loginGate() {
  return new Promise(resolve => {
    const w = document.createElement("div"); w.className = "keygate";
    const last = lsGet("st-last-name");
    w.innerHTML = `<form class="keybox" id="lg"><h2>my-145-station</h2>
      <div id="lg-1" class="stack-s"><p class="muted small">${tr("Tapez votre nom et prénom : un code de connexion vous est envoyé par e-mail.")}</p>
        <input id="lg-name" autocomplete="username" placeholder="${esc(tr("Nom et prénom"))}" value="${esc(last)}" required>
        <button class="btn primary" id="lg-send">${tr("Recevoir mon code")}</button></div>
      <div id="lg-2" class="stack-s hidden"><p class="small" id="lg-sent"></p>
        <input id="lg-code" inputmode="numeric" autocomplete="one-time-code" placeholder="${esc(tr("Code à 8 chiffres"))}" maxlength="12">
        <button class="btn primary" id="lg-go">${tr("Se connecter")}</button>
        <div class="row-sb small"><button type="button" class="linkbtn" id="lg-back">${tr("Changer de nom")}</button><button type="button" class="linkbtn" id="lg-again">${tr("Renvoyer le code")}</button></div></div>
      <div id="lg-3" class="stack-s hidden"></div>
      <div class="err" id="lg-err"></div></form>`;
    const expired = lsGet("st-expired"); lsSet("st-expired", "");
    document.body.appendChild(w);
    const $ = id => w.querySelector("#" + id), err = $("lg-err");
    let step = 1;
    const show = n => { step = n; for (const k of [1, 2, 3]) $("lg-" + k).classList.toggle("hidden", n !== k); err.textContent = ""; setTimeout(() => (n === 1 ? $("lg-name") : n === 2 ? $("lg-code") : $("lg-tfa"))?.focus(), 30); };
    let T2 = null;   /* étape 2 : second facteur {ticket, tfa: "verify"|"enroll", secret, uri} */
    const done = r => { lsSet("st-last-name", $("lg-name").value.trim()); if (r.recovery) return showRecovery(r); w.remove(); resolve(r); };
    const showRecovery = r => {
      $("lg-3").innerHTML = `<p><b>${tr("Second facteur activé.")}</b></p><p class="small">${tr("Voici vos 8 codes de secours. Chacun ne sert qu'une fois, si vous n'avez plus votre téléphone. Gardez-les en lieu sûr (gestionnaire de mots de passe, papier sous clé).")}</p>
        <pre class="tfa-rec">${r.recovery.map(esc).join("\n")}</pre><div class="row-g"><button type="button" class="btn sm" id="lg-rcopy">${tr("Copier")}</button><button type="button" class="btn sm" id="lg-rdl">${tr("Télécharger")}</button></div>
        <label class="chk line small"><input type="checkbox" id="lg-rok"> ${tr("J'ai mis ces codes en lieu sûr")}</label><button type="button" class="btn primary" id="lg-rgo" disabled>${tr("Continuer")}</button>`;
      show(3); step = 4;
      const txt = "my-145-station — codes de secours (" + $("lg-name").value.trim() + ")\n\n" + r.recovery.join("\n") + "\n";
      $("lg-rcopy").onclick = () => { navigator.clipboard && navigator.clipboard.writeText(txt); $("lg-rcopy").textContent = tr("Copié"); };
      $("lg-rdl").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" })); a.download = "codes-secours-my-145-station.txt"; a.click(); };
      $("lg-rok").onchange = () => $("lg-rgo").disabled = !$("lg-rok").checked;
      $("lg-rgo").onclick = () => { w.remove(); resolve(r); };
    };
    const showTfa = async r => {
      T2 = r;
      if (r.tfa === "enroll") {
        let qr = ""; try { if (!window.qrcode) await loadScript("js/vendor/qrcode.js"); const q = qrcode(0, "M"); q.addData(r.uri); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch { }
        $("lg-3").innerHTML = `<p><b>${tr("Activez le second facteur")}</b></p><p class="small">${tr("Votre rôle l'exige. Installez une application d'authentification (Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden…), scannez ce code, puis tapez les 6 chiffres affichés.")}</p>
          ${qr ? `<div class="tfa-qr">${qr}</div>` : ""}<details class="small"><summary>${tr("Je ne peux pas scanner")}</summary>${tr("Ajoutez un compte manuellement avec cette clé :")}<div class="mono tfa-key">${esc(r.secret.replace(/(.{4})/g, "$1 ").trim())}</div></details>
          <input id="lg-tfa" inputmode="numeric" autocomplete="one-time-code" placeholder="${esc(tr("Code à 6 chiffres"))}" maxlength="7"><button class="btn primary" id="lg-tgo">${tr("Activer et se connecter")}</button>`;
      } else {
        $("lg-3").innerHTML = `<p><b>${tr("Second facteur")}</b></p><p class="small">${tr("Tapez le code à 6 chiffres de votre application d'authentification.")}</p>
          <input id="lg-tfa" inputmode="numeric" autocomplete="one-time-code" placeholder="${esc(tr("Code à 6 chiffres"))}" maxlength="9"><button class="btn primary" id="lg-tgo">${tr("Se connecter")}</button>
          <div class="muted small">${tr("Plus de téléphone ? Tapez un de vos codes de secours (XXXX-XXXX), ou demandez à un administrateur de réinitialiser votre second facteur.")}</div>`;
      }
      show(3);
    };
    const send = async () => {
      const name = $("lg-name").value.trim(); if (!name) return;
      $("lg-send").disabled = true; err.textContent = "";
      try { const r = await apiPublic("POST", "auth/request", { name }); show(2); $("lg-sent").textContent = tr("Code envoyé à") + " " + r.sentTo + " · " + tr("valable") + " " + r.minutes + " min"; }
      catch (e) { if (e.status === 502) { show(2); $("lg-sent").textContent = ""; err.textContent = tr(e.message); } else err.textContent = tr(e.message); }
      $("lg-send").disabled = false;
    };
    $("lg-back").onclick = () => show(1);
    $("lg-again").onclick = send;
    $("lg").onsubmit = async e => {
      e.preventDefault();
      if (step === 1) return send();
      if (step === 4) return;
      if (step === 3) {
        const code = $("lg-tfa").value.trim(); if (!code) return;
        $("lg-tgo").disabled = true; err.textContent = "";
        try { done(await apiPublic("POST", "auth/2fa", { ticket: T2.ticket, code })); }
        catch (e3) { err.textContent = tr(e3.message); if (/recommencez/.test(e3.message)) { show(2); $("lg-code").value = ""; } else $("lg-tfa").select(); }
        const b = $("lg-tgo"); if (b) b.disabled = false; return;
      }
      const code = $("lg-code").value.replace(/\D/g, ""); if (!code) return;
      $("lg-go").disabled = true; err.textContent = "";
      try { const r = await apiPublic("POST", "auth/verify", { name: $("lg-name").value.trim(), code }); if (r.tfa) await showTfa(r); else done(r); }
      catch (e2) { err.textContent = tr(e2.message); $("lg-code").select(); }
      $("lg-go").disabled = false;
    };
    show(1);
    if (expired) err.textContent = tr("Votre session de 8 heures a expiré : reconnectez-vous.");
  });
}
async function connectServer() {
  if (!window.WaysAPI) await loadScript("client/ways-api.js");
  const mk = (token, onUnauthorized) => WaysAPI({ base: "api/", token, methodOverride: true, onUnauthorized, onStatus: st => { if (st === "offline" && !S.offline) { S.offline = true; render(); } else if (st === "online" && S.offline) { S.offline = false; render(); } } });
  let configured = false;
  try { configured = !!(await apiPublic("GET", "auth/status")).configured; } catch (e) { }
  if (configured) {
    let token = lsGet(SESSION_LS);
    /* session expirée (8 h) pendant l'utilisation : retour à l'écran de connexion */
    const mkS = t => mk(t, () => { if (lsGet(SESSION_LS) === t) { lsSet(SESSION_LS, ""); lsSet("st-expired", "1"); location.reload(); } });
    if (token) { try { const api = mkS(token), me = await api.call("GET", "auth/me"); ME = me.user; API = api; SBX = me.sandbox || null; if (typeof SESS !== "undefined") SESS = me.session || null; return api; } catch (e) { lsSet(SESSION_LS, ""); } }
    const r = await loginGate();
    lsSet(SESSION_LS, r.token); ME = r.user; if (ME && ME.sysAdminPending) setTimeout(() => toast(tr("Droit Administrateur système en attente : activez la double authentification (Sécurité) puis reconnectez-vous.")), 1500); API = mkS(r.token); if (typeof SESS !== "undefined") SESS = { since: Date.now(), expires: Date.now() + (r.hours || 8) * 3600000 }; return API;
  }
  /* connexion par code pas encore configurée : clé d'accès provisoire */
  let key = lsGet(KEY_LS), msg = "";
  for (;;) {
    if (!key) key = await keyGate(msg);
    const api = mk(key);
    try { await api.list("settings"); API = api; lsSet(KEY_LS, key); ME = { name: "Clé d'accès", role: "admin", key: true }; return api; }
    catch (e) { msg = /autoris|401/i.test(e.message) ? "Clé d'accès refusée." : "Le serveur ne répond pas. Vérifiez la connexion puis réessayez."; key = ""; }
  }
}
/* Adaptateurs : même interface que les capacités claude.ai utilisées par l'application */
function serverDb(api) {
  const snapOf = list => ({ docs: list.map(d => ({ id: d.id, data: () => { const x = Object.assign({}, d); delete x.id; return x; } })), metadata: { fromCache: false } });
  const docRef = (c, id) => ({
    set: data => api.save(c, id, data),
    update: data => api.patch(c, id, data),
    delete: () => api.remove(c, id)
  });
  return {
    collection: c => ({ doc: id => docRef(c, id), onSnapshot: (cb, err) => api.onSnapshot(c, list => cb(snapOf(list))) }),
    doc: path => { const [c, id] = path.split("/"); return Object.assign(docRef(c, id), {
      onSnapshot: (cb, err) => api.onSnapshot(c, list => { const d = list.find(x => x.id === id); cb({ exists: !!d, data: () => { const x = Object.assign({}, d); delete x.id; return x; }, metadata: { fromCache: false } }); }) }); }
  };
}
function serverAssets(api) {
  return {
    upload: async (file, opts) => { const f = file instanceof File ? file : new File([file], "fichier", { type: (opts && opts.type) || file.type || "application/octet-stream" }); const r = await api.upload(f); return { id: r.id, contentType: r.mime, size: r.size }; },
    delete: id => api.removeFile(id)
  };
}

async function init() {
  render(true);
  const timer = setTimeout(() => { S.slow = true; render(); }, 10000);
  if (SERVER) {
    try {
      const api = await connectServer();
      db = serverDb(api); assets = serverAssets(api);
      if (typeof aiStart === "function") aiStart();
      if (typeof dbxStart === "function") dbxStart();
      if (typeof waStart === "function") waStart();
    } catch (e) { clearTimeout(timer); mode = "memory"; render(true); toast("Connexion au serveur impossible."); return; }
  } else {
    const use = n => window.claude && window.claude.use ? window.claude.use(n).catch(() => null) : Promise.resolve(null);
    [db, assets, downloads, userCap] = await Promise.all([use("db"), use("assets"), use("downloads"), use("user")]);
  }
  if (!db) { clearTimeout(timer); mode = "memory"; render(true); return; }
  mode = "db";
  if (userCap) { try { const w = await userCap.can("data.write"); if (w === false) readOnly = true; } catch { } }
  const done = () => { if (COLS.every(c => S.loaded[c]) && S.loaded.settings) { clearTimeout(timer); S.slow = false; } };
  let pending = null;
  const soon = () => { if (!pending) pending = requestAnimationFrame(() => { pending = null; render(); }); };
  for (const c of COLS) {
    db.collection(c).onSnapshot(snap => {
      S[c] = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      if (!snap.metadata.fromCache) S.loaded[c] = true;
      done(); soon();
    }, e => { S.loaded[c] = true; done(); if (e.code === "revoked") mode = "revoked"; soon(); });
  }
  db.doc("settings/company").onSnapshot(snap => {
    S.settings = snap.exists ? snap.data() : {};
    if (!snap.metadata.fromCache) S.loaded.settings = true;
    done(); soon();
  }, () => { S.loaded.settings = true; done(); soon(); });
}

/* ======================= routage & rendu ======================= */
const NAV = [
  ["", [["dashboard", "Tableau de bord"]]],
  ["Station", [["personnel", "Personnel"], ["expirations", "Expirations"], ["roster", "Roster"], ["shift", "Shift"], ["mur", "Mur de la station"], ["avions", "Avions"], ["flotte", "Véhicules"], ["etalonnage", "Outillage"], ["pieces", "Pièces"], ["besoins", "Station Needs"], ["situations", "Situations ouvertes"], ["formulaires", "Formulaires"], ["voyages", "Voyages"]]],
  ["Clients", [["charge", "Charge Sheet"], ["clients", "Clients"], ["produits", "Articles et prix"]]],
  ["Management", [["headquarters", "Headquarters"], ["admin", "Administration"], ["historique", "Historique"], ["parametres", "Paramètres"]]]
];
const MOD_COLOR = { dashboard: "blue", personnel: "blue", roster: "blue", shift: "blue", avions: "blue", charge: "yellow", flotte: "orange", etalonnage: "green", pieces: "yellow", mur: "blue", besoins: "yellow", expirations: "red", formulaires: "green", headquarters: "blue", situations: "red", voyages: "blue", signaler: "red", clients: "yellow", produits: "yellow", admin: "grey", historique: "grey", parametres: "grey" };
/* couleur de la pastille du menu, quand elle diffère de la couleur du module */
const NAV_DOT = { charge: "white", clients: "white", produits: "white" };
const VIEWS = {};   // route -> { title, render(), static?, after?() }
const ALIAS = { catalogue: "produits" };
const route = () => { let h = location.hash.slice(1); if (!h && ME && ME.hq) h = "headquarters"; h = ALIAS[h] || h; return VIEWS[h] && allowed(h) ? h : "dashboard"; };
let staticDone = null;
window.addEventListener("hashchange", () => { UI.q = ""; UI.filter = "tous"; staticDone = null; render(true); window.scrollTo(0, 0); closeModal(); });

/* compteurs du menu masquables 8 h (par navigateur) */
const BADGE_KEY = "st-badge-hide";
const badgeHides = () => { try { return JSON.parse(localStorage.getItem(BADGE_KEY) || "{}"); } catch (e) { return UI.badgeHide || {}; } };
const badgeHidden = k => (badgeHides()[k] || 0) > Date.now();
const badgeUntil = k => new Date(badgeHides()[k] || 0).toLocaleString(LANG === "en" ? "en-IE" : "fr-BE", { weekday: "short", hour: "2-digit", minute: "2-digit" });
function toggleBadge(k) {
  const h = badgeHides();
  if ((h[k] || 0) > Date.now()) delete h[k]; else h[k] = Date.now() + 8 * 3600 * 1000;
  for (const x in h) if (h[x] <= Date.now()) delete h[x];
  UI.badgeHide = h; try { localStorage.setItem(BADGE_KEY, JSON.stringify(h)); } catch (e) {}
  renderNav(); toast(h[k] ? "Compteur masqué pendant 8 heures" : "Compteur réaffiché");
}
setInterval(() => { const h = badgeHides(); if (Object.values(h).some(t => t <= Date.now())) renderNav(); }, 60000);
function renderNav() {
  document.body.classList.toggle("sbx", !!SBX);
  const r = route();
  const faults = S.faults.filter(f => f.status !== "reparee" && isActiveVeh(f.vehicleId)).length;
  const ready = typeof tOverdue === "function" ? S.tools.filter(tOverdue).length : 0;
  const needsAsk = typeof ndOpen === "function" && typeof canDecideNeeds === "function" && canDecideNeeds() ? S.needs.filter(n => (n.status || "asked") === "asked").length : 0;
  const sits = typeof sitOpen === "function" ? S.situations.filter(sitOpen).length : 0;
  const exLate = typeof expiryAll === "function" && isOffice() ? expiryAll().filter(x => x.date < today()).length : 0;
  const badge = { flotte: faults, etalonnage: ready, besoins: needsAsk, situations: sits, expirations: exLate };
  const badgeTip = { flotte: n => `${plural(n, "panne")} en cours (onglet Pannes)`, etalonnage: n => `${plural(n, "outil")} : étalonnage dépassé (onglet Étalonnage)`,
    besoins: n => `${plural(n, "besoin")} à approuver`, situations: n => `${plural(n, "situation")} ouverte(s) à ramener à la normale`, expirations: n => `${plural(n, "échéance")} expirée(s)` };
  document.getElementById("nav").innerHTML =
    `<a href="#dashboard" class="brand-wrap" aria-label="Tableau de bord"><span class="logo-tile">${logoSvg()}</span><span><span class="brand">my<i>-</i>145<i>-</i>station</span><span class="brand-sub">${esc([settings().stationCode, settings().name].filter(Boolean).join(" · "))}</span></span></a>` +
    `<div class="lang-switch" role="group" aria-label="Langue / Language" data-noi18n><button data-a="set-lang" data-l="fr" class="${UI_LANG === "fr" ? "on" : ""}" aria-pressed="${UI_LANG === "fr"}">Français</button><button data-a="set-lang" data-l="en" class="${UI_LANG === "en" ? "on" : ""}" aria-pressed="${UI_LANG === "en"}">English</button></div>` +
    `<div class="lang-switch theme-switch" role="group" aria-label="Thème"><button data-a="set-theme" data-t="light" class="${curTheme() === "light" ? "on" : ""}" aria-pressed="${curTheme() === "light"}">☀ Clair</button><button data-a="set-theme" data-t="dark" class="${curTheme() === "dark" ? "on" : ""}" aria-pressed="${curTheme() === "dark"}">☾ Sombre</button></div>` +
    NAV.map(([h, items]) => [h, items.filter(([k]) => allowed(k))]).filter(([, items]) => items.length).map(([h, items]) => (h ? `<div class="nav-h">${h}</div>` : "") + items.map(([k, l]) =>
      `<a href="#${k}" class="${r === k ? "on" : ""}" data-c="${NAV_DOT[k] || MOD_COLOR[k] || "grey"}"><span><i class="dot"></i>${l}</span>${badge[k] ? (badgeHidden(k) ? `<span class="cnt muted-cnt" role="button" tabindex="0" data-badge="${k}" title="Compteur masqué jusqu'à ${badgeUntil(k)} · cliquer pour le réafficher" aria-label="Réafficher le compteur">${badge[k]}</span>`
        : `<span class="cnt" role="button" tabindex="0" data-badge="${k}" title="${esc(badgeTip[k](badge[k]))} · cliquer pour masquer 8 h" aria-label="Masquer ce compteur pendant 8 heures">${badge[k]}</span>`) : ""}</a>`).join("")).join("") +
    (SBX ? `<div class="sbx-box"><b>${esc(tr("Environnement de test"))}</b><span class="small">${esc(tr("Rien n'est enregistré dans la base principale."))}</span><button class="btn sm" data-a="sbx-stop">${esc(tr("Quitter le test"))}</button></div>` : "") +
    (SERVER && ME ? `<div class="side-user"><div><b>${esc(ME.name)}</b><span class="muted small"> · ${tr(ROLE_LBL[ME.role] || ME.role)}</span></div><button class="linkbtn small" data-a="server-logout">${tr("Se déconnecter")}</button></div>` : "") +
    `<div class="side-foot">${mode === "db" ? (readOnly ? "Lecture seule" : SERVER ? (S.offline ? "Serveur injoignable · nouvel essai…" : SBX ? "Environnement de test : base à part" : "Données enregistrées sur le serveur") : "Données partagées et enregistrées") : mode === "memory" ? "Aperçu : rien n'est enregistré" : "Connexion…"}</div>`;
}
function banners() {
  let h = "";
  if (mode === "memory") h += `<div class="banner">Aperçu hors ligne : la base de données n'est pas disponible ici, les modifications ne seront pas enregistrées.</div>`;
  if (mode === "revoked") h += `<div class="banner">L'accès aux données a été retiré pour cette session.</div>`;
  if (S.slow) h += `<div class="banner">Les données ne sont pas encore joignables. Ce qui s'affiche peut être incomplet.</div>`;
  if (readOnly) h += `<div class="banner info">Accès en lecture seule : demandez au propriétaire un accès « Contributeur » pour modifier.</div>`;
  return h;
}
/* Rendu. Les mises à jour en arrière-plan (synchronisation toutes les 3 s) ne doivent jamais gêner :
   rien n'est redessiné si la page n'a pas changé ; on attend que l'utilisateur ait fini (menu déroulant ouvert,
   saisie dans un champ, bouton de souris enfoncé, défilement en cours) ; défilement, sections dépliées et carte sont conservés. */
let lastHtml = "", renderLater = null, ptrDown = false, lastScroll = 0;
document.addEventListener("pointerdown", () => { ptrDown = true; }, true);
document.addEventListener("pointerup", () => { ptrDown = false; }, true);
document.addEventListener("pointercancel", () => { ptrDown = false; }, true);
window.addEventListener("scroll", () => { lastScroll = Date.now(); }, { passive: true, capture: true });
window.addEventListener("wheel", () => { lastScroll = Date.now(); }, { passive: true, capture: true });
function userBusy(main) {
  if (ptrDown || Date.now() - lastScroll < 700) return true;
  const ae = document.activeElement;
  if (!ae || !main.contains(ae) || ae.id === "q") return false;
  if (ae.tagName === "SELECT" || ae.tagName === "TEXTAREA" || ae.isContentEditable) return true;
  return ae.tagName === "INPUT" && !/^(button|submit|reset|checkbox|radio|range|color|file)$/.test(ae.type);
}
function render(force) {
  renderNav();
  const r = route(), v = VIEWS[r];
  document.body.dataset.mod = MOD_COLOR[r] || "blue";
  document.body.classList.toggle("wall", r === "mur");
  if (v.static && staticDone === r && !force) return;
  const main = document.getElementById("main");
  const ae = document.activeElement;
  if (!force && ae && ae.dataset && ae.dataset.price != null && main.contains(ae)) return;
  if (!force && userBusy(main)) { clearTimeout(renderLater); renderLater = setTimeout(() => render(), 600); return; }
  clearTimeout(renderLater);
  if (v.static && (mode === "memory" || (COLS.every(c => S.loaded[c]) && S.loaded.settings))) staticDone = r;
  const html = banners() + v.render();
  if (!force && html === lastHtml && main.childElementCount) return;   // rien n'a changé à l'écran
  lastHtml = html;
  /* état à garder : défilement, sections <details> ouvertes, zones défilantes, carte, recherche */
  const y = window.scrollY, wasQ = ae && ae.id === "q", sel = wasQ ? [ae.selectionStart, ae.selectionEnd] : null;
  const det = [...main.querySelectorAll("details")].map(d => [d.id || d.dataset.hist || "", d.open]);
  const scr = [...main.querySelectorAll(".tablewrap, .scanlist, .checklist, .dbx-plan")].map(x => [x.scrollTop, x.scrollLeft]);
  const keep = [...main.querySelectorAll("[data-keep]")].filter(x => x.id);
  keep.forEach(x => x.remove());
  main.innerHTML = html;
  for (const old of keep) { const ph = document.getElementById(old.id); if (ph && ph.dataset.keep === old.dataset.keep) ph.replaceWith(old); }
  if (!force) {
    const nd = [...main.querySelectorAll("details")];
    if (nd.length === det.length) nd.forEach((d, i) => { if ((d.id || d.dataset.hist || "") === det[i][0] && det[i][1] !== d.open) d.open = det[i][1]; });
    const ns = [...main.querySelectorAll(".tablewrap, .scanlist, .checklist, .dbx-plan")];
    if (ns.length === scr.length) ns.forEach((x, i) => { x.scrollTop = scr[i][0]; x.scrollLeft = scr[i][1]; });
  }
  if (v.after) v.after();
  if (!force && Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
  const s = document.getElementById("q");
  if (s && UI.focusQ && wasQ && document.activeElement !== s) {
    s.focus({ preventScroll: true });
    const n = s.value.length; try { s.setSelectionRange(sel ? sel[0] : n, sel ? sel[1] : n); } catch { }
  }
}
/* point rouge : signale les éléments à l'origine d'un compteur rouge du menu */
const ADOT = `<i class="adot" aria-hidden="true"></i>`;
/* icônes des onglets (traits, 24×24, couleur du texte) */
const TAB_IC = {
  car: '<path d="M5 17h14M6 17v2M18 17v2M4 13l2-5a2 2 0 0 1 2-1h8a2 2 0 0 1 2 1l2 5v4H4z"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.6-.6-2.5z"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.5"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  tire: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21"/>',
  ticket: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/><path d="M10 7v10" stroke-dasharray="2 2"/>',
  tools: '<path d="M4 20l7-7M14 6l4-2 2 2-2 4-3 1-3-3z"/><path d="M8 4a3 3 0 0 0 0 4l-4 4 2 2 4-4a3 3 0 0 0 4 0"/>',
  chart: '<path d="M4 20V4M4 20h16"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  bottle: '<path d="M10 2h4v4l2 3v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3z"/><path d="M8 13h8"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16 14.5c3 0 6 1.5 6 4.5"/>',
  truck: '<path d="M2 6h11v10H2zM13 10h4l4 4v2h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 15h9"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  file: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h6M9 16h4"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  note: '<path d="M5 3h14v12l-6 6H5z"/><path d="M13 21v-6h6M8 8h8M8 12h5"/>',
  euro: '<path d="M18 6a7 7 0 1 0 0 12M4 10h10M4 14h10"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
};
const TAB_ICON = { mois: "chart", jour: "people", codes: "tag", equipe: "people", matrice: "check", vehicules: "car", taches: "check", pannes: "alert", documents: "doc", pneus: "tire", amendes: "ticket",
  entretiens: "tools", stats: "chart", stock: "box", bouteilles: "bottle", clients: "people", livraisons: "truck", config: "cog", atelier: "flask", outils: "tools", labos: "flask", echeances: "bell",
  mouv: "bank", coda: "file", rclients: "people", ramendes: "ticket", vehicles: "car", tools: "tools", products: "tag", centres: "chart", anparam: "cog", notes: "note", gaz: "bottle", frais: "euro", etalonnage: "flask", articles: "tag", cours: "truck", fini: "check", vols: "truck", sejours: "people", organiser: "bell", hotels: "people", sortis: "tools", etal: "flask" };
const tabIcon = (route, k) => { const n = TAB_ICON[k] || (route === "admin" && k === "documents" ? "folder" : null); return n && TAB_IC[n] ? `<svg class="tab-ic" viewBox="0 0 24 24" aria-hidden="true">${TAB_IC[n]}</svg>` : ""; };
function tabs(routeKey, list) {
  const cur = UI.tab[routeKey] || list[0][0];
  return `<div class="tabs" role="tablist">${list.map(([k, l, n, alert]) => `<button role="tab" aria-selected="${cur === k}" data-tab="${routeKey}:${k}" class="${cur === k ? "on" : ""}${alert ? " has-alert" : ""}">${tabIcon(routeKey, k)}<span>${l}</span>${n ? `<span class="cnt${alert ? " alert" : ""}">${n}</span>` : alert ? ADOT : ""}</button>`).join("")}</div>`;
}
const curTab = (routeKey, def) => UI.tab[routeKey] || def;
function head(title, sub, actions, lead) {
  return `<div class="topline"><button class="msg-btn" data-a="toast-log" title="${esc(tr("Messages système des 3 derniers jours"))}">${esc(tr("Messages"))} <b data-toast-n>${toastLog().length}</b></button>${typeof profilePill === "function" && SERVER && ME ? profilePill() : ""}</div><div class="head"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${lead ? `<div class="actions lead-acts">${lead}</div>` : ""}<div class="actions">${actions || ""}</div></div>`;
}
const dis = () => readOnly ? "disabled" : "";
function searchBar(placeholder, filters) {
  return `<div class="toolbar"><input type="search" id="q" placeholder="${placeholder}" value="${esc(UI.q)}" aria-label="Rechercher">
  ${filters ? `<div class="seg" role="group" aria-label="Filtrer">${filters.map(([k, l, alert]) => `<button data-filter="${k}" class="${UI.filter === k ? "on" : ""}">${alert ? ADOT : ""}${l}</button>`).join("")}</div>` : ""}</div>`;
}

/* ======================= modales ======================= */
const modalStack = [];
function modal(html, size) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="overlay" data-overlay><div class="modal ${size || ""}" role="dialog" aria-modal="true">${html}</div></div>`;
  const first = root.querySelector("[autofocus]") || root.querySelector(".body input, .body select, .body textarea");
  if (first) first.focus();
  return root.querySelector(".modal");
}
function closeModal() { document.getElementById("modal-root").innerHTML = ""; }
const mHead = t => `<header><h2>${t}</h2><button class="x" data-close aria-label="Fermer">×</button></header>`;
function confirmBox(text, onYes, label = "Supprimer") {
  const m = modal(`${mHead("Confirmer")}<div class="body"><div>${text}</div></div>
    <footer><button class="btn" data-close>Annuler</button><button class="btn primary danger-bg" id="yes">${label}</button></footer>`, "sm");
  m.querySelector("#yes").onclick = async () => { closeModal(); await onYes(); toast("C'est fait"); };
}
function field(id, label, value, opts = {}) {
  const t = opts.type || "text";
  const attrs = `id="${id}" ${opts.required ? "required" : ""} ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ""} ${opts.step ? `step="${opts.step}"` : ""} ${opts.min != null ? `min="${opts.min}"` : ""} ${opts.autofocus ? "autofocus" : ""}`;
  let input;
  if (t === "select") input = `<select ${attrs}>${opts.options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value ?? "") ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  else if (t === "textarea") input = `<textarea ${attrs}>${esc(value)}</textarea>`;
  else input = `<input type="${t}" ${attrs} value="${esc(value ?? "")}" ${opts.cls ? `class="${opts.cls}"` : ""}>`;
  return `<label class="f ${opts.wide ? "wide" : ""}">${label}${opts.required ? " *" : ""}${input}</label>`;
}
const clientOptions = (empty = "Choisir un client…") => [["", empty], ...S.clients.slice().sort(byName).map(c => [c.id, c.name])];

/* ======================= scan de codes-barres ======================= */
const normSerial = s => String(s || "").trim().toUpperCase().replace(/\s+/g, "");
const safeId = s => s.replace(/[^A-Za-z0-9_\-.~:@+]/g, "_").slice(0, 180);
const loaded = {};
function loadScript(src) {
  if (!loaded[src]) loaded[src] = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => { delete loaded[src]; ko(new Error("load")); }; document.head.appendChild(s); });
  return loaded[src];
}
async function decodeImage(file) {
  if ("BarcodeDetector" in window) {
    try { const bd = new window.BarcodeDetector(); const bmp = await createImageBitmap(file); const r = await bd.detect(bmp); if (r.length) return r.map(x => x.rawValue); } catch { }
  }
  await loadScript("https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js");
  const url = URL.createObjectURL(file);
  try {
    const hints = new Map(); hints.set(window.ZXing.DecodeHintType.TRY_HARDER, true);
    const reader = new window.ZXing.BrowserMultiFormatReader(hints);
    const res = await reader.decodeFromImageUrl(url); return [res.getText()];
  } catch { return []; } finally { URL.revokeObjectURL(url); }
}
/* Un champ de scan : douchette USB/Bluetooth (saisie + Entrée), saisie manuelle, ou photo du code-barres sur mobile. */
function scanBox(id, label = "Scanner ou saisir un numéro de série") {
  return `<div class="scanbox"><label class="f wide">${label}
    <div class="scanrow"><input id="${id}" class="mono scan-in" autocomplete="off" autocapitalize="characters" placeholder="Scannez le code-barres puis Entrée" autofocus>
    <button type="button" class="btn" data-addscan="${id}">Ajouter</button>
    <label class="btn cam" title="Photographier le code-barres">Photo<input type="file" accept="image/*" capture="environment" data-camscan="${id}" hidden></label></div></label>
    <div class="hint">Douchette : visez et scannez, la bouteille s'ajoute. Sur téléphone : « Photo » pour lire le code-barres.</div></div>`;
}
function wireScan(id, onSerial) {
  const inp = document.getElementById(id); if (!inp) return;
  const go = () => { const v = normSerial(inp.value); inp.value = ""; if (v) onSerial(v); inp.focus(); };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go(); } });
  document.querySelector(`[data-addscan="${id}"]`).onclick = go;
  const cam = document.querySelector(`[data-camscan="${id}"]`);
  cam.onchange = async () => {
    const f = cam.files[0]; cam.value = ""; if (!f) return;
    toast("Lecture du code-barres…");
    const codes = await decodeImage(f).catch(() => []);
    if (!codes.length) { toast("Aucun code-barres lisible sur la photo. Rapprochez-vous et réessayez."); return; }
    codes.forEach(c => onSerial(normSerial(c)));
  };
}

/* ======================= PDF & téléchargements ======================= */
const pdfTxt = s => String(tr(s ?? "") ?? "").replace(/[  ]/g, " ").replace(/[—–]/g, "-").replace(/[’]/g, "'").replace(/³/g, "3").replace(/²/g, "2");
async function newPdf() {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  return new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
}
async function offerFile(filename, data, type) {
  if (!downloads) {
    try {
      const blob = data instanceof Blob ? data : new Blob([data], { type: type || "application/octet-stream" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    } catch (e) { toast("Le téléchargement n'est pas disponible dans cette vue."); }
    return;
  }
  if (data instanceof Blob) data = await data.arrayBuffer();
  else if (typeof data === "string") data = new TextEncoder().encode(data).buffer;
  try { await downloads.save({ filename, data }); }
  catch (e) { if (e.code !== "declined") toast(e.code === "rate_limited" ? "Un téléchargement est déjà en attente." : "Téléchargement impossible ici."); }
}
/* tableau simple dans jsPDF ; renvoie le y final */
function pdfTable(doc, x, y, cols, rows) {
  const W = cols.reduce((a, c) => a + c.w, 0);
  doc.setFillColor(238, 240, 244); doc.rect(x, y, W, 7, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  let cx = x; cols.forEach(c => { doc.text(pdfTxt(c.t), c.r ? cx + c.w - 2 : cx + 2, y + 4.8, { align: c.r ? "right" : "left" }); cx += c.w; });
  y += 7; doc.setFont("helvetica", "normal");
  for (const r of rows) {
    if (y > 270) { doc.addPage(); y = 20; }
    if (!Array.isArray(r)) {   // titre de section ou sous-total
      if (r.note != null) { doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(70); const nl = doc.splitTextToSize(pdfTxt(r.note), W - 4); if (y + nl.length * 4 + 3 > 280) { doc.addPage(); y = 20; } doc.text(nl, x + 2, y + 4.5); doc.setTextColor(0); y += nl.length * 4 + 3; }
      else if (r.sec != null) { y += 2; doc.setFillColor(248, 236, 239); doc.rect(x, y, W, 7.5, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(136, 2, 28); doc.text(pdfTxt(r.sec), x + 2, y + 5.2); doc.setTextColor(0); y += 7.5; }
      else { doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.text(pdfTxt(r.sub), x + W - 32, y + 4.5, { align: "right" }); doc.setFont("helvetica", "bold"); doc.text(pdfTxt(r.amount), x + W - 2, y + 4.5, { align: "right" }); y += 7; }
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); continue;
    }
    cx = x; let h = 6.5;
    const lines = cols.map((c, i) => doc.splitTextToSize(pdfTxt(r[i]), c.w - 4));
    h = Math.max(h, ...lines.map(l => l.length * 4 + 2.5));
    cols.forEach((c, i) => { doc.text(lines[i], c.r ? cx + c.w - 2 : cx + 2, y + 4.5, { align: c.r ? "right" : "left" }); cx += c.w; });
    y += h; doc.setDrawColor(226, 229, 235); doc.line(x, y, x + W, y);
  }
  return y;
}
function pdfHeader(doc, title, number, rightLines) {
  const s = settings();
  const lx = LOGO_PNG ? 40 : 15;
  if (LOGO_PNG) { try { doc.addImage(LOGO_PNG, "PNG", 15, 11, 21, 18.5); } catch { } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(136, 2, 28); doc.text(pdfTxt(s.name), lx, 20); doc.setTextColor(0);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const left = [s.address, s.vat ? "TVA " + s.vat : "", s.email, s.phone].filter(Boolean).map(pdfTxt);
  doc.text(left, lx, 26);
  doc.setDrawColor(193, 193, 193); doc.setLineWidth(0.8); doc.line(15, 44, 195, 44); doc.setLineWidth(0.2);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(pdfTxt(title), 195, 20, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text(pdfTxt(number), 195, 26, { align: "right" });
  doc.setFontSize(9); doc.text(rightLines.map(pdfTxt), 195, 32, { align: "right" });
}
function pdfClient(doc, y, c, label) {
  doc.setFontSize(8.5); doc.setTextColor(110); doc.text(pdfTxt(label), 15, y); doc.setTextColor(0);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text(pdfTxt(c?.name || "-"), 15, y + 5.5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  doc.text([c?.address, c?.city, c?.vat ? "TVA " + c.vat : ""].filter(Boolean).map(pdfTxt), 15, y + 10.5);
}

/* ======================= événements globaux ======================= */
const ACTIONS = {};   // nom -> fn(el, event)
ACTIONS["toast-log"] = () => toastLogOpen();
/* environnement de test (api/sandbox.php) : activation, sortie avec confirmation */
ACTIONS["sbx-start"] = () => {
  const m = modal(`${mHead("Activer l'environnement de test")}<div class="body stack-s">
    <div>Tant que le test est actif, <b>vos</b> créations, modifications et suppressions vont dans une base de test à part. La base principale et les autres utilisateurs ne voient rien.</div>
    <ul class="small" style="margin:0;padding-left:18px"><li>La colonne de gauche devient <b style="color:var(--red)">rouge</b>.</li><li>En quittant le test, tout ce qui a été fait pendant le test est effacé.</li>
    <li>Les actions qui sortent de l'outil sont bloquées : envois WhatsApp, écritures Dropbox, réglages et utilisateurs.</li></ul></div>
    <footer><button class="btn" data-close>Annuler</button><button class="btn primary" id="sbx-go">Activer le test</button></footer>`, "sm");
  m.querySelector("#sbx-go").onclick = async e => { e.target.disabled = true; try { await API.call("POST", "sandbox/start", {}); location.reload(); } catch (x) { toast(tr(x.message)); e.target.disabled = false; } };
};
ACTIONS["sbx-stop"] = async () => {
  let n = null; try { n = (await API.call("GET", "sandbox")).changes; } catch { }
  const m = modal(`${mHead("Quitter l'environnement de test ?")}<div class="body stack-s">
    <div>${n ? `<b>${plural(n, "élément")}</b> créé${n > 1 ? "s" : ""}, modifié${n > 1 ? "s" : ""} ou supprimé${n > 1 ? "s" : ""} pendant le test ${n > 1 ? "seront effacés" : "sera effacé"}.` : "Les changements faits pendant le test seront effacés."} Vous retrouvez la base principale telle qu'elle était.</div>
    <label class="chk confirm-chk"><input type="checkbox" id="sbx-ok"> Je confirme vouloir quitter le test</label></div>
    <footer><button class="btn" data-close>Rester en test</button><button class="btn primary danger-bg" id="sbx-yes" disabled>Quitter le test</button></footer>`, "sm");
  const ok = m.querySelector("#sbx-ok"), yes = m.querySelector("#sbx-yes");
  ok.onchange = () => yes.disabled = !ok.checked;
  yes.onclick = async () => { yes.disabled = true; try { await API.call("POST", "sandbox/stop", {}); location.reload(); } catch (x) { toast(tr(x.message)); yes.disabled = false; } };
};
ACTIONS["set-lang"] = el => setUiLang(el.dataset.l);
/* thème clair / sombre : mémorisé par navigateur ; sans choix, suit le réglage de l'appareil */
const sysDark = () => window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
const curTheme = () => { try { return localStorage.getItem("st-theme") || (sysDark() ? "dark" : "light"); } catch (e) { return sysDark() ? "dark" : "light"; } };
const applyTheme = () => { document.documentElement.dataset.theme = curTheme(); };
applyTheme();
ACTIONS["set-theme"] = el => { try { localStorage.setItem("st-theme", el.dataset.t); } catch (e) {} applyTheme(); renderNav(); };
document.addEventListener("click", e => {
  const bd = e.target.closest && e.target.closest("[data-badge]");
  if (bd) { e.preventDefault(); e.stopPropagation(); toggleBadge(bd.dataset.badge); }
}, true);
document.addEventListener("keydown", e => { const bd = e.target.closest && e.target.closest("[data-badge]"); if (bd && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); toggleBadge(bd.dataset.badge); } }, true);
document.addEventListener("click", e => {
  const t = e.target;
  if (t.closest("[data-close]") || t.matches("[data-overlay]")) { closeModal(); return; }
  const tb = t.closest("[data-tab]"); if (tb) { const [r, k] = tb.dataset.tab.split(":"); UI.tab[r] = k; UI.q = ""; UI.filter = "tous"; UI.focusQ = false; render(true); return; }
  const f = t.closest("[data-filter]"); if (f) { UI.filter = f.dataset.filter; UI.focusQ = false; render(true); return; }
  if (t.closest("[data-stop]")) { e.stopPropagation(); return; }
  if (t.matches("input, select, textarea") && !t.matches("input[type=checkbox][data-a]")) return;
  const a = t.closest("[data-a]");
  if (a && ACTIONS[a.dataset.a]) { e.preventDefault(); e.stopPropagation(); ACTIONS[a.dataset.a](a, e); }
});
document.addEventListener("input", e => { if (e.target.id === "q") { UI.q = e.target.value; UI.focusQ = true; render(true); } });
document.addEventListener("keydown", e => { if (e.key === "Escape" && document.getElementById("modal-root").innerHTML) closeModal(); });

ACTIONS["server-logout"] = () => confirmBox(ME && !ME.key ? "Se déconnecter sur cet appareil ?" : "Oublier la clé d'accès dans ce navigateur ? Elle sera redemandée au prochain chargement.", async () => {
  if (ME && !ME.key && API) { try { await API.call("POST", "auth/logout"); } catch { } }
  lsSet(SESSION_LS, ""); lsSet(KEY_LS, ""); location.reload();
}, "Se déconnecter");
