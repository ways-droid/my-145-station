"use strict";
/* ======================= LIAISON ODOO (phase B : Odoo maître, l'ERP reçoit en lecture seule) =======================
   Le serveur ways.support interroge Odoo (API JSON-2) avec sa propre clé ; le navigateur ne fait que déclencher
   la synchronisation (toutes les 15 min ; en continu pendant l'import initial). */
let OD = null;
const isOdoo = x => !!x && x.source === "odoo";
const odooOn = () => !!(OD && OD.configured);
const odooTag = x => isOdoo(x) ? ` <span class="chip info" title="Synchronisé depuis Odoo">Odoo</span>${x.archived ? ` <span class="chip">archivé</span>` : ""}` : "";
function odooUrl(model, id) { return OD && OD.url && id ? `${OD.url}/web#id=${encodeURIComponent(id)}&model=${model}&view_type=form` : ""; }
function odooLinkBtn(model, id, label) { const u = odooUrl(model, id); return u ? `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">${label} ↗</a>` : ""; }
function odooNote(text, model, id) {
  const u = odooUrl(model, id);
  return `<div class="banner info" style="margin-bottom:12px">${text}${u ? ` <a href="${esc(u)}" target="_blank" rel="noopener">Ouvrir dans Odoo ↗</a>` : ""}</div>`;
}
function odooLock(m, ids) { for (const id of ids) { const el = m.querySelector("#" + id); if (el) { el.disabled = true; el.title = tr("Géré dans Odoo"); } } }
function odooBanner() {
  if (!odooOn()) return "";
  const exp = OD.keyDays != null && OD.keyDays <= 14 && isAdmin();
  return `<div class="banner ${exp ? "warn" : "info"}">Facturation dans Odoo : les factures et notes de crédit Odoo arrivent ici automatiquement, en lecture seule${OD.importing ? " (import de l'historique en cours…)" : OD.lastOk ? ` · mises à jour ${tr(agoTxt(new Date(OD.lastOk).toISOString()))}` : ""}. Les brouillons créés par les livraisons servent de rappel « à facturer dans Odoo ».
    ${exp ? ` <b>La clé API Odoo expire ${OD.keyDays < 0 ? "— elle a expiré" : OD.keyDays === 0 ? "aujourd'hui" : `dans ${OD.keyDays} jour${OD.keyDays > 1 ? "s" : ""}`} :</b> <a href="#parametres">la renouveler</a>.` : ""}</div>`;
}

async function odRefresh() { try { OD = await API.call("GET", "odoo/status"); } catch { OD = null; } return OD; }
let odBusy = false;
async function odTick(force) {
  if (!SERVER || !API || odBusy) return null;
  if (!OD) await odRefresh();
  if (!OD || !OD.configured || (!force && document.hidden)) return null;
  odBusy = true;
  let r;
  try { r = await API.call("POST", "odoo/sync", force ? { force: true } : {}); } catch (e) { r = { ok: false, error: e.message }; }
  odBusy = false;
  if (!r.skipped && !r.busy) { await odRefresh(); if (document.getElementById("od-box")) loadOd(); }
  if (r.more) setTimeout(() => odTick(), 3000);          // import initial : on enchaîne les lots
  return r;
}
let odStarted = false;
function odStart() {
  if (!SERVER || odStarted) return; odStarted = true;
  setTimeout(async () => { await odRefresh(); odTick(); if (odooOn()) render(); }, 2500);
  setInterval(() => odTick(), 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) odTick(); });
}

