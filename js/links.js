"use strict";
/* ======================= LIENS ENTRE FICHES =======================
   Section « 🔗 Liens » commune aux fiches (véhicule, outil, client, article, panne, intervention, note).
   • liens manuels : collection « links » {a:{coll,id}, b:{coll,id}} — symétriques ;
   • liens déjà connus de l'outil, affichés automatiquement (lecture seule) : véhicule d'une panne ou d'une intervention,
     client d'un outil ou d'un article, liens posés dans les notes. */
Object.assign(NOTE_LINK, {
  vehEvents: { ic: "🛠", act: "ev-form", lbl: e => `Intervention ${e.date ? fmtDate(e.date) : ""} · ${e.description || e.type || ""}${e.vehicleId && veh(e.vehicleId) ? " · " + veh(e.vehicleId).plate : ""}` },
  products: { ic: "🏷", act: "prod-form", lbl: p => `Article ${p.ref ? p.ref + " · " : ""}${p.name || ""}` },
  notes: { ic: "🗒", act: "note-form", lbl: n => `Note · ${n.title || (n.body || "").slice(0, 40) || "sans titre"}` }
});
const lkSame = (r, coll, id) => r && r.coll === coll && r.id === id;
const lkLabel = r => { const L = NOTE_LINK[r.coll], x = (S[r.coll] || []).find(y => y.id === r.id); if (!L || !x) return null; try { return L.lbl(x) || null; } catch { return null; } };

/* liens connus de l'outil (lecture seule) : [{coll,id,why}] */
function lkImplicit(coll, id) {
  const out = [], add = (c, i, why) => { if (c && i && !(c === coll && i === id) && !out.some(o => o.coll === c && o.id === i)) out.push({ coll: c, id: i, why }); };
  const me = (S[coll] || []).find(x => x.id === id) || {};
  /* champs de la fiche elle-même */
  if (me.vehicleId) add("vehicles", me.vehicleId, "véhicule");
  if (me.clientId) add("clients", me.clientId, "client");
  /* fiches qui pointent vers celle-ci */
  if (coll === "vehicles") {
    for (const f of S.faults || []) if (f.vehicleId === id) add("faults", f.id, "panne");
    for (const e of S.vehEvents || []) if (e.vehicleId === id) add("vehEvents", e.id, "intervention");
  }
  if (coll === "clients") { for (const t of S.tools || []) if (t.clientId === id) add("tools", t.id, "outil du client"); for (const p of S.products || []) if (p.clientId === id) add("products", p.id, "tarif"); }
  for (const n of S.notes || []) if ((n.links || []).some(l => l.coll === coll && l.id === id)) add("notes", n.id, "note");
  if (coll === "notes") for (const l of me.links || []) add(l.coll, l.id, "lien de la note");
  return out;
}
/* liens manuels */
const lkManual = (coll, id) => (S.links || []).filter(l => lkSame(l.a, coll, id) || lkSame(l.b, coll, id)).map(l => Object.assign({ linkId: l.id, note: l.note || "" }, lkSame(l.a, coll, id) ? l.b : l.a));

