"use strict";
/* ======================= SITUATIONS OUVERTES =======================
   Les situations anormales de la station qui doivent revenir à la normale : un outil prêté à une compagnie,
   un outil emprunté, un équipement hors service, un problème de locaux… Qui, quand, retour attendu, historique.
   Une situation peut s'afficher dans la page Shift (encart en haut) ; on peut l'y masquer, elle reste dans le module.
   situations/<id> = { kind, title, toolId, party, contact, by (staffId), since, dueBack, status: open|closed, showInShift,
                       history[{at, by, text}], closedAt, closedBy, closeNote, notes }
   Un outil prêté sort de l'outillage (tools.out.sit = id de la situation) et y rentre à la clôture. */
const SIT_KIND = { toolLoan: "Outil prêté", toolBorrow: "Outil emprunté", equipment: "Équipement hors service", facility: "Locaux / installation", vehicle: "Véhicule", staff: "Personnel", other: "Autre" };
const sitOpen = s => (s.status || "open") === "open";
const sitLate = s => sitOpen(s) && s.dueBack && s.dueBack < today();
const sitTool = s => s.toolId ? S.tools.find(t => t.id === s.toolId) : null;
const sitDays = s => s.since ? Math.max(0, Math.round((new Date(today()) - new Date(s.since)) / 86400000)) : 0;
const sitHist = (s, text) => [...(s.history || []), { at: new Date().toISOString(), by: (ME && ME.name) || "", text }].slice(-300);
const sitChip = s => sitOpen(s) ? (sitLate(s) ? `<span class="chip bad">${esc(tr("Retour dépassé"))}</span>` : `<span class="chip warn">${esc(tr("Ouverte"))}</span>`) : `<span class="chip good">${esc(tr("Revenue à la normale"))}</span>`;
const sitParty = s => s.party ? (s.kind === "toolBorrow" ? tr("Emprunté à") : s.kind === "toolLoan" ? tr("Prêté à") : tr("Concerne")) + " " + s.party : "";
const sitSort = (a, b) => (sitLate(b) ? 1 : 0) - (sitLate(a) ? 1 : 0) || String(a.since || "").localeCompare(String(b.since || ""));
const sitName = s => s.title || (sitTool(s) ? tLabel(sitTool(s)) + " " + (sitTool(s).name || "") : tr(SIT_KIND[s.kind] || "Situation"));

