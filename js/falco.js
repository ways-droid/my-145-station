"use strict";
/* ======================= PASSERELLE COMPTABLE FALCO (→ Horus) =======================
   Le serveur transmet les factures et notes de crédit (aujourd'hui celles d'Odoo) à Falco « vers la
   comptabilité » uniquement — jamais via Peppol, Odoo les a déjà envoyées. Le navigateur déclenche seulement. */
let FA = null;
const falcoOn = () => !!(FA && FA.configured);
function falcoChip(d) {
  const f = d && d.falco; if (!f) return "";
  if (f.status === "sent") return ` <span class="chip ${f.warning ? "warn" : "good"}" title="Transmis à Falco le ${esc(fmtDate((f.sentAt || "").slice(0, 10)))}${f.warning ? " — " + esc(f.warning) : ""}">Falco ✓</span>`;
  return ` <span class="chip bad" title="${esc(f.error || "")}">Falco ✗</span>`;
}
async function faRefresh() { try { FA = await API.call("GET", "falco/status"); } catch { FA = null; } return FA; }
async function faTick() {
  if (!SERVER || !API || document.hidden) return;
  if (!FA) await faRefresh();
  if (!FA || !FA.configured || !FA.auto) return;
  try { const r = await API.call("POST", "falco/sync", {}); if (!r.skipped) { await faRefresh(); if (document.getElementById("fa-box")) loadFa(); } } catch { }
}
let faStarted = false;
function faStart() {
  if (!SERVER || faStarted) return; faStarted = true;
  setTimeout(() => faRefresh().then(() => faTick()), 6000);
  setInterval(() => faTick(), 120000);
}

