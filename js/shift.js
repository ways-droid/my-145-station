"use strict";
/* ======================= SHIFTS ET HANDOVER =======================
   Une fiche par shift (jour 08-20, nuit 20-08, heure de la station), avec les 5 sections du handover Notion
   approuvé par l'autorité : 1. travail non terminé, 2. travail prévu / fait par avion, 3. équipement et matériel,
   4. Station Control (contrôles de fin de shift), 5. manpower et signatures des chefs d'équipe.
   handovers/<AAAA-MM-JJ>-<day|night> = { date, shift, foreman, extra[], checks{}, out{by,at}, in{by,at} }
   shiftItems/<id> = { ho, kind: todo|visit|equip, … } (une ligne = un document : plusieurs personnes saisissent en même temps)
   Le bouton Notion écrit la page du shift sous la page Notion choisie dans Paramètres (api/notion.php). Rien ici ne remplace la CRS dans AMOS. */
const SHIFTS = { day: "Jour (08-20 LT)", night: "Nuit (20-08 LT)" };
/* contrôles du handover approuvé (modifiables dans Paramètres), écrits dans Notion deux par ligne */
const STATION_CHECKS = ["Tool Check Per MOE 2.6.5", "Temp / Humidity Per MOE 2.3.1", "Cleanliness of Office", "Line Vans Cleaned and Restocked"];
const stationChecks = () => { const s = String(settings().stationChecks || "").split("\n").map(x => x.trim()).filter(Boolean); return s.length ? s : STATION_CHECKS; };
const hoId = (date, sh) => `${date}-${sh}`;
const hoDoc = id => S.handovers.find(h => h.id === id);
const hoItems = (id, kind) => S.shiftItems.filter(x => x.ho === id && (!kind || x.kind === kind)).sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.arr || "").localeCompare(String(b.arr || "")));
const prevShift = (date, sh) => sh === "night" ? [date, "day"] : [addDays(date, -1), "night"];
const nextShift = (date, sh) => sh === "day" ? [date, "night"] : [addDays(date, 1), "day"];
/* shift en cours à l'heure de la station (fuseau des paramètres, sinon celui de l'appareil) */
function currentShift() {
  let d = new Date(), date = today(), h = d.getHours();
  try { if (stationTz()) { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: stationTz(), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
    date = `${p.year}-${p.month}-${p.day}`; h = +p.hour % 24; } } catch { }
  return h >= 20 ? [date, "night"] : h < 8 ? [addDays(date, -1), "night"] : [date, "day"];
}
const shiftName = (date, sh) => `${fmtDate(date)} · ${tr(SHIFTS[sh])}`;
const sName = id => staff(id)?.name || "?";
/* contrôle des qualifications d'un avion : au moins un CRS affecté qui a le droit de le signer. Avec la fiche de l'avion
   (section Avions) : Type Rating sur le type, le modèle et le moteur, conditions ET / OU de la fiche, autorisation compagnie.
   Sans fiche : qualifié sur le type, avec I pour un 4X-. */
function visitCheck(v) {
  if (!v.acType) return { ok: true, msg: "" };
  const crs = (v.crs || []).map(staff).filter(Boolean), is4X = /^4X/i.test(v.reg || "");
  if (!crs.length) return { ok: false, msg: "Aucun CRS affecté" };
  const ac0 = typeof aircraftOf === "function" ? aircraftOf(v.reg) : null, ac = ac0 && ac0.acType === v.acType ? ac0 : null;
  const sp = ac ? acSpec(ac) : { acType: v.acType, variant: "", engine: "" }, rule = ac ? acRule(ac) : { op: "and", items: is4X ? ["I"] : [] };
  if (crs.some(p => canSign(p, sp, rule))) return { ok: true, msg: "" };
  const nm = ac ? acName(ac) : v.acType, rt = ruleText(rule);
  if (crs.some(p => trQualif(p, sp, rule).length)) return { ok: false, lvl: "amber", msg: `${normReg(v.reg)} : CRS qualifié ${nm} mais sans autorisation compagnie` };
  if (!crs.some(p => staffTR(p).some(r => r.t === v.acType))) return { ok: false, lvl: "amber", msg: `Aucun CRS qualifié ${v.acType}` };
  if (!ac) return { ok: false, lvl: "amber", msg: `4X- : aucun CRS avec I sur ${v.acType}` };
  return { ok: false, lvl: "amber", msg: `${normReg(v.reg)} : aucun CRS qualifié ${nm}${rt ? " avec " + rt : ""}` };
}
const hoClosed = h => !!(h && h.in && h.in.at);
/* un shift ne peut être remis ni repris que si le shift précédent est entièrement passé (remis ET repris).
   Un shift précédent jamais utilisé (aucune fiche, aucune ligne) ne bloque pas : c'est le début de l'historique.
   Renvoie l'id du shift précédent qui bloque, ou "" */
function prevBlock(id) {
  const [pd, ps] = prevShift(id.slice(0, 10), id.slice(11)), pid = hoId(pd, ps), P = hoDoc(pid);
  if (P && P.out && P.out.at && P.in && P.in.at) return "";
  if (!P && !S.shiftItems.some(x => x.ho === pid)) return "";
  return pid;
}

