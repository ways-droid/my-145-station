"use strict";
/* ======================= RELANCES : clients (factures) et amendes =======================
   Clients : liste des clients avec des factures ouvertes → choix des factures → rappel de paiement (3 niveaux)
   ou état de compte, en PDF et/ou par e-mail. Amendes : même principe par débiteur (chauffeur ou sa société) :
   remboursements attendus et preuves de paiement attendues.
   Chaque relance envoyée est notée dans la collection « reminders » (aussi pour les factures Odoo, non modifiables). */
const RM_LEVELS = { 1: ["Rappel de paiement", "Payment reminder"], 2: ["Second rappel", "Second reminder"], 3: ["Mise en demeure", "Formal notice"] };
const invRef = d => d.payRef || (typeof ogm === "function" ? ogm(d.number) : d.number);
const daysLate = due => due && due < today() ? daysBetween(due, today()) : 0;
const rmLog = (kind, key) => (S.reminders || []).filter(r => r.kind === kind && (key == null || r.key === key)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
const rmLastFor = (kind, itemId) => (S.reminders || []).filter(r => r.kind === kind && (r.items || []).some(i => i.id === itemId)).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];

/* ---------- données : clients ---------- */
function rmClientItems(clientId) {
  return issued().filter(d => d.clientId === clientId).map(d => ({ d, st: invStatus(d), due: dueOf(d) }))
    .filter(o => Math.abs(o.due) > 0.005 && !["payee", "annulee", "brouillon"].includes(o.st) && (o.d.kind === "nc" ? o.due < 0 : o.due > 0))
    .sort((a, b) => (a.d.dueDate || a.d.date || "").localeCompare(b.d.dueDate || b.d.date || ""));
}
function rmClients() {
  const by = {};
  for (const d of issued()) if (d.clientId) by[d.clientId] = 1;
  return Object.keys(by).map(id => {
    const items = rmClientItems(id); if (!items.some(o => o.d.kind === "facture")) return null;
    const inv = items.filter(o => o.d.kind === "facture"), late = inv.filter(o => daysLate(o.d.dueDate) > 0);
    const last = rmLog("client", id)[0];
    return { id, c: client(id), name: clientName(id), items, total: r2f(items.reduce((a, o) => a + o.due, 0)), late: r2f(late.reduce((a, o) => a + o.due, 0)), nLate: late.length, nInv: inv.length,
      maxLate: Math.max(0, ...inv.map(o => daysLate(o.d.dueDate))), oldest: inv[0]?.d.dueDate, last };
  }).filter(Boolean).sort((a, b) => b.maxLate - a.maxLate || b.total - a.total);
}

/* ---------- données : amendes ---------- */
function rmFineItem(f) {
  const st = fineStage(f);
  if (st === "a_rembourser") return { f, st, what: "refund", amount: fineRefundLeft(f) };
  if (st === "preuve") return { f, st, what: "proof", amount: fineAmt(f) };
  return null;
}
const fineKey = f => { const d = fineDebtor(f); return d.kind + ":" + nk(d.name); };
function rmDebtors() {
  const by = {};
  for (const f of S.fines || []) {
    if (f.bearer !== "chauffeur" || f.cancelled) continue;
    const k = fineKey(f), d = fineDebtor(f);
    const o = by[k] || (by[k] = { key: k, kind: d.kind, name: d.name, fines: [], open: [] });
    o.fines.push(f); const it = rmFineItem(f); if (it) o.open.push(it);
  }
  return Object.values(by).filter(o => o.open.length).map(o => Object.assign(o, {
    refund: r2f(o.open.filter(i => i.what === "refund").reduce((a, i) => a + i.amount, 0)), proofs: o.open.filter(i => i.what === "proof").length,
    oldest: o.open.map(i => i.f.date).sort()[0], last: rmLog("fines", o.key)[0], manual: o.fines.some(f => f.driverManual) && o.kind === "chauffeur" })).sort((a, b) => b.refund - a.refund || b.proofs - a.proofs);
}
function rmDebtorContact(o) {
  if (o.kind === "societe") { const c = S.clients.find(c => nk(c.name) === nk(o.name)); return { name: o.name, email: c?.email || "", address: c?.address, city: c?.city, vat: c?.vat, lang: c?.lang === "en" ? "en" : "fr" }; }
  const d = typeof drvRec === "function" ? drvRec(o.name) : null;
  return { name: o.name, email: d?.email || "", address: d?.street, city: [d?.zip, d?.city].filter(Boolean).join(" "), lang: d?.country && !["BE", "FR", "LU"].includes(String(d.country).toUpperCase()) ? "en" : "fr" };
}

