"use strict";
/* ======================= STATION NEEDS : BESOINS DE LA STATION =======================
   Ce dont la station a besoin : outillage, consommables, équipement, informatique, locaux, divers.
   Chacun peut demander ; le Station Lead (ou le bureau) approuve ou refuse, puis le besoin est commandé et reçu.
   needs/<id> = { title, cat, qty, unit, prio: low|normal|urgent|aog, reason, by (staffId), neededBy, toolId, supplier, ref, cost, currency,
                  status: asked|approved|ordered|received|refused, history[{at, by, status, note}], notes } */
const ND_CAT = { tooling: "Outillage", consumable: "Consommables", equipment: "Équipement", it: "Informatique", ppe: "EPI / sécurité", office: "Bureau / locaux", other: "Divers" };
const ND_PRIO = { low: ["Basse", ""], normal: ["Normale", "info"], urgent: ["Urgente", "warn"], aog: ["AOG", "bad"] };
const ND_STATUS = { asked: ["Demandé", "warn"], approved: ["Approuvé", "info"], ordered: ["Commandé", "orange"], received: ["Reçu", "good"], refused: ["Refusé", ""] };
const ND_NEXT = { asked: [["approved", "Approuver", "primary"], ["refused", "Refuser", ""]], approved: [["ordered", "Marquer commandé", "primary"]], ordered: [["received", "Marquer reçu", "primary"]] };
const ndOpen = n => !["received", "refused"].includes(n.status || "asked");
const ndLate = n => ndOpen(n) && n.neededBy && n.neededBy < today();
const ndChip = n => (([l, c]) => `<span class="chip ${c}">${esc(tr(l))}</span>`)(ND_STATUS[n.status] || ND_STATUS.asked);
const ndPrio = n => n.prio && n.prio !== "normal" ? (([l, c]) => `<span class="chip sm ${c}">${esc(tr(l))}</span> `)(ND_PRIO[n.prio] || ND_PRIO.normal) : "";
const ndRank = { aog: 0, urgent: 1, normal: 2, low: 3 };
const ndSort = (a, b) => (ndRank[a.prio] ?? 2) - (ndRank[b.prio] ?? 2) || String(a.neededBy || "9").localeCompare(String(b.neededBy || "9")) || String(a.at || "").localeCompare(String(b.at || ""));
/* approuver, refuser, commander : Station Lead, bureau et administrateurs (vérifié aussi sur le serveur) */
const canDecideNeeds = () => !ME || isOffice() || meStaff()?.function === "lead";
const ndHist = (n, status, note) => [...(n.history || []), { at: new Date().toISOString(), by: (ME && ME.name) || "", status, note: note || "" }].slice(-200);