VIEWS.shift = {
  after() { if (typeof wxLoad === "function") wxLoad(); if (SERVER && !FR24) fr24Status().then(s => { if (s && s.configured) { render(true); fr24AutoRun(); } }); else if (SERVER) fr24AutoRun(); if (SERVER && !NOTION) notionStatus().then(s => { if (s && s.configured) render(true); }); if (SERVER && !OD) odStatus(); },
  render() {
    if (!UI.shift) UI.shift = currentShift();
    const [date, sh] = UI.shift, id = hoId(date, sh), h = hoDoc(id) || {}, cur = currentShift(), isCur = cur[0] === date && cur[1] === sh;
    const visits = hoItems(id, "visit"), bad = visits.filter(v => !visitCheck(v).ok).length;
    const top = head("Shift", "Planning des avions et handover : les 5 sections du handover de la station", "",
      `<div class="row-g wrap"><button class="btn sm" data-a="shift-go" data-n="-1" aria-label="Shift précédent">‹</button><b class="rmonth">${esc(shiftName(date, sh))}</b><button class="btn sm" data-a="shift-go" data-n="1" aria-label="Shift suivant">›</button>
        <input type="date" id="shift-date" value="${esc(date)}" aria-label="Date"><div class="seg">${Object.keys(SHIFTS).map(k => `<button data-a="shift-sh" data-sh="${k}" class="${k === sh ? "on" : ""}">${k === "day" ? "Jour" : "Nuit"}</button>`).join("")}</div>
        <a class="btn sm" href="#mur" target="_blank" rel="noopener" title="${esc(tr("Plein écran pour la TV du bureau"))}">📺 ${esc(tr("Mur"))}</a>
        ${isCur ? `<span class="chip good">Shift en cours</span>` : `<button class="btn sm" data-a="shift-now">Shift en cours</button>`}
        ${h.notion?.url ? `<a class="btn sm" href="${esc(h.notion.url)}" target="_blank" rel="noopener" title="${esc(tr("Envoyé par") + " " + (h.notion.by || "") + " · " + fmtDT(h.notion.at))}">Page Notion ↗</a>` : ""}
        ${NOTION && NOTION.configured && h.date && !readOnly ? `<button class="btn sm" data-a="ho-notion" data-ho="${id}">${h.notion?.url ? "Renvoyer vers Notion" : "Envoyer vers Notion"}</button>` : ""}</div>`);
    const tabsH = (typeof wxBanner === "function" ? wxBanner() : "") + tabs("shift", [["shift", "Shift"], ["briefing", "Briefing"]]);
    if (curTab("shift", "shift") === "briefing" && typeof shiftBriefing === "function") return top + tabsH + shiftBriefing(id, date, sh);
    return top + tabsH +
      (prevBlock(id) && !hoClosed(h) && !(h.out && h.out.at) ? `<div class="ho-lockbar" role="status">🔒 ${esc(tr("Ce shift peut être préparé et encodé, mais pas encore remis ni repris : le shift précédent"))} <button class="linkbtn" data-a="shift-go" data-n="-1">${esc(shiftLabel(prevBlock(id)))}</button> ${esc(tr("n'est pas encore remis et repris."))}</div>` : "") +
      (h.out && h.out.at ? (hoLocked(h) ? `<div class="ho-lockbar ho-done" role="status">🔒 ${esc(tr("Shift remis par"))} ${esc(h.out.by || "?")} (${fmtDT(h.out.at)}) : ${esc(tr("plus aucune modification possible."))} ${canReopenShift() && !readOnly ? `<button class="btn sm" data-a="ho-reopen">${esc(tr("Réactiver la modification"))}</button>` : `<span class="small">${esc(tr("Le Station Lead peut le réactiver."))}</span>`}</div>`
        : `<div class="banner warn">✏️ ${esc(tr("Modification réactivée par"))} ${esc(h.reopen.by || "?")} (${fmtDT(h.reopen.at)}). ${!readOnly ? `<button class="btn sm" data-a="ho-relock">${esc(tr("Terminer et reverrouiller"))}</button>` : ""}</div>`) : "") +
      (hoClosed(h) ? `<div class="banner good">Handover terminé : remis par ${esc(h.out?.by || "?")} et repris par ${esc(h.in.by)} (${fmtDT(h.in.at)}).</div>` : "") +
      (bad ? `<div class="banner warn">${plural(bad, "avion")} sans CRS qualifié affecté : voir la section 2.</div>` : "") +
      (typeof shiftSituations === "function" ? shiftSituations() : "") +
      `<div class="${prevBlock(id) && !hoClosed(h) && !(h.out && h.out.at) ? "ho-locked" : ""}">` + shiftTodo(id, date, sh) + shiftVisits(id) + shiftEquip(id) + (hoEd(id) ? shiftChecks(id, h) + shiftCrew(id, date, sh, h)
        : (shiftChecks(id, h) + shiftCrew(id, date, sh, h)).replace('id="ho-ckn"', 'id="ho-ckn" disabled').replace('id="ho-fm"', 'id="ho-fm" disabled')) + `</div>`;
  }
};
/* shift remis (out) : verrouillé pour tous tant que le Station Lead (ou un Shift Foreman qu'il autorise) ne le réactive pas */
const hoLocked = h => !!(h && h.out && h.out.at && !(h.reopen && h.reopen.at));
const canReopenShift = () => { if (isAdmin()) return true; const p = typeof meStaff === "function" ? meStaff() : null; return !!p && (p.function === "lead" || (p.function === "foreman" && !!settings().reopenForemen)); };
const hoEd = id => !readOnly && !hoLocked(hoDoc(id)) && (!hoClosed(hoDoc(id)) || isOffice());
function lockCardShell() {
  const p = typeof meStaff === "function" ? meStaff() : null; if (!SERVER || !(isAdmin() || (p && p.function === "lead"))) return "";
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><h3 class="np">${esc(tr("Shifts remis"))}</h3>
    <div class="muted small">${esc(tr("Un shift remis est verrouillé. Le Station Lead peut le réactiver ; cette option permet aussi aux Shift Foremen de le faire."))}</div>
    <label class="chk line"><input type="checkbox" data-a="lock-deleg" ${settings().reopenForemen ? "checked" : ""}> ${esc(tr("Autoriser les Shift Foremen à réactiver un shift remis"))}</label></div></div>`;
}
ACTIONS["lock-deleg"] = async el => { try { await patch("settings", "company", { reopenForemen: el.checked }); toast(el.checked ? "Shift Foremen autorisés" : "Réservé au Station Lead"); } catch (e) { el.checked = !el.checked; toast(tr(e.message)); } };
ACTIONS["ho-reopen"] = () => { const id = hoId(...UI.shift);
  confirmBox(esc(tr("Réactiver la modification de ce shift remis ? L'action est tracée dans l'historique.")), async () => { await hoPatch(id, { reopen: { by: meName(), at: new Date().toISOString() } }); render(true); }, tr("Réactiver")); };
ACTIONS["ho-relock"] = async () => { await hoPatch(hoId(...UI.shift), { reopen: null }); toast("Shift verrouillé"); render(true); };
const sec = (n, title, sub, actions, body) => `<section class="panel ho-sec"><div class="pad row-sb"><div><h3><span class="ho-n">${n}</span>${title}</h3>${sub ? `<div class="muted small">${sub}</div>` : ""}</div><div class="row-g">${actions || ""}</div></div>${body}</section>`;

/* 1. travail non terminé */
function shiftTodo(id, date, sh) {
  const rows = hoItems(id, "todo"), ed = hoEd(id), pid = hoId(...prevShift(date, sh));
  const prevOpen = [...hoItems(pid, "todo").filter(x => !x.done), ...hoItems(pid, "visit").filter(v => v.open)].filter(x => !rows.some(r => r.from === x.id));
  return sec(1, "Travail non terminé", "Ce qui reste à faire, repris par le shift suivant.", ed ? `${prevOpen.length ? `<button class="btn sm" data-a="todo-carry" data-id="${id}" data-prev="${pid}">Reprendre du shift précédent (${prevOpen.length})</button>` : ""}<button class="btn sm" data-a="todo-form" data-ho="${id}">Ajouter</button>` : "",
    rows.length ? `<div class="tablewrap"><table><thead><tr><th style="width:40px"></th><th>Avion</th><th>Travail</th><th>Remarque</th></tr></thead><tbody>${rows.map(x => `<tr class="${ed ? "click" : ""} ${x.done ? "muted" : ""}" ${ed ? `data-a="todo-form" data-ho="${id}" data-id="${x.id}"` : ""}>
      <td><input type="checkbox" data-a="todo-done" data-id="${x.id}" ${x.done ? "checked" : ""} ${ed ? "" : "disabled"} aria-label="Fait"></td><td class="mono"><b>${esc(x.reg || "")}</b></td><td class="pre">${x.unc ? `<span class="chip sm bad unc-chip">${esc(tr("Uncompleted maintenance task"))}</span> ` : ""}${esc(x.text || "")}${x.unc && x.visitRef && S.shiftItems.some(y => y.id === x.visitRef) ? ` <button class="linkbtn small" data-a="visit-form" data-ho="${id}" data-id="${x.visitRef}">${esc(tr("Tech Log de l'avion"))} ↗</button>` : ""}</td><td class="small">${esc(x.note || "")}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="pad muted">Rien en attente.</div>`);
}
ACTIONS["todo-form"] = el => {
  const x = S.shiftItems.find(i => i.id === el.dataset.id) || { kind: "todo", ho: el.dataset.ho };
  const m = modal(`${mHead(x.id ? "Travail non terminé" : "Nouveau travail non terminé")}<form><div class="body"><div class="fields">
    ${field("td-reg", "Immatriculation", x.reg, { cls: "mono", ph: "9H-ABC" })}${field("td-text", "Travail à faire", x.text, { type: "textarea", wide: true, required: true })}${field("td-note", "Remarque", x.note, { wide: true })}</div></div>
    <footer>${x.id ? `<div class="left"><button type="button" class="btn danger" data-a="item-del" data-id="${x.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); await save("shiftItems", x.id, Object.assign(strip(x), { reg: val("td-reg").toUpperCase(), text: val("td-text"), note: val("td-note"), order: x.order || Date.now() })); closeModal(); };
};
document.addEventListener("change", e => { const t = e.target; if (t.dataset && t.dataset.a === "todo-done") patch("shiftItems", t.dataset.id, { done: t.checked }); });
ACTIONS["todo-done"] = () => { };
ACTIONS["todo-carry"] = async el => {
  const id = el.dataset.id, pid = el.dataset.prev, have = hoItems(id, "todo").map(r => r.from);
  const src = [...hoItems(pid, "todo").filter(x => !x.done).map(x => ({ reg: x.reg, text: x.text, note: x.note, from: x.id })),
    ...hoItems(pid, "visit").filter(v => v.open).map(v => ({ reg: v.reg, text: v.openText || v.planned || "", note: v.notes || "", from: v.id }))].filter(x => !have.includes(x.from));
  for (const [i, x] of src.entries()) await save("shiftItems", null, Object.assign({ kind: "todo", ho: id, order: Date.now() + i }, x));
  toast(plural(src.length, "travail repris", "travaux repris"));
};
/* un avion sur plusieurs shifts : ses lignes vides des autres shifts partent avec lui ; celles avec du travail restent */
/* supprimer une ligne (avion, travail à reprendre, équipement) : confirmation dans la fiche même, sans la fermer.
   Un avion sur plusieurs shifts : ses lignes vides des autres shifts partent avec lui ; celles avec du travail restent */
ACTIONS["item-del"] = el => {
  const v = S.shiftItems.find(x => x.id === el.dataset.id), g = v && v.kind === "visit" ? visitGroup(v).filter(x => x.id !== v.id) : [];
  const msg = v && v.kind === "visit" ? `${esc(tr("Êtes-vous sûr de vouloir supprimer l'avion"))} <b>${esc(v.reg || "")}</b> ${esc(tr("de ce shift ?"))} ${esc(tr("Le Tech Log de ce shift sera perdu."))}${g.length ? " " + esc(tr("Ses lignes vides des autres shifts sont aussi retirées ; celles où du travail est encodé restent.")) : ""}`
    : esc(tr("Êtes-vous sûr de vouloir supprimer cette ligne ?"));
  const linked = v && v.kind === "visit" ? S.shiftItems.filter(x => x.kind === "equip" && x.visitId === v.id && x.taskId && !x.item) : [];
  const go = async () => { await remove("shiftItems", el.dataset.id); for (const x of [...g.filter(x => !hasWork(x)), ...linked]) await remove("shiftItems", x.id); closeModal(); toast("C'est fait"); };
  const box = el.closest(".left");
  if (!box) return confirmBox(msg, go);
  box.innerHTML = `<span class="tl-sure">${msg} <button type="button" class="btn sm" data-dno>${esc(tr("Non"))}</button> <button type="button" class="btn sm danger" data-dyes>${esc(tr("Oui, supprimer"))}</button></span>`;
  box.querySelector("[data-dyes]").onclick = go;
  box.querySelector("[data-dno]").onclick = () => { box.innerHTML = `<button type="button" class="btn danger" data-a="item-del" data-id="${esc(el.dataset.id)}">${esc(tr("Supprimer"))}</button>`; };
};

/* ---- avion sur plusieurs shifts ----
   Une escale = un groupe de lignes (une par shift, même visitId = id de la première ligne). Les données de l'escale
   (immatriculation, type, ARR, DEP et leurs dates UTC, vol) sont recopiées sur toutes les lignes du groupe ; le travail
   (CRS, mécanos, prévu, fait, MHRS, ATL…) appartient au shift de sa ligne et ne se modifie que depuis ce shift. */
const VISIT_SHARED = ["reg", "acType", "clientId", "arr", "dep", "arrDate", "depDate", "flight"];
const visitGid = v => v.visitId || v.id;
const visitGroup = v => S.shiftItems.filter(x => x.kind === "visit" && visitGid(x) === visitGid(v));
const shKey = id => id.slice(0, 10) + (id.endsWith("night") ? "1" : "0");
const hasWork = v => !!((v.tasks || []).length || (v.crs || []).length || (v.mech || []).length || v.planned || v.done || v.notes || v.mhrs || v.atl || v.cht || (v.scans || []).length);
/* shift (id) qui contient un instant UTC, à l'heure de la station */
function shiftOfUtc(ms) {
  const d = new Date(ms); let date = iso(d), h = d.getHours();
  try { const tz = stationTz(); const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
    date = `${p.year}-${p.month}-${p.day}`; h = +p.hour % 24; } catch { }
  return h >= 20 ? hoId(date, "night") : h < 8 ? hoId(addDays(date, -1), "night") : hoId(date, "day");
}
const hmOk = s => /^([01]?\d|2[0-3]):?([0-5]\d)$/.test(String(s || "").trim());
const hmNorm = s => { const m = /^([01]?\d|2[0-3]):?([0-5]\d)$/.exec(String(s || "").trim()); return m ? `${pad(+m[1])}:${m[2]}` : ""; };
const atUtc = (date, hm) => Date.parse(`${date}T${hmNorm(hm)}:00Z`);
/* instants UTC d'arrivée et de départ d'une escale. Sans date : l'ARR est l'heure qui tombe dans le shift (ou juste avant),
   le DEP la première occurrence après l'arrivée (23:00 → 05:00 = le lendemain). Les heures FR24 sont montrées à part (fr24Times). */
function visitTimes(v, ho) {
  const [a, b] = shiftWindow(ho || v.ho); let arr = null, dep = null;
  if (hmOk(v.arr)) { if (v.arrDate) arr = atUtc(v.arrDate, v.arr);
    else { const d0 = new Date(a).toISOString().slice(0, 10); arr = [d0, addDays(d0, 1), addDays(d0, -1)].map(d => atUtc(d, v.arr)).find(t => t >= a - 6 * 3600000 && t <= b) ?? atUtc(d0, v.arr); } }
  if (hmOk(v.dep)) { if (v.depDate) dep = atUtc(v.depDate, v.dep);
    else { const from = arr ?? a, d0 = new Date(from).toISOString().slice(0, 10); dep = [d0, addDays(d0, 1), addDays(d0, 2)].map(d => atUtc(d, v.dep)).find(t => t >= from) ?? null; } }
  return { arr, dep };
}
/* shifts couverts par l'escale : du shift de la ligne (ou de l'arrivée, si plus tôt) au shift du départ, 30 au plus */
function visitShifts(v) {
  const t = visitTimes(v), out = [];
  let cur = v.ho; if (t.arr != null) { const s = shiftOfUtc(t.arr); if (shKey(s) < shKey(cur)) cur = s; }
  const end = t.dep != null ? shiftOfUtc(t.dep) : v.ho;
  for (let i = 0; i < 30 && shKey(cur) <= shKey(end); i++) { out.push(cur); const [d, sh] = nextShift(cur.slice(0, 10), cur.slice(11)); cur = hoId(d, sh); }
  return out.length ? out : [v.ho];
}
/* après l'enregistrement d'une ligne : données de l'escale recopiées sur le groupe, lignes créées sur les shifts couverts,
   lignes vides retirées des shifts qui ne sont plus couverts (une ligne avec du travail est gardée) */
async function visitSync(v) {
  if (hmOk(v.arr) && !v.arrDate) { const t = visitTimes(v); if (t.arr != null) { v = Object.assign({}, v, { arrDate: new Date(t.arr).toISOString().slice(0, 10) }); await patch("shiftItems", v.id, { arrDate: v.arrDate }); } }
  const gid = visitGid(v), shared = Object.fromEntries(VISIT_SHARED.map(k => [k, v[k] ?? ""])), want = visitShifts(v);
  const group = S.shiftItems.filter(x => x.kind === "visit" && visitGid(x) === gid && x.id !== v.id);
  for (const x of group) {
    if (!want.includes(x.ho) && !hasWork(x)) { await remove("shiftItems", x.id); continue; }
    if (VISIT_SHARED.some(k => (x[k] ?? "") !== shared[k]) || x.visitId !== gid) await patch("shiftItems", x.id, Object.assign({ visitId: gid }, shared));
  }
  for (const ho of want) if (ho !== v.ho && !group.some(x => x.ho === ho))
    await save("shiftItems", `${gid}_${ho}`, Object.assign({ kind: "visit", ho, visitId: gid, crs: [], mech: [], order: v.order || Date.now() }, shared));
  if (!v.visitId && want.length > 1) await patch("shiftItems", v.id, { visitId: gid });
}
/* avion créé ou modifié ailleurs que dans le formulaire (Sindri, Flightradar24, autre appareil) : les shifts couverts par
   l'escale (heures Z converties à l'heure de la station) reçoivent leur ligne. Identifiant fixe par shift : deux appareils
   qui réparent en même temps écrivent la même ligne, sans doublon. Les shifts remis (verrouillés) ne sont pas touchés. */
let healT = null, healing = false;
const visitHealSoon = () => { clearTimeout(healT); healT = setTimeout(visitHeal, 1500); };
async function visitHeal() {
  if (healing || readOnly || mode !== "db" || !S.loaded.shiftItems || !S.loaded.handovers) return;
  healing = true;
  try {
    const lim = addDays(today(), -10), groups = new Map();
    for (const x of S.shiftItems) if (x.kind === "visit" && x.ho >= lim) { const g = visitGid(x); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(x); }
    for (const [g, rows] of groups) {
      const src = rows.slice().sort((a, b) => shKey(a.ho).localeCompare(shKey(b.ho)))[0];
      if (!hmOk(src.arr) && !hmOk(src.dep)) continue;
      const shared = Object.fromEntries(VISIT_SHARED.map(k => [k, src[k] ?? ""]));
      const missing = visitShifts(src).filter(ho => !rows.some(r => r.ho === ho) && hoEd(ho) && !S.shiftItems.some(x => x.id === `${g}_${ho}`));
      for (const ho of missing) { try { await db.collection("shiftItems").doc(`${g}_${ho}`).set(Object.assign({ kind: "visit", ho, visitId: g, crs: [], mech: [], order: src.order || Date.now() }, shared)); } catch (e) { } }
      if (missing.length && !src.visitId) { try { await db.collection("shiftItems").doc(src.id).update({ visitId: g }); } catch (e) { } }
    }
  } finally { healing = false; }
}
const shiftLabel = ho => `${fmtDate(ho.slice(0, 10))} · ${tr(SHIFTS[ho.slice(11)])}`;
/* code IATA de la station (paramètres ; TLV si non renseigné) */
const stationIata = () => (settings().stationCode || "TLV").toUpperCase();
/* état FR24 de l'avion : en vol (bleu) ou posé à la station (vert) */
function regState(v) {
  const r = fr24Rot(v); if (!r) return "";
  if (r.live) return "reg-air";
  return r.arr && !r.dep ? "reg-in" : "";
}
/* rotation FR24 de la ligne : le vol en cours vers la station (ETA) prime ; sinon l'atterrissage à la station pendant le shift
   (ou dans les 12 h avant) et le décollage de la station qui suit. Les vols plus anciens (nuit passée…) sont ignorés. */
function fr24Rot(v) {
  const f = v.fr24; if (!f) return null;
  const st = stationIata(), [a, b] = shiftWindow(v.ho), ms = iso => { const x = Date.parse(iso || ""); return isNaN(x) ? null : x; };
  const r = { arr: null, dep: null, live: !!f.live };
  if (f.live && f.live.to === st) { r.arr = { ms: ms(f.live.eta), fl: f.live.flight || "", eta: true }; return r; }
  const lands = [f.arr && { ms: ms(f.arr.at), fl: f.arr.flight || "" }, f.last && f.last.to === st && { ms: ms(f.last.landed), fl: f.last.flight || "" }]
    .filter(x => x && x.ms != null && x.ms >= a - 12 * 3600000 && x.ms <= b).sort((x, y) => y.ms - x.ms);
  r.arr = lands[0] || null;
  const d = f.dep && ms(f.dep.at);
  if (d != null && (r.arr ? d > r.arr.ms : d >= a && d <= b + 12 * 3600000)) r.dep = { ms: d, fl: f.dep.flight || "" };
  return r;
}
function fr24Times(v) {
  const r = fr24Rot(v); if (!r) return "";
  const hm = x => utcHM(new Date(x).toISOString()) + "Z";
  const arr = r.arr && r.arr.ms != null ? (r.arr.eta ? "ETA " : "") + hm(r.arr.ms) : "", dep = r.dep ? hm(r.dep.ms) : "";
  const fl = [r.arr && r.arr.fl, r.dep && r.dep.fl].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).join(" / ");
  /* valeur non trouvée chez FR24 : en magenta */
  const nf = `<span class="fr-nf" title="${esc(tr("Non trouvé chez Flightradar24"))}">${esc(tr("non trouvé"))}</span>`;
  /* avion pas encore reparti : FR24 ne connaît pas encore le vol retour, ce n'est pas une erreur */
  const dnf = r.arr && !r.dep ? `<span class="muted" title="Flightradar24 only knows a departure once the aircraft has left">DEP not yet known</span>` : nf;
  return `<div class="fr-t" title="${esc(tr("Heures Flightradar24 (réelles, ou estimée en vol)"))}">FR24 ${fl ? esc(fl) : `<span class="fr-nf">${esc(tr("vol ?"))}</span>`} · ${arr ? esc(arr) : nf} / ${dep ? esc(dep) : dnf}</div>${fidsTimes(v)}`;
}
/* ---- FIDS de Ben Gourion (TLV) : lu au clic sur Flightradar24, d'après les n° de vol (FR24 et champ « N° de vol ») ----
   v.fids = { at, arr: { fl, sched, est, status, other }, dep: {…} } ; heures locales (LT) telles que publiées par l'aéroport */
const fidsHM = s => String(s || "").slice(11, 16);
function fidsTimes(v) {
  const f = v.fids; if (!f) return "";
  if (!f.arr && !f.dep) return `<div class="fids-t muted" title="Ben Gurion airport FIDS">FIDS TLV · ${esc((f.tried || []).join(", "))} not listed on the airport FIDS${f.err ? ` (${esc(f.err)})` : " (cargo flights are often not published)"}</div>`;
  const one = (k, x) => { if (!x) return ""; const late = x.est && x.sched && x.est !== x.sched;
    return `${k} ${esc(x.fl)}${x.guess ? ` <span class="muted" title="Next or previous flight number of the same airline, usual for the return leg">(likely)</span>` : ""} <b>${esc(fidsHM(x.est || x.sched))} LT</b>${late ? ` <span class="muted">(sched ${esc(fidsHM(x.sched))})</span>` : ""}${x.status ? ` · ${esc(x.status)}` : ""}`; };
  return `<div class="fids-t" title="Ben Gurion airport FIDS (Israel Airports Authority), local times">FIDS TLV · ${[one("ARR", f.arr), one("DEP", f.dep)].filter(Boolean).join(" / ")}</div>`;
}
/* « 2026-11-19T03:40:00 » heure locale de la station → ms UTC */
function ltMs(s) {
  const guess = Date.parse(String(s).slice(0, 19) + "Z"); if (isNaN(guess)) return null;
  const tz = stationTz(); if (!tz) return guess;
  try { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(guess)).map(x => [x.type, x.value]));
    return guess - (Date.parse(`${p.year}-${p.month}-${p.day}T${String(+p.hour % 24).padStart(2, "0")}:${p.minute}:00Z`) - guess); } catch { return guess; }
}
const fidsNorm = f => { const s = String(f || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), m = s.match(/^([A-Z0-9]{2}[A-Z]?)0*(\d{1,4}[A-Z]?)$/); return m ? m[1] + m[2] : ""; };
async function fidsRun(id, vs) {
  if (stationIata() !== "TLV" || !vs.length) return "";
  const cur = vs.map(v => S.shiftItems.find(x => x.id === v.id) || v);
  const fls = v => { const x = v.fr24 || {}; return [v.flight, x.live && x.live.flight, x.arr && x.arr.flight, x.dep && x.dep.flight, x.last && x.last.flight].map(fidsNorm).filter(Boolean); };
  /* vol retour probable : même compagnie, n° voisin (X6 600 → 601, 5C 102 → 101), utilisé seulement si le départ n'est pas connu autrement */
  const nxt = f => { const m = f.match(/^([A-Z0-9]{2}[A-Z]?)(\d{1,4})$/); return m ? [m[1] + (+m[2] + 1), +m[2] > 1 ? m[1] + (+m[2] - 1) : ""].filter(Boolean) : []; };
  const all = [...new Set(cur.flatMap(v => fls(v).flatMap(f => [f, ...nxt(f)])).filter(Boolean))]; if (!all.length) return "";
  const r = await API.call("POST", "fids/tlv", { flights: all });
  if (r.error) { for (const v of cur) if (fls(v).length) await patch("shiftItems", v.id, { fids: { at: r.at, arr: null, dep: null, tried: fls(v), err: r.error } }); return r.error; }
  const [a, b] = shiftWindow(id);
  let n = 0;
  for (const v of cur) {
    const rows = fls(v).flatMap(fl => (r.items[fl] || []).map(x => Object.assign({ fl }, x))).map(x => Object.assign(x, { ms: ltMs(x.est || x.sched) })).filter(x => x.ms != null && x.ms >= a - 12 * 3600000 && x.ms <= b + 12 * 3600000);
    const pick = dir => rows.filter(x => x.dir === dir).sort((p, q) => Math.abs(p.ms - (a + b) / 2) - Math.abs(q.ms - (a + b) / 2))[0];
    const arr = pick("A");
    let dep = pick("D");
    if (!dep) { const g = [...new Set(fls(v).flatMap(nxt))].flatMap(fl => (r.items[fl] || []).filter(x => x.dir === "D").map(x => Object.assign({ fl, guess: true }, x)))
      .map(x => Object.assign(x, { ms: ltMs(x.est || x.sched) })).filter(x => x.ms != null && x.ms >= (arr ? arr.ms : a - 12 * 3600000) && x.ms <= b + 24 * 3600000).sort((p, q) => p.ms - q.ms);
      dep = g[0]; }
    const slim = x => x ? Object.assign({ fl: x.fl, sched: x.sched, est: x.est, status: x.status, other: x.other }, x.guess ? { guess: true } : {}) : null;
    await patch("shiftItems", v.id, { fids: { at: r.at, arr: slim(arr), dep: slim(dep), tried: [...new Set(fls(v))] } }); if (arr || dep) n++;
  }
  return n;
}