/* ---------- vue ---------- */
VIEWS.relances = { title: "Relances", render: () => {
  const t = UI.tab.relances || "rclients";
  const cl = rmClients(), db = rmDebtors();
  const tb = tabs("relances", [["rclients", "Clients · factures", cl.filter(x => x.nLate).length || "", cl.some(x => x.nLate)], ["ramendes", "Amendes", db.length || ""]]);
  const q = (UI.q || "").toLowerCase().trim();
  if (t === "ramendes") {
    const rows = db.filter(o => !q || o.name.toLowerCase().includes(q));
    const tot = db.reduce((a, o) => a + o.refund, 0);
    return head("Relances", `Amendes : ${eur(tot)} à récupérer · ${plural(db.reduce((a, o) => a + o.proofs, 0), "preuve")} de paiement attendue(s)`, `<a class="btn" href="#flotte" data-a="go-fines">Ouvrir les amendes</a>`) + tb +
      `<div class="panel">${searchBar("Rechercher un chauffeur ou une société…")}${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Débiteur</th><th class="r">Amendes</th><th class="r">À rembourser</th><th class="r">Preuves attendues</th><th>Plus ancienne</th><th>Dernière relance</th><th></th></tr></thead><tbody>
      ${rows.map(o => `<tr class="click" data-a="rm-fines" data-key="${esc(o.key)}"><td><b class="${o.manual ? "drv-man" : ""}">${esc(o.name)}</b> <span class="chip">${o.kind === "societe" ? "Société" : "Chauffeur"}</span></td><td class="r num">${o.open.length}</td>
        <td class="r num">${o.refund ? `<b>${eur(o.refund)}</b>` : "—"}</td><td class="r num">${o.proofs || "—"}</td><td class="num">${fmtDate(o.oldest)}</td>
        <td class="small">${o.last ? `${fmtDate(o.last.date)} · ${esc(o.last.type === "etat" ? "état de compte" : "rappel")}` : `<span class="muted">jamais</span>`}</td><td class="r"><button class="btn sm primary" data-a="rm-fines" data-key="${esc(o.key)}">Préparer</button></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">${db.length ? "Aucun débiteur ne correspond." : "Aucun remboursement ni preuve de paiement attendu. 👍"}</div>`}</div>
      <div class="hint">Sont repris les amendes à charge du chauffeur (ou de sa société) : remboursement attendu quand W.A.Y.S. a payé, preuve de paiement attendue quand l'auteur paie lui-même.</div>`;
  }
  const only = UI.filter === "retard";
  const rows = cl.filter(o => (!only || o.nLate) && (!q || o.name.toLowerCase().includes(q)));
  const tot = cl.reduce((a, o) => a + o.total, 0), late = cl.reduce((a, o) => a + o.late, 0);
  return head("Relances", `${plural(cl.length, "client")} avec des factures ouvertes · ${eur(tot)} à encaisser dont ${eur(late)} en retard`) + tb +
    `<div class="panel">${searchBar("Rechercher un client…", [["tous", "Tous"], ["retard", "En retard", cl.some(o => o.nLate)]])}${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Client</th><th class="r">Factures ouvertes</th><th class="r">Reste dû</th><th class="r">En retard</th><th>Plus ancienne échéance</th><th>Dernière relance</th><th></th></tr></thead><tbody>
    ${rows.map(o => `<tr class="click" data-a="rm-client" data-id="${esc(o.id)}"><td><b>${esc(o.name)}</b>${o.c?.email ? "" : ` <span class="chip warn" title="${esc(tr("Pas d'adresse e-mail dans la fiche client"))}">sans e-mail</span>`}</td>
      <td class="r num">${o.nInv}${o.items.length > o.nInv ? ` <span class="muted small">+ ${o.items.length - o.nInv} NC</span>` : ""}</td><td class="r num"><b>${eur(o.total)}</b></td>
      <td class="r num">${o.nLate ? `<span class="txt-bad">${eur(o.late)}</span><div class="muted small">${plural(o.nLate, "facture")}</div>` : "—"}</td>
      <td class="num">${fmtDate(o.oldest)}${o.maxLate ? ` <span class="chip ${o.maxLate > 30 ? "bad" : "warn"}">${o.maxLate} j de retard</span>` : ""}</td>
      <td class="small">${o.last ? `${fmtDate(o.last.date)} · ${esc(o.last.type === "etat" ? "état de compte" : RM_LEVELS[o.last.level]?.[0] || "rappel")}` : `<span class="muted">jamais</span>`}</td>
      <td class="r"><button class="btn sm primary" data-a="rm-client" data-id="${esc(o.id)}">Préparer</button></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty">${cl.length ? "Aucun client ne correspond." : "Aucune facture ouverte. 👍"}</div>`}</div>`;
} };
ACTIONS["go-fines"] = (el, e) => { if (e) e.preventDefault(); UI.tab.flotte = "amendes"; location.hash = "#flotte"; };
ACTIONS["go-reminders"] = () => { UI.tab.relances = "rclients"; location.hash = "#relances"; };