VIEWS.situations = {
  render() {
    const tab = curTab("situations", "cours"), open = S.situations.filter(sitOpen), late = open.filter(sitLate);
    return head("Situations ouvertes", "Les situations anormales qui doivent revenir à la normale : outil prêté ou emprunté, équipement hors service, locaux… avec leur historique.",
      readOnly ? "" : `<button class="btn primary" data-a="sit-form">Nouvelle situation</button>`) +
      `<div class="pipeline"><div class="panel tile c-yellow"><div class="lbl">${esc(tr("Ouvertes"))}</div><div class="val">${open.length}</div></div>
        <div class="panel tile c-red ${late.length ? "alert" : ""}"><div class="lbl">${esc(tr("Retour dépassé"))}</div><div class="val">${late.length}</div></div>
        <div class="panel tile c-blue"><div class="lbl">${esc(tr("Affichées dans le shift"))}</div><div class="val">${open.filter(s => s.showInShift).length}</div></div></div>` +
      tabs("situations", [["cours", "Ouvertes", open.length, late.length > 0], ["fini", "Revenues à la normale"]]) + sitList(tab === "cours");
  }
};
function sitList(open) {
  const q = UI.q.toLowerCase(), f = UI.filter;
  const rows = S.situations.filter(s => sitOpen(s) === open && (f === "tous" || (f === "late" ? sitLate(s) : s.kind === f))
    && (!q || [sitName(s), s.party, s.contact, s.notes, sName(s.by), sitTool(s)?.toolNo, sitTool(s)?.serial].join(" ").toLowerCase().includes(q)))
    .sort(open ? sitSort : (a, b) => String(b.closedAt || "").localeCompare(String(a.closedAt || "")));
  const kinds = Object.entries(SIT_KIND).filter(([k]) => S.situations.some(s => s.kind === k));
  return `<div class="panel">${searchBar("Outil, compagnie, personne…", [["tous", "Toutes"], ["late", "Retour dépassé", S.situations.some(sitLate)], ...kinds])}
    <div class="tablewrap"><table><thead><tr><th>Situation</th><th>Type</th><th>À qui / de qui</th><th>Depuis</th><th>Retour attendu</th><th>Statut</th></tr></thead><tbody>${rows.map(s => `<tr class="click" data-a="sit-open" data-id="${s.id}">
      <td><b>${esc(sitName(s))}</b>${s.showInShift && sitOpen(s) ? ` <span class="chip sm info">${esc(tr("Dans le shift"))}</span>` : ""}${s.notes ? `<div class="small muted">${esc(s.notes.slice(0, 120))}</div>` : ""}</td>
      <td class="small">${esc(tr(SIT_KIND[s.kind] || "—"))}</td><td class="small">${esc(s.party || "—")}${s.by ? `<div class="muted">${esc(tr("par"))} ${esc(sName(s.by))}</div>` : ""}</td>
      <td class="small">${s.since ? fmtDate(s.since) : "—"}${sitOpen(s) && s.since ? `<div class="muted">${plural(sitDays(s), "jour")}</div>` : ""}</td>
      <td class="small ${sitLate(s) ? "txt-bad" : ""}">${s.dueBack ? fmtDate(s.dueBack) : "—"}</td><td>${sitChip(s)}</td></tr>`).join("")}</tbody></table>
      ${rows.length ? "" : `<div class="empty">${open ? "Aucune situation ouverte : tout est normal." : "Rien ici pour l'instant."}</div>`}</div></div>`;
}
ACTIONS["sit-open"] = el => openSit(el.dataset.id);
async function openSit(id) {
  const s = await waitFind("situations", id); if (!s) return;
  const tool = sitTool(s), op = sitOpen(s);
  const mo = modal(`${mHead(`${esc(sitName(s))} ${sitChip(s)}`)}<div class="body">
    ${sitLate(s) ? `<div class="banner warn">⚠ ${esc(tr("Le retour était attendu le"))} ${fmtDate(s.dueBack)}.</div>` : ""}
    <dl class="kv"><dt>Type</dt><dd>${esc(tr(SIT_KIND[s.kind] || "—"))}</dd>
    ${tool ? `<dt>Outil</dt><dd><button class="linkbtn mono" data-a="tool-open" data-id="${tool.id}">${esc(tLabel(tool))}</button> ${esc(tool.name || "")}</dd>` : ""}
    ${s.party ? `<dt>${esc(s.kind === "toolBorrow" ? tr("Emprunté à") : s.kind === "toolLoan" ? tr("Prêté à") : tr("Concerne"))}</dt><dd>${esc(s.party)}${s.contact ? ` · <span class="small">${esc(s.contact)}</span>` : ""}</dd>` : ""}
    <dt>${esc(s.kind === "toolLoan" ? tr("Prêté par") : tr("Signalé par"))}</dt><dd>${esc(s.by ? sName(s.by) : "—")}</dd>
    <dt>Depuis</dt><dd>${s.since ? fmtDate(s.since) : "—"}${op && s.since ? ` (${plural(sitDays(s), "jour")})` : ""}</dd>
    ${s.dueBack ? `<dt>Retour attendu</dt><dd class="${sitLate(s) ? "txt-bad" : ""}">${fmtDate(s.dueBack)}</dd>` : ""}
    ${op ? `<dt>Dans le shift</dt><dd>${s.showInShift ? esc(tr("Affichée en haut de la page Shift")) : esc(tr("Non affichée"))}</dd>` : `<dt>Clôturée</dt><dd>${fmtDT(s.closedAt)} · ${esc(s.closedBy || "")}${s.closeNote ? `<div class="small">${esc(s.closeNote)}</div>` : ""}</dd>`}</dl>
    ${s.notes ? `<div class="quote">${esc(s.notes)}</div>` : ""}
    <h3>Historique</h3><div class="w-list">${(s.history || []).slice().reverse().map(x => `<div class="list-row"><span class="small"><b>${esc(x.by || "")}</b> ${esc(x.text || "")}</span><span class="small muted">${fmtDT(x.at)}</span></div>`).join("") || `<span class="muted small">—</span>`}</div>
    ${op && !readOnly ? `<form id="sit-note-f" class="row-g" style="margin-top:8px"><input id="sit-note" placeholder="${esc(tr("Ajouter une note à l'historique (relance, contact…)"))}" style="flex:1"><button class="btn sm">${esc(tr("Ajouter"))}</button></form>` : ""}</div>
    <footer><div class="left">${readOnly ? "" : `<button class="btn" data-a="sit-form" data-id="${s.id}">Modifier</button>`}</div>
      ${readOnly ? "" : op ? `<button class="btn" data-a="sit-shift" data-id="${s.id}">${esc(tr(s.showInShift ? "Masquer du shift" : "Afficher dans le shift"))}</button><button class="btn primary" data-a="sit-close">${esc(tr("Revenue à la normale"))}</button>`
        : `<button class="btn" data-a="sit-reopen">${esc(tr("Rouvrir"))}</button>`}</footer>`, "lg");
  mo.dataset.sit = s.id;
  mo.querySelector("#sit-note-f")?.addEventListener("submit", async e => {
    e.preventDefault(); const t = val("sit-note").trim(); if (!t) return;
    await patch("situations", s.id, { history: sitHist(s, t) }); openSit(s.id);
  });
}
const curSit = () => S.situations.find(x => x.id === document.querySelector(".modal")?.dataset.sit);
/* afficher / masquer dans le shift : depuis la fiche ou depuis l'encart du shift */
ACTIONS["sit-shift"] = async el => {
  const s = S.situations.find(x => x.id === el.dataset.id); if (!s) return;
  const on = !s.showInShift;
  await patch("situations", s.id, { showInShift: on, history: sitHist(s, on ? tr("Affichée dans le shift") : tr("Masquée du shift")) });
  toast(on ? "Affichée dans le shift" : "Masquée du shift : elle reste dans Situations ouvertes");
  if (document.querySelector(".modal")?.dataset.sit === s.id) openSit(s.id);
};
ACTIONS["sit-close"] = () => {
  const s = curSit(); if (!s) return; const tool = sitTool(s);
  const mo = modal(`${mHead(esc(tr("Revenue à la normale")) + " · " + esc(sitName(s)))}<form><div class="body">
    ${field("sc-note", s.kind === "toolLoan" ? "Retour (état de l'outil, rendu par…)" : "Comment la situation a été résolue", "", { type: "textarea", wide: true })}
    ${tool && tool.out && tool.out.sit === s.id ? `<div class="hint">${esc(tr("L'outil sera rentré dans l'outillage."))} ${tOverdue(tool) ? esc(tr("Attention : son étalonnage est dépassé.")) : ""}</div>` : ""}</div>
    <footer><button type="button" class="btn" data-a="sit-open" data-id="${s.id}">Annuler</button><button class="btn primary">${esc(tr("Clôturer"))}</button></footer></form>`);
  mo.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const note = val("sc-note").trim();
    await patch("situations", s.id, { status: "closed", closedAt: new Date().toISOString(), closedBy: (ME && ME.name) || "", closeNote: note, history: sitHist(s, tr("Revenue à la normale") + (note ? " : " + note : "")) });
    if (tool && tool.out && tool.out.sit === s.id) { try { await patch("tools", tool.id, { out: null, history: tHist(tool, "in", sitParty(s)) }); } catch (x) { toast(x.message || "Outil non rentré"); } }
    toast("Situation clôturée"); openSit(s.id);
  };
};
ACTIONS["sit-reopen"] = async () => { const s = curSit(); if (!s) return; await patch("situations", s.id, { status: "open", closedAt: null, closedBy: null, history: sitHist(s, tr("Rouverte")) }); openSit(s.id); };
ACTIONS["sit-form"] = el => {
  const me = meStaff();
  const s = S.situations.find(x => x.id === el.dataset.id) || { kind: el.dataset.kind || "toolLoan", by: me ? me.id : "", since: today(), showInShift: true, toolId: el.dataset.tool || "" };
  const crew = staffActive().slice().sort(staffSort), tools = S.tools.slice().sort((a, b) => tLabel(a).localeCompare(tLabel(b)));
  const parties = Array.from(new Set([...S.clients.map(c => c.name), ...S.situations.map(x => x.party)].filter(Boolean))).sort();
  const mo = modal(`${mHead(s.id ? "Modifier la situation" : "Nouvelle situation")}<form><div class="body"><div class="fields">
    ${field("sf-kind", "Type", s.kind, { type: "select", options: Object.entries(SIT_KIND) })}
    ${field("sf-tool", "Outil (si un outil est concerné)", s.toolId || "", { type: "select", options: [["", "—"], ...tools.map(t => [t.id, tLabel(t) + " · " + (t.name || "") + (t.out && t.out.sit !== s.id ? " (" + tr("sorti") + ")" : "")])] })}
    ${field("sf-title", "Titre (facultatif si un outil est choisi)", s.title, { wide: true, ph: "Ex. GPU en panne, porte du hangar bloquée…" })}
    <label class="f">${esc(tr("À qui / de qui (compagnie, station, personne)"))}<input id="sf-party" list="sf-pl" value="${esc(s.party || "")}"></label><datalist id="sf-pl">${parties.map(p => `<option value="${esc(p)}">`).join("")}</datalist>
    ${field("sf-contact", "Contact (nom, téléphone, e-mail)", s.contact)}
    ${field("sf-by", "Prêté / signalé par", s.by, { type: "select", options: [["", "Choisir…"], ...crew.map(p => [p.id, p.name])] })}
    ${field("sf-since", "Depuis le", s.since, { type: "date" })}${field("sf-due", "Retour attendu le", s.dueBack, { type: "date" })}
    ${field("sf-notes", "Détails", s.notes, { type: "textarea", wide: true })}</div>
    <label class="chk"><input type="checkbox" id="sf-shift" ${s.showInShift ? "checked" : ""}> ${esc(tr("Afficher dans la page Shift tant qu'elle est ouverte"))}</label>
    <div class="err" id="sf-err"></div></div>
    <footer>${s.id && isOffice() && !readOnly ? `<div class="left"><button type="button" class="btn danger" data-a="sit-del" data-id="${s.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "lg");
  mo.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const data = Object.assign({ status: "open" }, strip(s), { kind: val("sf-kind"), toolId: val("sf-tool"), title: val("sf-title").trim(), party: val("sf-party").trim(), contact: val("sf-contact").trim(),
      by: val("sf-by"), since: val("sf-since") || today(), dueBack: val("sf-due"), notes: val("sf-notes"), showInShift: mo.querySelector("#sf-shift").checked });
    if (!data.title && !data.toolId) { mo.querySelector("#sf-err").textContent = tr("Donnez un titre ou choisissez un outil."); return; }
    if (data.kind === "toolLoan" && !data.party) { mo.querySelector("#sf-err").textContent = tr("Indiquez à qui l'outil est prêté."); return; }
    data.history = s.id ? sitHist(s, tr("Modifiée")) : sitHist({}, tr("Ouverte") + (data.party ? " · " + sitParty(data) : ""));
    const id = await save("situations", s.id, data);
    const tool = data.toolId ? S.tools.find(t => t.id === data.toolId) : null;
    if (data.kind === "toolLoan" && tool && !tool.out && data.status === "open") {   // l'outil prêté sort de l'outillage
      try { await patch("tools", tool.id, { out: { staffId: "", lender: data.by || "", name: sitParty(data), reg: "", at: new Date().toISOString(), by: (ME && ME.name) || "", sit: id }, history: tHist(tool, "out", sitParty(data)) }); }
      catch (x) { toast(x.message || "L'outil n'a pas pu être marqué sorti"); }
    }
    toast("Situation enregistrée"); openSit(id);
  };
};
ACTIONS["sit-del"] = el => confirmBox("Supprimer cette situation ? Son historique sera perdu. Pour une situation résolue, utilisez plutôt « Revenue à la normale ».", () => remove("situations", el.dataset.id));

/* encart en haut de la page Shift : situations ouvertes affichées dans le shift */
function shiftSituations() {
  const list = S.situations.filter(s => sitOpen(s) && s.showInShift).sort(sitSort);
  if (!list.length) return "";
  return `<div class="panel sit-box" role="region" aria-label="${esc(tr("Situations ouvertes"))}"><div class="sit-h"><b>⚠ ${esc(tr("Situations ouvertes"))} (${list.length})</b><a class="linkbtn small" href="#situations">${esc(tr("Toutes les situations"))}</a></div>
    ${list.map(s => `<div class="sit-row ${sitLate(s) ? "late" : ""}"><button class="linkbtn" data-a="sit-open" data-id="${s.id}"><b>${esc(sitName(s))}</b></button>
      <span class="small">${esc(tr(SIT_KIND[s.kind] || ""))}${s.party ? " · " + esc(sitParty(s)) : ""}${s.since ? " · " + esc(tr("depuis le")) + " " + fmtDate(s.since) : ""}${s.dueBack ? ` · <span class="${sitLate(s) ? "txt-bad" : ""}">${esc(tr("retour attendu"))} ${fmtDate(s.dueBack)}</span>` : ""}</span>
      ${readOnly ? "" : `<button class="btn sm" data-a="sit-shift" data-id="${s.id}" title="${esc(tr("Elle reste dans Situations ouvertes"))}">${esc(tr("Masquer du shift"))}</button>`}</div>`).join("")}</div>`;
}

WIDGETS.situations_open = { h: 6, t: "Situations ouvertes", ic: "⚠", c: "red", m: "situations", size: "m", d: "Situations anormales à ramener à la normale : outils prêtés, équipements hors service…",
  r() { const open = S.situations.filter(sitOpen).sort(sitSort);
    return `<div class="w-stats">${wStat(open.length, "ouvertes", open.length ? "warn" : "")}${wStat(open.filter(sitLate).length, "retour dépassé", open.some(sitLate) ? "bad" : "")}</div>
      <div class="w-list">${open.slice(0, 4).map(s => `<div class="list-row click" data-a="sit-open" data-id="${s.id}"><span><b>${esc(sitName(s))}</b> <span class="muted small">${esc(s.party || "")}</span></span>${sitChip(s)}</div>`).join("") || `<div class="muted small">${esc(tr("Aucune situation ouverte : tout est normal."))}</div>`}</div>`; } };
