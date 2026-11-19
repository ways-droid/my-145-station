"use strict";
/* ======================= COMPTABILITÉ ANALYTIQUE =======================
   Chaque recette et chaque dépense est rattachée à des objets de l'ERP, sur plusieurs axes indépendants
   (véhicules, outils, articles, clients, centres de coût). Les rattachements viennent :
   • des lignes de factures / notes de crédit : article, véhicule lié, outil étalonné, et le client du document ;
   • des factures d'achat : affectation saisie sur la facture (objets + %), ou règle par fournisseur (Paramètres de l'analytique) ;
   • des interventions sur véhicule (coût HT) et des amendes à charge de W.A.Y.S. : le véhicule concerné.
   Montants HT, sauf les factures d'achat dont seul le TTC est connu (le HT peut être saisi sur la facture). */
const AN_AXES = {
  vehicles: { lbl: "Véhicules", ic: "🚗", one: "véhicule", name: id => typeof vehLabel === "function" ? vehLabel(id) : id, act: "veh-open", list: () => S.vehicles },
  tools: { lbl: "Outils", ic: "🔧", one: "outil", name: id => { const t = (S.tools || []).find(x => x.id === id); return t ? [t.serial, t.name || t.model].filter(Boolean).join(" · ") : "Outil supprimé"; }, act: "tool-open", list: () => S.tools || [] },
  products: { lbl: "Articles", ic: "🏷", one: "article", name: id => (S.products.find(p => p.id === id) || {}).name || "Article supprimé", act: "prod-form", list: () => S.products },
  clients: { lbl: "Clients", ic: "🏢", one: "client", name: id => clientName(id), act: "client-form", list: () => S.clients },
  centres: { lbl: "Centres de coût", ic: "🎯", one: "centre", name: id => (anCfg().centres.find(c => c.id === id) || {}).name || "Centre supprimé", list: () => anCfg().centres }
};
const anCfg = () => { const a = settings().analytic || {}; return { axes: a.axes || Object.keys(AN_AXES), centres: a.centres || [], rules: a.rules || [] }; };
const anAxesOn = () => anCfg().axes.filter(k => AN_AXES[k]);
const anFilt = () => UI.anF || (UI.anF = { year: today().slice(0, 4), q: "", empty: false });
const anKeyName = r => (AN_AXES[r.coll] || {}).name?.(r.id) || r.id;

