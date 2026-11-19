"use strict";
/* ======================= ventes : calculs ======================= */
function totals(doc) {
  let ht = 0, tva = 0, services = 0, produits = 0, cost = 0;
  const byRate = {};
  for (const l of doc.lines || []) {
    if (l.kind === "section" || l.kind === "note") continue;
    const lht = r2((+l.qty || 0) * (+l.price || 0));
    const rate = +l.vat || 0;
    ht += lht; byRate[rate] = (byRate[rate] || 0) + lht;
    const p = S.products.find(p => p.id === l.productId);
    if (l.cat === "gaz") produits += lht;
    else if (p && p.kind === "produit") { produits += lht; cost += (+p.cost || 0) * (+l.qty || 0); }
    else services += lht;
  }
  for (const rate in byRate) tva += r2(byRate[rate] * rate / 100);
  if (doc.odooTotals) { const o = doc.odooTotals; ht = +o.ht || 0; tva = +o.tva || 0; }   /* montants exacts d'Odoo */
  return { ht: r2(ht), tva: r2(tva), ttc: r2(ht + tva), byRate, services: r2(services), produits: r2(produits), cost: r2(cost) };
}
/* Communication structurée belge : 10 chiffres + 2 de contrôle (modulo 97) */
function ogm(number) {
  const digits = String(number || "").replace(/\D/g, "");
  const base = digits.slice(0, 4) + digits.slice(4).padStart(6, "0").slice(-6);
  let chk = Number(BigInt(base) % 97n); if (chk === 0) chk = 97;
  const all = base + pad(chk);
  return `+++${all.slice(0, 3)}/${all.slice(3, 7)}/${all.slice(7)}+++`;
}
/* paiements bancaires reliés (Banque → Relier…) : montant encaissé par document de vente, recalculé au plus une fois par 300 ms */
let _bp = null, _bpAt = 0;
function bankPaid(id) {
  if (!_bp || Date.now() - _bpAt > 300) {
    _bp = {}; _bpAt = Date.now();
    if (typeof txMatches === "function") for (const t of S.bankTx || []) for (const x of txMatches(t)) if (!x.coll) _bp[x.docId] = (_bp[x.docId] || 0) + (+x.amount || 0);
  }
  return Math.round((_bp[id] || 0) * 100) / 100;
}
const baseDue = d => d.odooTotals && d.odooTotals.residual != null ? (d.kind === "nc" ? -1 : 1) * d.odooTotals.residual : signedTotals(d).ttc;
function invStatus(d) {
  if (["envoyee", "partiel"].includes(d.status) && d.kind !== "devis") {
    const bp = bankPaid(d.id);
    if (bp) return Math.abs(bp) >= Math.abs(baseDue(d)) - 0.01 ? "payee" : "partiel";
  }
  if (d.status === "envoyee" && d.paymentState === "partial") return "partiel";
  if (d.kind === "facture" && d.status === "envoyee" && d.dueDate && d.dueDate < today()) return "retard";
  return d.status;
}
const STATUS = {
  brouillon: ["Brouillon", ""], envoye: ["Envoyé", "info"], accepte: ["Accepté", "good"], refuse: ["Refusé", "bad"],
  envoyee: ["Envoyée", "info"], payee: ["Payée", "good"], retard: ["En retard", "warn"],
  partiel: ["Paiement partiel", "warn"], annulee: ["Annulée", "bad"]
};
const chip = st => { const [l, c] = STATUS[st] || [st, ""]; return `<span class="chip ${c}">${l}</span>`; };
/* facture, note de crédit (nc) et devis partagent la collection docs ; une note de crédit compte en négatif */
const KIND_LBL = { facture: "Facture", nc: "Note de crédit", devis: "Devis" };
const KIND_UP = { facture: "FACTURE", nc: "NOTE DE CRÉDIT", devis: "DEVIS" };
const isSale = d => d.kind === "facture" || d.kind === "nc";
const issued = () => S.docs.filter(d => isSale(d) && d.status !== "brouillon" && d.status !== "annulee");
/* reste à encaisser : Odoo connaît les paiements partiels */
/* … diminué de ce que la banque a déjà encaissé (paiements reliés), jamais en dessous de zéro */
const dueOf = d => { const b = baseDue(d), r = Math.round((b - bankPaid(d.id)) * 100) / 100; return Math.sign(r) === Math.sign(b) ? r : 0; };
const signedTotals = d => { const T = totals(d); if (d.kind !== "nc") return T; const n = Object.assign({}, T); for (const k of Object.keys(n)) if (typeof n[k] === "number") n[k] = -n[k]; return n; };
const nextNumber = (kind, date) => nextSeq(S.docs.filter(d => d.kind === kind), ({ devis: "D", nc: "NC", facture: "F" })[kind] + "-" + (date || today()).slice(0, 4) + "-");

/* crée une facture brouillon (utilisée par les livraisons de gaz et l'étalonnage) */
async function createInvoice(clientId, lines, notes, extra) {
  const s = settings();
  const inv = Object.assign({ kind: "facture", number: nextNumber("facture"), clientId, date: today(), dueDate: addDays(today(), +s.payDays || 30), status: "brouillon", lines, notes: notes || "" }, extra || {});
  return save("docs", null, inv);
}

/* ======================= clients ======================= */
VIEWS.clients = {
  render() {
    const y = today().slice(0, 4), q = UI.q.toLowerCase();
    const rows = S.clients.filter(c => !q || [c.name, c.contact, c.email, c.city, c.vat].join(" ").toLowerCase().includes(q)).sort(byName);
    const inv = issued().map(d => ({ c: d.clientId, y: (d.date || "").slice(0, 4), T: signedTotals(d), st: d.status, due: dueOf(d) }));
    const ca = id => inv.filter(d => d.c === id && d.y === y).reduce((a, d) => a + d.T.ht, 0);
    const due = id => inv.filter(d => d.c === id && d.st === "envoyee").reduce((a, d) => a + d.due, 0);
    const bot = id => S.bottles.filter(b => b.status === "client" && b.clientId === id).length;
    const tl = id => S.tools.filter(t => t.clientId === id).length;
    return head("Clients", plural(S.clients.length, "client"), `<button class="btn primary" data-a="client-form" ${dis()}>Ajouter un client</button>`) +
      `<div class="panel">${searchBar("Rechercher un nom, une ville, un n° de TVA…")}
      <div class="tablewrap"><table><thead><tr><th>Client</th><th>Contact</th><th>Langue</th><th>N° TVA</th><th class="r">Bouteilles chez lui</th><th class="r">Outils</th><th class="r">CA ${y} HT</th><th class="r">À encaisser</th></tr></thead><tbody>
      ${rows.map(c => `<tr class="click" data-a="client-form" data-id="${c.id}"><td><b>${esc(c.name)}</b>${demoTag(c)}${odooTag(c)}<div class="muted">${esc(c.city || "")}</div></td>
        <td>${esc(c.contact || "")}<div class="muted">${esc(c.email || "")}</div></td><td><span class="chip ${c.lang === "en" ? "info" : ""}" data-noi18n>${c.lang === "en" ? "EN" : "FR"}</span></td><td class="mono">${esc(c.vat || "—")}</td>
        <td class="r num">${bot(c.id) || "—"}</td><td class="r num">${tl(c.id) || "—"}</td>
        <td class="r num">${eur0(ca(c.id))}</td><td class="r num">${due(c.id) ? eur(due(c.id)) : `<span class="muted">—</span>`}</td></tr>`).join("")}
      </tbody></table>${rows.length ? "" : `<div class="empty">${S.clients.length ? "Aucun client ne correspond." : "Aucun client pour l'instant."}</div>`}</div></div>`;
  }
};
ACTIONS["client-form"] = el => {
  const c = client(el.dataset.id) || {};
  const isNew = !c.id, od = isOdoo(c);
  const m = modal(`${mHead(isNew ? "Nouveau client" : esc(c.name) + odooTag(c))}<form id="f-client"><div class="body">${od ? odooNote("Fiche gérée dans Odoo : modifiez le nom, la TVA, l'adresse et les coordonnées dans Odoo, ils se mettent à jour ici. Les notes restent propres à l'ERP.", "res.partner", c.odooId) : ""}<div class="fields">
    ${field("c-name", "Raison sociale", c.name, { required: true })}${field("c-vat", "N° TVA", c.vat, { ph: "BE0123.456.789" })}
    ${field("c-contact", "Personne de contact", c.contact)}${field("c-email", "E-mail", c.email, { type: "email" })}
    ${field("c-lang", "Langue de communication", c.lang || "fr", { type: "select", options: [["fr", "Français"], ["en", "English"]] })}${field("c-phone", "Téléphone", c.phone)}${field("c-address", "Adresse", c.address)}${field("c-city", "Code postal et ville", c.city)}
  </div>${field("c-notes", "Notes", c.notes, { type: "textarea" })}</div>
  <footer>${isNew || od ? "" : `<div class="left"><button type="button" class="btn danger" data-a="client-del" data-id="${c.id}" ${dis()}>Supprimer</button></div>`}
  <button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    await save("clients", c.id, Object.assign({}, strip(c), { name: val("c-name"), vat: val("c-vat"), contact: val("c-contact"), email: val("c-email"), phone: val("c-phone"), lang: val("c-lang") || "fr", address: val("c-address"), city: val("c-city"), notes: val("c-notes"), createdAt: c.createdAt || today() }));
    closeModal(); toast("Client enregistré");
  };
  if (od) odooLock(m, ["c-name", "c-vat", "c-email", "c-phone", "c-lang", "c-address", "c-city"]);
};
ACTIONS["client-del"] = el => {
  const id = el.dataset.id, n = S.docs.filter(d => d.clientId === id).length;
  confirmBox(n ? `Ce client a ${plural(n, "document")} (devis ou factures). Supprimer quand même ?` : "Supprimer ce client ?", () => remove("clients", id));
};

/* ======================= devis & factures ======================= */
/* filtres avancés et sélection (gardés d'une page à l'autre, par liste) */
const MONTHS_FULL = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
function docFilt(kind) { UI.df = UI.df || {}; return UI.df[kind] = UI.df[kind] || { year: "", period: "", client: "", origin: "" }; }
function docSel(kind) { UI.sel = UI.sel || {}; return UI.sel[kind] = UI.sel[kind] || new Set(); }
function docMatchPeriod(date, f) {
  if (f.year && !(date || "").startsWith(f.year)) return false;
  if (!f.period) return true;
  const m = +(date || "").slice(5, 7);
  if (f.period[0] === "T") { const q = +f.period.slice(1); return m >= q * 3 - 2 && m <= q * 3; }
  return m === +f.period;
}
function docsView(kind) {
  const isQ = kind === "devis";
  const all = S.docs.filter(d => isQ ? d.kind === "devis" : isSale(d)).map(d => Object.assign({}, d, { T: signedTotals(d), st: invStatus(d) }));
  const filters = isQ ? [["tous", "Tous"], ["brouillon", "Brouillons"], ["envoye", "Envoyés"], ["accepte", "Acceptés"], ["refuse", "Refusés"]]
    : [["tous", "Toutes"], ["brouillon", "Brouillons"], ["envoyee", "Envoyées"], ["retard", "En retard", all.some(d => d.st === "retard")], ["payee", "Payées"], ["partiel", "Paiement partiel", all.some(d => d.st === "partiel")], ["annulee", "Annulées", all.some(d => d.st === "annulee")], ["nc", "Notes de crédit"]];
  const f = docFilt(kind), sel = docSel(kind);
  const q = UI.q.toLowerCase();
  const rows = all.filter(d => (UI.filter === "tous" || (UI.filter === "nc" ? d.kind === "nc" : d.st === UI.filter)) && (!q || (d.number + " " + clientName(d.clientId) + " " + (d.ref || "") + " " + (d.origin || "")).toLowerCase().includes(q))
      && docMatchPeriod(d.date, f) && (!f.client || d.clientId === f.client) && (!f.origin || (f.origin === "odoo") === isOdoo(d)))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.number || "").localeCompare(a.number || ""));
  UI.nav[isQ ? "devis" : "facture"] = rows.map(d => d.id);
  const sumHT = rows.reduce((a, d) => a + d.T.ht, 0), sumTTC = rows.reduce((a, d) => a + d.T.ttc, 0);
  /* listes de choix tirées des documents eux-mêmes */
  const years = [...new Set(all.map(d => (d.date || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const cl = [...new Set(all.map(d => d.clientId).filter(Boolean))].map(id => [id, clientName(id)]).sort((a, b) => a[1].localeCompare(b[1], "fr"));
  const hasOdoo = all.some(isOdoo);
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(tr(l))}</option>`;
  const active = f.year || f.period || f.client || f.origin;
  const adv = `<div class="toolbar df-bar">
    <label class="df"><span>Année</span><select data-df="${kind}:year">${opt("", "Toutes", f.year)}${years.map(y => opt(y, y, f.year)).join("")}</select></label>
    <label class="df"><span>Période</span><select data-df="${kind}:period">${opt("", f.year ? "Toute l'année" : "Toutes", f.period)}<optgroup label="${tr("Trimestres")}">${[1, 2, 3, 4].map(t => opt("T" + t, t + (t === 1 ? "er" : "e") + " trimestre", f.period)).join("")}</optgroup><optgroup label="${tr("Mois")}">${MONTHS_FULL.map((m, k) => opt(String(k + 1), m, f.period)).join("")}</optgroup></select></label>
    <label class="df"><span>Client</span><select data-df="${kind}:client">${opt("", "Tous les clients", f.client)}${cl.map(([id, n]) => opt(id, n, f.client)).join("")}</select></label>
    ${hasOdoo ? `<label class="df"><span>Origine</span><select data-df="${kind}:origin">${opt("", "Toutes", f.origin)}${opt("odoo", "Odoo", f.origin)}${opt("erp", "ERP", f.origin)}</select></label>` : ""}
    ${active ? `<button class="linkbtn" data-a="df-reset" data-kind="${kind}">Effacer les filtres</button>` : ""}</div>`;
  /* sélection : seules les lignes visibles comptent */
  const vis = rows.filter(d => sel.has(d.id));
  const allOn = rows.length && vis.length === rows.length;
  const selBar = vis.length ? (() => {
    const ht = vis.reduce((a, d) => a + d.T.ht, 0), ttc = vis.reduce((a, d) => a + d.T.ttc, 0), due = isQ ? 0 : vis.filter(d => ["envoyee", "retard", "partiel"].includes(d.st)).reduce((a, d) => a + dueOf(d), 0);
    const payable = isQ ? [] : vis.filter(d => !isOdoo(d) && ["envoyee", "retard"].includes(d.st) && d.kind !== "nc");
    const drafts = vis.filter(d => !isOdoo(d) && d.status === "brouillon");
    const toFalco = !isQ && falcoOn() && isAdmin() ? vis.filter(d => isOdoo(d) && !(d.falco && d.falco.status === "sent") && ["envoyee", "payee"].includes(d.status)) : [];
    return `<div class="selbar"><b>${vis.length} sélectionné${vis.length > 1 ? "s" : ""}</b><span class="num">${eur(ht)} HT · <b>${eur(ttc)} TTC</b>${due ? ` · reste dû ${eur(due)}` : ""}</span>
      <span class="row-g wrap"><button class="btn sm" data-a="sel-export" data-kind="${kind}">Exporter (Excel)</button>
      ${payable.length && !readOnly ? `<button class="btn sm" data-a="sel-paid" data-kind="${kind}">Marquer payée${payable.length > 1 ? "s" : ""} (${payable.length})</button>` : ""}
      ${toFalco.length ? `<button class="btn sm" data-a="sel-falco" data-kind="${kind}">Transmettre à Falco (${toFalco.length})</button>` : ""}
      ${drafts.length && !readOnly ? `<button class="btn sm danger" data-a="sel-del" data-kind="${kind}">Supprimer les brouillons (${drafts.length})</button>` : ""}
      <button class="linkbtn" data-a="sel-clear" data-kind="${kind}">Désélectionner</button></span></div>`;
  })() : "";
  return head(isQ ? "Devis" : "Factures", `${rows.length} affiché${rows.length > 1 ? "s" : ""} · ${eur(sumHT)} HT · ${eur(sumTTC)} TTC`,
    `${isQ || !allowed("relances") ? "" : `<button class="btn" data-a="go-reminders">✉ Relances</button>`}<button class="btn primary" data-a="doc-form" data-kind="${kind}" ${dis()}>${isQ ? "Nouveau devis" : "Nouvelle facture"}</button>`) +
    (isQ ? "" : odooBanner()) + `<div class="panel">${searchBar("Rechercher un numéro, un client, une référence…", filters)}${adv}${selBar}
    <div class="tablewrap"><table><thead><tr><th class="ck"><input type="checkbox" data-a="sel-all" data-kind="${kind}" ${allOn ? "checked" : ""} aria-label="Tout sélectionner" ${rows.length ? "" : "disabled"}></th><th>Numéro</th><th>Client</th><th>Origine</th><th>Date</th><th>${isQ ? "Validité" : "Échéance"}</th><th>Statut</th><th class="r">HT</th><th class="r">TTC</th></tr></thead><tbody>
    ${rows.map(d => `<tr class="click ${sel.has(d.id) ? "sel" : ""}" data-a="doc-open" data-id="${d.id}"><td class="ck"><input type="checkbox" data-a="sel-one" data-kind="${kind}" data-id="${d.id}" ${sel.has(d.id) ? "checked" : ""} aria-label="Sélectionner ${esc(d.number)}"></td><td class="mono nowrap">${d.st === "retard" ? ADOT : ""}${esc(d.number)}${demoTag(d)}</td><td>${esc(clientName(d.clientId))}</td>
      <td class="muted">${isOdoo(d) ? `<span class="chip info">Odoo</span>${d.origin || d.ref ? " · " + esc(d.origin || d.ref) : ""}` : d.kind === "nc" ? `<span class="chip">Note de crédit</span>${d.creditForNo ? " · " + esc(d.creditForNo) : ""}` : d.deliveryNo ? "Livraison gaz " + esc(d.deliveryNo) : d.source === "etalonnage" ? "Étalonnage" : d.fromQuote ? "Devis " + esc(d.fromQuote) : ""}</td>
      <td class="num">${fmtDate(d.date)}</td><td class="num">${fmtDate(d.dueDate)}</td><td>${chip(d.st)}${isQ ? "" : falcoChip(d)}${!isQ && odooOn() && !isOdoo(d) && d.status === "brouillon" ? ` <span class="chip warn">à facturer dans Odoo</span>` : ""}</td><td class="r num">${eur(d.T.ht)}</td><td class="r num"><b>${eur(d.T.ttc)}</b></td></tr>`).join("")}
    </tbody>${rows.length > 1 ? `<tfoot><tr><td></td><td colspan="6" class="muted">Total des ${rows.length} documents affichés</td><td class="r num">${eur(sumHT)}</td><td class="r num"><b>${eur(sumTTC)}</b></td></tr></tfoot>` : ""}</table>${rows.length ? "" : `<div class="empty">${all.length ? "Rien ne correspond à ces filtres." : "Aucun document pour l'instant."}</div>`}</div></div>`;
}
/* lignes visibles = mêmes filtres que l'écran */
function docsVisible(kind) {
  const isQ = kind === "devis", f = docFilt(kind), q = UI.q.toLowerCase();
  return S.docs.filter(d => isQ ? d.kind === "devis" : isSale(d)).map(d => Object.assign({}, d, { T: signedTotals(d), st: invStatus(d) }))
    .filter(d => (UI.filter === "tous" || (UI.filter === "nc" ? d.kind === "nc" : d.st === UI.filter)) && (!q || (d.number + " " + clientName(d.clientId) + " " + (d.ref || "") + " " + (d.origin || "")).toLowerCase().includes(q))
      && docMatchPeriod(d.date, f) && (!f.client || d.clientId === f.client) && (!f.origin || (f.origin === "odoo") === isOdoo(d)));
}
const selectedDocs = kind => { const sel = docSel(kind); return docsVisible(kind).filter(d => sel.has(d.id)); };
ACTIONS["sel-one"] = el => { const sel = docSel(el.dataset.kind); el.checked ? sel.add(el.dataset.id) : sel.delete(el.dataset.id); render(true); };
ACTIONS["sel-all"] = el => { const sel = docSel(el.dataset.kind), v = docsVisible(el.dataset.kind); if (el.checked) v.forEach(d => sel.add(d.id)); else v.forEach(d => sel.delete(d.id)); render(true); };
ACTIONS["sel-clear"] = el => { docSel(el.dataset.kind).clear(); render(true); };
ACTIONS["df-reset"] = el => { UI.df[el.dataset.kind] = null; render(true); };
document.addEventListener("change", e => {
  const s = e.target.closest && e.target.closest("select[data-df]"); if (!s) return;
  const [kind, key] = s.dataset.df.split(":"); const f = docFilt(kind);
  f[key] = s.value;   /* une période sans année = ce mois ou trimestre, toutes années confondues */
  render(true);
});
ACTIONS["sel-export"] = el => {
  const kind = el.dataset.kind, docs = selectedDocs(kind);
  const n = v => (Math.round((+v || 0) * 100) / 100).toFixed(2).replace(".", ",");
  const c = v => { v = String(v ?? ""); return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const head = ["Numéro", "Type", "Client", "N° TVA client", "Date", "Échéance", "Statut", "HT", "TVA", "TTC", "Reste dû", "Origine", "Référence"];
  const lines = docs.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.number || "").localeCompare(b.number || "")).map(d => {
    const cli = client(d.clientId) || {};
    return [d.number, KIND_LBL[d.kind] || d.kind, clientName(d.clientId), cli.vat || "", d.date || "", d.dueDate || "", tr((STATUS[d.st] || [d.st])[0]),
      n(d.T.ht), n(d.T.tva), n(d.T.ttc), ["envoyee", "retard", "partiel"].includes(d.st) ? n(dueOf(d)) : n(0), isOdoo(d) ? "Odoo" : "ERP", d.ref || d.origin || ""].map(c).join(";");
  });
  const csv = "﻿" + [head.map(c).join(";"), ...lines].join("\r\n");
  offerFile(`${kind === "devis" ? "devis" : "factures"}-${today()}.csv`, csv, "text/csv");
};
ACTIONS["sel-paid"] = el => {
  const kind = el.dataset.kind, docs = selectedDocs(kind).filter(d => !isOdoo(d) && ["envoyee", "retard"].includes(d.st) && d.kind !== "nc");
  confirmBox(`Marquer ${docs.length} facture${docs.length > 1 ? "s" : ""} comme payée${docs.length > 1 ? "s" : ""} aujourd'hui ? (${docs.map(d => d.number).join(", ")})`, async () => {
    for (const d of docs) await patch("docs", d.id, { status: "payee", paidAt: today() });
    docSel(kind).clear(); toast(`${docs.length} facture${docs.length > 1 ? "s" : ""} marquée${docs.length > 1 ? "s" : ""} payée${docs.length > 1 ? "s" : ""}`);
  }, "Marquer payées");
};
ACTIONS["sel-del"] = el => {
  const kind = el.dataset.kind, docs = selectedDocs(kind).filter(d => !isOdoo(d) && d.status === "brouillon");
  const m = modal(`${mHead("Supprimer des brouillons")}<div class="body stack-s"><div>Vous allez supprimer définitivement <b>${docs.length} brouillon${docs.length > 1 ? "s" : ""}</b> : ${docs.map(d => `<span class="mono">${esc(d.number)}</span>`).join(", ")}.</div>
    <div class="muted small">Seuls les brouillons créés dans l'ERP sont concernés ; les documents émis et ceux venant d'Odoo ne sont jamais supprimés ainsi. Les livraisons liées sont déliées.</div>
    <label class="chk line confirm-chk"><input type="checkbox" id="sd-ok"> Je confirme la suppression</label></div>
    <footer><button class="btn" data-close>Annuler</button><button class="btn danger" id="sd-go" disabled>Supprimer</button></footer>`);
  m.querySelector("#sd-ok").onchange = e => { m.querySelector("#sd-go").disabled = !e.target.checked; };
  m.querySelector("#sd-go").onclick = async () => {
    m.querySelector("#sd-go").disabled = true;
    for (const d of docs) {
      for (const dl of S.deliveries.filter(x => x.invoiceId === d.id)) await patch("deliveries", dl.id, { invoiceId: null });
      for (const q of S.docs.filter(x => x.invoiceId === d.id)) await patch("docs", q.id, { invoiceId: null });
    }
    await removeMany("docs", docs.map(d => d.id));
    docs.forEach(d => docSel(kind).delete(d.id)); closeModal(); toast(`${docs.length} brouillon${docs.length > 1 ? "s" : ""} supprimé${docs.length > 1 ? "s" : ""}`);
  };
};
VIEWS.devis = { render: () => docsView("devis") };
VIEWS.factures = { render: () => docsView("facture") };