/* ---- Tech Log de l'avion ----
   Chaque ligne d'avion (par shift) porte des tâches, comme un Technical Log : défaut ou tâche à gauche, action à droite.
   tasks[] = { id, text, action, logPage, wo, techs: [{ id: staffId, h: heures }], mhrs (total saisi quand pas d'heures par technicien), from (tâche reprise) }
   Les champs texte planned / done / mhrs de la ligne sont recalculés à l'enregistrement (Charge Sheet, Notion, Sindri). */
const TASK_PRESETS = ["Daily Inspection", "Transit Inspection", "Weekly Inspection", "Arrival Inspection", "Pre-Departure Check"];
const taskPresets = () => { const l = String(settings().taskPresets || "").split("\n").map(x => x.trim()).filter(Boolean); return l.length ? l : TASK_PRESETS; };
const numH = x => { const n = parseFloat(String(x ?? "").replace(",", ".")); return isNaN(n) ? 0 : n; };
const taskH = t => { const s = (t.techs || []).reduce((a, x) => a + numH(x.h), 0); return s || numH(t.mhrs); };
const fmtH = n => n ? String(Math.round(n * 100) / 100) : "";
/* tâches d'une ligne : les anciennes lignes (texte prévu / fait) deviennent une tâche */
const visitTasks = v => Array.isArray(v.tasks) ? v.tasks : (v.planned || v.done ? [{ id: "legacy", text: v.planned || "", action: v.done || "", mhrs: v.mhrs || "" }] : []);
const visitH = v => visitTasks(v).reduce((a, t) => a + taskH(t), 0) || numH(v.mhrs);
/* tâche encodée par Sindri : à vérifier par une personne (case), puis « Vérifié et validé par … » en vert */
const aiTaskPending = id => hoItems(id, "visit").reduce((n, v) => n + visitTasks(v).filter(t => t.ai && !t.ok).length, 0);
function aiTaskChip(v, t) {
  if (!t.ai) return "";
  if (t.ok) return `<div class="ai-ok">✔ ${esc(tr("Vérifié et validé par"))} ${esc(t.ok.by || "")} · ${fmtDT(t.ok.at)}${hoEd(v.ho) ? ` <button type="button" class="linkbtn small" data-a="tl-verify" data-v="${v.id}" data-t="${esc(t.id)}">${esc(tr("annuler"))}</button>` : ""}</div>`;
  return `<div class="ai-todo"><span class="chip sm warn">✦ ${esc(tr("Encodée par Sindri – à vérifier"))}</span>${hoEd(v.ho) ? ` <label class="chk ai-chk" data-a="tl-verify" data-v="${v.id}" data-t="${esc(t.id)}"><input type="checkbox" data-a="tl-verify" data-v="${v.id}" data-t="${esc(t.id)}"> ${esc(tr("J'ai vérifié, c'est validé"))}</label>` : ""}</div>`;
}
ACTIONS["tl-verify"] = async el => {
  const v = S.shiftItems.find(x => x.id === el.dataset.v); if (!v || !hoEd(v.ho)) return;
  const tid = el.dataset.t, t0 = visitTasks(v).find(t => t.id === tid); if (!t0) return;
  const ok = !t0.ok;
  if (ok && !meName()) return;
  const tasks = visitTasks(v).map(t => { if (t.id !== tid) return t; const x = Object.assign({}, t); if (ok) x.ok = { by: meName(), at: new Date().toISOString() }; else delete x.ok; return x; });
  await patch("shiftItems", v.id, { tasks }); render(true);
};
function techLogHtml(v) {
  const ts = visitTasks(v);
  if (!ts.length) return `<span class="muted">—</span>`;
  const taken = new Set(S.shiftItems.filter(x => x.kind === "visit" && x.ho !== v.ho && visitGid(x) === visitGid(v)).flatMap(x => (x.tasks || []).map(t => t.from)).filter(Boolean));
  return `<div class="tl">${ts.map(t => { const meta = [t.logPage ? "LP " + t.logPage : "", t.wo ? "WO " + t.wo : ""].filter(Boolean).join(" · "), who = (t.techs || []).map(x => sName(x.id) + (numH(x.h) ? " " + fmtH(numH(x.h)) + "h" : "")).join(", ");
    return `<div class="tl-row ${t.unc ? "tl-row-unc" : ""} ${t.ai && !t.ok ? "tl-row-ai" : ""}"><div class="tl-d">${aiTaskChip(v, t)}${t.unc ? `<span class="chip sm bad unc-chip">✔ ${esc(tr("Non terminée · passée au shift suivant"))}</span> ` : ""}${t.from && uncSrc(t.from) ? `<span class="chip sm warn">${esc(tr("Reprise du shift précédent"))}</span> ` : ""}${esc(t.text || "—")}${meta ? `<div class="mono muted">${esc(meta)}</div>` : ""}</div>
      <div class="tl-a ${t.action || taken.has(t.id) ? "" : "tl-open"}">${t.action ? esc(t.action) : taken.has(t.id) ? `<span class="muted">${esc(tr("Reprise par un shift suivant"))}</span>` : esc(tr("À faire"))}${who || taskH(t) ? `<div class="muted">${[who ? esc(who) : "", taskH(t) ? `<b>${fmtH(taskH(t))} h</b>` : ""].filter(Boolean).join(" · ")}</div>` : ""}</div></div>`; }).join("")}</div>`;
}

ACTIONS["vo-toggle"] = el => { UI.voOpen = UI.voOpen || new Set(); const g = el.dataset.g; UI.voOpen.has(g) ? UI.voOpen.delete(g) : UI.voOpen.add(g); render(true); };

