"use strict";
/* ======================= BRIEFING DU SHIFT =======================
   Onglet « Briefing » de la page Shift (et widget du tableau de bord) : tout ce qu'il faut savoir en début de shift,
   sur une page : météo de la station (METAR, TAF, alerte rafales), NOTAM (lien), avions attendus, équipe et licences,
   travail repris du shift précédent, situations ouvertes, besoins urgents, échéances expirées de l'équipe.
   Météo : api/wx.php (aviationweather.gov, cache 10 min). Rafales au-dessus du seuil (Paramètres → gustKt, 45 kt par défaut) :
   bandeau d'alerte en haut de la page Shift, dans les deux onglets. */
const ICAO_OF = { TLV: "LLBG", ETM: "LLER", HFA: "LLHA", SDV: "LLSD", VDA: "LLOV", LGG: "EBLG", BRU: "EBBR", CDG: "LFPG", AMS: "EHAM", FRA: "EDDF", MLA: "LMML" };
const wxIcao = () => String(settings().stationIcao || ICAO_OF[stationIata()] || "").toUpperCase();
const gustLimit = () => Math.max(20, +settings().gustKt || 45);
const notamUrl = () => settings().notamUrl || "https://notams.aim.faa.gov/notamSearch/nsapp.html#/";
let WX = null, WXERR = "", wxBusy = false;
async function wxLoad(force) {
  if (!SERVER || !API || !ME || wxBusy || !wxIcao()) return;
  if (!force && WX && WX.icao === wxIcao() && Date.now() - (WX._got || 0) < 10 * 60000) return;
  wxBusy = true;
  try { WX = await API.call("GET", "wx/brief?icao=" + encodeURIComponent(wxIcao())); WX._got = Date.now(); WXERR = ""; }
  catch (e) { WXERR = e.message || "Météo indisponible pour l'instant."; }
  wxBusy = false; render(true);
}
setInterval(() => { if (["shift", "dashboard", "mur"].includes(route())) wxLoad(); }, 5 * 60000);
const wxGust = () => WX ? Math.max(+(WX.metar && WX.metar.wgst) || 0, +(WX.taf && WX.taf.maxGust) || 0) : 0;
const wxAlert = () => wxGust() > gustLimit();
const wxHM = iso => iso ? utcHM(new Date(iso).toISOString()) : "";
function wxBanner() {
  if (!wxAlert()) return "";
  const g = (WX.taf && WX.taf.gusts || []).filter(x => x.kt > gustLimit()), when = g.map(x => x.from ? `${wxHM(x.from)}–${wxHM(x.to)} UTC` : "").filter(Boolean).join(", ");
  return `<div class="banner bad wx-alert" role="alert">💨 <b>${"Gusts up to"} ${wxGust()} kt</b> ${"at"} ${esc(WX.icao)} (${"limit"} ${gustLimit()} kt)${when ? " · " + "TAF" + " " + esc(when) : ""}${WX.metar && WX.metar.wgst > gustLimit() ? " · " + "now (METAR)" : ""}. ${"Secure stairs, cowlings, doors and ramp equipment."}</div>`;
}
/* ---- METAR in plain English (aviation data stays in English, whatever the UI language) ----
   metarDecode(raw) → [{ ic, k, t, lv: ""|"warn"|"bad" }] ; wxPlain(raw, compact) renders it. The raw line stays shown. */
const MX_WX = { DZ: "drizzle", RA: "rain", SN: "snow", SG: "snow grains", IC: "ice crystals", PL: "ice pellets", GR: "hail", GS: "small hail", UP: "unknown precipitation",
  BR: "mist", FG: "fog", FU: "smoke", VA: "volcanic ash", DU: "dust", SA: "sand", HZ: "haze", PY: "spray", PO: "dust whirls", SQ: "squalls", FC: "funnel cloud / tornado", SS: "sandstorm", DS: "duststorm" };
