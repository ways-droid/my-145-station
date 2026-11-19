"use strict";
/* ======================= GAZ ======================= */
const B_STATUS = {
  plein: ["Pleine · en stock", "good"], vide: ["Vide · en stock", "warn"], client: ["Chez le client", "info"],
  fournisseur: ["Chez le fournisseur", ""], hs: ["Hors service", "bad"]
};
const bChip = st => { const [l, c] = B_STATUS[st] || [st, ""]; return `<span class="chip ${c}">${l}</span>`; };
const gType = id => S.gasTypes.find(t => t.id === id);
const gTypeLabel = id => { const t = gType(id); return t ? `${t.gas} ${t.grade ? t.grade + " " : ""}· ${t.size}` : "Type inconnu"; };
const locName = id => (settings().gasLocations || []).find(l => l.id === id)?.name || "—";
/* stock en attente : emplacement temporaire créé à la suppression d'un emplacement qui contenait des bouteilles ;
   affiché seulement tant qu'il contient du stock */
const TEMP_LOC = "L_ATTENTE";
const inStockAt = id => S.bottles.filter(b => b.locationId === id && (b.status === "plein" || b.status === "vide"));
const gasLocs = () => (settings().gasLocations || []).filter(l => !l.temp || inStockAt(l.id).length);
const locOptions = () => gasLocs().map(l => [l.id, l.name]);
const bottleBySerial = s => S.bottles.find(b => b.serial === s);
const bottleId = s => "b-" + safeId(s);
const gasLabel = t => `${t.gas}${t.grade ? " " + t.grade : ""} — bouteille ${t.size} (${t.volume} L${t.pressure ? ", " + t.pressure + " bar" : ""}${t.content ? ", " + t.content : ""})`;

VIEWS.gaz = {
  render() {
    const tab = curTab("gaz", "stock");
    const s = settings();
    const counts = st => S.bottles.filter(b => b.status === st).length;
    const html = head("Gaz", `${plural(S.bottles.length, "bouteille")} connue${S.bottles.length > 1 ? "s" : ""} · fournisseur ${esc(s.supplierName)}`, "") +
      `<div class="ops">
        <button class="op op-green" data-a="gas-op" data-op="reception" ${dis()}><b>Réception</b><span>Bouteilles pleines reçues de ${esc(s.supplierName)}</span></button>
        <button class="op op-blue" data-a="gas-op" data-op="livraison" ${dis()}><b>Livraison client</b><span>Sortie de bouteilles pleines + facture automatique</span></button>
        <button class="op op-yellow" data-a="gas-op" data-op="retour_client" ${dis()}><b>Retour client</b><span>Bouteilles vides récupérées chez un client</span></button>
        <button class="op op-grey" data-a="gas-op" data-op="retour_fournisseur" ${dis()}><b>Retour fournisseur</b><span>Vides renvoyées pour remplissage</span></button>
      </div>` +
      tabs("gaz", [["stock", "Stock"], ["bouteilles", "Bouteilles", S.bottles.length], ["clients", "Chez les clients", counts("client")], ["livraisons", "Livraisons", S.deliveries.length], ["config", "Types & emplacements"]]);
    return html + ({ stock: gasStock, bouteilles: gasBottles, clients: gasAtClients, livraisons: gasDeliveries, config: gasConfig })[tab]();
  }
};