/* ---------- écritures analytiques ---------- */
function anRuleFor(p) {
  const n = acNorm(p.supplierName || ""), v = String(p.supplierVat || "").replace(/\W/g, "").toUpperCase();
  return anCfg().rules.find(r => r.match && (acNorm(r.match) && n.includes(acNorm(r.match)) || (v && String(r.match).replace(/\W/g, "").toUpperCase() === v)));
}
function anEntries(year) {
  const inP = d => !year || String(d || "").startsWith(year), out = [];
  for (const d of (typeof issued === "function" ? issued() : [])) {
    if (!inP(d.date)) continue;
    const sg = d.kind === "nc" ? -1 : 1;
    for (const l of d.lines || []) {
      if (l.kind === "section" || l.kind === "note") continue;
      const amt = r2f(sg * (+l.qty || 0) * (+l.price || 0)); if (!amt) continue;
      const refs = [{ coll: "clients", id: d.clientId, pct: 100 }];
      if (l.productId && l.productId !== CAL_GENERIC) refs.push({ coll: "products", id: l.productId, pct: 100 });
      if (l.vehicleId) refs.push({ coll: "vehicles", id: l.vehicleId, pct: 100 });
      if (l.toolId) refs.push({ coll: "tools", id: l.toolId, pct: 100 });
      out.push({ date: d.date, amount: amt, kind: "rev", src: { coll: "docs", id: d.id, act: "doc-open", label: `${d.kind === "nc" ? "NC" : "Facture"} ${d.number} · ${l.label || ""}` }, refs });
    }
  }
  const purAllocNums = new Set();
  for (const p of S.purchases || []) {
    if (!inP(p.date) || p.archived) continue;
    const base = p.htAmount != null && p.htAmount !== "" ? +p.htAmount : +p.amount || 0, amt = r2f((p.credit ? 1 : -1) * base);
    let refs = (p.alloc || []).filter(a => a.coll && a.id), how = "affectation";
    if (!refs.length) { const r = anRuleFor(p); if (r) { refs = [{ coll: r.coll, id: r.id, pct: 100 }]; how = "règle"; } }
    if (refs.some(r => r.coll === "vehicles")) purAllocNums.add(String(p.number || "").toLowerCase());
    out.push({ date: p.date, amount: amt, kind: "cost", ttc: p.htAmount == null || p.htAmount === "", how, src: { coll: "purchases", id: p.id, act: "pur-open", label: `Achat ${p.number || ""} · ${p.supplierName || ""}` }, refs, alloc: true });
  }
  for (const e of S.vehEvents || []) {
    if (!inP(e.date) || e.status === "planifiee" || !(+e.cost)) continue;
    if (e.invoiceRef && purAllocNums.has(String(e.invoiceRef).toLowerCase())) continue;   // déjà compté via la facture d'achat affectée au véhicule
    out.push({ date: e.date, amount: -r2f(e.cost), kind: "cost", src: { coll: "vehEvents", id: e.id, act: "ev-form", label: `Intervention · ${e.description || e.type || ""}${e.supplier ? " · " + e.supplier : ""}` }, refs: [{ coll: "vehicles", id: e.vehicleId, pct: 100 }] });
  }
  if (typeof fineStage === "function") for (const f of S.fines || []) {
    if (!inP(f.date) || f.bearer !== "societe" || !fineIsPaid(f)) continue;
    out.push({ date: f.date, amount: -fineAmt(f), kind: "cost", src: { coll: "fines", id: f.id, act: "fine-form", label: `Amende ${f.pvNumber || ""}` }, refs: [{ coll: "vehicles", id: f.vehicleId, pct: 100 }] });
  }
  return out;
}
/* totaux par objet sur un axe */
function anByAxis(axis, entries) {
  const by = {}, none = { rev: 0, cost: 0, n: 0, items: [] };
  for (const e of entries) {
    const rs = e.refs.filter(r => r.coll === axis && r.id);
    if (!rs.length) { if (e.alloc || (axis === "vehicles" && e.kind === "cost")) { none[e.kind] += e.amount; none.n++; none.items.push(e); } continue; }
    const tot = rs.reduce((a, r) => a + (+r.pct || 0), 0) || 100;
    for (const r of rs) { const part = r2f(e.amount * (+r.pct || 0) / (tot > 100 ? tot : 100));
      const o = by[r.id] || (by[r.id] = { id: r.id, rev: 0, cost: 0, n: 0, items: [] }); o[e.kind] += part; o.n++; o.items.push(Object.assign({}, e, { part })); }
  }
  return { rows: Object.values(by).map(o => Object.assign(o, { rev: r2f(o.rev), cost: r2f(o.cost), margin: r2f(o.rev + o.cost) })), none };
}

