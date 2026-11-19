"use strict";
/* ======================= TABLEAU DE BORD ======================= */
const section = (title, link, body, c = "blue") => `<section class="dsec c-${c}"><div class="row-sb"><h2><i class="sq"></i>${title}</h2>${link ? `<a href="#${link}" class="small">Ouvrir le module →</a>` : ""}</div>${body}</section>`;

function dashFinance() {
  const t = today(), ym = t.slice(0, 7), y = t.slice(0, 4), s = settings();
  const inv = issued().map(d => Object.assign({}, d, { T: signedTotals(d), st: invStatus(d) }));
  const sum = (a, f) => a.reduce((x, d) => x + f(d), 0);
  const open = inv.filter(d => d.st === "envoyee" || d.st === "retard" || d.st === "partiel"), late = inv.filter(d => d.st === "retard");
  const drafts = S.docs.filter(d => d.kind === "facture" && d.status === "brouillon");
  const caM = sum(inv.filter(d => (d.date || "").startsWith(ym)), d => d.T.ht), caY = sum(inv.filter(d => (d.date || "").startsWith(y)), d => d.T.ht);
  /* solde : comptes reliés via Ponto si disponibles, sinon saisie manuelle */
  const pAcc = (S.bankAccounts || []).filter(a => (a.currency || "EUR") === "EUR" && a.balance != null);
  const bank = pAcc.length ? pAcc.reduce((x, a) => x + a.balance, 0) : s.bankBalance;
  const pDate = pAcc.length ? pAcc.map(a => (a.balanceAt || a.updatedAt || "").slice(0, 10)).sort()[0] : "";
  const bankAge = pAcc.length ? (pDate ? daysBetween(pDate, t) : null) : s.bankDate ? daysBetween(s.bankDate, t) : null;
  const tiles = `<div class="tiles">
    <div class="panel tile c-orange ${late.length ? "alert" : ""}"><div class="lbl">Factures impayées</div><div class="val">${eur0(sum(open, dueOf))}</div><div class="note">${plural(open.length, "facture")} TVAC</div></div>
    <div class="panel tile c-red ${late.length ? "alert" : ""}"><div class="lbl">Dont en retard</div><div class="val ${late.length ? "txt-bad" : ""}">${eur0(sum(late, dueOf))}</div><div class="note">${late.length ? plural(late.length, "facture") + " à relancer" : "aucun retard"}</div></div>
    ${pAcc.length ? `<a class="panel tile c-green click" href="#banque"><div class="lbl">Solde des comptes</div><div class="val">${eur0(bank)}</div><div class="note">${pAcc.length} compte${pAcc.length > 1 ? "s" : ""} · via Ponto${pDate ? " · au " + fmtDate(pDate) : ""}</div></a>` : `<button class="panel tile c-green click" data-a="bank-edit"><div class="lbl">Solde du compte</div><div class="val">${bank == null ? "—" : eur0(bank)}</div><div class="note ${bankAge > 7 ? "txt-warn" : ""}">${bank == null ? "Cliquez pour saisir le solde" : `au ${fmtDate(s.bankDate)}${bankAge > 7 ? " · à mettre à jour" : ""}`}</div></button>`}
    <div class="panel tile c-blue"><div class="lbl">CA facturé · ${MONTHS[+ym.slice(5) - 1]}</div><div class="val">${eur0(caM)}</div><div class="note">HT · ${y} : ${eur0(caY)}</div></div>
    <a class="panel tile c-grey click" href="#factures"><div class="lbl">Brouillons à valider</div><div class="val">${drafts.length}</div><div class="note">${eur0(sum(drafts, d => totals(d).ttc))} TVAC (livraisons, étalonnages…)</div></a></div>`;
  const lateList = open.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5).map(d =>
    `<div class="list-row click" data-a="doc-open" data-id="${d.id}"><div><div>${esc(clientName(d.clientId))}</div><div class="muted mono small">${esc(d.number)} · échéance ${fmtDate(d.dueDate)}</div></div><div style="text-align:right"><div class="num">${eur(d.T.ttc)}</div>${chip(d.st)}</div></div>`).join("");
  return section("Finances", "factures", tiles + `<div class="grid2"><div class="panel"><h3>Chiffre d'affaires HT par mois</h3>
    <div class="legend"><span><i style="background:var(--series-1)"></i>Services & étalonnage</span><span><i style="background:var(--series-2)"></i>Gaz & produits</span></div>${caChart(inv)}</div>
    <div class="panel"><h3>Factures à encaisser</h3><div class="pt">${lateList || `<div class="empty">Tout est payé.</div>`}</div></div></div>`, "yellow");
}
ACTIONS["bank-edit"] = () => {
  if (readOnly) return;
  const s = settings();
  const m = modal(`${mHead("Solde du compte bancaire")}<form><div class="body"><div class="fields">${field("bk-v", "Solde (€)", s.bankBalance, { type: "number", step: "0.01", required: true, autofocus: true })}${field("bk-d", "Date du solde", today(), { type: "date" })}</div>
    <div class="hint">Relevé depuis votre banque en ligne. Une connexion bancaire automatique pourra être ajoutée plus tard.</div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`, "sm");
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); await saveSettings({ bankBalance: +val("bk-v"), bankDate: val("bk-d") }); closeModal(); toast("Solde enregistré"); };
};
function caChart(inv) {
  const now = new Date(today() + "T12:00:00"); now.setDate(1);
  const W = 640, H = 220, L = 50, B = 24, T = 10, R = 6, data = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(now); d.setMonth(d.getMonth() - i); const k = iso(d).slice(0, 7); const ds = inv.filter(x => x.date.startsWith(k)); data.push({ k, s: ds.reduce((a, x) => a + x.T.services, 0), p: ds.reduce((a, x) => a + x.T.produits, 0) }); }
  const maxV = Math.max(1, ...data.map(c => c.s + c.p)), step = niceStep(maxV / 4), top = Math.ceil(maxV / step) * step;
  const y = v => T + (H - T - B) * (1 - v / top), bw = (W - L - R) / 12, barW = Math.min(30, bw * .6);
  const id = "ca"; BARS[id] = [];
  let g = "";
  for (let v = 0; v <= top + 1e-6; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? fmtN.format(v / 1000) + " k€" : v + " €"}</text>`;
  data.forEach((c, i) => {
    const x = L + bw * i + (bw - barW) / 2, ys = y(c.s), yp = y(c.s + c.p);
    if (c.s > 0) g += c.p > 0 ? `<rect x="${x}" y="${ys}" width="${barW}" height="${y(0) - ys}" fill="var(--series-1)"/>` : roundTop(x, ys, barW, y(0) - ys, "var(--series-1)");
    if (c.p > 0) g += roundTop(x, yp, barW, Math.max(0, ys - yp - (c.s > 0 ? 2 : 0)), "var(--series-2)");
    const [yy, mm] = c.k.split("-");
    g += `<text x="${x + barW / 2}" y="${H - 6}" text-anchor="middle">${MONTHS[+mm - 1]}${mm === "01" ? " " + yy.slice(2) : ""}</text><rect data-bar="${id}:${i}" x="${L + bw * i}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>`;
    BARS[id].push({ html: `<b>${MONTHS[+mm - 1]} ${yy}</b><div><span>Services & étalonnage</span><span class="num">${eur0(c.s)}</span></div><div><span>Gaz & produits</span><span class="num">${eur0(c.p)}</span></div><div class="tt"><span>Total HT</span><b class="num">${eur0(c.s + c.p)}</b></div>` });
  });
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Chiffre d'affaires HT des 12 derniers mois">${g}</svg><div class="tip"></div></div>`;
}

