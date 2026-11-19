/* ======================= Achats : factures fournisseurs lues dans Falco ======================= */
/* Collection purchases/<fa-…> { number, date, dueDate, amount (TTC, positif), credit, currency, supplierName, supplierVat,
   paymentStatus (not_paid|partially_paid|paid), peppolStatus, files, inboundId, paymentRef, supplierIban, response, archived, note }
   Falco reçoit les factures via Peppol et les transmet au comptable ; l'ERP les lit (serveur, api/purchases.php). */
let FP = null, fpBusy = false, fpStarted = false;
const PAY_ST = { not_paid: ["Non payée", "warn"], partially_paid: ["Partiellement payée", "info"], paid: ["Payée", "good"] };
const RESP_ST = { accepted: ["Acceptée", "good"], rejected: ["Refusée", "bad"], under_query: ["En question", "warn"], paid: ["Payée (signalé)", "good"] };
const purDue = p => (p.credit ? 1 : -1) * (+p.amount || 0);      /* sens bancaire : une facture d'achat est une sortie */
/* payé d'après la banque : sorties reliées (Banque → Relier…) qui couvrent le montant */
let _pb = null, _pbAt = 0;
const purBank = id => {
  if (!_pb || Date.now() - _pbAt > 300) { _pb = {}; _pbAt = Date.now(); for (const t of S.bankTx || []) for (const x of txMatches(t)) if (x.coll === "purchases") _pb[x.docId] = (_pb[x.docId] || 0) + (+x.amount || 0); }
  return Math.abs(_pb[id] || 0);
};
const purSt = p => { if (p.paymentStatus === "paid") return "paid"; const b = purBank(p.id); return !b ? (p.paymentStatus || "not_paid") : b >= (+p.amount || 0) - 0.01 ? "paid" : "partially_paid"; };
/* paiement préparé via Ponto (collection payments) : état à afficher tant que la banque n'a pas confirmé */
const PAY_FLOW = { sign: ["💸 Paiement à signer", "pf-sign"], run: ["💸 Paiement en cours", "pf-run"], done: ["✅ Paiement exécuté", "pf-done"], ko: ["⚠ Paiement refusé", "pf-ko"] };
function purPayFlow(p) {
  if (purSt(p) === "paid") return null;
  const L = (S.payments || []).filter(x => x.purchaseId === p.id && !["cancelled", "canceled"].includes(x.status)).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const x = L[0]; if (!x) return null;
  const k = x.status === "unsigned" ? "sign" : x.status === "rejected" ? "ko" : /completed|with-change/.test(x.status) ? "done" : "run";
  return { k, pay: x, lbl: PAY_FLOW[k][0], cls: PAY_FLOW[k][1] };
}
const purFlowChip = f => `<span class="chip pflow ${f.cls}" title="${esc(tr("Préparé dans l'ERP le") + " " + fmtDate((f.pay.at || "").slice(0, 10)) + (f.pay.by ? " · " + f.pay.by : "") + " · " + eur(f.pay.amount))}">${esc(tr(f.lbl))}</span>`;
const purLinks = id => S.bankTx.filter(t => txMatches(t).some(x => x.docId === id));
async function fpRefresh() { try { FP = await API.call("GET", "achats/status"); } catch { FP = null; } return FP; }
async function fpTick(force) {
  if (!SERVER || !API || fpBusy || !isOffice()) return null;
  if (!FP) await fpRefresh();
  if (!FP || !FP.configured || (!force && document.hidden)) return null;
  fpBusy = true; let r;
  try { r = await API.call("POST", "achats/sync", force ? { force: true } : {}); } catch (e) { r = { ok: false, error: e.message }; }
  fpBusy = false;
  await fpRefresh();
  if (r && r.more) setTimeout(() => fpTick(true), 2000);
  if (location.hash === "#achats") render(true);
  return r;
}
function fpStart() {
  if (!SERVER || fpStarted) return; fpStarted = true;
  setTimeout(() => fpTick(), 10000);
  setInterval(() => fpTick(), 300000);
}