/* 2. travail prévu / fait par avion */
function shiftVisits(id) {
  const rows = hoItems(id, "visit"), ed = hoEd(id);
  return sec(2, "Travail du shift (prévu et fait)", "Un avion par ligne. Le client est retrouvé par l'immatriculation. La CRS se fait dans AMOS.", (FR24 && FR24.configured && (rows.length || (S.aircraft || []).length) ? `<button class="btn sm" data-a="fr24-track" data-ho="${id}">Flightradar24</button>` : "") + (ed ? `<button class="btn sm primary" data-a="visit-form" data-ho="${id}">Ajouter un avion</button>` : ""),
    (aiTaskPending(id) ? `<div class="banner warn">✦ ${plural(aiTaskPending(id), "tâche")} ${esc(tr("du Tech Log encodée(s) par Sindri : vérifiez chacune et cochez « J'ai vérifié, c'est validé ». Le shift ne peut pas être remis avant."))}</div>` : "") +
    (FR24ERR && rows.length ? `<div class="banner warn">${esc(tr(FR24ERR))}</div>` : "") +
    (rows.length ? `<div class="tablewrap"><table class="visits"><thead><tr><th>Avion</th><th>ARR / DEP (UTC)</th><th>CRS</th><th>Mécanos</th><th>Tech Log : défaut / tâche → action</th><th>MHRS</th><th title="${esc(tr("LogBook n° d'arrivée"))}">LogBook</th></tr></thead>${rows.map(v => { const ck = visitCheck(v), c = clientOfReg(v.reg);
      const other = visitGroup(v).filter(x => x.id !== v.id && hasWork(x)).sort((x, y) => shKey(x.ho).localeCompare(shKey(y.ho)));
      const prev = other.filter(x => shKey(x.ho) < shKey(id)), next = other.filter(x => shKey(x.ho) > shKey(id));
      const span = visitShifts(v), t = visitTimes(v);
      const stay = span.length > 1 ? `<div class="muted small">${esc(tr("Escale"))} : ${t.arr != null ? esc(fmtDate(new Date(t.arr).toISOString().slice(0, 10))) + " " + esc(utcHM(new Date(t.arr).toISOString())) : "?"} → ${t.dep != null ? esc(fmtDate(new Date(t.dep).toISOString().slice(0, 10))) + " " + esc(utcHM(new Date(t.dep).toISOString())) : "?"} UTC · ${esc(plural(span.length, "shift"))}</div>` : "";
      const ghost = (x, i, kind) => `<tr class="vo-other ${i % 2 ? "vo-g2" : "vo-g1"}"><td colspan="2"><div class="vo-lbl"><b class="mono">${esc(v.reg || "")}</b> · ${esc(tr(kind === "prev" ? "Données de shift précédent" : "Données de shift suivant"))}<br>${esc(shiftLabel(x.ho))}</div></td>
        <td class="small">${crsHtml(x, "<br>") || "—"}</td><td class="small">${(x.mech || []).map(s => esc(sName(s))).join("<br>") || "—"}</td>
        <td class="small">${techLogHtml(x)}${x.notes ? `<div class="muted">${esc(x.notes)}</div>` : ""}</td><td class="mono small">${fmtH(visitH(x))}</td><td class="mono small">${esc(x.atl || "")}</td></tr>`;
      /* lignes des autres shifts repliées par défaut ; une pastille montre combien il y en a (↑ précédents, ↓ suivants) */
      const gid = visitGid(v), open = UI.voOpen && UI.voOpen.has(gid);
      const tog = other.length ? `<button type="button" class="vo-tog ${open ? "on" : ""}" data-a="vo-toggle" data-g="${esc(gid)}" title="${esc(tr(open ? "Masquer les données des autres shifts" : "Afficher les données des autres shifts"))}">${open ? "▾" : "▸"} ${esc(tr(plural(other.length, "autre shift", "autres shifts")))} <span class="vo-n">(${[prev.length ? "↑" + prev.length : "", next.length ? "↓" + next.length : ""].filter(Boolean).join(" ")})</span></button>` : "";
      if (!open) { prev.length = 0; next.length = 0; }
      return `<tbody class="vgrp${open ? " multi" : ""}">` + prev.map((x, i) => ghost(x, prev.length - 1 - i, "prev")).join("") + `<tr class="vo-main ${ed ? "click" : ""}" ${ed ? `data-a="visit-form" data-ho="${id}" data-id="${v.id}"` : ""}><td><b class="mono reg vt-reg ${regState(v)}">${esc(v.reg || "")}</b>${tog ? " " + tog : ""} <span class="muted small">${esc(v.acType || "")}</span><div class="muted small">${esc(c ? c.code || c.name : "")}${(v.scans || []).length ? ` · <span title="${esc(tr("Scans dans OneDrive"))}">📎 ${v.scans.length}</span>` : ""}</div>${ck.ok ? "" : `<span class="chip sm ${ck.lvl || "bad"}">${esc(ck.msg)}</span>`}${v.open ? ` <span class="chip sm warn">Non terminé</span>` : ""}</td>
        <td class="mono small"><div class="vt-man"><span class="vt-k">ETA</span> <b>${esc(zHM(v.arr))}</b>${v.arrDate && v.arrDate !== v.ho.slice(0, 10) ? ` <span class="muted">(${esc(fmtDate(v.arrDate))})</span>` : ""} · <span class="vt-k">ETD</span> <b>${esc(zHM(v.dep))}</b>${v.depDate && span.length > 1 ? ` <span class="muted">(${esc(fmtDate(v.depDate))})</span>` : ""}</div>
          <div class="vt-act" title="Actual times: Flightradar24 flight history, or entered by hand"><span class="vt-k">ATA</span> <b>${esc(zHM(v.ata))}</b> · <span class="vt-k">ATD</span> <b>${esc(zHM(v.atd))}</b></div>${fr24Times(v)}${fr24Line(v)}${stay}</td><td class="small">${crsHtml(v, "<br>") || "—"}</td><td class="small">${(v.mech || []).map(s => esc(sName(s))).join("<br>") || "—"}</td>
        <td class="small">${techLogHtml(v)}${v.notes ? `<div class="muted">${esc(v.notes)}</div>` : ""}</td><td class="mono small">${fmtH(visitH(v))}</td><td class="mono small">${esc(v.atl || "")}</td></tr>` + next.map((x, i) => ghost(x, i, "next")).join("") + `</tbody>`; }).join("")}</table></div>`
      : `<div class="pad muted">Aucun avion pour ce shift.</div>`));
}
function staffPick(id, label, sel, list, lead) {
  const it = p => `<label class="chk"><input type="checkbox" value="${p.id}" ${sel.includes(p.id) ? "checked" : ""}> ${esc(p.name)} <span class="muted small">${esc(staffTR(p).filter(r => r.t && r.lic).map(r => trName(r) + " " + r.lic + (r.crs === false ? " " + tr("sans CRS") : "")).join(" · "))}</span></label>`;
  if (lead === undefined) return `<div class="f wide"><span>${label}</span><div class="pick" id="${id}">${list.map(it).join("")}</div></div>`;
  /* CRS : case « CRS in charge » (un seul) ; sa ligne passe en tête et en vert */
  const ord = list.slice().sort((a, b) => (b.id === lead) - (a.id === lead));
  return `<div class="f wide"><span>${label}</span><div class="pick crs-pick" id="${id}">${ord.map(p => `<div class="crs-it${p.id === lead ? " lead" : ""}" data-id="${p.id}">${it(p)}<label class="crs-ic" title="Only one CRS can be in charge"><input type="radio" name="${id}-lead" value="${p.id}" ${p.id === lead ? "checked" : ""}> CRS in charge</label></div>`).join("")}</div></div>`;
}
/* CRS affectés, le CRS in charge en premier et en vert */
const crsOrd = v => { const l = v.crsLead && (v.crs || []).includes(v.crsLead) ? v.crsLead : ""; return (v.crs || []).slice().sort((a, b) => (b === l) - (a === l)); };
const crsHtml = (v, sep) => crsOrd(v).map(s => s === v.crsLead ? `<span class="crs-lead" title="CRS in charge">★ ${esc(sName(s))}</span>` : esc(sName(s))).join(sep);
/* « CRS in charge » : cocher la case coche aussi le CRS ; décocher le CRS retire « in charge » ; la ligne passe en tête et en vert */
function crsLeadUi(m, t) {
  const box = m.querySelector("#vi-crs"), it = t && t.closest(".crs-it"); if (!it) return;
  if (t.type === "radio" && t.checked) { it.querySelector('input[type="checkbox"]').checked = true; box.prepend(it); }
  if (t.type === "checkbox" && !t.checked) { const r = it.querySelector('input[type="radio"]'); if (r) r.checked = false; }
  box.querySelectorAll(".crs-it").forEach(x => x.classList.toggle("lead", !!x.querySelector('input[type="radio"]:checked')));
}
const crsLeadOf = m => { const r = m.querySelector('#vi-crs input[type="radio"]:checked'), crs = picked(m, "vi-crs"), l = r && crs.includes(r.value) ? r.value : "";
  return { crs: crs.sort((a, b) => (b === l) - (a === l)), crsLead: l }; };