function gasMatrix() {
  const locs = gasLocs();
  const types = S.gasTypes.slice().sort((a, b) => (a.gas + a.size).localeCompare(b.gas + b.size, "fr"));
  return { locs, types, cell: (loc, type, st) => S.bottles.filter(b => b.status === st && b.locationId === loc && b.typeId === type).length };
}
function gasStock() {
  const { locs, types, cell } = gasMatrix();
  const n = st => S.bottles.filter(b => b.status === st).length;
  const tiles = `<div class="tiles">
    <div class="panel tile c-green"><div class="lbl">Pleines en stock</div><div class="val">${n("plein")}</div><div class="note">prêtes à livrer</div></div>
    <div class="panel tile c-yellow"><div class="lbl">Vides en stock</div><div class="val">${n("vide")}</div><div class="note">à renvoyer au fournisseur</div></div>
    <div class="panel tile c-blue"><div class="lbl">Chez les clients</div><div class="val">${n("client")}</div><div class="note">${new Set(S.bottles.filter(b => b.status === "client").map(b => b.clientId)).size} clients</div></div>
    <div class="panel tile c-grey"><div class="lbl">Chez le fournisseur</div><div class="val">${n("fournisseur")}</div><div class="note">en remplissage</div></div></div>`;
  if (!types.length) return tiles + `<div class="panel empty">Créez d'abord vos types de bouteilles dans l'onglet « Types & emplacements ».</div>`;
  const tot = (t, st) => S.bottles.filter(b => b.typeId === t && b.status === st).length;
  return tiles + `<div class="panel"><h3>Stock par type et par emplacement</h3><div class="tablewrap"><table class="matrix"><thead><tr><th>Type de bouteille</th>
    ${locs.map(l => `<th class="r${l.temp ? " temp-col" : ""}">${esc(l.name)}${l.temp ? `<br><button class="btn sm" data-a="loc-redistribute" ${dis()}>Redistribuer</button>` : ""}</th>`).join("")}<th class="r">Total en stock</th><th class="r">Chez clients</th><th class="r">Fournisseur</th></tr></thead><tbody>
    ${types.map(t => `<tr><td><b>${esc(t.gas)}${t.grade ? " " + esc(t.grade) : ""}</b> <span class="muted">· ${esc(t.size)} · ${t.volume} L</span></td>
      ${locs.map(l => { const p = cell(l.id, t.id, "plein"), v = cell(l.id, t.id, "vide"); return `<td class="r num${l.temp ? " temp-col" : ""}">${p || v ? `<span class="full">${p}</span> <span class="muted">/ ${v}</span>` : `<span class="muted">—</span>`}</td>`; }).join("")}
      <td class="r num"><b>${tot(t.id, "plein")}</b> <span class="muted">/ ${tot(t.id, "vide")}</span>${+t.minFull && tot(t.id, "plein") < +t.minFull ? ` <span class="chip warn">sous le min. ${t.minFull}</span>` : ""}</td>
      <td class="r num">${tot(t.id, "client")}</td><td class="r num">${tot(t.id, "fournisseur")}</td></tr>`).join("")}
    </tbody></table></div><div class="hint pad">Chaque case : <span class="full">pleines</span> / vides.</div></div>`;
}
function gasBottles() {
  const q = UI.q.toLowerCase();
  const rows = S.bottles.filter(b => (UI.filter === "tous" || b.status === UI.filter) && (!q || [b.serial, gTypeLabel(b.typeId), clientName(b.clientId), b.lot].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => a.serial.localeCompare(b.serial));
  return `<div class="panel">${searchBar("Numéro de série, type, client, lot…", [["tous", "Toutes"], ["plein", "Pleines"], ["vide", "Vides"], ["client", "Chez clients"], ["fournisseur", "Fournisseur"], ["hs", "Hors service"]])}
    <div class="tablewrap"><table><thead><tr><th>N° de série</th><th>Type</th><th>Statut</th><th>Où</th><th>Lot</th><th>Dernier mouvement</th></tr></thead><tbody>
    ${rows.slice(0, 500).map(b => `<tr class="click" data-a="bottle-open" data-id="${b.id}"><td class="mono"><b>${esc(b.serial)}</b>${demoTag(b)}</td><td>${esc(gTypeLabel(b.typeId))}</td><td>${bChip(b.status)}</td>
      <td>${b.status === "client" ? esc(clientName(b.clientId)) : b.status === "plein" || b.status === "vide" ? esc(locName(b.locationId)) : "—"}</td><td class="mono">${esc(b.lot || "—")}</td><td class="num">${fmtDate(b.lastMoveDate)}</td></tr>`).join("")}
    </tbody></table>${rows.length ? "" : `<div class="empty">${S.bottles.length ? "Aucune bouteille ne correspond." : "Aucune bouteille connue. Faites une première réception."}</div>`}</div></div>`;
}
function gasAtClients() {
  const at = S.bottles.filter(b => b.status === "client");
  const groups = {};
  at.forEach(b => (groups[b.clientId] = groups[b.clientId] || []).push(b));
  const list = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  if (!list.length) return `<div class="panel empty">Aucune bouteille chez les clients.</div>`;
  return `<div class="cards">${list.map(([cid, bs]) => {
    const oldest = bs.reduce((m, b) => !m || (b.lastMoveDate || "") < m ? b.lastMoveDate : m, "");
    const days = oldest ? daysBetween(oldest, today()) : 0;
    const byT = {}; bs.forEach(b => byT[b.typeId] = (byT[b.typeId] || 0) + 1);
    return `<div class="panel pad stack"><div class="row-sb"><b>${esc(clientName(cid))}</b><span class="chip info">${bs.length}</span></div>
      <div class="muted">${Object.entries(byT).map(([t, n]) => `${n} × ${esc(gTypeLabel(t))}`).join("<br>")}</div>
      <div class="small ${days > 90 ? "txt-warn" : "muted"}">Plus ancienne livrée il y a ${days} jours</div>
      <div class="mono small muted">${bs.map(b => esc(b.serial)).join(" · ")}</div></div>`;
  }).join("")}</div>`;
}
function gasDeliveries() {
  const q = UI.q.toLowerCase();
  const rows = S.deliveries.filter(d => !q || (d.number + " " + clientName(d.clientId) + " " + (d.bottles || []).map(b => b.serial).join(" ")).toLowerCase().includes(q))
    .sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number));
  return `<div class="panel">${searchBar("N° de livraison, client ou n° de série…")}
    <div class="tablewrap"><table><thead><tr><th>Livraison</th><th>Client</th><th>Date</th><th class="r">Bouteilles</th><th>Facture</th><th>Certificat</th></tr></thead><tbody>
    ${rows.map(d => { const inv = S.docs.find(x => x.id === d.invoiceId); return `<tr class="click" data-a="delivery-open" data-id="${d.id}"><td class="mono"><b>${esc(d.number)}</b>${demoTag(d)}</td><td>${esc(clientName(d.clientId))}</td><td class="num">${fmtDate(d.date)}</td>
      <td class="r num">${(d.bottles || []).length}</td><td>${inv ? `<span class="mono">${esc(inv.number)}</span> ${chip(invStatus(inv))}` : `<span class="muted">—</span>`}</td>
      <td>${(d.cocs || []).length ? `<span class="chip good">COC émis</span>` : `<span class="muted">—</span>`}</td></tr>`; }).join("")}
    </tbody></table>${rows.length ? "" : `<div class="empty">Aucune livraison pour l'instant.</div>`}</div></div>`;
}
function gasConfig() {
  const locs = gasLocs();
  return `<div class="banner info">Les prix des bouteilles et des frais EXP se modifient dans <a href="#produits">Produits & prix</a>.</div><div class="grid2 eq"><div class="panel"><div class="row-sb pad"><h3 class="np">Types de bouteilles</h3><button class="btn sm primary" data-a="gtype-form" ${dis()}>Ajouter un type</button></div>
    <div class="tablewrap"><table><thead><tr><th>Gaz</th><th>Format</th><th class="r">Volume</th><th class="r">Pression</th><th class="r">Prix HT</th><th class="r">Bouteilles</th></tr></thead><tbody>
    ${S.gasTypes.slice().sort((a, b) => (a.gas + a.size).localeCompare(b.gas + b.size)).map(t => `<tr class="click" data-a="gtype-form" data-id="${t.id}"><td><b>${esc(t.gas)}</b> <span class="muted">${esc(t.grade || "")}</span></td><td>${esc(t.size)}</td>
      <td class="r num">${t.volume} L</td><td class="r num">${t.pressure ? t.pressure + " bar" : "—"}</td><td class="r num">${eur(t.price)}</td><td class="r num">${S.bottles.filter(b => b.typeId === t.id).length}</td></tr>`).join("")}
    </tbody></table>${S.gasTypes.length ? "" : `<div class="empty">Aucun type. Ajoutez par exemple « Azote 5.0 · B50 ».</div>`}</div></div>
    <div class="panel"><div class="row-sb pad"><h3 class="np">Emplacements de stockage</h3><button class="btn sm primary" data-a="loc-form" ${dis()}>Ajouter</button></div>
    ${locs.map(l => `<div class="list-row${l.temp ? " temp-row" : ""}"><span>${l.temp ? `<span class="chip warn">En attente</span> ` : ""}${esc(l.name)}</span><span class="row-g"><span class="muted num">${plural(inStockAt(l.id).length, "bouteille")}</span>
      ${l.temp ? `<button class="btn sm primary" data-a="loc-redistribute" ${dis()}>Redistribuer</button>` : `<button class="btn sm" data-a="loc-form" data-id="${l.id}" ${dis()}>Modifier</button>`}</span></div>`).join("")}</div></div>`;
}