VIEWS.besoins = {
  render() {
    const tab = curTab("besoins", "cours"), open = S.needs.filter(ndOpen), urgent = open.filter(n => ["urgent", "aog"].includes(n.prio));
    return head("Station Needs", "Les besoins de la station : outillage, consommables, équipement, informatique, divers. Chacun peut demander, le Station Lead approuve.",
      readOnly ? "" : `<button class="btn primary" data-a="nd-form">Nouveau besoin</button>`) +
      `<div class="pipeline"><div class="panel tile c-yellow"><div class="lbl">${esc(tr("À approuver"))}</div><div class="val">${open.filter(n => (n.status || "asked") === "asked").length}</div></div>
        <div class="panel tile c-blue"><div class="lbl">${esc(tr("Approuvés, à commander"))}</div><div class="val">${open.filter(n => n.status === "approved").length}</div></div>
        <div class="panel tile c-orange"><div class="lbl">${esc(tr("Commandés"))}</div><div class="val">${open.filter(n => n.status === "ordered").length}</div><div class="note">${open.filter(ndLate).length} ${esc(tr("en retard"))}</div></div>
        <div class="panel tile c-red ${urgent.length ? "alert" : ""}"><div class="lbl">${esc(tr("Urgents / AOG"))}</div><div class="val">${urgent.length}</div></div></div>` +
      tabs("besoins", [["cours", "En cours", open.length, urgent.length > 0], ["fini", "Reçus et refusés"]]) + ndList(tab === "cours");
  }
};
function ndList(open) {
  const q = UI.q.toLowerCase(), f = UI.filter;
  const rows = S.needs.filter(n => ndOpen(n) === open && (f === "tous" || (f === "urgent" ? ["urgent", "aog"].includes(n.prio) : n.cat === f))
    && (!q || [n.title, n.reason, n.supplier, n.ref, sName(n.by), ND_CAT[n.cat]].join(" ").toLowerCase().includes(q)))
    .sort(open ? ndSort : (a, b) => String(b.doneAt || b.at || "").localeCompare(String(a.doneAt || a.at || "")));
  const cats = Object.entries(ND_CAT).filter(([k]) => S.needs.some(n => n.cat === k));
  return `<div class="panel">${searchBar("Besoin, raison, fournisseur, demandeur…", [["tous", "Tous"], ["urgent", "Urgents", S.needs.some(n => ndOpen(n) && ["urgent", "aog"].includes(n.prio))], ...cats])}
    <div class="tablewrap"><table><thead><tr><th>Besoin</th><th>Catégorie</th><th class="r">Qté</th><th>Demandé par</th><th>Pour le</th><th>Statut</th></tr></thead><tbody>${rows.map(n => `<tr class="click" data-a="nd-open" data-id="${n.id}">
      <td>${ndPrio(n)}<b>${esc(n.title || "")}</b>${n.toolId && S.tools.find(t => t.id === n.toolId) ? ` <span class="chip sm mono">${esc(tLabel(S.tools.find(t => t.id === n.toolId)))}</span>` : ""}${n.reason ? `<div class="small muted">${esc(n.reason.slice(0, 120))}</div>` : ""}</td>
      <td class="small">${esc(tr(ND_CAT[n.cat] || "—"))}</td><td class="r num">${esc(n.qty ?? "")} ${esc(n.unit || "")}</td>
      <td class="small">${esc(n.by ? sName(n.by) : n.byName || "—")}<div class="muted">${n.at ? fmtDate(n.at.slice(0, 10)) : ""}</div></td>
      <td class="small ${ndLate(n) ? "txt-warn" : ""}">${n.neededBy ? fmtDate(n.neededBy) : "—"}</td><td>${ndChip(n)}</td></tr>`).join("")}</tbody></table>
      ${rows.length ? "" : `<div class="empty">${open ? "Aucun besoin en cours." : "Rien ici pour l'instant."}</div>`}</div></div>`;
}
ACTIONS["nd-open"] = el => openNeed(el.dataset.id);
async function openNeed(id) {
  const n = await waitFind("needs", id); if (!n) return;
  const st = n.status || "asked", tool = n.toolId ? S.tools.find(t => t.id === n.toolId) : null;
  const act = readOnly ? "" : (ND_NEXT[st] || []).filter(([s]) => canDecideNeeds() || s === "received").map(([s, l, c]) => `<button class="btn ${c}" data-a="nd-status" data-s="${s}">${esc(tr(l))}</button>`).join("")
    + (!ndOpen(n) && canDecideNeeds() ? `<button class="btn" data-a="nd-status" data-s="asked">${esc(tr("Rouvrir"))}</button>` : "");
  const mo = modal(`${mHead(`${ndPrio(n)}${esc(n.title || "")} ${ndChip(n)}`)}<div class="body">
    <dl class="kv"><dt>Catégorie</dt><dd>${esc(tr(ND_CAT[n.cat] || "—"))}</dd><dt>Quantité</dt><dd>${esc(n.qty ?? "")} ${esc(n.unit || "")}</dd>
    <dt>Priorité</dt><dd>${esc(tr((ND_PRIO[n.prio] || ND_PRIO.normal)[0]))}</dd><dt>Demandé par</dt><dd>${esc(n.by ? sName(n.by) : n.byName || "—")}${n.at ? " · " + fmtDT(n.at) : ""}</dd>
    ${n.neededBy ? `<dt>Pour le</dt><dd class="${ndLate(n) ? "txt-warn" : ""}">${fmtDate(n.neededBy)}</dd>` : ""}
    ${tool ? `<dt>Outil concerné</dt><dd><button class="linkbtn mono" data-a="tool-open" data-id="${tool.id}">${esc(tLabel(tool))}</button> ${esc(tool.name || "")}</dd>` : ""}
    ${n.supplier || n.ref ? `<dt>Fournisseur / réf.</dt><dd>${esc([n.supplier, n.ref].filter(Boolean).join(" · "))}</dd>` : ""}
    ${n.cost ? `<dt>Coût estimé</dt><dd class="num">${esc(n.cost)} ${esc(n.currency || "")}</dd>` : ""}</dl>
    ${n.reason ? `<h3>Pourquoi</h3><div class="quote">${esc(n.reason)}</div>` : ""}${n.notes ? `<div class="quote">${esc(n.notes)}</div>` : ""}
    <h3>Suivi</h3><div class="w-list">${(n.history || []).slice().reverse().map(x => `<div class="list-row"><span>${ndChip({ status: x.status })} <span class="small">${esc(x.by || "")}</span>${x.note ? ` <span class="small muted">${esc(x.note)}</span>` : ""}</span><span class="small muted">${fmtDT(x.at)}</span></div>`).join("") || `<span class="muted small">—</span>`}</div></div>
    <footer><div class="left">${readOnly || (!canDecideNeeds() && st !== "asked") ? "" : `<button class="btn" data-a="nd-form" data-id="${n.id}">Modifier</button>`}</div>${act}</footer>`, "lg");
  mo.dataset.nd = n.id;
}
const curNd = () => S.needs.find(x => x.id === document.querySelector(".modal")?.dataset.nd);
ACTIONS["nd-status"] = el => {
  const n = curNd(), s = el.dataset.s; if (!n) return;
  const mo = modal(`${mHead(esc(tr(ND_STATUS[s][0])) + " · " + esc(n.title || ""))}<form><div class="body">${field("ns-note", s === "refused" ? "Raison du refus" : s === "ordered" ? "Commande (fournisseur, n°, date prévue…)" : "Note (facultatif)", "", { type: "textarea", wide: true, required: s === "refused" })}</div>
    <footer><button type="button" class="btn" data-a="nd-open" data-id="${n.id}">Annuler</button><button class="btn primary">${esc(tr("Confirmer"))}</button></footer></form>`);
  mo.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const note = val("ns-note").trim();
    await patch("needs", n.id, Object.assign({ status: s, history: ndHist(n, s, note) }, ["received", "refused"].includes(s) ? { doneAt: new Date().toISOString() } : { doneAt: null }));
    toast("Besoin mis à jour"); openNeed(n.id);
  };
};
ACTIONS["nd-form"] = el => {
  const me = meStaff();
  const n = S.needs.find(x => x.id === el.dataset.id) || { cat: el.dataset.cat || "tooling", qty: 1, unit: "EA", prio: "normal", by: me ? me.id : "", toolId: el.dataset.tool || "", currency: "EUR" };
  const crew = staffActive().slice().sort(staffSort), tools = S.tools.slice().sort((a, b) => tLabel(a).localeCompare(tLabel(b)));
  const mo = modal(`${mHead(n.id ? "Modifier le besoin" : "Nouveau besoin")}<form><div class="body"><div class="fields">
    ${field("nf-title", "Besoin", n.title, { required: true, autofocus: true, ph: "Ex. clé dynamométrique 20-100 Nm, gants nitrile, imprimante…", wide: true })}
    ${field("nf-cat", "Catégorie", n.cat, { type: "select", options: Object.entries(ND_CAT) })}${field("nf-prio", "Priorité", n.prio, { type: "select", options: Object.entries(ND_PRIO).map(([k, v]) => [k, v[0]]) })}
    ${field("nf-qty", "Quantité", n.qty, { type: "number", step: "0.01", min: 0 })}${field("nf-unit", "Unité", n.unit, { ph: "EA" })}
    ${field("nf-by", "Demandé par", n.by, { type: "select", options: [["", "Choisir…"], ...crew.map(p => [p.id, p.name])] })}${field("nf-need", "Pour le (facultatif)", n.neededBy, { type: "date" })}
    ${field("nf-tool", "Outil concerné (remplacement, réparation…)", n.toolId || "", { type: "select", options: [["", "—"], ...tools.map(t => [t.id, tLabel(t) + " · " + (t.name || "")])] })}
    ${field("nf-sup", "Fournisseur proposé", n.supplier)}${field("nf-ref", "Référence / lien", n.ref)}${field("nf-cost", "Coût estimé", n.cost, { type: "number", step: "0.01", min: 0 })}${field("nf-cur", "Devise", n.currency, { ph: "EUR" })}
    ${field("nf-reason", "Pourquoi (à quoi ça sert, ce qui manque)", n.reason, { type: "textarea", wide: true })}${field("nf-notes", "Notes", n.notes, { type: "textarea", wide: true })}</div></div>
    <footer>${n.id && isOffice() && !readOnly ? `<div class="left"><button type="button" class="btn danger" data-a="nd-del" data-id="${n.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "lg");
  mo.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const data = Object.assign({ status: "asked", at: new Date().toISOString() }, strip(n), { title: val("nf-title").trim(), cat: val("nf-cat"), prio: val("nf-prio"), qty: +val("nf-qty") || 0, unit: val("nf-unit"),
      by: val("nf-by"), neededBy: val("nf-need"), toolId: val("nf-tool"), supplier: val("nf-sup").trim(), ref: val("nf-ref").trim(), cost: val("nf-cost") === "" ? "" : +val("nf-cost"), currency: val("nf-cur").trim().toUpperCase(), reason: val("nf-reason"), notes: val("nf-notes") });
    if (!n.id) data.history = ndHist({}, "asked", "");
    const id = await save("needs", n.id, data); toast("Besoin enregistré"); openNeed(id);
  };
};
ACTIONS["nd-del"] = el => confirmBox("Supprimer ce besoin ?", () => remove("needs", el.dataset.id));

WIDGETS.needs_open = { h: 6, t: "Station Needs", ic: "🧰", c: "yellow", m: "besoins", size: "m", d: "Besoins de la station à approuver, à commander, urgents.",
  r() { const open = S.needs.filter(ndOpen).sort(ndSort);
    return `<div class="w-stats">${wStat(open.filter(n => (n.status || "asked") === "asked").length, "à approuver", open.some(n => (n.status || "asked") === "asked") ? "warn" : "")}${wStat(open.filter(n => n.status === "ordered").length, "commandés")}${wStat(open.filter(n => ["urgent", "aog"].includes(n.prio)).length, "urgents", open.some(n => ["urgent", "aog"].includes(n.prio)) ? "bad" : "")}</div>
      <div class="w-list">${open.slice(0, 4).map(n => `<div class="list-row click" data-a="nd-open" data-id="${n.id}"><span>${ndPrio(n)}<b>${esc(n.title || "")}</b></span>${ndChip(n)}</div>`).join("") || `<div class="muted small">${esc(tr("Aucun besoin en cours."))}</div>`}</div>`; } };