function dashGas() {
  const n = st => S.bottles.filter(b => b.status === st).length;
  const gases = {};
  S.gasTypes.forEach(t => { const g = t.gas + (t.grade ? " " + t.grade : ""); gases[g] = gases[g] || []; gases[g].push(t.id); });
  const rows = Object.entries(gases).map(([g, ids]) => {
    const c = st => S.bottles.filter(b => ids.includes(b.typeId) && b.status === st).length;
    return { g, p: c("plein"), v: c("vide"), cl: c("client"), f: c("fournisseur"), low: ids.some(id => { const t = gType(id); return +t.minFull && S.bottles.filter(b => b.typeId === id && b.status === "plein").length < +t.minFull; }) };
  }).sort((a, b) => (b.p + b.v + b.cl + b.f) - (a.p + a.v + a.cl + a.f));
  const max = Math.max(1, ...rows.map(r => r.p + r.v + r.cl + r.f));
  const locs = settings().gasLocations || [];
  const bars = rows.map(r => {
    const seg = (v, cls, lbl) => v ? `<span class="seg-${cls}" style="width:${v / max * 100}%" title="${lbl} : ${v}"></span>` : "";
    return `<div class="hbar"><div class="row-sb"><b>${esc(r.g)}</b><span class="small muted num">${r.p} pleines · ${r.v} vides · ${r.cl} clients · ${r.f} fournisseur${r.low ? ` <span class="chip warn">stock bas</span>` : ""}</span></div>
      <div class="hbar-track">${seg(r.p, "p", "Pleines")}${seg(r.v, "v", "Vides")}${seg(r.cl, "c", "Chez clients")}${seg(r.f, "f", "Fournisseur")}</div></div>`;
  }).join("");
  const locTable = `<div class="tablewrap"><table class="compact"><thead><tr><th>Emplacement</th><th class="r">Pleines</th><th class="r">Vides</th></tr></thead><tbody>
    ${locs.map(l => `<tr><td>${esc(l.name)}</td><td class="r num"><b>${S.bottles.filter(b => b.locationId === l.id && b.status === "plein").length}</b></td><td class="r num">${S.bottles.filter(b => b.locationId === l.id && b.status === "vide").length}</td></tr>`).join("")}</tbody></table></div>`;
  return section("Stock de gaz", "gaz", `<div class="tiles">
    <div class="panel tile c-green"><div class="lbl">Pleines en stock</div><div class="val">${n("plein")}</div></div><div class="panel tile c-yellow"><div class="lbl">Vides en stock</div><div class="val">${n("vide")}</div></div>
    <div class="panel tile c-blue"><div class="lbl">Chez les clients</div><div class="val">${n("client")}</div></div><div class="panel tile c-grey"><div class="lbl">Chez ${esc(settings().supplierName)}</div><div class="val">${n("fournisseur")}</div></div></div>
    <div class="grid2"><div class="panel pad"><h3 class="np">Par type de gaz</h3><div class="legend np"><span><i class="seg-p"></i>Pleines</span><span><i class="seg-v"></i>Vides</span><span><i class="seg-c"></i>Chez clients</span><span><i class="seg-f"></i>Fournisseur</span></div>
    <div class="stack-s">${bars || `<div class="muted">Aucun type de bouteille.</div>`}</div></div>
    <div class="panel"><h3>Par emplacement</h3>${locTable}</div></div>`, "blue");
}
function dashFleet() {
  const st = activeVehicles().map(vehState);
  const c = cls => st.filter(s => s[1] === cls).length;
  const tasks = fleetTasks(45).slice(0, 6);
  return section("Flotte", "flotte", `<div class="tiles mini"><div class="panel tile c-green"><div class="lbl">Disponibles</div><div class="val txt-good">${c("good")}</div></div>
    <div class="panel tile c-yellow"><div class="lbl">Panne / atelier</div><div class="val ${c("warn") ? "txt-warn" : ""}">${c("warn")}</div></div><div class="panel tile c-red ${c("bad") ? "alert" : ""}"><div class="lbl">Immobilisés</div><div class="val ${c("bad") ? "txt-bad" : ""}">${c("bad")}</div></div></div>
    <div class="panel"><h3>À venir</h3><div class="pt">${tasks.map(taskRow).join("") || `<div class="empty">Rien dans les 45 prochains jours.</div>`}</div></div>
    <div class="panel"><h3>Derniers chauffeurs</h3><div class="pt">${activeVehicles().sort((a, b) => (b.driverDate || "").localeCompare(a.driverDate || "")).slice(0, 5).map(v => `<div class="list-row click" data-a="veh-open" data-id="${v.id}"><span><span class="plate sm">${esc(v.plate)}</span> ${esc(v.model)}</span><span class="small">${esc(v.driver || "—")} <span class="muted">${v.driverDate ? fmtDate(v.driverDate) : ""}</span></span></div>`).join("") || `<div class="empty">Aucun véhicule.</div>`}</div></div>`, "orange");
}
function dashCalib() {
  const n = st => S.tools.filter(t => colOf(t) === st).length;
  const due = toolsDue(30).sort((a, b) => a.nextDue.localeCompare(b.nextDue)).slice(0, 6);
  return section("Étalonnage", "etalonnage", `<div class="tiles mini"><div class="panel tile c-blue"><div class="lbl">NewTool · Picked</div><div class="val">${n("recu") + n("picked")}</div></div>
    <div class="panel tile c-yellow"><div class="lbl">Lab</div><div class="val">${n("labo")}</div></div><div class="panel tile c-green"><div class="lbl">Calibrated · à rendre</div><div class="val txt-good">${n("a_livrer")}</div></div>
    <div class="panel tile c-red ${toolsDue(0).length ? "alert" : ""}"><div class="lbl">Échéances dépassées</div><div class="val ${toolsDue(0).length ? "txt-bad" : ""}">${toolsDue(0).length}</div></div></div>
    <div class="panel"><h3>Échéances des 30 prochains jours</h3><div class="pt">${due.map(t => `<div class="list-row click" data-a="tool-open" data-id="${t.id}"><div><div>${esc(t.name)} <span class="mono small muted">${esc(t.serial)}</span></div><div class="muted small">${esc(clientName(t.clientId))}</div></div><div>${dueChip(t.nextDue)}</div></div>`).join("") || `<div class="empty">Aucune échéance proche.</div>`}</div></div>
    <div class="panel"><h3>Prêts à livrer</h3><div class="pt">${S.tools.filter(t => t.status === "a_livrer").slice(0, 5).map(t => `<div class="list-row click" data-a="tool-open" data-id="${t.id}"><span>${esc(t.name)} <span class="mono small muted">${esc(t.serial)}</span></span><span class="small">${esc(clientName(t.clientId))}</span></div>`).join("") || `<div class="empty">Aucun outil en attente de livraison.</div>`}</div></div>`, "green");
}