/* ---------- carte Paramètres (administrateur) ---------- */
function odCardShell() {
  if (!SERVER || !isAdmin()) return "";
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><h3 class="np">Liaison Odoo</h3><div id="od-box"><div class="muted">Chargement…</div></div></div></div>`;
}
async function loadOd() {
  const box = document.getElementById("od-box"); if (!box) return;
  const s = await odRefresh();
  if (!s) { box.innerHTML = `<div class="err">${esc(tr("Le serveur ne répond pas."))}</div>`; return; }
  if (!s.configured) {
    box.innerHTML = `<div class="stack-s"><div>Les clients, articles, factures, notes de crédit et paiements d'Odoo arrivent automatiquement dans l'ERP, en lecture seule : Odoo reste l'outil de facturation. La clé reste sur le serveur ways.support et n'est jamais renvoyée au navigateur.</div>
      <ol class="small stack-s" style="margin:0;padding-left:18px"><li>Dans Odoo, connectez-vous avec l'utilisateur qui servira à la liaison (idéalement un utilisateur dédié, avec accès en lecture à la Facturation et aux Contacts).</li>
      <li>Cliquez sur votre avatar → <b>Mes préférences</b> (ou Préférences) → onglet <b>Sécurité du compte</b> → <b>Nouvelle clé API</b>. Donnez-lui un nom (« ERP W.A.Y.S. ») et la durée la plus longue proposée, puis copiez la clé.</li>
      <li>Saisissez ici l'adresse de votre Odoo, l'e-mail de connexion de cet utilisateur, la clé et sa date d'expiration : l'ERP vous préviendra deux semaines avant.</li></ol>
      <div><button class="btn primary" data-a="od-form">Connecter Odoo</button></div></div>`;
    return;
  }
  const kd = s.keyDays;
  box.innerHTML = `<div class="stack-s"><dl class="kv"><dt>Odoo</dt><dd><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace(/^https?:\/\//, ""))}</a>${s.db ? ` · base ${esc(s.db)}` : ""}${s.version ? ` · Odoo ${esc(s.version)}` : ""}${s.login ? ` · utilisateur ${esc(s.login)}` : ""}</dd>
      <dt>Clé API</dt><dd>${s.keyExp ? `expire le ${fmtDate(s.keyExp)}${kd != null && kd <= 14 ? ` <span class="chip ${kd < 0 ? "bad" : "warn"}">${kd < 0 ? "expirée" : kd + " j"}</span>` : ""}` : `<span class="muted">date d'expiration non indiquée</span>`}</dd>
      <dt>Synchronisation</dt><dd>${s.importing ? `<span class="chip warn">import de l'historique en cours…</span>` : s.lastOk ? esc(tr(agoTxt(new Date(s.lastOk).toISOString()))) : "pas encore faite"} <span class="muted small">(toutes les 15 min)</span></dd></dl>
    ${s.error ? `<div class="banner warn"><b>Dernière erreur :</b> ${esc(s.error)}</div>` : ""}
    <div class="muted small">Importés : ${S.clients.filter(isOdoo).length} clients · ${S.products.filter(isOdoo).length} articles · ${S.docs.filter(isOdoo).length} factures et notes de crédit. Les fiches ERP existantes ont été reliées par n° de TVA (clients) ou par référence (articles) quand c'était possible.</div>
    <div class="row-g wrap"><button class="btn primary" data-a="od-sync">Synchroniser maintenant</button><button class="btn" data-a="od-test">Tester la connexion</button><button class="btn" data-a="od-form">Modifier / renouveler la clé</button><button class="btn danger" data-a="od-off">Déconnecter</button></div></div>`;
}
ACTIONS["od-form"] = () => {
  const s = OD || {}, has = !!s.configured;
  const m = modal(`${mHead("Connexion Odoo")}<form autocomplete="off"><div class="body stack-s"><div class="fields">
    ${field("od-url", "Adresse de votre Odoo", s.url || "", { required: !has, ph: "https://ways.odoo.com", wide: true })}
    ${field("od-login", "Identifiant de connexion de l'utilisateur (e-mail)", s.login || "", { ph: "celui qui a créé la clé" })}
    ${field("od-db", "Base de données", s.db || "", { ph: "détectée automatiquement" })}
    ${field("od-key", "Clé API", "", { type: "password", required: !has, ph: has ? "inchangée" : "" })}
    ${field("od-exp", "La clé expire le", s.keyExp || "", { type: "date" })}</div>
    <div class="hint">Enregistrés sur le serveur ways.support uniquement ; laissez la clé vide pour garder l'actuelle.</div><div class="err" id="od-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" id="od-go">Enregistrer et tester</button></footer></form>`);
  m.querySelector("#od-key").setAttribute("autocomplete", "new-password");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const err = m.querySelector("#od-err"), go = m.querySelector("#od-go"); go.disabled = true; err.textContent = "";
    try {
      await API.call("POST", "odoo/config", { url: val("od-url"), db: val("od-db"), login: val("od-login"), key: m.querySelector("#od-key").value.trim(), keyExp: val("od-exp") });
      closeModal(); await odRefresh(); loadOd(); ACTIONS["od-test"](true);
    } catch (x) { err.textContent = tr(x.message); go.disabled = false; }
  };
};
ACTIONS["od-test"] = async startAfter => {
  const m = modal(`${mHead("Test de la connexion Odoo")}<div class="body" id="od-t"><div class="muted">Connexion à Odoo…</div></div><footer><button class="btn" data-close>Fermer</button></footer>`);
  const box = m.querySelector("#od-t");
  try {
    const r = await API.call("POST", "odoo/test");
    box.innerHTML = `<div class="banner info">Connexion réussie. Côté Odoo : <b>${r.clients}</b> clients, <b>${r.products}</b> articles vendables, <b>${r.invoices}</b> factures et notes de crédit.</div>
      <div class="muted">${startAfter === true ? "L'import démarre maintenant ; pour un long historique il se poursuit par lots tant que l'ERP est ouvert." : "La synchronisation tourne toutes les 15 minutes."}</div>`;
    if (startAfter === true) odTick(true);
  } catch (e) { box.innerHTML = `<div class="err">${esc(tr(e.message))}</div><div class="hint">Vérifiez l'adresse (ex. https://ways.odoo.com), la clé API et sa date de validité. Avec Odoo 18 ou antérieur, indiquez aussi l'identifiant de connexion (e-mail) de l'utilisateur qui a créé la clé. La liaison demande la formule Custom.</div>`; }
};
ACTIONS["od-sync"] = async el => {
  el.disabled = true; el.textContent = "Synchronisation…";
  const r = await odTick(true);
  if (r && r.ok) toast(r.more ? "Import en cours : la suite arrive par lots…" : `Synchronisé : ${r.clients} client(s), ${r.products} article(s), ${r.invoices + r.refreshed} facture(s) mises à jour`);
  else if (r) toast(tr(r.error || "Erreur"));
  loadOd();
};
ACTIONS["od-off"] = () => confirmBox("Déconnecter Odoo ? La clé est effacée du serveur. Les clients, articles et factures déjà importés restent dans l'ERP, toujours en lecture seule.", async () => { await API.call("POST", "odoo/disconnect"); OD = null; loadOd(); }, "Déconnecter");