/* ---------- e-mail (destinataire libre) ---------- */
function rmMail(rcpt, subject, body, onOpen) {
  const m = modal(`${mHead("E-mail à " + esc(rcpt.name || ""))}<div class="body">
    <label class="f">Destinataire<input id="rml-to" value="${esc(rcpt.email || "")}" placeholder="adresse@exemple.be"></label>
    <label class="f">Objet<input id="rml-subj" value="${esc(subject)}"></label>
    <label class="f">Message<textarea id="rml-body" rows="14">${esc(body)}</textarea></label>
    <div class="hint">Joignez le PDF téléchargé à votre e-mail. Si « Ouvrir dans la messagerie » ne fonctionne pas sur cet appareil, utilisez « Copier ».</div></div>
    <footer><div class="left"><a class="btn" id="rml-open" target="_blank" rel="noopener">Ouvrir dans la messagerie</a></div><button class="btn" id="rml-copy">Copier l'objet et le message</button><button class="btn primary" data-close>Fermer</button></footer>`, "lg");
  const link = () => { m.querySelector("#rml-open").href = `mailto:${encodeURIComponent(val("rml-to"))}?subject=${encodeURIComponent(val("rml-subj"))}&body=${encodeURIComponent(m.querySelector("#rml-body").value)}`; };
  link(); m.addEventListener("input", link);
  m.querySelector("#rml-open").addEventListener("click", () => onOpen && onOpen(val("rml-to")));
  m.querySelector("#rml-copy").onclick = async () => { try { await navigator.clipboard.writeText(val("rml-subj") + "\n\n" + m.querySelector("#rml-body").value); toast("Copié : collez-le dans votre messagerie"); onOpen && onOpen(""); } catch { m.querySelector("#rml-body").select(); } };
}

/* ---------- PDF commun ---------- */
async function rmPdf({ title, number, rcpt, label, intro, cols, rows, totals, after, file }) {
  try {
    const doc = await newPdf();
    pdfHeader(doc, title, number || "", [fmtDate(today())]);
    pdfClient(doc, 52, rcpt, label);
    let y = 80;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    for (const p of intro) { const l = doc.splitTextToSize(pdfTxt(p), 180); doc.text(l, 15, y); y += l.length * 4.8 + 3; }
    y = pdfTable(doc, 15, y + 2, cols, rows) + 7;
    for (const [a, b, strong] of totals) { if (y > 272) { doc.addPage(); y = 20; } doc.setFont("helvetica", strong ? "bold" : "normal"); doc.setFontSize(strong ? 12 : 10); doc.text(pdfTxt(a), 150, y, { align: "right" }); doc.text(pdfTxt(b), 195, y, { align: "right" }); y += strong ? 8 : 5.5; }
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); y += 5;
    for (const p of after) { const l = doc.splitTextToSize(pdfTxt(p), 180); if (y + l.length * 4.6 > 282) { doc.addPage(); y = 20; } doc.text(l, 15, y); y += l.length * 4.6 + 3; }
    await offerFile(file, doc.output("arraybuffer"));
    return true;
  } catch (e) { toast("Le générateur PDF n'a pas pu se charger. Réessayez."); return false; }
}
async function rmRecord(kind, key, type, level, items, via) {
  await save("reminders", null, { kind, key, type, level: level || null, date: today(), via, by: ME?.name || "", items });
}