/* ======================= TABLEAU DE BORD À WIDGETS =======================
   Chaque utilisateur compose sa page : widgets ajoutés depuis un catalogue (par module), taille S / M / L,
   ordre par glisser-déposer. Disposition gardée dans userPrefs/p-<id utilisateur> (privée), ou dans le navigateur.
   Un widget n'est proposé que si le module correspondant est accessible au rôle. Pour ajouter un widget : WIDGETS.id = {…}. */
const WSIZE = { s: "Petit", m: "Moyen", l: "Large" };
const WIDGETS = {};
const W_DEFAULT = ["shortcuts", "fleet_state", "bank", "inv_due", "sales", "faults", "fleet_due", "ca", "gas_stock", "calib", "notes"];
const prefsId = () => "p-" + ((ME && (ME.key ? "key" : ME.id)) || "local");
const myPrefs = () => (S.userPrefs || []).find(p => p.id === prefsId()) || (() => { try { return JSON.parse(localStorage.getItem("ways-prefs") || "{}"); } catch { return {}; } })();
const wOk = id => WIDGETS[id] && (!WIDGETS[id].m || allowed(WIDGETS[id].m)) && (!WIDGETS[id].ok || WIDGETS[id].ok());
function dashLayout() {
  const l = myPrefs().dash;
  return (Array.isArray(l) ? l : W_DEFAULT.map(id => ({ id }))).filter(x => wOk(x.id)).map(x => ({ id: x.id, size: WSIZE[x.size] ? x.size : WIDGETS[x.id].size }));
}
async function dashSaveOld(layout) {
  const data = Object.assign({}, myPrefs(), { dash: layout.map(x => ({ id: x.id, size: x.size })) }); delete data.id;
  if (db) await save("userPrefs", prefsId(), data); else { try { localStorage.setItem("ways-prefs", JSON.stringify(data)); } catch { } render(true); }
}
const wLink = (href, l) => `<a href="#${href}" class="w-more">${esc(tr(l || "Ouvrir"))} →</a>`;
const wEmpty = t => `<div class="w-empty">${esc(tr(t))}</div>`;
const wStat = (v, l, cls = "", attrs = "") => `<div class="w-stat ${cls}" ${attrs}><b>${v}</b><span>${esc(tr(l))}</span></div>`;

