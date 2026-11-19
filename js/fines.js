"use strict";
/* ======================= AMENDES =======================
   Une amende suit : réception → (déclaration du conducteur) → paiement (par W.A.Y.S. ou par l'auteur) →
   preuve de paiement (si payée par l'auteur) ou remboursement (si payée par W.A.Y.S. et à charge du chauffeur) → réglée.
   Paiement et remboursement peuvent être reliés à des mouvements bancaires (bankTx.matches, coll « fines » :
   montant négatif = notre paiement, positif = remboursement reçu). Les rappels / majorations reçus de l'émetteur
   sont gardés dans « steps » (le dernier donne le montant, l'échéance et la communication en cours). */
const FINE_TYPES = { vitesse: "Excès de vitesse", stationnement: "Stationnement", feu: "Feu rouge", gsm: "GSM au volant", ceinture: "Ceinture", lez: "Zone basse émission (LEZ)", peage: "Péage / Viapass", autre: "Autre infraction" };
const FINE_AUTH = { police: ["Police", "blue"], communal: ["Communal", "orange"], autre: ["Autre", "grey"] };
const FINE_BEARER = { societe: "W.A.Y.S. (pas de refacturation)", chauffeur: "Le chauffeur / sa société (remboursement)", aucun: "Personne (classée / annulée)" };
const FINE_PAIDBY = { "": "Pas encore payée", societe: "Payée par W.A.Y.S.", auteur: "Payée par l'auteur de l'infraction" };
const FINE_ST = { contestee: ["Contestée", "info", "blue"], a_designer: ["Conducteur à déclarer", "bad", "red"], a_payer: ["À payer", "warn", "yellow"],
  preuve: ["Preuve de paiement attendue", "violet", "violet"], a_rembourser: ["Remboursement attendu", "orange", "orange"], reglee: ["Réglée", "good", "green"] };
const r2f = v => Math.round((+v || 0) * 100) / 100;
const needDesig = f => f.designRequired != null ? !!f.designRequired : f.authority === "police";
const finePaidBy = f => f.paidBy === "chauffeur" ? "auteur" : (f.paidBy || "");
const fineLast = f => (f.steps || []).length ? f.steps[f.steps.length - 1] : null;
const fineAmt = f => { const l = fineLast(f); return r2f(l && +l.amount ? l.amount : f.amount); };
const fineDue = f => { const l = fineLast(f); return (l && l.due) || f.payDue || addDays(f.receivedDate || f.date || today(), 30); };
const fineRef = f => { const l = fineLast(f); return (l && l.ref) || f.payRef || ""; };
/* mouvements bancaires reliés : sorties (notre paiement) et entrées (remboursement) */
function fineTx(f) {
  const pay = [], ref = [];
  for (const t of S.bankTx || []) for (const x of (typeof txMatches === "function" ? txMatches(t) : [])) if (x.coll === "fines" && x.docId === f.id) (+x.amount < 0 ? pay : ref).push({ t, amount: Math.abs(+x.amount || 0) });
  return { pay, ref, paid: r2f(pay.reduce((a, x) => a + x.amount, 0)), refunded: r2f(ref.reduce((a, x) => a + x.amount, 0)) };
}
const fineRefundAmt = f => r2f(f.refundAmount != null && f.refundAmount !== "" ? f.refundAmount : fineAmt(f));
const fineIsPaid = f => { const by = finePaidBy(f); return by === "auteur" ? !!(f.proofDate || (f.proofFiles || []).length || f.paidDate) : !!(f.paidDate || fineTx(f).pay.length); };
const fineHasProof = f => !!(f.proofDate || (f.proofFiles || []).length || (f.paidBy === "chauffeur" && f.paidDate));   // ancien « payée par le chauffeur » + date = réglée
const fineRefunded = f => !!f.refundDate || fineTx(f).refunded >= fineRefundAmt(f) - 0.01;
const fineRefundLeft = f => f.refundDate ? 0 : Math.max(0, r2f(fineRefundAmt(f) - fineTx(f).refunded));
const fineStage = f => {
  if (f.cancelled) return "reglee";
  if (f.contested && !f.contestDone) return "contestee";
  if (needDesig(f) && !f.designatedDate) return "a_designer";
  if (f.bearer === "aucun") return "reglee";
  const by = finePaidBy(f);
  if (by === "auteur") return fineHasProof(f) ? "reglee" : "preuve";
  if (!fineIsPaid(f)) return "a_payer";
  if (f.bearer === "chauffeur" && !fineRefunded(f)) return "a_rembourser";
  return "reglee";
};
/* prochaine action datée (pour « À faire » et les rappels) */
function fineNext(f) {
  const st = fineStage(f), rec = f.receivedDate || f.date;
  if (st === "a_designer") return { date: f.designDue || addDays(rec, 15), label: "déclarer le conducteur" };
  if (st === "a_payer") return { date: fineDue(f), label: "payer " + (fineAmt(f) ? eur(fineAmt(f)) : "l'amende") };
  if (st === "preuve") return { date: fineDue(f), label: "preuve de paiement de l'auteur" };
  if (st === "a_rembourser") return { date: addDays(f.paidDate || (fineTx(f).pay[0]?.t.date) || rec, 30), label: "remboursement " + eur(fineRefundLeft(f)) };
  if (st === "contestee") return { date: f.contestDue || addDays(f.contestedDate || rec, 30), label: "suivre la contestation" };
  return null;
}
const fineActionCount = () => (S.fines || []).filter(f => { const n = fineNext(f); return n && n.date <= addDays(today(), 7); }).length;
/* à qui réclamer : la société du chauffeur (si choisie) ou le chauffeur */
const fineDebtor = f => f.billTo === "societe" && (f.company || "").trim() ? { kind: "societe", name: f.company.trim() } : { kind: "chauffeur", name: (f.driver || "").trim() || "Chauffeur inconnu" };
const fineLabel = f => f.pvNumber || `Amende du ${fmtDate(f.date)}`;
const ogmFmt = s => { const d = String(s || "").replace(/\D/g, ""); return d.length === 12 ? `+++${d.slice(0, 3)}/${d.slice(3, 7)}/${d.slice(7)}+++` : String(s || ""); };
const drvName = (f, cls = "") => f.driver ? `<span class="${f.driverManual ? "drv-man" : ""} ${cls}" ${f.driverManual ? `title="${esc(tr("Nom encodé à la main (pas dans la liste des chauffeurs)"))}"` : ""}>${esc(f.driver)}</span>` : `<span class="muted">—</span>`;