function faCardShell() {
  if (!SERVER || !isAdmin()) return "";
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><h3 class="np">Liaison Falco (comptabilité)</h3><div id="fa-box"><div class="muted">Chargement…</div></div></div></div>`;
}
async function loadFa() {
  const box = document.getElementById("fa-box"); if (!box) return;
  const s = await faRefresh();
  if (!s) { box.innerHTML = `<div class="err">${esc(tr("Le serveur ne répond pas."))}</div>`; return; }
  if (!s.configured) {
    box.innerHTML = `<div class="stack-s"><div>L'ERP transmet vos factures et notes de crédit à Falco, et donc à votre comptable dans Horus, <b>uniquement vers la comptabilité</b> : elles ne sont jamais renvoyées à vos clients via Peppol, puisqu'Odoo l'a déjà fait. Le PDF transmis est celui d'Odoo.</div>
      <ol class="small stack-s" style="margin:0;padding-left:18px"><li>Sur <b>dev.falco-app.be</b> : l'application « ERP W.A.Y.S. » (publique) vous donne un <b>secret d'application de production</b> (as_live_…).</li>
      <li>Dans l'application de bureau Falco : vos initiales → <b>API access</b> → choisissez l'application → générez la <b>clé API</b> (sk_live_…).</li>
      <li>Collez les deux ici, puis choisissez la <b>date de bascule</b> convenue avec votre comptable : seules les factures datées de ce jour ou après seront transmises.</li></ol>
      <div><button class="btn primary" data-a="fa-form">Connecter Falco</button></div></div>`;
    return;
  }
  const c = s.counts || {};
  box.innerHTML = `<div class="stack-s"><dl class="kv"><dt>Organisation</dt><dd>${s.org && s.org.name ? `<b>${esc(s.org.name)}</b>${s.org.vat ? ` · ${esc(s.org.vat)}` : ""}` : `<span class="muted">à vérifier avec « Tester »</span>`}</dd>
      <dt>Expéditeur</dt><dd>${(() => { const x = s.sender || {}, ad = x.address || {}; const ok = ad.line1 && ad.zip && ad.city && x.vat;
        return `${esc(x.name || "—")}${x.vat ? ` · ${esc(x.vat)}` : ` · <span class="chip bad">TVA manquante</span>`} · ${ok || (ad.line1 && ad.zip && ad.city) ? `${esc(ad.line1)}, ${esc(ad.zip)} ${esc(ad.city)}` : `<span class="chip bad">adresse ${x.raw ? "illisible : « " + esc(x.raw) + " »" : "absente sur le serveur"}</span>`}`; })()} <span class="muted small">(Paramètres → Entreprise)</span></dd>
      <dt>Date de bascule</dt><dd>${s.from ? `factures datées à partir du <b>${fmtDate(s.from)}</b>` : `<span class="chip warn">à définir</span>`}</dd>
      <dt>Transmission</dt><dd>${s.auto ? "automatique (toutes les 5 min)" : "manuelle (bouton ci-dessous)"}${s.lastOk ? ` · dernière ${esc(tr(agoTxt(new Date(s.lastOk).toISOString())))}` : ""}</dd>
      <dt>Documents</dt><dd><span class="chip good">${c.sent || 0} transmis</span> <span class="chip ${c.pending ? "info" : ""}">${c.pending || 0} en attente</span>${c.errors ? ` <span class="chip bad">${c.errors} en erreur</span>` : ""}</dd></dl>
    ${s.error ? `<div class="banner warn"><b>Dernière erreur :</b> ${esc(s.error)}${s.lastBody || s.lastMeta ? ` <button class="linkbtn" data-a="fa-details">Voir la liste et les raisons</button>` : ""}</div>` : c.errors ? `<div class="banner warn">${c.errors} document${c.errors > 1 ? "s" : ""} en erreur. <button class="linkbtn" data-a="fa-details">Voir la liste et les raisons</button></div>` : ""}
    <div class="muted small">Le jour de la bascule, arrêtez de mettre Falco en copie de vos e-mails de facture : sinon votre comptable recevrait les factures deux fois.</div>
    <div class="row-g wrap"><button class="btn primary" data-a="fa-push" ${s.from ? "" : "disabled"}>${c.errors && !c.pending ? "Réessayer" : "Transmettre maintenant"}${c.pending + c.errors ? ` (${c.pending + c.errors})` : ""}</button><button class="btn" data-a="fa-test">Tester la connexion</button><button class="btn" data-a="fa-form">Modifier</button><button class="btn danger" data-a="fa-off">Déconnecter</button></div></div>`;
}
ACTIONS["fa-form"] = () => {
  const s = FA || {}, has = !!s.configured;
  const m = modal(`${mHead("Connexion Falco")}<form autocomplete="off"><div class="body stack-s"><div class="fields">
    ${field("fa-secret", "Secret de l'application (as_live_…)", "", { type: "password", required: !has, ph: has ? "inchangé" : "" })}
    ${field("fa-key", "Clé API de votre organisation (sk_live_…)", "", { type: "password", required: !has, ph: has ? "inchangée" : "" })}
    ${field("fa-from", "Date de bascule", s.from || "", { type: "date" })}
    ${field("fa-auto", "Transmission", s.auto ? "1" : "", { type: "select", options: [["", "Manuelle (je clique sur « Transmettre »)"], ["1", "Automatique (toutes les 5 minutes)"]] })}</div>
    <div class="hint">Le secret et la clé restent sur le serveur ways.support et ne sont jamais renvoyés au navigateur. Conseil : commencez en manuel, vérifiez les premières factures dans Falco avec votre comptable, puis passez en automatique.</div><div class="err" id="fa-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" id="fa-go">Enregistrer et tester</button></footer></form>`);
  ["fa-secret", "fa-key"].forEach(id => m.querySelector("#" + id).setAttribute("autocomplete", "new-password"));
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const err = m.querySelector("#fa-err"), go = m.querySelector("#fa-go"); go.disabled = true; err.textContent = "";
    try {
      await API.call("POST", "falco/config", { secret: m.querySelector("#fa-secret").value.trim(), key: m.querySelector("#fa-key").value.trim(), from: val("fa-from"), auto: val("fa-auto") === "1" });
      closeModal(); await faRefresh(); loadFa(); ACTIONS["fa-test"]();
    } catch (x) { err.textContent = tr(x.message); go.disabled = false; }
  };
};
ACTIONS["fa-test"] = async () => {
  const m = modal(`${mHead("Test de la connexion Falco")}<div class="body" id="fa-t"><div class="muted">Connexion à Falco…</div></div><footer><button class="btn" data-close>Fermer</button></footer>`);
  const box = m.querySelector("#fa-t");
  try {
    const r = await API.call("POST", "falco/test");
    box.innerHTML = `<div class="banner info">Connexion réussie${r.org && r.org.name ? ` : organisation <b>${esc(r.org.name)}</b>${r.org.vat ? ` (${esc(r.org.vat)})` : ""}` : ""}.</div>
      <div class="muted">${FA && FA.from ? `Les factures datées à partir du ${fmtDate(FA.from)} peuvent maintenant être transmises.` : "Choisissez la date de bascule avec votre comptable pour commencer les transmissions."}</div>`;
    loadFa();
  } catch (e) { box.innerHTML = `<div class="err">${esc(tr(e.message))}</div><div class="hint">Vérifiez le secret de l'application (production), la clé API générée dans Falco pour cette application, et que l'application est publique.</div>`; }
};
ACTIONS["fa-push"] = async el => {
  el.disabled = true; el.textContent = "Transmission…";
  try {
    const r = await API.call("POST", "falco/push", {});
    toast(`${r.sent} document${r.sent > 1 ? "s" : ""} transmis à Falco${r.errors ? ` · ${r.errors} en erreur` : ""}${r.remaining ? ` · ${r.remaining} restant(s), relancez` : ""}`);
  } catch (e) { toast(tr(e.message)); }
  loadFa();
};
ACTIONS["fa-off"] = () => confirmBox("Déconnecter Falco ? Le secret et la clé sont effacés du serveur. Les documents déjà transmis restent marqués comme tels.", async () => { await API.call("POST", "falco/disconnect"); FA = null; loadFa(); }, "Déconnecter");
/* depuis la sélection des factures */
ACTIONS["sel-falco"] = el => {
  const docs = selectedDocs(el.dataset.kind).filter(d => isOdoo(d) && !(d.falco && d.falco.status === "sent") && ["envoyee", "payee"].includes(d.status));
  const before = FA && FA.from ? docs.filter(d => (d.date || "") < FA.from) : [];
  confirmBox(`Transmettre ${docs.length} document${docs.length > 1 ? "s" : ""} à Falco (vers la comptabilité uniquement) ?${before.length ? ` Attention : ${before.length > 1 ? `${before.length} documents sont antérieurs` : "ce document est antérieur"} à la date de bascule et ${before.length > 1 ? "ont" : "a"} peut-être déjà été reçu${before.length > 1 ? "s" : ""} par Falco via la copie e-mail — risque de doublon chez votre comptable.` : ""}`, async () => {
    try {
      const r = await API.call("POST", "falco/push", { ids: docs.map(d => d.id), override: true });
      toast(`${r.sent} transmis à Falco${r.errors ? ` · ${r.errors} en erreur : ${r.messages.join(" · ")}` : ""}`);
    } catch (e) { toast(tr(e.message)); }
  }, "Transmettre");
};
ACTIONS["fa-details"] = () => {
  const s = FA || {}, list = s.errList || [];
  const pre = t => `<pre style="white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto;font-size:12px;background:var(--bg);padding:10px;border-radius:8px;border:1px solid var(--line)">${esc(t || "—")}</pre>`;
  const fmt = t => { try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return t; } };
  modal(`${mHead("Documents en erreur vers Falco")}<div class="body stack-s">
    ${list.length ? `<div class="tablewrap"><table><thead><tr><th>Numéro</th><th>Date</th><th>Client</th><th>Statut</th><th>Dernier essai</th><th>Raison</th></tr></thead><tbody>${list.map(e => `<tr><td class="mono nowrap">${esc(e.number)}</td><td class="num nowrap">${fmtDate(e.date)}</td><td>${esc(e.client)}</td><td class="nowrap">${chip(e.status)}${e.retry ? "" : ` <span class="chip" title="Ne sera pas retenté automatiquement">non retenté</span>`}</td><td class="num nowrap small">${e.tried ? esc(new Date(e.tried).toLocaleString("fr-BE", { dateStyle: "short", timeStyle: "short" })) : "—"}</td><td class="small">${esc(e.error)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="muted">Aucun document en erreur.</div>`}
    ${s.lastBody ? `<details><summary class="small">Détail technique du dernier refus de Falco (cette transmission)</summary><b>Réponse de Falco</b>${pre(fmt(s.lastBody))}<b>Données envoyées</b>${pre(s.lastMeta)}</details>` : ""}
    </div><footer><button class="btn" data-close>Fermer</button></footer>`, "lg");
};
