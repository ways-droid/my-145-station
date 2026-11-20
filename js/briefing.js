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
  return `<div class="banner bad wx-alert" role="alert">💨 <b>${esc(tr("Rafales jusqu'à"))} ${wxGust()} kt</b> ${esc(tr("à"))} ${esc(WX.icao)} (${esc(tr("seuil"))} ${gustLimit()} kt)${when ? " · " + esc(tr("TAF")) + " " + esc(when) : ""}${WX.metar && WX.metar.wgst > gustLimit() ? " · " + esc(tr("en ce moment (METAR)")) : ""}. ${esc(tr("Sécurisez les escaliers, les capots, les portes et l'équipement de piste."))}</div>`;
}
function wxPanel() {
  if (!wxIcao()) return `<div class="pad muted">${esc(tr("Code OACI de la station inconnu : renseignez-le dans Paramètres (Station)."))}</div>`;
  if (!WX) return `<div class="pad muted">${esc(WXERR ? tr(WXERR) : tr("Chargement de la météo…"))}</div>`;
  const m = WX.metar, t = WX.taf;
  return `<div class="pad wx">${m ? `<div class="wx-l"><span class="chip sm">METAR</span> <span class="mono">${esc(m.raw)}</span></div>` : ""}
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
        <td class="mono small">${esc(v.arr || "—")} / ${esc(v.dep || "—")}${fr24Times(v)}</td><td class="small">${(v.crs || []).map(sName).map(esc).join(", ") || "—"}${c.ok ? "" : `<div class="txt-warn">${esc(tr(c.msg))}</div>`}</td>
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
    return `${wxAlert() ? `<div class="banner bad small">💨 ${esc(tr("Rafales jusqu'à"))} ${wxGust()} kt (${esc(tr("seuil"))} ${gustLimit()} kt)</div>` : ""}
      <div class="w-stats">${wStat(v.length, "avions")}${wStat(crew.length, "à l'équipe")}${wStat(sits.length, "situations ouvertes", sits.length ? "warn" : "")}</div>
      ${WX && WX.metar ? `<div class="small mono muted">${esc(WX.metar.raw)}</div>` : ""}`; },
  go() { UI.tab.shift = "briefing"; UI.shift = null; } };