/* ---- widgets ---- */
WIDGETS.shortcuts = { h: 4, t: "Raccourcis", ic: "⚡", c: "blue", size: "m", d: "Les actions les plus courantes en un clic.",
  r() { const b = [["factures", "doc-form", "Nouvelle facture", 'data-kind="facture"'], ["gaz", "gas-op", "Livrer du gaz", 'data-op="livraison"'], ["etalonnage", "tool-reception", "Réceptionner des outils", ""], ["flotte", "fault-form", "Signaler une panne", ""], ["admin", "note-form", "Nouvelle note", ""], ["flotte", "veh-form", "Ajouter un véhicule", ""]].filter(x => allowed(x[0]));
    return `<div class="w-short">${b.map(([, a, l, x]) => `<button class="btn ${a === "fault-form" ? "btn-alert" : ""}" data-a="${a}" ${x} ${dis()}>${esc(tr(l))}</button>`).join("")}</div>`; } };
WIDGETS.inv_due = { h: 9, t: "Factures à encaisser", ic: "🧾", c: "yellow", m: "factures", size: "m", d: "Impayés, retards et prochaines échéances.",
  r() { const inv = issued().map(d => Object.assign({}, d, { st: invStatus(d) })), open = inv.filter(d => ["envoyee", "retard", "partiel"].includes(d.st)), late = open.filter(d => d.st === "retard");
    const sum = a => a.reduce((x, d) => x + dueOf(d), 0);
    return `<div class="w-stats">${wStat(eur0(sum(open)), plural(open.length, "facture") + " impayée" + (open.length > 1 ? "s" : ""))}${wStat(eur0(sum(late)), late.length ? plural(late.length, "facture") + " en retard" : "aucun retard", late.length ? "bad" : "good")}</div>
      <div class="w-list">${open.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")).slice(0, 5).map(d => `<div class="list-row click" data-a="doc-open" data-id="${d.id}"><div><div>${esc(clientName(d.clientId))}</div><div class="muted mono small">${esc(d.number)} · ${fmtDate(d.dueDate)}</div></div><div style="text-align:right"><div class="num">${eur(dueOf(d))}</div>${chip(d.st)}</div></div>`).join("") || wEmpty("Tout est payé.")}</div>${wLink("factures", "Toutes les factures")}`; } };
WIDGETS.ca = { h: 9, t: "Chiffre d'affaires", ic: "📈", c: "yellow", m: "factures", size: "l", d: "CA HT facturé sur 12 mois, services et produits.",
  r() { const t = today(), ym = t.slice(0, 7), y = t.slice(0, 4), inv = issued().map(d => Object.assign({}, d, { T: signedTotals(d) }));
    const s = f => inv.filter(f).reduce((a, d) => a + d.T.ht, 0);
    return `<div class="w-stats">${wStat(eur0(s(d => (d.date || "").startsWith(ym))), "HT · " + MONTHS[+ym.slice(5) - 1])}${wStat(eur0(s(d => (d.date || "").startsWith(y))), "HT · " + y)}</div>
      <div class="legend"><span><i style="background:var(--series-1)"></i>Services & étalonnage</span><span><i style="background:var(--series-2)"></i>Gaz & produits</span></div>${caChart(inv)}`; } };
