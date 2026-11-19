"use strict";
/* ======================= Factures, devis, achats : dupliquer, naviguer, relier un paiement ======================= */

/* ---- navigation Précédent / Suivant dans la liste filtrée qui était affichée ---- */
UI.nav = UI.nav || {};
function navBar(key, id, act) {
  const ids = UI.nav[key] || [], i = ids.indexOf(id);
  if (i < 0 || ids.length < 2) return "";
  const prev = ids[i - 1], next = ids[i + 1];
  return `<div class="docnav" role="navigation" aria-label="${esc(tr("Parcourir la liste"))}">
    <button class="btn sm" ${prev ? `data-a="${act}" data-id="${prev}"` : "disabled"} data-nav="prev" title="${esc(tr("Précédent"))} (←)">‹ ${esc(tr("Précédent"))}</button>
    <span class="muted small">${i + 1} / ${ids.length}${UI.q || UI.filter !== "tous" ? ` · ${esc(tr("liste filtrée"))}` : ""}</span>
    <button class="btn sm" ${next ? `data-a="${act}" data-id="${next}"` : "disabled"} data-nav="next" title="${esc(tr("Suivant"))} (→)">${esc(tr("Suivant"))} ›</button></div>`;
}
/* flèches du clavier quand une fiche avec navigation est ouverte (hors saisie) */
document.addEventListener("keydown", e => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const ae = document.activeElement; if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  const b = document.querySelector(`.modal .docnav [data-nav="${e.key === "ArrowLeft" ? "prev" : "next"}"]:not([disabled])`);
  if (b) { e.preventDefault(); b.click(); }
});

/* ---- dupliquer une facture ou un devis : brouillon identique, sans les liens (outils, livraison, Odoo, paiements…) ---- */
const DUP_LINE_DROP = ["toolId", "newTool", "ro", "deliveryId", "moveId", "bottleId", "jobId", "odooLineId"];
ACTIONS["doc-dup"] = () => {
  const d = curDoc(); if (!d) return;
  const kind = d.kind === "devis" ? "devis" : "facture", s = settings();
  let cal = 0;
  const lines = clone(d.lines || []).map(l => {
    if (typeof isCalLine === "function" && isCalLine(l)) { if (l.toolId || l.newTool) cal++; delete l.detail; }
    for (const k of DUP_LINE_DROP) delete l[k];
    return l;
  });
  const preset = { kind, number: nextNumber(kind), clientId: d.clientId, date: today(), dueDate: addDays(today(), kind === "devis" ? +s.quoteDays || 30 : +s.payDays || 30),
    status: "brouillon", title: d.title || "", lines, notes: d.deliveryId ? "" : (d.notes || ""), vatClauseOn: !!d.vatClauseOn, vatClause: d.vatClause || "" };
  closeModal(); docForm(kind, null, preset);
  toast(cal ? `Copie créée en brouillon : choisissez l'outil des ${plural(cal, "ligne")} d'étalonnage` : "Copie créée en brouillon : vérifiez-la puis enregistrez");
};

