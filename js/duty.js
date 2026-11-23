"use strict";
/* ======================= DUTIES : FLIGHT MECH (cadre noir) / OUTSTATION (cadre bleu) =======================
   Case du roster : { c, duty: "fm" | "out" } (c = code de la station du jour, ou D/N…).
   travel/<id> kind "duty" = { duty, staffId, from, to, station, currency, notes,
     out:  { date, from, to, airline, flightNo, dep, arr, pnr, cost }   vol aller (jour T juste avant le cadre)
     back: { … }                                                         vol retour (jour T juste après)
     legs:   [{ date, flightNo, from, to, reg, acType, dep, arr, notes }]  secteurs volés (flight mech) avec l'avion
     hotels: [{ name, city, checkIn, checkOut, conf, cost }]
     taxis:  [{ date, from, to, cost, notes }] }
   Une fiche couvre les jours encadrés, plus le jour T qui les précède ou les suit (aller et retour dans la même fiche).
   Le roster et le module Voyages ouvrent la même fiche. */
const DUTY = { fm: { l: "Flight mech", col: "black", ic: "✈" }, out: { l: "Outstation", col: "blue", ic: "🏢" } };
const dutyDocs = () => S.travel.filter(x => x.kind === "duty");
const dutyFor = (sid, d) => dutyDocs().find(x => x.staffId === sid && x.from <= d && d <= x.to && trActive(x));
/* jours encadrés contigus autour d'une date, plus le T avant / après */
function dutyRun(sid, d) {
  const dt = rcell(sid, d)?.duty; let a = d, b = d;
  if (dt) { while (rcell(sid, addDays(a, -1))?.duty === dt) a = addDays(a, -1); while (rcell(sid, addDays(b, 1))?.duty === dt) b = addDays(b, 1); }
  if (rcell(sid, addDays(a, -1))?.c === "T") a = addDays(a, -1);
  if (rcell(sid, addDays(b, 1))?.c === "T") b = addDays(b, 1);
  return [a, b, dt];
}
const dutyStation = (sid, a, b) => { for (let d = a; d <= b; d = addDays(d, 1)) { const c = rcell(sid, d)?.c; if (c && /^[A-Z]{3}$/.test(c) && rcode(c).k === "away") return c; } return ""; };
/* coûts : { "EUR": 120, "USD": 40 } */
const costAdd = (m, v, cur) => { v = +v || 0; if (v) m[cur || "EUR"] = (m[cur || "EUR"] || 0) + v; return m; };
const costTxt = m => Object.entries(m || {}).filter(([, v]) => v).map(([c, v]) => `${Math.round(v * 100) / 100} ${c}`).join(" + ") || "—";

/* ---- fiche ---- */
const DLEG = [["date", "Date", "date"], ["flightNo", "Flight", "mono"], ["from", "From", "mono"], ["to", "To", "mono"], ["reg", "Aircraft reg", "mono"], ["acType", "Type", "mono"], ["dep", "Dep (UTC)", "mono"], ["arr", "Arr (UTC)", "mono"], ["notes", "Notes", ""]];
const DHOT = [["name", "Hotel", ""], ["city", "City", ""], ["checkIn", "Check-in", "date"], ["checkOut", "Check-out", "date"], ["conf", "Confirmation", "mono"], ["cost", "Cost", "num"]];
const DTAX = [["date", "Date", "date"], ["from", "From", ""], ["to", "To", ""], ["cost", "Cost", "num"], ["notes", "Notes", ""]];
const DFLT = [["date", "Date", "date"], ["from", "From", "mono"], ["to", "To", "mono"], ["airline", "Airline", ""], ["flightNo", "Flight", "mono"], ["dep", "Dep (LT)", "mono"], ["arr", "Arr (LT)", "mono"], ["pnr", "PNR", "mono"], ["cost", "Cost", "num"]];
const dInput = (k, t, v, ro) => `<input data-k="${k}" ${t === "date" ? `type="date"` : t === "num" ? `type="number" step="0.01"` : ""} class="${t === "mono" ? "mono" : ""}" value="${esc(v ?? "")}" ${ro ? "disabled" : ""}>`;
const dRow = (cols, r, ro) => `<tr>${cols.map(([k, , t]) => `<td>${dInput(k, t, r[k], ro)}</td>`).join("")}${ro ? "" : `<td><button type="button" class="x" data-a="duty-row-rm" aria-label="${esc(tr("Remove"))}">×</button></td>`}</tr>`;
const dTable = (key, title, cols, rows, ro) => `<div class="dsec"><div class="row-sb"><b>${esc(tr(title))}</b>${ro ? "" : `<button type="button" class="btn sm" data-a="duty-row-add" data-t="${key}">+ ${esc(tr("Add"))}</button>`}</div>
  <div class="tablewrap"><table class="dtab" data-t="${key}"><thead><tr>${cols.map(([, l]) => `<th>${esc(tr(l))}</th>`).join("")}${ro ? "" : "<th></th>"}</tr></thead><tbody>${rows.map(r => dRow(cols, r, ro)).join("")}</tbody></table></div></div>`;
