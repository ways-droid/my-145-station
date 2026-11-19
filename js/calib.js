"use strict";
/* ======================= OUTILLAGE DE LA STATION =======================
   Registre des outils de la station (n° d'outil = étiquette scannée), sortie et retour par personne et par avion,
   étalonnage : échéances, envoi au laboratoire (souvent WAYS), retour avec certificat.
   tools/<id> = { toolNo, name, pn, serial, brand, model, category, location, owner, calRequired, intervalMonths, lastCalDate, nextDue,
                  status: service|lab|us|lost|retired, out: {staffId, reg, at, by} | absent, job: {labId, sentDate, ref, expected},
                  certs[], history[{at, type, text, by}], shipments[], photos[], notes }
   Un outil hors service, au labo ou dont l'étalonnage est dépassé ne peut pas sortir (contrôlé aussi sur le serveur). */
const T_STATUS = { service: ["En service", "good"], lab: ["Au labo", "orange"], us: ["Hors service", "bad"], lost: ["Perdu", "bad"], retired: ["Retiré", ""] };
const T_RESULT = { conforme: ["Conforme", "good"], ajuste: ["Conforme après ajustage", "good"], non_conforme: ["Non conforme", "bad"] };
const T_HIST = { out: "Sorti", in: "Rentré", send: "Envoyé au labo", cal: "Étalonné", us: "Hors service", service: "Remis en service", lost: "Perdu", retired: "Retiré", note: "Note" };
const tStatus = t => T_STATUS[t.status] ? t.status : "service";
const tOverdue = t => tStatus(t) === "service" && t.calRequired !== false && !!t.nextDue && t.nextDue < today();
const tUsable = t => tStatus(t) === "service" && !tOverdue(t);
const tChip = t => tOverdue(t) ? `<span class="chip bad">Étalonnage dépassé</span>` : (([l, c]) => `<span class="chip ${c}">${l}</span>`)(T_STATUS[tStatus(t)]);
const tLabel = t => t.toolNo || t.serial || "?";
const toolByCode = c => { const n = normSerial(c); return S.tools.find(t => normSerial(t.toolNo) === n) || S.tools.find(t => normSerial(t.serial) === n); };
const activeCert = t => (t.certs || []).filter(c => c.validUntil >= today()).sort((a, b) => b.date.localeCompare(a.date))[0];
const toolsOut = () => S.tools.filter(t => t.out && t.out.at);
/* outils à étalonner bientôt (hors labo, hors retirés) */
const toolsDue = (days = 60) => S.tools.filter(t => ["service", "us"].includes(tStatus(t)) && t.calRequired !== false && t.nextDue && t.nextDue <= addDays(today(), days));
const outHours = t => t.out?.at ? (Date.now() - new Date(t.out.at).getTime()) / 3600000 : 0;
const tHist = (t, type, text) => [...(t.history || []), { at: new Date().toISOString(), type, text: text || "", by: (ME && ME.name) || "" }].slice(-300);
const labName = id => (S.labs || []).find(l => l.id === id)?.name || "";
const outWho = t => t.out ? (staff(t.out.staffId)?.name || t.out.name || "?") : "";
/* fiche personnel de l'utilisateur connecté (même adresse e-mail) */
const meStaff = () => ME && ME.email ? S.staff.find(p => (p.email || "").toLowerCase() === String(ME.email).toLowerCase()) : null;