/* ---------- vue ---------- */
VIEWS.analytique = { title: "Comptabilité analytique", render: () => {
  const axes = anAxesOn(), t = axes.includes(UI.tab.analytique) || UI.tab.analytique === "anparam" ? UI.tab.analytique : axes[0] || "anparam";
  const f = anFilt();
  const years = [...new Set([...S.docs.map(d => (d.date || "").slice(0, 4)), ...(S.purchases || []).map(p => (p.date || "").slice(0, 4))].filter(Boolean))].sort().reverse();
  const tb = tabs("analytique", [...axes.map(k => [k, AN_AXES[k].lbl]), ["anparam", "Paramètres"]]);
  const entries = anEntries(f.year);
  const rev = entries.filter(e => e.kind === "rev").reduce((a, e) => a + e.amount, 0), cost = entries.filter(e => e.kind === "cost").reduce((a, e) => a + e.amount, 0);
  const unalloc = entries.filter(e => e.alloc && !e.refs.length);
  const sub = `${f.year || "Toutes les années"} · recettes ${eur0(rev)} HT · dépenses ${eur0(-cost)} · résultat ${eur0(rev + cost)}`;
  const yearSel = `<select class="fsel" id="an-year" aria-label="Période"><option value="">Toutes les années</option>${years.map(y => `<option ${y === f.year ? "selected" : ""}>${y}</option>`).join("")}</select>`;
  if (t === "anparam") return head("Comptabilité analytique", sub) + tb + anParamView();
  const A = AN_AXES[t], { rows, none } = anByAxis(t, entries), q = (UI.q || "").toLowerCase();
  let list = rows;
  if (f.empty) { const have = new Set(rows.map(r => r.id)); list = rows.concat(A.list().filter(x => !have.has(x.id) && !x.archived).map(x => ({ id: x.id, rev: 0, cost: 0, margin: 0, n: 0, items: [] }))); }
  list = list.filter(r => !q || anKeyName({ coll: t, id: r.id }).toLowerCase().includes(q)).sort((a, b) => b.rev - a.rev || a.cost - b.cost);
  const mx = Math.max(1, ...list.map(r => Math.max(r.rev, -r.cost)));
  const bar = (v, cls) => `<span class="an-bar ${cls}"><i style="width:${Math.min(100, Math.abs(v) / mx * 100)}%"></i></span>`;
  return head("Comptabilité analytique", sub, yearSel) + tb +
    (unalloc.length ? `<div class="banner warn">${unalloc.length} ${unalloc.length > 1 ? "factures" : "facture"} d'achat sans affectation (${eur0(-unalloc.reduce((a, e) => a + e.amount, 0))}) : <button class="linkbtn" data-a="an-none" data-axis="${t}">les affecter</button> ou créer une règle par fournisseur dans ⚙ Paramètres.</div>` : "") +
    `<div class="panel"><div class="toolbar"><input type="search" id="q" placeholder="${esc(tr("Rechercher"))} ${esc(tr(A.one))}…" value="${esc(UI.q)}"><label class="small"><input type="checkbox" id="an-empty" ${f.empty ? "checked" : ""}> ${esc(tr("Afficher aussi les objets sans mouvement"))}</label></div>
    ${list.length || none.n ? `<div class="tablewrap"><table class="an-t"><thead><tr><th>${esc(tr(A.lbl))}</th><th class="r">Recettes HT</th><th></th><th class="r">Dépenses</th><th></th><th class="r">Résultat</th><th class="r">Écritures</th></tr></thead><tbody>
    ${list.map(r => `<tr class="click" data-a="an-detail" data-axis="${t}" data-id="${esc(r.id)}"><td><b>${esc(anKeyName({ coll: t, id: r.id }))}</b></td><td class="r num">${r.rev ? eur(r.rev) : "—"}</td><td>${bar(r.rev, "rev")}</td>
      <td class="r num">${r.cost ? eur(-r.cost) : "—"}</td><td>${bar(r.cost, "cost")}</td><td class="r num"><b class="${r.margin < 0 ? "txt-bad" : r.margin > 0 ? "txt-good" : ""}">${eur(r.margin)}</b></td><td class="r num muted">${r.n}</td></tr>`).join("")}
    ${none.n ? `<tr class="click an-none" data-a="an-none" data-axis="${t}"><td><i>${esc(tr("Non affecté à un " + A.one))}</i></td><td class="r num">${none.rev ? eur(none.rev) : "—"}</td><td></td><td class="r num">${none.cost ? eur(-none.cost) : "—"}</td><td></td><td class="r num">${eur(none.rev + none.cost)}</td><td class="r num muted">${none.n}</td></tr>` : ""}
    </tbody></table></div>` : `<div class="empty">${esc(tr("Rien sur cette période."))}</div>`}</div>
    <div class="hint">${esc(tr(t === "vehicles" ? "Recettes : lignes de facture liées au véhicule. Dépenses : factures d'achat affectées, interventions (coût HT) et amendes à charge de W.A.Y.S." : t === "clients" ? "Recettes facturées par client. Les dépenses peuvent être affectées à un client depuis une facture d'achat." : t === "centres" ? "Centres de coût libres (Bureau, Atelier, Gaz…), définis dans ⚙ Paramètres et utilisés dans les affectations des factures d'achat." : "Recettes : lignes de facture de cet objet. Dépenses : factures d'achat affectées."))} ${esc(tr("Factures d'achat : montant TTC tant que le HT n'est pas saisi sur la facture."))}</div>`;
} };
document.addEventListener("change", e => {
  if (e.target.id === "an-year") { anFilt().year = e.target.value; render(true); }
  if (e.target.id === "an-empty") { anFilt().empty = e.target.checked; render(true); }
});
function anItemsHtml(items) {
  return `<div class="tablewrap" style="max-height:420px;overflow:auto"><table><thead><tr><th>Date</th><th>Pièce</th><th class="r">Montant</th></tr></thead><tbody>${items.sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(e => `<tr class="click" data-a="${e.src.act}" data-id="${esc(e.src.id)}"><td class="num nowrap">${fmtDate(e.date)}</td><td>${esc(e.src.label)}${e.how === "règle" ? ` <span class="chip">règle</span>` : ""}${e.ttc && e.src.coll === "purchases" ? ` <span class="chip" title="${esc(tr("Montant HT non saisi"))}">TTC</span>` : ""}</td><td class="r num ${e.amount < 0 ? "txt-bad" : ""}">${eur(e.part ?? e.amount)}</td></tr>`).join("")}</tbody></table></div>`;
}
ACTIONS["an-detail"] = el => {
  const axis = el.dataset.axis, id = el.dataset.id, { rows } = anByAxis(axis, anEntries(anFilt().year)), r = rows.find(x => x.id === id) || { rev: 0, cost: 0, margin: 0, items: [] }, A = AN_AXES[axis];
  modal(`${mHead(`${A.ic} ${esc(anKeyName({ coll: axis, id }))}`)}<div class="body stack-s"><div class="rm-sum"><span>Recettes <b>${eur(r.rev)}</b></span><span>Dépenses <b>${eur(-r.cost)}</b></span><span>Résultat <b>${eur(r.margin)}</b></span><span class="muted">${esc(anFilt().year || "toutes années")}</span></div>
    ${r.items.length ? anItemsHtml(r.items) : `<div class="muted">Aucune écriture.</div>`}</div><footer>${A.act ? `<div class="left"><button class="btn" data-a="${A.act}" data-id="${esc(id)}">Ouvrir la fiche</button></div>` : ""}<button class="btn primary" data-close>Fermer</button></footer>`, "lg");
};
ACTIONS["an-none"] = el => {
  const axis = el.dataset.axis, { none } = anByAxis(axis, anEntries(anFilt().year));
  modal(`${mHead("Non affecté · " + esc(tr(AN_AXES[axis].lbl)))}<div class="body stack-s"><div class="muted small">Ouvrez une facture d'achat pour l'affecter (section « Affectation analytique »).</div>${anItemsHtml(none.items)}</div><footer><button class="btn primary" data-close>Fermer</button></footer>`, "lg");
};