const dFlight = (key, title, f, ro) => `<div class="dsec"><b>${esc(tr(title))}</b><div class="tablewrap"><table class="dtab dflt" data-t="${key}"><thead><tr>${DFLT.map(([, l]) => `<th>${esc(tr(l))}</th>`).join("")}</tr></thead><tbody><tr>${DFLT.map(([k, , t]) => `<td>${dInput(k, t, (f || {})[k], ro)}</td>`).join("")}</tr></tbody></table></div></div>`;
const DCOLS = { legs: DLEG, hotels: DHOT, taxis: DTAX };
ACTIONS["duty-row-add"] = el => { const t = el.dataset.t, tb = el.closest(".dsec").querySelector("tbody"); tb.insertAdjacentHTML("beforeend", dRow(DCOLS[t], t === "legs" ? { date: (tb.querySelector("tr:last-child [data-k=date]") || {}).value || "" } : {}, false)); };
ACTIONS["duty-row-rm"] = el => el.closest("tr").remove();
const dRead = (m, key) => [...m.querySelectorAll(`table[data-t=${key}] tbody tr`)].map(tr => { const o = {}; tr.querySelectorAll("[data-k]").forEach(i => { const v = i.value.trim(); if (v !== "") o[i.dataset.k] = i.type === "number" ? +v : (i.classList.contains("mono") ? v.toUpperCase() : v); }); return o; }).filter(o => Object.keys(o).length);

