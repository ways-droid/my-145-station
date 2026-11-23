"use strict";
/* ======================= ROSTER =======================
   Planning mensuel comme le « TLV Roster OFFICIAL » : une ligne par personne, une colonne par jour, un code par case.
   Données : un document par personne et par mois, roster/<staffId>_<AAAA-MM> = { staffId, month, days: { "1": { c, start?, end?, note? } } }.
   Codes : liste fixe (libellés modifiables dans l'onglet Codes) + code d'une autre station (3 lettres) = détaché / flight mech.
   Couverture : pour chaque jour et chaque équipe (jour 08-20, nuit 20-08), nombre de personnes présentes qualifiées
   par type d'avion, et nombre avec I (approbation israélienne, requise pour signer les avions 4X-). */
const RCODE_DEF = [
  ["D", "Jour (08-20 LT)", "day", "green"], ["N", "Nuit (20-08 LT)", "night", "blue"], ["D/N", "Jour ou nuit (à affecter)", "pending", "purple"],
  ["C", "Horaire libre", "custom", "teal"], ["T", "Jour de voyage (aller ou retour)", "travel", "orange"], ["TLV", "À la station, sans shift précis", "station", "grey"],
  ["OJT", "Formation sur le terrain (OJT)", "training", "yellow"], ["TRNG", "Formation", "training", "yellow"], ["OFF", "Repos / congé", "off", "white"]];
const RKIND_LBL = { day: "Équipe de jour", night: "Équipe de nuit", pending: "Présent, équipe à affecter", station: "Présent, sans équipe", custom: "Horaire libre", travel: "Voyage", other: "Autre", training: "Formation", off: "Repos", away: "Autre station (détaché / flight mech)" };
const rcodes = () => { const lbl = settings().rosterLabels || {}; return RCODE_DEF.map(([c, l, k, col]) => ({ c, l: lbl[c] || l, k, col })); };
const rcode = c => rcodes().find(x => x.c === c) || (/^[A-Z]{3}$/.test(c || "") ? { c, l: "Détaché · " + c, k: "away", col: "red" } : { c, l: c, k: "other", col: "grey" });
/* mode édition : le roster ne se modifie qu'après l'avoir activé (bouton), avec un cadre très visible jusqu'à ce qu'on le désactive */
const rosterEd = () => isOffice() && !readOnly && !!UI.redit;
window.addEventListener("hashchange", () => { if (UI.redit && !location.hash.startsWith("#roster")) UI.redit = false; });
ACTIONS["roster-edit"] = () => { UI.redit = !UI.redit; if (!UI.redit) UI.rbrush = undefined; render(true); };
const ymOf = d => d.slice(0, 7);
const ymAdd = (ym, n) => addMonths(ym + "-01", n).slice(0, 7);
const ymDays = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
const rosterId = (sid, ym) => `${sid}_${ym}`;
const rosterDoc = (sid, ym) => S.roster.find(r => r.id === rosterId(sid, ym));
const rcell = (sid, date) => (rosterDoc(sid, ymOf(date))?.days || {})[String(+date.slice(8))] || null;
const hh = s => { const m = /^(\d{1,2}):?(\d{2})?$/.exec(s || ""); return m ? +m[1] + (+m[2] || 0) / 60 : null; };
/* équipes couvertes par une case : "day", "night" */
function cellShifts(x) {
  if (!x) return [];
  const k = rcode(x.c).k;
  if (k === "day") return ["day"]; if (k === "night") return ["night"];
  if (k === "custom") { const a = hh(x.start), b = hh(x.end); if (a == null) return []; const end = b == null ? a + 12 : (b <= a ? b + 24 : b), out = [];
    if (Math.min(end, 20) - Math.max(a, 8) >= 4) out.push("day"); if (Math.min(end, 32) - Math.max(a, 20) >= 4 || Math.min(end, 8) - a >= 4) out.push("night"); return out.length ? out : [a >= 8 && a < 20 ? "day" : "night"]; }
  return [];
}
const toAssign = date => rosterStaff().filter(p => rcode(rcell(p.id, date)?.c).k === "pending");
const onShift = (date, sh) => rosterStaff().filter(p => cellShifts(rcell(p.id, date)).includes(sh));
const rated = (p, t) => !!(p.ratings || {})[t];
const hasI = (p, t) => ratingHas(p, t, "I");
const anyI = p => Object.keys(p.ratings || {}).some(t => hasI(p, t));
/* couverture d'un jour : [{ sh, t, n, nI }] ; gap = aucun qualifié sur un type, ou personne avec I */
function coverage(date) {
  const out = [];
  for (const sh of ["day", "night"]) { const ppl = onShift(date, sh);
    for (const t of acTypes()) out.push({ sh, t, n: ppl.filter(p => rated(p, t)).length, nI: ppl.filter(p => hasI(p, t)).length });
    out.push({ sh, t: "I", n: ppl.filter(anyI).length, total: ppl.length }); }
  return out;
}
const planned = date => rosterStaff().some(p => rcell(p.id, date));
function rosterGaps(days = 7) {
  const out = [];
  for (let i = 0; i < days; i++) { const d = addDays(today(), i); if (!planned(d)) continue;
    for (const x of coverage(d)) if (!x.n) out.push({ d, sh: x.sh, t: x.t }); }
  return out;
}
/* stations où le vendredi est chômé (Shabbat) : réglage de la station, sinon déduit du code (aéroports israéliens) */
const FRI_OFF_STATIONS = ["TLV", "ETM", "HFA", "SDV", "VDA", "EIY", "RPN", "MTZ"];
function fridayOff() { const s = settings(); return typeof s.fridayOff === "boolean" ? s.fridayOff : FRI_OFF_STATIONS.includes((s.stationCode || "").toUpperCase()); }
const dayCls = d => { const w = new Date(d + "T12:00:00").getDay(); return w === 0 || w === 6 ? "we" : w === 5 && fridayOff() ? "fri" : ""; };
const SH_LBL = { day: "Jour", night: "Nuit" };
/* contenu d'une case à largeur fixe : un horaire libre s'affiche sur deux lignes (début / fin), le détail reste au survol */
const cellHtml = x => !x ? "" : rcode(x.c).k === "custom" && x.start ? `<span class="rtt">${esc(x.start.replace(":00", ""))}</span><span class="rtt">${esc((x.end || "").replace(":00", ""))}</span>` : esc(x.c.length > 4 ? x.c.slice(0, 4) : x.c);
const cellTxt = x => !x ? "" : rcode(x.c).k === "custom" && x.start ? `${x.start.replace(":00", "")}-${(x.end || "").replace(":00", "")}` : x.c;