/* ---- relier un paiement bancaire depuis une facture (vente) ou une facture d'achat ---- */
function payPiece(coll, id, dir) {
  if (coll === "fines") { const f = (S.fines || []).find(x => x.id === id); if (!f) return null; const ref = dir === "refund";
    return { coll, d: f, dir: ref ? "refund" : "pay", number: f.pvNumber || "Amende", who: ref ? fineDebtor(f).name : (f.authName || FINE_AUTH[f.authority]?.[0] || ""), base: ref ? fineRefundAmt(f) : -fineAmt(f) }; }
  if (coll === "purchases") { const p = (S.purchases || []).find(x => x.id === id); return p && { coll, d: p, number: p.number || "", who: p.supplierName || "", base: purDue(p) }; }
  const d = S.docs.find(x => x.id === id); return d && { coll: "docs", d, number: d.number || "", who: clientName(d.clientId), base: baseDue(d) };
}
const r2p = v => Math.round(v * 100) / 100;
function payLinkBtn(coll, id) {
  if (readOnly || !(S.bankTx || []).length || !allowed("banque")) return "";
  if (coll === "docs") { const d = S.docs.find(x => x.id === id); if (!d || d.kind === "devis" || ["brouillon", "annulee"].includes(d.status)) return ""; }
  return `<button class="btn" data-a="pay-link" data-coll="${coll}" data-id="${id}">🔗 ${esc(tr("Relier un paiement"))}</button>`;
}
ACTIONS["pay-link"] = el => {
  const P = payPiece(el.dataset.coll, el.dataset.id, el.dataset.dir); if (!P) return;
  const isPur = P.coll === "purchases" || (P.coll === "fines" && P.dir === "pay"), isFine = P.coll === "fines";
  const linkedTo = t => txMatches(t).find(x => x.docId === P.d.id && (!isFine || Math.sign(+x.amount) === Math.sign(P.base)));
  const paid = (S.bankTx || []).reduce((a, t) => a + (+(linkedTo(t) || {}).amount || 0), 0);
  const due = r2p(P.base - paid), sgn = Math.sign(P.base) || (isPur ? -1 : 1);
  const used = t => txMatches(t).reduce((a, x) => a + (+x.amount || 0), 0);
  const rem = t => `${t.remittance || ""} ${t.description || ""}`;
  const cited = t => P.number && rem(t).toLowerCase().includes(P.number.toLowerCase());
  const who = (P.who || "").toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const near = t => who.some(w => (t.counterpart || "").toLowerCase().includes(w));
  /* mouvements dans le bon sens, avec un solde non encore affecté */
  const cand = (S.bankTx || []).filter(t => !linkedTo(t) && Math.sign(t.amount) === sgn && Math.abs(t.amount - used(t)) > 0.005)
    .map(t => ({ t, left: r2p(t.amount - used(t)) }))
    .sort((a, b) => (cited(b.t) - cited(a.t)) || ((Math.abs(b.left - due) < 0.01) - (Math.abs(a.left - due) < 0.01)) || (near(b.t) - near(a.t)) || (b.t.date || "").localeCompare(a.t.date || ""));
  const already = (S.bankTx || []).filter(linkedTo);
  const m = modal(`${mHead(`${esc(tr("Relier un paiement"))} · <span class="mono">${esc(P.number)}</span>`)}<div class="body stack-s">
    <div>${esc(P.who)} · ${esc(tr(isFine ? (P.dir === "refund" ? "remboursement de l'amende" : "paiement de l'amende") : isPur ? "facture d'achat" : P.d.kind === "nc" ? "note de crédit" : "facture"))} de <b>${eur(Math.abs(P.base))}</b> · ${Math.abs(due) < 0.005 ? `<span class="chip good">${esc(tr("entièrement reliée"))}</span>` : `${esc(tr("reste à relier"))} <b>${eur(Math.abs(due))}</b>`}</div>
    ${already.length ? `<div class="small muted">${esc(tr("Déjà relié"))} : ${already.map(t => `${typeof txLink === "function" ? txLink(t) : fmtDate(t.date)} (${eur(Math.abs(+linkedTo(t).amount || 0))})`).join(" · ")}</div>` : ""}
    <input type="search" id="pl-q" placeholder="${esc(tr("Rechercher : contrepartie, communication, montant, date…"))}" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid var(--line);background:var(--bg)">
    ${cand.length ? `<div class="tablewrap" style="max-height:380px;overflow:auto"><table><thead><tr><th>Date</th><th>Contrepartie / communication</th><th class="r">Disponible</th><th></th></tr></thead><tbody>
      ${cand.slice(0, 400).map(({ t, left }) => `<tr class="hov" data-hay="${esc([t.counterpart, rem(t), fmtDate(t.date), t.date, (t.counterIban || "")].join(" ").toLowerCase())}" data-amt="${Math.abs(left).toFixed(2)} ${Math.abs(t.amount).toFixed(2)}">
        <td class="num nowrap">${fmtDate(t.date)}</td><td><b>${esc(t.counterpart || "—")}</b>${cited(t) ? ` <span class="chip good">${esc(tr("cite le n°"))}</span>` : ""}${Math.abs(left - due) < 0.01 ? ` <span class="chip info">${esc(tr("montant exact"))}</span>` : ""}<div class="muted small">${esc(rem(t).trim().slice(0, 140))}</div></td>
        <td class="r num nowrap"><b>${eur(left)}</b>${Math.abs(left - t.amount) > 0.005 ? `<div class="muted small">${esc(tr("sur"))} ${eur(t.amount)}</div>` : ""}</td>
        <td class="r"><button class="btn sm primary" data-pl="${t.id}">${esc(tr("Relier"))}</button></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="panel empty">${esc(tr(isPur ? "Aucune sortie bancaire disponible (non encore reliée)." : "Aucune entrée bancaire disponible (non encore reliée)."))}</div>`}
    <div class="hint">${esc(tr("Le montant relié est le reste à payer de la pièce, plafonné par ce qui reste du mouvement. Pour répartir un mouvement sur plusieurs pièces, utilisez Banque."))}</div></div>
    <footer><button class="btn" data-close>Fermer</button></footer>`, "lg");
  const inp = m.querySelector("#pl-q"), rows = [...m.querySelectorAll("tbody tr")];
  inp.addEventListener("input", () => { const q = inp.value.trim().toLowerCase(), qn = typeof numQ === "function" ? numQ(inp.value) : q;
    rows.forEach(r => { r.style.display = !q || r.dataset.hay.includes(q) || (qn && r.dataset.amt.includes(qn)) ? "" : "none"; }); });
  setTimeout(() => inp.focus(), 50);
  m.addEventListener("click", async e => {
    const b = e.target.closest("[data-pl]"); if (!b) return;
    const c = cand.find(x => x.t.id === b.dataset.pl); if (!c) return; b.disabled = true;
    const amt = Math.abs(due) < 0.005 ? c.left : sgn * Math.min(Math.abs(due), Math.abs(c.left));
    const matches = [...txMatches(c.t), Object.assign({ docId: P.d.id, number: P.number, amount: r2p(amt), how: "manuel" }, isFine ? { coll: "fines" } : isPur ? { coll: "purchases" } : {})];
    await patch("bankTx", c.t.id, { matches, match: null, matchOff: null });
    closeModal(); toast(`${tr("Paiement relié")} : ${eur(amt)} · ${fmtDate(c.t.date)}`);
    setTimeout(() => isFine ? ACTIONS["fine-form"]({ dataset: { id: P.d.id } }) : isPur ? ACTIONS["pur-open"]({ dataset: { id: P.d.id } }) : openDoc(P.d.id), 300);
  });
};

/* ---- widget « Ventes » ---- */
if (typeof WIDGETS !== "undefined") WIDGETS.sales = { h: 10, t: "Ventes", ic: "💶", c: "yellow", m: "factures", size: "m", d: "Ventes du mois face au mois passé et à l'an dernier, meilleurs clients, devis en cours.",
  r() {
    const t = today(), ym = t.slice(0, 7), [Y, M] = ym.split("-").map(Number), day = +t.slice(8, 10);
    const pm = M === 1 ? `${Y - 1}-12` : `${Y}-${String(M - 1).padStart(2, "0")}`, ly = `${Y - 1}-${String(M).padStart(2, "0")}`;
    const inv = issued().map(d => ({ d, ht: signedTotals(d).ht }));
    const sum = (pre, uptoDay) => inv.filter(x => (x.d.date || "").startsWith(pre) && (!uptoDay || +(x.d.date || "").slice(8, 10) <= uptoDay)).reduce((a, x) => a + x.ht, 0);
    const cur = sum(ym), prevSame = sum(pm, day), lyM = sum(ly);
    const pct = (a, b) => b ? Math.round((a - b) / Math.abs(b) * 100) : null;
    const trend = (p, lbl) => p == null ? "" : `<span class="w-trend ${p >= 0 ? "up" : "down"}">${p >= 0 ? "▲" : "▼"} ${p > 500 ? "&gt; 500" : Math.abs(p)} %</span> <span class="muted small">${esc(tr(lbl))}</span>`;
    /* chiffre par jour du mois, cumulé, face au mois passé */
    const dim = new Date(Y, M, 0).getDate(), cum = (pre, n) => { const a = Array(n).fill(0); for (const x of inv) if ((x.d.date || "").startsWith(pre)) a[+(x.d.date || "").slice(8, 10) - 1] += x.ht; for (let i = 1; i < n; i++) a[i] += a[i - 1]; return a; };
    const a1 = cum(ym, dim).slice(0, day), a0 = cum(pm, dim), mx = Math.max(1, ...a1, ...a0), W = 300, H = 70;
    const path = arr => arr.map((v, i) => `${i ? "L" : "M"}${(i / (dim - 1) * W).toFixed(1)},${(H - v / mx * H).toFixed(1)}`).join("");
    const spark = `<svg viewBox="0 0 ${W} ${H + 4}" class="w-spark" preserveAspectRatio="none" role="img" aria-label="${esc(tr("Ventes cumulées du mois, comparées au mois passé"))}"><path d="${path(a0)}" class="s0"/><path d="${path(a1)}" class="s1"/></svg>`;
    /* meilleurs clients de l'année */
    const by = {}; for (const x of inv) if ((x.d.date || "").startsWith(String(Y))) by[x.d.clientId] = (by[x.d.clientId] || 0) + x.ht;
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5), tmax = top.length ? top[0][1] : 1;
    const q = S.docs.filter(d => d.kind === "devis"), qOpen = q.filter(d => d.status === "envoye"), qY = q.filter(d => (d.date || "").startsWith(String(Y)) && ["accepte", "refuse"].includes(d.status));
    const conv = qY.length ? Math.round(qY.filter(d => d.status === "accepte").length / qY.length * 100) : null;
    return `<div class="w-sales-top"><div><div class="muted small">${esc(MONTHS[M - 1])} ${Y}</div><div class="w-big">${eur0(cur)} <span class="muted small">HT</span></div>
        <div>${trend(pct(cur, prevSame), "vs même date le mois passé")}</div><div>${trend(pct(cur, lyM), MONTHS[M - 1] + " " + (Y - 1) + " (mois entier)")}</div></div>${spark}</div>
      <div class="w-legend small"><span><i style="background:var(--series-1)"></i>${esc(MONTHS[M - 1])}</span><span><i style="background:var(--ink-3)"></i>${esc(MONTHS[(M + 10) % 12])}</span></div>
      ${top.length ? `<div><div class="muted small" style="margin-bottom:4px">${esc(tr("Meilleurs clients"))} ${Y}</div>${top.map(([id, v]) => `<div class="w-bar"><span class="w-bar-l">${esc(clientName(id))}</span><span class="w-bar-t"><i style="width:${Math.max(3, v / tmax * 100)}%"></i></span><span class="num small">${eur0(v)}</span></div>`).join("")}</div>` : ""}
      <div class="w-stats">${wStat(qOpen.length, "devis en attente · " + eur0(qOpen.reduce((a, d) => a + totals(d).ht, 0)))}${conv != null ? wStat(conv + " %", "devis acceptés en " + Y, conv >= 50 ? "good" : "") : ""}</div>${wLink("factures", "Factures")}`;
  } };