let EDIT = null;
ACTIONS["doc-form"] = el => docForm(el.dataset.kind, S.docs.find(d => d.id === el.dataset.id));
function docForm(kind, d, preset) {
  const s = settings(), isNew = !d, isQ = kind === "devis", isNC = kind === "nc";
  if (!S.clients.length) { toast("Ajoutez d'abord un client."); location.hash = "#clients"; return; }
  EDIT = d ? clone(d) : preset ? clone(preset) : { kind, number: nextNumber(kind), clientId: "", date: today(), dueDate: addDays(today(), isQ ? +s.quoteDays || 30 : +s.payDays || 30), status: "brouillon", lines: [{ productId: "", label: "", qty: 1, price: 0, vat: 21 }], notes: "" };
  const m = modal(`${mHead(isNew ? (isQ ? "Nouveau devis" : isNC ? "Nouvelle note de crédit" : "Nouvelle facture") : KIND_LBL[kind] + " " + esc(EDIT.number))}
  <form id="f-doc"><div class="body"><div class="fields">
    ${field("d-client", "Client", EDIT.clientId, { type: "select", options: clientOptions(), required: true })}
    ${field("d-number", "Numéro", EDIT.number, { required: true, cls: "mono" })}
    ${field("d-date", "Date", EDIT.date, { type: "date", required: true })}${field("d-due", isQ ? "Valable jusqu'au" : "Échéance", EDIT.dueDate, { type: "date" })}
    ${field("d-title", isQ ? "Titre du devis (facultatif)" : isNC ? "Titre de la note de crédit (facultatif)" : "Titre de la facture (facultatif)", EDIT.title, { wide: true, ph: "Ex. : Maintenance annuelle de la flotte 2026" })}
  </div>
  <div class="tablewrap"><table class="lines"><thead><tr><th class="dh-h" aria-label="${esc(tr("Déplacer"))}"></th><th style="min-width:280px">Article</th><th style="min-width:280px">Description</th><th style="width:80px">Qté</th><th style="width:110px">Prix HT</th><th style="width:80px">TVA</th><th class="r" style="width:100px">Total HT</th><th></th></tr></thead><tbody id="lines"></tbody></table></div>
  <div class="row-g wrap"><button type="button" class="btn sm" id="add-line">+ Ajouter une ligne</button><button type="button" class="btn sm" id="add-sec">+ Ajouter une section</button><button type="button" class="btn sm" id="add-note">+ Ajouter un commentaire</button><span class="hint">Une section (ex. « Consumables », « Services ») regroupe les lignes placées sous elle, avec un sous-total. Un commentaire est un texte libre imprimé sur le document, sans montant.</span></div>
  <div class="totals" id="d-totals"></div>
  <div class="vat-cl stack-s"><label class="chk"><input type="checkbox" id="d-vatcl" ${EDIT.vatClauseOn ? "checked" : ""}> Ajouter la mention TVA en bas du document</label>
    <div id="d-vatbox" ${EDIT.vatClauseOn ? "" : "hidden"}><textarea id="d-vattxt" rows="2" aria-label="${esc(tr("Mention TVA"))}" placeholder="${esc(tr("Ex. : Autoliquidation – TVA due par le cocontractant (art. 51, §2 du Code TVA)"))}">${esc(EDIT.vatClause != null ? EDIT.vatClause : (s.vatClause || ""))}</textarea>
    <div class="hint">${s.vatClause ? "Texte par défaut repris de Paramètres ; le modifier ici ne change que ce document." : `Aucun texte par défaut : vous pouvez en enregistrer un dans <a href="#parametres">Paramètres → Entreprise</a>.`} <button type="button" class="linkbtn small" id="d-vatreset" ${s.vatClause ? "" : "hidden"}>Reprendre le texte par défaut</button></div></div></div>
  ${field("d-notes", "Notes (visibles sur le document)", EDIT.notes, { type: "textarea" })}<div class="err" id="d-err"></div></div>
  <footer>${isNew ? "" : `<div class="left"><button type="button" class="btn danger" data-a="doc-del" data-id="${EDIT.id}" ${dis()}>Supprimer</button></div>`}
  <button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "xl");
  drawLines();
  const f = m.querySelector("form");
  f.addEventListener("input", e => { const tr = e.target.closest("tr[data-l]"), k = e.target.dataset.k; if (e.target.classList.contains("note-in")) e.target.rows = Math.min(8, Math.max(2, e.target.value.split("\n").length));
    if (tr && k && k !== "pq") { const l = EDIT.lines[+tr.dataset.l]; l[k] = k === "label" ? e.target.value : +e.target.value; refreshTotals(); } });
  dndBind(f);
  acBind(f, (i, pid) => {
    const p = S.products.find(p => p.id === pid);
    Object.assign(EDIT.lines[i], { productId: pid }, p ? { label: p.name, price: +p.price, vat: +p.vat } : {});
    if (pid === CAL_GENERIC) Object.assign(EDIT.lines[i], { label: EDIT.lines[i].label || "Étalonnage d'outil", vat: EDIT.lines[i].vat ?? 21 });
    if (prodLinkKind(EDIT.lines[i]) === "vehicle") EDIT.lines[i]._veh = true;
    if (!isCalLine(EDIT.lines[i])) { delete EDIT.lines[i].toolId; delete EDIT.lines[i].newTool; delete EDIT.lines[i].detail; delete EDIT.lines[i].ro; }
    drawLines();
    if (isCalLine(EDIT.lines[i])) calToolPicker(i);
    else { const q = document.querySelector(`#lines tr[data-l="${i}"] [data-k="qty"]`); q && q.focus(); }
  });
  f.addEventListener("change", e => {
    if (e.target.dataset.vk != null) { const l = EDIT.lines[+e.target.dataset.vk]; l.vehicleId = e.target.value || null; l.vehDetail = l.vehicleId ? vehLineTxt(l.vehicleId) : null; e.target.closest(".veh-ln")?.classList.toggle("missing", prodLinkKind(l) === "vehicle" && !l.vehicleId); return; }
    if (e.target.id === "d-date" && isNew) { document.getElementById("d-due").value = addDays(e.target.value, isQ ? +s.quoteDays || 30 : +s.payDays || 30); document.getElementById("d-number").value = nextNumber(kind, e.target.value); }
  });
  f.querySelector("#add-line").onclick = () => { EDIT.lines.push({ productId: "", label: "", qty: 1, price: 0, vat: 21 }); drawLines(); };
  f.querySelector("#d-vatcl").onchange = e => { const box = f.querySelector("#d-vatbox"), t = f.querySelector("#d-vattxt"); box.hidden = !e.target.checked; if (e.target.checked) { if (!t.value.trim()) t.value = s.vatClause || ""; t.focus(); } };
  f.querySelector("#d-vatreset").onclick = () => { f.querySelector("#d-vattxt").value = s.vatClause || ""; };
  f.querySelector("#add-note").onclick = () => { EDIT.lines.push({ kind: "note", label: "" }); drawLines(); const n = f.querySelectorAll(".note-in"); n[n.length - 1]?.focus(); };
  f.querySelector("#add-sec").onclick = () => { EDIT.lines.push({ kind: "section", label: "" }, { productId: "", label: "", qty: 1, price: 0, vat: 21 }); drawLines(); f.querySelectorAll(".sec-in")[f.querySelectorAll(".sec-in").length - 1]?.focus(); };
  f.addEventListener("click", e => {
    const tp = e.target.closest("[data-toolpick]"); if (tp) { calToolPicker(+tp.dataset.toolpick); return; }
    const vo = e.target.closest("[data-vehopen]"); if (vo) { EDIT.lines[+vo.dataset.vehopen]._veh = true; drawLines(); document.querySelector(`[data-vk="${vo.dataset.vehopen}"]`)?.focus(); return; }
    const b = e.target.closest("[data-rm]"); if (b) { EDIT.lines.splice(+b.dataset.rm, 1); drawLines(); return; }
    const mv = e.target.closest("[data-mv]"); if (mv) { const [i, d] = mv.dataset.mv.split(":").map(Number); moveStep(i, d); }
  });
  f.onsubmit = async e => {
    e.preventDefault();
    const err = document.getElementById("d-err");
    Object.assign(EDIT, { clientId: val("d-client"), number: val("d-number"), date: val("d-date"), dueDate: val("d-due"), notes: val("d-notes"), title: val("d-title"),
      vatClauseOn: f.querySelector("#d-vatcl").checked, vatClause: f.querySelector("#d-vattxt").value.trim() });
    if (EDIT.vatClauseOn && !EDIT.vatClause) { err.textContent = "Saisissez le texte de la mention TVA, ou décochez-la."; return; }
    EDIT.lines = EDIT.lines.filter(l => l.kind === "section" || l.kind === "note" ? (l.label || "").trim() : (l.label || l.productId || l.price));
    if (!EDIT.lines.some(l => l.kind !== "section" && l.kind !== "note")) { err.textContent = "Ajoutez au moins une ligne avec une description et un prix."; EDIT.lines.push({ productId: "", label: "", qty: 1, price: 0, vat: 21 }); drawLines(); return; }
    if (S.docs.some(x => x.kind === kind && x.number === EDIT.number && x.id !== EDIT.id)) { err.textContent = `Le numéro ${EDIT.number} existe déjà.`; return; }
    const vmiss = EDIT.lines.filter(l => l.kind !== "section" && l.kind !== "note" && prodLinkKind(l) === "vehicle" && !l.vehicleId).length;
    if (vmiss) { err.textContent = `${plural(vmiss, "ligne")} sans véhicule : choisissez le véhicule concerné (article lié à un véhicule).`; drawLines(); return; }
    EDIT.lines.forEach(l => { delete l._veh; if (!l.vehicleId) { delete l.vehicleId; delete l.vehDetail; } });
    const miss = kind === "nc" ? 0 : EDIT.lines.filter(l => isCalLine(l) && !l.toolId && !l.newTool).length;
    if (miss) { err.textContent = `${plural(miss, "ligne")} d'étalonnage sans outil : choisissez l'outil (et son RO) pour chacune.`; drawLines(); return; }
    const linked = kind === "nc" ? [] : await linkCalTools(EDIT);
    const id = await save("docs", EDIT.id, strip(EDIT));
    if (linked.length) await stampToolsSO(linked, id, EDIT);
    closeModal(); toast(linked.length ? `Enregistré · ${plural(linked.length, "outil")} en atelier` : "Enregistré"); setTimeout(() => openDoc(id), 60);
  };
}
/* ---------- choix d'un article par recherche (saisie partielle, sans accents ni casse) ---------- */
const acNorm = x => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const AC_KIND = { etalonnage: "Étalonnage", service: "Service", produit: "Produit" };
function acName(pid) { if (!pid) return ""; if (pid === CAL_GENERIC) return tr("Étalonnage d'outil (prix de la fiche outil)"); const p = S.products.find(x => x.id === pid); return p ? p.name : ""; }
function acItems(q) {
  const words = acNorm(q).split(/\s+/).filter(Boolean);
  const all = [{ id: "", name: tr("Ligne libre (sans article)"), kind: "" }, { id: CAL_GENERIC, name: tr("Étalonnage d'outil (prix de la fiche outil)"), kind: "etalonnage" },
    ...S.products.filter(p => !p.archived).slice().sort((a, b) => a.name.localeCompare(b.name, "fr"))];
  const hit = p => { const h = acNorm(`${p.name} ${p.ref || ""} ${p.code || ""} ${AC_KIND[p.kind] || ""}`); return words.every(w => h.includes(w)); };
  const r = words.length ? all.filter(p => p.id && hit(p)) : all;
  const starts = words.length ? r.filter(p => acNorm(p.name).startsWith(words[0])) : [];
  return [...starts, ...r.filter(p => !starts.includes(p))].slice(0, 60);
}
function acBind(form, onPick) {
  let pop = null, cur = null, act = 0, items = [];
  const close = () => { if (pop) pop.remove(); pop = null; if (cur) { cur.setAttribute("aria-expanded", "false"); cur.removeAttribute("aria-activedescendant"); } };
  const pick = k => { const it = items[k], inp = cur; if (!it || !inp) return; const i = +inp.closest("tr").dataset.l; close(); cur = null; onPick(i, it.id); };
  const draw = () => {
    const modalEl = form.closest(".modal"); if (!modalEl || !cur) return;
    if (!pop) { pop = document.createElement("div"); pop.className = "ac-pop"; pop.id = "ac-pop"; pop.setAttribute("role", "listbox"); modalEl.appendChild(pop);
      pop.addEventListener("mousedown", e => { e.preventDefault(); const o = e.target.closest("[data-ac]"); if (o) pick(+o.dataset.ac); }); }
    items = acItems(cur.value);
    const mr = modalEl.getBoundingClientRect(), ir = cur.getBoundingClientRect();
    pop.style.left = (ir.left - mr.left) + "px"; pop.style.width = Math.max(ir.width, 420) + "px";
    const below = window.innerHeight - ir.bottom > 260;
    pop.style.top = below ? (ir.bottom - mr.top + 4) + "px" : "auto"; pop.style.bottom = below ? "auto" : (mr.bottom - ir.top + 4) + "px";
    act = Math.min(act, Math.max(0, items.length - 1));
    pop.innerHTML = items.length ? items.map((p, k) => `<div class="ac-o ${k === act ? "on" : ""}" id="ac-o${k}" role="option" aria-selected="${k === act}" data-ac="${k}"><span>${esc(p.name)}</span><span class="ac-m">${p.kind ? esc(tr(AC_KIND[p.kind] || p.kind)) : ""}${p.price != null && p.id && p.id !== CAL_GENERIC ? ` · ${eur(+p.price)}` : ""}${p.kind === "produit" ? ` · stock ${+p.stock || 0}` : ""}</span></div>`).join("")
      : `<div class="ac-e">${esc(tr("Aucun article ne correspond : la ligne restera libre."))}</div>`;
    cur.setAttribute("aria-expanded", "true"); cur.setAttribute("aria-controls", "ac-pop"); if (items.length) cur.setAttribute("aria-activedescendant", "ac-o" + act);
    const on = pop.querySelector(".ac-o.on"); on && on.scrollIntoView({ block: "nearest" });
  };
  form.addEventListener("focusin", e => { if (e.target.classList.contains("ac-in")) { cur = e.target; act = 0; e.target.select(); draw(); } });
  form.addEventListener("input", e => { if (e.target.classList.contains("ac-in")) { cur = e.target; act = 0; draw(); } });
  form.addEventListener("focusout", e => { if (e.target.classList.contains("ac-in")) setTimeout(() => { if (document.activeElement !== e.target) { const i = +e.target.closest("tr").dataset.l; if (EDIT.lines[i]) e.target.value = acName(EDIT.lines[i].productId); close(); } }, 120); });
  form.addEventListener("keydown", e => {
    if (!e.target.classList.contains("ac-in") || !pop) return;
    if (e.key === "ArrowDown") { e.preventDefault(); act = Math.min(items.length - 1, act + 1); draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); act = Math.max(0, act - 1); draw(); }
    else if (e.key === "Enter") { e.preventDefault(); pick(act); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); const i = +e.target.closest("tr").dataset.l; e.target.value = acName(EDIT.lines[i].productId); close(); }
  });
  form.closest(".modal").querySelector(".body")?.addEventListener("scroll", () => { if (pop && cur) draw(); });
}
/* ---------- véhicule lié à une ligne (article « objet lié : véhicule », ou ajouté à la main) ---------- */
const prodLinkKind = l => (S.products.find(p => p.id === l.productId) || {}).linkKind || "";
const vehLineTxt = id => { const v = veh(id); return v ? `${tr("Véhicule")} : ${[fleetNo(v), v.plate, v.model].filter(Boolean).join(" · ")}` : ""; };
const lineDetail = l => [l.detail, l.vehicleId ? (l.vehDetail || vehLineTxt(l.vehicleId)) : ""].filter(Boolean).join("\n");
function lineVehHtml(l, i) {
  const need = prodLinkKind(l) === "vehicle";
  if (!need && !l.vehicleId && !l._veh) return `<div><button type="button" class="linkbtn small muted" data-vehopen="${i}" title="${esc(tr("Lier cette ligne à un véhicule (comptabilité analytique)"))}">🚗 ${esc(tr("lier un véhicule"))}</button></div>`;
  const vs = (typeof activeVehicles === "function" ? activeVehicles() : S.vehicles).concat(l.vehicleId && !(typeof isActiveVeh === "function" ? isActiveVeh(l.vehicleId) : true) && veh(l.vehicleId) ? [veh(l.vehicleId)] : [])
    .sort((a, b) => (fleetNo(a) || a.plate || "").localeCompare(fleetNo(b) || b.plate || ""));
  return `<div class="veh-ln ${need && !l.vehicleId ? "missing" : ""}">🚗 <select data-vk="${i}" aria-label="${esc(tr("Véhicule"))}"><option value="">${esc(tr(need ? "Choisir le véhicule…" : "— aucun véhicule —"))}</option>${vs.map(v => `<option value="${v.id}" ${v.id === l.vehicleId ? "selected" : ""}>${esc([fleetNo(v), v.plate, v.model].filter(Boolean).join(" · "))}</option>`).join("")}</select></div>`;
}
function drawLines() {
  const n = EDIT.lines.length;
  const dh = `<td class="dh" title="${esc(tr("Glisser pour déplacer"))}"><span aria-hidden="true">⠿</span></td>`;
  const moves = i => `<span class="mv"><button type="button" class="x" data-mv="${i}:-1" aria-label="Monter" ${i ? "" : "disabled"}>↑</button><button type="button" class="x" data-mv="${i}:1" aria-label="Descendre" ${i < n - 1 ? "" : "disabled"}>↓</button></span>`;
  document.getElementById("lines").innerHTML = EDIT.lines.map((l, i) => l.kind === "note" ? `<tr data-l="${i}" class="note-row ${sectionOf(EDIT.lines, i) != null ? "in-sec" : ""}">${dh}
    <td colspan="5"><textarea data-k="label" class="note-in" rows="${Math.min(8, Math.max(2, (l.label || "").split("\n").length))}" placeholder="${esc(tr("Commentaire (imprimé sur le document, sans montant)"))}" aria-label="${esc(tr("Commentaire"))}">${esc(l.label)}</textarea></td>
    <td class="r num muted small" data-lt></td><td class="r nowrap">${moves(i)}<button type="button" class="x" data-rm="${i}" aria-label="Retirer le commentaire">×</button></td></tr>` : l.kind === "section" ? `<tr data-l="${i}" class="sec-row ${l.ro ? "ro-sec" : ""}">${dh}
    <td colspan="5"><input data-k="label" class="sec-in" value="${esc(l.label)}" placeholder="Titre de section (ex. Consumables, Services…)" aria-label="Titre de section"></td>
    <td class="r num" data-lt></td><td class="r nowrap">${moves(i)}<button type="button" class="x" data-rm="${i}" aria-label="Retirer la section">×</button></td></tr>` : `<tr data-l="${i}" class="${sectionOf(EDIT.lines, i) != null ? "in-sec" : ""} ${l.ro ? "ro-line" : ""}">${dh}
    <td><input data-k="pq" class="ac-in" value="${esc(acName(l.productId))}" placeholder="${esc(tr("Rechercher un article… (vide = ligne libre)"))}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-label="${esc(tr("Article"))}"></td>
    <td><input data-k="label" value="${esc(l.label)}" aria-label="Description">${lineVehHtml(l, i)}${isCalLine(l) ? `<div class="tool-ln ${l.toolId || l.newTool ? "" : "missing"}">${l.toolId || l.newTool ? `<span class="pre">${esc(l.detail || "")}</span>` : "Aucun outil choisi"}<button type="button" class="linkbtn" data-toolpick="${i}">${l.toolId || l.newTool ? "Changer d'outil / de RO" : "Choisir l'outil"}</button></div>` : ""}</td>
    <td><input data-k="qty" type="number" step="0.01" min="0" value="${l.qty}" aria-label="Quantité"></td>
    <td><input data-k="price" type="number" step="0.01" value="${l.price}" aria-label="Prix unitaire HT"></td>
    <td><select data-k="vat" aria-label="TVA">${[21, 12, 6, 0].map(r => `<option value="${r}" ${+l.vat === r ? "selected" : ""}>${r} %</option>`).join("")}</select></td>
    <td class="r num" data-lt>${eur(l.qty * l.price)}</td><td class="r nowrap">${moves(i)}<button type="button" class="x" data-rm="${i}" aria-label="Retirer la ligne">×</button></td></tr>`).join("");
  refreshTotals();
}
/* ---------- réorganisation des lignes (glisser-déposer et flèches) ----------
   Une section se déplace avec ses lignes. Garde-fou RO : un outil rattaché à un RO reste dans la section de son RO. */