VIEWS.roster = {
  render() {
    const tab = curTab("roster", "mois"), ym = UI.rmonth || (UI.rmonth = ymOf(today()));
    const [y, m] = ym.split("-");
    return head("Roster", "Planning de la station : une ligne par personne, un code par jour",
      `<button class="btn" data-a="roster-export">Exporter (Excel)</button>${rosterEd() ? `<button class="btn" data-a="roster-copy" ${dis()}>Reprendre le mois précédent</button>` : ""}${isOffice() && !readOnly ? `<button class="btn ${UI.redit ? "redit-off" : "primary"}" data-a="roster-edit">${UI.redit ? "✓ " + esc(tr("Finish editing")) : "✏️ " + esc(tr("Edit roster"))}</button>` : ""}`,
      `<div class="row-g rnav"><button class="btn sm" data-a="roster-month" data-n="-1" aria-label="Mois précédent">‹</button><b class="rmonth">${MONTHS[+m - 1]}${UI.r2 ? ` ${y !== ymAdd(ym, 1).slice(0, 4) ? y + " " : ""}– ${MONTHS[+ymAdd(ym, 1).slice(5) - 1]} ${ymAdd(ym, 1).slice(0, 4)}` : ` ${y}`}</b><button class="btn sm" data-a="roster-month" data-n="1" aria-label="Mois suivant">›</button>`
        + `<button class="btn sm ${UI.r2 ? "primary" : ""}" data-a="roster-two" title="${esc(tr("Afficher ce mois et le suivant, pour voir le passage d'un mois à l'autre"))}">2 mois</button>`
        + `<button class="btn sm" data-a="roster-month" data-n="0" ${ym === ymOf(today()) ? `style="visibility:hidden" tabindex="-1" aria-hidden="true"` : ""}>Aujourd'hui</button></div>`) +
      tabs("roster", [["mois", "Mois"], ["jour", "Aujourd'hui"], ["fatigue", "Fatigue et repos"], ["codes", "Codes"]]) +
      (UI.redit && rosterEd() ? `<div class="redit-bar" role="status">✏️ ${esc(tr("EDIT MODE ON: every change is saved immediately."))} <button class="btn sm" data-a="roster-edit">${esc(tr("Finish editing"))}</button></div>` : "") +
      `<div class="${UI.redit && rosterEd() ? "redit-on" : ""}">` + ({ mois: rosterMonth, jour: rosterToday, fatigue: rosterFatigue, codes: rosterCodes })[tab]() + `</div>`;
  }
};
function rosterMonth() {
  const ym = UI.rmonth, ppl = rosterStaff().sort(staffSort), ed = rosterEd();
  if (!S.staff.length) return `<div class="panel pad">Ajoutez d'abord les personnes dans <a href="#personnel">Personnel</a>.</div>`;
  const months = UI.r2 ? [ym, ymAdd(ym, 1)] : [ym];
  const dates = months.flatMap(mm => Array.from({ length: ymDays(mm) }, (_, i) => `${mm}-${pad(i + 1)}`)), wd = d => new Date(d + "T12:00:00").getDay();
  const mcls = d => UI.r2 && d.slice(8) === "01" && d.slice(0, 7) !== ym ? " mstart" : "";
  const brush = UI.rbrush;
  const bar = ed ? `<div class="rbar"><span class="muted small">Pinceau :</span>${rcodes().map(c => `<button class="rcode rc-${c.col} ${brush === c.c ? "on" : ""}" data-a="roster-brush" data-c="${esc(c.c)}" title="${esc(tr(c.l))}">${esc(c.c)}</button>`).join("")}
    <button class="rcode rc-red ${brush && /^[A-Z]{3}$/.test(brush) && !rcodes().some(c => c.c === brush) ? "on" : ""}" data-a="roster-brush" data-c="?" title="${esc(tr("Autre station (détaché / flight mech)"))}">${brush && /^[A-Z]{3}$/.test(brush) && !rcodes().some(c => c.c === brush) ? esc(brush) : "XXX"}</button>
    <button class="rcode rc-white ${brush === "" ? "on" : ""}" data-a="roster-brush" data-c="" title="${esc(tr("Effacer"))}">⌫</button>
    <span class="muted small">${brush != null ? "Cliquez ou glissez sur les cases pour appliquer. Cliquez à nouveau sur le code pour arrêter." : "Choisissez un code puis cliquez ou glissez sur les cases. Sans code choisi, un clic ouvre le détail de la case."}</span></div>` : "";
  const cov = dates.map(d => planned(d) ? coverage(d) : null);
  const fat = typeof fatMap === "function" ? fatMap(ppl, dates[0], dates[dates.length - 1]) : {};
  const covRows = ["day", "night"].flatMap(sh => [...acTypes(), "I"].map(t => `<tr class="rcov"><th class="rname small">${SH_LBL[sh]} · ${t === "I" ? "I (4X-)" : esc(t)}</th>${cov.map(c => { if (!c) return `<td></td>`; const x = c.find(z => z.sh === sh && z.t === t);
    return `<td class="${x.n ? "" : "gap"}${mcls(dates[cov.indexOf(c)])}" title="${esc(x.n + " " + (t === "I" ? tr("avec I") : tr("qualifiés")))}">${x.n}</td>`; }).join("")}</tr>`)).join("");
  const view = `<div class="rbar rview"><label class="chk line small"><input type="checkbox" data-a="roster-col" ${UI.rcol ? "checked" : ""}> ${esc(tr("Griser toute la colonne des week-ends"))}${fridayOff() ? esc(tr(" et vendredis")) : ""}</label>
    ${fridayOff() ? `<label class="small row-g">${esc(tr("Vendredi"))} <input type="range" id="r-fri" min="0" max="100" step="5" value="${UI.rfri}" style="width:110px" aria-label="${esc(tr("Intensité du moucheté du vendredi"))}"></label>` : ""}</div>`;
  return `${bar}${view}<div class="panel"><div class="tablewrap rwrap"><table class="roster ${brush != null ? "painting" : ""}" style="--fri-a:${(UI.rfri / 100 * 0.6).toFixed(3)}"><thead><tr><th class="rname">Nom</th>${dates.map(d => `<th class="${dayCls(d)}${mcls(d)} ${d === today() ? "today" : ""}"${mcls(d) ? ` title="${esc(MONTHS[+d.slice(5, 7) - 1])}"` : ""}><span>${["S", "M", "T", "W", "T", "F", "S"][wd(d)]}</span>${+d.slice(8)}${mcls(d) ? `<em class="rmlbl">${esc(MONTHS[+d.slice(5, 7) - 1].slice(0, 3))}</em>` : ""}</th>`).join("")}</tr></thead><tbody>
    ${ppl.map(p => `<tr><th class="rname"><a href="#" data-a="staff-open" data-id="${p.id}">${esc(p.name)}</a><div class="muted small">${esc([STAFF_FN[p.function], Object.entries(p.ratings || {}).map(([t, l]) => t.replace(/^B/, "") + " " + l).join(" · ")].filter(Boolean).join(" · "))}</div></th>
      ${dates.map(d => { const x = rcell(p.id, d), c = x ? rcode(x.c) : null; const fa = (fat[p.id] || {})[d]; return `<td class="rc ${c ? "rc-" + c.col : ""}${x && x.duty ? " rd-" + x.duty : ""} ${UI.rcol ? dayCls(d) : ""}${mcls(d)} ${d === today() ? "today" : ""}${fa ? " rfat" : ""}" data-rc="${p.id}|${d}" title="${esc([c ? tr(c.l) + (x.note && isOffice() ? " · " + x.note : "") : "", x && x.duty && typeof DUTY !== "undefined" ? DUTY[x.duty].l : "", x && (rcode(x.c).k === "custom" || x.c.length > 4) ? cellTxt(x) : "", ...(fa || []).map(a => "⚠ " + a)].filter(Boolean).join("\n"))}">${cellHtml(x)}${x && x.note ? "<i class=\"rnote\"></i>" : ""}</td>`; }).join("")}</tr>`).join("")}
    ${covRows}<tr class="rcov"><th class="rname small">D/N à affecter</th>${dates.map((d, i) => { const k = cov[i] ? toAssign(d).length : 0; return `<td class="${k ? "todo" : ""}">${k || ""}</td>`; }).join("")}</tr></tbody></table></div><div class="pad hint">Couverture : nombre de personnes présentes qualifiées sur le type, par équipe. En rouge : personne de qualifié (ou personne avec I pour signer les 4X-). Les autorisations de signer restent dans AMOS.</div></div>`;
}
function rosterToday() {
  const d = today(), cov = coverage(d);
  const list = sh => { const ppl = onShift(d, sh).sort(staffSort);
    return `<div class="panel pad stack"><h3>${sh === "day" ? "Équipe de jour (08-20 LT)" : "Équipe de nuit (20-08 LT)"}</h3>${ppl.map(p => { const x = rcell(p.id, d); return `<div class="list-row click" data-a="staff-open" data-id="${p.id}"><span><b>${esc(p.name)}</b><div class="muted small">${esc(STAFF_FN[p.function] || "")}</div></span><span>${ratingChips(p)} ${rcode(x.c).k === "custom" ? `<span class="chip">${esc(cellTxt(x))}</span>` : ""}</span></div>`; }).join("") || `<div class="muted">Personne de prévu.</div>`}
      <div class="row-g wrap">${cov.filter(x => x.sh === sh).map(x => `<span class="chip ${x.n ? "good" : "bad"}">${x.t === "I" ? "I (4X-)" : esc(x.t)} : ${x.n}</span>`).join("")}</div></div>`; };
  const pend = toAssign(d).sort(staffSort);
  const away = rosterStaff().map(p => [p, rcell(p.id, d)]).filter(([, x]) => x && !cellShifts(x).length && rcode(x.c).k !== "pending").sort((a, b) => staffSort(a[0], b[0]));
  return `${pend.length ? `<div class="banner warn">${plural(pend.length, "personne")} en D/N aujourd'hui, équipe à affecter : ${pend.map(p => esc(p.name)).join(", ")}</div>` : ""}<div class="grid2 grid-even">${list("day")}${list("night")}</div>${away.length ? `<div class="panel pad stack" style="margin-top:16px"><h3>Hors équipe aujourd'hui</h3>${away.map(([p, x]) => `<div class="list-row"><span>${esc(p.name)}</span><span class="rcode rc-${rcode(x.c).col}">${esc(x.c)}</span><span class="muted small">${esc(tr(rcode(x.c).l))}</span></div>`).join("")}</div>` : ""}`;
}
function rosterCodes() {
  const ed = isAdmin() && !readOnly;
  return `<form class="panel" id="f-rcodes"><div class="tablewrap"><table><thead><tr><th>Code</th><th>Libellé</th><th>Compte comme</th></tr></thead><tbody>
    ${rcodes().map(c => `<tr><td><span class="rcode rc-${c.col}">${esc(c.c)}</span></td><td>${ed ? `<input class="rc-lbl" data-c="${esc(c.c)}" value="${esc(c.l)}">` : esc(c.l)}</td><td class="muted">${esc(RKIND_LBL[c.k])}</td></tr>`).join("")}
    <tr><td><span class="rcode rc-red">LGG</span></td><td class="muted">Code de 3 lettres d'une autre station</td><td class="muted">${RKIND_LBL.away}</td></tr>
    </tbody></table></div>${ed ? `<div class="pad"><button class="btn primary">Enregistrer les libellés</button></div>` : ""}</form>`;
}
document.addEventListener("submit", async e => {
  if (e.target.id !== "f-rcodes") return; e.preventDefault();
  const lbl = {}; e.target.querySelectorAll(".rc-lbl").forEach(i => { const def = RCODE_DEF.find(x => x[0] === i.dataset.c); if (i.value.trim() && i.value.trim() !== def[1]) lbl[i.dataset.c] = i.value.trim(); });
  await saveSettings({ rosterLabels: lbl }); toast("Libellés enregistrés");
});

