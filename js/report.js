"use strict";
/* ======================= RAPPORT MENSUEL =======================
   Calculé depuis les shifts du mois (rien à saisir) : shifts et handovers, rotations par compagnie et par type d'avion,
   heures (MHRS) par compagnie et par technicien, tâches les plus fréquentes, tâches non terminées passées au shift suivant,
   situations, besoins, consignes et formations du mois. Imprimable (PDF via le navigateur). */
const rpMonth = () => UI.rpMonth || today().slice(0, 7);
const rpInc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; return o; };
const rpTop = (o, n = 10) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
const rpNorm = t => String(t || "").trim().replace(/\s+/g, " ").replace(/[.;:,]+$/, "");
function rpData(ym) {
  const inM = x => String(x || "").startsWith(ym);
  const visits = S.shiftItems.filter(x => x.kind === "visit" && inM(x.ho)), hos = S.handovers.filter(h => inM(h.id || h.date));
  const shiftIds = new Set([...visits.map(v => v.ho), ...S.shiftItems.filter(x => inM(x.ho)).map(x => x.ho), ...hos.map(h => h.id)]);
  const rot = {}, byType = {}, mhClient = {}, mhTech = {}, tasks = {}, groups = new Map();
  for (const v of visits) { const g = visitGid(v); if (!groups.has(g)) groups.set(g, v); }
  const company = v => { const c = v.clientId ? S.clients.find(x => x.id === v.clientId) : clientOfReg(v.reg); return c ? (c.code || c.name) : tr("Inconnue"); };
  for (const v of groups.values()) { rpInc(rot, company(v)); rpInc(byType, v.acType || "—"); }
  let mh = 0, unc = 0, nTasks = 0;
  for (const v of visits) for (const t of visitTasks(v)) {
    nTasks++; if (t.unc) unc++;
    const h = taskH(t); mh += h; rpInc(mhClient, company(v), h);
    for (const x of t.techs || []) if (numH(x.h)) rpInc(mhTech, sName(x.id), numH(x.h));
    const k = rpNorm(t.text); if (k) rpInc(tasks, k);
  }
  const closed = hos.filter(h => h.out && h.out.at && h.in && h.in.at).length;
  const sitsOpened = (S.situations || []).filter(s => inM(s.since)), sitsClosed = (S.situations || []).filter(s => inM(s.closedAt));
  const needs = (S.needs || []).filter(n => inM(n.at)), ins = (S.instructions || []).filter(i => inM(i.at)), ind = (S.induction || []).filter(d => d.signed && inM(d.signed.at));
  return { shifts: shiftIds.size, closed, rotations: groups.size, aircraft: new Set([...groups.values()].map(v => normReg(v.reg))).size, rot, byType, mh, mhClient, mhTech, tasks, nTasks, unc, sitsOpened, sitsClosed, needs, ins, ind };
}
const rpTable = (title, rows, unit = "") => `<section class="panel rp-box"><div class="pad"><h3>${esc(tr(title))}</h3></div>${rows.length ? `<table><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r num"><b>${fmtH(v) || v}</b>${unit ? " " + esc(unit) : ""}</td></tr>`).join("")}</tbody></table>` : `<div class="pad muted">—</div>`}</section>`;
VIEWS.rapport = {
  render() {
    const ym = rpMonth(), d = rpData(ym), label = new Date(ym + "-15").toLocaleDateString(LANG === "en" ? "en-GB" : "fr-BE", { month: "long", year: "numeric" });
    return head("Rapport mensuel", "Calculé automatiquement depuis les shifts du mois. Imprimez-le ou enregistrez-le en PDF.",
      `<button class="btn" data-a="rp-print">${esc(tr("Imprimer / PDF"))}</button>`,
      `<div class="row-g"><button class="btn sm" data-a="rp-go" data-n="-1" aria-label="Mois précédent">‹</button><b class="rmonth">${esc(label)}</b><button class="btn sm" data-a="rp-go" data-n="1" aria-label="Mois suivant">›</button></div>`) +
      `<div class="rp-print-h"><b>${esc(settings().name || "")} · ${esc(stationIata())}</b> — ${esc(tr("Rapport mensuel"))} ${esc(label)}</div>
      <div class="pipeline"><div class="panel tile c-blue"><div class="lbl">${esc(tr("Shifts"))}</div><div class="val">${d.shifts}</div><div class="note">${d.closed} ${esc(tr("handovers complets"))}</div></div>
        <div class="panel tile c-blue"><div class="lbl">${esc(tr("Rotations"))}</div><div class="val">${d.rotations}</div><div class="note">${d.aircraft} ${esc(tr("avions différents"))}</div></div>
        <div class="panel tile c-green"><div class="lbl">MHRS</div><div class="val">${fmtH(d.mh) || 0}</div><div class="note">${d.nTasks} ${esc(tr("tâches Tech Log"))}</div></div>
        <div class="panel tile c-red"><div class="lbl">${esc(tr("Tâches non terminées passées"))}</div><div class="val">${d.unc}</div></div></div>
      <div class="rp-grid">${rpTable("Rotations par compagnie", rpTop(d.rot, 20))}${rpTable("Rotations par type d'avion", rpTop(d.byType, 20))}
        ${rpTable("MHRS par compagnie", rpTop(d.mhClient, 20), "h")}${rpTable("MHRS par technicien", rpTop(d.mhTech, 30), "h")}
        ${rpTable("Tâches les plus fréquentes", rpTop(d.tasks, 12))}
        <section class="panel rp-box"><div class="pad"><h3>${esc(tr("Station"))}</h3></div><table><tbody>
          <tr><td>${esc(tr("Situations ouvertes ce mois"))}</td><td class="r num"><b>${d.sitsOpened.length}</b></td></tr><tr><td>${esc(tr("Situations revenues à la normale"))}</td><td class="r num"><b>${d.sitsClosed.length}</b></td></tr>
          <tr><td>${esc(tr("Besoins demandés"))}</td><td class="r num"><b>${d.needs.length}</b></td></tr><tr><td>${esc(tr("Consignes publiées"))}</td><td class="r num"><b>${d.ins.length}</b></td></tr>
          <tr><td>${esc(tr("Formations station signées"))}</td><td class="r num"><b>${d.ind.length}</b></td></tr></tbody></table></section></div>`;
  }
};
ACTIONS["rp-go"] = el => { const [y, m] = rpMonth().split("-").map(Number), d = new Date(Date.UTC(y, m - 1 + +el.dataset.n, 1)); UI.rpMonth = d.toISOString().slice(0, 7); render(true); };
ACTIONS["rp-print"] = () => window.print();