const blockEnd = (L, i) => { if (L[i].kind !== "section") return i + 1; let e = i + 1; while (e < L.length && L[e].kind !== "section") e++; return e; };
function roBreak(L) { for (let i = 0; i < L.length; i++) { const l = L[i]; if (l.ro && l.kind !== "section") { const k = sectionOf(L, i); if (k == null || L[k].ro !== l.ro) return l.ro; } } return null; }
function moveLines(from, to) {
  const L = EDIT.lines.slice(), end = blockEnd(L, from), n = end - from, block = L[from].kind === "section";
  if (to >= from && to <= end) return false;
  const chunk = L.splice(from, n);
  let at = to > from ? to - n : to;
  if (block) while (at < L.length && L[at].kind !== "section") at++;   // une section se pose entre deux sections
  L.splice(at, 0, ...chunk);
  if (L.every((x, k) => x === EDIT.lines[k])) { if (block) toast(tr("Une section se place avant une autre section ou en fin de document (les lignes sous une section lui appartiennent).")); drawLines(); return false; }
  const bad = roBreak(L);
  if (bad) { toast(tr("Cette ligne appartient au RO") + " " + bad + " : " + tr("déplacez-la à l'intérieur du RO, ou déplacez le RO entier.")); drawLines(); return false; }
  EDIT.lines = L; drawLines(); return true;
}
function moveStep(i, d) {
  const L = EDIT.lines;
  if (L[i].kind === "section") {
    if (d < 0) { let k = i - 1; while (k > 0 && L[k].kind !== "section") k--; if (k >= 0 && k < i) moveLines(i, k); }
    else { const e = blockEnd(L, i); if (e < L.length) moveLines(i, blockEnd(L, e)); }
    return;
  }
  const j = i + d; if (j < 0 || j >= L.length) return;
  moveLines(i, d < 0 ? j : j + 1);
}
function dndBind(f) {
  let from = null;
  const tb = f.querySelector("#lines");
  const clear = () => tb.querySelectorAll(".drop-b, .drop-a, .dragging").forEach(x => x.classList.remove("drop-b", "drop-a", "dragging"));
  tb.addEventListener("mousedown", e => { const h = e.target.closest(".dh"); const tr = e.target.closest("tr[data-l]"); if (tr) tr.draggable = !!h; });
  tb.addEventListener("dragstart", e => {
    const tr = e.target.closest("tr[data-l]"); if (!tr || !tr.draggable) return;
    from = +tr.dataset.l; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(from)); } catch {}
    const end = blockEnd(EDIT.lines, from);
    setTimeout(() => tb.querySelectorAll("tr[data-l]").forEach(r => { const k = +r.dataset.l; if (k >= from && k < end) r.classList.add("dragging"); }), 0);
  });
  tb.addEventListener("dragover", e => {
    if (from == null) return; const tr = e.target.closest("tr[data-l]"); if (!tr) return;
    e.preventDefault(); const r = tr.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
    tb.querySelectorAll(".drop-b, .drop-a").forEach(x => x.classList.remove("drop-b", "drop-a"));
    tr.classList.add(after ? "drop-a" : "drop-b");
  });
  tb.addEventListener("drop", e => {
    if (from == null) return; e.preventDefault();
    const tr = e.target.closest("tr[data-l]"); const f0 = from; from = null; clear();
    if (!tr) return; const r = tr.getBoundingClientRect(), i = +tr.dataset.l;
    moveLines(f0, e.clientY > r.top + r.height / 2 ? i + 1 : i);
  });
  tb.addEventListener("dragend", () => { from = null; clear(); tb.querySelectorAll("tr[draggable]").forEach(r => r.draggable = false); });
}
/* index de la section qui contient la ligne i (null si aucune) */
function sectionOf(lines, i) { for (let k = i - 1; k >= 0; k--) if (lines[k].kind === "section") return k; return null; }
function sectionTotal(lines, k) { let t = 0; for (let i = k + 1; i < lines.length && lines[i].kind !== "section"; i++) t += r2((+lines[i].qty || 0) * (+lines[i].price || 0)); return r2(t); }
/* lignes à afficher : sections, lignes, sous-totaux */
function docRows(lines) {
  const out = [], hasSec = lines.some(l => l.kind === "section");
  lines.forEach((l, i) => {
    if (l.kind === "section") out.push({ sec: true, label: l.label });
    else if (l.kind === "note") out.push({ note: l.label });
    else out.push({ line: l });
    const next = lines[i + 1];
    if (hasSec && l.kind !== "section" && (!next || next.kind === "section")) { const k = sectionOf(lines, i); if (k != null) out.push({ sub: true, label: lines[k].label, amount: sectionTotal(lines, k) }); }
  });
  return out;
}
function totalsHtml(T) {
  return `<span>Total HT</span><span>${eur(T.ht)}</span>` + Object.keys(T.byRate).sort((a, b) => b - a).map(r => `<span class="muted">TVA ${r} % sur ${eur(T.byRate[r])}</span><span class="muted">${eur(T.byRate[r] * r / 100)}</span>`).join("") + `<span class="big">Total TVAC</span><span class="big">${eur(T.ttc)}</span>`;
}
function refreshTotals() {
  document.querySelectorAll("#lines tr").forEach((tr, i) => { const l = EDIT.lines[i]; if (l) tr.querySelector("[data-lt]").textContent = l.kind === "note" ? "" : l.kind === "section" ? "Sous-total " + eur(sectionTotal(EDIT.lines, i)) : eur(l.qty * l.price); });
  document.getElementById("d-totals").innerHTML = totalsHtml(totals(EDIT));
}
ACTIONS["doc-del"] = el => {
  const d = S.docs.find(x => x.id === el.dataset.id); if (!d) return;
  const lbl = KIND_LBL[d.kind] || "Document", issuedDoc = isSale(d) && d.status !== "brouillon";
  const deliv = S.deliveries.filter(x => x.invoiceId === d.id), quotes = S.docs.filter(x => x.invoiceId === d.id), credits = S.docs.filter(x => x.creditFor === d.id);
  const stockLines = d.kind === "facture" && d.stockApplied ? (d.lines || []).filter(l => S.products.some(p => p.id === l.productId && p.kind === "produit")) : [];
  const m = modal(`${mHead(`Supprimer ${lbl.toLowerCase()} <span class="mono">${esc(d.number)}</span>`)}<div class="body stack-s">
    <div>${esc(clientName(d.clientId))} · ${fmtDate(d.date)} · <b>${eur(totals(d).ttc)}</b> TTC · ${chip(invStatus(d))}</div>
    ${issuedDoc ? `<div class="banner bad"><b>Ce document a été émis.</b> En Belgique, une ${d.kind === "nc" ? "note de crédit" : "facture"} émise doit être conservée et sa numérotation rester continue. ${d.kind === "facture" ? "Pour l'annuler, établissez plutôt une note de crédit." : ""} Ne supprimez que s'il s'agit d'une erreur de saisie ou d'une donnée de test.</div>` : ""}
    ${deliv.length ? `<div class="small muted">Livraison liée : ${deliv.map(x => esc(x.number)).join(", ")} (elle est conservée, sans facture).</div>` : ""}
    ${quotes.length ? `<div class="small muted">Devis d'origine : ${quotes.map(x => esc(x.number)).join(", ")} (il redevient « accepté », sans facture).</div>` : ""}
    ${credits.length ? `<div class="banner warn">${plural(credits.length, "note de crédit")} se rapporte${credits.length > 1 ? "nt" : ""} à cette facture (${credits.map(x => esc(x.number)).join(", ")}) : elle${credits.length > 1 ? "s" : ""} ne ser${credits.length > 1 ? "ont" : "a"} pas supprimée${credits.length > 1 ? "s" : ""}.</div>` : ""}
    ${stockLines.length ? `<label class="chk line"><input type="checkbox" id="dl-stock" checked> Remettre en stock les articles facturés (${stockLines.map(l => `${l.qty} × ${esc(l.label)}`).join(", ")})</label>` : ""}
    ${issuedDoc ? `<label class="f">Pour confirmer, tapez le numéro <b class="mono">${esc(d.number)}</b><input id="dl-key" class="mono" autocomplete="off"></label>`
      : `<label class="chk confirm-chk"><input type="checkbox" id="dl-ok"> Je confirme la suppression de <b class="mono">${esc(d.number)}</b></label>`}</div>
    <footer><button class="btn" data-close>Annuler</button><button class="btn primary danger-bg" id="dl-yes" disabled>Supprimer</button></footer>`, "sm");
  const yes = m.querySelector("#dl-yes"), key = m.querySelector("#dl-key"), ok = m.querySelector("#dl-ok");
  const norm = x => String(x).toUpperCase().replace(/\s/g, "");
  const check = () => yes.disabled = key ? norm(key.value) !== norm(d.number) : !ok.checked;
  (key || ok).addEventListener(key ? "input" : "change", check);
  yes.onclick = async () => {
    check(); if (yes.disabled) return; yes.disabled = true;
    const restock = stockLines.length && m.querySelector("#dl-stock")?.checked;
    closeModal(); toast(`${lbl} ${d.number} : suppression…`);
    if (restock)
      for (const l of stockLines) { const p = S.products.find(p => p.id === l.productId); await patch("products", p.id, { stock: r2((+p.stock || 0) + (+l.qty || 0)) }); }
    for (const x of deliv) await patch("deliveries", x.id, { invoiceId: null });
    for (const q of quotes) await patch("docs", q.id, { invoiceId: null });
    await remove("docs", d.id);
    render(true); toast(`${lbl} ${d.number} supprimée`);
  };
};
ACTIONS["doc-open"] = el => { if (!allowed("factures") && !allowed("devis")) return; openDoc(el.dataset.id); };
async function openDoc(id) {
  const d = await waitFind("docs", id); if (!d) return;
  const s = settings(), c = client(d.clientId) || {}, T = totals(d), st = invStatus(d), isQ = d.kind === "devis", isNC = d.kind === "nc";
  const acts = [], od = isOdoo(d);
  if (!readOnly && !od) {
    if (isQ) {
      if (d.status === "brouillon") acts.push(`<button class="btn" data-a="doc-st" data-st="envoye">Marquer envoyé</button>`);
      if (d.status === "envoye") acts.push(`<button class="btn" data-a="doc-st" data-st="accepte">Accepté</button><button class="btn" data-a="doc-st" data-st="refuse">Refusé</button>`);
      if (d.status === "accepte" && !d.invoiceId) acts.push(`<button class="btn primary" data-a="doc-convert">Convertir en facture</button>`);
    } else {
      if (d.status === "brouillon") acts.push(`<button class="btn primary" data-a="doc-st" data-st="envoyee">Valider et envoyer</button>`);
      if (d.status === "envoyee" && invStatus(d) !== "payee") acts.push(`<button class="btn primary" data-a="doc-st" data-st="payee">${isNC ? "Marquer remboursée" : "Marquer payée"}</button>`);
      if (d.status === "payee") acts.push(`<button class="btn" data-a="doc-st" data-st="envoyee">${isNC ? "Annuler le remboursement" : "Annuler le paiement"}</button>`);
      if (!isNC && d.status !== "brouillon") acts.unshift(`<button class="btn" data-a="nc-create">Note de crédit</button>`);
    }
  }
  const locked = !isQ && d.status !== "brouillon";
  const m = modal(`${mHead(`${KIND_LBL[d.kind]} <span class="mono">${esc(d.number)}</span> ${chip(st)}${demoTag(d)}${odooTag(d)}`)}
  <div class="body">${navBar(isQ ? "devis" : "facture", d.id, "doc-open")}${!isQ ? `<div class="row-g wrap" style="margin-bottom:10px">${payLinkBtn("docs", d.id)}</div>` : ""}<div class="doc-prev">
    <div class="top"><div><h2>${esc(s.name)}</h2><div class="muted">${esc(s.address)}${s.vat ? "<br>TVA " + esc(s.vat) : ""}</div></div>
      <div style="text-align:right"><b>${KIND_UP[d.kind]} ${esc(d.number)}</b>${isNC && d.creditForNo ? `<div class="muted small">Se rapporte à la facture ${esc(d.creditForNo)}</div>` : ""}<div class="muted">Date : ${fmtDate(d.date)}<br>${isQ ? "Valable jusqu'au" : "Échéance"} : ${fmtDate(d.dueDate)}</div></div></div>
    ${d.title ? `<div class="doc-title">${esc(d.title)}</div>` : ""}
    <div><div class="muted small">${isQ ? "Destinataire" : "Facturé à"}</div><b>${esc(c.name || "Client supprimé")}</b><div>${esc(c.address || "")}${c.city ? "<br>" + esc(c.city) : ""}${c.vat ? "<br>TVA " + esc(c.vat) : ""}</div></div>
    <div class="tablewrap"><table><thead><tr><th>Description</th><th class="r">Qté</th><th class="r">Prix HT</th><th class="r">TVA</th><th class="r">Total HT</th></tr></thead><tbody>
      ${docRows(d.lines || []).map(r => r.note != null ? `<tr class="note"><td colspan="5" class="pre">${esc(r.note)}</td></tr>` : r.sec ? `<tr class="sec"><td colspan="5">${esc(r.label)}</td></tr>` : r.sub ? `<tr class="sub"><td colspan="4">Sous-total ${esc(r.label)}</td><td class="r num">${eur(r.amount)}</td></tr>`
        : `<tr><td>${esc(r.line.label)}${lineDetail(r.line) ? `<div class="muted small pre">${esc(lineDetail(r.line))}</div>` : ""}</td><td class="r num">${r.line.qty}</td><td class="r num">${eur(r.line.price)}</td><td class="r num">${r.line.vat} %</td><td class="r num">${eur(r.line.qty * r.line.price)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="totals">${totalsHtml(T)}</div>
    ${od ? `<div class="stack-s">${d.payRef ? `<div><div class="muted small">Communication de paiement</div><span class="ogm">${esc(d.payRef)}</span></div>` : ""}${d.odooTotals && d.status !== "payee" && d.status !== "annulee" && d.status !== "brouillon" ? `<div><span class="chip ${st === "retard" || st === "partiel" ? "warn" : "info"}">Reste dû ${eur(d.odooTotals.residual)}</span></div>` : ""}${d.ref ? `<div class="muted small">Référence client : ${esc(d.ref)}</div>` : ""}${d.falco ? `<div class="small">${d.falco.status === "sent" ? `Transmis à Falco (comptabilité) le ${fmtDate((d.falco.sentAt || "").slice(0, 10))}${d.falco.warning ? ` <span class="chip warn">${esc(d.falco.warning)}</span>` : ""}` : `<span class="err">Falco : ${esc(d.falco.error || "erreur")}</span>`}</div>` : ""}</div>` : isQ ? "" : `<div><div class="muted small">Paiement${s.iban ? " sur " + esc(s.iban) : ""} avec la communication structurée</div><span class="ogm">${ogm(d.number)}</span></div>`}
    ${d.vatClauseOn && d.vatClause ? `<div class="vat-note pre">${esc(d.vatClause)}</div>` : ""}
    ${d.notes ? `<div class="muted">${esc(d.notes)}</div>` : ""}
    ${d.status === "payee" && d.paidAt ? `<div><span class="chip good">Payée le ${fmtDate(d.paidAt)}</span></div>` : ""}
    ${(() => { const L = (S.bankTx || []).filter(t => typeof txMatches === "function" && txMatches(t).some(x => x.docId === d.id && !x.coll)); if (!L.length) return "";
      const paid = L.reduce((a, t) => a + (+txMatches(t).find(x => x.docId === d.id).amount || 0), 0), full = Math.abs(paid) >= Math.abs(baseDue(d)) - 0.01;
      return `<div class="banner ${full ? "good" : "info"}"><b>${full ? (d.kind === "nc" ? "Remboursée" : "Payée") : "Paiement partiel"} selon la banque</b> : ${L.map(t => `${typeof txLink === "function" ? txLink(t) : fmtDate(t.date)}${Math.abs(+txMatches(t).find(x => x.docId === d.id).amount - t.amount) > 0.005 ? ` <span class="small">(dont ${eur(+txMatches(t).find(x => x.docId === d.id).amount)} pour cette pièce)</span>` : ""}`).join(" ; ")}${od && d.status !== "payee" ? `<div class="small">Dans Odoo, la facture reste ouverte tant que le paiement n'y est pas rapproché (l'ERP lit Odoo sans y écrire).</div>` : ""}</div>`; })()}
  ${histBox("docs", d.id)}</div></div>
  <footer>${od ? `<div class="left"><span class="muted small">Document Odoo, en lecture seule</span>${!readOnly && !isNC ? `<button class="btn" data-a="doc-dup" title="${esc(tr("Nouveau brouillon dans l'ERP, identique, sans les liens"))}">⧉ Dupliquer</button>` : ""}</div>${odooLinkBtn("account.move", d.odooId, "Ouvrir dans Odoo")}` : `<div class="left">${!readOnly ? `<button class="btn danger" data-a="doc-del" data-id="${d.id}">Supprimer…</button>` : ""}${!readOnly && !locked ? `<button class="btn" data-a="doc-form" data-kind="${d.kind}" data-id="${d.id}">Modifier</button>` : ""}<button class="btn" data-a="doc-pdf">Télécharger le PDF</button>${!readOnly && !isNC ? `<button class="btn" data-a="doc-dup" title="${esc(tr("Nouveau brouillon identique, sans les liens (outils, livraison, paiements)"))}">⧉ Dupliquer</button>` : ""}<button class="btn" data-a="doc-mail">Préparer l'e-mail</button></div>${acts.join("")}`}</footer>`, "lg");
  m.dataset.doc = d.id;
}
const curDoc = () => S.docs.find(x => x.id === document.querySelector(".modal")?.dataset.doc);
ACTIONS["doc-st"] = async el => {
  const d = curDoc(), st = el.dataset.st;
  const upd = Object.assign(strip(d), { status: st });
  if (st === "payee") upd.paidAt = today();
  if (st === "envoyee") delete upd.paidAt;
  if (d.kind === "facture" && st === "envoyee" && !d.stockApplied) {
    for (const l of d.lines || []) {
      const p = S.products.find(p => p.id === l.productId);
      if (p && p.kind === "produit") await patch("products", p.id, { stock: r2((+p.stock || 0) - (+l.qty || 0)) });
    }
    upd.stockApplied = true;
  }
  await save("docs", d.id, upd);
  toast(`Statut : ${STATUS[st][0].toLowerCase()}`); setTimeout(() => openDoc(d.id), 60);
};
ACTIONS["nc-create"] = async () => {
  const inv = curDoc(); if (!inv) return;
  const nc = { kind: "nc", number: nextNumber("nc"), clientId: inv.clientId, date: today(), dueDate: today(), status: "brouillon", lines: clone(inv.lines || []), title: inv.title || "",
    notes: `Note de crédit relative à la facture ${inv.number} du ${fmtDate(inv.date)}.`, creditFor: inv.id, creditForNo: inv.number };
  closeModal(); docForm("nc", null, nc);
};
ACTIONS["doc-convert"] = async () => {
  const q = curDoc();
  const id = await createInvoice(q.clientId, q.lines, q.notes, { fromQuote: q.number });
  await patch("docs", q.id, { invoiceId: id });
  toast("Facture brouillon créée"); location.hash = "#factures"; setTimeout(() => openDoc(id), 120);
};
ACTIONS["doc-pdf"] = async () => { const d = curDoc(); if (d) { await withLang(clientLang(d.clientId), () => docPdf(d)); logClient("docs", d.id, "pdf"); } };
async function docPdf(d) {
  const s = settings(), c = client(d.clientId), T = totals(d), isQ = d.kind === "devis";
  try {
    const doc = await newPdf();
    pdfHeader(doc, KIND_UP[d.kind] || "FACTURE", d.number, ["Date : " + fmtDate(d.date), d.kind === "nc" ? (d.creditForNo ? "Facture : " + d.creditForNo : "") : (isQ ? "Valable jusqu'au : " : "Échéance : ") + fmtDate(d.dueDate)].filter(Boolean));
    pdfClient(doc, 52, c, isQ ? "Destinataire" : "Facturé à");
    let y0 = 80;
    if (d.title) { doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(136, 2, 28); const tl = doc.splitTextToSize(pdfTxt(d.title), 180); doc.text(tl, 15, 82); doc.setTextColor(0); doc.setFont("helvetica", "normal"); y0 = 82 + tl.length * 6; }
    let y = pdfTable(doc, 15, y0, [{ t: "Description", w: 92 }, { t: "Qté", w: 18, r: 1 }, { t: "Prix HT", w: 26, r: 1 }, { t: "TVA", w: 16, r: 1 }, { t: "Total HT", w: 28, r: 1 }],
      docRows(d.lines || []).map(r => r.note != null ? { note: r.note } : r.sec ? { sec: r.label } : r.sub ? { sub: "Sous-total " + r.label, amount: eur(r.amount) } : [lineDetail(r.line) ? pdfTxt(r.line.label) + "\n" + pdfTxt(lineDetail(r.line)) : r.line.label, fmtN.format(r.line.qty), eur(r.line.price), r.line.vat + " %", eur(r.line.qty * r.line.price)]));
    y += 8; doc.setFontSize(10);
    const tl = [["Total HT", eur(T.ht)], ...Object.keys(T.byRate).sort((a, b) => b - a).map(r => ["TVA " + r + " %", eur(T.byRate[r] * r / 100)])];
    tl.forEach(([a, b]) => { doc.text(pdfTxt(a), 150, y, { align: "right" }); doc.text(pdfTxt(b), 195, y, { align: "right" }); y += 5.5; });
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(pdfTxt("Total TVAC"), 150, y + 1, { align: "right" }); doc.text(pdfTxt(eur(T.ttc)), 195, y + 1, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); y += 14;
    if (!isQ) { doc.text(pdfTxt(`Paiement avant le ${fmtDate(d.dueDate)}${s.iban ? " sur le compte " + s.iban : ""}, communication structurée :`), 15, y); doc.setFont("courier", "bold"); doc.setFontSize(12); doc.text(ogm(d.number), 15, y + 7); doc.setFont("helvetica", "normal"); y += 16; }
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    if (d.vatClauseOn && d.vatClause) { doc.setFont("helvetica", "bolditalic"); const vl = doc.splitTextToSize(pdfTxt(d.vatClause), 180); doc.text(vl, 15, y); y += vl.length * 4.5 + 4; doc.setFont("helvetica", "normal"); }
    if (d.notes) doc.text(doc.splitTextToSize(pdfTxt(d.notes), 180), 15, y);
    await offerFile(`${d.number}.pdf`, doc.output("arraybuffer"));
  } catch { toast("Le générateur PDF n'a pas pu se charger. Réessayez."); }
}

/* ======================= catalogue ======================= */
function prodArticles() {
    const q = UI.q.toLowerCase();
    const rows = S.products.filter(p => (UI.filter === "tous" || p.kind === UI.filter || (UI.filter === "bas" && p.kind === "produit" && +p.stock <= +p.minStock)) && (!q || (p.ref + " " + p.name).toLowerCase().includes(q)))
      .sort((a, b) => (a.kind + a.ref).localeCompare(b.kind + b.ref, "fr"));
    const stockVal = S.products.filter(p => p.kind === "produit").reduce((a, p) => a + Math.max(0, +p.stock || 0) * (+p.cost || 0), 0);
    return `<div class="row-sb mb"><div class="muted">${S.products.length} articles · valeur du stock ${eur(stockVal)}</div><button class="btn primary" data-a="prod-form" ${dis()}>Ajouter un article</button></div>` +
      `<div class="panel">${searchBar("Rechercher une référence ou un nom…", [["tous", "Tout"], ["service", "Services"], ["produit", "Produits"], ["bas", "Stock bas"]])}
      <div class="tablewrap"><table><thead><tr><th>Réf.</th><th>Article</th><th>Type</th><th class="r" style="width:130px">Prix HT</th><th class="r">TVA</th><th class="r">Coût</th><th class="r">Marge</th><th class="r">Stock</th><th></th></tr></thead><tbody>
      ${rows.map(p => {
        const isP = p.kind === "produit", low = isP && +p.stock <= +p.minStock;
        return `<tr class="click" data-a="prod-form" data-id="${p.id}"><td class="mono">${esc(p.ref)}</td><td>${esc(p.name)}${demoTag(p)}${odooTag(p)}<div class="muted">par ${esc(p.unit || "unité")}</div></td>
        <td><span class="chip ${isP ? "" : "info"}">${isP ? "Produit" : "Service"}</span></td><td class="r">${isOdoo(p) ? `<span class="num">${eur(p.price)}</span>` : priceInput("products", p.id, "price", p.price)}</td><td class="r num">${p.vat} %</td>
        <td class="r num">${isP ? eur(p.cost) : "—"}</td><td class="r num">${isP && +p.price ? Math.round((p.price - p.cost) / p.price * 100) + " %" : "—"}</td>
        <td class="r num">${isP ? `<span class="chip ${+p.stock <= 0 ? "bad" : low ? "warn" : "good"}">${+p.stock || 0}</span>` : "—"}</td>
        <td class="r">${isP && !readOnly ? `<button class="btn sm" data-a="prod-stock" data-id="${p.id}">Mouvement</button>` : ""}</td></tr>`;
      }).join("")}</tbody></table>${rows.length ? "" : `<div class="empty">Rien à afficher.</div>`}</div></div>`;
  }
ACTIONS["prod-form"] = el => {
  const p = S.products.find(x => x.id === el.dataset.id) || { kind: "service", vat: 21, unit: "heure", stock: 0, minStock: 0, cost: 0 };
  const isNew = !p.id, od = isOdoo(p);
  const m = modal(`${mHead(isNew ? "Nouvel article" : esc(p.name) + odooTag(p))}<form><div class="body">${od ? odooNote("Article géré dans Odoo : le nom, la référence, le prix, la TVA et le coût se modifient dans Odoo. Le type et le stock restent propres à l'ERP.", "product.product", p.odooId) : ""}<div class="fields">
    ${field("p-kind", "Type", p.kind, { type: "select", options: [["service", "Service"], ["etalonnage", "Étalonnage (demande l'outil et le RO dans les devis)"], ["produit", "Produit (stocké)"]] })}
    ${field("p-ref", "Référence", p.ref, { required: true, cls: "mono" })}${field("p-name", "Nom", p.name, { required: true, wide: true })}
    ${field("p-unit", "Unité", p.unit, { ph: "heure, jour, pièce…" })}${field("p-price", "Prix de vente HT", p.price, { type: "number", step: "0.01", required: true })}
    ${field("p-vat", "TVA", p.vat, { type: "select", options: [[21, "21 %"], [12, "12 %"], [6, "6 %"], [0, "0 %"]] })}
    ${field("p-link", "Objet lié sur les factures et devis", p.linkKind || "", { type: "select", options: [["", "Aucun"], ["vehicle", "Véhicule (la facture demande lequel)"]] })}
  </div><div class="fields" id="p-stock-f">${field("p-cost", "Coût d'achat HT", p.cost, { type: "number", step: "0.01" })}${field("p-stock", "Stock actuel", p.stock, { type: "number" })}${field("p-min", "Stock minimum", p.minStock, { type: "number" })}</div></div>
  <footer>${isNew || od ? "" : `<div class="left"><button type="button" class="btn danger" data-a="prod-del" data-id="${p.id}" ${dis()}>Supprimer</button></div>`}
  <button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`);
  if (od) odooLock(m, ["p-ref", "p-name", "p-unit", "p-price", "p-vat", "p-cost"]);
  const ks = m.querySelector("#p-kind"), sf = m.querySelector("#p-stock-f"), sync = () => sf.style.display = ks.value === "produit" ? "" : "none"; sync(); ks.onchange = sync;
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const isP = val("p-kind") === "produit";
    await save("products", p.id, Object.assign(strip(p), { kind: val("p-kind"), ref: val("p-ref"), name: val("p-name"), unit: val("p-unit"), price: +val("p-price") || 0, vat: +val("p-vat"), cost: isP ? +val("p-cost") || 0 : 0, stock: isP ? +val("p-stock") || 0 : 0, minStock: isP ? +val("p-min") || 0 : 0, linkKind: val("p-link") || null }));
    closeModal(); toast("Article enregistré");
  };
};
ACTIONS["prod-del"] = el => confirmBox("Supprimer cet article ? Les documents existants gardent leurs lignes.", () => remove("products", el.dataset.id));
ACTIONS["prod-stock"] = el => {
  const p = S.products.find(x => x.id === el.dataset.id);
  const m = modal(`${mHead("Mouvement de stock")}<form><div class="body"><div><b>${esc(p.name)}</b><div class="muted">Stock actuel : ${+p.stock || 0} ${esc(p.unit || "")}</div></div>
    <div class="fields">${field("mv-type", "Type", "in", { type: "select", options: [["in", "Entrée (réception fournisseur)"], ["out", "Sortie (casse, usage interne)"], ["set", "Inventaire (fixer la quantité)"]] })}${field("mv-qty", "Quantité", 1, { type: "number", min: 0, required: true })}</div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Appliquer</button></footer></form>`, "sm");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const t = val("mv-type"), q = +val("mv-qty") || 0, cur = +p.stock || 0;
    const stock = t === "in" ? cur + q : t === "out" ? cur - q : q;
    await patch("products", p.id, { stock }); closeModal(); toast(`Stock mis à jour : ${stock}`);
  };
};

/* ======================= paramètres ======================= */
VIEWS.parametres = {
  static: true,
  render() {
    const s = settings();
    const demo = COLS.reduce((a, c) => a + S[c].filter(x => x.demo).length, 0);
    return head("Paramètres", "Coordonnées affichées sur vos devis, factures, bons de livraison et certificats") + usersCardShell() + wfCardShell() + (typeof dbxCardShell === "function" ? dbxCardShell() : "") + (typeof waCardShell === "function" ? waCardShell() : "") + odCardShell() + faCardShell() + poCardShell() + (typeof payCardShell === "function" ? payCardShell() : "") + aiCardShell() + sbxCardShell() +
    `<form class="panel ${isAdmin() ? "" : "hidden"}" id="f-set" style="max-width:820px"><div class="pad stack"><h3>Entreprise</h3><div class="fields">
      ${field("s-name", "Raison sociale", s.name)}${field("s-vat", "N° d'entreprise / TVA", s.vat, { ph: "BE0123.456.789" })}
      ${field("s-iban", "IBAN", s.iban, { ph: "BE00 0000 0000 0000" })}${field("s-email", "E-mail", s.email)}${field("s-phone", "Téléphone", s.phone)}
      ${field("s-address", "Adresse du siège", s.address, { wide: true })}
      ${field("s-pay", "Délai de paiement (jours)", s.payDays, { type: "number", min: 0 })}${field("s-quote", "Validité des devis (jours)", s.quoteDays, { type: "number", min: 0 })}
      ${field("s-vatclause", "Mention TVA par défaut (proposée en bas des factures et devis)", s.vatClause, { type: "textarea", wide: true, ph: "Ex. : Autoliquidation – TVA due par le cocontractant (art. 51, §2 du Code TVA)" })}
    </div><h3>Trésorerie</h3><div class="fields">
      ${field("s-bank", "Solde du compte bancaire (€)", s.bankBalance, { type: "number", step: "0.01" })}${field("s-bankdate", "Solde au", s.bankDate, { type: "date" })}
    </div><div class="hint">Saisie manuelle pour l'instant. Une connexion bancaire automatique pourra être ajoutée plus tard.</div>
    <h3>Gaz</h3><div class="fields">${field("s-supplier", "Fournisseur des bouteilles", s.supplierName)}
</div><div class="hint">Les prix (articles, bouteilles de gaz, frais EXP, étalonnage) se gèrent dans <a href="#produits">Produits & prix</a>.</div>
    <div class="hint">Les chauffeurs se gèrent dans <a href="#flotte" data-a="go-drivers">Flotte → Chauffeurs</a>.</div>
    <div><button class="btn primary" ${dis()}>Enregistrer les paramètres</button></div></div></form>
    <div class="panel" style="max-width:820px;margin-top:16px"><div class="pad stack"><h3>Données d'exemple</h3>
      ${demoGenHtml()}
      <div>${demo ? `${plural(demo, "élément")} d'exemple (clients, bouteilles, véhicules, outils, factures…) sont présents pour tester l'application. Quand vous êtes prêt à saisir vos vraies données, supprimez-les en un clic.` : "Aucune donnée d'exemple : tout ce qui est ici est à vous."}</div>
      ${demo ? `<div class="row-g wrap"><button class="btn danger" data-a="purge-demo" ${dis()}>Supprimer toutes les données d'exemple</button>${S.vehicles.some(v => v.demo) ? `<button class="btn" data-a="purge-demo-fleet" ${dis()}>Supprimer seulement les véhicules d'exemple</button>` : ""}</div>` : ""}</div></div>
    ${SERVER && isAdmin() ? `<div class="panel" style="max-width:820px;margin-top:16px"><div class="pad stack"><h3>Serveur ways.support</h3>
      <div>Pour reprendre les données de l'ancienne version (claude.ai), déposez dans l'ordre les deux fichiers exportés depuis celle-ci. Un import peut être relancé sans créer de doublons.</div>
      <div class="imp-grid">
        <label class="dropzone slim" for="imp-json"><b>1 · Données</b><span class="muted small">ways-export-….json</span></label><input type="file" id="imp-json" accept=".json,application/json" hidden>
        <label class="dropzone slim" for="imp-zip"><b>2 · Fichiers joints</b><span class="muted small">ways-fichiers-….zip</span></label><input type="file" id="imp-zip" accept=".zip,application/zip" hidden>
      </div>
      <div id="imp-log" class="small">${impMsg}</div>
      <div class="row-g wrap"><button class="btn" data-a="server-logout">Se déconnecter de ce navigateur</button></div></div></div>` : ""}
    <div class="panel" style="max-width:820px;margin-top:16px"><div class="pad stack"><h3>Sauvegarde et migration</h3>
      <div>Télécharge toutes les données de l'ERP (${plural(COLS.reduce((a, c) => a + S[c].length, 0) + 1, "élément")}) dans un fichier JSON, au format accepté par l'import de l'API du serveur ways.support.</div>
      <label class="chk"><input type="checkbox" id="exp-tele"> Inclure les positions et trajets Webfleet (${plural((S.vehPos || []).length + (S.trips || []).length, "élément")}) — à cocher seulement si le serveur accepte les collections vehPos et trips</label>
      <div class="row-g wrap"><button class="btn primary" data-a="export-data">Exporter les données</button><button class="btn" data-a="export-files">Exporter les fichiers joints (ZIP)</button></div>
      <div class="hint">Les fichiers joints (photos, certificats, documents) ne sont pas dans le JSON : le ZIP les contient, chacun nommé par son identifiant.</div></div></div>`;
  },
  after() {
    if (SERVER && isAdmin()) { loadUsers().then(() => typeof loadPay === "function" && loadPay()); loadWf(); if (typeof loadDbx === "function") loadDbx(); if (typeof loadWa === "function") loadWa(); loadOd(); loadFa(); loadPo(); loadAi(); }
    if (SERVER) { const j = document.getElementById("imp-json"), z = document.getElementById("imp-zip");
      if (j) j.onchange = e => e.target.files[0] && importJson(e.target.files[0]);
      if (z) z.onchange = e => e.target.files[0] && importZip(e.target.files[0]);
      document.querySelectorAll(".imp-grid .dropzone").forEach(dz => { dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); }; dz.ondragleave = () => dz.classList.remove("over");
        dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); const f = e.dataTransfer.files[0]; if (!f) return; (/\.zip$/i.test(f.name) ? importZip : importJson)(f); }; }); }
    const f = document.getElementById("f-set");
    f.onsubmit = async e => {
      e.preventDefault();
      await saveSettings({ name: val("s-name") || "W.A.Y.S. SRL", vat: val("s-vat"), iban: val("s-iban"), email: val("s-email"), phone: val("s-phone"), address: val("s-address"),
        payDays: +val("s-pay") || 0, quoteDays: +val("s-quote") || 0, vatClause: val("s-vatclause").trim(), bankBalance: val("s-bank") === "" ? null : +val("s-bank"), bankDate: val("s-bankdate") || (val("s-bank") ? today() : ""),
        supplierName: val("s-supplier") });
      toast("Paramètres enregistrés");
    };
  }
};
/* ======================= utilisateurs (version serveur, administrateur) ======================= */
const ROLE_HELP = { admin: "Tout, y compris les utilisateurs et les paramètres de l'entreprise", bureau: "Tous les modules, sans les utilisateurs ni les paramètres de l'entreprise", terrain: "Flotte, pannes, gaz et étalonnage · pas de factures, devis, clients, prix, administration ni paramètres" , garage: "Garage partenaire : ses véhicules (présents chez lui), leurs entretiens et pannes, Axel · rien d'autre", chauffeur: "Véhicules, signaler une panne, ses trajets et amendes · rien d'autre"};
let USERS = null;
function sbxCardShell() {
  if (!SERVER || !ME || !isOffice()) return "";
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack-s"><h3 class="np">Environnement de test</h3>
    ${SBX ? `<div class="banner bad"><b>Le test est actif depuis le ${esc(new Date(SBX.since).toLocaleString(LANG === "en" ? "en-GB" : "fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}.</b> Vos changements ne touchent pas la base principale.</div><div><button class="btn danger" data-a="sbx-stop">Quitter le test</button></div>`
      : `<div>Pour essayer l'ERP (créer des factures, des livraisons, des données d'exemple…) sans toucher aux vraies données. Le test ne concerne que <b>votre session</b> : les autres utilisateurs continuent normalement.</div><div><button class="btn sbx-btn" data-a="sbx-start">Activer l'environnement de test</button></div>`}</div></div>`;
}
function usersCardShell() {
  if (!SERVER || !isAdmin()) return "";
  if (ME && ME.key) return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><h3>Connexion par code</h3>
    <div>Chaque utilisateur tape son nom et reçoit un code à 8 chiffres par e-mail. Pour l'activer, configurez la boîte d'envoi, votre code maître et votre compte administrateur.</div>
    <div class="row-g wrap"><a class="btn primary" href="api/setup.php" target="_blank" rel="noopener">Configurer la connexion</a><button class="btn" data-a="users-recheck">J'ai terminé : passer à la connexion par code</button></div></div></div>`;
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><div class="row-sb"><h3 class="np">Utilisateurs</h3><span class="row-g"><a class="btn sm" href="api/setup.php" target="_blank" rel="noopener">E-mail et code maître</a><button class="btn sm primary" data-a="user-form" ${dis()}>Ajouter un utilisateur</button></span></div>
    <div class="muted small">Chaque utilisateur se connecte avec son nom et un code reçu par e-mail. Une connexion reste valable 8 heures sur l'appareil.</div><div id="users-list"><div class="muted">Chargement…</div></div></div></div>`;
}
async function loadUsers() {
  const box = document.getElementById("users-list"); if (!box || !API || (ME && ME.key)) return;
  try { USERS = (await API.call("GET", "auth/users")).users; } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  box.innerHTML = USERS.map(u => `<div class="list-row"><span><b>${esc(u.name)}</b>${u.active ? "" : ` <span class="chip">désactivé</span>`}<span class="muted small"> · ${esc(u.email)}</span></span>
    <span class="row-g">${u.tfaRequired || u.tfa ? `<span class="chip ${u.tfa ? "good" : "warn"}" title="${esc(tr(u.tfa ? "Second facteur actif" : "Second facteur pas encore activé (demandé à la prochaine connexion)"))}">${u.tfa ? "🔐 2FA" : "2FA à activer"}</span>` : ""}${u.payRight ? `<span class="chip" title="${esc(tr("Peut préparer des paiements"))}">💸</span>` : ""}<span class="chip ${u.role === "admin" ? "warn" : u.role === "terrain" ? "info" : u.role === "garage" ? "orange" : u.role === "chauffeur" ? "good" : ""}">${ROLE_LBL[u.role] || u.role}</span><button class="btn sm" data-a="user-form" data-id="${esc(u.id)}" ${dis()}>Modifier</button></span></div>`).join("")
    + `<div class="row-g" style="margin-top:8px"><button class="linkbtn small" data-a="user-testmail">Envoyer un e-mail de test à mon adresse</button></div>`;
}
ACTIONS["users-recheck"] = () => { lsSet(KEY_LS, ""); location.reload(); };
ACTIONS["user-form"] = el => {
  const u = (USERS || []).find(x => x.id === el.dataset.id) || { id: "", name: "", email: "", role: "bureau", active: true };
  const isMe = ME && u.name === ME.name;
  const m = modal(`${mHead(u.id ? "Modifier l'utilisateur" : "Nouvel utilisateur")}<form><div class="body stack-s"><div class="fields">
    ${field("us-name", "Nom et prénom (tapé à la connexion)", u.name, { required: true })}${field("us-email", "E-mail (reçoit les codes)", u.email, { type: "email", required: true })}</div>
    <div class="stack-s">${Object.keys(ROLE_LBL).map(r => `<label class="chk line"><input type="radio" name="us-role" value="${r}" ${u.role === r ? "checked" : ""}> <b>${ROLE_LBL[r]}</b><span class="muted small"> · ${ROLE_HELP[r]}</span></label>`).join("")}</div>
    <div id="us-garage-box" ${u.role === "garage" ? "" : "hidden"}>${field("us-garage", "Garage de cet utilisateur", ((S.garages || []).find(g => (g.userIds || []).includes(u.id)) || {}).id || "", { type: "select", options: [["", "— choisir —"], ...(S.garages || []).map(g => [g.id, g.name])] })}<div class="muted small">Créez d'abord la fiche dans Flotte → Garages.</div></div>
    <div id="us-pay-box" ${["admin", "bureau"].includes(u.role) ? "" : "hidden"}><label class="chk line"><input type="checkbox" id="us-pay" ${u.payRight ? "checked" : ""} ${ME && ME.tfa ? "" : "disabled"}> 💸 Initier des paiements <span class="muted small">· prépare les virements des factures d'achat, signés ensuite dans Ponto / la banque${u.id && !u.tfa ? " (actif une fois son second facteur activé)" : ""}${ME && ME.tfa ? "" : " — activez d'abord votre propre second facteur"}</span></label></div>
    ${u.id && (u.tfa || u.tfaRequired) ? `<div class="small">Second facteur : ${u.tfa ? `<b>actif</b> <button type="button" class="linkbtn" data-a="user-tfa-reset" data-id="${esc(u.id)}">Réinitialiser (téléphone perdu)…</button>` : "pas encore activé (demandé à sa prochaine connexion)"}</div>` : ""}
    ${u.id ? `<label class="chk line"><input type="checkbox" id="us-active" ${u.active ? "checked" : ""}> Compte actif <span class="muted small">(décocher bloque la connexion et ferme ses sessions)</span></label>` : ""}
    <div class="err" id="us-err"></div></div>
    <footer>${u.id && !isMe ? `<div class="left"><button type="button" class="btn danger" data-a="user-del" data-id="${esc(u.id)}">Supprimer…</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`);
  m.querySelectorAll('input[name="us-role"]').forEach(x => x.onchange = () => { m.querySelector("#us-garage-box").hidden = x.value !== "garage" || !x.checked; if (x.checked) m.querySelector("#us-pay-box").hidden = !["admin", "bureau"].includes(x.value); });
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const role = m.querySelector('input[name="us-role"]:checked')?.value || "bureau", err = m.querySelector("#us-err");
    try {
      const id = u.id || "u" + uid();
      await API.call("PUT", "auth/users/" + id, { name: val("us-name"), email: val("us-email"), role, active: u.id ? m.querySelector("#us-active").checked : true, ...(m.querySelector("#us-pay").disabled ? {} : { canPay: ["admin", "bureau"].includes(role) && m.querySelector("#us-pay").checked }) });
      const gsel = role === "garage" ? val("us-garage") : "";   /* lien compte ↔ fiche garage (garages.userIds) */
      for (const g of S.garages || []) { const has = (g.userIds || []).includes(id); if (has !== (g.id === gsel)) await patch("garages", g.id, { userIds: g.id === gsel ? [...(g.userIds || []), id] : (g.userIds || []).filter(x => x !== id) }); }
      closeModal(); toast(u.id ? "Utilisateur modifié" : "Utilisateur ajouté"); if (isMe) { try { ME = (await API.call("GET", "auth/me")).user; } catch { } } loadUsers().then(() => typeof loadPay === "function" && loadPay());
    } catch (x) { err.textContent = tr(x.message); }
  };
};
ACTIONS["user-tfa-reset"] = el => {
  const u = (USERS || []).find(x => x.id === el.dataset.id); if (!u) return;
  confirmBox(`Réinitialiser le second facteur de ${u.name} ? Ses sessions sont fermées ; il en réactivera un à sa prochaine connexion. Son droit de paiement est retiré. Les administrateurs sont prévenus par e-mail.`, async () => { await API.call("POST", "auth/users/" + u.id + "/tfa-reset"); closeModal(); toast("Second facteur réinitialisé"); loadUsers(); }, "Réinitialiser");
};
ACTIONS["user-del"] = el => {
  const u = (USERS || []).find(x => x.id === el.dataset.id); if (!u) return;
  const m = modal(`${mHead("Supprimer l'utilisateur")}<div class="body stack-s"><div>Supprimer le compte de <b>${esc(u.name)}</b> ? Il ne pourra plus se connecter. Ses saisies passées sont conservées.</div>
    <div class="muted small">Pour une absence temporaire, désactivez plutôt le compte.</div>
    <label class="chk confirm-chk"><input type="checkbox" id="ud-ok"> Je confirme la suppression de <b>${esc(u.name)}</b></label><div class="err" id="ud-err"></div></div>
    <footer><button class="btn" data-close>Annuler</button><button class="btn primary danger-bg" id="ud-yes" disabled>Supprimer</button></footer>`, "sm");
  const ok = m.querySelector("#ud-ok"), yes = m.querySelector("#ud-yes");
  ok.onchange = () => yes.disabled = !ok.checked;
  yes.onclick = async () => { try { await API.call("DELETE", "auth/users/" + u.id); closeModal(); toast("Utilisateur supprimé"); loadUsers(); } catch (x) { m.querySelector("#ud-err").textContent = tr(x.message); } };
};
ACTIONS["user-testmail"] = async el => {
  el.disabled = true;
  try { await API.call("POST", "auth/test-mail", {}); toast("E-mail de test envoyé à " + (ME.email || "votre adresse")); } catch (e) { toast(tr(e.message)); }
  el.disabled = false;
};

/* ======================= chauffeurs ======================= */
const driverUse = name => ({ veh: S.vehicles.filter(v => !v.retired && v.driver === name).length, logs: S.driverLogs.filter(l => l.driver === name).length,
  fines: (S.fines || []).filter(f => f.driver === name).length, faults: S.faults.filter(f => f.reporter === name).length });
const driversFound = () => { const ds = new Set(settings().drivers || []);
  return [...new Set([...S.vehicles.filter(v => !v.retired).map(v => v.driver), ...S.driverLogs.map(l => l.driver)].map(x => (x || "").trim()).filter(Boolean))].filter(n => !ds.has(n)).sort((a, b) => a.localeCompare(b)); };
const refreshParams = () => { staticDone = null; render(true); };
ACTIONS["go-drivers"] = (el, e) => { e && e.preventDefault(); UI.tab = Object.assign(UI.tab || {}, { flotte: "chauffeurs" }); location.hash = "#flotte"; render(true); };
ACTIONS["driver-import"] = async () => {
  const found = driversFound(); if (!found.length) return;
  await saveSettings({ drivers: [...(settings().drivers || []), ...found] }); refreshParams(); toast(`${plural(found.length, "chauffeur")} ajouté${found.length > 1 ? "s" : ""}`);
};

/* véhicules d'exemple + tout ce qui y est rattaché (pannes, entretiens, prises en charge, amendes, positions, trajets, pneus en stock d'exemple) */
const FLEET_COLS = ["vehicles", "vehEvents", "faults", "driverLogs", "fines", "vehPos", "trips", "tires"];
const EXPORT_TELE = ["vehPos", "trips"];
function exportPayload(withTele) {
  const out = {};
  for (const c of COLS) {
    if (!withTele && EXPORT_TELE.includes(c)) continue;
    out[c] = {};
    for (const d of S[c] || []) { const x = Object.assign({}, d); delete x.id; out[c][d.id] = x; }
  }
  out.settings = { company: Object.assign({}, S.settings) };
  return out;
}
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
ACTIONS["export-data"] = async () => {
  const withTele = !!document.getElementById("exp-tele")?.checked, data = exportPayload(withTele);
  const n = Object.values(data).reduce((a, c) => a + Object.keys(c).length, 0);
  await offerFile(`ways-export-${stamp()}.json`, JSON.stringify(data, null, 1), "application/json");
  toast(`Export prêt : ${plural(n, "élément")}`);
};
ACTIONS["export-files"] = async el => {
  const ids = new Set();
  JSON.stringify(exportPayload(false), (k, v) => { if (typeof v === "string" && /^[0-9a-f]{32}$/.test(v)) ids.add(v); return v; });
  if (!ids.size) { toast("Aucun fichier joint à exporter."); return; }
  el.disabled = true; const label = el.textContent;
  try {
    if (!window.JSZip) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
    const zip = new JSZip(), list = [...ids], ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    let ok = 0, ko = 0;
    for (let i = 0; i < list.length; i++) {
      el.textContent = `Fichiers ${i + 1} / ${list.length}…`;
      try { const r = await fetch(blobUrl(list[i])); if (!r.ok) throw 0; const b = await r.blob(); zip.file(`files/${list[i]}.${ext[b.type] || "bin"}`, b); ok++; } catch (e) { ko++; }
    }
    const blob = await zip.generateAsync({ type: "blob" });
    await offerFile(`ways-fichiers-${stamp()}.zip`, blob, "application/zip");
    toast(`${plural(ok, "fichier")} exporté${ok > 1 ? "s" : ""}${ko ? ` · ${ko} introuvable${ko > 1 ? "s" : ""}` : ""}`);
  } catch (e) { toast("Export des fichiers impossible ici."); }
  el.disabled = false; el.textContent = label;
};
/* ---- import d'une sauvegarde sur le serveur (une collection par envoi) ---- */
let impMsg = "";
const impLog = h => { impMsg = h; const el = document.getElementById("imp-log"); if (el) el.innerHTML = h; };
let importing = false;
async function importJson(file) {
  if (!API || importing) return; importing = true;
  try {
    let data; try { data = JSON.parse(await file.text()); } catch (e) { impLog(`<div class="err">${tr("Ce fichier n'est pas un export JSON de l'ERP.")}</div>`); return; }
    if (!data || typeof data !== "object" || Array.isArray(data) || !(data.vehicles || data.clients || data.settings)) { impLog(`<div class="err">${tr("Ce fichier n'est pas un export JSON de l'ERP.")}</div>`); return; }
    const colls = Object.keys(data).filter(c => data[c] && typeof data[c] === "object");
    let n = 0, i = 0;
    for (const c of colls) {
      i++; impLog(`${tr("Import des données…")} ${i} / ${colls.length} · ${esc(c)}`);
      const docs = data[c], ids = Object.keys(docs);
      for (let k = 0; k < ids.length; k += 300) {
        const part = {}; ids.slice(k, k + 300).forEach(id => part[id] = docs[id]);
        const r = await API.importAll({ [c]: part }); n += r.imported || 0;
      }
    }
    await API.refresh();
    impLog(`<span class="chip good">${plural(n, "élément")} ${tr("importés")}</span> ${tr("Étape suivante : le ZIP des fichiers joints.")}`);
    toast("Données importées");
  } catch (e) { impLog(`<div class="err">${tr("Import interrompu :")} ${esc(e.message || "")}. ${tr("Relancez-le : les éléments déjà importés sont simplement mis à jour.")}</div>`); }
  finally { importing = false; }
}
async function importZip(file) {
  if (!API || importing) return; importing = true;
  try {
    if (!window.JSZip) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
    const zip = await JSZip.loadAsync(file), entries = [];
    zip.forEach((p, e) => { const m = p.match(/([a-f0-9]{32})(\.[a-z0-9]+)?$/i); if (!e.dir && m) entries.push({ e, id: m[1].toLowerCase(), ext: m[2] || "" }); });
    if (!entries.length) { impLog(`<div class="err">${tr("Aucun fichier reconnu dans ce ZIP.")}</div>`); return; }
    // retrouve le nom d'origine de chaque fichier dans les données
    const names = {};
    const walk = o => { if (!o || typeof o !== "object") return; if (Array.isArray(o)) return o.forEach(walk);
      for (const k of ["file", "photo"]) if (typeof o[k] === "string" && o.fileName) names[o[k]] = o.fileName; Object.values(o).forEach(walk); };
    COLS.forEach(c => walk(S[c]));
    const MIME = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
    let ok = 0, skip = 0, ko = 0;
    for (let i = 0; i < entries.length; i++) {
      const { e, id, ext } = entries[i];
      impLog(`${tr("Envoi des fichiers…")} ${i + 1} / ${entries.length}`);
      try {
        const blob = await e.async("blob"), name = names[id] || id + ext;
        const r = await API.upload(new File([blob], name, { type: MIME[ext] || "application/octet-stream" }), { id });
        r.exists ? skip++ : ok++;
      } catch (err) { ko++; }
    }
    impLog(`<span class="chip good">${plural(ok, "fichier")} ${tr("envoyés")}</span>${skip ? ` · ${skip} ${tr("déjà présents")}` : ""}${ko ? ` · <span class="chip bad">${ko} ${tr("échecs")}</span> ${tr("(relancez l'import pour les reprendre)")}` : ""}`);
    toast("Fichiers importés"); render(true);
  } catch (e) { impLog(`<div class="err">${tr("Le ZIP n'a pas pu être lu.")}</div>`); }
  finally { importing = false; }
}
ACTIONS["purge-demo-fleet"] = () => {
  const n = S.vehicles.filter(v => v.demo).length;
  confirmBox(`Supprimer définitivement les ${n} véhicules d'exemple, avec leurs pannes, entretiens, amendes, positions et trajets d'exemple ? Vos propres véhicules et les autres données d'exemple (gaz, clients, factures, outils) sont conservés.`, async () => {
    const all = FLEET_COLS.flatMap(c => (S[c] || []).filter(x => x.demo).map(x => [c, x.id]));
    try { let done = 0; for (const c of FLEET_COLS) { const ids = all.filter(a => a[0] === c).map(a => a[1]), base = done; await removeMany(c, ids, k => toast(`Suppression… ${base + k}/${all.length}`)); done += ids.length; }
      toast(`${plural(n, "véhicule")} d'exemple supprimé${n > 1 ? "s" : ""}`); }
    catch (e) { toast(`Suppression interrompue${e && e.message ? " : " + e.message : ""}. Relancez-la pour terminer.`); }
    if (API) await API.refresh(); staticDone = null; render(true);
  }, "Supprimer les véhicules d'exemple");
};
ACTIONS["purge-demo"] = () => confirmBox("Supprimer définitivement toutes les données d'exemple ? Vos propres saisies sont conservées.", async () => {
  const plan = COLS.map(c => [c, S[c].filter(x => x.demo).map(x => x.id)]).filter(([, ids]) => ids.length);
  const total = plan.reduce((a, [, ids]) => a + ids.length, 0);
  const dd = settings().demoDrivers || [];
  if (!total && !dd.length) { toast("Aucune donnée d'exemple à supprimer."); return; }
  let done = 0;
  try {
    for (const [c, ids] of plan) { const base = done; await removeMany(c, ids, k => { done = base + k; toast(`Suppression… ${done} / ${total}`); }); done = base + ids.length; }
    if (dd.length) await saveSettings({ drivers: (settings().drivers || []).filter(d => !dd.includes(d)), demoDrivers: [] });
    toast(`${plural(total + dd.length, "élément")} d'exemple supprimé${total + dd.length > 1 ? "s" : ""}`);
  } catch (e) { toast(`Suppression interrompue après ${done} / ${total}${e && e.message ? " : " + e.message : ""}. Relancez-la pour terminer.`); }
  if (API) await API.refresh();
  staticDone = null; render(true);
}, "Tout supprimer");

/* ======================= PRODUITS & PRIX ======================= */
/* champ de prix modifiable directement dans les tableaux : enregistré à la sortie du champ */
function priceInput(col, id, fieldName, v) {
  return `<input class="price-in num" type="number" step="0.01" min="0" value="${v ?? 0}" data-price="${col}|${id}|${fieldName}" aria-label="Prix HT" ${dis()}>`;
}
document.addEventListener("change", async e => {
  const el = e.target; if (!el.dataset || el.dataset.price == null) return;
  const [col, id, f] = el.dataset.price.split("|"), v = r2(+el.value || 0);
  el.classList.add("saving");
  if (col === "settings") await saveSettings({ [f]: v });
  else await patch(col, id, { [f]: v });
  el.classList.remove("saving"); el.classList.add("saved"); setTimeout(() => el.classList.remove("saved"), 1200);
  toast("Prix enregistré : " + eur(v));
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.dataset && e.target.dataset.price != null) { e.preventDefault(); e.target.blur(); } });

VIEWS.produits = {
  render() {
    const tab = curTab("produits", "gaz");
    return head("Produits & prix", "Modifiez un prix directement dans le tableau : il est enregistré dès que vous quittez la case. Les nouveaux prix s'appliquent aux prochains documents ; les factures existantes ne changent pas.") +
      tabs("produits", [["gaz", "Bouteilles de gaz", S.gasTypes.length], ["frais", "Frais de livraison (EXP)"], ["etalonnage", "Étalonnage", S.tools.length], ["articles", "Articles & services", S.products.length]]) +
      ({ gaz: prodGas, frais: prodFees, etalonnage: prodCalib, articles: prodArticles })[tab]();
  }
};
function prodGas() {
  const rows = S.gasTypes.slice().sort((a, b) => (a.gas + a.size).localeCompare(b.gas + b.size, "fr"));
  return `<div class="panel"><div class="row-sb pad"><div class="muted">Prix facturé par bouteille livrée.</div><button class="btn primary" data-a="gtype-form" ${dis()}>Ajouter un type de bouteille</button></div>
    <div class="tablewrap"><table><thead><tr><th>Gaz</th><th>Format</th><th class="r">Volume</th><th class="r">Pression</th><th>Contenu</th><th class="r" style="width:140px">Prix HT / bouteille</th><th class="r">TVA</th><th class="r">Prix TVAC</th><th></th></tr></thead><tbody>
    ${rows.map(t => `<tr><td><b>${esc(t.gas)}</b> <span class="muted">${esc(t.grade || "")}</span></td><td>${esc(t.size)}</td><td class="r num">${t.volume} L</td><td class="r num">${t.pressure ? t.pressure + " bar" : "—"}</td><td>${esc(t.content || "—")}</td>
      <td class="r">${priceInput("gasTypes", t.id, "price", t.price)}</td><td class="r num">${t.vat ?? 21} %</td><td class="r num muted">${eur(t.price * (1 + (t.vat ?? 21) / 100))}</td>
      <td class="r"><button class="btn sm" data-a="gtype-form" data-id="${t.id}" ${dis()}>Modifier</button></td></tr>`).join("")}
    </tbody></table>${rows.length ? "" : `<div class="empty">Aucun type de bouteille.</div>`}</div></div>`;
}
function prodFees() {
  const s = settings();
  return `<div class="panel narrow"><div class="pad stack"><h3 class="np">Frais de transfert Airside (EXP)</h3>
    <div class="muted">Forfait ajouté une fois sur la facture brouillon de chaque livraison de gaz. Le montant reste modifiable au moment de la livraison (0 = pas de frais).</div>
    <div class="fields"><label class="f">Montant HT par livraison (€)${priceInput("settings", "company", "expAmount", s.expAmount)}</label>
    ${field("p-explbl", "Libellé sur la facture", s.expLabel)}</div>
    <label class="chk"><input type="checkbox" id="p-expon" ${s.expMode !== "non" ? "checked" : ""} ${dis()}> Facturer les frais EXP sur les livraisons de gaz</label></div></div>`;
}
VIEWS.produits.after = () => {
  const l = document.getElementById("p-explbl"), on = document.getElementById("p-expon");
  if (l) l.onchange = async () => { await saveSettings({ expLabel: l.value.trim() || "Frais de transfert Airside (EXP)" }); toast("Libellé enregistré"); };
  if (on) on.onchange = async () => { await saveSettings({ expMode: on.checked ? "livraison" : "non" }); toast(on.checked ? "Frais EXP activés" : "Frais EXP désactivés"); };
};
function prodCalib() {
  const q = UI.q.toLowerCase();
  const rows = S.tools.filter(t => !q || [t.serial, t.name, t.brand, t.category, clientName(t.clientId)].join(" ").toLowerCase().includes(q)).sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name, "fr"));
  const cats = [...new Set(S.tools.map(t => t.category || "Sans catégorie"))].sort();
  return `<div class="panel">${searchBar("Outil, n° de série, client, catégorie…")}
    <div class="pad row-g wrap"><span class="muted small">Appliquer un prix à toute une catégorie :</span>
      <select id="cp-cat" aria-label="Catégorie">${cats.map(c => `<option>${esc(c)}</option>`).join("")}</select>
      <input id="cp-val" type="number" step="0.01" min="0" placeholder="Prix HT" class="price-in" aria-label="Prix HT pour la catégorie"><button class="btn sm" data-a="cat-price" ${dis()}>Appliquer</button></div>
    <div class="tablewrap"><table><thead><tr><th>Catégorie</th><th>Outil</th><th>N° de série</th><th>Client</th><th class="r" style="width:140px">Prix étalonnage HT</th></tr></thead><tbody>
    ${rows.map(t => `<tr><td>${esc(t.category || "—")}</td><td>${esc(t.name)} <span class="muted small">${esc(t.brand || "")}</span></td><td class="mono">${esc(t.serial)}</td><td>${esc(clientName(t.clientId))}</td>
      <td class="r">${priceInput("tools", t.id, "calPrice", t.calPrice)}</td></tr>`).join("")}</tbody></table>${rows.length ? "" : `<div class="empty">Aucun outil.</div>`}</div></div>`;
}
ACTIONS["cat-price"] = () => {
  const cat = val("cp-cat"), v = r2(+val("cp-val"));
  if (!val("cp-val")) { toast("Indiquez un prix."); return; }
  const ts = S.tools.filter(t => (t.category || "Sans catégorie") === cat);
  confirmBox(`Mettre le prix d'étalonnage à ${eur(v)} HT pour ${plural(ts.length, "outil")} de la catégorie « ${esc(cat)} » ?`, async () => { for (const t of ts) await patch("tools", t.id, { calPrice: v }); }, "Appliquer");
};

