"use strict";
/* ======================= BANQUE (Beobank, Revolut… via Ponto) =======================
   Le serveur lit Ponto (lecture seule) ; l'ERP affiche soldes et mouvements et relie les paiements reçus
   aux factures (communication structurée, ou montant + n° de facture). */
let PO = null;
const ponOn = () => !!(PO && PO.configured);
async function poRefresh() { try { PO = await API.call("GET", "ponto/status"); } catch { PO = null; } return PO; }
let poBusy = false;
async function poTick(force) {
  if (!SERVER || !API || poBusy || !isOffice()) return null;
  if (!PO) await poRefresh();
  if (!PO || !PO.configured || (!force && document.hidden)) return null;
  poBusy = true; let r;
  try { r = await API.call("POST", "ponto/sync", force ? { force: true } : {}); } catch (e) { r = { ok: false, error: e.message }; }
  poBusy = false;
  if (!r.skipped && !r.busy) { await poRefresh(); if (document.getElementById("po-box")) loadPo(); }
  if (r.more) setTimeout(() => poTick(), 3000);
  return r;
}
let poStarted = false;
function poStart() {
  if (!SERVER || poStarted) return; poStarted = true;
  setTimeout(() => poTick(), 8000);
  setInterval(() => poTick(), 300000);
}