/* ---------- relance d'un client ---------- */
ACTIONS["rm-client"] = el => {
  const id = el.dataset.id, c = client(id) || { name: clientName(id) }, items = rmClientItems(id), s = settings();
  const last = rmLog("client", id)[0];
  let type = "rappel", level = Math.min(3, last && last.type === "rappel" ? (last.level || 1) + 1 : 1), lang = clientLang(id);
  const sel = new Set(items.filter(o => o.d.kind === "nc" || daysLate(o.d.dueDate) > 0).map(o => o.d.id));
  if (!sel.size) items.forEach(o => sel.add(o.d.id));
  const m = modal(`${mHead("Relance · " + esc(c.name))}<div class="body stack-s">
    <div class="row-g wrap"><div class="seg" role="group" id="rm-type"><button data-t="rappel" class="on">Rappel de paiement</button><button data-t="etat">État de compte</button></div>
      <select id="rm-level" class="fsel">${Object.entries(RM_LEVELS).map(([k, [l]]) => `<option value="${k}" ${+k === level ? "selected" : ""}>${l}</option>`).join("")}</select>
      <div class="seg" data-noi18n><button data-lg="fr" class="${lang === "fr" ? "on" : ""}">FR</button><button data-lg="en" class="${lang === "en" ? "on" : ""}">EN</button></div></div>
    ${last ? `<div class="muted small">Dernière relance : ${fmtDate(last.date)} · ${esc(last.type === "etat" ? "état de compte" : RM_LEVELS[last.level]?.[0] || "rappel")}${last.by ? " · " + esc(last.by) : ""}</div>` : ""}
    <div class="row-g wrap small"><button class="linkbtn" data-sel="all">Tout cocher</button> · <button class="linkbtn" data-sel="late">Seulement les retards</button> · <button class="linkbtn" data-sel="none">Tout décocher</button></div>
    <div class="tablewrap" style="max-height:360px;overflow:auto"><table><thead><tr><th class="ck"></th><th>Pièce</th><th>Date</th><th>Échéance</th><th class="r">Montant</th><th class="r">Reste dû</th><th>Dernière relance</th></tr></thead><tbody>
    ${items.map(o => { const dl = daysLate(o.d.dueDate), lr = rmLastFor("client", o.d.id); return `<tr class="hov click" data-id="${o.d.id}"><td class="ck"><input type="checkbox" ${sel.has(o.d.id) ? "checked" : ""}></td>
      <td class="mono">${esc(o.d.number)}${o.d.kind === "nc" ? ` <span class="chip info">NC</span>` : ""}</td><td class="num">${fmtDate(o.d.date)}</td>
      <td class="num">${o.d.kind === "nc" ? "—" : fmtDate(o.d.dueDate)}${dl ? ` <span class="chip ${dl > 30 ? "bad" : "warn"}">${dl} j</span>` : ""}</td>
      <td class="r num">${eur(baseDue(o.d))}</td><td class="r num"><b>${eur(o.due)}</b></td><td class="small muted">${lr ? fmtDate(lr.date) : "—"}</td></tr>`; }).join("")}</tbody></table></div>
    <div class="rm-sum" id="rm-sum"></div>
    <label class="chk line small"><input type="checkbox" id="rm-log" checked> Noter cette relance (date et factures) à l'envoi ou au téléchargement</label></div>
    <footer><button class="btn" data-close>Fermer</button><button class="btn" id="rm-mail">✉ E-mail</button><button class="btn primary" id="rm-pdf">Télécharger le PDF</button></footer>`, "lg");
  const chosen = () => items.filter(o => sel.has(o.d.id));
  const upd = () => { const ch = chosen(), tot = ch.reduce((a, o) => a + o.due, 0);
    m.querySelector("#rm-sum").innerHTML = `<span>${plural(ch.length, "pièce")}</span><span>Total réclamé <b>${eur(tot)}</b></span>${ch.some(o => o.d.kind === "nc") ? `<span class="muted small">notes de crédit déduites</span>` : ""}`;
    m.querySelector("#rm-level").style.display = type === "rappel" ? "" : "none";
    m.querySelector("#rm-pdf").disabled = m.querySelector("#rm-mail").disabled = !ch.some(o => o.d.kind === "facture"); };
  m.querySelectorAll("#rm-type [data-t]").forEach(b => b.onclick = () => { type = b.dataset.t; m.querySelectorAll("#rm-type [data-t]").forEach(x => x.classList.toggle("on", x === b)); upd(); });
  m.querySelectorAll("[data-lg]").forEach(b => b.onclick = () => { lang = b.dataset.lg; m.querySelectorAll("[data-lg]").forEach(x => x.classList.toggle("on", x === b)); });
  m.querySelector("#rm-level").onchange = e => { level = +e.target.value; };
  m.querySelectorAll("tbody tr[data-id]").forEach(r => r.addEventListener("click", e => { const cb = r.querySelector("input"); if (e.target !== cb) cb.checked = !cb.checked; if (cb.checked) sel.add(r.dataset.id); else sel.delete(r.dataset.id); upd(); }));
  m.querySelectorAll("[data-sel]").forEach(b => b.onclick = () => { sel.clear(); items.forEach(o => { if (b.dataset.sel === "all" || (b.dataset.sel === "late" && (o.d.kind === "nc" || daysLate(o.d.dueDate) > 0))) sel.add(o.d.id); });
    m.querySelectorAll("tbody tr[data-id]").forEach(r => r.querySelector("input").checked = sel.has(r.dataset.id)); upd(); });
  upd();
  const T = () => rmClientText(c, chosen(), type, level, lang, s);
  const note = async via => { if (!m.querySelector("#rm-log").checked) return; await rmRecord("client", id, type, type === "rappel" ? level : null, chosen().map(o => ({ id: o.d.id, number: o.d.number, amount: o.due })), via); };
  m.querySelector("#rm-pdf").onclick = async () => { const t = T();
    const ok = await withLang(lang, () => rmPdf({ title: t.title, number: "", rcpt: c, label: lang === "en" ? "To" : "Destinataire", intro: t.intro, file: `${t.fileBase}.pdf`,
      cols: [{ t: lang === "en" ? "Document" : "Pièce", w: 36 }, { t: "Date", w: 24 }, { t: lang === "en" ? "Due date" : "Échéance", w: 24 }, { t: lang === "en" ? "Days late" : "Retard", w: 18, r: 1 }, { t: lang === "en" ? "Amount" : "Montant", w: 30, r: 1 }, { t: lang === "en" ? "Outstanding" : "Reste dû", w: 48, r: 1 }],
      rows: chosen().map(o => [(o.d.kind === "nc" ? (lang === "en" ? "Credit note " : "Note de crédit ") : "") + o.d.number, fmtDate(o.d.date), o.d.kind === "nc" ? "-" : fmtDate(o.d.dueDate), o.d.kind === "nc" ? "" : (daysLate(o.d.dueDate) ? daysLate(o.d.dueDate) + (lang === "en" ? " d" : " j") : ""), eur(baseDue(o.d)), eur(o.due)]),
      totals: [[lang === "en" ? "Total due" : "Total dû", eur(t.total), true]], after: t.after }));
    if (ok) { await note("pdf"); toast(type === "etat" ? "État de compte téléchargé" : "Rappel téléchargé"); } };
  m.querySelector("#rm-mail").onclick = () => { const t = T(); let done = false; rmMail({ name: c.name, email: c.email }, t.subject, t.body, async () => { if (!done) { done = true; await note("email"); } }); };
};
function rmClientText(c, ch, type, level, lang, s) {
  const en = lang === "en", total = r2f(ch.reduce((a, o) => a + o.due, 0)), late = ch.filter(o => o.d.kind === "facture" && daysLate(o.d.dueDate) > 0);
  const list = ch.map(o => `- ${o.d.kind === "nc" ? (en ? "Credit note " : "Note de crédit ") : (en ? "Invoice " : "Facture ")}${o.d.number} ${en ? "of" : "du"} ${fmtDate(o.d.date)}${o.d.kind === "nc" ? "" : ` (${en ? "due" : "échéance"} ${fmtDate(o.d.dueDate)})`} : ${eur(o.due)}${o.d.kind === "nc" ? "" : ` — ${en ? "reference" : "communication"} ${invRef(o.d)}`}`).join("\n");
  const pay = s.iban ? (en ? `to account ${s.iban}` : `sur le compte ${s.iban}`) : "";
  const hello = en ? `Dear ${c.contact || "Sir or Madam"},` : `Bonjour${c.contact ? " " + c.contact : ""},`;
  const sign = `${en ? "Kind regards" : "Bien cordialement"},\n${s.name}${s.phone ? "\n" + s.phone : ""}${s.email ? "\n" + s.email : ""}`;
  const fileBase = `${type === "etat" ? (en ? "statement" : "etat-de-compte") : (en ? "reminder" : "rappel")}-${(c.name || "client").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40)}-${today()}`;
  if (type === "etat") {
    const intro = [en ? `Please find below the statement of your account with ${s.name} as of ${fmtDate(today())}.` : `Veuillez trouver ci-dessous l'état de votre compte chez ${s.name} au ${fmtDate(today())}.`];
    const after = [en ? `Please settle the outstanding balance${pay ? " " + pay : ""}, using the reference of each invoice. If you have already paid, please disregard this statement.` : `Merci de régler le solde${pay ? " " + pay : ""} en mentionnant la communication de chaque facture. Si le paiement a déjà été effectué, merci de ne pas tenir compte de ce relevé.`];
    return { title: en ? "STATEMENT OF ACCOUNT" : "ÉTAT DE COMPTE", intro, after, total, fileBase,
      subject: en ? `Statement of account – ${s.name}` : `État de compte – ${s.name}`, body: `${hello}\n\n${intro[0]}\n\n${list}\n\n${en ? "Balance due" : "Solde dû"} : ${eur(total)}\n\n${after[0]}\n\n${sign}` };
  }
  const L = {
    1: en ? [`Unless we are mistaken, the following invoices remain unpaid to date.`, `We would be grateful if you could settle the amount of ${eur(total)}${pay ? " " + pay : ""} at your earliest convenience. If your payment has crossed this letter, please disregard it.`]
          : [`Sauf erreur de notre part, les factures suivantes restent impayées à ce jour.`, `Nous vous remercions de bien vouloir régler la somme de ${eur(total)}${pay ? " " + pay : ""} dans les meilleurs délais. Si votre paiement a croisé ce courrier, merci de ne pas en tenir compte.`],
    2: en ? [`Despite our previous reminder, the following invoices are still unpaid.`, `We kindly ask you to pay the amount of ${eur(total)}${pay ? " " + pay : ""} within 8 days.`]
          : [`Malgré notre précédent rappel, les factures suivantes sont toujours impayées.`, `Nous vous prions de régler la somme de ${eur(total)}${pay ? " " + pay : ""} dans les 8 jours.`],
    3: en ? [`Despite our reminders, the following invoices remain unpaid. This letter constitutes a formal notice.`, `Failing payment of ${eur(total)}${pay ? " " + pay : ""} within 15 days, we will be obliged to apply the late-payment interest and compensation provided for in our general terms and conditions and in the law, and to take the necessary steps to recover the debt.`]
          : [`Malgré nos rappels, les factures suivantes restent impayées. Le présent courrier vaut mise en demeure.`, `À défaut de paiement de la somme de ${eur(total)}${pay ? " " + pay : ""} dans les 15 jours, nous serons contraints d'appliquer les intérêts de retard et l'indemnité forfaitaire prévus par nos conditions générales et par la loi, et d'entreprendre les démarches nécessaires au recouvrement.`]
  }[level];
  return { title: (RM_LEVELS[level][en ? 1 : 0]).toUpperCase(), intro: [L[0]], after: [L[1], en ? "For any question, please do not hesitate to contact us." : "Pour toute question, n'hésitez pas à nous contacter."], total, fileBase,
    subject: `${RM_LEVELS[level][en ? 1 : 0]} – ${late.length === 1 ? (en ? "invoice " : "facture ") + late[0].d.number : s.name}`, body: `${hello}\n\n${L[0]}\n\n${list}\n\n${en ? "Total due" : "Total dû"} : ${eur(total)}\n\n${L[1]}\n\n${sign}` };
}