const picked = (m, id) => [...m.querySelectorAll(`#${id} input[type="checkbox"]:checked`)].map(i => i.value);
ACTIONS["visit-form"] = el => {
  const v = S.shiftItems.find(i => i.id === el.dataset.id) || { kind: "visit", ho: el.dataset.ho, crs: [], mech: [] };
  const h = hoDoc(v.ho) || {}, [date, sh] = [v.ho.slice(0, 10), v.ho.slice(11)];
  const crew = Array.from(new Set([...onShift(date, sh).map(p => p.id), ...(h.extra || []), ...(v.crs || []), ...(v.mech || [])])).map(staff).filter(Boolean).sort(staffSort);
  const others = staffActive().filter(p => !crew.includes(p)).sort(staffSort);
  const certs = crew.filter(p => (p.licences || []).length || staffTR(p).length);
  const m = modal(`${mHead(v.id ? "Avion · " + esc(v.reg) : "Nouvel avion")}<form><div class="body stack"><div class="fields">
    ${field("vi-reg", "Immatriculation", v.reg, { cls: "mono", ph: "9H-ABC", required: true, autofocus: true })}<datalist id="vi-regs">${(S.aircraft || []).filter(a => a.active !== false).map(a => `<option value="${esc(a.reg)}">${esc([a.acType, a.variant].filter(Boolean).join(" "))}</option>`).join("")}</datalist>${field("vi-ac", "Type d'avion", v.acType || "", { type: "select", options: [["", "—"], ...acTypes().map(t => [t, t])] })}
    ${field("vi-arr", "ETA prévue (UTC)", v.arr, { ph: "14:35", cls: "mono" })}${field("vi-arrd", "Date d'arrivée (UTC)", v.arrDate || "", { type: "date" })}${field("vi-dep", "ETD prévue (UTC)", v.dep, { ph: "17:10", cls: "mono" })}${field("vi-depd", "Date de départ (UTC)", v.depDate || "", { type: "date" })}
    ${field("vi-ata", "ATA (UTC)", v.ata || "", { ph: "14:41", cls: "mono" })}${field("vi-atd", "ATD (UTC)", v.atd || "", { ph: "17:22", cls: "mono" })}
    <div class="hint" id="vi-span" style="grid-column:1/-1"></div>
    ${v.fr24 ? `<div style="grid-column:1/-1">${fr24Times(v) || ""}${fr24Line(v)}<div class="muted small">${esc(tr("Rempli par Flightradar24, vos champs ne sont pas modifiés."))}</div></div>` : ""}
    ${field("vi-flt", "N° de vol / rotation (prévu)", v.flight, { cls: "mono", ph: "Rotation, n° de vol…" })}${field("vi-atl", "LogBook n° d'arrivée", v.atl, { cls: "mono" })}${field("vi-cht", "CHT covers", v.cht)}</div>
    <div class="muted small" id="vi-client"></div>
    ${staffPick("vi-crs", "CRS (affectés à cet avion)", v.crs || [], certs.length ? certs : crew, v.crsLead || "")}${staffPick("vi-mech", "Mécanos / aides", v.mech || [], crew)}
    ${others.length ? `<label class="f">Ajouter quelqu'un qui n'est pas au roster de ce shift<select id="vi-add"><option value="">—</option>${others.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>` : ""}
    <div class="f wide"><span>Tech Log : défauts / tâches et actions</span><div id="vi-carry"></div><div id="vi-tasks" class="tl-ed"></div></div>
    ${field("vi-notes", "Notes", v.notes, { type: "textarea" })}
    <label class="chk"><input type="checkbox" id="vi-open" ${v.open ? "checked" : ""}> Travail non terminé : à reprendre par le shift suivant</label>
    <div class="err" id="vi-warn"></div>${v.id ? odScansHtml(v) : ""}</div>
    <footer>${v.id ? `<div class="left"><button type="button" class="btn danger" data-a="item-del" data-id="${v.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "lg");
  const cur = () => ({ reg: val("vi-reg").toUpperCase(), acType: val("vi-ac"), crs: picked(m, "vi-crs") });
  /* date de départ proposée : première occurrence de l'heure DEP après l'arrivée (23:00 → 05:00 = le lendemain) ; modifiable */
  let depTouched = !!v.depDate, arrTouched = !!v.arrDate;
  const times = () => ({ ho: v.ho, arr: val("vi-arr"), dep: val("vi-dep"), arrDate: val("vi-arrd"), depDate: val("vi-depd"), fr24: v.fr24 });
  const spanUpd = () => {
    /* date d'arrivée proposée : l'heure ETA placée dans le shift (03:35Z sur la nuit du 20 = le 21) ; modifiable */
    if (!arrTouched) { const t = visitTimes(Object.assign(times(), { arrDate: "", depDate: "" })); m.querySelector("#vi-arrd").value = t.arr != null ? new Date(t.arr).toISOString().slice(0, 10) : ""; }
    if (!depTouched) { const t = visitTimes(Object.assign(times(), { depDate: "" })); m.querySelector("#vi-depd").value = t.dep != null ? new Date(t.dep).toISOString().slice(0, 10) : ""; }
    const s = visitShifts(times()); m.querySelector("#vi-span").textContent = s.length > 1 ? tr("L'avion apparaîtra sur") + " " + plural(s.length, "shift") + " : " + s.map(shiftLabel).join(", ") : "";
  };
  m.querySelector("#vi-depd").onchange = () => { depTouched = !!val("vi-depd"); spanUpd(); };
  m.querySelector("#vi-arrd").onchange = () => { arrTouched = !!val("vi-arrd"); spanUpd(); };
  m.querySelector("#vi-arr").oninput = () => { arrTouched = false; spanUpd(); }; m.querySelector("#vi-dep").oninput = spanUpd; spanUpd();
  const upd = () => { const c = clientOfReg(val("vi-reg")); m.querySelector("#vi-client").textContent = c ? tr("Client") + " : " + c.name + (c.code ? " (" + c.code + ")" : "") : "";
    const ck = visitCheck(cur()); m.querySelector("#vi-warn").textContent = ck.ok ? "" : tr(ck.msg); };
  if (v.id) odWire(m, v);
  /* Tech Log : lignes ajoutées à volonté (tâches pré-encodées ou libres) */
  const tasks = visitTasks(v).map(t => Object.assign({}, t, { id: t.id === "legacy" ? uid() : t.id, techs: (t.techs || []).map(x => Object.assign({}, x)) }));
  const crewNow = () => Array.from(new Set([...crew.map(p => p.id), ...picked(m, "vi-crs"), ...picked(m, "vi-mech")])).map(staff).filter(Boolean);
  const $t = m.querySelector("#vi-tasks");
  const drawTasks = () => {
    const tot = tasks.reduce((a, t) => a + taskH(t), 0), people = crewNow();
    $t.innerHTML = tasks.map((t, i) => `<div class="tl-card" data-ti="${i}">
      ${t.ai ? `<div class="${t.ok ? "ai-ok" : "ai-todo"}">${t.ok ? `✔ ${esc(tr("Vérifié et validé par"))} ${esc(t.ok.by || "")}` : `<span class="chip sm warn">✦ ${esc(tr("Encodée par Sindri – à vérifier"))}</span>`} <label class="chk ai-chk"><input type="checkbox" data-k="ok" ${t.ok ? "checked" : ""}> ${esc(tr("J'ai vérifié, c'est validé"))}</label></div>` : ""}
      <div class="tl-2"><label class="f"><span>${esc(tr("Défaut / tâche"))}</span><textarea data-k="text" rows="2">${esc(t.text || "")}</textarea></label>
        <label class="f"><span>${esc(tr("Action / travail fait"))}</span><textarea data-k="action" rows="2" placeholder="${esc(tr("Vide = à faire"))}">${esc(t.action || "")}</textarea></label></div>
      <div class="row-g wrap tl-meta"><label class="f"><span>LogPage n°</span><input class="mono" data-k="logPage" value="${esc(t.logPage || "")}"></label><label class="f"><span>WO n°</span><input class="mono" data-k="wo" value="${esc(t.wo || "")}"></label>
        <div class="f tl-techs"><span>${esc(tr("Techniciens et MHRS"))}</span><div class="row-g wrap">${(t.techs || []).map((x, j) => `<span class="tl-tech">${esc(sName(x.id))} <input class="mono" data-tj="${j}" value="${esc(x.h ?? "")}" placeholder="h" inputmode="decimal"> <button type="button" class="x" data-tdel="${j}" aria-label="${esc(tr("Retirer"))}">×</button></span>`).join("")}
          <select data-tadd><option value="">+ ${esc(tr("technicien"))}</option>${people.filter(p => !(t.techs || []).some(x => x.id === p.id)).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>
          ${(t.techs || []).some(x => numH(x.h)) ? "" : `<label class="tl-tot">${esc(tr("ou total"))} <input class="mono" data-k="mhrs" value="${esc(t.mhrs || "")}" placeholder="h" inputmode="decimal"></label>`}</div></div>
        <label class="chk tl-eq" title="${esc(tr("Crée une ligne à remplir dans la section 3 · Équipement et matériel"))}"><input type="checkbox" data-k="equip" ${t.equip ? "checked" : ""}> ${esc(tr("Équipement utilisé"))}</label>
        <label class="chk tl-unc ${t.unc ? "on" : ""}" title="${esc(tr("La tâche passe au shift suivant : section 1 et Tech Log de l'avion"))}"><input type="checkbox" data-k="unc" ${t.unc ? "checked" : ""}> ${esc(tr("Uncompleted maintenance task – to hand over"))}</label>
        <button type="button" class="btn sm danger tl-del" data-tidel="${i}">${esc(tr("Retirer"))}</button></div></div>`).join("") +
      `<div class="row-g wrap tl-add"><button type="button" class="btn sm" data-tnew="">+ ${esc(tr("Ligne"))}</button>${taskPresets().map(p => `<button type="button" class="btn sm" data-tnew="${esc(p)}">+ ${esc(p)}</button>`).join("")}
        <span class="muted small" style="margin-left:auto">${esc(tr("Total MHRS"))} : <b>${fmtH(tot) || "0"}</b></span></div>`;
  };
  $t.addEventListener("input", e => { const c = e.target.closest("[data-ti]"); if (!c) return; const t = tasks[+c.dataset.ti];
    if (e.target.dataset.k === "ok") { if (e.target.checked) t.ok = { by: meName(), at: new Date().toISOString() }; else delete t.ok; drawTasks(); return; }
    if (e.target.dataset.k === "equip") t.equip = e.target.checked; else if (e.target.dataset.k === "unc") { t.unc = e.target.checked; e.target.closest(".tl-unc").classList.toggle("on", t.unc); } else if (e.target.dataset.k) t[e.target.dataset.k] = e.target.value; else if (e.target.dataset.tj != null) t.techs[+e.target.dataset.tj].h = e.target.value;
    if (e.target.dataset.tj != null || e.target.dataset.k === "mhrs") { const b = $t.querySelector(".tl-add b"); if (b) b.textContent = fmtH(tasks.reduce((a, x) => a + taskH(x), 0)) || "0"; } });
  $t.addEventListener("change", e => { if (e.target.matches("[data-tadd]") && e.target.value) { const t = tasks[+e.target.closest("[data-ti]").dataset.ti]; t.techs = [...(t.techs || []), { id: e.target.value, h: "" }]; drawTasks(); }
    if (e.target.dataset.tj != null) drawTasks(); });
  $t.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; const c = b.closest("[data-ti]");
    if (b.dataset.tnew != null) { tasks.push({ id: uid(), text: b.dataset.tnew, action: "", logPage: "", wo: "", techs: [] }); drawTasks(); const ta = $t.querySelectorAll(".tl-card textarea"); if (ta.length) ta[b.dataset.tnew ? ta.length - 1 : ta.length - 2].focus(); }
    /* garde-fou : retirer une ligne du Tech Log demande une confirmation */
    else if (b.dataset.tidel != null) { const t = tasks[+b.dataset.tidel];
      b.outerHTML = `<span class="tl-sure"><b>${esc(tr("Êtes-vous sûr de vouloir retirer cette ligne ?"))}</b>${t.text ? ` <span class="muted">(${esc(t.text.slice(0, 40))})</span>` : ""} <button type="button" class="btn sm" data-tino>${esc(tr("Non"))}</button> <button type="button" class="btn sm danger" data-tiyes="${b.dataset.tidel}">${esc(tr("Oui, retirer"))}</button></span>`; }
    else if (b.dataset.tiyes != null) { tasks.splice(+b.dataset.tiyes, 1); drawTasks(); }
    else if (b.dataset.tino != null) drawTasks();
    else if (b.dataset.tdel != null && c) { tasks[+c.dataset.ti].techs.splice(+b.dataset.tdel, 1); drawTasks(); } });
  /* tâches restées sans action sur les shifts précédents de l'escale : à reprendre ici */
  const drawCarry = () => {
    const before = v.id || v.visitId ? visitGroup(v).filter(x => x.id !== v.id && shKey(x.ho) < shKey(v.ho)) : [];
    const later = S.shiftItems.filter(x => x.kind === "visit" && v.id !== x.id && (x.visitId || x.id) === visitGid(v)).flatMap(x => visitTasks(x).map(t => t.from)).filter(Boolean);
    const open = before.flatMap(x => visitTasks(x).filter(t => t.id !== "legacy" && t.text && !t.action && !later.includes(t.id) && !tasks.some(y => y.from === t.id)).map(t => [x, t]));
    m.querySelector("#vi-carry").innerHTML = open.length ? `<div class="banner warn small"><b>${esc(tr("Tâches ouvertes des shifts précédents"))}</b>${open.map(([x, t]) => `<div class="row-g wrap"><span>${esc(t.text)} <span class="muted">· ${esc(shiftLabel(x.ho))}</span></span><button type="button" class="btn sm" data-carry="${t.id}">${esc(tr("Reprendre"))}</button></div>`).join("")}</div>` : "";
    m.querySelectorAll("[data-carry]").forEach(b => b.onclick = () => { const t = open.find(([, y]) => y.id === b.dataset.carry)[1]; tasks.push({ id: uid(), text: t.text, action: "", logPage: t.logPage || "", wo: t.wo || "", techs: [], from: t.id }); drawTasks(); drawCarry(); });
  };
  drawTasks(); drawCarry();
  m.querySelector("#vi-mech").onchange = drawTasks;
  m.querySelector("#vi-reg").setAttribute("list", "vi-regs");
  m.querySelector("#vi-reg").oninput = () => { const ac = aircraftOf(val("vi-reg")); if (ac && ac.acType && !val("vi-ac")) m.querySelector("#vi-ac").value = ac.acType; upd(); }; m.querySelector("#vi-ac").onchange = upd; m.querySelector("#vi-crs").onchange = e => { crsLeadUi(m, e.target); upd(); drawTasks(); }; upd();
  const add = m.querySelector("#vi-add");
  if (add) add.onchange = () => { const p = staff(add.value); if (!p) return; for (const box of ["vi-crs", "vi-mech"]) m.querySelector("#" + box).insertAdjacentHTML("beforeend", `<label class="chk"><input type="checkbox" value="${p.id}"> ${esc(p.name)}</label>`); add.querySelector(`option[value="${p.id}"]`).remove(); add.value = ""; };
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const c = clientOfReg(val("vi-reg")), reg = val("vi-reg").toUpperCase();
    const dup = hoItems(v.ho, "visit").find(x => x.id !== v.id && normReg(x.reg) === normReg(reg));
    if (dup && !m.dataset.dupOk) { const w = m.querySelector("#vi-warn");
      w.innerHTML = `<div class="banner warn">${esc(tr("Cet avion est déjà dans ce shift. Est-ce une erreur, ou un autre vol ?"))}<div class="row-g wrap" style="margin-top:6px"><button type="button" class="btn sm" data-dupx>${esc(tr("C'est une erreur"))}</button><button type="button" class="btn sm primary" data-dupok>${esc(tr("Autre vol : enregistrer"))}</button></div></div>`;
      w.querySelector("[data-dupx]").onclick = () => closeModal();
      w.querySelector("[data-dupok]").onclick = () => { m.dataset.dupOk = "1"; m.querySelector("form").requestSubmit(); }; return; }
    if (["vi-arr", "vi-dep", "vi-ata", "vi-atd"].some(k => val(k) && !hmOk(val(k)))) { m.querySelector("#vi-warn").textContent = tr("Heure invalide : format HH:MM (UTC)."); return; }
    const t = visitTimes(times());
    const arrDate = val("vi-arr") ? (val("vi-arrd") || (t.arr != null ? new Date(t.arr).toISOString().slice(0, 10) : "")) : "";
    const data = Object.assign(strip(v), cur(), { clientId: c ? c.id : "", arr: hmNorm(val("vi-arr")), dep: hmNorm(val("vi-dep")), ata: val("vi-ata") ? hmNorm(val("vi-ata")) : "", atd: val("vi-atd") ? hmNorm(val("vi-atd")) : "", arrDate, depDate: val("vi-dep") ? val("vi-depd") : "", flight: val("vi-flt"), atl: val("vi-atl"), cht: val("vi-cht"), ...crsLeadOf(m),
      mech: picked(m, "vi-mech"), notes: val("vi-notes"), open: m.querySelector("#vi-open").checked, order: v.order || Date.now() });
    /* Tech Log : lignes vides retirées ; textes prévu / fait et total MHRS recalculés pour la Charge Sheet, Notion et Sindri */
    const tl = tasks.filter(t => t.text.trim() || t.action.trim()).map(t => Object.assign(t, { text: t.text.trim(), action: (t.action || "").trim(), techs: (t.techs || []).filter(x => x.id) }));
    const line = t => [t.text, t.logPage ? "LP " + t.logPage : "", t.wo ? "WO " + t.wo : ""].filter(Boolean).join(" · ");
    Object.assign(data, { tasks: tl, planned: tl.map(t => "- " + line(t)).join("\n"), done: tl.filter(t => t.action).map(t => "- " + (t.text ? t.text + " : " : "") + t.action).join("\n"), mhrs: fmtH(tl.reduce((a, t) => a + taskH(t), 0)) });
    const id = await save("shiftItems", v.id, data);
    closeModal();
    await visitSync(Object.assign({}, data, { id }));
    await taskEquipSync(Object.assign({}, data, { id }));
    await taskUncSync(Object.assign({}, data, { id }));
    const n = visitShifts(data).length; toast(n > 1 ? tr("Avion enregistré") + " · " + plural(n, "shift") : "Avion enregistré");
  };
};

/* tâche du Tech Log cochée « Équipement utilisé » : une ligne liée (taskId) est créée dans la section 3, à remplir.
   Décochée : la ligne liée est retirée si elle est encore vide. Tant qu'une ligne liée est vide, le shift ne peut pas être remis. */
async function taskEquipSync(v) {
  const want = (v.tasks || []).filter(t => t.equip), have = S.shiftItems.filter(x => x.kind === "equip" && x.visitId === v.id && x.taskId);
  const c = clientOfReg(v.reg);
  for (const t of want) if (!have.some(x => x.taskId === t.id))
    await save("shiftItems", null, { kind: "equip", ho: v.ho, visitId: v.id, taskId: t.id, task: t.text || "", reg: v.reg || "", user: c ? (c.code || c.name).toUpperCase() : "", item: "", qty: "", unit: "", order: Date.now() });
  for (const x of have) { const t = want.find(y => y.id === x.taskId);
    if (!t) { if (!x.item) await remove("shiftItems", x.id); }
    else if ((x.task || "") !== (t.text || "") || (x.reg || "") !== (v.reg || "")) await patch("shiftItems", x.id, { task: t.text || "", reg: v.reg || "" }); }
}
/* tâche cochée « Uncompleted maintenance task – to hand over » : elle passe automatiquement au shift suivant,
   dans la section 1 (ligne todo liée : fromTask) ET dans le Tech Log de l'avion de ce shift (tâche liée : from).
   La ligne d'avion du shift suivant est créée si l'escale n'en a pas encore. Décochée : les copies encore vides sont retirées.
   Quand la tâche reprise reçoit une action, la ligne de la section 1 est cochée faite. */