ACTIONS["gtype-form"] = el => {
  const t = gType(el.dataset.id) || { gas: "Azote", grade: "", size: "", volume: 50, pressure: 200, content: "", price: 0, vat: 21, minFull: 0 };
  const isNew = !t.id;
  const m = modal(`${mHead(isNew ? "Nouveau type de bouteille" : "Type " + esc(t.gas + " " + t.size))}<form><div class="body"><div class="fields">
    ${field("t-gas", "Gaz", t.gas, { required: true, ph: "Azote, Argon, CO2, Hélium…" })}${field("t-grade", "Qualité / pureté", t.grade, { ph: "5.0, ALPHAGAZ 1…" })}
    ${field("t-size", "Format", t.size, { required: true, ph: "B50, B20, B10…" })}${field("t-vol", "Volume en eau (L)", t.volume, { type: "number", step: "0.1", required: true })}
    ${field("t-p", "Pression de remplissage (bar)", t.pressure, { type: "number" })}${field("t-c", "Contenu", t.content, { ph: "10,7 m³ ou 37,5 kg" })}
    ${field("t-price", "Prix de vente HT par bouteille", t.price, { type: "number", step: "0.01", required: true })}
    ${field("t-vat", "TVA", t.vat ?? 21, { type: "select", options: [[21, "21 %"], [6, "6 %"], [0, "0 %"]] })}
    ${field("t-min", "Stock minimum de pleines", t.minFull, { type: "number", min: 0 })}</div></div>
    <footer>${isNew ? "" : `<div class="left"><button type="button" class="btn danger" data-a="gtype-del" data-id="${t.id}" ${dis()}>Supprimer</button></div>`}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    await save("gasTypes", t.id, Object.assign(strip(t), { gas: val("t-gas"), grade: val("t-grade"), size: val("t-size"), volume: +val("t-vol") || 0, pressure: +val("t-p") || 0, content: val("t-c"), price: +val("t-price") || 0, vat: +val("t-vat"), minFull: +val("t-min") || 0 }));
    closeModal(); toast("Type enregistré");
  };
};
ACTIONS["gtype-del"] = el => {
  const n = S.bottles.filter(b => b.typeId === el.dataset.id).length;
  if (n) { toast(`Impossible : ${plural(n, "bouteille")} utilise${n > 1 ? "nt" : ""} ce type.`); return; }
  confirmBox("Supprimer ce type de bouteille ?", () => remove("gasTypes", el.dataset.id));
};
ACTIONS["loc-form"] = el => {
  const locs = clone(settings().gasLocations || []), l = locs.find(x => x.id === el.dataset.id);
  const m = modal(`${mHead(l ? "Modifier l'emplacement" : "Nouvel emplacement")}<form><div class="body">${field("l-name", "Nom", l?.name, { required: true, ph: "Cage A, Camionnette 1…" })}</div>
    <footer>${l ? `<div class="left"><button type="button" class="btn danger" data-a="loc-del" data-id="${l.id}" ${dis()}>Supprimer…</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`, "sm");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    if (l) l.name = val("l-name"); else locs.push({ id: "L" + uid(), name: val("l-name") });
    await saveSettings({ gasLocations: locs }); closeModal(); render(true); toast("Emplacement enregistré");
  };
};

