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
   Tableau type aéroport, seulement « nos » vols : compagnies clientes (code IATA de la fiche client) et vols des avions
   des shifts en cours (n° Flightradar24 ou saisi). Source : FIDS de Ben Gourion (TLV). Rafraîchi toutes les 5 minutes. */
let FIDSB = null, FIDSB_T = 0, FIDSB_Q = "";
const fbVisits = () => { const [d, sh] = currentShift(), ids = [hoId(d, sh), hoId(...prevShift(d, sh))]; return S.shiftItems.filter(x => x.kind === "visit" && ids.includes(x.ho) && x.reg); };
const fbFls = v => { const x = v.fr24 || {}; return [v.flight, x.live && x.live.flight, x.arr && x.arr.flight, x.dep && x.dep.flight, x.last && x.last.flight, v.fids && v.fids.arr && v.fids.arr.fl, v.fids && v.fids.dep && v.fids.dep.fl].map(fidsNorm).filter(Boolean); };
async function fbLoad(force) {
  const airlines = [...new Set(S.clients.map(c => String(c.iata || "").toUpperCase().trim()).filter(Boolean))];
  const flights = [...new Set(fbVisits().flatMap(fbFls))], q = JSON.stringify([airlines, flights]);
  if (!force && FIDSB && q === FIDSB_Q && Date.now() - FIDSB_T < 5 * 60000) return;   // relu si les compagnies ou les vols du shift changent
  FIDSB_T = Date.now(); FIDSB_Q = q;
  if (!airlines.length && !flights.length) { FIDSB = { rows: [] }; return; }
  try { FIDSB = await API.call("POST", "fids/board", { airlines, flights }); } catch (e) { FIDSB = { rows: [], error: e.message }; }
  if (route() === "fids") render(true);
}
function fbRow(x, regOf) {
  const t = x.est || x.sched, late = x.est && x.sched && x.est !== x.sched, st = String(x.status || "").toUpperCase();
  const cls = /CANCEL/.test(st) ? "bad" : /DELAY/.test(st) ? "warn" : /LAND|DEPART|ARRIV/.test(st) ? "good" : "";
  const reg = regOf[x.fl];
  return `<tr><td class="fb-time">${esc(fidsHM(x.sched))}</td><td class="fb-time ${late ? "late" : ""}">${late ? esc(fidsHM(t)) : ""}</td>
    <td class="fb-fl">${esc(x.fl)}</td><td>${esc(x.name || x.al || "")}</td><td>${esc(x.city || x.other || "")}${x.other && x.city ? ` <span class="fb-iata">${esc(x.other)}</span>` : ""}</td>
    <td class="fb-reg">${reg ? esc(reg) : ""}</td><td>${esc(x.terminal || "")}</td><td class="fb-st ${cls}">${esc(x.status || "")}</td></tr>`;
}
VIEWS.fids = {
  render() {
    const regOf = {}; for (const v of fbVisits()) for (const f of fbFls(v)) regOf[f] = normReg(v.reg);
    const now = Date.now(), keep = x => { const m = ltMs(x.est || x.sched); return m == null || (m > now - 3 * 3600000 && m < now + 24 * 3600000); };
    const rows = ((FIDSB && FIDSB.rows) || []).filter(keep);
    const tab = (dir, title) => { const r = rows.filter(x => x.dir === dir);
      return `<section class="fb-sec"><h2>${dir === "A" ? "🛬" : "🛫"} ${title}</h2><table class="fb"><thead><tr><th>${"Sched."}</th><th>${"Est."}</th><th>${"Flight"}</th><th>${"Airline"}</th><th>${dir === "A" ? "From" : "To"}</th><th>${"Reg."}</th><th>T</th><th>${"Status"}</th></tr></thead>
        <tbody>${r.map(x => fbRow(x, regOf)).join("") || `<tr><td colspan="8" class="fb-none">${"No flights"}</td></tr>`}</tbody></table></section>`; };
    const noCodes = !S.clients.some(c => c.iata);
    return `<div class="fb-wrap"><div class="wall-top"><div><div class="wall-st">FIDS ${esc(stationIata())}</div><div class="wall-sh">${"Our flights only"}${FIDSB && FIDSB.at ? ` · ${"updated"} ${esc(wallClock(stationTz() || undefined))}` : ""}</div></div>
        <div class="wall-clk"><div><b>${esc(wallClock(stationTz() || undefined))}</b><span>${"Local"} (LT)</span></div><div><b>${esc(wallClock("UTC"))}</b><span>UTC (Z)</span></div>
        <button class="btn sm" data-a="fb-refresh">↻</button><button class="btn sm" data-a="wall-exit">${"Exit"}</button></div></div>` +
      (stationIata() !== "TLV" ? `<div class="wall-empty">${"FIDS is only available for the TLV station."}</div>` :
      (FIDSB && FIDSB.error ? `<div class="banner warn">FIDS TLV : ${esc(tr(FIDSB.error))}</div>` : "") +
      (noCodes ? `<div class="banner">${"Add the airline IATA code in each Customer record to see all their flights."}</div>` : "") +
      (!FIDSB ? `<div class="wall-empty">${"Loading…"}</div>` : tab("A", "Arrivals") + tab("D", "Departures"))) + `</div>`;
  },
  after() { if (stationIata() === "TLV") fbLoad(); }
};
ACTIONS["fb-refresh"] = () => fbLoad(true);
setInterval(() => { if (route() === "fids") fbLoad(); }, 60000);