/* ---------- relance / état de compte des amendes ---------- */
ACTIONS["rm-fines"] = el => {
  const key = el.dataset.key, o = rmDebtors().find(x => x.key === key) || (() => { const fs = (S.fines || []).filter(f => fineKey(f) === key); if (!fs.length) return null; const d = fineDebtor(fs[0]); return { key, kind: d.kind, name: d.name, fines: fs, open: fs.map(rmFineItem).filter(Boolean) }; })();
  if (!o) return;
  const rc = rmDebtorContact(o), s = settings(); let type = "rappel", lang = rc.lang, hist = false;
  const all = o.fines.slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const sel = new Set(o.open.map(i => i.f.id));
  const m = modal(`${mHead("Amendes · " + `<span class="${o.manual ? "drv-man" : ""}">${esc(o.name)}</span>`)}<div class="body stack-s">
    <div class="row-g wrap"><div class="seg" role="group" id="rf-type"><button data-t="rappel" class="on">Rappel</button><button data-t="etat">État de compte</button></div>
      <div class="seg" data-noi18n><button data-lg="fr" class="${lang === "fr" ? "on" : ""}">FR</button><button data-lg="en" class="${lang === "en" ? "on" : ""}">EN</button></div>
      <label class="small" id="rf-hist-box" hidden><input type="checkbox" id="rf-hist"> Inclure les amendes déjà réglées (historique)</label></div>
    <div class="muted small">${o.kind === "societe" ? "Société" : "Chauffeur"}${rc.email ? " · " + esc(rc.email) : " · pas d'adresse e-mail connue"}${o.last ? ` · dernière relance le ${fmtDate(o.last.date)}` : ""}</div>
    <div class="tablewrap" style="max-height:380px;overflow:auto"><table><thead><tr><th class="ck"></th><th>Date</th><th>PV</th><th>Véhicule · chauffeur</th><th>Situation</th><th class="r">Montant</th></tr></thead><tbody id="rf-rows"></tbody></table></div>
    <div class="rm-sum" id="rf-sum"></div>
    <label class="chk line small"><input type="checkbox" id="rf-log" checked> Noter cette relance à l'envoi ou au téléchargement</label></div>
    <footer><button class="btn" data-close>Fermer</button><button class="btn" id="rf-mail">✉ E-mail</button><button class="btn primary" id="rf-pdf">Télécharger le PDF</button></footer>`, "lg");
  const item = f => rmFineItem(f) || { f, st: fineStage(f), what: "done", amount: 0 };
  const shown = () => type === "etat" && hist ? all : all.filter(f => rmFineItem(f));
  const sitTxt = (i, en) => i.what === "refund" ? (en ? "To be reimbursed to W.A.Y.S." : "À rembourser à W.A.Y.S.") : i.what === "proof" ? (fineIsPaid(i.f) || i.f.paidDate ? (en ? "Proof of payment expected" : "Preuve de paiement attendue") : (en ? "To be paid by you, then send proof" : "À payer par vous, puis envoyer la preuve")) : (en ? "Settled" : "Réglée");
  const draw = () => {
    m.querySelector("#rf-rows").innerHTML = shown().map(f => { const i = item(f), v = veh(f.vehicleId); return `<tr class="hov click" data-id="${f.id}"><td class="ck"><input type="checkbox" ${sel.has(f.id) ? "checked" : ""}></td>
      <td class="num">${fmtDate(f.date)}</td><td class="mono small">${esc(f.pvNumber || "—")}</td><td class="small">${v ? `<span class="plate sm">${esc(v.plate)}</span> ` : ""}${drvName(f)}</td>
      <td class="small"><span class="chip ${i.what === "refund" ? "orange" : i.what === "proof" ? "violet" : "good"}">${esc(sitTxt(i, false))}</span>${i.what === "proof" && fineRef(f) ? `<div class="mono muted">${esc(ogmFmt(fineRef(f)))}</div>` : ""}</td>
      <td class="r num">${eur(i.what === "refund" ? i.amount : fineAmt(f))}</td></tr>`; }).join("");
    m.querySelectorAll("#rf-rows tr").forEach(r => r.addEventListener("click", e => { const cb = r.querySelector("input"); if (e.target !== cb) cb.checked = !cb.checked; if (cb.checked) sel.add(r.dataset.id); else sel.delete(r.dataset.id); upd(); }));
    upd();
  };
  const chosen = () => shown().filter(f => sel.has(f.id)).map(item);
  const upd = () => { const ch = chosen(), refund = ch.filter(i => i.what === "refund").reduce((a, i) => a + i.amount, 0), pr = ch.filter(i => i.what === "proof").length;
    m.querySelector("#rf-sum").innerHTML = `<span>${plural(ch.length, "amende")}</span>${refund ? `<span>À rembourser <b>${eur(refund)}</b></span>` : ""}${pr ? `<span>${plural(pr, "preuve")} de paiement à fournir</span>` : ""}`;
    m.querySelector("#rf-hist-box").hidden = type !== "etat"; m.querySelector("#rf-pdf").disabled = m.querySelector("#rf-mail").disabled = !ch.length; };
  m.querySelectorAll("#rf-type [data-t]").forEach(b => b.onclick = () => { type = b.dataset.t; m.querySelectorAll("#rf-type [data-t]").forEach(x => x.classList.toggle("on", x === b)); draw(); });
  m.querySelectorAll("[data-lg]").forEach(b => b.onclick = () => { lang = b.dataset.lg; m.querySelectorAll("[data-lg]").forEach(x => x.classList.toggle("on", x === b)); });
  m.querySelector("#rf-hist").onchange = e => { hist = e.target.checked; if (hist) all.forEach(f => sel.add(f.id)); draw(); };
  draw();
  const T = () => rmFineText(rc, chosen(), type, lang, s, sitTxt);
  const note = async via => { if (!m.querySelector("#rf-log").checked) return; await rmRecord("fines", key, type, null, chosen().map(i => ({ id: i.f.id, number: i.f.pvNumber || "", amount: i.amount, what: i.what })), via); };
  m.querySelector("#rf-pdf").onclick = async () => { const t = T(), en = lang === "en";
    const ok = await withLang(lang, () => rmPdf({ title: t.title, rcpt: { name: rc.name, address: rc.address, city: rc.city, vat: rc.vat }, label: en ? "To" : "Destinataire", intro: t.intro, file: `${t.fileBase}.pdf`,
      cols: [{ t: "Date", w: 23 }, { t: en ? "Ticket no." : "N° de PV", w: 41 }, { t: en ? "Vehicle / driver" : "Véhicule / chauffeur", w: 36 }, { t: en ? "Status / reference" : "Situation / communication", w: 52 }, { t: en ? "Amount" : "Montant", w: 28, r: 1 }],
      rows: chosen().map(i => { const v = veh(i.f.vehicleId); return [fmtDate(i.f.date), i.f.pvNumber || "-", [v ? v.plate : "", i.f.driver].filter(Boolean).join("\n"), sitTxt(i, en) + (i.what === "proof" && fineRef(i.f) ? "\n" + ogmFmt(fineRef(i.f)) + (fineLast(i.f)?.iban || i.f.payIban ? "\n" + (fineLast(i.f)?.iban || i.f.payIban) : "") : ""), eur(i.what === "refund" ? i.amount : fineAmt(i.f))]; }),
      totals: t.refund ? [[en ? "Total to reimburse" : "Total à rembourser", eur(t.refund), true]] : [], after: t.after }));
    if (ok) { await note("pdf"); toast("Document téléchargé"); } };
  m.querySelector("#rf-mail").onclick = () => { const t = T(); let done = false; rmMail(rc, t.subject, t.body, async () => { if (!done) { done = true; await note("email"); } }); };
};
function rmFineText(rc, ch, type, lang, s, sitTxt) {
  const en = lang === "en", refund = r2f(ch.filter(i => i.what === "refund").reduce((a, i) => a + i.amount, 0)), proofs = ch.filter(i => i.what === "proof");
  const list = ch.map(i => { const v = veh(i.f.vehicleId); return `- ${fmtDate(i.f.date)} · ${en ? "ticket" : "PV"} ${i.f.pvNumber || "-"}${v ? " · " + v.plate : ""}${i.f.driver && rc.name !== i.f.driver ? " · " + i.f.driver : ""} : ${eur(i.what === "refund" ? i.amount : fineAmt(i.f))} — ${sitTxt(i, en)}${i.what === "proof" && fineRef(i.f) ? ` (${en ? "reference" : "communication"} ${ogmFmt(fineRef(i.f))})` : ""}`; }).join("\n");
  const hello = en ? `Hello ${rc.name},` : `Bonjour ${rc.name},`, sign = `${en ? "Kind regards" : "Bien cordialement"},\n${s.name}${s.phone ? "\n" + s.phone : ""}`;
  const pay = s.iban ? (en ? ` to account ${s.iban}` : ` sur le compte ${s.iban}`) : "";
  const intro = [type === "etat" ? (en ? `Here is the statement of the traffic fines in your name as of ${fmtDate(today())}.` : `Voici l'état de compte des amendes à votre nom au ${fmtDate(today())}.`)
    : (en ? `The following traffic fines are still awaiting action on your side.` : `Les amendes suivantes sont toujours en attente de votre part.`)];
  const after = [refund ? (en ? `Please reimburse ${eur(refund)}${pay}, mentioning "fines" and the ticket numbers.` : `Merci de rembourser ${eur(refund)}${pay} en mentionnant « amendes » et les numéros de PV.`) : "",
    proofs.length ? (en ? `For the fines you pay yourself, please send us the proof of payment (bank statement or receipt) as soon as possible.` : `Pour les amendes que vous payez vous-même, merci de nous envoyer la preuve de paiement (extrait de compte ou reçu) au plus vite.`) : "",
    en ? "For any question, please contact us." : "Pour toute question, n'hésitez pas à nous contacter."].filter(Boolean);
  return { title: type === "etat" ? (en ? "FINES STATEMENT" : "ÉTAT DE COMPTE AMENDES") : (en ? "FINES REMINDER" : "RAPPEL AMENDES"), intro, after, refund,
    fileBase: `${type === "etat" ? "etat-amendes" : "rappel-amendes"}-${rc.name.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40)}-${today()}`,
    subject: type === "etat" ? (en ? `Fines statement – ${s.name}` : `État de compte des amendes – ${s.name}`) : (en ? `Traffic fines – reminder` : `Amendes – rappel`),
    body: `${hello}\n\n${intro[0]}\n\n${list}\n\n${after.join("\n\n")}\n\n${sign}` };
}