function purFilt() { UI.pf = UI.pf || { year: "", period: "", sup: "", pay: "", arch: false }; return UI.pf; }
VIEWS.achats = { title: "Achats - Dépenses", render: () => {
  const f = purFilt(), q = UI.q.toLowerCase(), qn = numQ(UI.q);
  const all = S.purchases.slice();
  if (SERVER && API && !FP && !fpBusy && !UI.fpAsked) { UI.fpAsked = true; fpRefresh().then(() => { render(true); if (!S.purchases.length) fpTick(true); }); }
  if (!all.length) return head("Achats - Dépenses", "Factures fournisseurs reçues dans Falco (Peppol)", `<a class="btn" href="#amendes">🚨 Amendes</a>`) + `<div class="panel empty">${!SERVER ? "Les factures d'achat arrivent depuis Falco sur le serveur ways.support."
    : !FP ? "Chargement…" : !FP.configured ? `Connectez d'abord Falco dans <a href="#parametres">Paramètres → Liaison Falco</a> : les factures fournisseurs qu'il reçoit via Peppol apparaîtront ici.`
    : FP.error ? `<div class="err">${esc(FP.error)}</div>` : `${FP.lastOk ? `Falco n'a renvoyé aucune facture d'achat (dernière lecture ${esc(tr(agoTxt(new Date(FP.lastOk).toISOString())))}).` : "Lecture des factures d'achat dans Falco…"} <button class="btn sm" data-a="pur-sync">Synchroniser maintenant</button>
      ${FP.diag && isAdmin() ? `<details style="margin-top:12px;text-align:left"><summary class="small muted">Détail technique (à me transmettre)</summary><pre class="small" style="white-space:pre-wrap;user-select:all">${esc(JSON.stringify(FP.diag, null, 1))}</pre></details>` : ""}`}</div>`;
  const years = [...new Set(all.map(p => (p.date || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const sups = [...new Set(all.map(p => p.supplierName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const nArch = all.filter(p => p.archived).length;
  const hay = p => `${p.number} ${p.supplierName} ${p.supplierVat} ${p.paymentRef || ""} ${p.note || ""}`.toLowerCase();
  const rows = all.filter(p => (f.arch || !p.archived) && docMatchPeriod(p.date, f) && (!f.sup || p.supplierName === f.sup)
      && (!f.pay || (f.pay === "late" ? purSt(p) !== "paid" && !p.credit && p.dueDate && p.dueDate < today() : f.pay === "ponto" ? !!purPayFlow(p) : f.pay === "not_paid" ? purSt(p) === "not_paid" && !purPayFlow(p) : purSt(p) === f.pay))
      && (!q || hay(p).includes(q) || (qn && Math.abs(+p.amount || 0).toFixed(2).includes(qn))))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.number || "").localeCompare(a.number || ""));
  const tot = rows.reduce((s, p) => s + (p.credit ? -1 : 1) * (+p.amount || 0), 0);
  const unpaid = rows.filter(p => !p.credit && purSt(p) !== "paid").reduce((s, p) => s + (+p.amount || 0), 0);
  const late = all.filter(p => !p.archived && !p.credit && purSt(p) !== "paid" && p.dueDate && p.dueDate < today());
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(tr(l))}</option>`;
  const bar = `<div class="toolbar df-bar">
    <label class="df"><span>Année</span><select data-pf="year">${opt("", "Toutes", f.year)}${years.map(y => opt(y, y, f.year)).join("")}</select></label>
    <label class="df"><span>Période</span><select data-pf="period">${opt("", f.year ? "Toute l'année" : "Toutes", f.period)}<optgroup label="${tr("Trimestres")}">${[1, 2, 3, 4].map(t => opt("T" + t, t + (t === 1 ? "er" : "e") + " trimestre", f.period)).join("")}</optgroup><optgroup label="${tr("Mois")}">${MONTHS_FULL.map((m, k) => opt(String(k + 1), m, f.period)).join("")}</optgroup></select></label>
    <label class="df"><span>Fournisseur</span><select data-pf="sup">${opt("", "Tous", f.sup)}${sups.map(x => opt(x, x, f.sup)).join("")}</select></label>
    <label class="df"><span>Paiement</span><select data-pf="pay">${opt("", "Tous", f.pay)}${opt("not_paid", "Non payées", f.pay)}${opt("ponto", "Paiement envoyé à Ponto", f.pay)}${opt("partially_paid", "Partiellement payées", f.pay)}${opt("paid", "Payées", f.pay)}${opt("late", "En retard", f.pay)}</select></label>
    ${f.year || f.period || f.sup || f.pay ? `<button class="linkbtn" data-a="pf-reset">Effacer les filtres</button>` : ""}</div>`;
  const cards = `<div class="tiles"><div class="panel tile c-orange"><div class="lbl">À payer</div><div class="val">${eur0(all.filter(p => !p.archived && !p.credit && purSt(p) !== "paid").reduce((s, p) => s + (+p.amount || 0), 0))}</div><div class="note">${plural(all.filter(p => !p.archived && !p.credit && purSt(p) !== "paid").length, "facture")}</div></div>
    <div class="panel tile c-red"><div class="lbl">En retard</div><div class="val">${eur0(late.reduce((s, p) => s + (+p.amount || 0), 0))}</div><div class="note">${plural(late.length, "facture")} échue${late.length > 1 ? "s" : ""}</div></div>
    ${(() => { const fl = all.filter(p => !p.archived && purPayFlow(p)), sg = fl.filter(p => purPayFlow(p).k === "sign"); return fl.length ? `<button class="panel tile c-orange ${purFilt().pay === "ponto" ? "sel" : ""}" data-a="pf-ponto"><div class="lbl">💸 Envoyés à Ponto</div><div class="val">${eur0(fl.reduce((s, p) => s + (+purPayFlow(p).pay.amount || 0), 0))}</div><div class="note">${plural(fl.length, "paiement")}${sg.length ? ` · <b>${sg.length} à signer</b>` : ""}</div></button>` : ""; })()}
    <div class="panel tile c-blue"><div class="lbl">Synchronisation Falco</div><div class="val sm">${FP && FP.lastOk ? esc(tr(agoTxt(new Date(FP.lastOk).toISOString()))) : "—"}</div><div class="note">${FP && FP.importing ? "import de l'historique en cours…" : "toutes les 30 min"}${readOnly ? "" : ` · <button class="linkbtn small" data-a="pur-sync">Synchroniser</button>`}</div></div></div>`;
  const shown = rows.slice(0, 500);
  UI.nav = UI.nav || {}; UI.nav.purchases = rows.map(p => p.id);
  return head("Achats - Dépenses", `${plural(rows.length, "facture")} fournisseur · total ${eur(tot)} · reste à payer ${eur(unpaid)}`, `<a class="btn" href="#amendes">🚨 Amendes${fineActionCount() ? ` <span class="cnt alert">${fineActionCount()}</span>` : ""}</a>${allowed("relances") ? `<button class="btn" data-a="go-fine-reminders">✉ Relances amendes</button>` : ""}`) +
    (FP && FP.error ? `<div class="banner warn"><b>Synchronisation Falco :</b> ${esc(FP.error)}</div>` : "") +
    (FP && FP.peppolError ? `<div class="banner info">Infos Peppol (communication, IBAN, réponse au fournisseur) indisponibles : ${esc(FP.peppolError)} — la clé API Falco doit avoir l'autorisation « peppol:inbound:read ».</div>` : "") + cards +
    `<div class="panel">${searchBar("Rechercher un fournisseur, un n° de facture, une communication, un montant…").replace(/<\/div>$/, `<label class="ck-arch"><input type="checkbox" id="pf-arch" ${f.arch ? "checked" : ""}> Montrer les factures archivées${nArch ? ` <span class="muted">(${nArch})</span>` : ""}</label></div>`)}${bar}
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Fournisseur</th><th>N°</th><th>Échéance</th><th>Paiement</th><th>Banque</th><th class="r">Montant</th></tr></thead><tbody>
    ${shown.map(p => { const L = purLinks(p.id), ps = PAY_ST[purSt(p)], fl = purPayFlow(p), isLate = !p.credit && purSt(p) !== "paid" && !(fl && fl.k !== "ko") && p.dueDate && p.dueDate < today();
      return `<tr class="hov click ${p.archived ? "arch" : ""} ${fl ? "pfrow " + fl.cls : ""}" data-a="pur-open" data-id="${p.id}"><td class="num nowrap">${fmtDate(p.date)}${p.archived ? ` <span class="chip">archivée</span>` : ""}</td>
      <td><b>${esc(p.supplierName || "—")}</b>${p.supplierVat ? `<div class="muted mono small">${esc(p.supplierVat)}</div>` : ""}</td>
      <td class="mono nowrap">${esc(p.number || "—")}${p.credit ? ` <span class="chip">NC</span>` : ""}${p.response ? ` <span class="chip ${RESP_ST[p.response.code]?.[1] || ""}">${esc(tr(RESP_ST[p.response.code]?.[0] || p.response.code))}</span>` : ""}</td>
      <td class="num nowrap ${isLate ? "txt-bad" : ""}">${p.dueDate ? fmtDate(p.dueDate) : "—"}</td>
      <td>${fl ? purFlowChip(fl) : ps ? `<span class="chip ${ps[1]}">${esc(tr(ps[0]))}</span>` : "—"}</td>
      <td class="small">${L.length ? L.map(t => `${fmtDate(t.date)}`).join(", ") : ""}</td>
      <td class="r num nowrap"><b>${eur((p.credit ? -1 : 1) * (+p.amount || 0))}</b></td></tr>`; }).join("")}
    </tbody>${rows.length ? `<tfoot><tr><td colspan="6">${plural(rows.length, "facture")}</td><td class="r num"><b>${eur(tot)}</b></td></tr></tfoot>` : ""}</table>
    ${rows.length > shown.length ? `<div class="muted small pad">Les 500 plus récentes sont affichées ; affinez avec les filtres.</div>` : ""}${rows.length ? "" : `<div class="empty">Rien ne correspond à ces filtres.</div>`}</div></div>`;
} };
document.addEventListener("change", e => {
  const s = e.target.closest && e.target.closest("select[data-pf]"); if (s) { purFilt()[s.dataset.pf] = s.value; UI.focusQ = false; render(true); }
  if (e.target.id === "pf-arch") { purFilt().arch = e.target.checked; UI.focusQ = false; render(true); }
});
ACTIONS["pf-ponto"] = () => { const f = purFilt(); f.pay = f.pay === "ponto" ? "" : "ponto"; render(true); };
ACTIONS["pf-reset"] = () => { const a = UI.pf && UI.pf.arch; UI.pf = null; purFilt().arch = !!a; render(true); };
ACTIONS["pur-sync"] = async el => { el && (el.disabled = true); const r = await fpTick(true); toast(r && r.ok === false ? tr(r.error || "Erreur") : r && !r.skipped ? `Falco : ${r.created || 0} nouvelle(s), ${r.updated || 0} mise(s) à jour` : "Déjà à jour"); render(true); };

ACTIONS["pur-open"] = el => {
  const p = S.purchases.find(x => x.id === el.dataset.id); if (!p) return;
  const L = purLinks(p.id), ps = PAY_ST[purSt(p)];
  const m = modal(`${mHead(`${p.credit ? "Note de crédit" : "Facture"} ${esc(p.number || "")} · ${esc(p.supplierName || "")}`)}<div class="body stack">${typeof navBar === "function" ? navBar("purchases", p.id, "pur-open") : ""}
    <dl class="kv"><dt>Fournisseur</dt><dd><b>${esc(p.supplierName || "—")}</b>${p.supplierVat ? ` <span class="mono small muted">${esc(p.supplierVat)}</span>` : ""}</dd>
      <dt>Date</dt><dd>${fmtDate(p.date)}${p.dueDate ? ` · échéance <b class="${!p.credit && purSt(p) !== "paid" && p.dueDate < today() ? "txt-bad" : ""}">${fmtDate(p.dueDate)}</b>` : ""}</dd>
      <dt>Montant TTC</dt><dd><b>${eur((p.credit ? -1 : 1) * (+p.amount || 0))}</b>${p.currency && p.currency !== "EUR" ? " " + esc(p.currency) : ""}</dd>
      ${p.paymentRef ? `<dt>Communication</dt><dd><span class="ogm">${esc(p.paymentRef)}</span></dd>` : ""}
      ${p.supplierIban ? `<dt>IBAN fournisseur</dt><dd class="mono">${esc(ibanFmt(p.supplierIban))}</dd>` : ""}
      <dt>Arrivée</dt><dd>${p.inboundId ? "Peppol" : "Falco (email ou dépôt)"}${p.receivedAt ? " · " + fmtDate(p.receivedAt.slice(0, 10)) : ""}</dd>
      <dt>Paiement</dt><dd>${(() => { const fl = purPayFlow(p); return fl ? `${purFlowChip(fl)} <span class="muted small">${esc(tr(fl.k === "sign" ? "envoyé à Ponto, en attente de votre signature" : fl.k === "run" ? "signé, la banque le traite" : fl.k === "done" ? "exécuté par la banque ; il sera relié à la facture quand il apparaîtra sur le compte" : "la banque a refusé le paiement : il n'est pas parti"))}</span>` : ps ? `<span class="chip ${ps[1]}">${esc(tr(ps[0]))}</span>` : "—"; })()}</dd>
      <dt>Banque</dt><dd>${L.length ? (purSt(p) === "paid" && p.paymentStatus !== "paid" ? `<b class="txt-good">Payée selon la banque</b><br>` : "") + L.map(t => txLink(t)).join("<br>") : `<span class="muted">aucun paiement relié</span>`}${typeof purPayHtml === "function" ? purPayHtml(p) : ""}${typeof payLinkBtn === "function" && Math.abs(purDue(p) - L.reduce((a, t) => a + (+txMatches(t).find(x => x.docId === p.id).amount || 0), 0)) > 0.005 ? `<div style="margin-top:6px">${payLinkBtn("purchases", p.id).replace('class="btn"', 'class="btn sm"')}</div>` : ""}</dd>
      ${p.response ? `<dt>Réponse Peppol</dt><dd><span class="chip ${RESP_ST[p.response.code]?.[1] || ""}">${esc(tr(RESP_ST[p.response.code]?.[0] || p.response.code))}</span> ${fmtDate((p.response.at || "").slice(0, 10))}${p.response.by ? " · " + esc(p.response.by) : ""}${p.response.reason ? `<div class="small muted">${esc(p.response.reason)}</div>` : ""}</dd>` : ""}</dl>
    <div class="row-g wrap"><button class="btn primary" id="pu-pdf">Voir la facture (PDF)</button></div>
    ${readOnly ? "" : `<div class="stack-s"><b class="small">Statut de paiement${p.falcoId ? " dans Falco" : ""}</b><div class="row-g wrap">${Object.entries(PAY_ST).map(([k, v]) => `<button class="btn sm ${purSt(p) === k ? "primary" : ""}" data-pay="${k}">${esc(tr(v[0]))}</button>`).join("")}</div>
      <div class="hint">${p.falcoId ? "Mis à jour dans Falco, donc aussi pour votre comptable." : "Facture reçue via Peppol : statut suivi dans l'ERP (Falco ne permet pas de le modifier via son API pour ces factures)."}</div></div>
    ${p.inboundId && p.peppolNoResponse ? `<div class="hint">Ce fournisseur ne peut pas recevoir de réponse par Peppol (son fournisseur Peppol n'est pas inscrit pour ce message) : répondez-lui par e-mail ou téléphone si nécessaire.</div>` : ""}
    ${p.inboundId && !p.peppolNoResponse ? `<div class="stack-s"><b class="small">Répondre au fournisseur (via Peppol)</b><div class="row-g wrap"><button class="btn sm" data-resp="accepted">Accepter</button><button class="btn sm" data-resp="under_query">Poser une question</button><button class="btn sm danger" data-resp="rejected">Refuser</button>${purSt(p) === "paid" ? `<button class="btn sm" data-resp="paid">Signaler le paiement</button>` : ""}</div>
      <div class="hint">Le fournisseur reçoit la réponse dans son logiciel de facturation. Un refus doit être motivé.</div></div>` : ""}
    ${typeof purAllocHtml === "function" && isOffice() ? purAllocHtml(p) : ""}
    <label class="f">Note interne<textarea id="pu-note" rows="2" placeholder="${esc(tr("Visible seulement dans l'ERP"))}">${esc(p.note || "")}</textarea></label>`}
    ${histBox("purchases", p.id)}<div class="err" id="pu-err"></div></div>
    <footer>${readOnly ? "" : `<button class="btn" id="pu-arch" style="margin-right:auto">${p.archived ? "Désarchiver" : "Archiver"}</button>`}<button class="btn" data-close>Fermer</button>${readOnly ? "" : `<button class="btn primary" id="pu-save">Enregistrer la note</button>`}</footer>`, "lg");
  const err = m.querySelector("#pu-err");
  if (typeof purAllocBind === "function") purAllocBind(m, p);
  const call = async (path, body, btn) => { err.textContent = ""; btn && (btn.disabled = true); try { return await API.call("POST", path, Object.assign({ id: p.id }, body)); } catch (e) { err.textContent = tr(e.message); return null; } finally { btn && (btn.disabled = false); } };
  m.querySelector("#pu-pdf").onclick = async e => { const r = await call("achats/pdf", {}, e.target); if (r && r.fileId) { window.open(blobUrl(r.fileId), "_blank"); if (r.pdf === false) toast("Le fournisseur n'a pas joint de PDF : la facture électronique (UBL) a été ouverte"); } };
  m.querySelectorAll("[data-pay]").forEach(b => b.onclick = async () => { const r = await call("achats/paid", { status: b.dataset.pay }, b); if (r) { closeModal(); toast(`Statut de paiement : ${tr(PAY_ST[r.paymentStatus]?.[0] || r.paymentStatus)}`); } });
  m.querySelectorAll("[data-resp]").forEach(b => b.onclick = () => {
    const code = b.dataset.resp, needReason = code === "rejected" || code === "under_query";
    const lbl = { accepted: "Accepter la facture", rejected: "Refuser la facture", under_query: "Poser une question", paid: "Signaler le paiement" }[code];
    const m2 = modal(`${mHead(lbl)}<form><div class="body stack-s"><div>${esc(p.supplierName)} · ${esc(p.number)} · ${eur(p.amount)}</div>
      ${needReason ? field("pr-reason", code === "rejected" ? "Motif du refus (envoyé au fournisseur)" : "Votre question (envoyée au fournisseur)", "", { type: "textarea", required: true }) : `<div class="muted">${code === "paid" ? "Le fournisseur sera informé que la facture est payée." : "Le fournisseur sera informé que la facture est acceptée."}</div>`}
      <div class="err" id="pr-err"></div></div><footer><button type="button" class="btn" data-close>Annuler</button><button class="btn ${code === "rejected" ? "danger" : "primary"}">${esc(tr(lbl))}</button></footer></form>`);
    m2.querySelector("form").onsubmit = async e => { e.preventDefault(); const btn = e.submitter; btn.disabled = true;
      try { await API.call("POST", "achats/response", { id: p.id, code, reason: needReason ? val("pr-reason") : "" }); closeModal(); toast("Réponse envoyée au fournisseur via Peppol"); }
      catch (x) { m2.querySelector("#pr-err").textContent = tr(x.message); btn.disabled = false; } };
  });
  const arch = m.querySelector("#pu-arch"); if (arch) arch.onclick = async () => { await patch("purchases", p.id, { archived: p.archived ? null : true }); closeModal(); toast(p.archived ? "Facture réaffichée" : "Facture archivée"); };
  const save = m.querySelector("#pu-save"); if (save) save.onclick = async () => { await patch("purchases", p.id, { note: val("pu-note").slice(0, 1000) }); closeModal(); toast("Note enregistrée"); };
};