const uncSrc = tid => S.shiftItems.find(x => x.kind === "visit" && (x.tasks || []).some(t => t.id === tid && t.unc));
async function taskUncSync(v) {
  const nid = hoId(...nextShift(v.ho.slice(0, 10), v.ho.slice(11))), gid = visitGid(v);
  const want = (v.tasks || []).filter(t => t.unc && t.text);
  const todos = S.shiftItems.filter(x => x.kind === "todo" && x.ho === nid && x.fromVisit === v.id);
  let nv = S.shiftItems.find(x => x.kind === "visit" && x.ho === nid && visitGid(x) === gid);
  if (want.length && !nv) {
    const shared = Object.fromEntries(VISIT_SHARED.map(k => [k, v[k] ?? ""]));
    const nidv = await save("shiftItems", null, Object.assign({ kind: "visit", ho: nid, visitId: gid, crs: [], mech: [], tasks: [], order: v.order || Date.now() }, shared));
    if (!v.visitId) await patch("shiftItems", v.id, { visitId: gid });
    nv = await waitFind("shiftItems", nidv) || { id: nidv, ho: nid, tasks: [] };
  }
  if (nv) {
    let nt = visitTasks(nv).filter(t => t.id !== "legacy").map(t => Object.assign({}, t)), ch = false;
    for (const t of want) { const c = nt.find(y => y.from === t.id);
      if (!c) { nt.push({ id: uid(), text: t.text, action: "", logPage: t.logPage || "", wo: t.wo || "", techs: [], from: t.id }); ch = true; }
      else if (!c.action && c.text !== t.text) { c.text = t.text; ch = true; } }
    const drop = nt.filter(y => y.from && !y.action && !(y.techs || []).length && (v.tasks || []).some(t => t.id === y.from && !t.unc));
    if (drop.length) { nt = nt.filter(y => !drop.includes(y)); ch = true; }
    if (ch) { const line = t => [t.text, t.logPage ? "LP " + t.logPage : "", t.wo ? "WO " + t.wo : ""].filter(Boolean).join(" · ");
      await patch("shiftItems", nv.id, { tasks: nt, planned: nt.map(t => "- " + line(t)).join("\n") }); }
  }
  for (const t of want) { const x = todos.find(y => y.fromTask === t.id), note = [t.action ? tr("Fait jusqu'ici") + " : " + t.action : "", t.logPage ? "LP " + t.logPage : "", t.wo ? "WO " + t.wo : ""].filter(Boolean).join(" · ");
    if (!x) await save("shiftItems", null, { kind: "todo", ho: nid, reg: v.reg || "", text: t.text, note, unc: true, fromVisit: v.id, fromTask: t.id, visitRef: nv ? nv.id : "", order: Date.now() });
    else if (x.text !== t.text || (x.note || "") !== note || x.reg !== (v.reg || "")) await patch("shiftItems", x.id, { text: t.text, note, reg: v.reg || "" }); }
  for (const x of todos) if (!want.some(t => t.id === x.fromTask) && !x.done) await remove("shiftItems", x.id);
  /* tâches reprises de ce shift qui ont reçu une action : la ligne de la section 1 du shift est faite */
  for (const t of (v.tasks || []).filter(t => t.from && t.action)) for (const x of S.shiftItems.filter(y => y.kind === "todo" && y.ho === v.ho && y.fromTask === t.from && !y.done)) await patch("shiftItems", x.id, { done: true });
}
const equipTodo = id => hoItems(id, "equip").filter(x => x.taskId && !String(x.item || "").trim());