/* ouvre la fiche d'un jour du roster (la crée d'après le roster si besoin), ou une fiche existante (data-id) */
ACTIONS["duty-open"] = el => {
  let x = el.dataset.id ? S.travel.find(t => t.id === el.dataset.id) : dutyFor(el.dataset.staff, el.dataset.date);
  if (!x) { const [a, b, dt] = dutyRun(el.dataset.staff, el.dataset.date); x = { kind: "duty", duty: dt || el.dataset.duty || "fm", staffId: el.dataset.staff, from: a, to: b, station: dutyStation(el.dataset.staff, a, b), status: "booked", currency: "EUR", legs: [], hotels: [], taxis: [] };
    if (rcell(x.staffId, a)?.c === "T") x.out = { date: a, to: x.station }; if (b !== a && rcell(x.staffId, b)?.c === "T") x.back = { date: b, from: x.station }; }
  dutyForm(x);
};
function dutyForm(x) {
  const ro = readOnly || !isOffice(), p = staff(x.staffId), cur = x.currency || "EUR";
  const m = modal(`${mHead(`${DUTY[x.duty]?.ic || ""} ${esc(tr(DUTY[x.duty]?.l || "Duty"))} · ${esc(p?.name || "?")}`)}<form><div class="body"><fieldset ${ro ? "disabled" : ""} class="plain"><div class="fields">
    ${field("du-type", "Duty", x.duty, { type: "select", options: Object.entries(DUTY).map(([k, v]) => [k, `${v.l} (${v.col} frame)`]) })}
    ${field("du-st", "Station / base", x.station, { cls: "mono", ph: "CGN" })}${field("du-from", "From", x.from, { type: "date", required: true })}${field("du-to", "To", x.to, { type: "date", required: true })}
    ${field("du-cur", "Currency", cur, { type: "select", options: ["EUR", "USD", "ILS"].map(c => [c, c]) })}</div></fieldset>
    ${dFlight("out", "Outbound flight (travel day before)", x.out, ro)}
    ${dTable("legs", x.duty === "out" ? "Flights during the duty" : "Sectors flown (legs) and aircraft", DLEG, x.legs || [], ro)}
    ${dTable("hotels", "Hotels", DHOT, x.hotels || [], ro)}
    ${dTable("taxis", "Taxis / ground transport", DTAX, x.taxis || [], ro)}
    ${dFlight("back", "Return flight (travel day after)", x.back, ro)}
    ${field("du-notes", "Notes", x.notes, { type: "textarea", wide: true })}<div class="err" id="du-err"></div></div>
    <footer><div class="left">${x.id && !ro ? `<button type="button" class="btn danger" data-a="duty-del" data-id="${x.id}">${esc(tr("Delete"))}</button>` : ""}
      ${x.id ? `<button type="button" class="btn" data-a="duty-report" data-id="${x.id}">📄 ${esc(tr(x.duty === "fm" ? "Flight mech report" : "Duty report"))}</button>` : ""}
      <button type="button" class="btn" data-a="duty-roster" data-staff="${esc(x.staffId)}" data-date="${esc(x.from)}">${esc(tr("Show in roster"))}</button></div>
      <button type="button" class="btn" data-close>${esc(tr(ro ? "Close" : "Cancel"))}</button>${ro ? "" : `<button class="btn primary">${esc(tr("Save"))}</button>`}</footer></form>`, "xl");
  if (ro) { m.querySelectorAll("input,select,textarea").forEach(i => i.disabled = true); return; }
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const from = val("du-from"), to = val("du-to"); if (to < from) { m.querySelector("#du-err").textContent = tr("The end date must be after the start date."); return; }
    const one = k => dRead(m, k)[0] || null;
    const d = Object.assign(strip(x), { kind: "duty", duty: val("du-type"), station: val("du-st").toUpperCase(), from, to, currency: val("du-cur"), notes: val("du-notes"),
      out: one("out"), back: one("back"), legs: dRead(m, "legs"), hotels: dRead(m, "hotels"), taxis: dRead(m, "taxis") });
    if (!d.out) delete d.out; if (!d.back) delete d.back;
    await save("travel", x.id, d); closeModal(); toast(tr("Duty sheet saved"));
  };
}
ACTIONS["duty-del"] = el => confirmBox(tr("Delete this duty sheet? The roster frames stay."), async () => { await remove("travel", el.dataset.id); closeModal(); });
ACTIONS["duty-roster"] = el => { closeModal(); UI.rmonth = el.dataset.date.slice(0, 7); location.hash = "#roster"; render(true); };
const dutyCost = x => { const c = x.currency || "EUR", m = {}; costAdd(m, x.out?.cost, c); costAdd(m, x.back?.cost, c); (x.hotels || []).forEach(h => costAdd(m, h.cost, c)); (x.taxis || []).forEach(t => costAdd(m, t.cost, c)); return m; };

