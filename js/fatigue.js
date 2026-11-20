"use strict";
/* ======================= FATIGUE ET TEMPS DE REPOS =======================
   Rien à saisir : les heures viennent du roster et des shifts.
   - Service d'une personne pour un jour : l'équipe du roster (D 08-20, N 20-08, horaire libre), et les shifts où elle a été
     affectée à un avion (CRS, mécano ou technicien d'une tâche) même sans être au roster.
   - Sur avion : de l'arrivée du premier avion affecté au départ du dernier, dans le shift. Le temps passé entre deux avions
     compte (la personne est restée à la station). Si le dernier avion part après la fin du shift (jusqu'à 4 h après),
     le service est prolongé d'autant.
   - Alertes (seuils dans Paramètres → fatigue) : service trop long, repos trop court entre deux services, trop de jours
     ou de nuits d'affilée, trop d'heures sur 7 jours glissants. Affichées dans le roster (case cerclée de rouge),
     l'onglet Roster → Fatigue et le briefing du shift. Repères pour le Station Lead, pas un calcul réglementaire. */
const FAT_DEF = { maxDuty: 13, minRest: 11, maxDays: 7, maxNights: 4, max7: 60 };
const fatCfg = () => { const s = settings().fatigue || {}, o = {}; for (const k in FAT_DEF) o[k] = +s[k] > 0 ? +s[k] : FAT_DEF[k]; return o; };
const FH = 3600000;
const FAT_WORK = ["day", "night", "custom", "pending", "station", "training", "travel", "away", "other"];
function fatIdx() { const m = new Map(); for (const v of S.shiftItems) if (v.kind === "visit") { if (!m.has(v.ho)) m.set(v.ho, []); m.get(v.ho).push(v); } return m; }
const fatOn = (v, pid) => (v.crs || []).includes(pid) || (v.mech || []).includes(pid) || visitTasks(v).some(t => (t.techs || []).some(x => x.id === pid));
/* affectations réelles d'une personne dans un shift : { s, e, regs } ou null */
function fatShift(pid, date, sh, idx) {
  const id = hoId(date, sh), vs = (idx.get(id) || []).filter(v => fatOn(v, pid)); if (!vs.length) return null;
  const [a, b] = shiftWindow(id); let s = Infinity, e = -Infinity;
  for (const v of vs) { const t = visitTimes(v, id), x = Math.min(b, Math.max(a, t.arr ?? a)), y = t.dep == null || t.dep > b + 4 * FH ? b : Math.max(t.dep, x);
    s = Math.min(s, x); e = Math.max(e, y); }
  return { s, e, regs: Array.from(new Set(vs.map(v => v.reg).filter(Boolean))) };
}
/* service d'un jour : { k, spans [[début, fin]], h, night, on (h sur avion), regs, work } */
function fatDay(pid, date, idx) {
  const x = rcell(pid, date), k = x ? rcode(x.c).k : null, spans = [], regs = []; let on = 0, night = false;
  const win = {}; for (const sh of cellShifts(x)) if (k !== "custom") win[sh] = shiftWindow(hoId(date, sh));
  if (k === "custom") { const a = hh(x.start), b = hh(x.end); if (a != null) { const m = stationUtc(date, 0), end = b == null ? a + 12 : (b <= a ? b + 24 : b); spans.push([m + a * FH, m + end * FH]); if (end > 24 || a >= 20) night = true; } }
  for (const sh of ["day", "night"]) {
    const act = fatShift(pid, date, sh, idx);
    if (act) { on += (act.e - act.s) / FH; regs.push(...act.regs); const w = win[sh] || shiftWindow(hoId(date, sh)); win[sh] = [w[0], Math.max(w[1], act.e)]; }
    if (win[sh]) { spans.push(win[sh]); if (sh === "night") night = true; }
  }
  spans.sort((p, q) => p[0] - q[0]);
  const merged = []; for (const s of spans) { const l = merged[merged.length - 1]; if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1]); else merged.push(s.slice()); }
  const h = merged.reduce((t, s) => t + (s[1] - s[0]) / FH, 0);
  return { date, k, c: x ? x.c : "", spans: merged, h, night, on, regs, act: on > 0 || regs.length > 0, work: merged.length > 0 || FAT_WORK.includes(k) };
}
const fatR = n => Math.round(n * 10) / 10;
/* jours from..to d'une personne, avec les alertes ; on remonte 8 jours pour les séries et le repos */
function fatPerson(pid, from, to, idx = fatIdx()) {
  const cfg = fatCfg(), out = [], hist = [];
  let lastEnd = null, days = 0, nights = 0;
  for (let d = addDays(from, -8); d <= to; d = addDays(d, 1)) {
    const x = fatDay(pid, d, idx); x.alerts = [];
    days = x.work ? days + 1 : 0; nights = x.night ? nights + 1 : 0;
    for (const s of x.spans) {
      const len = (s[1] - s[0]) / FH; if (len > cfg.maxDuty + 0.01) x.alerts.push(`${tr("Service de")} ${fatR(len)} h (max ${cfg.maxDuty} h)`);
      if (lastEnd != null && s[0] - lastEnd < cfg.minRest * FH) { x.rest = Math.max(0, (s[0] - lastEnd) / FH); x.alerts.push(`${tr("Repos de")} ${fatR(x.rest)} h ${tr("seulement avant ce service")} (min ${cfg.minRest} h)`); }
      else if (lastEnd != null && x.rest == null) x.rest = (s[0] - lastEnd) / FH;
      lastEnd = Math.max(lastEnd ?? 0, s[1]);
    }
    if (days > cfg.maxDays) x.alerts.push(`${days} ${tr("jours de travail d'affilée")} (max ${cfg.maxDays})`);
    if (nights > cfg.maxNights) x.alerts.push(`${nights} ${tr("nuits d'affilée")} (max ${cfg.maxNights})`);
    hist.push(x.h); if (hist.length > 7) hist.shift();
    const w = hist.reduce((a, b) => a + b, 0); x.h7 = w;
    if (x.h && w > cfg.max7 + 0.01) x.alerts.push(`${fatR(w)} h ${tr("sur 7 jours")} (max ${cfg.max7} h)`);
    if (d >= from) out.push(x);
  }
  return out;
}
/* { pid: { date: [alertes] } } pour l'affichage du roster */
function fatMap(ppl, from, to) { const idx = fatIdx(), m = {}; for (const p of ppl) { m[p.id] = {}; for (const x of fatPerson(p.id, from, to, idx)) if (x.alerts.length) m[p.id][x.date] = x.alerts; } return m; }
const fatHM = ms => { try { return new Intl.DateTimeFormat("fr-BE", { timeZone: stationTz() || undefined, hour: "2-digit", minute: "2-digit" }).format(new Date(ms)); } catch { return ""; } };
const fatYMD = ms => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: stationTz() || undefined }).format(new Date(ms)); } catch { return new Date(ms).toISOString().slice(0, 10); } };
const fatSpan = x => x.spans.map(s => { const n = Math.round((Date.parse(fatYMD(s[1])) - Date.parse(fatYMD(s[0]))) / 864e5); return `${fatHM(s[0])}–${fatHM(s[1])} LT${n > 0 ? ` (+${n} j)` : ""}`; }).join(", ");