WIDGETS.bank = { h: 6, t: "Trésorerie", ic: "🏦", c: "green", m: "banque", size: "s", d: "Solde des comptes bancaires (Ponto).",
  r() { const acc = (S.bankAccounts || []).filter(a => a.balance != null), s = settings();
    if (!acc.length) return `<div class="w-stats">${wStat(s.bankBalance != null ? eur0(s.bankBalance) : "—", s.bankDate ? "au " + fmtDate(s.bankDate) : "solde manuel")}</div>${readOnly ? "" : `<button class="btn sm" data-a="bank-edit">Mettre à jour</button>`}`;
    const eurAcc = acc.filter(a => (a.currency || "EUR") === "EUR");
    return `<div class="w-stats">${wStat(eur0(eurAcc.reduce((x, a) => x + a.balance, 0)), plural(eurAcc.length, "compte"))}</div>
      <div class="w-list">${acc.map(a => `<div class="list-row"><span>${esc(a.bank || "")} <span class="muted small">${esc(a.name || "")}</span></span><span class="num">${a.currency && a.currency !== "EUR" ? esc(a.currency) + " " : ""}${eur0(a.balance)}</span></div>`).join("")}</div>${wLink("banque")}`; } };
WIDGETS.purch_due = { h: 7, t: "Achats à payer", ic: "📥", c: "grey", m: "achats", size: "s", d: "Factures fournisseurs non payées.",
  r() { if (typeof purSt !== "function") return wEmpty("Module Achats indisponible.");
    const open = (S.purchases || []).filter(p => !p.archived && !p.credit && purSt(p) !== "paid").sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"));
    const late = open.filter(p => p.dueDate && p.dueDate < today());
    return `<div class="w-stats">${wStat(eur0(open.reduce((a, p) => a + (+p.amount || 0) - purBank(p.id), 0)), plural(open.length, "facture"))}${late.length ? wStat(late.length, "en retard", "bad") : ""}</div>
      <div class="w-list">${open.slice(0, 4).map(p => `<div class="list-row click" data-a="pur-open" data-id="${p.id}"><span>${esc(p.supplierName || "—")}<div class="muted small">${p.dueDate ? fmtDate(p.dueDate) : "—"}</div></span><span class="num">${eur(+p.amount || 0)}</span></div>`).join("") || wEmpty("Rien à payer.")}</div>${wLink("achats")}`; } };
WIDGETS.fleet_state = { h: 5, t: "État de la flotte", ic: "🚗", c: "orange", m: "flotte", size: "s", d: "Véhicules disponibles, en panne, immobilisés.",
  r() { const st = activeVehicles().map(vehState), c = k => st.filter(s => s[1] === k).length;
    return `<div class="w-stats">${wStat(c("good"), "disponibles", "good")}${wStat(c("warn"), "panne / atelier", c("warn") ? "warn" : "")}${wStat(c("bad"), "immobilisés", c("bad") ? "bad" : "")}</div>${wLink("flotte", "Voir la flotte")}`; } };
WIDGETS.faults = { h: 8, t: "Pannes et défauts", ic: "⚠", c: "red", m: "flotte", size: "m", d: "En cours, et signalements de garages à valider.",
  r() { const open = S.faults.filter(f => f.status !== "reparee" && isActiveVeh(f.vehicleId)).sort((a, b) => ((b.status === "attente") - (a.status === "attente")) || (b.date || "").localeCompare(a.date || ""));
    const wait = open.filter(f => f.status === "attente").length;
    return `${wait && isOffice() ? `<div class="banner warn small">${plural(wait, "signalement")} à valider</div>` : ""}<div class="w-list">${open.slice(0, 6).map(f => `<div class="list-row click" data-a="fault-open" data-id="${f.id}"><div><div>${esc(f.description)}</div><div class="muted small">${esc(vehLabel(f.vehicleId))} · ${fmtDate(f.date)}</div></div><span class="chip ${(FAULT_ST[f.status] || FAULT_ST.ouverte)[1]}">${(FAULT_ST[f.status] || FAULT_ST.ouverte)[0]}</span></div>`).join("") || wEmpty("Aucune panne en cours.")}</div>
      ${open.length > 6 ? `<div class="muted small">… et ${open.length - 6} autres</div>` : ""}${wLink("flotte", "Toutes les pannes")}`; },
  go() { UI.tab.flotte = "pannes"; } };