const MX_DSC = { MI: "shallow", BC: "patches of", PR: "partial", DR: "low drifting", BL: "blowing", SH: "showers of", TS: "thunderstorm with", FZ: "freezing" };
const MX_CLD = { FEW: "Few clouds (1-2/8)", SCT: "Scattered clouds (3-4/8)", BKN: "Broken clouds (5-7/8)", OVC: "Overcast (8/8)", VV: "Sky obscured, vertical visibility" };
const mxPt = d => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8];
const mxKmh = kt => Math.round(kt * 1.852);
function metarDecode(raw) {
  const out = [], tk = String(raw || "").trim().split(/\s+/), add = (ic, k, t, lv = "") => out.push({ ic, k, t, lv });
  const end = tk.findIndex(x => x === "RMK"); const w = end < 0 ? tk : tk.slice(0, end);
  let i = 0; while (i < w.length && /^(METAR|SPECI|COR|AUTO)$/.test(w[i])) i++;
  if (/^[A-Z]{4}$/.test(w[i] || "")) i++;
  const tm = (w[i] || "").match(/^(\d{2})(\d{2})(\d{2})Z$/);
  if (tm) { i++; const d = new Date(); d.setUTCDate(+tm[1]); d.setUTCHours(+tm[2], +tm[3], 0, 0); if (d - Date.now() > 2 * 864e5) d.setUTCMonth(d.getUTCMonth() - 1);
    let lt = ""; try { lt = new Intl.DateTimeFormat("en-GB", { timeZone: stationTz() || undefined, hour: "2-digit", minute: "2-digit" }).format(d); } catch { }
    add("🕒", "Observed", `${tm[2]}:${tm[3]} UTC${lt ? ` (${lt} LT)` : ""}`); }
  const lim = typeof gustLimit === "function" ? gustLimit() : 45;
  let trend = [];
  for (; i < w.length; i++) {
    const x = w[i]; let m;
    if (/^(NOSIG|BECMG|TEMPO)$/.test(x)) { trend = w.slice(i); break; }
    if ((m = x.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/))) {
      const k = m[4] === "MPS" ? 1.944 : 1, sp = Math.round(+m[2] * k), g = m[3] ? Math.round(+m[3] * k) : 0, vr = /^\d{3}V\d{3}$/.test(w[i + 1] || "") ? w[++i] : "";
      const dir = m[1] === "VRB" ? "Variable direction" : `From ${m[1]}° (${mxPt(+m[1])})`;
      add("💨", "Wind", sp === 0 && !g ? "Calm" : `${dir}, ${sp} kt (${mxKmh(sp)} km/h)${g ? `, gusts ${g} kt (${mxKmh(g)} km/h)` : ""}${vr ? `, varying ${vr.replace("V", "° to ")}°` : ""}`,
        g > lim || sp > lim ? "bad" : Math.max(sp, g) >= 25 ? "warn" : ""); continue; }
    if (x === "CAVOK") { add("👁", "Visibility", "10 km or more, no significant cloud, no weather (CAVOK)"); continue; }
    if ((m = x.match(/^(\d{4})(NDV|[NSEW]{1,2})?$/))) { const v = +m[1];
      add("👁", "Visibility", v >= 9999 ? "10 km or more" : v >= 5000 ? `${v / 1000} km` : `${v} m`, v < 800 ? "bad" : v < 3000 ? "warn" : ""); continue; }
    if ((m = x.match(/^(\d+(?:\/\d+)?)SM$/))) { add("👁", "Visibility", `${m[1]} statute miles`); continue; }
    if (/^R\d{2}[LCR]?\//.test(x)) continue;
    if ((m = x.match(/^(-|\+|VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*)$/)) && (m[2] || m[3])) {
      const ph = (m[3].match(/../g) || []).map(c => MX_WX[c]);
      const txt = [m[1] === "-" ? "Light" : m[1] === "+" ? "Heavy" : m[1] === "VC" ? "In the vicinity:" : "", m[2] === "TS" && !ph.length ? "Thunderstorm" : MX_DSC[m[2]] || "", ph.join(" and ")].filter(Boolean).join(" ");
      const bad = m[2] === "TS" || /GR|FC|SQ|VA|SS|DS/.test(m[3]) || m[2] === "FZ", warn = m[1] === "+" || /FG|SN|PL|GS/.test(m[3]);
      add(m[2] === "TS" ? "⚡" : /RA|DZ|SH/.test(x) ? "🌧" : /SN|PL|IC|GR|GS/.test(x) ? "❄" : "🌫", "Weather", txt.charAt(0).toUpperCase() + txt.slice(1) + (m[2] === "TS" ? " – lightning risk: follow the station lightning procedure (refuelling, headsets, outdoor work)" : ""), bad ? "bad" : warn ? "warn" : ""); continue; }
    if ((m = x.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU)?$/))) { const ft = /\d/.test(m[2]) ? (+m[2] * 100).toLocaleString("en-US") + " ft" : "unknown height";
      add("☁", "Clouds", `${MX_CLD[m[1]]} at ${ft}${m[3] === "CB" ? " – cumulonimbus (thunderstorm cloud)" : m[3] === "TCU" ? " – towering cumulus" : ""}`, m[3] === "CB" ? "warn" : ""); continue; }
    if (/^(NSC|NCD|SKC|CLR)$/.test(x)) { add("☁", "Clouds", "No significant cloud"); continue; }
    if ((m = x.match(/^(M?\d{2})\/(M?\d{2})?$/))) { const n = s => s ? (s[0] === "M" ? -+s.slice(1) : +s) : null, t = n(m[1]), d = n(m[2]);
      add("🌡", "Temperature", `${t} °C${d != null ? `, dew point ${d} °C` : ""}${d != null && t - d <= 2 ? " (humid, fog possible)" : ""}`, t >= 38 ? "warn" : t <= 0 ? "warn" : ""); continue; }
    if ((m = x.match(/^Q(\d{4})$/))) { add("📏", "Pressure (QNH)", `${+m[1]} hPa`); continue; }
    if ((m = x.match(/^A(\d{4})$/))) { add("📏", "Pressure (altimeter)", `${(+m[1] / 100).toFixed(2)} inHg`); continue; }
    if ((m = x.match(/^RE(\w+)$/))) { add("ℹ", "Recent weather", m[1]); continue; }
  }
  if (trend.length) add("🔮", "Next 2 hours", trend[0] === "NOSIG" ? "No significant change expected" : `${trend[0] === "TEMPO" ? "Temporarily" : "Becoming"}: ${trend.slice(1).join(" ")}`);
  return out;
}
function wxPlain(raw, compact) {
  const d = metarDecode(raw); if (!d.length) return "";
  const lv = d.some(x => x.lv === "bad") ? "bad" : d.some(x => x.lv === "warn") ? "warn" : "good";
  const sum = `<div class="mx-sum ${lv}">${lv === "bad" ? "⛔ Caution: weather affects ground operations" : lv === "warn" ? "⚠ Watch the weather" : "✅ No weather concern for ground operations"}</div>`;
  if (compact) return sum + `<div class="mx-c">${d.filter(x => x.k !== "Observed").map(x => `<span class="${x.lv}" title="${esc(x.k)}">${x.ic} ${esc(x.t.split(" – ")[0])}</span>`).join("")}</div>`;
  return sum + `<div class="mx">${d.map(x => `<div class="mx-r ${x.lv}"><span class="mx-i">${x.ic}</span><span class="mx-k">${esc(x.k)}</span><span>${esc(x.t)}</span></div>`).join("")}</div>`;
}
function wxPanel() {
  if (!wxIcao()) return `<div class="pad muted">${esc(tr("Code OACI de la station inconnu : renseignez-le dans Paramètres (Station)."))}</div>`;
  if (!WX) return `<div class="pad muted">${esc(WXERR ? tr(WXERR) : tr("Chargement de la météo…"))}</div>`;
  const m = WX.metar, t = WX.taf;
  return `<div class="pad wx">${m ? `${wxPlain(m.raw)}<div class="wx-l"><span class="chip sm">METAR</span> <span class="mono">${esc(m.raw)}</span></div>` : ""}
    ${t ? `<div class="wx-l"><span class="chip sm">TAF</span> <span class="mono pre">${esc(t.raw)}</span></div>` : ""}
    <div class="small muted">${esc(tr("Source : aviationweather.gov"))} · ${fmtDT(WX.at)}${WX.stale ? " · " + esc(tr("dernière version connue")) : ""} · ${esc(tr("Alerte rafales au-dessus de"))} ${gustLimit()} kt
      · <a href="${esc(notamUrl())}" target="_blank" rel="noopener">${esc(tr("NOTAM"))} ${esc(WX.icao)} ↗</a> <span class="muted">(${esc(tr("recherche"))} ${esc(WX.icao)})</span></div></div>`;
}
function shiftBriefing(id, date, sh) {
  const visits = hoItems(id, "visit").slice().sort((a, b) => String(a.arr || "99").localeCompare(String(b.arr || "99")));
  const crew = Array.from(new Set([...onShift(date, sh).map(p => p.id), ...((hoDoc(id) || {}).extra || [])])).map(staff).filter(Boolean).sort(staffSort);
  const todo = hoItems(id, "todo").filter(x => !x.done), pid = hoId(...prevShift(date, sh)), prevTodo = hoItems(pid, "todo").filter(x => !x.done && !todo.some(t => t.from === x.id));
  const sits = typeof sitOpen === "function" ? S.situations.filter(sitOpen).sort(sitSort) : [];
  const needs = typeof ndOpen === "function" ? S.needs.filter(n => ndOpen(n) && ["urgent", "aog"].includes(n.prio)) : [];
  const late = typeof staffDates === "function" ? crew.flatMap(staffDates).filter(x => x.date < addDays(today(), 7)) : [];
  const box = (t, n, body, cls = "") => `<section class="panel brf ${cls}"><div class="pad row-sb"><h3>${esc(tr(t))}${n != null ? ` <span class="cnt">${n}</span>` : ""}</h3></div>${body}</section>`;
  return `<div class="brf-grid">` +
    box("Météo et NOTAM", null, wxPanel(), wxAlert() ? "brf-alert" : "") +
    box("Avions attendus", visits.length, visits.length ? `<div class="tablewrap"><table><thead><tr><th>Avion</th><th>ARR / DEP (UTC)</th><th>CRS</th><th>Tech Log</th></tr></thead><tbody>${visits.map(v => { const c = visitCheck(v), open = visitTasks(v).filter(t => !t.action);
      return `<tr class="click" data-a="visit-form" data-ho="${id}" data-id="${v.id}"><td class="mono"><b class="${regState(v)}">${esc(v.reg || "")}</b><div class="small muted">${esc(v.acType || "")}</div></td>
        <td class="mono small">${esc(zHM(v.arr))} / ${esc(zHM(v.dep))}${fr24Times(v)}</td><td class="small">${(v.crs || []).map(sName).map(esc).join(", ") || "—"}${c.ok ? "" : `<div class="txt-warn">${esc(tr(c.msg))}</div>`}</td>
        <td class="small">${open.length ? `${plural(open.length, "tâche")} ${esc(tr("à faire"))}` : visitTasks(v).length ? esc(tr("Tout fait")) : "—"}${open.some(t => t.from) ? ` <span class="chip sm warn">${esc(tr("reprise"))}</span>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="pad muted">${esc(tr("Aucun avion encodé pour ce shift."))}</div>`) +
    box("Équipe du shift", crew.length, crew.length ? `<div class="pad brf-crew">${crew.map(p => `<div class="list-row"><span><b>${esc(p.name)}</b> <span class="muted small">${esc(tr(STAFF_FN[p.function] || ""))}</span>${typeof indSigned === "function" && !indSigned(p.id) ? " " + indChip(p.id) : ""}${typeof fatToday === "function" ? fatToday(p.id, date).map(a => ` <span class="chip sm bad" title="${esc(a)}">⚠ ${esc(a)}</span>`).join("") : ""}</span><span class="small"><span class="mono">${esc(licText(p) || "")}</span> ${ratingChips(p)}</span></div>`).join("")}
      ${late.length ? `<div class="banner warn small">${late.map(x => `${esc(x.p.name)} : ${esc(tr(x.label))} ${x.date < today() ? esc(tr("expiré")) : esc(tr("expire le")) + " " + fmtDate(x.date)}`).join("<br>")}</div>` : ""}</div>`
      : `<div class="pad muted">${esc(tr("Personne au roster pour ce shift."))}</div>`) +
    box("Travail repris", todo.length + prevTodo.length, todo.length + prevTodo.length ? `<div class="pad">${[...todo, ...prevTodo].map(x => `<div class="list-row"><span>${x.unc ? `<span class="chip sm bad">${esc(tr("Uncompleted maintenance task"))}</span> ` : ""}<b class="mono">${esc(x.reg || "")}</b> ${esc(x.text || "")}</span>${prevTodo.includes(x) ? `<span class="chip sm warn">${esc(tr("shift précédent"))}</span>` : ""}</div>`).join("")}</div>`
      : `<div class="pad muted">${esc(tr("Rien à reprendre."))}</div>`) +
    box("Situations ouvertes", sits.length, sits.length ? `<div class="pad">${sits.map(s => `<div class="list-row click" data-a="sit-open" data-id="${s.id}"><span><b>${esc(sitName(s))}</b> <span class="muted small">${esc(sitParty(s))}</span></span>${sitChip(s)}</div>`).join("")}</div>`
      : `<div class="pad muted">${esc(tr("Aucune situation ouverte : tout est normal."))}</div>`) +
    (typeof insActive === "function" && insActive().length ? box("Consignes", insActive().length, `<div class="pad">${insActive().slice(0, 6).map(i => { const miss = crew.filter(p => insFor(i, p) && !insAcked(i, p.id));
      return `<div class="list-row click" data-a="ins-go"><span>${i.important ? `<span class="chip sm bad">!</span> ` : ""}<b>${esc(i.title)}</b></span><span class="small ${miss.length ? "txt-warn" : "muted"}">${miss.length ? `${esc(tr("pas signée par"))} ${miss.map(p => esc(p.name)).join(", ")}` : esc(tr("signée par l'équipe"))}</span></div>`; }).join("")}</div>`) : "") +
    (needs.length ? box("Besoins urgents", needs.length, `<div class="pad">${needs.map(n => `<div class="list-row click" data-a="nd-open" data-id="${n.id}"><span>${ndPrio(n)}<b>${esc(n.title)}</b></span>${ndChip(n)}</div>`).join("")}</div>`) : "") +
    `</div>`;
}
WIDGETS.briefing = { h: 8, t: "Briefing du shift", ic: "🧭", c: "blue", m: "shift", size: "m", d: "Météo et alerte rafales, avions attendus, équipe et situations ouvertes du shift en cours.",
  r() { wxLoad(); const [date, sh] = currentShift(), id = hoId(date, sh), v = hoItems(id, "visit"), crew = onShift(date, sh), sits = typeof sitOpen === "function" ? S.situations.filter(sitOpen) : [];
    return `<div class="avi">${wxAlert() ? `<div class="banner bad small">💨 ${"Gusts up to"} ${wxGust()} kt (${"limit"} ${gustLimit()} kt)</div>` : ""}
      <div class="w-stats">${wStat(v.length, "avions")}${wStat(crew.length, "à l'équipe")}${wStat(sits.length, "situations ouvertes", sits.length ? "warn" : "")}</div>
      ${WX && WX.metar ? `${wxPlain(WX.metar.raw, true)}<div class="small mono muted">${esc(WX.metar.raw)}</div>` : ""}</div>`; },
  go() { UI.tab.shift = "briefing"; UI.shift = null; } };