ACTIONS["loc-del"] = el => {
  const l = (settings().gasLocations || []).find(x => x.id === el.dataset.id); if (!l) return;
  const bs = inStockAt(l.id), byT = {}; bs.forEach(b => byT[b.typeId] = (byT[b.typeId] || 0) + 1);
  const m = modal(`${mHead("Supprimer l'emplacement")}<div class="body stack-s">
    <div>Vous allez supprimer l'emplacement <b>${esc(l.name)}</b>.</div>
    ${bs.length ? `<div class="banner warn"><b>${plural(bs.length, "bouteille")} s'y trouve${bs.length > 1 ? "nt" : ""}</b> (${Object.entries(byT).map(([t, n]) => `${n} × ${esc(gTypeLabel(t))}`).join(", ")}). Elle${bs.length > 1 ? "s" : ""} ser${bs.length > 1 ? "ont" : "a"} placée${bs.length > 1 ? "s" : ""} dans le stock <b>« En attente de redistribution »</b>, que vous pourrez répartir ensuite vers d'autres emplacements.</div>`
      : `<div class="muted small">Aucune bouteille n'y est stockée.</div>`}
    <label class="chk confirm-chk"><input type="checkbox" id="ld-ok"> Je confirme la suppression de <b>${esc(l.name)}</b></label></div>
    <footer><button class="btn" data-close>Annuler</button><button class="btn primary danger-bg" id="ld-yes" disabled>Supprimer l'emplacement</button></footer>`, "sm");
  const ok = m.querySelector("#ld-ok"), yes = m.querySelector("#ld-yes");
  ok.onchange = () => yes.disabled = !ok.checked;
  yes.onclick = async () => {
    if (!ok.checked) return; yes.disabled = true; closeModal();
    let locs = clone(settings().gasLocations || []).filter(x => x.id !== l.id);
    if (bs.length) {
      if (!locs.some(x => x.id === TEMP_LOC)) locs.push({ id: TEMP_LOC, name: "En attente de redistribution", temp: true });
      await saveSettings({ gasLocations: locs });
      for (const b of bs) await patch("bottles", b.id, { locationId: TEMP_LOC, lastMoveDate: today() });
      await save("gasMoves", null, { kind: "transfert", date: today(), serials: bs.map(b => b.serial), ref: `Suppression de l'emplacement « ${l.name} »`, locationId: TEMP_LOC, clientId: "", at: new Date().toISOString() });
    } else await saveSettings({ gasLocations: locs });
    render(true); toast(bs.length ? `Emplacement supprimé · ${plural(bs.length, "bouteille")} en attente de redistribution` : "Emplacement supprimé");
  };
};
ACTIONS["loc-redistribute"] = () => {
  const bs = inStockAt(TEMP_LOC).sort((a, b) => gTypeLabel(a.typeId).localeCompare(gTypeLabel(b.typeId)) || a.serial.localeCompare(b.serial));
  if (!bs.length) { toast("Le stock en attente est vide."); return; }
  const dest = locOptions().filter(([id]) => id !== TEMP_LOC);
  if (!dest.length) { toast("Créez d'abord un emplacement de destination."); return; }
  const m = modal(`${mHead("Redistribuer le stock en attente")}<form><div class="body stack-s">
    <div class="muted small">Cochez les bouteilles à déplacer puis choisissez leur nouvel emplacement. Vous pouvez répartir en plusieurs fois.</div>
    ${field("rd-dest", "Nouvel emplacement", dest[0][0], { type: "select", options: dest })}
    <div class="row-g"><button type="button" class="linkbtn small" id="rd-all">Tout cocher</button><button type="button" class="linkbtn small" id="rd-none">Tout décocher</button></div>
    <div class="tablewrap" style="max-height:340px;overflow:auto"><table><thead><tr><th></th><th>N° de série</th><th>Type</th><th>Statut</th></tr></thead><tbody>
    ${bs.map(b => `<tr><td><input type="checkbox" class="rd-b" value="${b.id}" checked></td><td class="mono">${esc(b.serial)}</td><td>${esc(gTypeLabel(b.typeId))}</td><td>${bChip(b.status)}</td></tr>`).join("")}</tbody></table></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" id="rd-go" ${dis()}>Déplacer la sélection</button></footer></form>`, "lg");
  const boxes = () => [...m.querySelectorAll(".rd-b")];
  m.querySelector("#rd-all").onclick = () => boxes().forEach(c => c.checked = true);
  m.querySelector("#rd-none").onclick = () => boxes().forEach(c => c.checked = false);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const ids = boxes().filter(c => c.checked).map(c => c.value), to = val("rd-dest");
    if (!ids.length) { toast("Cochez au moins une bouteille."); return; }
    m.querySelector("#rd-go").disabled = true;
    for (const id of ids) await patch("bottles", id, { locationId: to, lastMoveDate: today() });
    await save("gasMoves", null, { kind: "transfert", date: today(), serials: ids.map(id => S.bottles.find(b => b.id === id)?.serial).filter(Boolean), ref: "Redistribution du stock en attente", locationId: to, clientId: "", at: new Date().toISOString() });
    closeModal(); render(true);
    const left = inStockAt(TEMP_LOC).length;
    toast(`${plural(ids.length, "bouteille")} déplacée${ids.length > 1 ? "s" : ""} vers ${locName(to)}${left ? ` · ${left} encore en attente` : " · stock en attente vidé"}`);
  };
};

