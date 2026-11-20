"use strict";
/* ======================= FORMATION À LA STATION (INDUCTION) =======================
   Toute personne qui rejoint la station suit la formation station : une liste de points (Paramètres → inductionItems),
   chacun validé par un formateur (pas par la personne elle-même), puis la signature finale du formateur.
   induction/<staffId> = { staffId, items: { "<point>": { at, by (staffId formateur), name } }, signed: { at, by, name } | absent, notes } */
const IND_DEFAULT = ["Présentation de la station, des bureaux et des contacts", "Sécurité piste : zones, gilets, FOD, circulation côté piste", "Badge aéroport et règles d'accès",
  "Procédures d'urgence, extincteurs, premiers secours", "Outillage : sortie / retour, étalonnage (MOE 2.6.5)", "Magasin et pièces : réception, quarantaine, envois",
  "Handover du shift et Tech Log (cet outil)", "AMOS : CRS et documentation", "Véhicules de la station et conduite côté piste", "Déchets et produits dangereux"];
const indItems = () => { const l = String(settings().inductionItems || "").split("\n").map(x => x.trim()).filter(Boolean); return l.length ? l : IND_DEFAULT; };
const indDoc = pid => S.induction.find(x => x.id === pid);
const indDone = pid => { const d = indDoc(pid); return indItems().filter(k => d && d.items && d.items[k]).length; };
const indSigned = pid => !!(indDoc(pid) || {}).signed;
const indChip = pid => indSigned(pid) ? `<span class="chip sm good">${esc(tr("Formation station faite"))}</span>`
  : `<span class="chip sm ${indDone(pid) ? "warn" : "bad"}">${esc(tr("Formation station"))} ${indDone(pid)}/${indItems().length}</span>`;
const indTodo = () => rosterStaff().filter(p => !indSigned(p.id));
/* valider : un formateur relié à une fiche Personnel, jamais la personne formée */
const indCanTrain = pid => !readOnly && !!meStaff() && meStaff().id !== pid;

function inductionList() {
  const ppl = rosterStaff().sort((a, b) => (indSigned(a.id) ? 1 : 0) - (indSigned(b.id) ? 1 : 0) || staffSort(a, b));
  return `<div class="panel"><div class="pad hint">${esc(tr("Chaque nouvelle personne suit la formation station. Chaque point est validé par un formateur, puis le formateur signe. Les points se règlent dans Paramètres."))}</div>
    <div class="tablewrap"><table><thead><tr><th>Nom</th><th>Fonction</th><th>Progression</th><th>Signée par</th></tr></thead><tbody>${ppl.map(p => { const d = indDoc(p.id) || {}, n = indDone(p.id), t = indItems().length;
      return `<tr class="click" data-a="ind-open" data-id="${p.id}"><td><b>${esc(p.name)}</b></td><td class="small">${esc(tr(STAFF_FN[p.function] || ""))}</td>
        <td><div class="ind-bar"><i style="width:${Math.round(100 * n / t)}%"></i></div><span class="small muted">${n} / ${t}</span></td>
        <td class="small">${d.signed ? `${esc(d.signed.name || "")} · ${fmtDT(d.signed.at)}` : indChip(p.id)}</td></tr>`; }).join("")}</tbody></table>
      ${ppl.length ? "" : `<div class="empty">${esc(tr("Aucune personne pour l'instant."))}</div>`}</div></div>`;
}
ACTIONS["ind-open"] = el => openInduction(el.dataset.id);
function openInduction(pid) {
  const p = staff(pid); if (!p) return;
  const d = indDoc(pid) || {}, items = indItems(), can = indCanTrain(pid), all = items.every(k => d.items && d.items[k]);
  const m = modal(`${mHead(esc(tr("Formation station")) + " · " + esc(p.name) + " " + indChip(pid))}<div class="body">
    ${!meStaff() ? `<div class="banner info">${esc(tr("Pour valider, votre compte doit être relié à une fiche Personnel (même e-mail)."))}</div>` : meStaff().id === pid ? `<div class="banner info">${esc(tr("C'est votre formation : un formateur valide chaque point."))}</div>` : ""}
    <div class="ind-list">${items.map((k, i) => { const x = d.items && d.items[k];
      return `<div class="ind-row ${x ? "ok" : ""}"><span>${x ? "✔" : "○"} ${esc(k)}</span><span class="small">${x ? `${esc(x.name || "")} · ${fmtDT(x.at)}` : can && !d.signed ? `<button class="btn sm" data-a="ind-ok" data-id="${pid}" data-i="${i}">${esc(tr("Valider"))}</button>` : `<span class="muted">${esc(tr("à faire"))}</span>`}</span></div>`; }).join("")}</div>
    ${d.signed ? `<div class="banner good">✍ ${esc(tr("Formation signée par le formateur"))} ${esc(d.signed.name || "")} · ${fmtDT(d.signed.at)}</div>` : ""}</div>
    <footer><button class="btn" data-close>Fermer</button>${!d.signed && can ? `<button class="btn primary" data-a="ind-sign" data-id="${pid}" ${all ? "" : `disabled title="${esc(tr("Tous les points doivent être validés"))}"`}>✍ ${esc(tr("Signer la formation (formateur)"))}</button>` : ""}</footer>`, "lg");
  m.dataset.ind = pid;
}
const indMark = () => { const me = meStaff(); return { at: new Date().toISOString(), by: me.id, name: me.name }; };
ACTIONS["ind-ok"] = async el => {
  const pid = el.dataset.id, k = indItems()[+el.dataset.i]; if (!indCanTrain(pid) || !k) return;
  if (indDoc(pid)) await patch("induction", pid, { items: { [k]: indMark() } }); else await save("induction", pid, { staffId: pid, items: { [k]: indMark() } });
  openInduction(pid);
};
ACTIONS["ind-sign"] = el => {
  const pid = el.dataset.id, p = staff(pid); if (!indCanTrain(pid) || !p) return;
  confirmBox(`${esc(tr("Je confirme, en tant que formateur, que"))} <b>${esc(p.name)}</b> ${esc(tr("a suivi toute la formation station."))}`, async () => { await patch("induction", pid, { signed: indMark() }); openInduction(pid); }, tr("Signer"));
};