/* ---------- recherche d'un objet d'affectation ---------- */
function anSearch(q) {
  q = acNorm(q).trim(); if (q.length < 2) return [];
  const out = [];
  for (const k of anAxesOn()) { if (k === "clients" && false) continue;
    for (const x of AN_AXES[k].list()) { if (x.archived) continue; const n = AN_AXES[k].name(x.id); if (acNorm(n).includes(q)) out.push({ coll: k, id: x.id, label: n }); if (out.length > 30) break; } }
  return out;
}
/* champ « affecter à… » réutilisable : host = élément, list = tableau [{coll,id,pct}] modifié sur place, onChange() */
function anAllocEditor(host, list, onChange) {
  const draw = () => {
    const tot = list.reduce((a, r) => a + (+r.pct || 0), 0);
    host.innerHTML = `${list.map((r, i) => `<span class="an-chip">${AN_AXES[r.coll]?.ic || "🔗"} ${esc(anKeyName(r))} <input type="number" min="0" max="100" step="1" value="${+r.pct || 0}" data-ap="${i}" aria-label="%"> % <button type="button" class="x" data-ad="${i}" aria-label="Retirer">×</button></span>`).join("")}
      ${list.length && Math.abs(tot - 100) > 0.5 ? `<span class="chip warn">${esc(tr("total"))} ${tot} %</span>` : ""}
      <span class="nt-linkbox"><input class="sm an-q" placeholder="🔗 ${esc(tr("Affecter à : plaque, outil, article, client, centre…"))}"><div class="ac-pop an-res" hidden></div></span>`;
    const inp = host.querySelector(".an-q"), res = host.querySelector(".an-res");
    inp.addEventListener("input", () => { const r = anSearch(inp.value); res._r = r; res.hidden = !r.length; res.innerHTML = r.map((x, i) => `<button type="button" class="ac-item" data-ai="${i}">${AN_AXES[x.coll].ic} ${esc(x.label)} <span class="muted small">${esc(tr(AN_AXES[x.coll].one))}</span></button>`).join(""); });
    res.addEventListener("mousedown", e => { const b = e.target.closest("[data-ai]"); if (!b) return; e.preventDefault(); const x = res._r[+b.dataset.ai];
      if (!list.some(r => r.coll === x.coll && r.id === x.id)) { const same = list.filter(r => r.coll === x.coll), left = 100 - same.reduce((a, r) => a + (+r.pct || 0), 0); list.push({ coll: x.coll, id: x.id, pct: left > 0 ? left : 100 }); }
      onChange && onChange(); draw(); host.querySelector(".an-q").focus(); });
    inp.addEventListener("blur", () => setTimeout(() => { res.hidden = true; }, 150));
  };
  host.addEventListener("input", e => { if (e.target.dataset.ap != null) { list[+e.target.dataset.ap].pct = +e.target.value || 0; onChange && onChange(); } });
  host.addEventListener("change", e => { if (e.target.dataset.ap != null) draw(); });
  host.addEventListener("click", e => { const b = e.target.closest("[data-ad]"); if (b) { list.splice(+b.dataset.ad, 1); onChange && onChange(); draw(); } });
  draw();
}
/* section dans la fiche d'une facture d'achat */
function purAllocHtml(p) {
  const r = !(p.alloc || []).length ? anRuleFor(p) : null;
  return `<div class="stack-s an-box"><b class="small">Affectation analytique</b>
    <div class="muted small">À quoi se rapporte cette dépense ? Plusieurs objets possibles (en %), sur des axes différents (ex. 100 % véhicule 009 et 100 % centre « Flotte »).${r ? ` Règle appliquée par défaut : <b>${esc(anKeyName(r))}</b>.` : ""}</div>
    <div id="pur-alloc" class="row-g wrap"></div>
    <div class="row-g wrap">${field("pur-ht", "Montant HT (si connu)", p.htAmount ?? "", { type: "number", step: "0.01", ph: "TTC : " + fmtN.format(+p.amount || 0) })}<button type="button" class="btn sm" id="pur-alloc-save" ${dis()}>Enregistrer l'affectation</button></div></div>`;
}
function purAllocBind(m, p) {
  const host = m.querySelector("#pur-alloc"); if (!host) return;
  const list = JSON.parse(JSON.stringify(p.alloc || []));
  anAllocEditor(host, list);
  m.querySelector("#pur-alloc-save").onclick = async () => { const ht = val("pur-ht"); await patch("purchases", p.id, { alloc: list.length ? list : null, htAmount: ht === "" ? null : +ht }); toast("Affectation enregistrée"); };
}

