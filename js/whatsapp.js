"use strict";
/* ======================= WhatsApp (Paramètres) =======================
   Numéro de la station dédié à l'équipe, relié à l'API Cloud de Meta (API seule) : l'outil et Muninn le surveillent.
   Voir api/whatsapp.php. Identifiants saisis ici, gardés sur le serveur, jamais renvoyés. */
let WA = null, waStarted = false;
function waStart() {   // filet de sécurité : messages reçus mais pas encore traités (normalement traités dès réception)
  if (!SERVER || waStarted) return; waStarted = true;
  setInterval(() => { if (SERVER && API && ME && isOffice() && !SBX && document.visibilityState === "visible") API.call("POST", "whatsapp/tick", {}).catch(() => {}); }, 120000);
}
function waCardShell() {
  if (!SERVER || !isAdmin()) return "";
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><h3 class="np">WhatsApp de l'équipe</h3><div id="wa-box"><div class="muted">Chargement…</div></div></div></div>`;
}
const waFmtNum = n => n ? "+" + String(n).replace(/^(\d{2})(\d{3})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5") : "";
async function loadWa() {
  const box = document.getElementById("wa-box"); if (!box) return;
  try { WA = await API.call("GET", "whatsapp/status"); } catch (e) { box.innerHTML = `<div class="err">${esc(tr(e.message))}</div>`; return; }
  const s = WA, copy = (v, label) => `<div class="row-g"><code class="mono small" style="user-select:all;word-break:break-all">${esc(v || "")}</code><button class="btn sm" data-a="wa-copy" data-v="${esc(v || "")}">${esc(tr(label || "Copier"))}</button></div>`;
  const steps = `<ol class="small stack-s" style="margin:0;padding-left:18px">
      <li>Sur <b>developers.facebook.com</b> → My Apps → <b>Create app</b>, cas d'usage « Connect with customers through WhatsApp », relié au portefeuille Meta Business de l'organisation</li>
      <li>WhatsApp → <b>API Setup</b> → <b>Add phone number</b> : le numéro de la SIM dédiée (jamais utilisée sur WhatsApp), nom affiché : celui de l'organisation, code reçu par SMS (mettez la SIM dans un téléphone le temps de la vérification).</li>
      <li>Copiez le <b>Phone number ID</b> et le <b>WhatsApp Business Account ID</b>.</li>
      <li>Business settings → <b>System users</b> → ajoutez un utilisateur système administrateur, donnez-lui l'app et le compte WhatsApp, puis <b>Generate token</b> : permissions <span class="mono">whatsapp_business_messaging</span> et <span class="mono">whatsapp_business_management</span>, expiration « Never ».</li>
      <li>App settings → Basic → <b>App secret</b> (« Show »).</li>
      <li>Saisissez ces 4 éléments ici, puis « Tester » et « Enregistrer le numéro ».</li>
      <li>WhatsApp → <b>Configuration</b> → Webhook : Callback URL ${copy(s.webhook)} Verify token ${copy(s.verify)} puis « Verify and save » et abonnez le champ <b>messages</b>.</li>
      <li>Ajoutez un moyen de paiement au compte WhatsApp (au-delà des messages gratuits) et passez l'app en mode <b>Live</b>.</li></ol>`;
  if (!s.configured) {
    box.innerHTML = `<div class="stack-s"><div>Un numéro WhatsApp de la station réservé à l'équipe : les collègues écrivent à Muninn comme à un collègue — questions, photos, documents. Muninn répond avec les droits de la personne, et la conversation est la même que dans son panneau Muninn.</div>
      ${steps}${s.error ? `<div class="banner warn">${esc(s.error)}</div>` : ""}<div><button class="btn primary" data-a="wa-form">Saisir les identifiants Meta</button></div></div>`;
    return;
  }
  const n = s.number || {};
  const people = [...(s.users || []).map(u => ({ kind: "user", ref: u.id, name: u.name, sub: ROLE_LBL[u.role] || u.role }))];
  box.innerHTML = `<div class="stack">
    <dl class="kv"><dt>Numéro</dt><dd>${n.display ? `<b>${esc(n.display)}</b>${n.name ? " · " + esc(n.name) : ""}${n.quality ? ` · qualité <span class="chip ${n.quality === "GREEN" ? "good" : n.quality === "RED" ? "bad" : "warn"}">${esc(n.quality)}</span>` : ""}` : `<span class="muted">pas encore testé</span>`}</dd>
      <dt>Inscription API</dt><dd>${s.registered ? `<span class="chip good">enregistré</span> <span class="muted small">(code PIN gardé sur le serveur)</span>` : `<span class="chip warn">à faire</span>`}</dd>
      <dt>Jeton</dt><dd class="mono small">${esc(s.tokenHint || "—")} · version ${esc(s.ver)}</dd>
      <dt>Ce mois-ci</dt><dd>${s.stats.in} message${s.stats.in > 1 ? "s" : ""} reçu${s.stats.in > 1 ? "s" : ""} · ${s.stats.out} envoyé${s.stats.out > 1 ? "s" : ""}${s.lastIn ? ` · dernier reçu ${esc(fmtDT(new Date(s.lastIn).toISOString()))}` : ""}${s.queue ? ` · <b>${s.queue} en attente</b>` : ""}</dd>
      <dt>Réception</dt><dd>${s.sub === "ok" ? `<span class="chip good">app abonnée au compte</span>` : s.sub ? `<span class="chip bad">abonnement impossible</span> <span class="small">${esc(s.sub)}</span>` : `<span class="chip warn">abonnement non vérifié</span> <span class="muted small">cliquez sur « Tester la connexion »</span>`}<div class="small muted">${s.lastHook ? `Dernier appel de Meta : ${esc(fmtDT(new Date(s.lastHook).toISOString()))}` : "Meta n'a encore jamais appelé l'adresse du webhook"}</div></dd>
      <dt>Webhook</dt><dd>${copy(s.webhook)}<div class="small muted">Verify token</div>${copy(s.verify)}</dd></dl>
    ${s.error ? `<div class="banner warn"><b>Dernière erreur :</b> ${esc(s.error)}</div>` : ""}
    <div class="row-g wrap"><button class="btn" data-a="wa-test">Tester la connexion</button>${s.registered ? "" : `<button class="btn primary" data-a="wa-register">Enregistrer le numéro</button>`}<button class="btn" data-a="wa-send-test">Envoyer un message test</button><button class="btn" data-a="wa-form">Modifier les identifiants</button><button class="btn danger" data-a="wa-off">Déconnecter</button></div>
    <details><summary class="small">Procédure Meta (rappel)</summary>${steps}</details>

    <h4 class="np" style="margin-top:6px">Qui peut écrire à Muninn</h4>
    <div class="small muted">Associez le numéro de chaque membre de l'équipe à son compte (Muninn répond avec ses droits, et la conversation apparaît dans son panneau Muninn).</div>
    <div id="wa-contacts" class="stack-s">${(s.contacts || []).map((c, i) => waContactRow(c, people, i)).join("")}</div>
    <div class="row-g"><button class="btn sm" data-a="wa-c-add">Ajouter un numéro</button><button class="btn sm primary" data-a="wa-c-save">Enregistrer la liste</button></div>

    <h4 class="np" style="margin-top:6px">Messages à l'équipe (via Muninn)</h4>
    <div class="small">On peut demander à Muninn d'envoyer un message WhatsApp à un membre de l'équipe (« dis à Marc que… ») ; il montre le texte et attend un « oui » avant d'envoyer. WhatsApp n'accepte un texte libre que si la personne a écrit au numéro de la station dans les 24 dernières heures ; sinon, il faut un modèle de message approuvé par Meta.</div>
    ${(() => { const t = s.tpl || {}, st = t.status || ""; const chip = st === "APPROVED" ? `<span class="chip good">approuvé</span>` : st === "PENDING" ? `<span class="chip warn">en cours d'examen chez Meta</span>` : st === "REJECTED" ? `<span class="chip bad">refusé${t.error ? " : " + esc(t.error) : ""}</span>` : st ? `<span class="chip">${esc(st)}</span>` : `<span class="chip">pas encore créé</span>`;
      return `<div class="small">Modèle « <span class="mono">${esc(t.name || "message_equipe")}</span> » (${esc(t.lang || "fr")}) : ${chip}</div><pre class="small" style="white-space:pre-wrap;margin:0;padding:8px 10px;background:var(--bg);border-radius:8px">${esc(s.tplBody || "")}</pre>
      <div class="row-g">${st === "APPROVED" ? "" : `<button class="btn sm primary" data-a="wa-tpl" data-create="1">Créer le modèle chez Meta</button>`}<button class="btn sm" data-a="wa-tpl">Vérifier l'état</button></div>${t.error && st !== "REJECTED" ? `<div class="small txt-bad">${esc(t.error)}</div>` : ""}`; })()}

    <h4 class="np" style="margin-top:6px">Numéros inconnus</h4>
    <label class="chk line"><input type="checkbox" id="wa-ur" ${s.unknownReply ? "checked" : ""}> Leur répondre automatiquement (une fois par semaine et par numéro)</label>
    <textarea id="wa-ut" rows="2" class="wide">${esc(s.unknownTxt || "")}</textarea>
    <div><button class="btn sm" data-a="wa-u-save">Enregistrer</button></div>
    ${(s.unknown || []).length ? `<details><summary class="small">${s.unknown.length} message${s.unknown.length > 1 ? "s" : ""} de numéros inconnus</summary><div class="stack-s" style="margin-top:6px">${s.unknown.slice(0, 40).map(u => `<div class="small"><span class="num muted">${esc(fmtDT(u.at))}</span> · <b>${esc(waFmtNum(u.num))}</b>${u.name ? " (" + esc(u.name) + ")" : ""} · ${esc(u.text || "[" + u.type + "]")}</div>`).join("")}</div></details>` : `<div class="small muted">Aucun message d'un numéro inconnu.</div>`}
  </div>`;
  box._people = people;
}
function waContactRow(c, people, i) {
  return `<div class="row-g wa-c" data-i="${i}"><input class="fsel mono" style="width:170px" placeholder="0470 12 34 56" value="${esc(c.num ? waFmtNum(c.num) : "")}" data-f="num">
    <select class="fsel" data-f="who"><option value="">— personne —</option>${people.map(p => `<option value="${p.kind}:${esc(p.ref)}" ${c.kind === p.kind && c.ref === p.ref ? "selected" : ""}>${esc(p.name)} · ${esc(tr(p.sub))}</option>`).join("")}</select>
    <button class="linkbtn small" data-a="wa-c-rm" aria-label="${esc(tr("Retirer"))}">Retirer</button></div>`;
}
ACTIONS["wa-copy"] = el => { navigator.clipboard?.writeText(el.dataset.v).then(() => toast("Copié"), () => toast("Sélectionnez le texte et copiez-le")); };
ACTIONS["wa-c-add"] = () => { const box = document.getElementById("wa-box"), list = document.getElementById("wa-contacts"); list.insertAdjacentHTML("beforeend", waContactRow({}, box._people || [], list.children.length)); };
ACTIONS["wa-c-rm"] = el => el.closest(".wa-c").remove();
ACTIONS["wa-c-save"] = async () => {
  const box = document.getElementById("wa-box"), rows = [...document.querySelectorAll("#wa-contacts .wa-c")];
  const contacts = rows.map(r => { const who = r.querySelector("[data-f=who]").value, [kind, ...ref] = who.split(":"); const p = (box._people || []).find(x => x.kind === kind && x.ref === ref.join(":"));
    return { num: r.querySelector("[data-f=num]").value, kind, ref: ref.join(":"), name: p ? p.name : "" }; }).filter(c => c.num.trim() && c.kind);
  try { await API.call("POST", "whatsapp/contacts", { contacts }); toast("Numéros de l'équipe enregistrés"); loadWa(); }
  catch (e) { toast(tr(e.message)); }
};
ACTIONS["wa-tpl"] = async el => {
  try { await API.call("POST", "whatsapp/template", el.dataset.create ? { create: 1 } : {}); toast(el.dataset.create ? "Modèle envoyé à Meta pour approbation" : "État mis à jour"); loadWa(); }
  catch (e) { toast(tr(e.message)); }
};
ACTIONS["wa-u-save"] = async () => {
  try { await API.call("POST", "whatsapp/config", { unknownReply: document.getElementById("wa-ur").checked, unknownTxt: document.getElementById("wa-ut").value }); toast("Enregistré"); loadWa(); }
  catch (e) { toast(tr(e.message)); }
};
ACTIONS["wa-form"] = () => {
  const s = WA || {};
  const m = modal(`${mHead("Identifiants WhatsApp (Meta)")}<form autocomplete="off"><div class="body stack-s"><div class="fields">
    ${field("wf-phone", "Phone number ID", s.phoneId || "", { cls: "mono", required: true })}${field("wf-waba", "WhatsApp Business Account ID", s.wabaId || "", { cls: "mono" })}
    ${field("wf-token", "Jeton permanent (utilisateur système)", "", { type: "password", required: !s.tokenHint, ph: s.tokenHint ? "inchangé (" + s.tokenHint + ")" : "" })}
    ${field("wf-secret", "App secret", "", { type: "password", required: !s.secretSet, ph: s.secretSet ? "inchangé" : "" })}
    ${field("wf-ver", "Version de l'API Graph", s.ver || "v23.0", { cls: "mono" })}
    ${field("wf-pin", "Code PIN à 6 chiffres (seulement si vous l'avez déjà choisi chez Meta)", "", { type: "password", ph: s.registered ? "inchangé" : "laisser vide : l'outil en choisit un" })}</div>
    <div class="hint">Gardés sur le serveur uniquement, jamais réaffichés.</div><div class="err" id="wf-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`);
  ["wf-token", "wf-secret", "wf-pin"].forEach(id => m.querySelector("#" + id).setAttribute("autocomplete", "new-password"));
  m.querySelector("form").onsubmit = async e => { e.preventDefault();
    try { await API.call("POST", "whatsapp/config", { phoneId: val("wf-phone"), wabaId: val("wf-waba"), token: m.querySelector("#wf-token").value.trim(), secret: m.querySelector("#wf-secret").value.trim(), ver: val("wf-ver").trim(), pin: m.querySelector("#wf-pin").value.replace(/\D/g, "") });
      closeModal(); await loadWa(); if (WA && WA.configured) ACTIONS["wa-test"](); }
    catch (x) { m.querySelector("#wf-err").textContent = tr(x.message); } };
};
ACTIONS["wa-test"] = async () => { try { await API.call("POST", "whatsapp/test", {}); toast("Connexion WhatsApp OK"); } catch (e) { toast(tr(e.message)); } loadWa(); };
ACTIONS["wa-register"] = () => confirmBox("Enregistrer le numéro sur l'API WhatsApp ? L'outil choisit un code PIN à 6 chiffres (vérification en deux étapes) et le garde sur le serveur. Ce numéro ne pourra plus être utilisé dans l'application WhatsApp.", async () => {
  try { await API.call("POST", "whatsapp/register", {}); toast("Numéro enregistré : Muninn peut recevoir les messages"); } catch (e) { toast(tr(e.message)); } loadWa(); }, "Enregistrer");
ACTIONS["wa-send-test"] = () => {
  const m = modal(`${mHead("Message test")}<form><div class="body stack-s">${field("wt-to", "Numéro WhatsApp", "", { required: true, ph: "0470 12 34 56", autofocus: true })}
    <div class="hint">La personne doit avoir écrit à ce numéro dans les dernières 24 h (règle de WhatsApp pour les messages libres) : écrivez-lui d'abord « test » depuis votre téléphone.</div><div class="err" id="wt-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Envoyer</button></footer></form>`, "sm");
  m.querySelector("form").onsubmit = async e => { e.preventDefault();
    try { await API.call("POST", "whatsapp/send-test", { to: val("wt-to") }); closeModal(); toast("Message test envoyé"); } catch (x) { m.querySelector("#wt-err").textContent = tr(x.message); } };
};
ACTIONS["wa-off"] = () => confirmBox("Déconnecter WhatsApp ? Muninn ne recevra plus les messages. Rien n'est supprimé chez Meta.", async () => { await API.call("POST", "whatsapp/config", { disconnect: true }); loadWa(); }, "Déconnecter");