/* 3. équipement et matériel */
function shiftEquip(id) {
  const rows = hoItems(id, "equip"), ed = hoEd(id);
  return sec(3, "Équipement et matériel", "Équipements et consommables utilisés, par client ou utilisateur.", ed ? `<button class="btn sm" data-a="equip-form" data-ho="${id}">Ajouter</button>` : "",
    (equipTodo(id).length ? `<div class="banner warn">${esc(tr("Équipement à renseigner pour"))} ${equipTodo(id).length} ${esc(tr(equipTodo(id).length > 1 ? "tâches" : "tâche"))} ${esc(tr("du Tech Log : le shift ne peut pas être remis tant que ces lignes sont vides."))}</div>` : "") +
    (rows.length ? `<div class="tablewrap"><table><thead><tr><th>Client / utilisateur</th><th>Avion</th><th>Équipement ou matériel</th><th class="r">Quantité</th><th>Remarque</th></tr></thead><tbody>${rows.map(x => `<tr class="${ed ? "click" : ""}" ${ed ? `data-a="equip-form" data-ho="${id}" data-id="${x.id}"` : ""}>
      <td class="mono"><b>${esc(x.user || "")}</b></td><td class="mono">${esc(x.reg || "")}</td><td>${x.taskId && !String(x.item || "").trim() ? `<span class="chip sm bad">${esc(tr("À remplir"))}</span>` : esc(x.item || "")}${x.task ? `<div class="muted small">${esc(tr("Tâche"))} : ${esc(x.task)}</div>` : ""}</td><td class="r num">${esc(x.qty ?? "")} ${esc(x.unit || "")}</td><td class="small">${esc(x.note || "")}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="pad muted">Rien de noté.</div>`));
}
ACTIONS["equip-form"] = el => {
  const x = S.shiftItems.find(i => i.id === el.dataset.id) || { kind: "equip", ho: el.dataset.ho, qty: 1 };
  const users = Array.from(new Set(["CHALLENGE", ...S.clients.map(c => c.code).filter(Boolean), ...S.shiftItems.filter(i => i.kind === "equip").map(i => i.user).filter(Boolean)]));
  const items = Array.from(new Set([...S.products.filter(p => ["materiel", "autre"].includes(p.kind)).map(p => p.name), ...S.shiftItems.filter(i => i.kind === "equip").map(i => i.item).filter(Boolean)]));
  const m = modal(`${mHead(x.id ? "Équipement et matériel" : "Nouvel équipement ou matériel")}<form><div class="body"><div class="fields">
    <label class="f">Client / utilisateur<input id="eq-user" class="mono" list="eq-users" value="${esc(x.user || "")}" required></label><datalist id="eq-users">${users.map(u => `<option value="${esc(u)}">`).join("")}</datalist>
    ${x.task ? `<div class="hint wide" style="grid-column:1/-1">${esc(tr("Lié à la tâche du Tech Log"))} : <b>${esc(x.task)}</b></div>` : ""}${field("eq-reg", "Avion (si applicable)", x.reg, { cls: "mono" })}
    <label class="f wide">Équipement ou matériel<input id="eq-item" list="eq-items" value="${esc(x.item || "")}" required></label><datalist id="eq-items">${items.map(u => `<option value="${esc(u)}">`).join("")}</datalist>
    ${field("eq-qty", "Quantité", x.qty, { type: "number", step: "0.01" })}${field("eq-unit", "Unité", x.unit, { ph: "EA, HR…" })}${field("eq-note", "Remarque", x.note, { wide: true })}</div></div>
    <footer>${x.id ? `<div class="left"><button type="button" class="btn danger" data-a="item-del" data-id="${x.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); await save("shiftItems", x.id, Object.assign(strip(x), { user: val("eq-user").toUpperCase(), reg: val("eq-reg").toUpperCase(), item: val("eq-item"), qty: +val("eq-qty") || 0, unit: val("eq-unit"), note: val("eq-note"), order: x.order || Date.now() })); closeModal(); };
};

/* 4. Station Control */
function shiftChecks(id, h) {
  const ed = hoEd(id), ck = h.checks || {};
  const miss = stationChecks().filter(c => !ck[c]).length;
  return sec(4, "Station Control", "Contrôles de fin de shift.", "",
    `${miss && !(h.out && h.out.at) ? `<div class="banner warn">${esc(tr("Tous les contrôles doivent être cochés avant de remettre le shift."))} (${miss} ${esc(tr(miss > 1 ? "restants" : "restant"))})</div>` : ""}<div class="pad stack"><div class="ho-checks">${stationChecks().map((c, i) => { const x = ck[c]; return `<label class="chk"><input type="checkbox" data-hock="${esc(c)}" data-ho="${id}" ${x ? "checked" : ""} ${ed ? "" : "disabled"}> ${esc(c)}${x ? ` <span class="muted small">· ${esc(x.by || "")} ${fmtDT(x.at)}</span>` : ""}</label>`; }).join("")}</div>
    ${field("ho-ckn", "Remarque Station Control", h.checkNote, { type: "textarea" })}</div>`);
}
async function hoPatch(id, data) {
  const [date, sh] = [id.slice(0, 10), id.slice(11)], h = hoDoc(id);
  if (h) await patch("handovers", id, data); else await save("handovers", id, Object.assign({ date, shift: sh }, data));
}
const meName = () => (ME && ME.name) || tr("Moi");
document.addEventListener("change", e => {
  const t = e.target; if (!t.dataset) return;
  if (t.dataset.hock != null) { const ck = Object.assign({}, hoDoc(t.dataset.ho)?.checks || {}); if (t.checked) ck[t.dataset.hock] = { by: meName(), at: new Date().toISOString() }; else delete ck[t.dataset.hock]; hoPatch(t.dataset.ho, { checks: ck }); }
  if (["ho-ckn", "ho-fm", "ho-add"].includes(t.id) && UI.shift && !hoEd(hoId(...UI.shift))) { toast(tr("Ce shift a été remis : il est verrouillé.")); render(true); return; }
  if (t.id === "ho-ckn") hoPatch(hoId(...UI.shift), { checkNote: t.value.trim() });
  if (t.id === "ho-fm") hoPatch(hoId(...UI.shift), { foreman: t.value });
  if (t.id === "ho-add" && t.value) { const id = hoId(...UI.shift); hoPatch(id, { extra: Array.from(new Set([...(hoDoc(id)?.extra || []), t.value])) }); }
  if (t.id === "shift-date" && t.value) { UI.shift = [t.value, UI.shift[1]]; UI.shiftPinned = true; render(true); }
});

/* 5. manpower et signatures */
function shiftCrew(id, date, sh, h) {
  const ed = hoEd(id), ros = onShift(date, sh), extra = (h.extra || []).map(staff).filter(Boolean).filter(p => !ros.includes(p));
  const crew = [...ros, ...extra].sort(staffSort), fms = crew.filter(p => ["lead", "foreman"].includes(p.function));
  const others = staffActive().filter(p => !crew.includes(p)).sort(staffSort);
  const nxt = nextShift(date, sh);
  return sec(5, "Manpower et signatures", "Personnel du shift d'après le roster. La signature confirme la remise du shift, pas un travail sur avion.", "",
    `<div class="pad stack"><div class="fields">${field("ho-fm", "Shift Foreman", h.foreman || (fms[0] && fms[0].id) || "", { type: "select", options: [["", "—"], ...crew.map(p => [p.id, p.name])] })}
      ${ed && others.length ? `<label class="f">Ajouter au shift<select id="ho-add"><option value="">—</option>${others.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>` : ""}</div>
    <div class="tablewrap"><table><thead><tr><th>Nom</th><th>Fonction</th><th>Qualifications</th><th></th></tr></thead><tbody>${crew.map(p => { const x = rcell(p.id, date); return `<tr><td><b>${esc(p.name)}</b></td><td class="small">${esc(STAFF_FN[p.function] || "")}</td><td>${ratingChips(p)}</td>
      <td class="small">${extra.includes(p) ? `<span class="chip sm">Ajouté</span>${ed ? ` <button class="x" data-a="ho-rm" data-id="${p.id}" aria-label="Retirer">×</button>` : ""}` : x && rcode(x.c).k === "custom" ? esc(cellTxt(x)) : ""}</td></tr>`; }).join("") || `<tr><td colspan="4" class="muted">Personne au roster pour ce shift.</td></tr>`}</tbody></table></div>
    <div class="ho-sum"><div class="row-sb"><b>${esc(tr("Résumé du shift"))}</b>${ed && !readOnly ? `<span class="row-g">${typeof AI !== "undefined" || SERVER ? `<button class="btn sm" data-a="ho-sum" data-ai="1">✦ ${esc(tr(h.summary?.text ? "Refaire avec Sindri" : "Rédiger avec Sindri"))}</button>` : ""}<button class="btn sm" data-a="ho-sum">${esc(tr(h.summary?.text ? "Modifier" : "Écrire"))}</button></span>` : ""}</div>
      ${h.summary?.text ? `<div class="pre">${esc(h.summary.text)}</div><div class="small muted">${h.summary.ai ? `✦ ${esc(tr("Brouillon de Sindri, relu et validé par"))}` : esc(tr("Écrit par"))} ${esc(h.summary.by || "")} · ${fmtDT(h.summary.at)} · ${esc(tr("envoyé avec la page Notion"))}</div>`
        : `<div class="small muted">${esc(tr("Quelques lignes pour le shift suivant : Sindri peut proposer un brouillon à partir du shift, vous le relisez avant de l'enregistrer."))}</div>`}</div>
    <div class="row-g wrap ho-sign"><div class="panel pad"><b>Remis par</b><div>${h.out?.at ? `${esc(h.out.by)} · ${fmtDT(h.out.at)}` : `<span class="muted">Pas encore</span>`}</div>${ed && !h.out?.at ? `<button class="btn sm" data-a="ho-sign" data-k="out" ${prevBlock(id) ? `disabled title="${esc(tr("Le shift précédent n'est pas encore remis et repris."))}"` : ""}>Je remets le shift</button>` : ""}</div>
      <div class="panel pad"><b>Repris par</b> <span class="muted small">(${esc(shiftName(...nxt))})</span><div>${h.in?.at ? `${esc(h.in.by)} · ${fmtDT(h.in.at)}` : `<span class="muted">Pas encore</span>`}</div>${!readOnly && h.out?.at && !h.in?.at ? `<button class="btn sm primary" data-a="ho-sign" data-k="in" ${prevBlock(id) ? `disabled title="${esc(tr("Le shift précédent n'est pas encore remis et repris."))}"` : ""}>Je reprends le shift</button>` : ""}</div>
      ${canReopenShift() && (h.out?.at || h.in?.at) && !readOnly ? `<button class="linkbtn small" data-a="ho-unsign">Annuler les signatures</button>` : ""}</div></div>`);
}
/* résumé du shift : brouillon de Sindri (facultatif), toujours relu et enregistré par une personne */
ACTIONS["ho-sum"] = async el => {
  const id = hoId(...UI.shift), h = hoDoc(id) || {};
  const m = modal(`${mHead(esc(tr("Résumé du shift")) + " · " + esc(shiftName(...UI.shift)))}<form><div class="body">
    <div id="hs-msg"></div>${field("hs-text", "Résumé (relisez et corrigez avant d'enregistrer)", h.summary?.text || "", { type: "textarea", wide: true })}
    <div class="hint">${esc(tr("La CRS reste dans AMOS : le résumé ne dit jamais qu'un avion est remis en service."))}</div></div>
    <footer><button type="button" class="btn" data-a="hs-ai">✦ ${esc(tr("Proposer avec Sindri"))}</button><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">${esc(tr("J'ai relu : enregistrer"))}</button></footer></form>`, "lg");
  m.querySelector("#hs-text").rows = 9;
  let fromAi = !!h.summary?.ai;
  const draft = async () => {
    const box = m.querySelector("#hs-msg"); box.innerHTML = `<div class="banner info small">✦ ${esc(tr("Sindri rédige le brouillon…"))}</div>`;
    try { const r = await API.call("POST", "assistant/shift-summary", { ho: id, lang: UI_LANG === "fr" ? "fr" : "en" }); m.querySelector("#hs-text").value = r.text || ""; fromAi = true;
      box.innerHTML = `<div class="banner warn small">${esc(tr("Brouillon de Sindri : vérifiez chaque ligne avant d'enregistrer."))}</div>`; }
    catch (e) { box.innerHTML = `<div class="banner bad small">${esc(tr(e.message || "Sindri n'a pas pu répondre."))}</div>`; }
  };
  m.querySelector("[data-a=hs-ai]").onclick = e => { e.stopPropagation(); draft(); };
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); const t = val("hs-text").trim();
    await hoPatch(id, { summary: t ? { text: t, by: meName(), at: new Date().toISOString(), ai: fromAi } : null }); closeModal(); render(true); toast(t ? "Résumé enregistré" : "Résumé retiré"); };
  if (el.dataset.ai && SERVER && API) draft();
};
ACTIONS["hs-ai"] = () => { };
ACTIONS["ho-rm"] = el => { const id = hoId(...UI.shift); hoPatch(id, { extra: (hoDoc(id)?.extra || []).filter(x => x !== el.dataset.id) }); };
ACTIONS["ho-sign"] = el => {
  const id = hoId(...UI.shift), k = el.dataset.k, open = hoItems(id, "visit").filter(v => !visitCheck(v).ok).length;
  /* garde-fou : un équipement coché dans le Tech Log doit être renseigné avant de remettre le shift */
  const pb = prevBlock(id);
  if (pb) { modal(`${mHead(tr("Shift pas encore remis"))}<div class="body">${esc(tr("Le shift précédent"))} <b>${esc(shiftLabel(pb))}</b> ${esc(tr("doit d'abord être remis et repris."))}</div><footer><button class="btn primary" data-close>OK</button></footer>`, "sm"); return; }
  /* et tous les contrôles Station Control (section 4) doivent être cochés */
  const eq = equipTodo(id), ck = (hoDoc(id) || {}).checks || {}, miss = stationChecks().filter(c => !ck[c]), aiN = aiTaskPending(id);
  if (k === "out" && (eq.length || miss.length || aiN)) { modal(`${mHead(tr("Shift pas encore remis"))}<div class="body stack">
    ${aiN ? `<div>✦ ${plural(aiN, "tâche")} ${esc(tr("du Tech Log encodée(s) par Sindri à vérifier et valider (section 2) :"))}</div><ul>${hoItems(id, "visit").flatMap(v => visitTasks(v).filter(t => t.ai && !t.ok).map(t => `<li><b class="mono">${esc(v.reg || "")}</b> · ${esc(t.text || "")}</li>`)).join("")}</ul>` : ""}
    ${eq.length ? `<div>${esc(tr("Équipement à renseigner (section 3) pour :"))}</div><ul>${eq.map(x => `<li><b class="mono">${esc(x.reg || "")}</b> · ${esc(x.task || "")}</li>`).join("")}</ul>` : ""}
    ${miss.length ? `<div>${esc(tr("Station Control à cocher (section 4) :"))}</div><ul>${miss.map(c => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}</div><footer><button class="btn primary" data-close>OK</button></footer>`, "sm"); return; }
  confirmBox(`${k === "out" ? "Remettre" : "Reprendre"} le shift ${esc(shiftName(...UI.shift))} au nom de ${esc(meName())} ?${open && k === "out" ? `<div class="banner warn small" style="margin-top:8px">${plural(open, "avion")} sans CRS qualifié affecté.</div>` : ""}`,
    async () => { await hoPatch(id, { [k]: { by: meName(), at: new Date().toISOString() } }); render(true); }, k === "out" ? "Remettre" : "Reprendre");
};
ACTIONS["ho-unsign"] = () => confirmBox("Annuler les signatures de ce shift ?", async () => { await hoPatch(hoId(...UI.shift), { out: null, in: null }); render(true); }, "Annuler les signatures");
ACTIONS["shift-go"] = el => { UI.shiftPinned = true; UI.shift = (+el.dataset.n < 0 ? prevShift : nextShift)(...(UI.shift || currentShift())); render(true); };
ACTIONS["shift-sh"] = el => { UI.shiftPinned = true; UI.shift = [(UI.shift || currentShift())[0], el.dataset.sh]; render(true); };
ACTIONS["shift-now"] = () => { UI.shiftPinned = false; UI.shift = currentShift(); render(true); };
/* page ouverte au changement de shift (08:00 / 20:00 heure de la station) : on passe au nouveau shift en cours,
   sauf si l'utilisateur regarde volontairement un autre shift */
setInterval(() => { try { if (!UI.shift || UI.shiftPinned || document.getElementById("modal-root")?.innerHTML) return; const c = currentShift();
  if (c[0] !== UI.shift[0] || c[1] !== UI.shift[1]) { UI.shift = c; if (/^#shift/.test(location.hash)) render(true); } } catch { } }, 60000);

/* ---- tableau de bord ---- */
WIDGETS.shift_now = { h: 8, t: "Shift en cours", ic: "✈", c: "blue", m: "shift", size: "m", d: "Avions du shift en cours, travail non terminé, CRS manquants.",
  r() { const [d, sh] = currentShift(), id = hoId(d, sh), vs = hoItems(id, "visit"), todo = hoItems(id, "todo").filter(x => !x.done), bad = vs.filter(v => !visitCheck(v).ok);
    return `<div class="w-stats">${wStat(vs.length, "avions")}${wStat(todo.length, "non terminés", todo.length ? "warn" : "")}${wStat(bad.length, "sans CRS qualifié", bad.length ? "bad" : "")}</div>
      <div class="w-list">${vs.slice(0, 5).map(v => `<div class="list-row"><span><b class="mono">${esc(v.reg)}</b> <span class="muted small">${esc(v.acType || "")} · ${esc(zHM(v.arr))}/${esc(zHM(v.dep))} UTC</span></span><span class="small">${(v.crs || []).map(s => esc(sName(s))).join(", ")}</span></div>`).join("") || wEmpty("Aucun avion pour ce shift.")}</div>${wLink("shift", "Ouvrir le shift")}`; },
  go() { UI.shiftPinned = false; UI.shift = currentShift(); } };

/* ---- Flightradar24 (facultatif : clé de l'offre API FR24 ; sans clé, les heures se saisissent à la main) ---- */
let FR24 = null;
async function fr24Status() { if (!SERVER || !API || !ME) return null; if (FR24) return FR24; try { FR24 = await API.call("GET", "fr24/status"); } catch { FR24 = { configured: false }; } return FR24; }
const utcHM = iso => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const zHM = t => t ? t + "Z" : "—";   /* heure saisie en UTC, affichée avec son repère */
function fr24Line(v) {
  const f = v.fr24; if (!f) return "";
  const st = stationIata(), L = f.live, P = f.last;
  let t = "";
  if (L) t = `En vol ${L.from || "?"} → ${L.to || "?"}${L.eta ? " · ETA " + utcHM(L.eta) + "Z" : ""}`;
  else if (P && P.landed) t = `Atterri ${utcHM(P.landed)}Z${P.to ? " à " + P.to : ""}${P.from ? " (de " + P.from + ")" : ""}`;
  else if (P && P.takeoff) t = `Parti ${utcHM(P.takeoff)}Z${P.from ? " de " + P.from : ""}${P.to ? " vers " + P.to : ""}`;
  else t = "Aucun vol depuis 72 h (FR24 ne donne pas les vols prévus)";
  return `<div class="small ${L && st && L.to && L.to !== st ? "txt-warn" : "muted"}" title="Flightradar24 · ${esc(fmtDT(f.at))}">FR24 · ${esc(tr(t))}</div>`;
}
/* heure locale de la station → instant UTC (ms) */
function stationUtc(date, hour) {
  const tz = stationTz(), guess = Date.parse(`${date}T${pad(hour)}:00:00Z`);
  if (!tz) return new Date(`${date}T${pad(hour)}:00:00`).getTime();
  try { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(guess)).map(x => [x.type, x.value]));
    const asLocal = Date.parse(`${p.year}-${p.month}-${p.day}T${pad(+p.hour % 24)}:${p.minute}:00Z`); return guess - (asLocal - guess); } catch { return guess; }
}
/* fenêtre UTC d'un shift (jour 08-20, nuit 20-08 heure locale) */
const shiftWindow = id => { const d = id.slice(0, 10), night = id.slice(11) === "night", a = stationUtc(d, night ? 20 : 8); return [a, a + 12 * 3600000]; };
/* clic sur Flightradar24 : les avions du shift, plus ceux de la section Avions ; un avion suivi qui vole vers la station
   et n'est pas encore dans le shift y est ajouté (ligne créée automatiquement). La mise à jour automatique ne crée rien. */
async function fr24Run(id, quiet, create = !quiet) {
  let vs = hoItems(id, "visit").filter(v => v.reg);
  const isCur = id === hoId(...currentShift());   // les avions ne sont ajoutés que dans le shift en cours
  const fleet = !create || !isCur ? [] : (S.aircraft || []).filter(a => a.active !== false && a.reg && !vs.some(v => normReg(v.reg) === normReg(a.reg)));
  if (!vs.length && !fleet.length) { if (!quiet) toast("Aucune immatriculation dans ce shift."); return; }
  const r = await API.call("POST", "fr24/track", { regs: [...vs.map(v => v.reg), ...fleet.map(a => a.reg)], station: stationIata() });
  const key = s => String(s || "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const added = [];
  /* avion suivi à ajouter : en vol vers la station, ou posé à la station pendant ce shift et pas encore reparti */
  for (const a of fleet) { const x = r.items[key(a.reg)]; if (!x) continue;
    const rot = fr24Rot({ ho: id, fr24: x }), inbound = x.live && x.live.to === stationIata(), here = !x.live && rot && rot.arr && !rot.dep;
    if (!inbound && !here) continue;
    const c = acClient(a), nid = await save("shiftItems", null, { kind: "visit", ho: id, reg: normReg(a.reg), acType: a.acType || "", clientId: c ? c.id : "", crs: [], mech: [], auto: "fr24", order: Date.now() });
    added.push(a.reg); vs = [...vs, { id: nid, reg: a.reg }]; }
  let found = 0, filled = 0;
  for (const v of vs) { const x = r.items[key(v.reg)]; if (!x) continue; if (x.live || x.last) found++;
    if (x.arr || x.dep) filled++;
    const fr24 = Object.assign({ at: r.at }, x.live ? { live: x.live } : {}, x.last ? { last: x.last } : {}, x.arr ? { arr: x.arr } : {}, x.dep ? { dep: x.dep } : {});
    /* ATA / ATD : heures réelles de l'historique Flightradar24 (atterrissage / décollage), seulement si rien n'est saisi à la main */
    const cur = S.shiftItems.find(y => y.id === v.id) || v, rot = fr24Rot({ ho: id, fr24 }), act = {};
    if (rot && rot.arr && !rot.arr.eta && rot.arr.ms != null && !cur.ata) act.ata = utcHM(new Date(rot.arr.ms).toISOString());
    if (rot && rot.dep && rot.dep.ms != null && !cur.atd) act.atd = utcHM(new Date(rot.dep.ms).toISOString());
    await patch("shiftItems", v.id, Object.assign({ fr24 }, act)); }
  FR24ERR = (r.errors || []).join(" · ");
  let fidsN = "";
  try { fidsN = await fidsRun(id, vs); } catch (e) { fidsN = e.message; }   // le FIDS ne bloque jamais Flightradar24
  if (!quiet) toast(FR24ERR ? tr(FR24ERR) : `Flightradar24 : ${found} avion${found > 1 ? "s" : ""} sur ${vs.length} avec un vol récent${filled ? `, heures connues pour ${filled}` : ""}.` + (added.length ? " " + tr("Ajouté(s) au shift, en vol vers la station") + " : " + added.join(", ") : fleet.length ? " " + tr("Avions suivis vérifiés") + " : " + fleet.length + ", " + tr("aucun en route vers la station ni posé.") : "") + (typeof fidsN === "number" ? ` FIDS TLV : ${fidsN} ${fidsN > 1 ? "flights found" : "flight found"}.` : fidsN ? ` FIDS TLV : ${tr(fidsN)}.` : ""));
  if (quiet && FR24ERR) render(true);
}
let FR24ERR = "";
ACTIONS["fr24-track"] = async el => { el.disabled = true; try { await fr24Run(el.dataset.ho); } catch (e) { toast(tr(e.message)); } el.disabled = false; };
/* shift en cours : le bouton Flightradar24 se lance tout seul toutes les heures (avions du shift + avions suivis en vol vers
   la station ajoutés), tant que l'application est ouverte quelque part. L'heure du dernier passage est partagée (fiche du shift),
   donc deux navigateurs ouverts ne doublent pas les appels (chaque appel consomme des crédits FR24). */
const FR24_EVERY = 60 * 60000;
let fr24Auto = {};
function fr24AutoRun() {
  if (!FR24 || !FR24.configured || readOnly) return;
  const [d, sh] = currentShift(), id = hoId(d, sh), vs = hoItems(id, "visit").filter(v => v.reg);
  if (!vs.length && !(S.aircraft || []).some(a => a.active !== false)) return;
  const last = Math.max(fr24Auto[id] || 0, Date.parse((hoDoc(id) || {}).fr24At) || 0);
  if (Date.now() - last < FR24_EVERY) return;
  fr24Auto[id] = Date.now();
  fr24Run(id, true, true).then(() => hoPatch(id, { fr24At: new Date().toISOString() })).then(() => render(true)).catch(e => { FR24ERR = e.message; render(true); });
}
setInterval(() => { try { if (SERVER && FR24) fr24AutoRun(); } catch { } }, 5 * 60000);
function fr24CardShell() {
  if (!SERVER || !isAdmin()) return "";
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><h3 class="np">Flightradar24</h3><div id="fr24-box"><div class="muted">Chargement…</div></div></div></div>`;
}
async function loadFr24() {
  const box = document.getElementById("fr24-box"); if (!box) return;
  FR24 = null; const s = await fr24Status();
  box.innerHTML = `<div class="small">Suivi des avions du shift par immatriculation (en vol, ETA, atterrissage). Il faut une clé de l'<b>offre API</b> de Flightradar24 (fr24api.flightradar24.com), différente de l'abonnement Premium de l'application. Sans clé, les heures ARR / DEP se saisissent à la main.</div>
    <div class="row-g wrap">${s && s.configured ? `<span class="chip good">Clé enregistrée ${esc(s.hint || "")}</span><button class="btn sm" data-a="fr24-test">Tester</button><button class="btn sm" data-a="fr24-off">Retirer la clé</button>` : `<span class="chip">Non configuré</span>`}
    <input type="password" id="fr24-key" placeholder="${esc(tr("Clé API Flightradar24"))}" autocomplete="off" style="min-width:260px"><button class="btn sm primary" data-a="fr24-save">Enregistrer la clé</button></div>
    ${s && s.configured ? `<div class="row-g wrap"><span class="small">Diagnostic : ce que Flightradar24 répond pour une immatriculation</span><input id="fr24-dreg" class="mono" placeholder="9H-CAC" style="width:120px"><button class="btn sm" data-a="fr24-diag">Diagnostiquer</button></div><pre class="small" id="fr24-dout" style="white-space:pre-wrap;max-height:320px;overflow:auto" hidden></pre>` : ""}`;
}
ACTIONS["fr24-diag"] = async el => {
  const reg = val("fr24-dreg"), out = document.getElementById("fr24-dout"); if (!reg) return;
  el.disabled = true; out.hidden = false; out.textContent = tr("Interrogation de Flightradar24…");
  try { const r = await API.call("POST", "fr24/diag", { reg });
    out.textContent = r.results.map(x => `${x.endpoint}  ${JSON.stringify(x.params)}\n` + (x.ok ? `→ ${x.count} ${tr("résultat(s)")}; ${tr("champs")} : ${x.keys.join(", ")}\n${x.sample.map(s => "  " + JSON.stringify(s)).join("\n")}` : `→ ${tr("erreur")} : ${x.error}`)).join("\n\n"); }
  catch (e) { out.textContent = tr(e.message); }
  el.disabled = false;
};
ACTIONS["fr24-save"] = async () => { const k = val("fr24-key"); if (!k) return; try { await API.call("POST", "fr24/config", { key: k }); toast("Clé Flightradar24 enregistrée"); } catch (e) { toast(tr(e.message)); } loadFr24(); };
ACTIONS["fr24-off"] = () => confirmBox("Retirer la clé Flightradar24 ?", async () => { await API.call("POST", "fr24/config", { key: "" }); loadFr24(); }, "Retirer");
ACTIONS["fr24-test"] = async () => { try { await API.call("POST", "fr24/test", {}); toast("Connexion Flightradar24 OK"); } catch (e) { toast(tr(e.message)); } };

/* ---- Notion : page du handover (sous la page parente choisie dans Paramètres ; jeton gardé sur le serveur) ---- */
let NOTION = null;
async function notionStatus() { if (!SERVER || !API || !ME) return null; if (NOTION) return NOTION; try { NOTION = await API.call("GET", "notion/status"); } catch { NOTION = { configured: false }; } return NOTION; }
ACTIONS["ho-notion"] = el => {
  const id = el.dataset.ho, h = hoDoc(id) || {}, [date, sh] = [id.slice(0, 10), id.slice(11)];
  const crew = Array.from(new Set([...onShift(date, sh).map(p => p.id), ...(h.extra || [])]));
  confirmBox(`${h.notion?.url ? "Renvoyer" : "Envoyer"} le handover ${esc(shiftName(date, sh))} vers Notion ?<div class="muted small" style="margin-top:6px">${esc(tr(h.notion?.url ? "La page déjà envoyée pour ce shift sera remplacée (l'ancienne va dans la corbeille de Notion)." : "Une page est créée sous la page Notion choisie dans Paramètres, avec les 5 sections."))}</div>`, async () => {
    el.disabled = true;
    try { const r = await API.call("POST", "notion/push", { ho: id, crew, checks: stationChecks() }); toast(r.replaced ? "Page Notion remplacée" : "Handover envoyé vers Notion"); }
    catch (e) { toast(tr(e.message)); }
    el.disabled = false;
  }, h.notion?.url ? "Renvoyer" : "Envoyer");
};
function notionCardShell() { return isAdmin() ? `<section class="panel"><div class="pad"><h3>Notion (handover)</h3><div class="muted small">Le handover de chaque shift est écrit sous une seule page Notion, choisie ici. L'outil ne modifie jamais une autre page. Dans Notion : créez une intégration interne, copiez son jeton, puis ajoutez l'intégration à cette page (••• › Connexions).</div></div><div class="pad" id="notion-card"><span class="muted">…</span></div></section>` : ""; }
async function loadNotion() {
  const el = document.getElementById("notion-card"); if (!el) return;
  NOTION = null; const s = await notionStatus();
  el.innerHTML = `<div class="stack"><div class="row-g wrap">${s && s.token ? `<span class="chip good">Jeton enregistré ${esc(s.hint || "")}</span><button class="btn sm" data-a="notion-off">Retirer le jeton</button>` : `<span class="chip">Pas de jeton</span>`}
    <input type="password" id="notion-token" placeholder="${esc(tr("Jeton d'intégration Notion"))}" autocomplete="off" style="min-width:260px"><button class="btn sm primary" data-a="notion-save">Enregistrer le jeton</button></div>
    <div class="row-g wrap"><input id="notion-parent" placeholder="${esc(tr("Lien de la page Notion du handover"))}" value="${esc(s && s.parent ? s.parent : "")}" class="mono" style="min-width:320px"><button class="btn sm" data-a="notion-parent">Enregistrer la page</button>${s && s.configured ? `<button class="btn sm" data-a="notion-test">Tester</button>` : ""}</div></div>`;
}
ACTIONS["notion-save"] = async () => { const k = val("notion-token"); if (!k) return; try { await API.call("POST", "notion/config", { token: k }); toast("Jeton Notion enregistré"); } catch (e) { toast(tr(e.message)); } loadNotion(); };
ACTIONS["notion-parent"] = async () => { try { await API.call("POST", "notion/config", { parent: val("notion-parent") }); toast("Page Notion enregistrée"); } catch (e) { toast(tr(e.message)); } loadNotion(); };
ACTIONS["notion-off"] = () => confirmBox("Retirer le jeton Notion ?", async () => { await API.call("POST", "notion/config", { token: "" }); loadNotion(); }, "Retirer");
ACTIONS["notion-test"] = async () => { try { const r = await API.call("POST", "notion/test", {}); toast(tr("Connexion Notion OK") + " · " + (r.title || "")); } catch (e) { toast(tr(e.message)); } };

/* ---- OneDrive : scans par avion du shift (rangés dans <racine>/<mois>/<date> Day|Night/<immat>) ---- */
let OD = null;
async function odStatus() { if (!SERVER || !API || !ME) return null; if (OD) return OD; try { OD = await API.call("GET", "onedrive/status"); } catch { OD = { configured: false }; } return OD; }
function odScansHtml(v) {
  const list = (v.scans || []).slice().reverse();
  if (!(OD && OD.configured) && !list.length) return "";
  return `<div class="stack od-scans"><b>Scans (OneDrive)</b><div class="row-g wrap">${list.map(f => `<a class="btn sm" href="${esc(f.url)}" target="_blank" rel="noopener" title="${esc((f.by || "") + " · " + fmtDT(f.at))}">${esc(f.name)} ↗</a>`).join("") || `<span class="muted small">Aucun scan.</span>`}
    ${OD && OD.configured && !readOnly ? `<label class="btn sm primary">+ Scanner / joindre<input type="file" id="od-file" accept="application/pdf,image/*" capture="environment" multiple hidden></label>` : ""}</div></div>`;
}
function odWire(m, v) {
  m.querySelector("#od-file")?.addEventListener("change", async e => {
    const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
    for (const f of files) { toast(tr("Envoi vers OneDrive…") + " " + f.name);
      try { await API.postFile("onedrive/upload", f, { item: v.id }); } catch (x) { toast(tr(x.message)); return; } }
    toast(files.length > 1 ? "Scans rangés dans OneDrive" : "Scan rangé dans OneDrive");
    if (API.refresh) await API.refresh();
    setTimeout(() => { const nv = S.shiftItems.find(i => i.id === v.id); const box = document.querySelector(".od-scans"); if (nv && box) { box.outerHTML = odScansHtml(nv); odWire(document.querySelector(".modal"), nv); } }, 400);
  });
}
function odCardShell() { return isAdmin() ? `<section class="panel"><div class="pad"><h3>OneDrive (scans)</h3><div class="muted small">Les scans du shift sont rangés dans le OneDrive Microsoft 365 de la station, sous un seul dossier racine. Dans Entra ID : inscription d'application, permission Files.ReadWrite.All (application) avec consentement administrateur, puis un secret client.</div></div><div class="pad" id="od-card"><span class="muted">…</span></div></section>` : ""; }
async function loadOd() {
  const el = document.getElementById("od-card"); if (!el) return;
  OD = null; const s = await odStatus() || {};
  el.innerHTML = `<div class="stack"><div class="row-g wrap">${s.configured ? `<span class="chip good">Relié</span><button class="btn sm" data-a="od-test">Tester</button>` : `<span class="chip">Non configuré</span>`}${s.secret ? `<span class="chip sm">Secret enregistré</span>` : ""}</div>
    <div class="fields">${field("od-tenant", "Locataire (tenant ID ou domaine)", s.tenant || "", { cls: "mono" })}${field("od-client", "ID d'application (client)", s.clientId || "", { cls: "mono" })}
    <label class="f">Secret client<input type="password" id="od-secret" autocomplete="off" placeholder="${esc(tr(s.secret ? "Laisser vide pour garder le secret actuel" : "Secret client"))}"></label>
    ${field("od-user", "Compte OneDrive (adresse)", s.user || "", { cls: "mono", ph: "station@challenge-technic.com" })}${field("od-root", "Dossier racine des scans", s.root || "", { ph: "Station TLV/Scans" })}</div>
    <div><button class="btn sm primary" data-a="od-save">Enregistrer</button></div></div>`;
}
ACTIONS["od-save"] = async () => {
  const b = { tenant: val("od-tenant"), clientId: val("od-client"), user: val("od-user"), root: val("od-root") }; if (val("od-secret")) b.secret = val("od-secret");
  try { await API.call("POST", "onedrive/config", b); toast("Réglages OneDrive enregistrés"); } catch (e) { toast(tr(e.message)); } loadOd();
};
ACTIONS["od-test"] = async () => { try { const r = await API.call("POST", "onedrive/test", {}); toast(tr("Connexion OneDrive OK") + " · " + (r.drive || "")); } catch (e) { toast(tr(e.message)); } };