/* onglet Roster → Fatigue */
function rosterFatigue() {
  const ym = UI.rmonth, from = ym + "-01", to = `${ym}-${pad(ymDays(ym))}`, cfg = fatCfg(), idx = fatIdx();
  const ppl = rosterStaff().sort(staffSort);
  const rows = ppl.map(p => { const ds = fatPerson(p.id, from, to, idx), al = ds.filter(x => x.alerts.length);
    const rests = ds.map(x => x.rest).filter(r => r != null && r < 48);
    return { p, ds, al, work: ds.filter(x => x.work).length, nights: ds.filter(x => x.night).length, h: ds.reduce((a, x) => a + x.h, 0), on: ds.reduce((a, x) => a + x.on, 0), minRest: rests.length ? Math.min(...rests) : null }; });
  const soon = [], t0 = today(), t1 = addDays(t0, 14);
  for (const p of ppl) for (const x of fatPerson(p.id, t0, t1, idx)) for (const a of x.alerts) soon.push({ p, d: x.date, a });
  return `<div class="panel"><div class="pad hint">${esc(tr("Calcul automatique depuis le roster et les shifts : le service suit l'équipe du roster, prolongée si le dernier avion affecté part après la fin du shift. « Sur avion » va de l'arrivée du premier avion affecté au départ du dernier, temps entre deux avions compris."))}
      ${esc(tr("Seuils"))} : ${esc(tr("service"))} ≤ ${cfg.maxDuty} h · ${esc(tr("repos"))} ≥ ${cfg.minRest} h · ≤ ${cfg.maxDays} ${esc(tr("jours d'affilée"))} · ≤ ${cfg.maxNights} ${esc(tr("nuits d'affilée"))} · ≤ ${cfg.max7} h ${esc(tr("sur 7 jours"))}${isAdmin() ? ` · <a href="#parametres">${esc(tr("modifier"))}</a>` : ""}.</div></div>
    ${soon.length ? `<div class="banner bad"><b>${esc(tr("À corriger dans les 14 prochains jours"))}</b><br>${soon.slice(0, 12).map(x => `${fmtDate(x.d)} · <b>${esc(x.p.name)}</b> : ${esc(x.a)}`).join("<br>")}${soon.length > 12 ? `<br>… +${soon.length - 12}` : ""}</div>` : `<div class="banner good">${esc(tr("Aucune alerte de fatigue dans les 14 prochains jours."))}</div>`}
    <div class="panel"><div class="tablewrap"><table><thead><tr><th>Nom</th><th class="r">${esc(tr("Jours travaillés"))}</th><th class="r">${esc(tr("Nuits"))}</th><th class="r">${esc(tr("Heures de service"))}</th><th class="r">${esc(tr("Heures sur avion"))}</th><th class="r">${esc(tr("Repos le plus court"))}</th><th>${esc(tr("Alertes"))}</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="click" data-a="fat-open" data-id="${r.p.id}"><td><b>${esc(r.p.name)}</b><div class="muted small">${esc(tr(STAFF_FN[r.p.function] || ""))}</div></td><td class="r num">${r.work}</td><td class="r num">${r.nights}</td>
        <td class="r num">${fmtH(r.h) || 0} h</td><td class="r num">${fmtH(r.on) || "—"}${r.on ? " h" : ""}</td><td class="r num ${r.minRest != null && r.minRest < cfg.minRest ? "txt-bad" : ""}">${r.minRest != null ? fatR(r.minRest) + " h" : "—"}</td>
        <td>${r.al.length ? `<span class="chip sm bad">${r.al.length}</span> <span class="small">${esc(r.al[0].alerts[0])}${r.al.length > 1 || r.al[0].alerts.length > 1 ? " …" : ""}</span>` : `<span class="chip sm good">OK</span>`}</td></tr>`).join("")}</tbody></table>
      ${ppl.length ? "" : `<div class="empty">${esc(tr("Aucune personne pour l'instant."))}</div>`}</div></div>`;
}
ACTIONS["fat-open"] = el => {
  const p = staff(el.dataset.id); if (!p) return;
  const ym = UI.rmonth || ymOf(today()), ds = fatPerson(p.id, ym + "-01", `${ym}-${pad(ymDays(ym))}`).filter(x => x.work || x.alerts.length);
  modal(`${mHead(esc(tr("Fatigue et repos")) + " · " + esc(p.name))}<div class="body"><div class="tablewrap"><table><thead><tr><th>Date</th><th>Code</th><th>${esc(tr("Service (heure locale)"))}</th><th class="r">h</th><th>${esc(tr("Sur avion"))}</th><th class="r">${esc(tr("Repos avant"))}</th><th class="r">7 j</th></tr></thead><tbody>
    ${ds.map(x => `<tr class="${x.alerts.length ? "fat-bad" : ""}"><td class="small">${fmtDate(x.date)}</td><td class="mono small">${esc(x.c || (x.act ? tr("shift") : ""))}</td><td class="mono small">${esc(fatSpan(x)) || "—"}</td><td class="r num">${x.h ? fatR(x.h) : "—"}</td>
      <td class="small">${x.on ? `${fatR(x.on)} h · <span class="mono">${esc(x.regs.join(", "))}</span>` : "—"}</td><td class="r num">${x.rest != null && x.rest < 48 ? fatR(x.rest) + " h" : "—"}</td><td class="r num">${fatR(x.h7) || "—"}</td></tr>
      ${x.alerts.length ? `<tr class="fat-bad"><td></td><td colspan="6" class="small txt-bad">⚠ ${x.alerts.map(esc).join(" · ")}</td></tr>` : ""}`).join("") || `<tr><td colspan="7" class="muted">—</td></tr>`}</tbody></table></div></div>
    <footer><button class="btn" data-close>Fermer</button></footer>`, "lg");
};
/* alertes d'une personne pour un jour donné (briefing du shift) */
const fatToday = (pid, date) => (fatPerson(pid, date, date)[0] || { alerts: [] }).alerts;