/* frais de transfert Airside (EXP) : par bouteille ou forfait par livraison */
function expLine(amount, nBottles) {
  const s = settings();
  if (s.expMode === "non" || !(+amount > 0) || !nBottles) return null;
  return { productId: "", cat: "gaz", label: s.expLabel || "Frais de transfert Airside (EXP)", qty: 1, price: +amount, vat: 21 };
}
/* ---------- opérations par scan ---------- */
const OPS = {
  reception: { title: "Réception de bouteilles pleines", btn: "Réceptionner" },
  livraison: { title: "Livraison chez un client", btn: "Valider la livraison" },
  retour_client: { title: "Retour de bouteilles vides d'un client", btn: "Enregistrer le retour" },
  retour_fournisseur: { title: "Retour de vides au fournisseur", btn: "Enregistrer le retour" }
};
ACTIONS["gas-op"] = el => gasOperation(el.dataset.op);
function gasOperation(op, preset) {
  const s = settings(), O = OPS[op];
  if (!S.gasTypes.length) { toast("Créez d'abord un type de bouteille."); UI.tab.gaz = "config"; location.hash = "#gaz"; render(true); return; }
  const typeOpts = [["", "Choisir…"], ...S.gasTypes.map(t => [t.id, gTypeLabel(t.id)])];
  const fieldsHtml = {
    reception: field("o-date", "Date de réception", today(), { type: "date" }) + field("o-ref", `N° bon de livraison ${s.supplierName}`, "", { cls: "mono" }) +
      field("o-loc", "Emplacement de stockage", locOptions()[0]?.[0], { type: "select", options: locOptions() }) + field("o-lot", "N° de lot", "", { cls: "mono" }) +
      field("o-fill", "Date de remplissage", today(), { type: "date" }) + field("o-type", "Type pour les nouvelles bouteilles", "", { type: "select", options: typeOpts }),
    livraison: field("o-client", "Client", preset?.clientId || "", { type: "select", options: clientOptions(), required: true }) + field("o-date", "Date de livraison", today(), { type: "date" }) +
      field("o-ref", "Référence client / bon de commande", "") +
      (s.expMode !== "non" ? field("o-exp", "Frais EXP HT (forfait livraison)", s.expAmount || 0, { type: "number", step: "0.01", min: 0 }) : ""),
    retour_client: field("o-date", "Date du retour", today(), { type: "date" }) + field("o-loc", "Emplacement de stockage", locOptions()[0]?.[0], { type: "select", options: locOptions() }) +
      field("o-client", "Client (facultatif, sinon repris de la bouteille)", "", { type: "select", options: clientOptions("Repris automatiquement") }),
    retour_fournisseur: field("o-date", "Date du retour", today(), { type: "date" }) + field("o-ref", "N° bon de retour", "", { cls: "mono" })
  }[op];
  let items = [];
  const F = () => ({ exp: +val("o-exp") || 0, date: val("o-date") || today(), ref: val("o-ref"), loc: val("o-loc"), lot: val("o-lot"), fill: val("o-fill"), type: val("o-type"), client: val("o-client") });
  const check = serial => {
    const b = bottleBySerial(serial), f = F();
    if (op === "reception") {
      if (!b) return f.type ? { lvl: "new", msg: "Nouvelle · " + gTypeLabel(f.type) } : { lvl: "err", msg: "Nouvelle : choisissez le type pour les nouvelles bouteilles" };
      if (b.status === "plein") return { lvl: "warn", msg: "Déjà pleine en stock · " + gTypeLabel(b.typeId) };
      return { lvl: "ok", msg: "Reconnue · " + gTypeLabel(b.typeId) + (b.status !== "fournisseur" ? " (était : " + B_STATUS[b.status][0].toLowerCase() + ")" : "") };
    }
    if (!b) return { lvl: "err", msg: "Inconnue : faites d'abord sa réception" };
    if (op === "livraison") {
      if (b.status !== "plein") return { lvl: "err", msg: "Pas livrable : " + B_STATUS[b.status][0].toLowerCase() };
      return { lvl: "ok", msg: gTypeLabel(b.typeId) + " · " + locName(b.locationId) };
    }
    if (op === "retour_client") {
      if (b.status === "client") return { lvl: "ok", msg: gTypeLabel(b.typeId) + " · de " + clientName(b.clientId) };
      return { lvl: "warn", msg: "N'était pas chez un client (" + B_STATUS[b.status][0].toLowerCase() + ")" };
    }
    if (b.status === "vide") return { lvl: "ok", msg: gTypeLabel(b.typeId) + " · " + locName(b.locationId) };
    return { lvl: "warn", msg: "Attention : " + B_STATUS[b.status][0].toLowerCase() };
  };
  const m = modal(`${mHead(O.title)}<form><div class="body"><div class="fields">${fieldsHtml}</div>${scanBox("scan")}
    <div id="scan-list"></div><div class="err" id="o-err"></div></div>
    <footer><div class="left muted" id="scan-count"></div><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" id="o-go">${O.btn}</button></footer></form>`, "lg");
  const draw = () => {
    items = items.map(i => Object.assign(i, check(i.serial)));
    const byLvl = l => items.filter(i => i.lvl === l).length;
    m.querySelector("#scan-list").innerHTML = items.length ? `<div class="scanlist">${items.map((i, k) => `<div class="scanitem ${i.lvl}"><span class="mono"><b>${esc(i.serial)}</b></span><span class="grow">${esc(i.msg)}</span><button type="button" class="x" data-rmscan="${k}" aria-label="Retirer">×</button></div>`).join("")}</div>`
      : `<div class="empty small">Aucune bouteille scannée.</div>`;
    let summary = plural(items.length, "bouteille");
    if (op === "livraison" && items.length) {
      const g = {}; items.filter(i => i.lvl === "ok").forEach(i => { const t = bottleBySerial(i.serial).typeId; g[t] = (g[t] || 0) + 1; });
      const ht = Object.entries(g).reduce((a, [t, n]) => a + n * (+gType(t)?.price || 0), 0);
      const ex = expLine(F().exp, items.filter(i => i.lvl === "ok").length);
      summary += ` · facture estimée ${eur(ht + (ex ? ex.qty * ex.price : 0))} HT${ex ? " dont EXP " + eur(ex.qty * ex.price) : ""}`;
    }
    if (byLvl("new")) summary += ` · ${byLvl("new")} nouvelle(s)`;
    m.querySelector("#scan-count").textContent = summary;
  };
  wireScan("scan", serial => {
    if (items.some(i => i.serial === serial)) { toast(serial + " est déjà dans la liste"); return; }
    items.unshift({ serial }); draw();
  });
  m.addEventListener("click", e => { const b = e.target.closest("[data-rmscan]"); if (b) { items.splice(+b.dataset.rmscan, 1); draw(); } });
  m.addEventListener("change", e => { if (e.target.id && e.target.id.startsWith("o-")) draw(); });
  draw();
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const err = m.querySelector("#o-err"), f = F();
    if (!items.length) { err.textContent = "Scannez au moins une bouteille."; return; }
    if (items.some(i => i.lvl === "err")) { err.textContent = "Retirez ou corrigez les lignes en rouge avant de valider."; return; }
    if (op === "livraison" && !f.client) { err.textContent = "Choisissez le client livré."; return; }
    const btn = m.querySelector("#o-go"); btn.disabled = true; btn.textContent = "Enregistrement…";
    try { await runGasOp(op, items.map(i => i.serial), f); }
    catch { btn.disabled = false; btn.textContent = O.btn; }
  };
}
async function runGasOp(op, serials, f) {
  const move = { kind: op, date: f.date, serials, ref: f.ref || "", locationId: f.loc || "", clientId: f.client || "", at: new Date().toISOString() };
  if (op === "reception") {
    for (const s of serials) {
      const b = bottleBySerial(s);
      const data = Object.assign(b ? strip(b) : { serial: s, typeId: f.type, firstSeen: f.date }, { status: "plein", locationId: f.loc, clientId: "", lot: f.lot || (b && b.lot) || "", fillDate: f.fill || f.date, lastMoveDate: f.date });
      await save("bottles", b ? b.id : bottleId(s), data);
    }
    move.lot = f.lot; await save("gasMoves", null, move);
    closeModal(); toast(`${plural(serials.length, "bouteille")} réceptionnée${serials.length > 1 ? "s" : ""}`); return;
  }
  if (op === "livraison") {
    const number = nextSeq(S.deliveries, "BL-" + f.date.slice(0, 4) + "-");
    const bottles = serials.map(s => { const b = bottleBySerial(s); return { serial: s, typeId: b.typeId, lot: b.lot || "", fillDate: b.fillDate || "" }; });
    const groups = {}; bottles.forEach(b => groups[b.typeId] = (groups[b.typeId] || 0) + 1);
    const lines = Object.entries(groups).map(([t, n]) => { const T = gType(t); return { productId: "", cat: "gaz", gasTypeId: t, label: gasLabel(T), qty: n, price: +T.price || 0, vat: +(T.vat ?? 21) }; });
    const ex = expLine(f.exp, serials.length); if (ex) lines.push(ex);
    const delId = uid();
    const invId = await createInvoice(f.client, lines, `Livraison ${number} du ${fmtDate(f.date)}${f.ref ? " · réf. " + f.ref : ""}. Bouteilles : ${serials.join(", ")}`, { deliveryId: delId, deliveryNo: number, source: "gaz" });
    await save("deliveries", delId, { number, clientId: f.client, date: f.date, ref: f.ref || "", bottles, invoiceId: invId, cocs: [] });
    for (const s of serials) { const b = bottleBySerial(s); await patch("bottles", b.id, { status: "client", clientId: f.client, locationId: "", lastMoveDate: f.date, lastDeliveryId: delId }); }
    move.deliveryId = delId; await save("gasMoves", null, move);
    toast(`Livraison ${number} enregistrée, facture brouillon créée`);
    openDelivery(delId); return;
  }
  if (op === "retour_client") {
    for (const s of serials) { const b = bottleBySerial(s); move.clientId = move.clientId || b.clientId || ""; await patch("bottles", b.id, { status: "vide", locationId: f.loc, lastClientId: b.clientId || f.client || "", clientId: "", lastMoveDate: f.date }); }
    await save("gasMoves", null, move);
    closeModal(); toast(`${plural(serials.length, "bouteille")} vide${serials.length > 1 ? "s" : ""} rentrée${serials.length > 1 ? "s" : ""} en stock`); return;
  }
  for (const s of serials) { const b = bottleBySerial(s); await patch("bottles", b.id, { status: "fournisseur", locationId: "", clientId: "", lastMoveDate: f.date }); }
  await save("gasMoves", null, move);
  closeModal(); toast(`${plural(serials.length, "bouteille")} renvoyée${serials.length > 1 ? "s" : ""} au fournisseur`);
}

