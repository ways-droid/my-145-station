"use strict";
/* ======================= MUR DE LA STATION =======================
   Écran TV du bureau : le shift en cours en grand, mis à jour tout seul (synchronisation habituelle + horloge chaque minute).
   Qui va à quel avion (CRS et mécanos), heures ARR / DEP et état FR24, tâches à faire, équipe, alerte rafales,
   situations ouvertes. Plein écran : le menu est masqué ; « Quitter » ou Échap ramène au Shift. Rien ne s'y modifie. */
const wallClock = tz => { try { return new Intl.DateTimeFormat("fr-BE", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date()); } catch { return ""; } };
VIEWS.mur = {
  render() {
    const [date, sh] = currentShift(), id = hoId(date, sh), h = hoDoc(id) || {};
    const visits = hoItems(id, "visit").slice().sort((a, b) => String(a.arr || "99").localeCompare(String(b.arr || "99")));
    const crewIds = Array.from(new Set([...onShift(date, sh).map(p => p.id), ...(h.extra || [])]));
    const on = pid => visits.filter(v => (v.crs || []).includes(pid) || (v.mech || []).includes(pid) || visitTasks(v).some(t => (t.techs || []).some(x => x.id === pid))).map(v => v.reg);
    const sits = typeof sitOpen === "function" ? S.situations.filter(s => sitOpen(s) && s.showInShift).sort(sitSort) : [];
    const todo = hoItems(id, "todo").filter(x => !x.done);
    return `<div class="wall-top"><div><div class="wall-st">${esc(stationIata())} · ${esc(settings().stationName || settings().name || "")}</div><div class="wall-sh">${esc(shiftName(date, sh))}${h.foreman ? ` · ${esc(tr("Shift Foreman"))} ${esc(staff(h.foreman)?.name || h.foreman)}` : ""}</div></div>
        <div class="wall-clk"><div><b>${esc(wallClock(stationTz() || undefined))}</b><span>${esc(tr("Local"))} (LT)</span></div><div><b>${esc(wallClock("UTC"))}</b><span>UTC (Z)</span></div>
        <button class="btn sm" data-a="wall-exit">${esc(tr("Quitter"))}</button></div></div>` +
      (typeof wxBanner === "function" ? wxBanner() : "") +
      `<div class="wall-grid"><div class="wall-acs">${visits.map(v => { const open = visitTasks(v).filter(t => !t.action && t.text), c = visitCheck(v);
        return `<div class="wall-ac ${c.ok ? "" : "warn"}"><div class="wall-reg"><b class="${regState(v)}">${esc(v.reg || "")}</b><span>${esc(v.acType || "")}</span></div>
          <div class="wall-t"><span>ARR <b>${esc(zHM(v.arr))}</b></span><span>DEP <b>${esc(zHM(v.dep))}</b></span></div>${fr24Times(v)}
          <div class="wall-who"><span class="lbl">CRS</span> ${(v.crs || []).map(sName).map(esc).join(", ") || `<span class="txt-bad">${esc(tr("à affecter"))}</span>`}</div>
          ${(v.mech || []).length ? `<div class="wall-who"><span class="lbl">${esc(tr("Mécanos"))}</span> ${(v.mech || []).map(sName).map(esc).join(", ")}</div>` : ""}
          ${open.length ? `<ul class="wall-tasks">${open.slice(0, 5).map(t => `<li class="${t.from ? "carry" : ""}">${esc(t.text)}</li>`).join("")}${open.length > 5 ? `<li>… +${open.length - 5}</li>` : ""}</ul>` : visitTasks(v).length ? `<div class="wall-done">✓ ${esc(tr("Tout fait"))}</div>` : ""}</div>`; }).join("") || `<div class="wall-empty">${esc(tr("Aucun avion encodé pour ce shift."))}</div>`}</div>
        <aside class="wall-side"><h3>${esc(tr("Équipe"))} (${crewIds.length})</h3>${crewIds.map(staff).filter(Boolean).sort(staffSort).map(p => `<div class="wall-p"><b>${esc(p.name)}</b><span>${on(p.id).map(esc).join(" · ") || `<i>${esc(tr("libre"))}</i>`}</span></div>`).join("") || `<div class="muted">${esc(tr("Personne au roster pour ce shift."))}</div>`}
          ${todo.length ? `<h3>${esc(tr("Travail repris"))}</h3>${todo.map(x => `<div class="wall-p"><b class="mono">${esc(x.reg || "")}</b><span>${esc(x.text || "")}</span></div>`).join("")}` : ""}
          ${sits.length ? `<h3>⚠ ${esc(tr("Situations ouvertes"))}</h3>${sits.map(s => `<div class="wall-p"><b>${esc(sitName(s))}</b><span>${esc(sitParty(s))}</span></div>`).join("")}` : ""}
          ${WX && WX.metar ? `<h3>Weather (METAR)</h3>${wxPlain(WX.metar.raw)}<div class="mono small muted">${esc(WX.metar.raw)}</div>` : ""}</aside></div>`;
  },
  after() { if (typeof wxLoad === "function") wxLoad(); }
};
/* le Mur s'ouvre dans sa propre fenêtre : en sortir la ferme (sinon retour au Shift) */
const wallExit = () => { if (history.length <= 1) { window.close(); setTimeout(() => { location.hash = "#shift"; }, 200); } else location.hash = "#shift"; };
ACTIONS["wall-exit"] = wallExit;
document.addEventListener("keydown", e => { if (e.key === "Escape" && ["mur", "fids"].includes(route()) && !document.getElementById("modal-root").innerHTML) wallExit(); });
setInterval(() => { if (route() === "mur") render(true); }, 60000);

