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
        <div class="wall-clk"><div><b>${esc(wallClock(stationTz() || undefined))}</b><span>${esc(tr("Local"))}</span></div><div><b>${esc(wallClock("UTC"))}</b><span>UTC</span></div>
        <button class="btn sm" data-a="wall-exit">${esc(tr("Quitter"))}</button></div></div>` +
      (typeof wxBanner === "function" ? wxBanner() : "") +
      `<div class="wall-grid"><div class="wall-acs">${visits.map(v => { const open = visitTasks(v).filter(t => !t.action && t.text), c = visitCheck(v);
        return `<div class="wall-ac ${c.ok ? "" : "warn"}"><div class="wall-reg"><b class="${regState(v)}">${esc(v.reg || "")}</b><span>${esc(v.acType || "")}</span></div>
          <div class="wall-t"><span>ARR <b>${esc(v.arr || "—")}</b></span><span>DEP <b>${esc(v.dep || "—")}</b></span></div>${fr24Times(v)}
          <div class="wall-who"><span class="lbl">CRS</span> ${(v.crs || []).map(sName).map(esc).join(", ") || `<span class="txt-bad">${esc(tr("à affecter"))}</span>`}</div>
          ${(v.mech || []).length ? `<div class="wall-who"><span class="lbl">${esc(tr("Mécanos"))}</span> ${(v.mech || []).map(sName).map(esc).join(", ")}</div>` : ""}
          ${open.length ? `<ul class="wall-tasks">${open.slice(0, 5).map(t => `<li class="${t.from ? "carry" : ""}">${esc(t.text)}</li>`).join("")}${open.length > 5 ? `<li>… +${open.length - 5}</li>` : ""}</ul>` : visitTasks(v).length ? `<div class="wall-done">✓ ${esc(tr("Tout fait"))}</div>` : ""}</div>`; }).join("") || `<div class="wall-empty">${esc(tr("Aucun avion encodé pour ce shift."))}</div>`}</div>
        <aside class="wall-side"><h3>${esc(tr("Équipe"))} (${crewIds.length})</h3>${crewIds.map(staff).filter(Boolean).sort(staffSort).map(p => `<div class="wall-p"><b>${esc(p.name)}</b><span>${on(p.id).map(esc).join(" · ") || `<i>${esc(tr("libre"))}</i>`}</span></div>`).join("") || `<div class="muted">${esc(tr("Personne au roster pour ce shift."))}</div>`}
          ${todo.length ? `<h3>${esc(tr("Travail repris"))}</h3>${todo.map(x => `<div class="wall-p"><b class="mono">${esc(x.reg || "")}</b><span>${esc(x.text || "")}</span></div>`).join("")}` : ""}
          ${sits.length ? `<h3>⚠ ${esc(tr("Situations ouvertes"))}</h3>${sits.map(s => `<div class="wall-p"><b>${esc(sitName(s))}</b><span>${esc(sitParty(s))}</span></div>`).join("")}` : ""}
          ${WX && WX.metar ? `<h3>METAR</h3><div class="mono small">${esc(WX.metar.raw)}</div>` : ""}</aside></div>`;
  },
  after() { if (typeof wxLoad === "function") wxLoad(); }
};
ACTIONS["wall-exit"] = () => { location.hash = "#shift"; };
document.addEventListener("keydown", e => { if (e.key === "Escape" && route() === "mur" && !document.getElementById("modal-root").innerHTML) location.hash = "#shift"; });
setInterval(() => { if (route() === "mur") render(true); }, 60000);