WIDGETS.fleet_due = { h: 9, t: "Échéances véhicules", ic: "📅", c: "orange", m: "flotte", size: "m", d: "Contrôles techniques, assurances, entretiens à venir (45 jours).",
  r() { const t = fleetTasks(45); return `<div class="w-list">${t.slice(0, 6).map(taskRow).join("") || wEmpty("Rien dans les 45 prochains jours.")}</div>${t.length > 6 ? `<div class="muted small">… et ${t.length - 6} autres</div>` : ""}${wLink("flotte", "À faire")}`; } };
WIDGETS.on_road = { h: 6, t: "En route", ic: "🛣", c: "orange", m: "flotte", size: "s", ok: () => isOffice() || (ME && ME.role === "terrain"), d: "Véhicules qui roulent en ce moment (WebFleet).",
  r() { const fresh = p => p && p.at && Date.now() - new Date(p.at).getTime() < 30 * 60000;
    const on = (S.vehPos || []).filter(p => p.state === "route" && fresh(p)).map(p => ({ p, v: veh(p.id || p.vehicleId) })).filter(x => x.v);
    return `<div class="w-stats">${wStat(on.length, "en route", on.length ? "good" : "")}</div><div class="w-list">${on.slice(0, 6).map(x => `<div class="list-row click" data-a="veh-open" data-id="${x.v.id}"><span><span class="plate sm">${esc(x.v.plate)}</span> <span class="small">${esc(x.p.driver || "")}</span></span><span class="small num">${x.p.speed ? Math.round(x.p.speed) + " km/h" : ""}</span></div>`).join("") || wEmpty("Aucun véhicule en route.")}</div>`; } };
WIDGETS.garages = { h: 6, t: "Garages", ic: "🔧", c: "orange", m: "flotte", size: "m", ok: () => isOffice() && (S.garages || []).length > 0, d: "Véhicules présents chez chaque garage et montants dus.",
  r() { if (typeof garVehicles !== "function") return "";
    return `<div class="w-list">${(S.garages || []).map(g => { const vs = garVehicles(g), due = garDue(g), dr = garDriving(g);
      return `<div class="list-row click" data-a="garage-open" data-id="${g.id}"><div><div>${esc(g.name)}${dr.length ? ` <span class="chip bad">🚗 au volant</span>` : ""}</div><div class="muted small">${plural(vs.length, "véhicule")} · ${plural(garTasks(g).filter(f => f.status !== "reparee").length, "tâche")}</div></div><span class="num ${due > 0.005 ? "txt-bad" : ""}">${due > 0.005 ? eur0(due) : "—"}</span></div>`; }).join("")}</div>`; } };
WIDGETS.fines = { h: 4, t: "Amendes à traiter", ic: "🚨", c: "red", m: "flotte", size: "s", ok: () => isOffice(), d: "Amendes avec une action dans les 7 jours.",
  r() { const n = fineActionCount(); return `<div class="w-stats">${wStat(n, "à traiter", n ? "bad" : "good")}</div>${wLink("flotte", "Amendes")}`; }, go() { UI.tab.flotte = "amendes"; } };
WIDGETS.gas_stock = { h: 5, t: "Stock de gaz", ic: "🧪", c: "blue", m: "gaz", size: "m", d: "Bouteilles pleines, vides, chez les clients et chez le fournisseur.",
  r() { const n = st => S.bottles.filter(b => b.status === st).length;
    const types = {}; S.gasTypes.forEach(t => { const g = t.gas + (t.grade ? " " + t.grade : ""); (types[g] ||= []).push(t.id); });
    const low = Object.entries(types).filter(([, ids]) => ids.some(id => { const t = gType(id); return +t.minFull && S.bottles.filter(b => b.typeId === id && b.status === "plein").length < +t.minFull; })).map(([g]) => g);
    return `<div class="w-stats">${wStat(n("plein"), "pleines", "good")}${wStat(n("vide"), "vides", "warn")}${wStat(n("client"), "chez clients")}${wStat(n("fournisseur"), "fournisseur")}</div>
      ${low.length ? `<div class="banner warn small">Stock bas : ${esc(low.join(", "))}</div>` : ""}${wLink("gaz")}`; } };
WIDGETS.calib = { h: 8, t: "Étalonnage", ic: "🔬", c: "green", m: "etalonnage", size: "m", d: "Outils en cours, prêts à rendre, échéances.",
  r() { const n = st => S.tools.filter(t => colOf(t) === st).length, due = toolsDue(30).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
    return `<div class="w-stats">${wStat(n("recu") + n("picked") + n("labo"), "en atelier")}${wStat(n("a_livrer"), "à rendre", n("a_livrer") ? "good" : "")}${wStat(toolsDue(0).length, "échéances dépassées", toolsDue(0).length ? "bad" : "")}</div>
      <div class="w-list">${due.slice(0, 4).map(t => `<div class="list-row click" data-a="tool-open" data-id="${t.id}"><span>${esc(t.name)} <span class="mono small muted">${esc(t.serial)}</span><div class="muted small">${esc(clientName(t.clientId))}</div></span>${dueChip(t.nextDue)}</div>`).join("") || wEmpty("Aucune échéance dans les 30 jours.")}</div>${wLink("etalonnage")}`; } };