/* ======================= E-MAILS DANS LA LANGUE DU CLIENT ======================= */
const clientLang = id => client(id)?.lang === "en" ? "en" : "fr";
const MAIL = {
  facture: {
    fr: (c, d, T, s) => [`Facture ${d.number} - ${s.name}`, `Bonjour${c.contact ? " " + c.contact : ""},\n\nVeuillez trouver ci-joint notre facture ${d.number} du ${fmtDate(d.date)}, d'un montant de ${eur(T.ttc)} TVAC.\n\nMerci d'effectuer le paiement avant le ${fmtDate(d.dueDate)}${s.iban ? " sur le compte " + s.iban : ""} en mentionnant la communication structurée ${ogm(d.number)}.\n\nNous restons à votre disposition pour toute question.\n\nBien cordialement,\n${s.name}${s.phone ? "\n" + s.phone : ""}`],
    en: (c, d, T, s) => [`Invoice ${d.number} - ${s.name}`, `Dear ${c.contact || "Sir or Madam"},\n\nPlease find attached our invoice ${d.number} dated ${fmtDate(d.date)}, for a total amount of ${eur(T.ttc)} including VAT.\n\nKindly make the payment by ${fmtDate(d.dueDate)}${s.iban ? " to account " + s.iban : ""}, quoting the structured reference ${ogm(d.number)}.\n\nPlease do not hesitate to contact us if you have any questions.\n\nKind regards,\n${s.name}${s.phone ? "\n" + s.phone : ""}`]
  },
  devis: {
    fr: (c, d, T, s) => [`Devis ${d.number} - ${s.name}`, `Bonjour${c.contact ? " " + c.contact : ""},\n\nComme convenu, veuillez trouver ci-joint notre devis ${d.number} d'un montant de ${eur(T.ht)} HT (${eur(T.ttc)} TVAC), valable jusqu'au ${fmtDate(d.dueDate)}.\n\nN'hésitez pas à revenir vers nous pour toute question ou pour confirmer votre commande.\n\nBien cordialement,\n${s.name}${s.phone ? "\n" + s.phone : ""}`],
    en: (c, d, T, s) => [`Quotation ${d.number} - ${s.name}`, `Dear ${c.contact || "Sir or Madam"},\n\nAs agreed, please find attached our quotation ${d.number} for ${eur(T.ht)} excluding VAT (${eur(T.ttc)} including VAT), valid until ${fmtDate(d.dueDate)}.\n\nPlease let us know if you have any questions or would like to confirm your order.\n\nKind regards,\n${s.name}${s.phone ? "\n" + s.phone : ""}`]
  },
  livraison: {
    fr: (c, d, n, s) => [`Livraison ${d.number} - ${s.name}`, `Bonjour${c.contact ? " " + c.contact : ""},\n\nVeuillez trouver ci-joint le bon de livraison ${d.number} du ${fmtDate(d.date)} (${n} bouteille${n > 1 ? "s" : ""}) ainsi que le certificat de conformité correspondant.\n\nBien cordialement,\n${s.name}${s.phone ? "\n" + s.phone : ""}`],
    en: (c, d, n, s) => [`Delivery ${d.number} - ${s.name}`, `Dear ${c.contact || "Sir or Madam"},\n\nPlease find attached delivery note ${d.number} dated ${fmtDate(d.date)} (${n} cylinder${n > 1 ? "s" : ""}) together with the corresponding certificate of conformity.\n\nKind regards,\n${s.name}${s.phone ? "\n" + s.phone : ""}`]
  },
  rappel: {
    fr: (c, ts, s) => [`Étalonnage de vos outils arrivant à échéance`, `Bonjour${c.contact ? " " + c.contact : ""},\n\nLes outils suivants arrivent à échéance d'étalonnage :\n${ts.map(t => `- ${t.name}${t.brand ? " (" + t.brand + ")" : ""}, n° de série ${t.serial} : échéance le ${fmtDate(t.nextDue)}`).join("\n")}\n\nNous pouvons venir les collecter à votre convenance. Merci de nous indiquer vos disponibilités.\n\nBien cordialement,\n${s.name}${s.phone ? "\n" + s.phone : ""}`],
    en: (c, ts, s) => [`Calibration of your tools falling due`, `Dear ${c.contact || "Sir or Madam"},\n\nThe following tools are due for calibration:\n${ts.map(t => `- ${t.name}${t.brand ? " (" + t.brand + ")" : ""}, serial number ${t.serial}: due on ${fmtDate(t.nextDue)}`).join("\n")}\n\nWe would be happy to collect them at a time that suits you. Please let us know your availability.\n\nKind regards,\n${s.name}${s.phone ? "\n" + s.phone : ""}`]
  }
};
/* prépare un e-mail : destinataire, objet, texte modifiable, copie et ouverture dans la messagerie */
function mailBox(clientId, build) {
  UI.mailDoc = null;
  const c = client(clientId) || {};
  let lang = clientLang(clientId);
  const make = () => withLang(lang, () => build(c, settings()));
  const draw = async () => {
    const [subject, body] = await make();
    const m = modal(`${mHead("E-mail à " + esc(c.name || ""))}<div class="body">
      <div class="row-sb wrap"><div class="muted small">Langue du client : <b data-noi18n>${lang === "en" ? "English" : "Français"}</b>${c.lang ? "" : " (par défaut)"}</div>
        <div class="seg" data-noi18n><button data-ml="fr" class="${lang === "fr" ? "on" : ""}">FR</button><button data-ml="en" class="${lang === "en" ? "on" : ""}">EN</button></div></div>
      <label class="f">Destinataire<input id="ml-to" value="${esc(c.email || "")}" placeholder="adresse@client.be"></label>
      <label class="f">Objet<input id="ml-subj" value="${esc(subject)}"></label>
      <label class="f">Message<textarea id="ml-body" rows="12">${esc(body)}</textarea></label>
      <div class="hint">Joignez le PDF téléchargé à votre e-mail. Si le bouton « Ouvrir dans la messagerie » ne fonctionne pas sur cet appareil, utilisez « Copier ».</div></div>
      <footer><div class="left"><a class="btn" id="ml-open" target="_blank" rel="noopener">Ouvrir dans la messagerie</a></div><button class="btn" id="ml-copy">Copier l'objet et le message</button><button class="btn primary" data-close>Fermer</button></footer>`, "lg");
    const link = () => { m.querySelector("#ml-open").href = `mailto:${encodeURIComponent(val("ml-to"))}?subject=${encodeURIComponent(val("ml-subj"))}&body=${encodeURIComponent(m.querySelector("#ml-body").value)}`; };
    link(); m.addEventListener("input", link);
    m.querySelectorAll("[data-ml]").forEach(b => b.onclick = () => { lang = b.dataset.ml; draw(); });
    m.querySelector("#ml-copy").onclick = async () => {
      const txt = (lang === "en" ? "Subject: " : "Objet : ") + val("ml-subj") + "\n\n" + m.querySelector("#ml-body").value;
      try { await navigator.clipboard.writeText(txt); toast("Copié : collez-le dans votre messagerie"); } catch { m.querySelector("#ml-body").select(); toast("Sélectionnez le texte et copiez-le."); }
    };
  };
  draw();
}
document.addEventListener("click", e => { if (e.target.closest && e.target.closest("#ml-open") && UI.mailDoc && typeof logClient === "function") logClient("docs", UI.mailDoc, "mail", (document.getElementById("ml-to") || {}).value); });
ACTIONS["doc-mail"] = () => {
  const d = curDoc(); if (!d) return;
  mailBox(d.clientId, (c, s) => MAIL[d.kind === "devis" ? "devis" : "facture"][LANG](c, d, totals(d), s));
  UI.mailDoc = d.id;
};