VIEWS.etalonnage = {
  render() {
    const tab = curTab("etalonnage", "outils"), out = toolsOut(), due = toolsDue(60), over = S.tools.filter(tOverdue), lab = S.tools.filter(t => tStatus(t) === "lab");
    return head("Outillage", plural(S.tools.length, "outil") + " de la station",
      `<button class="btn" data-a="tool-form" ${dis()}>Ajouter un outil</button><button class="btn primary" data-a="tool-scan" ${dis()}>Sortie / retour d'outils</button>`) +
      `<div class="pipeline"><div class="panel tile c-blue"><div class="lbl">Sortis</div><div class="val">${out.length}</div><div class="note">${out.filter(t => outHours(t) > 12).length} depuis plus de 12 h</div></div>
        <div class="panel tile c-orange"><div class="lbl">Au labo</div><div class="val">${lab.length}</div></div>
        <div class="panel tile c-red ${over.length ? "alert" : ""}"><div class="lbl">Étalonnage dépassé</div><div class="val">${over.length}</div><div class="note">${toolsDue(30).length - over.length} dans les 30 jours</div></div>
        <div class="panel tile c-grey"><div class="lbl">Hors service</div><div class="val">${S.tools.filter(t => tStatus(t) === "us").length}</div></div></div>` +
      tabs("etalonnage", [["outils", "Registre", S.tools.length], ["sortis", "Sortis", out.length, out.some(t => outHours(t) > 12)], ["etal", "Étalonnage", due.length + lab.length, over.length > 0], ["labos", "Laboratoires", (S.labs || []).length || ""]]) +
      ({ outils: toolsRegister, sortis: toolsOutList, etal: toolsCal, labos: calibLabs })[tab]();
  }
};
const toolHead = `<thead><tr><th>N° outil</th><th>Outil</th><th>Emplacement</th><th>Statut</th><th>Prochain étalonnage</th></tr></thead>`;
function toolRow(t) {
  return `<tr class="click" data-a="tool-open" data-id="${t.id}"><td class="mono"><b>${esc(tLabel(t))}</b>${demoTag(t)}</td><td>${esc(t.name)}<div class="muted small mono">${esc([t.pn && "P/N " + t.pn, t.serial && "S/N " + t.serial].filter(Boolean).join(" · "))}</div></td>
    <td class="small">${esc(t.location || "—")}</td><td>${tChip(t)}${t.out ? `<div class="small">${esc(tr("Sorti"))} · ${esc(outWho(t))}${t.out.reg ? " · " + esc(t.out.reg) : ""}</div>` : ""}${tStatus(t) === "lab" && t.job?.labId ? `<div class="muted small">${esc(labName(t.job.labId))}</div>` : ""}</td>
    <td>${t.calRequired === false ? `<span class="muted small">Sans étalonnage</span>` : dueChip(t.nextDue)}</td></tr>`;
}
function toolsRegister() {
  const q = UI.q.toLowerCase(), f = UI.filter;
  const rows = S.tools.filter(t => (f === "tous" ? tStatus(t) !== "retired" : f === "ok" ? tUsable(t) : f === "out" ? !!t.out : f === "lab" ? tStatus(t) === "lab" : f === "ko" ? !tUsable(t) && tStatus(t) !== "lab" : f === "retired" ? tStatus(t) === "retired" : true)
    && (!q || [t.toolNo, t.serial, t.pn, t.name, t.brand, t.model, t.category, t.location].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => String(tLabel(a)).localeCompare(String(tLabel(b)), undefined, { numeric: true }));
  return `<div class="panel">${searchBar("N° d'outil, désignation, P/N, S/N, emplacement…", [["tous", "Tous"], ["ok", "Utilisables"], ["out", "Sortis"], ["lab", "Au labo"], ["ko", "Inutilisables", S.tools.some(t => !tUsable(t) && ["service", "us"].includes(tStatus(t)))], ["retired", "Retirés"]])}
    <div class="tablewrap"><table>${toolHead}<tbody>${rows.map(toolRow).join("")}</tbody></table>${rows.length ? "" : `<div class="empty">${S.tools.length ? "Aucun outil ne correspond." : "Aucun outil. Ajoutez les outils de la station avec leur n° d'étiquette."}</div>`}</div></div>`;
}
function toolsOutList() {
  const rows = toolsOut().sort((a, b) => a.out.at.localeCompare(b.out.at));
  return `<div class="panel"><div class="pad muted small">Outils sortis de l'outillage et pas encore rentrés. À vérifier au Tool Check de fin de shift (MOE 2.6.5).</div>
    ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>N° outil</th><th>Outil</th><th>Sorti par</th><th>Avion</th><th>Depuis</th><th></th></tr></thead><tbody>${rows.map(t => `<tr class="click" data-a="tool-open" data-id="${t.id}">
      <td class="mono"><b>${esc(tLabel(t))}</b></td><td>${esc(t.name)}</td><td>${esc(outWho(t))}</td><td class="mono">${esc(t.out.reg || "—")}</td>
      <td class="num ${outHours(t) > 12 ? "txt-warn" : ""}">${fmtDT(t.out.at)}</td><td class="r">${readOnly ? "" : `<button class="btn sm" data-a="tool-in" data-id="${t.id}">Rentrer</button>`}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">Tous les outils sont rentrés.</div>`}</div>`;
}
function toolsCal() {
  const sel = UI.calSel || (UI.calSel = new Set());
  const due = toolsDue(60).sort((a, b) => a.nextDue.localeCompare(b.nextDue)), lab = S.tools.filter(t => tStatus(t) === "lab").sort((a, b) => (a.job?.sentDate || "").localeCompare(b.job?.sentDate || ""));
  const ck = t => readOnly ? "" : `<td style="width:36px" data-stop><input type="checkbox" data-calsel="${t.id}" ${sel.has(t.id) ? "checked" : ""} ${t.out ? "disabled title=\"" + esc(tr("Outil sorti : à rentrer d'abord")) + "\"" : ""} aria-label="Choisir"></td>`;
  return `<div class="stack"><div class="panel"><div class="row-sb pad"><div><h3 class="np">À étalonner (60 prochains jours) <span class="muted">${due.length}</span></h3><div class="muted small">Cochez les outils à envoyer ensemble au laboratoire.</div></div>
      ${readOnly ? "" : `<button class="btn primary sm" data-a="tool-send" ${sel.size ? "" : "disabled"}>Envoyer au labo (${sel.size})</button>`}</div>
    ${due.length ? `<div class="tablewrap"><table><thead><tr>${readOnly ? "" : "<th></th>"}<th>N° outil</th><th>Outil</th><th>Statut</th><th>Échéance</th><th>Labo habituel</th></tr></thead><tbody>${due.map(t => `<tr class="click" data-a="tool-open" data-id="${t.id}">${ck(t)}
      <td class="mono"><b>${esc(tLabel(t))}</b></td><td>${esc(t.name)}</td><td>${tChip(t)}${t.out ? `<div class="small txt-warn">${esc(tr("Sorti"))} · ${esc(outWho(t))}</div>` : ""}</td><td>${dueChip(t.nextDue)}</td><td class="small">${esc(labName(t.defaultLabId) || "—")}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">Aucun outil n'arrive à échéance dans les 60 prochains jours.</div>`}</div>
    <div class="panel"><div class="pad"><h3 class="np">Au laboratoire <span class="muted">${lab.length}</span></h3></div>
    ${lab.length ? `<div class="tablewrap"><table><thead><tr><th>N° outil</th><th>Outil</th><th>Laboratoire</th><th>Référence</th><th>Envoyé le</th><th>Retour prévu</th><th></th></tr></thead><tbody>${lab.map(t => { const d = t.job?.sentDate ? daysBetween(t.job.sentDate, today()) : null;
      return `<tr class="click" data-a="tool-open" data-id="${t.id}"><td class="mono"><b>${esc(tLabel(t))}</b></td><td>${esc(t.name)}</td><td>${esc(labName(t.job?.labId) || "—")}</td><td class="mono small">${esc(t.job?.ref || "—")}</td>
        <td class="num">${fmtDate(t.job?.sentDate)}${d != null ? ` <span class="muted small">· ${d} j</span>` : ""}</td><td class="num ${t.job?.expected && t.job.expected < today() ? "txt-warn" : ""}">${fmtDate(t.job?.expected)}</td>
        <td class="r">${readOnly ? "" : `<button class="btn sm" data-a="tool-back" data-id="${t.id}">Retour du labo</button>`}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="empty">Aucun outil au laboratoire.</div>`}</div></div>`;
}
document.addEventListener("change", e => { const id = e.target.dataset && e.target.dataset.calsel; if (!id) return; const s = UI.calSel || (UI.calSel = new Set()); e.target.checked ? s.add(id) : s.delete(id); render(true); });

/* ---------- sortie / retour par scan ---------- */
ACTIONS["tool-scan"] = () => {
  const me = meStaff(), crew = staffActive().slice().sort(staffSort);
  const m = modal(`${mHead("Sortie / retour d'outils")}<div class="body"><div class="fields">
    ${field("ts-who", "Sortis par", me ? me.id : "", { type: "select", options: [["", "Choisir…"], ...crew.map(p => [p.id, p.name])] })}${field("ts-reg", "Avion (facultatif)", "", { cls: "mono", ph: "9H-ABC" })}</div>
    ${scanBox("ts-scan", "Scanner ou saisir le n° de l'outil : il sort s'il est rentré, il rentre s'il est sorti")}<div id="ts-log" class="scanlist"></div></div>
    <footer><button type="button" class="btn primary" data-close>Terminer</button></footer>`, "lg");
  const log = (lvl, msg) => m.querySelector("#ts-log").insertAdjacentHTML("afterbegin", `<div class="scanitem ${lvl}">${msg}</div>`);
  wireScan("ts-scan", async code => {
    const t = toolByCode(code);
    if (!t) { log("warn", `<span class="mono"><b>${esc(code)}</b></span> ${esc(tr("Outil inconnu : ajoutez-le au registre"))}`); return; }
    const name = `<span class="mono"><b>${esc(tLabel(t))}</b></span> ${esc(t.name)}`;
    try {
      if (t.out) { await patch("tools", t.id, { out: null, history: tHist(t, "in", outWho(t)) }); log("ok", `${name} · ${esc(tr("Rentré"))}`); return; }
      if (!tUsable(t)) { log("warn", `${name} · ${esc(tr(tOverdue(t) ? "Étalonnage dépassé : ne pas utiliser" : T_STATUS[tStatus(t)][0] + " : ne peut pas sortir"))}`); return; }
      const who = val("ts-who"); if (!who) { log("warn", `${name} · ${esc(tr("Choisissez qui sort l'outil"))}`); return; }
      const reg = val("ts-reg").toUpperCase();
      await patch("tools", t.id, { out: { staffId: who, reg, at: new Date().toISOString(), by: (ME && ME.name) || "" }, history: tHist(t, "out", staff(who)?.name + (reg ? " · " + reg : "")) });
      log("ok", `${name} · ${esc(tr("Sorti"))} · ${esc(staff(who)?.name || "")}${reg ? " · " + esc(reg) : ""}`);
    } catch (e) { log("warn", `${name} · ${esc(tr(e.message || "Erreur"))}`); }
  });
};
ACTIONS["tool-out"] = el => {
  const t = S.tools.find(x => x.id === el.dataset.id); if (!t) return;
  if (!tUsable(t)) { toast(tOverdue(t) ? "Étalonnage dépassé : ne pas utiliser" : "Cet outil ne peut pas sortir"); return; }
  const me = meStaff(), crew = staffActive().slice().sort(staffSort);
  const m = modal(`${mHead("Sortir · " + esc(tLabel(t)))}<form><div class="body"><div class="fields">
    ${field("to-who", "Sorti par", me ? me.id : "", { type: "select", required: true, options: [["", "Choisir…"], ...crew.map(p => [p.id, p.name])] })}${field("to-reg", "Avion (facultatif)", "", { cls: "mono", ph: "9H-ABC" })}</div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Sortir l'outil</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); const who = val("to-who"), reg = val("to-reg").toUpperCase();
    await patch("tools", t.id, { out: { staffId: who, reg, at: new Date().toISOString(), by: (ME && ME.name) || "" }, history: tHist(t, "out", staff(who)?.name + (reg ? " · " + reg : "")) }); closeModal(); toast("Outil sorti"); };
};
ACTIONS["tool-in"] = async el => { const t = S.tools.find(x => x.id === el.dataset.id); if (!t || !t.out) return; await patch("tools", t.id, { out: null, history: tHist(t, "in", outWho(t)) }); toast("Outil rentré"); if (document.querySelector(".modal")?.dataset.tool === t.id) openTool(t.id); };

/* ---------- envoi au labo (plusieurs outils) et retour ---------- */
ACTIONS["tool-send"] = el => {
  const ids = el.dataset.id ? [el.dataset.id] : [...(UI.calSel || [])];
  const ts = ids.map(id => S.tools.find(t => t.id === id)).filter(t => t && !t.out && tStatus(t) !== "lab"); if (!ts.length) return;
  const labs = (S.labs || []).slice().sort((a, b) => a.name.localeCompare(b.name)), def = ts[0].defaultLabId || (labs.find(l => /ways/i.test(l.name)) || (labs.length === 1 ? labs[0] : {})).id || "";
  const m = modal(`${mHead("Envoyer au laboratoire")}<form><div class="body">
    ${labs.length ? "" : `<div class="banner warn">Aucun laboratoire enregistré : ajoutez-en un dans l'onglet Laboratoires.</div>`}
    <div class="muted small">${ts.map(t => `<span class="chip sm mono">${esc(tLabel(t))}</span>`).join(" ")}</div>
    <div class="fields">${field("ls-lab", "Laboratoire", def, { type: "select", options: [["", "Choisir…"], ...labs.map(l => [l.id, l.name])] })}${field("ls-date", "Date d'envoi", today(), { type: "date" })}
    ${field("ls-ref", "Référence (bon d'envoi, commande…)", "", { cls: "mono" })}${field("ls-exp", "Retour prévu", addDays(today(), +((S.labs || []).find(l => l.id === def)?.leadDays) || 14), { type: "date" })}
    ${field("ls-carrier", "Transporteur", "", { type: "select", options: [["", "Pas d'envoi (déposé / enlevé)"], ...Object.entries(CARRIERS).map(([k, v]) => [k, v[0]])] })}${field("ls-no", "N° de suivi", "", { cls: "mono" })}</div><div class="err" id="ls-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Envoyer ${plural(ts.length, "outil")}</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const lab = val("ls-lab"); if (!lab) { m.querySelector("#ls-err").textContent = tr("Choisissez le laboratoire."); return; }
    m.querySelector("button.primary").disabled = true;
    const date = val("ls-date") || today(), no = val("ls-no").trim();
    for (const t of ts) {
      const shipments = [...(t.shipments || [])]; if (no) shipments.push({ id: "s" + Date.now().toString(36) + t.id.slice(-3), carrier: val("ls-carrier") || "autre", number: no, dir: "vers_labo", date, labId: lab });
      await patch("tools", t.id, { status: "lab", job: { labId: lab, sentDate: date, ref: val("ls-ref").trim(), expected: val("ls-exp") }, defaultLabId: lab, shipments, history: tHist(t, "send", labName(lab) + (val("ls-ref") ? " · " + val("ls-ref").trim() : "")) });
    }
    UI.calSel = new Set(); closeModal(); toast(`${plural(ts.length, "outil")} envoyé${ts.length > 1 ? "s" : ""} chez ${labName(lab)}`); render(true);
  };
};
/* retour du labo, ou étalonnage enregistré pour un outil en service : certificat, résultat, prochaine échéance */
ACTIONS["tool-back"] = el => {
  const t = S.tools.find(x => x.id === (el.dataset.id || document.querySelector(".modal")?.dataset.tool)); if (!t) return;
  const m = modal(`${mHead((tStatus(t) === "lab" ? "Retour du labo · " : "Enregistrer un étalonnage · ") + esc(tLabel(t)))}<form><div class="body"><div class="fields">
    ${field("c-date", "Date d'étalonnage", today(), { type: "date", required: true })}${field("c-res", "Résultat", "conforme", { type: "select", options: Object.entries(T_RESULT).map(([k, v]) => [k, v[0]]) })}
    ${field("c-no", "N° de certificat", "", { cls: "mono", required: true })}${field("c-lab", "Réalisé par", labName(t.job?.labId) || labName(t.defaultLabId), { ph: "Laboratoire" })}
    ${field("c-int", "Périodicité (mois)", t.intervalMonths || 12, { type: "number", min: 1 })}${field("c-next", "Prochain étalonnage", addMonths(today(), +t.intervalMonths || 12), { type: "date" })}</div>
    ${assets ? `<label class="f">Certificat (PDF ou photo)<input type="file" id="c-file" accept="application/pdf,image/*"></label>` : `<div class="hint">Le certificat pourra être joint plus tard.</div>`}
    ${field("c-note", "Remarques (valeurs relevées, ajustages…)", "", { type: "textarea", wide: true })}<div class="banner warn small" id="c-nc" hidden>Non conforme : l'outil passe hors service.</div><div class="err" id="c-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`, "lg");
  const sync = () => { m.querySelector("#c-next").value = addMonths(val("c-date") || today(), +val("c-int") || 12); m.querySelector("#c-nc").hidden = val("c-res") !== "non_conforme"; };
  m.querySelector("#c-date").onchange = sync; m.querySelector("#c-int").oninput = sync; m.querySelector("#c-res").onchange = sync;
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const btn = m.querySelector("button.primary"); btn.disabled = true;
    let file = ""; const f = m.querySelector("#c-file")?.files[0];
    if (f) { try { file = (await assets.upload(f, f.type ? undefined : { type: "application/pdf" })).id; } catch { m.querySelector("#c-err").textContent = tr("Le fichier n'a pas pu être envoyé. Réessayez ou enregistrez sans fichier."); btn.disabled = false; return; } }
    const date = val("c-date"), res = val("c-res"), no = val("c-no"), next = val("c-next"), nc = res === "non_conforme";
    const shipments = (t.shipments || []).map(x => x.dir === "vers_labo" && !x.delivered ? Object.assign({}, x, { delivered: x.date || date }) : x);
    await patch("tools", t.id, { status: nc ? "us" : "service", lastCalDate: date, nextDue: nc ? date : next, intervalMonths: +val("c-int") || 12, job: null, shipments,
      certs: [...(t.certs || []), { number: no, date, validUntil: nc ? date : next, result: res, file, lab: val("c-lab"), note: val("c-note") }],
      history: tHist(t, "cal", `${T_RESULT[res][0]} · ${no}${val("c-lab") ? " · " + val("c-lab") : ""}`) });
    toast(nc ? "Étalonnage enregistré : outil hors service" : "Étalonnage enregistré : outil en service"); openTool(t.id);
  };
};
/* changement de statut : hors service, perdu, retiré, remis en service */
ACTIONS["tool-status"] = el => {
  const t = S.tools.find(x => x.id === document.querySelector(".modal")?.dataset.tool), st = el.dataset.st; if (!t) return;
  const m = modal(`${mHead(esc(tr(T_STATUS[st][0])) + " · " + esc(tLabel(t)))}<form><div class="body">${field("tst-why", st === "service" ? "Remarque" : "Raison", "", { type: "textarea", wide: true, required: st !== "service" })}
    ${st === "us" ? `<div class="hint">Mettez une étiquette « Unserviceable » sur l'outil et rangez-le en quarantaine.</div>` : ""}</div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Confirmer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); await patch("tools", t.id, Object.assign({ status: st, history: tHist(t, st, val("tst-why")) }, st === "service" ? {} : { out: null })); openTool(t.id); };
};

/* ---------- fiche outil ---------- */
ACTIONS["tool-open"] = el => openTool(el.dataset.id);
async function openTool(id) {
  const t = await waitFind("tools", id); if (!t) return;
  const st = tStatus(t), ok = tUsable(t);
  const act = readOnly ? "" : [
    t.out ? `<button class="btn primary" data-a="tool-in" data-id="${t.id}">Rentrer</button>` : ok ? `<button class="btn primary" data-a="tool-out" data-id="${t.id}">Sortir</button>` : "",
    st === "lab" ? `<button class="btn primary" data-a="tool-back" data-id="${t.id}">Retour du labo</button>` : "",
    ["service", "us"].includes(st) && t.calRequired !== false && !t.out ? `<button class="btn" data-a="tool-send" data-id="${t.id}">Envoyer au labo</button>` : "",
    isOffice() && st !== "lab" ? `<button class="btn" data-a="tool-back" data-id="${t.id}">Enregistrer un étalonnage</button>` : ""].join("");
  const stBtns = readOnly || !isOffice() ? "" : (st === "service" ? [["us", "Mettre hors service"], ["lost", "Déclarer perdu"], ["retired", "Ne plus utiliser"]] : st === "lab" ? [] : [["service", "Remettre en service"]])
    .map(([k, l]) => `<button class="linkbtn small" data-a="tool-status" data-st="${k}">${l}</button>`).join(" · ");
  const m = modal(`${mHead(`<span class="mono">${esc(tLabel(t))}</span> ${esc(t.name)} ${tChip(t)}`)}<div class="body">
    ${tOverdue(t) ? `<div class="banner bad">Étalonnage dépassé depuis le ${fmtDate(t.nextDue)} : ne pas utiliser cet outil.</div>` : ""}
    ${t.out ? `<div class="banner info">Sorti par <b>${esc(outWho(t))}</b>${t.out.reg ? " pour " + `<b class="mono">${esc(t.out.reg)}</b>` : ""} · ${fmtDT(t.out.at)}</div>` : ""}
    ${st === "lab" ? `<div class="banner warn">Au laboratoire ${esc(labName(t.job?.labId))} depuis le ${fmtDate(t.job?.sentDate)}${t.job?.ref ? " · " + esc(t.job.ref) : ""}${t.job?.expected ? " · " + tr("retour prévu") + " " + fmtDate(t.job.expected) : ""}.</div>` : ""}
    <dl class="kv"><dt>Désignation</dt><dd>${esc(t.name)}</dd>${t.pn ? `<dt>Part number (P/N)</dt><dd class="mono">${esc(t.pn)}</dd>` : ""}${t.serial ? `<dt>N° de série (S/N)</dt><dd class="mono">${esc(t.serial)}</dd>` : ""}
    <dt>Marque / modèle</dt><dd>${esc([t.brand, t.model].filter(Boolean).join(" ") || "—")}</dd><dt>Catégorie</dt><dd>${esc(t.category || "—")}</dd><dt>Emplacement</dt><dd>${esc(t.location || "—")}</dd>
    ${t.owner ? `<dt>Propriétaire</dt><dd>${esc(t.owner)}</dd>` : ""}
    ${t.calRequired === false ? `<dt>Étalonnage</dt><dd class="muted">Pas d'étalonnage pour cet outil</dd>` : `<dt>Périodicité</dt><dd>${t.intervalMonths ? t.intervalMonths + " mois" : "—"}</dd><dt>Dernier étalonnage</dt><dd>${fmtDate(t.lastCalDate)}</dd><dt>Prochain étalonnage</dt><dd>${dueChip(t.nextDue)}</dd>`}
    ${t.defaultLabId ? `<dt>Labo habituel</dt><dd>${esc(labName(t.defaultLabId))}</dd>` : ""}</dl>
    ${stBtns ? `<div class="row-g wrap">${stBtns}</div>` : ""}
    ${t.calRequired === false ? "" : `<h3>Certificats</h3>${(t.certs || []).length ? `<div class="tablewrap"><table><thead><tr><th>N°</th><th>Date</th><th>Résultat</th><th>Valide jusqu'au</th><th>Labo</th><th></th></tr></thead><tbody>${(t.certs || []).slice().sort((a, b) => b.date.localeCompare(a.date)).map(c => `<tr>
      <td class="mono">${esc(c.number || "—")}</td><td class="num">${fmtDate(c.date)}</td><td><span class="chip ${T_RESULT[c.result]?.[1] || ""}">${T_RESULT[c.result]?.[0] || "—"}</span></td>
      <td>${c.validUntil >= today() && c.result !== "non_conforme" ? `<span class="chip good">Actif · ${fmtDate(c.validUntil)}</span>` : `<span class="chip">Expiré · ${fmtDate(c.validUntil)}</span>`}</td><td class="small">${esc(c.lab || "")}</td>
      <td class="r">${c.file ? `<a class="btn sm" href="${esc(blobUrl(c.file))}" target="_blank" rel="noopener">Ouvrir</a>` : `<span class="muted small">pas de fichier</span>`}</td></tr>`).join("")}</tbody></table></div>` : `<div class="muted">Aucun certificat enregistré.</div>`}
    <h3>Suivi des envois</h3>${shipmentsHtml(t)}`}
    <h3>Photos</h3><div class="photos">${(t.photos || []).map(p => `<a href="${esc(blobUrl(p))}" target="_blank" rel="noopener"><img src="${esc(blobUrl(p))}" alt="Photo de l'outil ${esc(tLabel(t))}"></a>`).join("")}
      ${assets && !readOnly && isOffice() ? `<label class="addphoto">+ Photo<input type="file" accept="image/*" capture="environment" id="tp-file" hidden></label>` : ""}</div>${!(t.photos || []).length && !assets ? `<div class="muted small">Aucune photo.</div>` : ""}
    <h3>Historique</h3><div class="timeline">${(t.history || []).slice(-40).reverse().map(h => `<div><span class="num muted">${fmtDT(h.at)}</span> <b>${esc(tr(T_HIST[h.type] || h.type))}</b>${h.text ? " · " + esc(h.text) : ""}${h.by ? ` <span class="muted small">(${esc(h.by)})</span>` : ""}</div>`).join("") || `<div class="muted">Rien pour l'instant.</div>`}</div>
    ${t.notes ? `<div class="quote">${esc(t.notes)}</div>` : ""}</div>
    <footer><div class="left">${readOnly || !isOffice() ? "" : `<button class="btn" data-a="tool-form" data-id="${t.id}">Modifier la fiche</button>`}</div>${act}</footer>`, "lg");
  m.dataset.tool = t.id;
  m.querySelector("#tp-file")?.addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return; toast("Envoi du fichier…");
    try { const r = await assets.upload(f, f.type ? undefined : { type: "image/jpeg" }); await patch("tools", t.id, { photos: [...(t.photos || []), r.id] }); toast("Fichier ajouté"); openTool(t.id); }
    catch (x) { toast(x.code === "too_large" ? "Fichier trop lourd (20 Mo maximum)." : "Envoi impossible pour l'instant."); }
  });
  if (t.calRequired !== false) wireShipments(m, t);
}
ACTIONS["tool-form"] = el => {
  const t = S.tools.find(x => x.id === el.dataset.id) || { intervalMonths: 12, status: "service", calRequired: true, owner: settings().name || "" };
  const isNew = !t.id, cats = [...new Set(S.tools.map(x => x.category).filter(Boolean))], locs = [...new Set(S.tools.map(x => x.location).filter(Boolean))];
  const m = modal(`${mHead(isNew ? "Nouvel outil" : "Modifier " + esc(tLabel(t)))}<form><div class="body"><div class="fields">
    ${field("tf-no", "N° d'outil (étiquette)", t.toolNo, { required: true, cls: "mono", ph: "TLV-T-001" })}${field("tf-name", "Désignation", t.name, { required: true, ph: "Clé dynamométrique 20-100 Nm" })}
    ${field("tf-pn", "Part number (P/N)", t.pn, { cls: "mono" })}${field("tf-serial", "N° de série (S/N)", t.serial, { cls: "mono" })}${field("tf-brand", "Marque", t.brand)}${field("tf-model", "Modèle", t.model)}
    <label class="f">Catégorie<input id="tf-cat" list="tf-cats" value="${esc(t.category || "")}"></label><datalist id="tf-cats">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    <label class="f">Emplacement<input id="tf-loc" list="tf-locs" value="${esc(t.location || "")}" placeholder="${esc(tr("Caisse 1, étagère B…"))}"></label><datalist id="tf-locs">${locs.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    ${field("tf-owner", "Propriétaire", t.owner)}</div>
    <label class="chk"><input type="checkbox" id="tf-cal" ${t.calRequired !== false ? "checked" : ""}> Outil à étalonner</label>
    <div class="fields" id="tf-calf">${field("tf-int", "Périodicité (mois)", t.intervalMonths, { type: "number", min: 1 })}${field("tf-last", "Dernier étalonnage", t.lastCalDate, { type: "date" })}${field("tf-next", "Prochain étalonnage", t.nextDue, { type: "date" })}</div>
    ${field("tf-notes", "Notes", t.notes, { type: "textarea", wide: true })}<div class="err" id="tf-err"></div></div>
    <footer>${isNew ? "" : `<div class="left"><button type="button" class="btn danger" data-a="tool-del" data-id="${t.id}" ${dis()}>Supprimer</button></div>`}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "lg");
  const calf = () => { m.querySelector("#tf-calf").hidden = !m.querySelector("#tf-cal").checked; };
  m.querySelector("#tf-cal").onchange = calf; calf();
  m.querySelector("#tf-last").onchange = () => { if (val("tf-last")) m.querySelector("#tf-next").value = addMonths(val("tf-last"), +val("tf-int") || 12); };
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const no = normSerial(val("tf-no")), other = S.tools.find(x => normSerial(x.toolNo) === no);
    if (other && other.id !== t.id) { m.querySelector("#tf-err").textContent = `${tr("Le n° d'outil")} ${no} ${tr("existe déjà")} (${other.name}).`; return; }
    const data = Object.assign({ photos: [], certs: [], history: [], shipments: [] }, strip(t), { toolNo: no, name: val("tf-name"), pn: val("tf-pn").trim().toUpperCase(), serial: normSerial(val("tf-serial")),
      brand: val("tf-brand"), model: val("tf-model"), category: val("tf-cat"), location: val("tf-loc"), owner: val("tf-owner"), calRequired: m.querySelector("#tf-cal").checked,
      intervalMonths: +val("tf-int") || 12, lastCalDate: val("tf-last"), nextDue: val("tf-next"), notes: val("tf-notes"), status: t.status || "service" });
    const id = await save("tools", t.id || "t-" + safeId(no), data);
    toast("Outil enregistré"); openTool(id);
  };
};
ACTIONS["tool-del"] = el => confirmBox("Supprimer cet outil du registre ? Pour un outil qui n'est plus utilisé, préférez « Retirer » : son historique reste consultable.", () => remove("tools", el.dataset.id));

/* ======================= SUIVI DES ENVOIS (DHL, FedEx…) ======================= */
const CARRIERS = {
  dhl: ["DHL", n => `https://www.dhl.com/be-fr/home/tracking/tracking-express.html?submit=1&tracking-id=${n}`],
  fedex: ["FedEx", n => `https://www.fedex.com/fedextrack/?trknbr=${n}`],
  ups: ["UPS", n => `https://www.ups.com/track?tracknum=${n}`],
  tnt: ["TNT", n => `https://www.tnt.com/express/fr_be/site/outils-expedition/suivi.html?searchType=con&cons=${n}`],
  bpost: ["bpost", n => `https://track.bpost.cloud/btr/web/#/search?itemCode=${n}`],
  autre: ["Autre", null]
};
const SHIP_DIR = { vers_labo: "Vers le labo", retour_labo: "Retour du labo" };
const trackUrl = x => { const c = CARRIERS[x.carrier]; return c && c[1] ? c[1](encodeURIComponent(x.number)) : ""; };
function shipmentsHtml(t) {
  const list = (t.shipments || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return `<div class="ships">${list.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Sens</th><th>Transporteur</th><th>N° de suivi</th><th>État</th><th></th></tr></thead><tbody>${list.map(x => `<tr>
    <td class="num">${fmtDate(x.date)}</td><td>${esc(SHIP_DIR[x.dir] || x.dir || "—")}${x.labId ? `<div class="muted small">${esc(labName(x.labId))}</div>` : ""}</td><td><b>${esc(CARRIERS[x.carrier]?.[0] || x.carrier)}</b></td>
    <td class="mono">${trackUrl(x) ? `<a href="${esc(trackUrl(x))}" target="_blank" rel="noopener" data-stop>${esc(x.number)} ↗</a>` : esc(x.number)}</td>
    <td>${x.delivered ? `<span class="chip good">Livré · ${fmtDate(x.delivered)}</span>` : readOnly ? `<span class="chip info">En transit</span>` : `<button type="button" class="btn sm" data-shipdone="${x.id}">Marquer livré</button>`}</td>
    <td class="r">${readOnly ? "" : `<button type="button" class="x" data-shiprm="${x.id}" aria-label="Supprimer cet envoi">×</button>`}</td></tr>`).join("")}</tbody></table></div>` : `<div class="muted small">Aucun envoi enregistré.</div>`}
    ${readOnly ? "" : `<div class="shipadd row-g wrap"><select id="sh-dir" class="fsel" aria-label="Sens">${Object.entries(SHIP_DIR).map(([k, l]) => `<option value="${k}" ${k === (t.status === "lab" ? "retour_labo" : "vers_labo") ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select id="sh-car" class="fsel" aria-label="Transporteur">${Object.entries(CARRIERS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select>
      <input id="sh-no" class="mono" placeholder="N° de suivi" aria-label="Numéro de suivi"><input id="sh-date" type="date" value="${today()}" aria-label="Date d'envoi"><button type="button" class="btn sm" id="sh-add">+ Ajouter l'envoi</button></div>`}</div>`;
}
function wireShipments(m, t) {
  m.querySelector("#sh-add")?.addEventListener("click", async () => {
    const no = (m.querySelector("#sh-no").value || "").trim(); if (!no) { m.querySelector("#sh-no").focus(); toast("Indiquez le n° de suivi."); return; }
    const x = { id: "s" + Date.now().toString(36), carrier: m.querySelector("#sh-car").value, number: no, dir: m.querySelector("#sh-dir").value, date: m.querySelector("#sh-date").value || today() };
    if (x.dir.includes("labo") && t.job?.labId) x.labId = t.job.labId;
    await patch("tools", t.id, { shipments: [...(t.shipments || []), x] }); toast("Envoi ajouté"); openTool(t.id);
  });
  m.querySelector(".ships")?.addEventListener("click", async e => {
    const d = e.target.closest("[data-shipdone]"), r = e.target.closest("[data-shiprm]");
    if (d) { await patch("tools", t.id, { shipments: (t.shipments || []).map(x => x.id === d.dataset.shipdone ? Object.assign({}, x, { delivered: today() }) : x) }); openTool(t.id); }
    if (r) { await patch("tools", t.id, { shipments: (t.shipments || []).filter(x => x.id !== r.dataset.shiprm) }); openTool(t.id); }
  });
}

/* ======================= LABORATOIRES ======================= */
const labTools = id => S.tools.filter(t => t.status === "lab" && t.job?.labId === id);
function calibLabs() {
  const labs = (S.labs || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const sel = labs.find(l => l.id === UI.labSel) || null;
  const list = `<div class="panel"><div class="row-sb pad"><h3 class="np">${plural(labs.length, "laboratoire")}</h3>${readOnly ? "" : `<button class="btn primary sm" data-a="lab-form">Ajouter un laboratoire</button>`}</div>
    ${labs.length ? `<div class="tablewrap"><table><thead><tr><th>Laboratoire</th><th>Accréditation</th><th>Contact</th><th class="r">Outils chez eux</th></tr></thead><tbody>${labs.map(l => { const n = labTools(l.id).length; return `<tr class="click ${sel && sel.id === l.id ? "sel" : ""}" data-a="lab-sel" data-id="${l.id}">
      <td><b>${esc(l.name)}</b><div class="muted small">${esc(l.city || "")}</div></td><td class="small">${esc(l.accreditation || "—")}</td><td class="small">${esc(l.contact || "")}${l.email ? `<div class="muted">${esc(l.email)}</div>` : ""}</td>
      <td class="r">${n ? `<span class="chip bad">${n}</span>` : `<span class="muted">0</span>`}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="empty">Aucun laboratoire. Ajoutez les labos où la station envoie ses outils (par exemple WAYS) : ils pourront être choisis à chaque envoi.</div>`}</div>`;
  if (!sel) return `<div class="labs-grid">${list}<div class="panel empty">Sélectionnez un laboratoire pour voir ses coordonnées et les outils qui s'y trouvent actuellement.</div></div>`;
  const ts = labTools(sel.id).sort((a, b) => (a.job?.sentDate || "").localeCompare(b.job?.sentDate || ""));
  const usual = S.tools.filter(t => t.defaultLabId === sel.id).length;
  return `<div class="labs-grid">${list}<div class="panel"><div class="row-sb pad"><div><h3 class="np">${esc(sel.name)}</h3><div class="muted small">${plural(usual, "outil")} l'ont comme labo habituel</div></div>${readOnly ? "" : `<button class="btn sm" data-a="lab-form" data-id="${sel.id}">Modifier</button>`}</div>
    <dl class="kv sm pad">${[["Accréditation", sel.accreditation], ["Adresse", [sel.address, sel.city].filter(Boolean).join(", ")], ["Contact", sel.contact], ["E-mail", sel.email], ["Téléphone", sel.phone], ["Délai habituel", sel.leadDays ? sel.leadDays + " jours" : ""]].filter(r => r[1]).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
    ${sel.notes ? `<div class="pad quote">${esc(sel.notes)}</div>` : ""}
    <div class="pad"><h3 class="np">Outils actuellement chez ${esc(sel.name)} <span class="muted">${ts.length}</span></h3></div>
    ${ts.length ? `<div class="tablewrap"><table><thead><tr><th>N° outil</th><th>Outil</th><th>S/N</th><th>Référence</th><th>Envoyé le</th><th>Suivi</th></tr></thead><tbody>${ts.map(t => { const d = t.job?.sentDate ? daysBetween(t.job.sentDate, today()) : null, shp = (t.shipments || []).filter(x => x.dir === "vers_labo").slice(-1)[0];
      return `<tr class="click" data-a="tool-open" data-id="${t.id}"><td class="mono"><b>${esc(t.toolNo || t.serial)}</b>${demoTag(t)}</td><td>${esc(t.name)}</td><td class="small mono">${esc(t.serial || "")}</td><td class="small mono">${esc(t.job?.ref || "—")}</td>
        <td class="num">${fmtDate(t.job?.sentDate)}${d != null ? ` <span class="small ${sel.leadDays && d > +sel.leadDays ? "txt-warn" : "muted"}">· ${d} j</span>` : ""}</td>
        <td>${shp ? (trackUrl(shp) ? `<a href="${esc(trackUrl(shp))}" target="_blank" rel="noopener" data-stop class="mono small nowrap">${esc(CARRIERS[shp.carrier]?.[0])} ${esc(shp.number)} ↗</a>` : `<span class="mono small">${esc(shp.number)}</span>`) : `<span class="muted small">—</span>`}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="empty">Aucun outil chez ce laboratoire en ce moment.</div>`}</div></div>`;
}
ACTIONS["lab-sel"] = el => { UI.labSel = UI.labSel === el.dataset.id ? null : el.dataset.id; render(true); };
ACTIONS["lab-form"] = el => {
  const l = (S.labs || []).find(x => x.id === el.dataset.id) || {};
  const m = modal(`${mHead(l.id ? "Modifier " + esc(l.name) : "Nouveau laboratoire")}<form><div class="body"><div class="fields">
    ${field("lb-name", "Nom", l.name, { required: true, wide: true })}${field("lb-acc", "Accréditation", l.accreditation, { ph: "BELAC ISO 17025 n° …" })}${field("lb-lead", "Délai habituel (jours)", l.leadDays, { type: "number", min: 0 })}
    ${field("lb-addr", "Adresse", l.address)}${field("lb-city", "Ville / pays", l.city)}${field("lb-contact", "Personne de contact", l.contact)}${field("lb-email", "E-mail", l.email, { type: "email" })}${field("lb-phone", "Téléphone", l.phone)}</div>
    ${field("lb-notes", "Notes (domaines couverts, conditions…)", l.notes, { type: "textarea", wide: true })}</div>
    <footer>${l.id ? `<div class="left"><button type="button" class="btn danger" data-a="lab-del" data-id="${l.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const id = await save("labs", l.id, Object.assign(strip(l), { name: val("lb-name"), accreditation: val("lb-acc"), leadDays: +val("lb-lead") || 0, address: val("lb-addr"), city: val("lb-city"), contact: val("lb-contact"), email: val("lb-email"), phone: val("lb-phone"), notes: val("lb-notes") }));
    closeModal(); UI.labSel = id; toast("Laboratoire enregistré"); render(true);
  };
};
ACTIONS["lab-del"] = el => { const n = labTools(el.dataset.id).length; confirmBox(n ? `${plural(n, "outil")} se trouve${n > 1 ? "nt" : ""} encore chez ce labo. Supprimer quand même ?` : "Supprimer ce laboratoire ?", async () => { await remove("labs", el.dataset.id); UI.labSel = null; }); };