function lkDraw(box) {
  const coll = box.dataset.lkColl, id = box.dataset.lkId, can = !readOnly;
  const man = lkManual(coll, id).map(r => Object.assign(r, { label: lkLabel(r) })).filter(r => r.label);
  const imp = lkImplicit(coll, id).filter(r => !man.some(m => m.coll === r.coll && m.id === r.id)).map(r => Object.assign(r, { label: lkLabel(r) })).filter(r => r.label);
  const LIM = 12, open = box.dataset.all === "1";
  const chip = (r, del) => { const L = NOTE_LINK[r.coll];
    return `<span class="nlink ${del ? "" : "lk-auto"}"><button type="button" class="lk-go" data-a="${L.act}" ${L.by ? `data-name="${esc((S[r.coll] || []).find(x => x.id === r.id)?.[L.by] || "")}"` : `data-id="${esc(r.id)}"`} title="${esc(tr(del ? "Ouvrir" : "Lien automatique : " + r.why))}">${L.ic} ${esc(r.label)}</button>${del && can ? `<button type="button" class="x" data-lk-del="${esc(r.linkId)}" aria-label="${esc(tr("Retirer le lien"))}">×</button>` : ""}</span>`; };
  box.innerHTML = `<div class="lk-h"><b class="small">🔗 ${esc(tr("Liens"))}</b>${man.length + imp.length ? ` <span class="muted small">${man.length + imp.length}</span>` : ""}</div>
    <div class="n-links">${man.map(r => chip(r, true)).join("")}${(open ? imp : imp.slice(0, LIM)).map(r => chip(r, false)).join("")}${!open && imp.length > LIM ? `<button type="button" class="linkbtn small" data-lk-all>+ ${imp.length - LIM} ${esc(tr("autres"))}</button>` : ""}
    ${!man.length && !imp.length ? `<span class="muted small">${esc(tr("Aucun lien."))}</span>` : ""}</div>
    ${can ? `<span class="nt-linkbox"><input class="sm lk-q" placeholder="🔗 ${esc(tr("Lier à une autre fiche : plaque, client, outil, article…"))}"><div class="ac-pop lk-res" hidden></div></span>` : ""}`;
  const inp = box.querySelector(".lk-q"), res = box.querySelector(".lk-res");
  if (!inp) return;
  inp.addEventListener("input", () => { const r = noteLinkSearch(inp.value).filter(x => !(x.coll === coll && x.id === id) && !man.some(m => m.coll === x.coll && m.id === x.id)); res._r = r; res.hidden = !r.length;
    res.innerHTML = r.map((x, i) => `<button type="button" class="ac-item" data-li="${i}">${(NOTE_LINK[x.coll] || {}).ic || "🔗"} ${esc(x.label)}</button>`).join(""); });
  res.addEventListener("mousedown", async e => { const b = e.target.closest("[data-li]"); if (!b) return; e.preventDefault(); const x = res._r[+b.dataset.li];
    res.hidden = true; inp.value = "";
    await save("links", null, { a: { coll, id }, b: { coll: x.coll, id: x.id }, by: ME?.name || "", at: new Date().toISOString() });
    toast(`${tr("Lien ajouté")} : ${x.label}`); setTimeout(() => lkDraw(box), 300); });
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); res.querySelector("[data-li]")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); } });
  inp.addEventListener("blur", () => setTimeout(() => { res.hidden = true; }, 150));
}
/* ajoute la section à la fenêtre qui vient de s'ouvrir */
function lkAppend(coll, id) {
  if (!id) return;
  const body = document.querySelector("#modal-root .modal .body"); if (!body || body.querySelector(".lk-box")) return;
  const box = document.createElement("div"); box.className = "lk-box"; box.dataset.lkColl = coll; box.dataset.lkId = id; body.appendChild(box); lkDraw(box);
}
/* fiches équipées : on enveloppe leur ouverture */
(() => {
  const wrapA = (name, coll, idOf) => { const f = ACTIONS[name]; if (!f) return; ACTIONS[name] = async (el, e) => { const r = await f(el, e); lkAppend(coll, idOf(el)); return r; }; };
  const byId = el => el && el.dataset && el.dataset.id;
  wrapA("fault-open", "faults", byId); wrapA("client-form", "clients", byId);
  wrapA("prod-form", "products", byId); wrapA("ev-form", "vehEvents", byId);
  const ov = openVehicle; openVehicle = async id => { const r = await ov(id); lkAppend("vehicles", id); return r; };
  const ot = openTool; openTool = async id => { const r = await ot(id); lkAppend("tools", id); return r; };
})();
document.addEventListener("click", async e => {
  const d = e.target.closest("[data-lk-del]"); if (d) { e.preventDefault(); e.stopPropagation(); const box = d.closest(".lk-box"); await remove("links", d.dataset.lkDel); setTimeout(() => lkDraw(box), 300); return; }
  const a = e.target.closest("[data-lk-all]"); if (a) { const box = a.closest(".lk-box"); box.dataset.all = "1"; lkDraw(box); }
});