/* ---- saisie ---- */
async function rosterSet(changes) {   /* changes : [[staffId, date, cell|null]] */
  const by = {};
  for (const [sid, d, x] of changes) { const k = rosterId(sid, ymOf(d)); (by[k] = by[k] || { sid, ym: ymOf(d), set: {} }).set[String(+d.slice(8))] = x; }
  for (const [id, g] of Object.entries(by)) {
    const days = Object.assign({}, rosterDoc(g.sid, g.ym)?.days || {});
    for (const [k, x] of Object.entries(g.set)) { if (x) days[k] = x; else delete days[k]; }
    await save("roster", id, { staffId: g.sid, month: g.ym, days });
  }
}
/* affichage (préférences de ce navigateur) : colonne entière grisée ou seulement l'en-tête, intensité du moucheté du vendredi */
try { UI.rcol = localStorage.getItem("st-rcol") !== "0"; UI.rfri = +(localStorage.getItem("st-rfri") ?? 40); } catch (e) { UI.rcol = true; UI.rfri = 40; }
if (isNaN(UI.rfri)) UI.rfri = 40;
ACTIONS["roster-col"] = el => { UI.rcol = el.checked; try { localStorage.setItem("st-rcol", UI.rcol ? "1" : "0"); } catch (e) {} render(true); };
document.addEventListener("input", e => { if (e.target.id !== "r-fri") return; UI.rfri = +e.target.value; const t = document.querySelector("table.roster"); if (t) t.style.setProperty("--fri-a", (UI.rfri / 100 * 0.6).toFixed(3)); try { localStorage.setItem("st-rfri", String(UI.rfri)); } catch (x) {} });
ACTIONS["roster-two"] = () => { UI.r2 = !UI.r2; try { localStorage.setItem("st-roster2", UI.r2 ? "1" : ""); } catch (e) {} render(true); };
try { UI.r2 = localStorage.getItem("st-roster2") === "1"; } catch (e) {}
ACTIONS["roster-month"] = el => { const n = +el.dataset.n; UI.rmonth = n ? ymAdd(UI.rmonth || ymOf(today()), n) : ymOf(today()); render(true); };
ACTIONS["roster-brush"] = el => {
  let c = el.dataset.c;
  if (c === "?") {
    const m = modal(`${mHead("Autre station")}<form><div class="body">${field("rb-st", "Code de la station (3 lettres)", "", { ph: "LGG", cls: "mono", required: true, autofocus: true })}<div class="hint">Pour un jour détaché ou flight mech dans une autre station.</div></div>
      <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Choisir</button></footer></form>`, "sm");
    m.querySelector("form").onsubmit = ev => { ev.preventDefault(); const v = val("rb-st").toUpperCase(); if (!/^[A-Z]{3}$/.test(v)) { toast("Code de station : 3 lettres, ex. LGG."); return; } closeModal(); UI.rbrush = v; render(true); };
    return;
  }
  UI.rbrush = UI.rbrush === c ? undefined : c; render(true);
};
let rPaint = null;
const brushCell = () => UI.rbrush ? Object.assign({ c: UI.rbrush }, rcode(UI.rbrush).k === "custom" ? { start: "06:00", end: "18:00" } : {}) : null;
function paintTd(td) {
  if (!rPaint || rPaint.has(td.dataset.rc)) return;
  rPaint.add(td.dataset.rc); const x = brushCell(), c = x && rcode(x.c);
  td.className = `rc ${c ? "rc-" + c.col : ""} painted`; td.textContent = cellTxt(x);
}
document.addEventListener("pointerdown", e => {
  const td = e.target.closest && e.target.closest("td[data-rc]"); if (!td || UI.rbrush == null || !rosterEd()) return;
  e.preventDefault(); rPaint = new Set(); paintTd(td);
});
document.addEventListener("pointerover", e => { if (!rPaint) return; const td = e.target.closest && e.target.closest("td[data-rc]"); if (td) paintTd(td); });
document.addEventListener("pointerup", async () => {
  if (!rPaint) return; const keys = [...rPaint]; rPaint = null; const x = brushCell();
  await rosterSet(keys.map(k => { const [sid, d] = k.split("|"); const old = rcell(sid, d); return [sid, d, x ? Object.assign({}, x, old && old.c === x.c ? { start: old.start || x.start, end: old.end || x.end } : {}, old?.note ? { note: old.note } : {}, old?.duty ? { duty: old.duty } : {}) : null]; }));
});
document.addEventListener("click", e => {
  const td = e.target.closest && e.target.closest("td[data-rc]"); if (!td || UI.rbrush != null) return;
  const [sid, d] = td.dataset.rc.split("|"), p = staff(sid), x = rcell(sid, d) || {}, ed = rosterEd();
  if (!p) return;
  const away = x.c && rcode(x.c).k === "away";
  const m = modal(`${mHead(esc(p.name) + " · " + fmtDate(d))}<form><div class="body"><div class="fields">
    ${field("rc-code", "Code", away ? "?" : x.c || "", { type: "select", options: [["", "— (vide)"], ...rcodes().map(c => [c.c, c.c + " · " + tr(c.l)]), ["?", tr("Autre station (détaché / flight mech)")]] })}
    ${field("rc-st", "Code de la station", away ? x.c : "", { ph: "LGG", cls: "mono" })}
    ${field("rc-start", "Début", x.start || "06:00", { type: "time" })}${field("rc-end", "Fin", x.end || "18:00", { type: "time" })}</div>
    ${field("rc-duty", "Duty frame", x.duty || "", { type: "select", options: [["", "— (none)"], ["fm", "✈ Flight mech (black frame)"], ["out", "🏢 Outstation (blue frame)"]] })}
    ${isOffice() ? field("rc-note", "Remarque (visible du bureau seulement)", x.note, { type: "textarea" }) : ""}
    ${typeof rosterCellLinks === "function" ? rosterCellLinks(sid, d, x) : ""}
    ${ed ? `<label class="chk"><input type="checkbox" id="rc-until"> Appliquer jusqu'au <input type="date" id="rc-to" value="${esc(d)}" min="${esc(d)}"></label>` : ""}</div>
    <footer><button type="button" class="btn" data-close>Fermer</button>${ed ? `<button class="btn primary">Enregistrer</button>` : ""}</footer></form>`, "sm");
  const sync = () => { const c = val("rc-code"); m.querySelector("#rc-st").closest("label").style.display = c === "?" ? "" : "none";
    const cu = c && c !== "?" && rcode(c).k === "custom"; m.querySelector("#rc-start").closest("label").style.display = m.querySelector("#rc-end").closest("label").style.display = cu ? "" : "none"; };
  m.querySelector("#rc-code").onchange = sync; sync();
  if (!ed) m.querySelectorAll(".body input,.body select,.body textarea").forEach(i => i.disabled = true);
  m.querySelector("form").onsubmit = async ev => {
    ev.preventDefault();
    let c = val("rc-code"); if (c === "?") { c = val("rc-st").toUpperCase(); if (!/^[A-Z]{3}$/.test(c)) { toast("Code de station : 3 lettres, ex. LGG."); return; } }
    const cell = c ? Object.assign({ c }, rcode(c).k === "custom" ? { start: val("rc-start"), end: val("rc-end") } : {}, val("rc-note") ? { note: val("rc-note") } : {}, val("rc-duty") ? { duty: val("rc-duty") } : {}) : null;
    const to = m.querySelector("#rc-until")?.checked ? val("rc-to") : d, ch = [];
    for (let x2 = d; x2 <= to && ch.length < 370; x2 = addDays(x2, 1)) ch.push([sid, x2, cell]);
    closeModal(); await rosterSet(ch); toast("Roster enregistré");
  };
});
ACTIONS["roster-copy"] = () => {
  const ym = UI.rmonth, prev = ymAdd(ym, -1), n = ymDays(ym), np = ymDays(prev);
  confirmBox(`Reprendre le planning de ${MONTHS[+prev.slice(5) - 1]} jour pour jour dans les cases encore vides de ce mois ?`, async () => {
    const ch = [];
    for (const p of rosterStaff()) { const src = rosterDoc(p.id, prev)?.days || {}, cur = rosterDoc(p.id, ym)?.days || {};
      for (let i = 1; i <= n; i++) if (!cur[i] && src[Math.min(i, np)]) ch.push([p.id, `${ym}-${pad(i)}`, Object.assign({}, src[Math.min(i, np)])]); }
    await rosterSet(ch);
  }, "Reprendre");
};
ACTIONS["roster-export"] = async () => {
  const ym = UI.rmonth, n = ymDays(ym), ppl = rosterStaff().sort(staffSort);
  try { await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"); } catch { toast("Export Excel indisponible pour l'instant."); return; }
  const dates = Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
  const rows = [[tr("Nom"), tr("Fonction"), tr("Licences"), ...acTypes(), ...dates.map(d => +d.slice(8))]];
  for (const p of ppl) rows.push([p.name, STAFF_FN[p.function] || "", licText(p), ...acTypes().map(t => (p.ratings || {})[t] || ""), ...dates.map(d => cellTxt(rcell(p.id, d)))]);
  rows.push([]);
  for (const sh of ["day", "night"]) for (const t of [...acTypes(), "I"]) rows.push([`${tr(SH_LBL[sh])} · ${t === "I" ? "I (4X-)" : t}`, "", "", ...acTypes().map(() => ""), ...dates.map(d => planned(d) ? coverage(d).find(x => x.sh === sh && x.t === t).n : "")]);
  rows.push([]); rows.push([tr("Codes")]); for (const c of rcodes()) rows.push([c.c, tr(c.l)]);
  const ws = window.XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = [{ wch: 26 }, { wch: 14 }, { wch: 10 }, ...acTypes().map(() => ({ wch: 6 })), ...dates.map(() => ({ wch: 5 }))];
  const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, ws, ym);
  const buf = window.XLSX.write(wb, { bookType: "xlsx", type: "array" });
  await offerFile(`roster-${(settings().stationCode || "station").toLowerCase()}-${ym}.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
};

/* ---- tableau de bord ---- */
WIDGETS.roster_today = { h: 8, t: "Équipes du jour", ic: "🗓", c: "blue", m: "roster", size: "m", d: "Qui est de jour et de nuit aujourd'hui, et les trous de couverture des 7 prochains jours.",
  r() { const d = today(), g = rosterGaps(7), names = sh => onShift(d, sh).sort(staffSort).map(p => esc(p.name)).join(", ") || `<span class="muted">${esc(tr("personne"))}</span>`;
    return `<div class="stack small"><div><b>${esc(tr("Jour"))}</b> · ${names("day")}</div><div><b>${esc(tr("Nuit"))}</b> · ${names("night")}</div>
      ${g.length ? `<div class="banner warn small">${plural(g.length, "trou")} de couverture dans les 7 jours : ${g.slice(0, 4).map(x => `${fmtDate(x.d)} ${tr(SH_LBL[x.sh])} ${x.t === "I" ? "I (4X-)" : esc(x.t)}`).join(" · ")}${g.length > 4 ? " …" : ""}</div>` : ""}</div>${wLink("roster", "Ouvrir le roster")}`; },
  go() { UI.tab.roster = "mois"; } };