/* ---------- paramètres ---------- */
function anParamView() {
  const c = anCfg();
  return `<div class="panel pad stack" style="max-width:900px">
    <div><h3 class="np">Axes affichés</h3><div class="row-g wrap">${Object.entries(AN_AXES).map(([k, A]) => `<label class="chk"><input type="checkbox" data-anaxis="${k}" ${c.axes.includes(k) ? "checked" : ""} ${readOnly ? "disabled" : ""}> ${A.ic} ${esc(tr(A.lbl))}</label>`).join("")}</div></div>
    <div><h3 class="np">Centres de coût</h3><div class="muted small">Regroupements libres pour les dépenses qui ne concernent pas un objet précis (Bureau, Atelier, Gaz, Marketing…).</div>
      <div class="row-g wrap" style="margin-top:6px">${c.centres.map(x => `<span class="an-chip">🎯 ${esc(x.name)} <button type="button" class="x" data-a="an-centre-del" data-id="${x.id}" aria-label="Supprimer">×</button></span>`).join("") || `<span class="muted small">Aucun centre.</span>`}</div>
      ${readOnly ? "" : `<div class="row-g wrap" style="margin-top:6px"><input id="an-cname" class="sm" placeholder="Nouveau centre de coût"><button class="btn sm" data-a="an-centre-add">Ajouter</button></div>`}</div>
    <div><h3 class="np">Règles par fournisseur</h3><div class="muted small">Une facture d'achat sans affectation dont le fournisseur correspond (nom contenant le texte, ou n° de TVA) est affectée automatiquement. Une affectation saisie sur la facture a toujours priorité.</div>
      ${c.rules.length ? `<table class="mini"><thead><tr><th>Fournisseur contient / TVA</th><th>Affecté à</th><th></th></tr></thead><tbody>${c.rules.map((r, i) => `<tr><td>${esc(r.match)}</td><td>${AN_AXES[r.coll]?.ic || ""} ${esc(anKeyName(r))}</td><td><button class="x" data-a="an-rule-del" data-i="${i}" aria-label="Supprimer">×</button></td></tr>`).join("")}</tbody></table>` : `<div class="muted small" style="margin-top:6px">Aucune règle.</div>`}
      ${readOnly ? "" : `<div class="row-g wrap" style="margin-top:6px"><input id="an-rmatch" class="sm" placeholder="Ex. Total Energies, BE0403…" list="an-sups"><datalist id="an-sups">${[...new Set((S.purchases || []).map(p => p.supplierName).filter(Boolean))].sort().map(n => `<option value="${esc(n)}">`).join("")}</datalist><span id="an-rtarget" class="row-g"></span><button class="btn sm" data-a="an-rule-add">Ajouter la règle</button></div>`}</div>
  </div>`;
}
VIEWS.analytique.after = () => { const h = document.getElementById("an-rtarget"); if (h) { UI.anRule = []; anAllocEditor(h, UI.anRule, () => { if (UI.anRule.length > 1) UI.anRule.splice(0, UI.anRule.length - 1); }); } };
const anSave = async patchObj => { await saveSettings({ analytic: Object.assign({}, settings().analytic || {}, anCfg(), patchObj) }); render(true); };
document.addEventListener("change", e => { const k = e.target.dataset && e.target.dataset.anaxis; if (!k) return; const ax = new Set(anCfg().axes); e.target.checked ? ax.add(k) : ax.delete(k); anSave({ axes: Object.keys(AN_AXES).filter(x => ax.has(x)) }); });
ACTIONS["an-centre-add"] = () => { const n = val("an-cname").trim(); if (!n) return; anSave({ centres: [...anCfg().centres, { id: uid(), name: n }] }); };
ACTIONS["an-centre-del"] = el => confirmBox("Supprimer ce centre de coût ? Les affectations qui l'utilisent n'apparaîtront plus.", () => anSave({ centres: anCfg().centres.filter(c => c.id !== el.dataset.id) }));
ACTIONS["an-rule-add"] = () => { const m = val("an-rmatch").trim(), t = (UI.anRule || [])[0]; if (!m || !t) { toast("Indiquez le fournisseur et l'objet d'affectation."); return; } anSave({ rules: [...anCfg().rules, { match: m, coll: t.coll, id: t.id }] }); };
ACTIONS["an-rule-del"] = el => { const r = anCfg().rules.slice(); r.splice(+el.dataset.i, 1); anSave({ rules: r }); };