/* ---------- fiche bouteille ---------- */
const MOVE_LBL = { transfert: "Changement d'emplacement", annulation: "Annulation de livraison", reception: "Réception fournisseur", livraison: "Livraison client", retour_client: "Retour client", retour_fournisseur: "Retour fournisseur", correction: "Correction manuelle" };
ACTIONS["bottle-open"] = el => {
  const b = S.bottles.find(x => x.id === el.dataset.id); if (!b) return;
  const hist = S.gasMoves.filter(mv => (mv.serials || []).includes(b.serial)).sort((a, c) => (c.date + c.at).localeCompare(a.date + a.at));
  const m = modal(`${mHead(`Bouteille <span class="mono">${esc(b.serial)}</span> ${bChip(b.status)}${demoTag(b)}`)}<div class="body">
    <dl class="kv"><dt>Type</dt><dd>${esc(gType(b.typeId) ? gasLabel(gType(b.typeId)) : "Type inconnu")}</dd>
    <dt>Emplacement</dt><dd>${b.status === "client" ? "Chez " + esc(clientName(b.clientId)) : esc(locName(b.locationId))}</dd>
    <dt>Lot</dt><dd class="mono">${esc(b.lot || "—")}</dd><dt>Remplie le</dt><dd>${fmtDate(b.fillDate)}</dd><dt>Connue depuis</dt><dd>${fmtDate(b.firstSeen)}</dd>
    <dt>Rotations</dt><dd>${hist.filter(h => h.kind === "livraison").length} livraisons</dd></dl>
    <h3>Historique</h3><div class="timeline">${hist.map(h => `<div><span class="num muted">${fmtDate(h.date)}</span> <b>${MOVE_LBL[h.kind] || h.kind}</b>${h.clientId ? " · " + esc(clientName(h.clientId)) : ""}${h.locationId ? " · " + esc(locName(h.locationId)) : ""}${h.ref ? ` · <span class="mono">${esc(h.ref)}</span>` : ""}</div>`).join("") || `<div class="muted">Aucun mouvement enregistré.</div>`}</div>
    <details><summary>Corriger cette bouteille</summary><form id="b-fix" class="stack" style="margin-top:10px"><div class="fields">
      ${field("b-type", "Type", b.typeId, { type: "select", options: S.gasTypes.map(t => [t.id, gTypeLabel(t.id)]) })}
      ${field("b-st", "Statut", b.status, { type: "select", options: Object.entries(B_STATUS).map(([k, v]) => [k, v[0]]) })}
      ${field("b-loc", "Emplacement", b.locationId, { type: "select", options: [["", "—"], ...locOptions()] })}
      ${field("b-cl", "Client", b.clientId, { type: "select", options: clientOptions("—") })}${field("b-lot", "Lot", b.lot, { cls: "mono" })}</div>
      <div><button class="btn" ${dis()}>Enregistrer la correction</button></div></form></details></div>
    <footer><div class="left"><button class="btn danger" data-a="bottle-del" data-id="${b.id}" ${dis()}>Supprimer la bouteille</button></div><button class="btn" data-close>Fermer</button></footer>`, "lg");
  m.querySelector("#b-fix").onsubmit = async e => {
    e.preventDefault();
    const st = val("b-st");
    await patch("bottles", b.id, { typeId: val("b-type"), status: st, locationId: st === "plein" || st === "vide" ? val("b-loc") : "", clientId: st === "client" ? val("b-cl") : "", lot: val("b-lot"), lastMoveDate: today() });
    await save("gasMoves", null, { kind: "correction", date: today(), serials: [b.serial], ref: "", locationId: val("b-loc"), clientId: st === "client" ? val("b-cl") : "", at: new Date().toISOString() });
    closeModal(); toast("Bouteille corrigée");
  };
};