/* ---------- page Banque ---------- */
const txMatches = t => t.matches && t.matches.length ? t.matches : t.match ? [t.match] : [];
const ACC_COLORS = ["green", "blue", "orange", "violet", "teal", "pink", "yellow", "red", "grey"];
/* recherche d'un montant : « 1210 », « 1.210,00 », « 1 210 », « -45,5 » ; renvoie les chiffres normalisés ou "" */
function numQ(q) {
  let v = String(q || "").replace(/[\s\u00a0\u202f€]/g, "");
  if (!/^-?[\d.,]+$/.test(v) || !/\d/.test(v)) return "";
  const last = Math.max(v.lastIndexOf(","), v.lastIndexOf("."));
  if (last >= 0 && v.length - last - 1 <= 2) v = v.slice(0, last).replace(/[.,]/g, "") + "." + v.slice(last + 1);
  else v = v.replace(/[.,]/g, "");
  return v.replace(/^-/, "");
}
const txAmt = t => { const a = Math.abs(+t.amount || 0); return [a.toFixed(2), String(a), a.toFixed(2).replace(/\.00$/, "")]; };
const txHay = t => `${t.counterpart} ${t.counterpartIban} ${t.remittance} ${t.description} ${t.info} ${txMatches(t).map(x => x.number).join(" ")} ${t.coda ? "coda " + t.coda.no : ""}`.toLowerCase();
const accLabel = a => a ? `${a.bank || "Banque"}${a.name ? " · " + a.name : ""}` : "—";
const accsSorted = () => S.bankAccounts.slice().sort((a, b) => accLabel(a).localeCompare(accLabel(b)));
/* couleur d'un compte : choisie, sinon attribuée selon l'ordre d'affichage (identique dans Mouvements et Fichiers CODA) */
const accColor = a => { if (!a) return "grey"; if (a.color) return a.color; const k = accsSorted().findIndex(x => x.id === a.id); return ACC_COLORS[(k + 1) % ACC_COLORS.length]; };
const accName = a => a ? (a.nick || accLabel(a)) : "—";
const accDot = a => `<span class="acc-dot c-${accColor(a)}"></span>`;
const ibanFmt = i => (i || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
function bankFilt() { UI.bf = UI.bf || { acc: "", year: "", period: "", dir: "", match: "", arch: false }; return UI.bf; }
function bankMoves() {
  const accs = accsSorted();
  if (!accs.length) return head("Banque", "Soldes et mouvements de vos comptes bancaires") +
    `<div class="panel empty">${SERVER ? `Aucun compte relié pour l'instant. ${isAdmin() ? `Connectez vos banques via Ponto dans <a href="#parametres">Paramètres → Liaison Ponto</a>.` : "Un administrateur doit connecter les banques via Ponto."}` : "Les comptes bancaires arrivent via Ponto sur le serveur ways.support."}</div>`;
  const f = bankFilt(), q = UI.q.toLowerCase(), qn = numQ(UI.q);
  const total = accs.filter(a => (a.currency || "EUR") === "EUR").reduce((s, a) => s + (+a.balance || 0), 0);
  const soon = a => a.consentUntil && daysBetween(today(), a.consentUntil.slice(0, 10)) <= 21;
  const cards = `<div class="tiles">
    <div class="panel tile acc-tile c-green ${f.acc ? "" : "sel"}" role="button" tabindex="0" aria-pressed="${!f.acc}" data-a="bank-acc" data-id="" title="${esc(tr("Afficher tous les comptes"))}"><div class="lbl">Total des comptes (EUR)</div><div class="val">${eur0(total)}</div><div class="note">${accs.length} compte${accs.length > 1 ? "s" : ""}</div></div>
    ${accs.map(a => `<div class="panel tile acc-tile c-${accColor(a)} ${f.acc === a.id ? "sel" : ""}" role="button" tabindex="0" aria-pressed="${f.acc === a.id}" data-a="bank-acc" data-id="${a.id}">
      <div><div class="lbl">${esc(accLabel(a))}</div><div class="val">${a.balance == null ? "—" : eur(a.balance)}</div>
      <div class="note mono small">${esc(ibanFmt(a.iban))}</div><div class="note">${a.balanceAt ? "au " + fmtDate(a.balanceAt.slice(0, 10)) : ""}${soon(a) ? ` · <span class="txt-warn">autorisation à renouveler dans Ponto avant le ${fmtDate(a.consentUntil.slice(0, 10))}</span>` : ""}</div></div>
      ${a.nick ? `<div class="acc-nick">${esc(a.nick)}</div>` : "<div></div>"}
      ${readOnly ? "" : `<button class="acc-edit" data-a="acc-edit" data-id="${a.id}" title="${esc(tr("Nom et couleur du compte"))}" aria-label="${esc(tr("Nom et couleur du compte"))}">✎</button>`}</div>`).join("")}</div>`;
  const known = new Set(accs.map(a => a.id)), all = S.bankTx.filter(t => known.has(t.accountId));   /* comptes retirés dans Ponto : mouvements masqués */
  const nArch = all.filter(t => t.archived && (!f.acc || t.accountId === f.acc)).length;
  const rows = all.filter(t => (f.arch || !t.archived) && (!f.acc || t.accountId === f.acc) && docMatchPeriod(t.date, f) && (!f.dir || (f.dir === "in" ? t.amount > 0 : t.amount < 0))
      && (!f.match || (f.match === "yes" ? txMatches(t).length > 0 : t.amount > 0 && !txMatches(t).length))
      && (!q || txHay(t).includes(q) || (qn && txAmt(t).some(x => x.includes(qn)))))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const shown = rows.slice(0, 500);
  const inSum = rows.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0), outSum = rows.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const years = [...new Set(all.map(t => (t.date || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(tr(l))}</option>`;
  const bar = `<div class="toolbar df-bar">
    <label class="df"><span>Compte</span><select data-bf="acc">${opt("", "Tous les comptes", f.acc)}${accs.map(a => opt(a.id, a.nick ? `${a.nick} — ${accLabel(a)}` : accLabel(a), f.acc)).join("")}</select></label>
    <label class="df"><span>Année</span><select data-bf="year">${opt("", "Toutes", f.year)}${years.map(y => opt(y, y, f.year)).join("")}</select></label>
    <label class="df"><span>Période</span><select data-bf="period">${opt("", f.year ? "Toute l'année" : "Toutes", f.period)}<optgroup label="${tr("Trimestres")}">${[1, 2, 3, 4].map(t => opt("T" + t, t + (t === 1 ? "er" : "e") + " trimestre", f.period)).join("")}</optgroup><optgroup label="${tr("Mois")}">${MONTHS_FULL.map((m, k) => opt(String(k + 1), m, f.period)).join("")}</optgroup></select></label>
    <label class="df"><span>Sens</span><select data-bf="dir">${opt("", "Entrées et sorties", f.dir)}${opt("in", "Entrées", f.dir)}${opt("out", "Sorties", f.dir)}</select></label>
    <label class="df"><span>Factures</span><select data-bf="match">${opt("", "Tous", f.match)}${opt("yes", "Reliés à une facture", f.match)}${opt("no", "Entrées non reliées", f.match)}</select></label>
    ${f.acc || f.year || f.period || f.dir || f.match ? `<button class="linkbtn" data-a="bf-reset">Effacer les filtres</button>` : ""}</div>`;
  return head("Banque", `${rows.length} mouvement${rows.length > 1 ? "s" : ""} · entrées ${eur(inSum)} · sorties ${eur(-outSum)}${PO && PO.lastOk ? ` · mis à jour ${tr(agoTxt(new Date(PO.lastOk).toISOString()))}` : ""}`) + cards +
    `<div class="panel">${searchBar("Rechercher une contrepartie, une communication, un n° de facture, un montant…").replace(/<\/div>$/, `<label class="ck-arch"><input type="checkbox" id="bf-arch" ${f.arch ? "checked" : ""}> Montrer les mouvements archivés${nArch ? ` <span class="muted">(${nArch})</span>` : ""}</label></div>`)}${bar}
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Compte</th><th>Contrepartie</th><th>Communication</th><th>Facture</th><th class="r">Montant</th></tr></thead><tbody>
    ${shown.map(t => { const a = S.bankAccounts.find(x => x.id === t.accountId);
      return `<tr class="hov ${t.archived ? "arch" : ""} ${UI.txFocus === t.id ? "tx-focus" : ""}" data-tx="${esc(t.id)}"><td class="num nowrap">${fmtDate(t.date)}${t.archived ? ` <span class="chip" title="Masqué de la liste">archivé</span>` : ""}</td><td class="small">${esc(a ? a.bank || accLabel(a) : "")}</td>
      <td>${esc(t.counterpart || "—")}${t.counterpartIban ? `<div class="muted mono small">${esc(ibanFmt(t.counterpartIban))}</div>` : ""}</td>
      <td class="small">${t.structured ? `<span class="ogm">${esc(t.remittance)}</span>` : esc(t.remittance || t.description || t.info || "")}${t.coda ? ` <span class="chip" title="Inclus dans le fichier CODA ${esc(t.coda.no)}">CODA ${esc(t.coda.no)}</span>` : ""}</td>
      <td>${txMatches(t).length ? `<span class="lk-on">${txMatches(t).map(x => `<button class="lk-no mono" data-a="${x.coll === "purchases" ? "pur-open" : x.coll === "fines" ? "fine-form" : "doc-open"}" data-id="${x.docId}" title="${esc(tr("Ouvrir la pièce"))} · relié par ${esc(x.how || "")}">${esc(x.number)}</button>`).join(`<span class="lk-sep">·</span>`)}${readOnly ? "" : `<button class="lk-ic" data-a="tx-link" data-id="${t.id}" title="${esc(tr("Modifier"))}" aria-label="${esc(tr("Modifier"))}">✎</button><button class="lk-ic" data-a="tx-unlink" data-id="${t.id}" title="${esc(tr("Délier"))}" aria-label="${esc(tr("Délier"))}">×</button>`}</span>`
        : !readOnly ? `<button class="lk-todo" data-a="tx-link" data-id="${t.id}">Relier…</button>` : ""}</td>
      <td class="r num nowrap"><b class="${t.amount < 0 ? "txt-bad" : "txt-good"}">${eur(t.amount)}</b></td></tr>`; }).join("")}
    </tbody></table>${rows.length > shown.length ? `<div class="muted small pad">Les 500 plus récents sont affichés ; affinez avec les filtres.</div>` : ""}${rows.length ? "" : `<div class="empty">${all.length ? "Rien ne correspond à ces filtres." : PO && PO.importing ? "Import des mouvements en cours…" : "Aucun mouvement pour l'instant."}</div>`}</div></div>`;
}
/* aller au paiement : Banque → Mouvements, compte du paiement, ligne mise en évidence */
const txLink = t => { const a = S.bankAccounts.find(x => x.id === t.accountId);
  return `<button class="linkbtn" data-a="tx-show" data-id="${esc(t.id)}" title="${esc(tr("Voir le paiement dans Banque"))}">${fmtDate(t.date)} · ${eur(t.amount)}</button>${a ? ` <span class="nowrap small">${accDot(a)}${esc(accName(a))}</span>` : ""}`; };
ACTIONS["tx-show"] = el => {
  const t = S.bankTx.find(x => x.id === el.dataset.id); if (!t) return;
  closeModal(); UI.tab.banque = "mouv"; UI.q = "";
  UI.bf = { acc: t.accountId || "", year: "", period: "", dir: "", match: "", arch: !!t.archived };
  UI.txFocus = t.id;
  if (location.hash === "#banque") render(true); else location.hash = "#banque";
  setTimeout(() => { const r = document.querySelector(`tr[data-tx="${CSS.escape(t.id)}"]`); if (r) r.scrollIntoView({ block: "center", behavior: "smooth" }); }, 250);
  setTimeout(() => { UI.txFocus = null; }, 4000);
};
VIEWS.banque = { title: "Banque", render: () => {
  const out = bankMoves();
  if (!S.bankAccounts.length) return out;
  const t = UI.tab.banque || "mouv";
  const tb = tabs("banque", [["mouv", "Mouvements"], ["coda", "Fichiers CODA", S.codaFiles.filter(f => f.status !== "cancelled").length || ""]]);
  const i = out.indexOf('<div class="tiles">');
  if (t === "coda") return out.slice(0, i) + tb + codaView();
  return out.slice(0, i) + tb + out.slice(i);
} };
ACTIONS["bank-acc"] = el => { const f = bankFilt(), id = el.dataset.id || ""; f.acc = !id || f.acc === id ? "" : id; render(true); };
ACTIONS["bf-reset"] = () => { const a = UI.bf && UI.bf.arch; UI.bf = null; bankFilt().arch = !!a; render(true); };
document.addEventListener("change", e => { if (e.target.id === "bf-arch") { bankFilt().arch = e.target.checked; UI.focusQ = false; render(true); } });
document.addEventListener("change", e => { const s = e.target.closest && e.target.closest("select[data-bf]"); if (!s) return; bankFilt()[s.dataset.bf] = s.value; render(true); });
ACTIONS["tx-unlink"] = el => confirmBox("Délier ce paiement de la facture ? (cela ne change rien dans Odoo ni dans Falco)", async () => { await patch("bankTx", el.dataset.id, { match: null, matches: null, matchOff: true }); }, "Délier");
ACTIONS["tx-link"] = el => {
  const t = S.bankTx.find(x => x.id === el.dataset.id); if (!t) return;
  const mine = new Set(txMatches(t).map(x => x.docId));
  /* déjà affecté par d'autres mouvements (paiement en plusieurs fois) : seule la partie restante est proposée */
  const paidElse = {}; for (const x of S.bankTx) if (x.id !== t.id) for (const y of txMatches(x)) paidElse[y.docId] = (paidElse[y.docId] || 0) + (+y.amount || 0);
  const r2c = v => Math.round(v * 100) / 100;
  const rem = `${t.remittance || ""} ${t.description || ""}`;
  const cited = d => d.number && new RegExp(`(?<![A-Za-z0-9/])${d.number.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![A-Za-z0-9/])`, "i").test(rem);
  const sgn = t.amount < 0 ? -1 : 1;
  /* pièces proposées : factures et NC de vente ouvertes + factures d'achat (Falco) non payées, avec leur montant dans le sens bancaire */
  const sales = S.docs.filter(d => (d.kind === "facture" || d.kind === "nc") && (mine.has(d.id) || ["envoyee", "partiel"].includes(d.status)))
    .map(d => ({ d, who: clientName(d.clientId), tag: d.kind === "nc" ? "NC" : "", base: baseDue(d), due0: r2c(baseDue(d) - (paidElse[d.id] || 0)), part: !!paidElse[d.id] }));
  const purch = (S.purchases || []).filter(p => mine.has(p.id) || (!p.archived && p.paymentStatus !== "paid"))
    .map(p => ({ d: Object.assign({ coll: "purchases" }, p), who: p.supplierName || "", tag: p.credit ? "Achat · NC" : "Achat", base: purDue(p), due0: r2c(purDue(p) - (paidElse[p.id] || 0)), part: !!paidElse[p.id] }));
  /* amendes : notre paiement (sortie) si payée par W.A.Y.S., remboursement attendu (entrée) */
  const fines = typeof fineStage !== "function" ? [] : (S.fines || []).filter(f => mine.has(f.id) || (t.amount < 0 ? finePaidBy(f) !== "auteur" && !fineTx(f).pay.length && fineAmt(f) > 0 && !f.cancelled : fineStage(f) === "a_rembourser"))
    .map(f => { const base = t.amount < 0 ? -fineAmt(f) : fineRefundAmt(f); const done = (S.bankTx || []).filter(x => x.id !== t.id).reduce((a, x) => a + txMatches(x).filter(y => y.coll === "fines" && y.docId === f.id && Math.sign(+y.amount) === Math.sign(base)).reduce((b, y) => b + (+y.amount || 0), 0), 0);
      return { d: { coll: "fines", id: f.id, number: f.pvNumber || "Amende " + fmtDate(f.date) }, who: t.amount < 0 ? (f.authName || "Amende") : fineDebtor(f).name, tag: "Amende", base, due0: r2c(base - done), part: !!done }; });
  const keep = o => mine.has(o.d.id) || (Math.abs(o.due0) > 0.005 && Math.sign(o.due0) === Math.sign(o.base));
  const open = [...(t.amount < 0 ? [...purch, ...sales, ...fines] : [...sales, ...fines, ...purch])].filter(keep)
    .map(o => Object.assign(o, { due: mine.has(o.d.id) ? (txMatches(t).find(x => x.docId === o.d.id).amount ?? o.due0) : o.due0 }))
    .sort((a, b) => (mine.has(b.d.id) - mine.has(a.d.id)) || (cited(b.d) - cited(a.d)) || ((Math.sign(b.due) === sgn) - (Math.sign(a.due) === sgn)) || Math.abs(a.due - t.amount) - Math.abs(b.due - t.amount));
  const sel = new Map(open.filter(o => mine.has(o.d.id)).map(o => [o.d.id, o]));
  const m = modal(`${mHead(t.amount < 0 ? "Relier cette sortie à une ou plusieurs pièces" : "Relier ce paiement à une ou plusieurs factures")}<div class="body stack-s"><div>${fmtDate(t.date)} · <b>${eur(t.amount)}</b> · ${esc(t.counterpart || "")}<div class="muted small">${esc(t.remittance || t.description || "")}</div></div>
    ${open.length ? `<input type="search" id="tl-q" placeholder="${esc(tr("Rechercher une facture, un client ou un montant…"))}" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid var(--line);background:var(--bg)">
    <div id="tl-sum" class="tl-sum"></div>
    <div class="tablewrap" style="max-height:340px;overflow:auto"><table><thead><tr><th class="ck"></th><th>Pièce</th><th>Client / fournisseur</th><th class="r">Montant</th></tr></thead><tbody>${open.map(o => { const { d, due } = o; return `<tr class="hov click ${sel.has(d.id) ? "sel" : ""}" data-id="${d.id}" data-hay="${esc(`${d.number} ${o.who} ${d.ref || ""} ${d.paymentRef || ""}`.toLowerCase())}" data-amt="${Math.abs(due).toFixed(2)}"><td class="ck"><input type="checkbox" ${sel.has(d.id) ? "checked" : ""} aria-label="${esc(d.number)}"></td><td class="mono">${esc(d.number)}${o.tag ? ` <span class="chip">${esc(o.tag)}</span>` : ""}${o.part && !mine.has(o.d.id) ? ` <span class="chip warn" title="${esc(tr("Déjà payée en partie par un autre mouvement : seul le reste est proposé"))}">${esc(tr("reste dû"))}</span>` : ""}${cited(d) ? ` <span class="chip info" title="Cité dans la communication">cité</span>` : ""}</td><td>${esc(o.who)}</td><td class="r num ${Math.abs(due - t.amount) < 0.005 ? "txt-good" : ""}">${eur(due)}</td></tr>`; }).join("")}</tbody></table></div>` : `<div class="muted">Aucune pièce ouverte (factures de vente, notes de crédit, factures d'achat).</div>`}
    <div class="hint">Le lien sert au suivi dans l'ERP ; le paiement des factures Odoo reste enregistré dans Odoo.</div></div>
    <footer><button class="btn" id="tl-arch" style="margin-right:auto" title="${esc(tr(t.archived ? "Réafficher ce mouvement dans la liste" : "Masquer ce mouvement de la liste (il reste dans les fichiers CODA)"))}">${t.archived ? "Désarchiver" : "Archiver"}</button><button class="btn" data-close>Fermer</button><button class="btn primary" id="tl-go" disabled>Relier</button></footer>`, "lg");
  const sumBox = m.querySelector("#tl-sum"), go = m.querySelector("#tl-go");
  const upd = () => {
    if (!sumBox) return;
    const tot = [...sel.values()].reduce((a, o) => a + o.due, 0), left = Math.round((t.amount - tot) * 100) / 100;
    const zero = Math.abs(left) < 0.005;
    sumBox.className = "tl-sum" + (zero ? " ok" : left * sgn < 0 ? " over" : "");
    sumBox.innerHTML = `<span>${t.amount < 0 ? "Sortie" : "Paiement"} <b>${eur(t.amount)}</b></span><span>− ${sel.size} pièce${sel.size > 1 ? "s" : ""} <b>${eur(tot)}</b></span><span class="tl-left">${zero ? "✓ Reste à affecter : 0,00 €" : left * sgn > 0 ? `Reste à affecter : <b>${eur(left)}</b>` : `Dépasse de <b>${eur(-left)}</b>`}</span>`;
    go.disabled = !sel.size && !mine.size; go.textContent = sel.size ? `Relier ${sel.size} pièce${sel.size > 1 ? "s" : ""}` : mine.size ? "Retirer les liens" : "Relier";
  };
  m.querySelectorAll("tbody tr[data-id]").forEach(r => r.addEventListener("click", e => {
    const id = r.dataset.id, o = open.find(x => x.d.id === id), cb = r.querySelector("input");
    if (e.target !== cb) cb.checked = !cb.checked;
    if (cb.checked) sel.set(id, o); else sel.delete(id);
    r.classList.toggle("sel", cb.checked); upd();
  }));
  const inp = m.querySelector("#tl-q");
  if (inp) {
    const rowsEl = [...m.querySelectorAll("tbody tr")];
    const apply = () => { const q = inp.value.trim().toLowerCase(), qn = numQ(inp.value); let n = 0;
      rowsEl.forEach(r => { const show = !q || r.dataset.hay.includes(q) || (qn && r.dataset.amt.includes(qn)) || r.classList.contains("sel"); r.style.display = show && n < 300 ? "" : "none"; if (show) n++; }); };
    inp.addEventListener("input", apply); apply(); setTimeout(() => inp.focus(), 50);
  }
  upd();
  m.querySelector("#tl-arch").onclick = async () => { await patch("bankTx", t.id, { archived: t.archived ? null : true }); closeModal(); toast(t.archived ? "Mouvement réaffiché" : "Mouvement archivé : il n'apparaît plus dans la liste"); };
  go.onclick = async () => {
    go.disabled = true;
    /* montant affecté : le reste dû de chaque pièce, plafonné par ce qui reste du mouvement (dans son sens) */
    let left = t.amount * sgn;
    const matches = [...sel.values()].map(o => { const d = o.due * sgn, a = d > 0 ? Math.min(d, Math.max(left, 0)) : d; left -= d; return Object.assign({ docId: o.d.id, number: o.d.number, amount: Math.round(a * sgn * 100) / 100, how: "manuel" }, o.d.coll ? { coll: o.d.coll } : {}); });
    await patch("bankTx", t.id, matches.length ? { matches, match: null, matchOff: null } : { matches: null, match: null, matchOff: true });
    closeModal(); toast(matches.length ? `Mouvement relié à ${matches.map(x => x.number).join(", ")}` : "Liens retirés");
  };
};

/* ---------- carte Paramètres (administrateur) ---------- */
function poCardShell() {
  if (!SERVER || !isAdmin()) return "";
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><h3 class="np">Liaison Ponto (banques)</h3><div id="po-box"><div class="muted">Chargement…</div></div></div></div>`;
}
async function loadPo() {
  const box = document.getElementById("po-box"); if (!box) return;
  const s = await poRefresh();
  if (!s) { box.innerHTML = `<div class="err">${esc(tr("Le serveur ne répond pas."))}</div>`; return; }
  if (!s.configured) {
    box.innerHTML = `<div class="stack-s"><div>Soldes et mouvements de vos comptes (Beobank, Revolut Business…) arrivent dans l'ERP via Ponto, en <b>lecture seule</b>. Les paiements reçus sont reliés automatiquement aux factures. Falco garde sa propre connexion bancaire pour votre comptable.</div>
      <ol class="small stack-s" style="margin:0;padding-left:18px"><li>Connectez-vous sur <b>myponto.com</b> (le compte utilisé par Odoo convient) et vérifiez que Beobank et Revolut Business y sont reliés.</li>
      <li>Page <b>Integrations</b> → ajoutez une <b>custom integration</b> : nom « ERP W.A.Y.S. », périmètre <b>AIS only</b> (lecture seule), cochez les comptes à partager.</li>
      <li>Ponto affiche l'<b>identifiant client</b> et le <b>secret</b> (le secret n'est montré qu'une fois) : collez-les ici.</li></ol>
      <div><button class="btn primary" data-a="po-form">Connecter Ponto</button></div></div>`;
    return;
  }
  box.innerHTML = `<div class="stack-s"><dl class="kv"><dt>Intégration</dt><dd class="mono">${esc(s.clientId || "")}</dd>
      <dt>Comptes</dt><dd>${S.bankAccounts.length ? S.bankAccounts.map(a => esc(accLabel(a))).join(" · ") : "—"}</dd>
      <dt>Synchronisation</dt><dd>${s.importing ? `<span class="chip warn">import de l'historique en cours…</span>` : s.lastOk ? esc(tr(agoTxt(new Date(s.lastOk).toISOString()))) : "pas encore faite"} <span class="muted small">(toutes les 30 min ; Ponto relit vos banques 4 fois par jour)</span></dd></dl>
    ${s.error ? `<div class="banner warn"><b>Dernière erreur :</b> ${esc(s.error)}</div>` : ""}
    <div class="row-g wrap"><button class="btn primary" data-a="po-sync">Synchroniser maintenant</button><button class="btn" data-a="po-test">Tester la connexion</button><button class="btn" data-a="po-form">Modifier</button><button class="btn danger" data-a="po-off">Déconnecter</button></div></div>`;
}
ACTIONS["po-form"] = () => {
  const has = !!(PO && PO.configured);
  const m = modal(`${mHead("Connexion Ponto")}<form autocomplete="off"><div class="body stack-s"><div class="fields">
    ${field("po-id", "Identifiant client (client ID)", "", { required: !has, ph: has ? "inchangé" : "", wide: true })}
    ${field("po-secret", "Secret (client secret)", "", { type: "password", required: !has, ph: has ? "inchangé" : "", wide: true })}</div>
    <div class="hint">Enregistrés sur le serveur ways.support uniquement, jamais renvoyés au navigateur.</div><div class="err" id="po-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" id="po-go">Enregistrer et tester</button></footer></form>`);
  m.querySelector("#po-secret").setAttribute("autocomplete", "new-password");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const err = m.querySelector("#po-err"), go = m.querySelector("#po-go"); go.disabled = true; err.textContent = "";
    try { await API.call("POST", "ponto/config", { clientId: val("po-id"), secret: m.querySelector("#po-secret").value.trim() }); closeModal(); await poRefresh(); loadPo(); ACTIONS["po-test"](true); }
    catch (x) { err.textContent = tr(x.message); go.disabled = false; }
  };
};
ACTIONS["po-test"] = async startAfter => {
  const m = modal(`${mHead("Test de la connexion Ponto")}<div class="body" id="po-t"><div class="muted">Connexion à Ponto…</div></div><footer><button class="btn" data-close>Fermer</button></footer>`);
  const box = m.querySelector("#po-t");
  try {
    const r = await API.call("POST", "ponto/test");
    box.innerHTML = `<div class="banner info">Connexion réussie : ${r.accounts.length} compte${r.accounts.length > 1 ? "s" : ""} partagé${r.accounts.length > 1 ? "s" : ""} avec l'ERP.</div>
      ${r.accounts.map(a => `<div class="row-sb" style="padding:6px 0;border-bottom:1px solid var(--line)"><span><b>${esc(a.bank || "Banque")}</b> ${esc(a.name || "")}<div class="mono small muted">${esc(ibanFmt(a.iban))}</div></span><span class="num">${a.balance == null ? "—" : eur(a.balance)}</span></div>`).join("")}
      ${r.accounts.length ? "" : `<div class="muted">Aucun compte : dans Ponto, ouvrez l'intégration et cochez les comptes à partager.</div>`}
      <div class="muted small" style="margin-top:8px">${startAfter === true ? "L'import des mouvements (2 dernières années) démarre maintenant." : ""}</div>`;
    if (startAfter === true) poTick(true);
  } catch (e) { box.innerHTML = `<div class="err">${esc(tr(e.message))}</div><div class="hint">Vérifiez l'identifiant et le secret de la custom integration (le secret peut être régénéré dans Ponto).</div>`; }
};
ACTIONS["po-sync"] = async el => {
  el.disabled = true; el.textContent = "Synchronisation…";
  const r = await poTick(true);
  if (r && r.ok) toast(r.more ? "Import en cours : la suite arrive par lots…" : `Synchronisé : ${r.accounts} compte(s), ${r.transactions} mouvement(s), ${r.matched} facture(s) reliée(s)`);
  else if (r) toast(tr(r.error || "Erreur"));
  loadPo();
};
ACTIONS["po-off"] = () => confirmBox("Déconnecter Ponto ? L'identifiant et le secret sont effacés du serveur ; les comptes et mouvements déjà importés restent visibles.", async () => { await API.call("POST", "ponto/disconnect"); PO = null; loadPo(); }, "Déconnecter");

/* ---------- fichiers CODA ---------- */
function codaFilt() { UI.cf = UI.cf || { acc: "", year: "", st: "" }; return UI.cf; }
function codaView() {
  const f = codaFilt(), accs = accsSorted();
  const all = S.codaFiles.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const rows = all.filter(x => (!f.acc || x.accountId === f.acc) && (!f.year || x.year === f.year) && (!f.st || (f.st === "ok" ? x.status !== "cancelled" : x.status === "cancelled")));
  const years = [...new Set(all.map(x => x.year).filter(Boolean))].sort().reverse();
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(tr(l))}</option>`;
  const last = id => all.filter(x => x.accountId === id && x.status !== "cancelled").sort((a, b) => (b.to || "").localeCompare(a.to || ""))[0];
  return `<div class="banner info">Un fichier CODA (format bancaire belge) reprend les mouvements d'un compte sur une période, pour import dans Horus par votre comptable. Chaque mouvement ne peut figurer que dans un seul fichier : l'ERP refuse les chevauchements et propose de reprendre là où le dernier fichier s'est arrêté. Attention : tant que Falco reçoit aussi vos extraits directement de la banque, convenez avec votre comptable de la source qu'il importe, pour éviter les doublons dans Horus.</div>
    <div class="tiles">${accs.map(a => { const l = last(a.id); return `<div class="panel tile acc-tile c-${accColor(a)} ${f.acc === a.id ? "sel" : ""}" role="button" tabindex="0" aria-pressed="${f.acc === a.id}" data-a="coda-acc" data-id="${a.id}" title="${esc(tr("Filtrer l'historique sur ce compte"))}"><div><div class="lbl">${esc(accLabel(a))}</div><div class="note mono small">${esc(ibanFmt(a.iban))}</div>${l ? `<div class="note" style="margin-top:8px">Dernier fichier jusqu'au</div><div class="val">${fmtDate(l.to)}</div>` : `<div class="val" style="margin-top:8px">aucun fichier</div>`}<div class="note">${l ? `n° ${esc(l.no)} · ${l.count} mouvements` : ""}</div>${readOnly ? "" : `<button class="btn sm primary" data-a="coda-new" data-id="${a.id}" style="margin-top:8px">Générer un fichier CODA</button>`}</div>${a.nick ? `<div class="acc-nick">${esc(a.nick)}</div>` : "<div></div>"}</div>`; }).join("")}</div>
    <div class="panel"><div class="toolbar df-bar">
      <label class="df"><span>Compte</span><select data-cf="acc">${opt("", "Tous les comptes", f.acc)}${accs.map(a => opt(a.id, a.nick ? `${a.nick} — ${accLabel(a)}` : accLabel(a), f.acc)).join("")}</select></label>
      <label class="df"><span>Année</span><select data-cf="year">${opt("", "Toutes", f.year)}${years.map(y => opt(y, y, f.year)).join("")}</select></label>
      <label class="df"><span>État</span><select data-cf="st">${opt("", "Tous", f.st)}${opt("ok", "Valides", f.st)}${opt("x", "Annulés", f.st)}</select></label>
      ${f.acc || f.year || f.st ? `<button class="linkbtn" data-a="cf-reset">Effacer les filtres</button>` : ""}</div>
    <div class="tablewrap"><table><thead><tr><th>N°</th><th>Compte</th><th>Période</th><th class="r">Mouvements</th><th class="r">Crédits</th><th class="r">Débits</th><th class="r">Solde initial → final</th><th>Créé</th><th></th></tr></thead><tbody>
    ${rows.map(x => `<tr class="${x.status === "cancelled" ? "muted" : ""}"><td class="mono nowrap">${esc(x.no)}${x.status === "cancelled" ? ` <span class="chip bad">annulé</span>` : ""}</td><td>${(() => { const a = S.bankAccounts.find(y => y.id === x.accountId); return a ? `<span class="nowrap">${accDot(a)}<b>${esc(accName(a))}</b></span>${a.nick ? `<div class="small muted nowrap">${esc(accLabel(a))}</div>` : ""}` : esc(x.bank || ""); })()}<div class="mono small muted nowrap">${esc(ibanFmt(x.iban))}</div></td>
      <td class="num nowrap">${fmtDate(x.from)} → ${fmtDate(x.to)}</td><td class="r num">${x.count}</td><td class="r num txt-good">${eur(x.credit)}</td><td class="r num txt-bad">${eur(-x.debit)}</td>
      <td class="r num nowrap">${eur(x.oldBalance)} → <b>${eur(x.newBalance)}</b></td><td class="small nowrap">${esc(new Date(x.createdAt).toLocaleString("fr-BE", { dateStyle: "short", timeStyle: "short" }))}<div class="muted">${esc(x.createdBy || "")}</div></td>
      <td class="nowrap"><button class="btn sm" data-a="coda-dl" data-id="${x.id}">Télécharger</button>${x.status !== "cancelled" && !readOnly ? ` <button class="linkbtn small" data-a="coda-cancel" data-id="${x.id}">Annuler</button>` : ""}</td></tr>`).join("")}
    </tbody></table>${rows.length ? "" : `<div class="empty">${all.length ? "Rien ne correspond à ces filtres." : "Aucun fichier CODA généré pour l'instant."}</div>`}</div></div>`;
}
document.addEventListener("change", e => { const s = e.target.closest && e.target.closest("select[data-cf]"); if (!s) return; codaFilt()[s.dataset.cf] = s.value; render(true); });
ACTIONS["coda-acc"] = el => { const f = codaFilt(); f.acc = f.acc === el.dataset.id ? "" : el.dataset.id; render(true); };
ACTIONS["cf-reset"] = () => { UI.cf = null; render(true); };
ACTIONS["coda-new"] = el => {
  const a = S.bankAccounts.find(x => x.id === el.dataset.id); if (!a) return;
  const last = S.codaFiles.filter(x => x.accountId === a.id && x.status !== "cancelled").sort((p, q) => (q.to || "").localeCompare(p.to || ""))[0];
  const from = last ? addDays(last.to, 1) : (S.bankTx.filter(t => t.accountId === a.id).map(t => t.date).sort()[0] || today());
  const to = addDays(today(), -1) >= from ? addDays(today(), -1) : from;
  const m = modal(`${mHead("Générer un fichier CODA")}<form><div class="body stack-s"><div><b>${esc(accLabel(a))}</b> <span class="mono small muted">${esc(ibanFmt(a.iban))}</span></div>
    <div class="fields">${field("cd-from", "Du", from, { type: "date", required: true })}${field("cd-to", "Au (inclus)", to, { type: "date", required: true })}</div>
    <div id="cd-prev" class="muted">Calcul…</div><div class="err" id="cd-err"></div>
    <div class="hint">${last ? `Le dernier fichier (${esc(last.no)}) s'arrête au ${fmtDate(last.to)} : la période proposée commence le lendemain.` : "Premier fichier pour ce compte."} Évitez d'inclure aujourd'hui : la banque peut encore ajouter des mouvements à la journée en cours.</div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" id="cd-go" disabled>Générer</button></footer></form>`);
  const prev = async () => {
    const box = m.querySelector("#cd-prev"), go = m.querySelector("#cd-go"); go.disabled = true; m.querySelector("#cd-err").textContent = "";
    try {
      const r = await API.call("POST", "coda/preview", { accountId: a.id, from: val("cd-from"), to: val("cd-to") });
      const dup = Object.keys(r.duplicates || {});
      box.innerHTML = `${r.count} mouvement${r.count > 1 ? "s" : ""} · crédits ${eur(r.credit)} · débits ${eur(r.debit)}<br>Solde initial ${eur(r.oldBalance)} → solde final <b>${eur(r.newBalance)}</b>${dup.length ? `<div class="err">Chevauchement avec le${dup.length > 1 ? "s" : ""} fichier${dup.length > 1 ? "s" : ""} ${dup.map(esc).join(", ")} : changez la période.</div>` : ""}`;
      go.disabled = !r.count || dup.length > 0;
    } catch (e) { box.textContent = ""; m.querySelector("#cd-err").textContent = tr(e.message); }
  };
  m.querySelector("#cd-from").onchange = prev; m.querySelector("#cd-to").onchange = prev; prev();
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const go = m.querySelector("#cd-go"); go.disabled = true;
    try { const r = await API.call("POST", "coda/generate", { accountId: a.id, from: val("cd-from"), to: val("cd-to") }); closeModal(); toast(`Fichier CODA ${r.doc.no} généré (${r.doc.count} mouvements)`);
      if (!S.codaFiles.some(x => x.id === r.id)) S.codaFiles.push(Object.assign({ id: r.id }, r.doc));   /* affichage immédiat, le serveur confirme ensuite */
      render(true); codaDownload(r.doc); }
    catch (x) { m.querySelector("#cd-err").textContent = tr(x.message); go.disabled = false; }
  };
};
function codaDownload(x) { const a = document.createElement("a"); a.href = blobUrl(x.fileId) + (blobUrl(x.fileId).includes("?") ? "&" : "?") + "download=1"; a.download = x.fileName; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000); }
ACTIONS["coda-dl"] = el => { const x = S.codaFiles.find(f => f.id === el.dataset.id); if (x) codaDownload(x); };
ACTIONS["coda-cancel"] = el => {
  const x = S.codaFiles.find(f => f.id === el.dataset.id); if (!x) return;
  confirmBox(`Annuler le fichier CODA ${x.no} (${fmtDate(x.from)} → ${fmtDate(x.to)}) ? Ses ${x.count} mouvements pourront être repris dans un nouveau fichier. À faire seulement si votre comptable ne l'a pas importé, sinon il recevrait ces mouvements deux fois.`, async () => {
    try { await API.call("POST", "coda/cancel", { id: x.id }); toast(`Fichier ${x.no} annulé`); } catch (e) { toast(tr(e.message)); }
  }, "Annuler le fichier");
};

/* nom personnalisé et couleur d'un compte */
ACTIONS["acc-edit"] = el => {
  const a = S.bankAccounts.find(x => x.id === el.dataset.id); if (!a) return;
  let col = a.color || "";
  const m = modal(`${mHead("Nom et couleur du compte")}<form><div class="body stack-s"><div class="muted small">${esc(accLabel(a))} · <span class="mono">${esc(ibanFmt(a.iban))}</span></div>
    <div class="fields">${field("acc-nick", "Nom affiché en grand (facultatif)", a.nick || "", { ph: "Ex. : Exploitation, Épargne, Carte Revolut", wide: true })}</div>
    <div><div class="lbl small" style="margin-bottom:6px">Couleur</div><div class="swatches">${ACC_COLORS.map(c => `<button type="button" class="swatch c-${c} ${col === c ? "on" : ""}" data-c="${c}" title="${c}" aria-label="${c}"></button>`).join("")}</div></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`);
  m.querySelectorAll(".swatch").forEach(b => b.onclick = () => { col = b.dataset.c; m.querySelectorAll(".swatch").forEach(x => x.classList.toggle("on", x === b)); });
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); await patch("bankAccounts", a.id, { nick: val("acc-nick").slice(0, 30), color: col || null }); closeModal(); };
};
document.addEventListener("keydown", e => { const t = e.target.closest && e.target.closest(".acc-tile"); if (t && (e.key === "Enter" || e.key === " ") && e.target === t) { e.preventDefault(); ACTIONS[t.dataset.a](t); } });