/* ---- flight mech report (Excel) ---- */
ACTIONS["duty-report"] = async el => {
  const x = S.travel.find(t => t.id === el.dataset.id); if (!x) return;
  try { await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"); } catch { toast(tr("Excel export unavailable for now.")); return; }
  const p = staff(x.staffId), c = x.currency || "EUR", st = settings();
  const fl = f => f ? [f.date || "", [f.airline, f.flightNo].filter(Boolean).join(" "), f.from || "", f.to || "", f.dep || "", f.arr || "", f.pnr || "", f.cost ? `${f.cost} ${c}` : ""] : ["—"];
  const regs = [...new Set((x.legs || []).map(l => [l.reg, l.acType].filter(Boolean).join(" ")).filter(Boolean))];
  const rows = [[(x.duty === "fm" ? "FLIGHT MECH REPORT" : "OUTSTATION DUTY REPORT") + (st.stationCode ? ` · ${st.stationCode}` : "")], [],
    ["Name", p?.name || ""], ["Function", STAFF_FN[p?.function] || ""], ["Duty", DUTY[x.duty]?.l || ""], ["Station / base", x.station || ""], ["Period", `${x.from} → ${x.to}`], ["Days", daysBetween(x.from, x.to) + 1], ["Aircraft", regs.join(", ")], [],
    ["OUTBOUND", "Flight", "From", "To", "Dep LT", "Arr LT", "PNR", "Cost"], fl(x.out), [],
    ["SECTORS (LEGS)"], ["Date", "Flight", "From", "To", "Aircraft reg", "Type", "Dep UTC", "Arr UTC", "Notes"], ...(x.legs || []).map(l => [l.date || "", l.flightNo || "", l.from || "", l.to || "", l.reg || "", l.acType || "", l.dep || "", l.arr || "", l.notes || ""]), ["Total legs", (x.legs || []).length], [],
    ["RETURN", "Flight", "From", "To", "Dep LT", "Arr LT", "PNR", "Cost"], fl(x.back), [],
    ["HOTELS"], ["Hotel", "City", "Check-in", "Check-out", "Nights", "Confirmation", "Cost"], ...(x.hotels || []).map(h => [h.name || "", h.city || "", h.checkIn || "", h.checkOut || "", h.checkIn && h.checkOut ? daysBetween(h.checkIn, h.checkOut) : "", h.conf || "", h.cost ? `${h.cost} ${c}` : ""]), [],
    ["TAXIS / GROUND TRANSPORT"], ["Date", "From", "To", "Cost", "Notes"], ...(x.taxis || []).map(t => [t.date || "", t.from || "", t.to || "", t.cost ? `${t.cost} ${c}` : "", t.notes || ""]), [],
    ["TOTAL COSTS", costTxt(dutyCost(x))], [], ["Notes", x.notes || ""]];
  const ws = window.XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = [{ wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 30 }];
  const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, ws, "Report");
  await offerFile(`${x.duty === "fm" ? "flight-mech" : "outstation"}-report-${(p?.name || "staff").replace(/\W+/g, "-").toLowerCase()}-${x.from}.xlsx`, new Blob([window.XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
};

/* ---- liens roster ↔ voyages pour une case ---- */
function rosterCellLinks(sid, d, x) {
  const du = dutyFor(sid, d), out = [];
  const nb = !x.duty && !du && x.c === "T" ? [addDays(d, 1), addDays(d, -1)].find(n => rcell(sid, n)?.duty) : null;   // T juste avant / après un cadre : même déplacement
  if (nb) out.push(`<button type="button" class="btn sm" data-a="duty-open" data-staff="${sid}" data-date="${nb}">${DUTY[rcell(sid, nb).duty].ic} ${esc(tr("Create the duty sheet (outbound / return flight included)"))}</button>`);
  else if (x.duty || du) out.push(`<button type="button" class="btn sm" data-a="duty-open" data-staff="${sid}" data-date="${d}" ${du ? `data-id="${du.id}"` : ""} data-duty="${esc(x.duty || "")}">${DUTY[(du || x).duty]?.ic || "✈"} ${esc(tr(du ? "Open the duty sheet" : "Create the duty sheet"))}</button>`);
  if (x.c === "T" && !du && !nb) {
    const fl = trFlights().filter(f => f.staffId === sid && f.date && Math.abs(daysBetween(f.date, d)) <= 1);
    fl.forEach(f => out.push(`<button type="button" class="btn sm" data-a="tr-form" data-id="${f.id}">🛫 ${esc([fmtDate(f.date), `${f.from || "?"} → ${f.to || "?"}`, f.flightNo].filter(Boolean).join(" · "))}</button>`));
    if (!fl.length && isOffice() && !readOnly) out.push(`<button type="button" class="btn sm" data-a="tr-form" data-kind="flight" data-staff="${sid}" data-date="${d}">🛫 ${esc(tr("Create the travel sheet"))}</button>`);
  }
  return out.length ? `<div class="rc-links"><div class="small muted">${esc(tr(du && x.c === "T" ? "Travel day of this duty: outbound / return flights are in the duty sheet." : "Linked sheets"))}</div><div class="row-g wrap">${out.join("")}</div></div>` : "";
}
/* jour T d'un vol dans le roster (affiché dans la fiche vol) */
function travelRosterNote(f) {
  if (!f.staffId || !f.date) return "";
  const ds = [-1, 0, 1].map(n => addDays(f.date, n)), t = ds.find(d => rcell(f.staffId, d)?.c === "T");
  return `<div class="rc-links small">${t ? `✓ ${esc(tr("Roster: travel day (T) on"))} ${fmtDate(t)}` : `⚠ ${esc(tr("No travel day (T) in the roster around this date."))}`} <button type="button" class="linkbtn" data-a="duty-roster" data-staff="${esc(f.staffId)}" data-date="${esc(t || f.date)}">${esc(tr("Show in roster"))}</button></div>`;
}

/* ---- module Voyages : onglets Duties et Costs ---- */
function trDutyList() {
  const past = trPast(), q = UI.q.toLowerCase();
  const rows = dutyDocs().filter(x => (past ? x.to < today() : x.to >= today()) && (!q || [sName(x.staffId), x.station, ...(x.legs || []).map(l => l.reg)].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => past ? b.from.localeCompare(a.from) : a.from.localeCompare(b.from));
  return `<div class="panel">${searchBar("Name, station, aircraft…", [["tous", "Current and upcoming"], ["passe", "Past"]])}
    <div class="tablewrap"><table><thead><tr><th>${esc(tr("Duty"))}</th><th>${esc(tr("Person"))}</th><th>${esc(tr("Station"))}</th><th>${esc(tr("Period"))}</th><th class="r">${esc(tr("Legs"))}</th><th>${esc(tr("Aircraft"))}</th><th class="r">${esc(tr("Costs"))}</th></tr></thead><tbody>${rows.map(x => `<tr class="click" data-a="duty-open" data-id="${x.id}">
      <td><span class="dchip d-${x.duty}">${DUTY[x.duty]?.ic || ""} ${esc(tr(DUTY[x.duty]?.l || ""))}</span></td><td><b>${esc(sName(x.staffId))}</b></td><td class="mono">${esc(x.station || "—")}</td><td class="num small">${fmtDate(x.from)} → ${fmtDate(x.to)}</td>
      <td class="r num">${(x.legs || []).length || ""}</td><td class="mono small">${esc([...new Set((x.legs || []).map(l => l.reg).filter(Boolean))].join(", "))}</td><td class="r num small">${esc(costTxt(dutyCost(x)))}</td></tr>`).join("")}</tbody></table>
      ${rows.length ? "" : `<div class="empty">${esc(tr("No duty sheet. In the roster (edit mode), give days a black (flight mech) or blue (outstation) frame, then open the sheet from a framed day."))}</div>`}</div></div>`;
}
/* récap mensuel des frais par personne : vols, hôtels, taxis (fiches voyage et fiches duty) */
function trCostRows(ym) {
  const by = {}, row = sid => by[sid] || (by[sid] = { sid, fl: {}, ho: {}, tx: {}, n: 0 }), inM = d => (d || "").slice(0, 7) === ym;
  for (const f of trFlights()) if (trActive(f) && inM(f.date)) { costAdd(row(f.staffId).fl, f.cost, f.currency); row(f.staffId).n++; }
  for (const h of trStays()) if (trActive(h) && inM(h.checkIn)) { costAdd(row(h.staffId).ho, h.cost, h.currency); row(h.staffId).n++; }
  for (const x of dutyDocs()) { if (!trActive(x)) continue; const c = x.currency || "EUR", r = () => row(x.staffId);
    for (const f of [x.out, x.back]) if (f && inM(f.date || x.from)) { costAdd(r().fl, f.cost, c); r().n++; }
    for (const h of x.hotels || []) if (inM(h.checkIn || x.from)) { costAdd(r().ho, h.cost, c); r().n++; }
    for (const t of x.taxis || []) if (inM(t.date || x.from)) { costAdd(r().tx, t.cost, c); r().n++; } }
  return Object.values(by).map(r => Object.assign(r, { tot: [r.fl, r.ho, r.tx].reduce((m, x) => { Object.entries(x).forEach(([c, v]) => costAdd(m, v, c)); return m; }, {}) })).sort((a, b) => sName(a.sid).localeCompare(sName(b.sid)));
}
function trCostList() {
  const ym = UI.trMonth || today().slice(0, 7), rows = trCostRows(ym), all = {};
  rows.forEach(r => Object.entries(r.tot).forEach(([c, v]) => costAdd(all, v, c)));
  return `<div class="panel"><div class="row-sb pad"><h3 class="np">${esc(tr("Travel costs per person"))}</h3><div class="row-g"><button class="btn sm" data-a="tr-month" data-n="-1" aria-label="${esc(tr("Previous month"))}">‹</button><b>${esc(fmtMonth(ym))}</b><button class="btn sm" data-a="tr-month" data-n="1" aria-label="${esc(tr("Next month"))}">›</button><button class="btn sm" data-a="tr-cost-xls">${esc(tr("Export (Excel)"))}</button></div></div>
    <div class="tablewrap"><table><thead><tr><th>${esc(tr("Person"))}</th><th class="r">${esc(tr("Flights"))}</th><th class="r">${esc(tr("Hotels"))}</th><th class="r">${esc(tr("Taxis"))}</th><th class="r">${esc(tr("Total"))}</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(sName(r.sid))}</b></td><td class="r num">${esc(costTxt(r.fl))}</td><td class="r num">${esc(costTxt(r.ho))}</td><td class="r num">${esc(costTxt(r.tx))}</td><td class="r num"><b>${esc(costTxt(r.tot))}</b></td></tr>`).join("")}
      ${rows.length ? `<tr class="tot"><td><b>${esc(tr("Total"))}</b></td><td></td><td></td><td></td><td class="r num"><b>${esc(costTxt(all))}</b></td></tr>` : ""}</tbody></table>
      ${rows.length ? "" : `<div class="empty">${esc(tr("No travel cost this month."))}</div>`}</div><div class="pad hint">${esc(tr("Flights by flight date, hotels by check-in date, taxis by date; from the travel sheets and the duty sheets (flight mech / outstation)."))}</div></div>`;
}
ACTIONS["tr-cost-xls"] = async () => {
  const ym = UI.trMonth || today().slice(0, 7);
  try { await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"); } catch { toast(tr("Excel export unavailable for now.")); return; }
  const rows = [["Travel costs " + ym], [], ["Person", "Flights", "Hotels", "Taxis", "Total"], ...trCostRows(ym).map(r => [sName(r.sid), costTxt(r.fl), costTxt(r.ho), costTxt(r.tx), costTxt(r.tot)])];
  const ws = window.XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = [{ wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
  const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, ws, ym);
  await offerFile(`travel-costs-${ym}.xlsx`, new Blob([window.XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
};