/* ======================= FIDS DE LA STATION =======================
   Tableau type aéroport, seulement « nos » vols. Nos avions volent souvent sous le code d'une autre compagnie (sous-traitance) :
   on part donc d'abord de l'IMMATRICULATION (toute la flotte du module Avions + avions du shift) → n° de vol Flightradar24 → FIDS.
   Le vol retour est cherché au n° voisin (X6 600 → X6 601, 5C 102 → 5C 101), marqué « ? ». En plus : compagnies clientes
   (case « Show all flights in FIDS » : code IATA, sinon nom). Source : FIDS de Ben Gourion (TLV). FIDS relu toutes les 5 min, Flightradar24 toutes les 15 min. */
let FIDSB = null, FIDSB_T = 0, FIDSB_Q = "", FB_FLEET = {}, FB_FLEET_T = 0, FB_FLEET_Q = "", FB_FR24ERR = "", FB_FR24 = null, FB_RETRY = 0;
const fbNear = f => { const m = f.match(/^([A-Z0-9]{2}[A-Z]?)(\d{1,4})$/); return m ? [m[1] + (+m[2] + 1), +m[2] > 1 ? m[1] + (+m[2] - 1) : ""].filter(Boolean) : []; };
async function fbFleet(force) {
  const regs = [...new Set([...(S.aircraft || []).filter(a => a.active !== false && a.reg).map(a => normReg(a.reg)), ...fbVisits().map(v => normReg(v.reg))])].slice(0, 60);
  if (!regs.length || !force && regs.join() === FB_FLEET_Q && Date.now() - FB_FLEET_T < 15 * 60000) return;
  FB_FLEET_T = Date.now(); FB_FLEET_Q = regs.join();
  try { const r = await API.call("POST", "fr24/track", { regs, station: stationIata() }), key = s => String(s || "").toUpperCase().replace(/[^A-Z0-9-]/g, ""), m = {};
    for (const g of regs) { const x = r.items[key(g)]; if (!x) continue;
      for (const f of [x.live && x.live.flight, x.arr && x.arr.flight, x.dep && x.dep.flight, x.last && x.last.flight].map(fidsNorm).filter(Boolean)) m[f] = g; }
    FB_FLEET = m; FB_FR24 = { regs, items: r.items, errors: r.errors || [] }; FB_FR24ERR = (r.errors || []).join(" · "); }
  catch (e) { FB_FR24ERR = e.message; }
}
/* n° de vol → immatriculation : sûr (shift, Flightradar24) ou probable (n° voisin) */
function fbRegs() {
  const sure = Object.assign({}, FB_FLEET); for (const v of fbVisits()) for (const f of fbFls(v)) sure[f] = normReg(v.reg);
  const likely = {}; for (const [f, g] of Object.entries(sure)) for (const n of fbNear(f)) if (!sure[n]) likely[n] = g;
  return { sure, likely };
}
const fbVisits = () => { const [d, sh] = currentShift(), ids = [hoId(d, sh), hoId(...prevShift(d, sh))]; return S.shiftItems.filter(x => x.kind === "visit" && ids.includes(x.ho) && x.reg); };
const fbFls = v => { const x = v.fr24 || {}; return [v.flight, x.live && x.live.flight, x.arr && x.arr.flight, x.dep && x.dep.flight, x.last && x.last.flight, v.fids && v.fids.arr && v.fids.arr.fl, v.fids && v.fids.dep && v.fids.dep.fl].map(fidsNorm).filter(Boolean); };
async function fbLoad(force) {
  /* compagnies dont on montre TOUS les vols : case « Show all flights in FIDS » de la fiche client (ex. Cargojet) */
  const all = S.clients.filter(c => c.fidsAll);
  const airlines = [...new Set(all.map(c => String(c.iata || "").toUpperCase().trim()).filter(Boolean))];
  const names = all.filter(c => !c.iata).map(c => c.name).filter(Boolean);   // sans code IATA : rapprochement par le nom de la compagnie
  await fbFleet(force);
  const { sure, likely } = fbRegs(), flights = [...new Set([...Object.keys(sure), ...Object.keys(likely)])].slice(0, 120), q = JSON.stringify([airlines, names, flights]);
  if (!force && FIDSB && !FIDSB.none && q === FIDSB_Q && Date.now() - FIDSB_T < 5 * 60000) return;   // relu si les compagnies ou les vols du shift changent
  FIDSB_T = Date.now(); FIDSB_Q = q;
  if (!airlines.length && !names.length && !flights.length) {   // données pas encore chargées (fenêtre qui vient de s'ouvrir) : on réessaie
    const first = !(FIDSB && FIDSB.none); FIDSB = { rows: [], none: true };
    if (first && route() === "fids") render(true);
    if (!FB_RETRY) FB_RETRY = setTimeout(() => { FB_RETRY = 0; if (route() === "fids") fbLoad(); }, 3000);
    return; }
  try { FIDSB = await API.call("POST", "fids/board", { airlines, names, flights }); } catch (e) { FIDSB = { rows: [], error: e.message }; }
  if (route() === "fids") render(true);
}
/* « 2026-11-22T22:59:00Z » → heure locale de la station « 2026-11-23T00:59 » (même forme que le FIDS) */
function fbLt(iso) { const d = new Date(iso); if (isNaN(d)) return "";
  try { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: stationTz() || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${String(+p.hour % 24).padStart(2, "0")}:${p.minute}:00`; } catch { return ""; } }
/* nos avions que l'aéroport ne publie pas (cargo, sous-traitance) : lignes tirées de Flightradar24, pour que le tableau ne soit jamais vide */
function fbFr24Rows(have) {
  if (!FB_FR24) return [];
  const st = stationIata(), key = s => String(s || "").toUpperCase().replace(/[^A-Z0-9-]/g, ""), out = [], now = Date.now();
  for (const g of FB_FR24.regs) { const x = FB_FR24.items[key(g)]; if (!x) continue;
    const add = (dir, fl, t, other, status) => { const f = fidsNorm(fl); if (f && have.has(f + dir)) return; if (rowsHasReg(have, g, dir)) return;
      out.push({ fr24: true, reg: g, dir, fl: f || String(fl || "").toUpperCase(), sched: "", est: t ? fbLt(t) : "", status, other, city: "", name: "" }); };
    if (x.live && x.live.to === st) add("A", x.live.flight, x.live.eta, x.live.from, "EN ROUTE");
    else if (x.live && x.live.from === st) add("D", x.live.flight, x.live.at, x.live.to, "AIRBORNE");
    if (!(x.live && x.live.to === st) && x.arr && now - Date.parse(x.arr.at) < 6 * 3600000) add("A", x.arr.flight, x.arr.at, x.arr.from, "LANDED");
    if (!(x.live && x.live.from === st) && x.dep && now - Date.parse(x.dep.at) < 3 * 3600000) add("D", x.dep.flight, x.dep.at, x.dep.to, "DEPARTED"); }
  return out;
}
const rowsHasReg = (have, g, dir) => have.has("R" + g + dir);
function fbRow(x, R) {
  const t = x.est || x.sched, late = x.est && x.sched && x.est !== x.sched, st = String(x.status || "").toUpperCase();
  const cls = /CANCEL/.test(st) ? "bad" : /DELAY/.test(st) ? "warn" : /LAND|DEPART|ARRIV/.test(st) ? "good" : "";
  const reg = x.reg || R.sure[x.fl] || R.likely[x.fl], guess = !x.reg && !R.sure[x.fl] && !!R.likely[x.fl];
  return `<tr><td class="fb-time">${esc(fidsHM(x.sched))}</td><td class="fb-time ${late ? "late" : ""}">${late ? esc(fidsHM(t)) : ""}</td>
    <td class="fb-fl">${esc(x.fl)}</td><td>${x.fr24 ? `<span class="fb-iata" title="Not on the airport FIDS: time and status from Flightradar24">Flightradar24</span>` : esc(x.name || x.al || "")}</td><td>${esc(x.city || x.other || "")}${x.other && x.city ? ` <span class="fb-iata">${esc(x.other)}</span>` : ""}</td>
    <td class="fb-reg">${reg ? esc(reg) + (guess ? ` <span class="fb-iata" title="Likely: next/previous flight number of this aircraft">?</span>` : "") : ""}</td><td>${esc(x.terminal || "")}</td><td class="fb-st ${cls}">${esc(x.status || "")}</td></tr>`;
}
VIEWS.fids = {
  render() {
    const R = fbRegs();
    const now = Date.now(), keep = x => { const m = ltMs(x.est || x.sched); return m == null || (m > now - 3 * 3600000 && m < now + 24 * 3600000); };
    const fids = ((FIDSB && FIDSB.rows) || []).filter(keep), R0 = fbRegs(), have = new Set();
    for (const x of fids) { have.add(x.fl + x.dir); const g = R0.sure[x.fl]; if (g) have.add("R" + g + x.dir); }
    const extra = fbFr24Rows(have), rows = [...fids, ...extra].sort((a, b) => String(a.est || a.sched).localeCompare(String(b.est || b.sched)));
    /* ligne de diagnostic : ce que chaque source a donné */
    const live = FB_FR24 ? FB_FR24.regs.filter(g => { const x = FB_FR24.items[String(g).toUpperCase().replace(/[^A-Z0-9-]/g, "")]; return x && (x.live || x.last); }) : [];
    const diag = `<div class="fb-diag">Airport FIDS: ${FIDSB && FIDSB.error ? `<b class="bad">${esc(FIDSB.error)}</b>` : FIDSB && FIDSB.total != null ? `${FIDSB.total} flights published, ${fids.length} ours` : FIDSB && FIDSB.none ? "nothing to look up (no aircraft, no flight number)" : "…"}
      · Flightradar24: ${FB_FR24ERR ? `<b class="bad">${esc(tr(FB_FR24ERR))}</b>` : FB_FR24 ? `${live.length} of ${FB_FR24.regs.length} aircraft with a recent flight (${esc(Object.keys(R0.sure).join(", ") || "no flight numbers")})` : "…"}${extra.length ? ` · ${extra.length} shown from Flightradar24 (not on the airport FIDS)` : ""}</div>`;
    const tab = (dir, title) => { const r = rows.filter(x => x.dir === dir);
      return `<section class="fb-sec"><h2>${dir === "A" ? "🛬" : "🛫"} ${title}</h2><table class="fb"><thead><tr><th>${"Sched."}</th><th>${"Est."}</th><th>${"Flight"}</th><th>${"Airline"}</th><th>${dir === "A" ? "From" : "To"}</th><th>${"Reg."}</th><th>T</th><th>${"Status"}</th></tr></thead>
        <tbody>${r.map(x => fbRow(x, R)).join("") || `<tr><td colspan="8" class="fb-none">${"No flights"}</td></tr>`}</tbody></table></section>`; };
    return `<div class="fb-wrap"><div class="wall-top"><div><div class="wall-st">FIDS ${esc(stationIata())}</div><div class="wall-sh">${"Our aircraft (by registration) and our customers' flights"}${FIDSB && FIDSB.at ? ` · ${"updated"} ${esc(wallClock(stationTz() || undefined))}` : ""}</div></div>
        <div class="wall-clk"><div><b>${esc(wallClock(stationTz() || undefined))}</b><span>${"Local"} (LT)</span></div><div><b>${esc(wallClock("UTC"))}</b><span>UTC (Z)</span></div>
        <button class="btn sm" data-a="fb-refresh">↻</button><button class="btn sm" data-a="wall-exit">${"Exit"}</button></div></div>` +
      (stationIata() !== "TLV" ? `<div class="wall-empty">${"FIDS is only available for the TLV station."}</div>` :
      (!FIDSB ? `<div class="wall-empty">${"Loading…"}</div>` : tab("A", "Arrivals") + tab("D", "Departures") + diag)) + `</div>`;
  },
  after() { if (stationIata() === "TLV") fbLoad(); }
};
ACTIONS["fb-refresh"] = () => fbLoad(true);
setInterval(() => { if (route() === "fids") fbLoad(); }, 60000);