/* ======================= DEVIS D'ÉTALONNAGE : outil ↔ RO ↔ SO ======================= */
const CAL_GENERIC = "__cal";
const isCalLine = l => l && l.kind !== "section" && l.kind !== "note" && (l.productId === CAL_GENERIC || S.products.find(p => p.id === l.productId)?.kind === "etalonnage");
const toolDetail = t => [t.name, t.pn ? "P/N " + t.pn : "", "S/N " + t.serial].filter(Boolean).join("\n");
const docROs = () => EDIT.lines.filter(l => l.kind === "section" && l.ro).map(l => l.ro);
const normRO = x => String(x || "").toUpperCase().replace(/\s+/g, "");
/* place la ligne i sous la sous-section de son RO (créée si besoin) ; renvoie le nouvel index */
function placeUnderRO(i, ro) {
  const line = EDIT.lines.splice(i, 1)[0];
  let k = EDIT.lines.findIndex(l => l.kind === "section" && l.ro === ro);
  if (k < 0) {
    // nouvelle sous-section : après le dernier bloc RO existant, sinon à la fin
    let at = EDIT.lines.length;
    const lastRo = EDIT.lines.map((l, j) => l.kind === "section" && l.ro ? j : -1).filter(j => j >= 0).pop();
    if (lastRo != null) { at = lastRo + 1; while (at < EDIT.lines.length && EDIT.lines[at].kind !== "section") at++; }
    EDIT.lines.splice(at, 0, { kind: "section", label: "RO " + ro, ro });
    k = at;
  }
  let end = k + 1; while (end < EDIT.lines.length && EDIT.lines[end].kind !== "section") end++;
  EDIT.lines.splice(end, 0, line);
  // nettoie les sous-sections RO devenues vides
  EDIT.lines = EDIT.lines.filter((l, j, a) => !(l.kind === "section" && l.ro && (!a[j + 1] || a[j + 1].kind === "section")));
  return EDIT.lines.indexOf(line);
}
function calToolPicker(i) {
  const host = document.querySelector(".modal"); if (!host || !EDIT.lines[i]) return;
  host.querySelector(".subpanel")?.remove();
  const l = EDIT.lines[i], cid = document.getElementById("d-client")?.value || EDIT.clientId;
  const cur = l.toolId ? S.tools.find(t => t.id === l.toolId) : null;
  const ros = docROs();
  const lastRo = l.ro || ros[ros.length - 1] || "";
  let pick = cur ? { id: cur.id } : l.newTool ? { neu: true } : null, mode = l.newTool ? "new" : "known";
  const sp = document.createElement("div"); sp.className = "subpanel";
  sp.innerHTML = `<div class="sp-box" role="dialog" aria-label="Outil à étalonner"><header><h2>Outil à étalonner</h2><button type="button" class="x" data-spclose aria-label="Fermer">×</button></header><div class="body">
    <div class="seg" role="group"><button type="button" data-spmode="known">Outil déjà connu</button><button type="button" data-spmode="new">Nouvel outil</button></div>
    <div id="sp-known"><input type="search" id="sp-q" class="fsearch" placeholder="N° de série, P/N, désignation…" autocomplete="off" aria-label="Rechercher un outil"><div id="sp-res" class="sp-res"></div></div>
    <div id="sp-new" class="fields">${field("sp-serial", "N° de série (S/N)", l.newTool?.serial || "", { cls: "mono", required: false })}${field("sp-pn", "Part number (P/N)", l.newTool?.pn || "", { cls: "mono" })}
      ${field("sp-name", "Désignation", l.newTool?.name || "", { ph: "INDICATOR, NITROGEN, 5800 PSI", wide: true })}${field("sp-brand", "Marque", l.newTool?.brand || "")}${field("sp-cat", "Catégorie", l.newTool?.category || "", { ph: "Pression, couple…" })}</div>
    <h3>Repair Order (RO)</h3>
    <div class="row-g wrap">${ros.length ? `<select id="sp-ro" class="fsel" aria-label="RO existant">${ros.map(r => `<option ${r === lastRo ? "selected" : ""}>${esc(r)}</option>`).join("")}<option value="__new">+ Nouveau RO…</option></select>` : ""}
      <input id="sp-ronew" class="mono" placeholder="N° de RO (ex. R0867126)" ${ros.length ? `style="display:none"` : ""} aria-label="Nouveau numéro de RO"></div>
    <div class="hint">Chaque RO devient une sous-section du devis, avec son sous-total. Un RO peut contenir plusieurs outils.</div>
    <div class="err" id="sp-err"></div></div>
    <footer><button type="button" class="btn" data-spclose>Annuler</button><button type="button" class="btn primary" id="sp-ok">Ajouter au devis</button></footer></div>`;
  host.appendChild(sp);
  const $ = q => sp.querySelector(q);
  const draw = () => {
    sp.querySelectorAll("[data-spmode]").forEach(b => b.classList.toggle("on", b.dataset.spmode === mode));
    $("#sp-known").style.display = mode === "known" ? "" : "none"; $("#sp-new").style.display = mode === "new" ? "" : "none";
    const q = ($("#sp-q").value || "").toLowerCase().trim();
    const all = S.tools.filter(t => !q || [t.serial, t.pn, t.name, t.brand, t.model, clientName(t.clientId)].join(" ").toLowerCase().includes(q));
    all.sort((a, b) => (b.clientId === cid) - (a.clientId === cid) || a.serial.localeCompare(b.serial));
    const used = new Set(EDIT.lines.filter((x, j) => j !== i && x.toolId).map(x => x.toolId));
    $("#sp-res").innerHTML = all.slice(0, 40).map(t => `<button type="button" class="sp-item ${pick?.id === t.id ? "on" : ""}" data-sptool="${t.id}">
      <span class="mono"><b>${esc(t.serial)}</b></span><span class="grow">${esc(t.name)}${t.pn ? ` <span class="muted mono small">P/N ${esc(t.pn)}</span>` : ""}<div class="muted small">${esc(clientName(t.clientId))}${t.clientId !== cid && cid ? " · autre client" : ""}</div></span>
      ${used.has(t.id) ? `<span class="chip warn">déjà dans ce devis</span>` : t.status && !["client", "dropped", "done"].includes(t.status) ? `<span class="chip info">${esc(T_STATUS[t.status]?.[0] || "")}</span>` : ""}</button>`).join("")
      || `<div class="empty small">${q ? `Aucun outil connu pour « ${esc(q)} ». <button type="button" class="linkbtn" data-spmode="new">Créer un nouvel outil</button>` : "Aucun outil enregistré."}</div>`;
  };
  sp.addEventListener("click", e => {
    if (e.target.closest("[data-spclose]")) { sp.remove(); if (!EDIT.lines[i]?.toolId && !EDIT.lines[i]?.newTool) drawLines(); return; }
    const md = e.target.closest("[data-spmode]"); if (md) { mode = md.dataset.spmode; if (mode === "new" && !$("#sp-serial").value) $("#sp-serial").value = normSerial($("#sp-q").value || ""); draw(); return; }
    const it = e.target.closest("[data-sptool]"); if (it) { pick = { id: it.dataset.sptool }; draw(); }
  });
  $("#sp-q").addEventListener("input", draw);
  $("#sp-ro")?.addEventListener("change", e => { $("#sp-ronew").style.display = e.target.value === "__new" ? "" : "none"; if (e.target.value === "__new") $("#sp-ronew").focus(); });
  $("#sp-ok").onclick = () => {
    const err = $("#sp-err");
    const ro = normRO($("#sp-ro") && $("#sp-ro").value !== "__new" ? $("#sp-ro").value : $("#sp-ronew").value);
    if (!ro) { err.textContent = "Indiquez le numéro de RO."; $("#sp-ronew").style.display = ""; $("#sp-ronew").focus(); return; }
    const L = EDIT.lines[i];
    if (mode === "known") {
      if (!pick?.id) { err.textContent = "Choisissez un outil dans la liste, ou créez-en un nouveau."; return; }
      const t = S.tools.find(x => x.id === pick.id);
      Object.assign(L, { toolId: t.id, detail: toolDetail(t), ro }); delete L.newTool;
      if (L.productId === CAL_GENERIC && +t.calPrice) L.price = +t.calPrice;
    } else {
      const serial = normSerial($("#sp-serial").value), name = $("#sp-name").value.trim();
      if (!serial || !name) { err.textContent = "Le n° de série et la désignation sont obligatoires."; return; }
      const ex = toolBySerial(serial);
      if (ex) { Object.assign(L, { toolId: ex.id, detail: toolDetail(ex), ro }); delete L.newTool; toast(`${serial} existe déjà : outil connu utilisé`); }
      else { L.newTool = { serial, name, pn: $("#sp-pn").value.trim().toUpperCase(), brand: $("#sp-brand").value.trim(), category: $("#sp-cat").value.trim() }; delete L.toolId; L.detail = toolDetail(L.newTool); }
    }
    L.qty = L.qty || 1; L.ro = ro;
    placeUnderRO(i, ro);
    sp.remove(); drawLines();
  };
  draw(); setTimeout(() => (mode === "known" ? $("#sp-q") : $("#sp-serial")).focus(), 30);
}
/* à l'enregistrement : crée les nouveaux outils et renvoie la liste {toolId, ro} */
async function linkCalTools(D) {
  const out = [];
  for (const l of D.lines) {
    if (!isCalLine(l)) continue;
    if (l.newTool && !l.toolId) {
      const n = l.newTool, ex = toolBySerial(n.serial);
      l.toolId = ex ? ex.id : await save("tools", "t-" + safeId(n.serial), { serial: n.serial, name: n.name, pn: n.pn || "", brand: n.brand || "", model: "", category: n.category || "", clientId: D.clientId, intervalMonths: 12, calPrice: +l.price || 0, status: "client", job: {}, nextDue: "", photos: [], certs: [], history: [], shipments: [], createdAt: today() });
      delete l.newTool;
    }
    if (l.toolId) out.push({ toolId: l.toolId, ro: l.ro || "" });
  }
  return out;
}
async function stampToolsSO(list, docId, D) {
  for (const { toolId, ro } of list) {
    const t = await waitFind("tools", toolId); if (!t) continue;
    const inShop = t.status && !["client", "dropped", "done"].includes(t.status);
    const job = inShop ? Object.assign({}, t.job || {}) : { receivedDate: today(), movedAt: today() };
    Object.assign(job, { so: D.number, soId: docId, ro });
    if (!inShop && t.defaultLabId) job.labId = t.defaultLabId;
    await patch("tools", t.id, { status: inShop ? t.status : "recu", job });
  }
}