const fineF = () => UI.fineF || (UI.fineF = { st: [], auth: [], veh: [], driver: "", year: "", ctry: "" });
function fineMilestones(f) {
  const by = finePaidBy(f), tx = fineTx(f);
  const ms = [["Reçue", f.receivedDate || f.date]];
  if (needDesig(f)) ms.push(["Conducteur déclaré", f.designatedDate]);
  if (f.contested) ms.push(["Contestation", f.contestDone ? f.contestDoneDate || f.contestedDate : ""]);
  if (f.bearer !== "aucun") {
    if (by === "auteur") ms.push(["Preuve de paiement", f.proofDate || ((f.proofFiles || []).length ? "ok" : "")]);
    else ms.push(["Payée", f.paidDate || (tx.pay[0] && tx.pay[0].t.date)]);
    if (by !== "auteur" && f.bearer === "chauffeur") ms.push(["Remboursée", f.refundDate || (fineRefunded(f) && tx.ref[0] ? tx.ref[0].t.date : "")]);
  }
  return `<span class="msteps">${ms.map(([l, d]) => `<span class="mstep ${d ? "ok" : ""}" title="${esc(tr(l))}${d && d !== "ok" ? " · " + fmtDate(d) : ""}"></span>`).join("")}</span>`;
}
function fleetFines() {
  const f = fineF(), q = (UI.q || "").toLowerCase().trim(), all = (S.fines || []).slice();
  const years = [...new Set(all.map(x => (x.date || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const drivers = [...new Set(all.map(x => x.driver).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const match = (x, skip) => (skip === "s" || !f.st.length || f.st.includes(fineStage(x))) && (skip === "a" || !f.auth.length || f.auth.includes(x.authority))
    && (!f.veh.length || f.veh.includes(x.vehicleId)) && (!f.driver || x.driver === f.driver) && (!f.year || (x.date || "").startsWith(f.year))
    && (!f.ctry || (f.ctry === "etranger") === (x.country === "etranger"))
    && (!q || [x.pvNumber, x.driver, x.company, x.place, x.description, FINE_TYPES[x.type], x.authName, vehLabel(x.vehicleId), fineRef(x), x.countryName].join(" ").toLowerCase().includes(q));
  const rows = all.filter(x => match(x)).sort((a, b) => { const na = fineNext(a), nb = fineNext(b); return (na ? 0 : 1) - (nb ? 0 : 1) || (na?.date || "").localeCompare(nb?.date || "") || (b.date || "").localeCompare(a.date || ""); });
  const n = (skip, pred) => all.filter(x => match(x, skip) && pred(x)).length;
  const sumA = arr => arr.reduce((a, x) => a + fineAmt(x), 0);
  const yr = f.year || today().slice(0, 4), inYr = all.filter(x => (x.date || "").startsWith(yr));
  const owed = all.filter(x => fineStage(x) === "a_rembourser").reduce((a, x) => a + fineRefundLeft(x), 0);
  const proofs = all.filter(x => fineStage(x) === "preuve").length;
  const tiles = `<div class="tiles doc-tiles">${Object.entries(FINE_ST).map(([k, [l, , c]]) => `<button class="panel tile c-${c} ${f.st.includes(k) ? "sel" : ""}" data-a="fine-f" data-st="${k}"><div class="lbl">${l}</div><div class="val">${n("s", x => fineStage(x) === k)}</div></button>`).join("")}</div>`;
  const kpis = `<div class="row-sb wrap mb"><div class="muted small"><span>${yr} :</span> <span>${plural(inYr.length, "amende")}</span> · <span>${eur(sumA(inYr))} au total</span> · <span>${eur(sumA(inYr.filter(x => x.bearer === "societe" && fineIsPaid(x))))} à charge de W.A.Y.S.</span>${owed ? ` · <b>${eur(owed)}</b> <span>à récupérer</span>` : ""}${proofs ? ` · <b>${plural(proofs, "preuve")}</b> <span>de paiement attendue${proofs > 1 ? "s" : ""}</span>` : ""}</div>
    ${isOffice() && allowed("relances") ? `<button class="btn sm" data-a="go-fine-reminders">✉ Relances & états de compte</button>` : ""}</div>`;
  const filters = `<div class="panel pad stack todo-filters">
    <div class="frow"><span class="flabel">Rechercher</span><input type="search" id="q" class="fsearch" placeholder="N° de PV, chauffeur, société, communication, plaque…" value="${esc(UI.q)}" aria-label="Rechercher une amende"><span>${readOnly ? "" : `<button class="btn primary sm" data-a="fine-form">+ Encoder une amende</button>`}</span></div>
    <div class="frow"><span class="flabel">Émetteur</span><div class="fpills">${Object.entries(FINE_AUTH).map(([k, [l, c]]) => `<button class="fpill c-${c} ${f.auth.includes(k) ? "on" : ""}" data-a="fine-f" data-auth="${k}">${l}<span class="n">${n("a", x => x.authority === k)}</span></button>`).join("")}
      <button class="fpill ${f.ctry === "be" ? "on" : ""}" data-a="fine-f" data-ctry="be">🇧🇪 Belgique</button><button class="fpill ${f.ctry === "etranger" ? "on" : ""}" data-a="fine-f" data-ctry="etranger">🌍 Étranger<span class="n">${all.filter(x => x.country === "etranger").length}</span></button>
      <select class="fsel" id="fine-driver" aria-label="Chauffeur"><option value="">Tous les chauffeurs</option>${drivers.map(d => `<option ${d === f.driver ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
      <select class="fsel" id="fine-year" aria-label="Année"><option value="">Toutes les années</option>${years.map(y => `<option ${y === f.year ? "selected" : ""}>${y}</option>`).join("")}</select></div><span></span></div>
    <div class="frow"><span class="flabel">Véhicule</span>${vehPicker(f.veh, "fine-f", id => all.filter(x => x.vehicleId === id).length)}
      ${f.st.length || f.auth.length || f.veh.length || f.driver || f.year || f.ctry || UI.q ? `<button class="linkbtn" data-a="fine-f" data-reset="1">Effacer les filtres</button>` : "<span></span>"}</div></div>`;
  const body = rows.length ? `<div class="panel"><div class="row-sb pad"><h3 class="np">${plural(rows.length, "amende")}${rows.length !== all.length ? ` sur ${all.length}` : ""}</h3><span class="muted small">${eur(sumA(rows))}</span></div>
    <div class="tablewrap"><table class="fines"><thead><tr><th>Date</th><th>Véhicule · chauffeur</th><th>Infraction</th><th>PV · émetteur</th><th>Communication</th><th class="r">Montant</th><th>Étapes</th><th>Prochaine action</th></tr></thead><tbody>
    ${rows.map(x => { const st = fineStage(x), nx = fineNext(x), v = veh(x.vehicleId), by = finePaidBy(x), ns = (x.steps || []).length; return `<tr class="click fine-row c-${FINE_ST[st][2]}" data-a="fine-form" data-id="${x.id}">
      <td class="num nowrap">${fmtDate(x.date)}</td>
      <td><div class="nowrap">${v ? `${noBadge(v, 1)} <span class="plate sm">${esc(v.plate)}</span>` : `<span class="muted">—</span>`}</div><div class="small">${drvName(x)}${x.company ? ` <span class="muted">· ${esc(x.company)}</span>` : ""}</div></td>
      <td class="small"><b>${esc(FINE_TYPES[x.type] || x.type || "—")}</b>${x.place ? `<div class="muted">${esc(x.place)}</div>` : ""}</td>
      <td class="small"><div class="mono nowrap">${esc(x.pvNumber || "—")}</div><span class="chip ${({ blue: "info", orange: "orange", grey: "" })[FINE_AUTH[x.authority]?.[1]] ?? ""}">${esc(FINE_AUTH[x.authority]?.[0] || "—")}</span>${x.country === "etranger" ? ` <span class="chip" title="${esc(tr("Enregistrée à l'étranger"))}">🌍 ${esc(x.countryName || tr("Étranger"))}</span>` : ""}${x.authName ? ` <span class="muted">${esc(x.authName)}</span>` : ""}</td>
      <td class="small mono">${fineRef(x) ? esc(ogmFmt(fineRef(x))) : "—"}</td>
      <td class="num r nowrap">${fineAmt(x) ? eur(fineAmt(x)) : "—"}${ns ? `<div class="muted small" title="${esc(tr("Rappels / majorations reçus"))}">${plural(ns, "rappel")}</div>` : ""}</td><td>${fineMilestones(x)}<div class="muted small">${FINE_ST[st][0]}${by === "auteur" ? " · par l'auteur" : by === "societe" && fineIsPaid(x) ? " · par W.A.Y.S." : ""}</div></td>
      <td class="small">${nx ? `${dueChip(nx.date, 7)}<div>${esc(nx.label)}</div>` : `<span class="chip good">Réglée</span>`}</td></tr>`; }).join("")}</tbody></table></div></div>`
    : `<div class="panel empty">${all.length ? "Aucune amende ne correspond à ces filtres." : "Aucune amende encodée."}</div>`;
  return tiles + kpis + filters + body;
}
ACTIONS["fine-f"] = el => {
  const f = fineF(), d = el.dataset, tog = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  if (d.reset) { Object.assign(f, { st: [], auth: [], veh: [], driver: "", year: "", ctry: "" }); UI.q = ""; }
  else if (d.st) f.st = tog(f.st, d.st); else if (d.auth) f.auth = tog(f.auth, d.auth); else if (d.veh) f.veh = tog(f.veh, d.veh); else if (d.ctry) f.ctry = f.ctry === d.ctry ? "" : d.ctry;
  UI.focusQ = false; render(true);
};
ACTIONS["go-fine-reminders"] = () => { UI.tab.relances = "ramendes"; location.hash = "#relances"; };
document.addEventListener("change", e => { if (e.target.id === "fine-driver") { fineF().driver = e.target.value; UI.focusQ = false; render(true); } if (e.target.id === "fine-year") { fineF().year = e.target.value; UI.focusQ = false; render(true); } });

/* liste des chauffeurs proposés (fiches actives + liste des paramètres) */
function fineDriverList(cur) {
  const recs = (S.drivers || []).filter(d => !d.wfGone).map(d => d.name);
  const names = [...new Set([...(settings().drivers || []), ...recs].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (cur && !names.some(n => nk(n) === nk(cur))) names.unshift(cur);
  return names;
}
function fineCompanies() { return [...new Set([...(S.fines || []).map(f => f.company), ...(S.drivers || []).map(d => d.company), ...S.clients.map(c => c.name)].filter(Boolean).map(s => s.trim()))].sort((a, b) => a.localeCompare(b)); }

ACTIONS["fine-form"] = el => {
  const x0 = (S.fines || []).find(f => f.id === el.dataset.id);
  const x = x0 ? JSON.parse(JSON.stringify(x0)) : { date: today(), receivedDate: today(), authority: "police", type: "vitesse", bearer: "chauffeur", country: "BE", steps: [], proofFiles: [] };
  const isNew = !x.id, office = isOffice(), by0 = finePaidBy(x) === "societe" && !x.paidDate && !(x.id && fineTx(x).pay.length) ? "" : finePaidBy(x);
  x.steps = x.steps || []; x.proofFiles = x.proofFiles || [];
  const vs = activeVehicles().concat(x.vehicleId && !isActiveVeh(x.vehicleId) && veh(x.vehicleId) ? [veh(x.vehicleId)] : []).sort((a, b) => (fleetNo(a) || a.plate).localeCompare(fleetNo(b) || b.plate));
  const dl = fineDriverList(x.driverManual ? "" : x.driver);
  const st0 = fineStage(x);
  const yn = (name, on, yes = "Oui", no = "Non") => `<span class="seg yn" role="radiogroup"><label><input type="radio" name="${name}" value="1" ${on ? "checked" : ""}><span>${yes}</span></label><label><input type="radio" name="${name}" value="0" ${on ? "" : "checked"}><span>${no}</span></label></span>`;
  const m = modal(`${mHead(isNew ? "Encoder une amende" : `Amende ${x.pvNumber ? `<span class="mono">${esc(x.pvNumber)}</span>` : ""} <span class="chip ${FINE_ST[st0][1]}">${FINE_ST[st0][0]}</span>`)}<form autocomplete="off"><div class="body">
    <div class="fields">
      ${field("fi-veh", "Véhicule", x.vehicleId, { type: "select", required: true, options: [["", "Choisir…"], ...vs.map(v => [v.id, `${fleetNo(v) ? fleetNo(v) + " · " : ""}${v.plate} · ${v.model}`])] })}
      <label class="f">Chauffeur<select id="fi-dsel"><option value="">—</option>${dl.map(d => `<option ${!x.driverManual && nk(d) === nk(x.driver || "") ? "selected" : ""}>${esc(d)}</option>`).join("")}<option value="__man" ${x.driverManual ? "selected" : ""}>Autre — entrée manuelle…</option></select></label>
      <label class="f" id="fi-dman-box">Nom du chauffeur (entrée manuelle)<input id="fi-dman" class="drv-man" value="${esc(x.driverManual ? x.driver || "" : "")}" placeholder="Si le chauffeur n'est pas dans la liste"></label>
      <label class="f">Société du chauffeur<input id="fi-company" list="fi-comps" value="${esc(x.company || "")}" placeholder="Employeur, sous-traitant…"><datalist id="fi-comps">${fineCompanies().map(c => `<option value="${esc(c)}">`).join("")}</datalist></label>
      ${field("fi-date", "Date de l'infraction", x.date, { type: "date", required: true })}${field("fi-time", "Heure", x.time, { type: "time" })}
      ${field("fi-type", "Infraction", x.type, { type: "select", options: Object.entries(FINE_TYPES) })}${field("fi-place", "Lieu", x.place, { ph: "E40 Liège → Bruxelles, km 23" })}
      ${field("fi-pv", "N° de PV / référence", x.pvNumber, { cls: "mono" })}${field("fi-auth", "Émetteur", x.authority, { type: "select", options: Object.entries(FINE_AUTH).map(([k, v]) => [k, v[0]]) })}
      ${field("fi-authname", "Service émetteur", x.authName, { ph: "Zone de police, commune de…, Viapass…" })}
      <label class="f">Enregistrée<select id="fi-ctry"><option value="BE" ${x.country !== "etranger" ? "selected" : ""}>🇧🇪 En Belgique</option><option value="etranger" ${x.country === "etranger" ? "selected" : ""}>🌍 À l'étranger</option></select></label>
      <label class="f" id="fi-cname-box">Pays<input id="fi-cname" value="${esc(x.countryName || "")}" placeholder="France, Pays-Bas, Allemagne…"></label>
      ${field("fi-amount", "Montant initial (€)", x.amount, { type: "number", step: "0.01", min: 0 })}
      ${field("fi-ref", "Communication de paiement", x.payRef, { cls: "mono", ph: "+++123/4567/89012+++" })}${field("fi-iban", "Compte du bénéficiaire (IBAN)", x.payIban, { cls: "mono" })}
      ${field("fi-desc", "Détails (vitesse relevée…)", x.description, { type: "textarea", wide: true })}</div>
    <div id="fi-paybox" class="fine-paybox"></div>
    <h3>Rappels et majorations reçus</h3>
    <div id="fi-steps"></div>
    <h3>Suivi</h3>
    <div class="fine-steps">
      <div class="fstep"><b>1. Réception</b>${field("fi-rec", "Reçue le", x.receivedDate || x.date, { type: "date" })}</div>
      <div class="fstep"><b>2. Déclaration du conducteur</b>
        <div class="row-g wrap"><span class="small">Chauffeur à déclarer ?</span>${yn("fi-dreq", needDesig(x))}</div>
        <div id="fi-dbox" class="stack-s"><div class="row-g wrap"><span class="small">Déclaration faite ?</span>${yn("fi-ddone", !!x.designatedDate)}</div>
        <div class="row-g wrap">${field("fi-ddue", "À faire avant le", x.designDue || addDays(x.receivedDate || x.date || today(), 15), { type: "date" })}<span id="fi-dok-box">${field("fi-dok", "Déclarée le", x.designatedDate || today(), { type: "date" })}</span></div></div></div>
      <div class="fstep"><b>3. Paiement</b>
        <div class="row-g wrap">${field("fi-paidby", "Payée ?", by0, { type: "select", options: Object.entries(FINE_PAIDBY) })}${field("fi-pdue", "À payer avant le", x.payDue || addDays(x.receivedDate || x.date || today(), 30), { type: "date" })}<span id="fi-paid-box">${field("fi-paid", "Payée le", x.paidDate, { type: "date" })}</span></div>
        <div id="fi-paylinks"></div>
        <div id="fi-proof" class="stack-s"><div class="small"><b>Preuve de paiement de l'auteur</b> <span class="muted">· pièce jointe (photo, extrait de compte) ou date de réception</span></div>
          <div id="fi-pfiles"></div><div class="row-g wrap">${office && !readOnly ? `<label class="btn sm">📎 Joindre une preuve<input type="file" id="fi-pup" multiple hidden accept="image/*,application/pdf"></label>` : ""}${field("fi-pdate", "Preuve reçue le", x.proofDate, { type: "date" })}</div></div></div>
      <div class="fstep"><b>4. À charge de</b>${field("fi-bearer", "Coût final supporté par", x.bearer || "chauffeur", { type: "select", options: Object.entries(FINE_BEARER) })}
        <div id="fi-billto" class="row-g wrap small">Réclamer à : <label><input type="radio" name="fi-billto" value="chauffeur" ${x.billTo !== "societe" ? "checked" : ""}> le chauffeur</label> <label><input type="radio" name="fi-billto" value="societe" ${x.billTo === "societe" ? "checked" : ""}> sa société</label></div>
        <div class="row-g wrap" id="fi-refund">${field("fi-ramount", "Montant à rembourser (€)", x.refundAmount ?? "", { type: "number", step: "0.01", min: 0, ph: "montant de l'amende" })}${field("fi-rdate", "Remboursée le", x.refundDate, { type: "date" })}
        ${field("fi-rhow", "Mode", x.refundHow || "virement", { type: "select", options: [["virement", "Virement"], ["retenue", "Retenue sur salaire / facture"], ["liquide", "En liquide"]] })}</div>
        <div id="fi-reflinks"></div></div>
      <div class="fstep"><b>Contestation (facultatif)</b>${`<label class="chk"><input type="checkbox" id="fi-contest" ${x.contested ? "checked" : ""}> Amende contestée</label>`}
        <div class="row-g wrap">${field("fi-cdate", "Contestée le", x.contestedDate, { type: "date" })}${field("fi-cdue", "Suivi prévu le", x.contestDue, { type: "date" })}${field("fi-cend", "Clôturée le", x.contestDoneDate, { type: "date" })}</div>
        <label class="chk"><input type="checkbox" id="fi-cancel" ${x.cancelled ? "checked" : ""}> Amende annulée / classée sans suite</label></div>
    </div>
    ${(x.reminders || []).length ? `<div class="small muted">Relances envoyées : ${x.reminders.map(r => `${fmtDate(r.date)} (${esc(r.kind === "etat" ? "état de compte" : "rappel")})`).join(" · ")}</div>` : ""}
    ${field("fi-note", "Notes de suivi", x.note, { type: "textarea", wide: true })}<div class="err" id="fi-err"></div></div>
    <footer>${isNew || readOnly ? "" : `<div class="left"><button type="button" class="btn danger" data-a="fine-del" data-id="${x.id}">Supprimer</button></div>`}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "lg");
  const $m = s => m.querySelector(s), radio = n => (m.querySelector(`input[name="${n}"]:checked`) || {}).value;
  /* communication et compte à utiliser (dernier rappel prioritaire) */
  const drawPay = () => {
    const tmp = Object.assign({}, x, { payRef: val("fi-ref"), amount: +val("fi-amount") || 0, payDue: val("fi-pdue") }), ref = fineRef(tmp), amt = fineAmt(tmp), iban = (fineLast(tmp)?.iban) || val("fi-iban");
    $m("#fi-paybox").innerHTML = ref || amt ? `<div class="fine-pay"><div><div class="muted small">À payer${x.steps.length ? " (dernier rappel)" : ""}</div><b class="num" style="font-size:17px">${amt ? eur(amt) : "—"}</b> <span class="muted small">avant le ${fmtDate(fineDue(tmp))}</span></div>
      ${ref ? `<div><div class="muted small">Communication</div><span class="ogm" title="${esc(tr("Cliquer pour copier"))}" data-copy="${esc(String(ref).replace(/\D/g, "").length === 12 ? String(ref).replace(/\D/g, "") : ref)}">${esc(ogmFmt(ref))}</span></div>` : ""}
      ${iban ? `<div><div class="muted small">Compte</div><span class="mono" data-copy="${esc(iban.replace(/\s/g, ""))}">${esc(typeof ibanFmt === "function" ? ibanFmt(iban) : iban)}</span></div>` : ""}</div>` : "";
  };
  const drawSteps = () => {
    $m("#fi-steps").innerHTML = `${x.steps.length ? `<table class="mini"><thead><tr><th>Reçu le</th><th>Type</th><th class="r">Nouveau montant</th><th>Échéance</th><th>Communication</th><th></th></tr></thead><tbody>${x.steps.map((s, i) => `<tr>
      <td><input type="date" data-st="${i}" data-k="date" value="${esc(s.date || "")}"></td><td><input data-st="${i}" data-k="label" value="${esc(s.label || "")}" placeholder="Rappel, ordre exécutoire…"></td>
      <td class="r"><input type="number" step="0.01" data-st="${i}" data-k="amount" value="${esc(s.amount ?? "")}" style="width:100px"></td><td><input type="date" data-st="${i}" data-k="due" value="${esc(s.due || "")}"></td>
      <td><input class="mono" data-st="${i}" data-k="ref" value="${esc(s.ref || "")}" placeholder="si nouvelle"></td><td><button type="button" class="x" data-stdel="${i}" aria-label="Retirer">×</button></td></tr>`).join("")}</tbody></table>` : `<div class="muted small">Aucun rappel. Ajoutez-en un quand l'émetteur envoie un rappel ou une majoration (nouveau montant, nouvelle échéance, parfois nouvelle communication).</div>`}
      ${readOnly ? "" : `<button type="button" class="btn sm" id="fi-stadd">+ Rappel / majoration reçu</button>`}`;
    const add = $m("#fi-stadd"); if (add) add.onclick = () => { const l = fineLast(x); x.steps.push({ date: today(), label: x.steps.length ? (x.steps.length === 1 ? "2e rappel" : "Ordre exécutoire") : "Rappel", amount: l ? l.amount : +val("fi-amount") || "", due: addDays(today(), 15), ref: "" }); drawSteps(); drawPay(); };
  };
  $m("#fi-steps").addEventListener("input", e => { const i = e.target.dataset.st; if (i == null) return; const k = e.target.dataset.k; x.steps[+i][k] = k === "amount" ? (e.target.value === "" ? "" : +e.target.value) : e.target.value; drawPay(); });
  $m("#fi-steps").addEventListener("click", e => { const b = e.target.closest("[data-stdel]"); if (b) { x.steps.splice(+b.dataset.stdel, 1); drawSteps(); drawPay(); } });
  const drawFiles = () => { $m("#fi-pfiles").innerHTML = x.proofFiles.length ? `<div class="n-files">${x.proofFiles.map((f, i) => `<span class="n-file">${(f.mime || "").startsWith("image/") ? `<img src="${esc(blobUrl(f.id))}" alt="">` : "📎"} <a href="${esc(blobUrl(f.id))}" target="_blank" rel="noopener">${esc(f.name)}</a>${readOnly ? "" : ` <button type="button" class="x" data-pfdel="${i}" aria-label="Retirer">×</button>`}</span>`).join("")}</div>` : ""; };
  $m("#fi-pfiles").addEventListener("click", e => { const b = e.target.closest("[data-pfdel]"); if (b) { x.proofFiles.splice(+b.dataset.pfdel, 1); drawFiles(); } });
  const up = $m("#fi-pup");
  if (up) up.onchange = async () => {
    if (!assets) { toast("L'ajout de fichiers n'est pas disponible ici."); return; }
    for (const f of [...up.files]) {
      if (f.size > 25 * 1048576) { toast(`« ${f.name} » dépasse 25 Mo`); continue; }
      try { const r = await assets.upload(f, f.type ? undefined : { type: "application/octet-stream" }); x.proofFiles.push({ id: r.id, name: f.name, mime: f.type || "application/octet-stream", size: f.size }); if (!val("fi-pdate")) $m("#fi-pdate").value = today(); drawFiles(); }
      catch { toast(`« ${f.name} » n'a pas pu être envoyé.`); }
    }
    up.value = "";
  };
  /* liens bancaires (seulement pour une amende déjà enregistrée) */
  const drawLinks = () => {
    const tx = x.id ? fineTx(x) : { pay: [], ref: [] }, can = office && !readOnly, hasTx = (S.bankTx || []).length;
    const lst = arr => arr.map(o => `<div class="small">🔗 ${typeof txLink === "function" ? txLink(o.t) : fmtDate(o.t.date)} <span class="muted">· ${eur(o.amount)} ${esc(o.t.counterpart || "")}</span></div>`).join("");
    const btn = (dir, l) => can ? (hasTx ? `<button type="button" class="btn sm" data-a="pay-link" data-coll="fines" data-dir="${dir}" data-id="${x.id || ""}">🔗 ${esc(tr(l))}</button>` : `<span class="muted small">${esc(tr("Aucun mouvement bancaire dans l'ERP (Banque → Ponto) : rien à relier pour l'instant."))}</span>`) : "";
    const auteur = val("fi-paidby") === "auteur";
    $m("#fi-paylinks").innerHTML = `${lst(tx.pay)}<div class="row-g wrap">${btn("pay", auteur ? "Relier un mouvement sortant (si W.A.Y.S. a payé)" : "Relier notre paiement (mouvement sortant)")}</div>`;
    $m("#fi-reflinks").innerHTML = `${lst(tx.ref)}<div class="row-g wrap">${btn("refund", "Relier le remboursement reçu (mouvement entrant)")}</div>`;
  };
  const sync = () => {
    const by = val("fi-paidby"), bearer = val("fi-bearer"), dreq = radio("fi-dreq") === "1", ddone = radio("fi-ddone") === "1";
    /* (l'attribut hidden ne suffit pas sur les champs .f : affichage géré en style) */
    $m("#fi-dman-box").style.display = ["", "__man"].includes(val("fi-dsel")) ? "" : "none";
    $m("#fi-cname-box").style.display = val("fi-ctry") === "etranger" ? "" : "none";
    $m("#fi-dbox").style.display = dreq ? "" : "none"; $m("#fi-dok-box").style.display = ddone ? "" : "none";
    $m("#fi-paid-box").style.display = by === "societe" ? "" : "none";
    $m("#fi-proof").style.display = by === "auteur" ? "" : "none";
    const refund = bearer === "chauffeur";
    $m("#fi-refund").style.display = refund && by !== "auteur" ? "" : "none"; $m("#fi-reflinks").style.display = refund ? "" : "none";
    $m("#fi-billto").style.display = bearer === "chauffeur" ? "" : "none";
    drawLinks();
  };
  m.addEventListener("change", e => { if (["fi-paidby", "fi-bearer", "fi-dsel", "fi-ctry"].includes(e.target.id) || ["fi-dreq", "fi-ddone"].includes(e.target.name)) sync(); if (["fi-ref", "fi-amount", "fi-iban", "fi-pdue"].includes(e.target.id)) drawPay(); });
  m.addEventListener("input", e => { if (["fi-ref", "fi-amount", "fi-iban"].includes(e.target.id)) drawPay(); });
  m.addEventListener("click", e => { const c = e.target.closest("[data-copy]"); if (c) { try { navigator.clipboard.writeText(c.dataset.copy); toast("Copié : " + c.dataset.copy); } catch { } } });
  $m("#fi-paidby").addEventListener("change", e => { if (e.target.value === "auteur" && val("fi-bearer") === "societe") $m("#fi-bearer").value = "chauffeur"; if (e.target.value === "societe" && !val("fi-paid")) $m("#fi-paid").value = today(); sync(); });
  $m("#fi-auth").onchange = e => { const on = e.target.value === "police"; m.querySelector(`input[name="fi-dreq"][value="${on ? 1 : 0}"]`).checked = true; sync(); };
  $m("#fi-rec").onchange = e => { if (isNew) { $m("#fi-ddue").value = addDays(e.target.value, 15); $m("#fi-pdue").value = addDays(e.target.value, 30); } };
  $m("#fi-veh").onchange = e => { const v = veh(e.target.value); const ld = v && lastDrv(v); if (ld && !val("fi-dsel")) { const o = [...$m("#fi-dsel").options].find(o => nk(o.value) === nk(ld.name)); if (o) { $m("#fi-dsel").value = o.value; $m("#fi-dsel").dispatchEvent(new Event("change", { bubbles: true })); } } };
  $m("#fi-dsel").addEventListener("change", e => { const r = typeof drvRec === "function" && drvRec(e.target.value); if (r && r.company && !val("fi-company")) $m("#fi-company").value = r.company; });
  drawPay(); drawSteps(); drawFiles(); sync();
  /* « Relier… » : enregistre d'abord la fiche, puis ouvre la recherche du mouvement */
  m.addEventListener("click", async e => { const b = e.target.closest('[data-a="pay-link"]'); if (!b) return; e.stopPropagation(); e.preventDefault();
    if (!(await store(false))) return;
    for (let k = 0; k < 20 && !(S.fines || []).some(f => f.id === x.id); k++) await new Promise(r => setTimeout(r, 100));   // nouvelle amende : attendre qu'elle soit dans la liste
    b.dataset.id = x.id; ACTIONS["pay-link"](b); }, true);
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); if (await store(true)) toast("Amende enregistrée"); };
  async function store(close) {
    if (!val("fi-veh")) { $m("#fi-err").textContent = "Choisissez le véhicule."; return false; }
    /* chauffeur de la liste, sinon le nom tapé à la main */
    const man = ["", "__man"].includes(val("fi-dsel")), drv = (man ? val("fi-dman") : val("fi-dsel")).trim();
    if (val("fi-dsel") === "__man" && !drv) { $m("#fi-err").textContent = "Entrez le nom du chauffeur, ou choisissez-le dans la liste."; return false; }
    const cl = $m("#fi-contest").checked, by = val("fi-paidby"), dreq = radio("fi-dreq") === "1", ddone = dreq && radio("fi-ddone") === "1";
    const data = Object.assign(strip(x), {
      vehicleId: val("fi-veh"), driver: drv, driverManual: man && !!drv, driverId: (!man && typeof drvRec === "function" && drvRec(drv)?.id) || null, company: val("fi-company").trim(),
      date: val("fi-date"), time: val("fi-time"), type: val("fi-type"), place: val("fi-place"), pvNumber: val("fi-pv").trim(),
      authority: val("fi-auth"), authName: val("fi-authname"), country: val("fi-ctry"), countryName: val("fi-ctry") === "etranger" ? val("fi-cname").trim() : "",
      amount: +val("fi-amount") || 0, payRef: val("fi-ref").trim(), payIban: val("fi-iban").replace(/\s/g, "").toUpperCase(), description: val("fi-desc"),
      steps: x.steps.filter(s => s.date || s.amount || s.due || s.ref), receivedDate: val("fi-rec") || val("fi-date"),
      designRequired: dreq, designDue: val("fi-ddue"), designatedDate: ddone ? val("fi-dok") || today() : "",
      paidBy: by, payDue: val("fi-pdue"), paidDate: by === "societe" ? val("fi-paid") : "", proofFiles: x.proofFiles, proofDate: by === "auteur" ? val("fi-pdate") : "",
      bearer: val("fi-bearer"), billTo: radio("fi-billto") || "chauffeur", refundAmount: val("fi-ramount") === "" ? null : +val("fi-ramount"), refundDate: val("fi-rdate"), refundHow: val("fi-rhow"),
      contested: cl, contestedDate: cl ? val("fi-cdate") || today() : "", contestDue: cl ? val("fi-cdue") : "", contestDoneDate: cl ? val("fi-cend") : "", contestDone: cl && !!val("fi-cend"),
      cancelled: $m("#fi-cancel").checked, note: val("fi-note")
    });
    x.id = await save("fines", x.id, data); if (close) closeModal(); return true;
  }
};
ACTIONS["fine-del"] = el => {
  const f = (S.fines || []).find(x => x.id === el.dataset.id), tx = f ? fineTx(f) : { pay: [], ref: [] };
  confirmBox(`Supprimer cette amende ?${tx.pay.length + tx.ref.length ? ` Les liens vers ${plural(tx.pay.length + tx.ref.length, "mouvement bancaire", "mouvements bancaires")} seront retirés.` : ""}`, async () => {
    for (const o of [...tx.pay, ...tx.ref]) { const rest = txMatches(o.t).filter(m => !(m.coll === "fines" && m.docId === f.id)); await patch("bankTx", o.t.id, rest.length ? { matches: rest } : { matches: null, match: null }); }
    await remove("fines", el.dataset.id);
  });
};

/* page Amendes autonome (menu Achats - Dépenses) : même contenu que l'onglet Flotte → Amendes */
VIEWS.amendes = { title: "Amendes", render: () => head("Amendes", "Procès-verbaux reçus : paiement, déclaration du conducteur, preuves et remboursements", `<a class="btn" href="#achats">← Achats - Dépenses</a>`) + fleetFines() };