WIDGETS.notes = { h: 7, t: "Mes notes", ic: "📝", c: "grey", m: "admin", size: "m", ok: () => typeof notesAll === "function", d: "Notes épinglées (ou les plus récentes).",
  r() { const all = notesAll().sort(noteSort), pin = all.filter(n => n.pinned), list = (pin.length ? pin : all).slice(0, 4);
    return `<div class="w-notes">${list.map(n => `<button class="w-note nc-${n.color || "def"}" data-a="note-form" data-id="${n.id}"><b>${esc(noteTitle(n))}</b><span>${esc((n.body || "").slice(0, 120))}</span></button>`).join("") || wEmpty("Aucune note.")}</div>
      ${readOnly ? "" : `<button class="btn sm" data-a="note-form">+ Nouvelle note</button>`}`; }, go() { UI.tab.admin = "notes"; } };

/* ---- page : grille libre (GridStack) — glisser n'importe où, redimensionner par les bords ---- */
const WSPAN = { s: 3, m: 6, l: 12 };
function dashItems() {   /* disposition : [{id, x, y, w, h}] ; anciennes dispositions (taille S/M/L) converties */
  return dashLayout().map(x => { const raw = (myPrefs().dash || []).find(y => y.id === x.id) || {}, w = WIDGETS[x.id];
    return { id: x.id, x: Number.isFinite(raw.x) ? raw.x : undefined, y: Number.isFinite(raw.y) ? raw.y : undefined, w: raw.w || WSPAN[x.size] || 6, h: raw.h || w.h || 6 }; });
}
const DASH = { bodies: {} };
function dashSig(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
VIEWS.dashboard = {
  render() {
    const t = today(), edit = !!UI.dashEdit, items = dashItems();
    DASH.bodies = {}; for (const it of items) { try { DASH.bodies[it.id] = WIDGETS[it.id].r(); } catch (e) { console.error(e); DASH.bodies[it.id] = wEmpty("Ce widget n'a pas pu s'afficher."); } }
    const sig = dashSig(JSON.stringify(items) + edit + Object.values(DASH.bodies).join(""));
    const h = new Date().getHours(), hi = h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
    return `<div class="dash-hero">${logoSvg("currentColor", "none", "ghost")}` + head(`${hi}${ME && ME.name && !ME.key ? ", " + esc(ME.name.split(" ")[0]) : ""}`, `${esc(settings().name)} · ${fmtDate(t)}`,
      edit ? `<button class="btn" data-a="dash-add">+ Ajouter des widgets</button><button class="btn" data-a="dash-reset">Rétablir par défaut</button><button class="btn primary" data-a="dash-edit">Terminer</button>`
        : `<button class="btn" data-a="dash-edit">✎ Personnaliser</button>`) + `</div>` +
      (edit ? `<div class="banner info small">Glissez un widget par son en-tête pour le placer où vous voulez ; tirez ses bords ou ses coins pour le redimensionner. Votre tableau de bord vous est propre.</div>` : "") +
      (items.length ? `<div id="wgrid" class="grid-stack wgrid2 ${edit ? "editing" : ""}" data-keep="dash" data-sig="${sig}"></div>`
        : `<div class="panel empty">Votre tableau de bord est vide. <button class="btn primary" data-a="dash-add">+ Ajouter des widgets</button></div>`);
  },
  after() { dashMount(); }
};
let gsP = null;
function loadGridstack() {
  if (window.GridStack) return Promise.resolve();
  if (!gsP) { const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "js/vendor/gridstack.min.css"; document.head.appendChild(css); gsP = loadScript("js/vendor/gridstack-all.js"); }
  return gsP;
}
const wHead = (it) => { const w = WIDGETS[it.id];
  return `<header class="w-h"><span class="w-ic" aria-hidden="true">${w.ic || "▪"}</span><h3>${esc(tr(w.t))}</h3><button class="x w-del" data-a="dash-del" data-id="${it.id}" title="Retirer" aria-label="Retirer ${esc(w.t)}">×</button></header>`; };
async function dashMount() {
  const el = document.getElementById("wgrid"); if (!el) return;
  try { await loadGridstack(); } catch (e) { el.innerHTML = `<div class="err">La grille n'a pas pu être chargée.</div>`; return; }
  const GS = window.GridStack && (window.GridStack.GridStack || window.GridStack); if (!GS || !document.body.contains(el)) return;
  const edit = !!UI.dashEdit, items = dashItems(), key = items.map(i => i.id).join(",");
  el.classList.toggle("editing", edit);
  if (el._gs && el._key === key) {   /* même widgets : on met seulement à jour leur contenu (et le mode) */
    for (const it of items) { const b = el.querySelector(`[gs-id="${it.id}"] .w-b`), html = DASH.bodies[it.id]; if (b && b._html !== html) { b.innerHTML = html; b._html = html; } }
    el._gs.enableMove(edit); el._gs.enableResize(edit); return;
  }
  if (el._gs) { el._gs.destroy(false); el._gs = null; }
  el.innerHTML = items.map(it => `<div class="grid-stack-item" gs-id="${it.id}" ${it.x != null ? `gs-x="${it.x}" gs-y="${it.y}"` : `gs-auto-position="true"`} gs-w="${it.w}" gs-h="${it.h}" gs-min-w="2" gs-min-h="3">
    <div class="grid-stack-item-content"><section class="wdg c-${WIDGETS[it.id].c || "blue"}">${wHead(it)}<div class="w-b">${DASH.bodies[it.id]}</div></section></div></div>`).join("");
  el.querySelectorAll(".w-b").forEach((b, i) => b._html = DASH.bodies[items[i].id]);
  const g = GS.init({ column: 12, cellHeight: 44, margin: 8, mode: "float", float: true, animate: true, draggable: { handle: ".w-h" },
    resizable: { handles: "e,se,s,sw,w" }, columnOpts: { breakpointForWindow: true, breakpoints: [{ w: 800, c: 1 }] } }, el);
  el._gs = g; el._key = key; g.enableMove(edit); g.enableResize(edit);
  let saveT = null;
  g.on("change", () => {
    if (!UI.dashEdit || g.getColumn() !== 12) return;   /* on n'enregistre que la mise en page « bureau » (12 colonnes) */
    clearTimeout(saveT); saveT = setTimeout(() => {
      const pos = {}; for (const n of g.engine.nodes) pos[n.id || n.el?.getAttribute("gs-id")] = { x: n.x, y: n.y, w: n.w, h: n.h };
      dashSave(dashItems().map(it => Object.assign({ id: it.id }, pos[it.id] || {})));
    }, 250);
  });
}
async function dashSave(layout) {   /* surcharge : enregistre x, y, w, h */
  const data = Object.assign({}, myPrefs(), { dash: layout.map(x => ({ id: x.id, x: x.x, y: x.y, w: x.w, h: x.h, size: x.size })) }); delete data.id;
  const el = document.getElementById("wgrid"); if (el && el._gs) el._key = layout.map(i => i.id).join(",");   /* pas de reconstruction après un simple déplacement */
  if (db) await save("userPrefs", prefsId(), data); else { try { localStorage.setItem("ways-prefs", JSON.stringify(data)); } catch { } render(true); }
}
ACTIONS["dash-edit"] = () => { UI.dashEdit = !UI.dashEdit; render(true); };
ACTIONS["dash-reset"] = () => confirmBox("Rétablir le tableau de bord par défaut ?", () => { const el = document.getElementById("wgrid"); if (el) el._key = null; return dashSave(W_DEFAULT.filter(wOk).map(id => ({ id }))); }, "Rétablir");
ACTIONS["dash-del"] = el => { const g = document.getElementById("wgrid"); if (g) g._key = null; dashSave(dashItems().filter(x => x.id !== el.dataset.id)); };
ACTIONS["dash-add"] = () => {
  const have = new Set(dashLayout().map(x => x.id));
  const mods = { "": "Général", factures: "Ventes", banque: "Finances", achats: "Achats", flotte: "Flotte", gaz: "Gaz", etalonnage: "Étalonnage", admin: "Administration" };
  const groups = {}; for (const [id, w] of Object.entries(WIDGETS)) if (wOk(id)) (groups[w.m || ""] ||= []).push([id, w]);
  const m = modal(`${mHead("Ajouter des widgets")}<div class="body stack">${Object.entries(groups).map(([k, ws]) => `<div><h4 class="np">${esc(mods[k] || k)}</h4><div class="w-cat">${ws.map(([id, w]) =>
    `<button class="w-pick c-${w.c || "blue"} ${have.has(id) ? "on" : ""}" data-wadd="${id}"><span class="w-ic">${w.ic || "▪"}</span><span><b>${esc(tr(w.t))}</b><span class="muted small">${esc(tr(w.d || ""))}</span></span><span class="w-st">${have.has(id) ? "✓ Affiché" : "+ Ajouter"}</span></button>`).join("")}</div></div>`).join("")}</div>
    <footer><button class="btn primary" data-close>Terminé</button></footer>`, "lg");
  m.addEventListener("click", e => { const b = e.target.closest("[data-wadd]"); if (!b || b.classList.contains("on")) return;
    const id = b.dataset.wadd, g = document.getElementById("wgrid"); if (g) g._key = null;
    dashSave([...dashItems(), { id }]); b.classList.add("on"); b.querySelector(".w-st").textContent = "✓ Affiché"; });
};
/* lien « Ouvrir » d'un widget : ouvre le bon onglet du module */
document.addEventListener("click", e => { const a = e.target.closest(".wdg .w-more"); if (!a) return; const id = a.closest(".grid-stack-item")?.getAttribute("gs-id"); const w = WIDGETS[id]; if (w && w.go) w.go(); }, true);

init();