ACTIONS["bottle-del"] = el => {
  const b = S.bottles.find(x => x.id === el.dataset.id); if (!b) return;
  const warn = b.status === "client" ? ` Elle est actuellement chez ${esc(clientName(b.clientId))} : elle n'apparaîtra plus dans son stock.` : "";
  confirmBox(`Supprimer la bouteille <span class="mono">${esc(b.serial)}</span> ?${warn} Son historique (livraisons, retours, certificats déjà émis) est conservé.`, async () => {
    await remove("bottles", b.id); closeModal(); toast("Bouteille supprimée");
  }, "Supprimer la bouteille");
};

/* ---------- livraison & COC ---------- */
ACTIONS["delivery-open"] = el => openDelivery(el.dataset.id);
async function openDelivery(id) {
  const d = await waitFind("deliveries", id); if (!d) { closeModal(); return; }
  const inv = S.docs.find(x => x.id === d.invoiceId);
  const m = modal(`${mHead(`Livraison <span class="mono">${esc(d.number)}</span>`)}<div class="body">
    <dl class="kv"><dt>Client</dt><dd><b>${esc(clientName(d.clientId))}</b></dd><dt>Date</dt><dd>${fmtDate(d.date)}</dd>${d.ref ? `<dt>Référence</dt><dd>${esc(d.ref)}</dd>` : ""}
    <dt>Facture</dt><dd>${!inv ? "—" : allowed("factures") ? `<a href="#factures" data-a="doc-open" data-id="${inv.id}" class="mono">${esc(inv.number)}</a> ${chip(invStatus(inv))} · ${eur(totals(inv).ttc)} TVAC` : `<span class="mono">${esc(inv.number)}</span> ${chip(invStatus(inv))}`}</dd></dl>
    <h3>Bouteilles livrées</h3><div class="tablewrap"><table><thead><tr><th>N° de série</th><th>Type</th><th>Lot</th><th>Remplie le</th></tr></thead><tbody>
    ${(d.bottles || []).map(b => `<tr><td class="mono">${esc(b.serial)}</td><td>${esc(gTypeLabel(b.typeId))}</td><td class="mono">${esc(b.lot || "—")}</td><td>${fmtDate(b.fillDate)}</td></tr>`).join("")}</tbody></table></div>
    ${(d.cocs || []).length ? `<div class="muted small">Certificats émis : ${(d.cocs || []).map(c => `${esc(c.number)} le ${fmtDate(c.date)} (${c.serials.length} bouteilles)`).join(" · ")}</div>` : ""}</div>
    <footer><div class="left"><button class="btn danger" data-a="delivery-del" data-id="${d.id}" ${dis()}>Supprimer…</button><button class="btn" data-a="bl-pdf" data-id="${d.id}">Bon de livraison PDF</button><button class="btn" data-a="delivery-mail" data-id="${d.id}">Préparer l'e-mail</button></div><button class="btn primary" data-a="coc-form" data-id="${d.id}">Certificat</button></footer>`, "lg");
}
ACTIONS["delivery-del"] = el => {
  const d = S.deliveries.find(x => x.id === el.dataset.id); if (!d) return;
  const inv = S.docs.find(x => x.id === d.invoiceId), draft = inv && inv.status === "brouillon";
  const still = (d.bottles || []).map(x => bottleBySerial(x.serial)).filter(b => b && b.status === "client" && b.clientId === d.clientId && (!b.lastDeliveryId || b.lastDeliveryId === d.id));
  const dest = locOptions();
  const m = modal(`${mHead(`Supprimer la livraison <span class="mono">${esc(d.number)}</span>`)}<div class="body stack-s">
    <div>Livraison du ${fmtDate(d.date)} à <b>${esc(clientName(d.clientId))}</b> · ${plural((d.bottles || []).length, "bouteille")}.</div>
    ${still.length ? `<label class="chk line"><input type="checkbox" id="dd-back" checked> Remettre en stock les ${plural(still.length, "bouteille")} encore chez le client (pleines)</label>
      ${dest.length ? field("dd-loc", "Emplacement", dest[0][0], { type: "select", options: dest }) : ""}` : `<div class="muted small">Les bouteilles de cette livraison ont déjà bougé depuis (retour, nouvelle livraison) : leur état actuel n'est pas modifié.</div>`}
    ${inv ? draft ? `<label class="chk line"><input type="checkbox" id="dd-inv" checked> Supprimer aussi la facture brouillon <span class="mono">${esc(inv.number)}</span></label>`
      : `<div class="banner warn">La facture <span class="mono">${esc(inv.number)}</span> est déjà émise : elle n'est pas supprimée. Établissez une note de crédit si nécessaire.</div>` : ""}
    <label class="chk confirm-chk"><input type="checkbox" id="dd-ok"> Je confirme la suppression de la livraison <b class="mono">${esc(d.number)}</b></label></div>
    <footer><button class="btn" data-close>Annuler</button><button class="btn primary danger-bg" id="dd-yes" disabled>Supprimer la livraison</button></footer>`, "sm");
  const ok = m.querySelector("#dd-ok"), yes = m.querySelector("#dd-yes");
  ok.onchange = () => yes.disabled = !ok.checked;
  yes.onclick = async () => {
    if (!ok.checked) return; yes.disabled = true;
    const back = still.length && m.querySelector("#dd-back")?.checked, loc = m.querySelector("#dd-loc")?.value || "";
    const delInv = !!(inv && draft && m.querySelector("#dd-inv")?.checked); closeModal();
    if (back) {
      for (const b of still) await patch("bottles", b.id, { status: "plein", clientId: "", locationId: loc, lastMoveDate: today(), lastDeliveryId: null });
      await save("gasMoves", null, { kind: "annulation", date: today(), serials: still.map(b => b.serial), ref: d.number, locationId: loc, clientId: d.clientId, at: new Date().toISOString() });
    }
    const moves = S.gasMoves.filter(mv => mv.deliveryId === d.id).map(mv => mv.id);
    if (moves.length) await removeMany("gasMoves", moves);
    if (delInv) await remove("docs", inv.id);
    else if (inv) await patch("docs", inv.id, { deliveryId: null, deliveryNo: null });
    await remove("deliveries", d.id);
    render(true); toast(`Livraison ${d.number} supprimée`);
  };
};
ACTIONS["coc-form"] = el => {
  const d = S.deliveries.find(x => x.id === el.dataset.id);
  const m = modal(`${mHead("Certificat de conformité (COC)")}<form><div class="body">
    <div class="muted">Livraison ${esc(d.number)} · ${esc(clientName(d.clientId))}. Décochez les bouteilles à exclure du certificat.</div>
    <div class="checklist">${(d.bottles || []).map((b, i) => `<label class="chk"><input type="checkbox" value="${i}" checked> <span class="mono"><b>${esc(b.serial)}</b></span> <span class="muted">${esc(gTypeLabel(b.typeId))} · lot ${esc(b.lot || "—")}</span></label>`).join("")}</div>
    <div class="fields">${field("coc-sign", "Signataire", "", { ph: "Nom et fonction" })}${field("coc-date", "Date du certificat", today(), { type: "date" })}</div>
    ${field("coc-note", "Mention complémentaire", "", { type: "textarea", wide: true })}<div class="err" id="coc-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Générer le certificat PDF</button></footer></form>`, "lg");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const sel = [...m.querySelectorAll(".checklist input:checked")].map(i => d.bottles[+i.value]);
    if (!sel.length) { m.querySelector("#coc-err").textContent = "Gardez au moins une bouteille cochée."; return; }
    const number = "COC-" + d.number.replace(/^BL-/, "") + ((d.cocs || []).length ? "-" + ((d.cocs || []).length + 1) : "");
    try {
      const a = [d, sel, number, val("coc-sign"), val("coc-date"), val("coc-note")];
      await withLang(clientLang(d.clientId), () => cocPdf(...a));
      if (!readOnly) await patch("deliveries", d.id, { cocs: [...(d.cocs || []), { number, date: val("coc-date"), serials: sel.map(b => b.serial) }] });
      openDelivery(d.id);
    } catch { toast("Le générateur PDF n'a pas pu se charger. Réessayez."); }
  };
};
async function cocPdf(d, bottles, number, signer, date, note) {
  const s = settings(), c = client(d.clientId), doc = await newPdf();
  pdfHeader(doc, "CERTIFICAT DE CONFORMITE", number, ["Date : " + fmtDate(date), "Livraison : " + d.number + " du " + fmtDate(d.date)]);
  pdfClient(doc, 52, c, "Client");
  doc.setFontSize(9.5);
  const txt = `Nous certifions que les bouteilles de gaz énumérées ci-dessous, livrées le ${fmtDate(d.date)}, sont conformes aux spécifications du produit indiquées, telles que garanties par le producteur (${s.supplierName}) pour les lots mentionnés.`;
  doc.text(doc.splitTextToSize(pdfTxt(txt), 180), 15, 80);
  let y = pdfTable(doc, 15, 92, [{ t: "N° de série", w: 34 }, { t: "Gaz / qualité", w: 42 }, { t: "Format", w: 24 }, { t: "Volume / pression", w: 34 }, { t: "Lot", w: 26 }, { t: "Remplie le", w: 20 }],
    bottles.map(b => { const t = gType(b.typeId) || {}; return [b.serial, `${t.gas || ""} ${t.grade || ""}`, t.size || "", `${t.volume || ""} L${t.pressure ? " / " + t.pressure + " bar" : ""}`, b.lot || "-", b.fillDate ? fmtDate(b.fillDate) : "-"]; }));
  y += 6; doc.text(pdfTxt(`Nombre de bouteilles certifiées : ${bottles.length}`), 15, y);
  if (note) { y += 7; doc.text(doc.splitTextToSize(pdfTxt(note), 180), 15, y); y += 6; }
  y = Math.max(y + 18, 230);
  doc.text(pdfTxt(`Fait le ${fmtDate(date)}, pour ${s.name}`), 15, y); doc.text(pdfTxt(signer || "Nom, fonction"), 15, y + 6);
  doc.setDrawColor(150); doc.line(120, y + 18, 195, y + 18); doc.setFontSize(8); doc.text("Signature", 120, y + 22);
  await offerFile(`${number}.pdf`, doc.output("arraybuffer"));
}
ACTIONS["bl-pdf"] = el => { const d = S.deliveries.find(x => x.id === el.dataset.id); return withLang(clientLang(d.clientId), () => blPdf(el)); };
ACTIONS["delivery-mail"] = el => { const d = S.deliveries.find(x => x.id === el.dataset.id); mailBox(d.clientId, (c, s) => MAIL.livraison[LANG](c, d, (d.bottles || []).length, s)); };
async function blPdf(el) {
  const d = S.deliveries.find(x => x.id === el.dataset.id);
  try {
    const doc = await newPdf(); const c = client(d.clientId);
    pdfHeader(doc, "BON DE LIVRAISON", d.number, ["Date : " + fmtDate(d.date), d.ref ? "Réf. : " + d.ref : ""].filter(Boolean));
    pdfClient(doc, 52, c, "Livré à");
    let y = pdfTable(doc, 15, 82, [{ t: "N° de série", w: 45 }, { t: "Type de bouteille", w: 95 }, { t: "Lot", w: 40 }], (d.bottles || []).map(b => [b.serial, gTypeLabel(b.typeId), b.lot || "-"]));
    y += 8; doc.setFontSize(9.5); doc.text(pdfTxt(`Total : ${(d.bottles || []).length} bouteille(s). Les bouteilles restent la propriété du fournisseur et doivent être restituées vides.`), 15, y);
    doc.text("Signature du client :", 15, y + 20); doc.line(55, y + 20, 120, y + 20);
    await offerFile(`${d.number}.pdf`, doc.output("arraybuffer"));
  } catch { toast("Le générateur PDF n'a pas pu se charger. Réessayez."); }
}
