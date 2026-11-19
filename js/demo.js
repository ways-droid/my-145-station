/* =========================================================================
   Données d'exemple à la demande (Paramètres → Données d'exemple)
   Tout ce qui est créé ici porte demo: true → repère « Exemple » et suppression en un clic.
   ========================================================================= */
const DEMO_SETS = [
  ["clients", "Clients & articles", "4 clients, 6 articles et services"],
  ["factures", "Factures & devis", "3 factures, 1 note de crédit, 2 devis"],
  ["gaz", "Gaz", "3 types, 20 bouteilles, mouvements"],
  ["flotte", "Flotte", "4 véhicules, entretiens, panne, amende, pneus, 2 chauffeurs"],
  ["etalonnage", "Étalonnage", "1 laboratoire, 5 outils à différents stades"]
];
function demoGenHtml() {
  return `<div class="demo-gen"><div class="small">Créer des données d'exemple pour tester une partie de l'application. Elles portent le repère ${demoTag({ demo: true })} et se suppriment toutes ensemble.</div>
    <div class="demo-grid">${DEMO_SETS.map(([k, l, d]) => `<label class="chk line demo-opt"><input type="checkbox" class="dg-opt" value="${k}"> <b>${l}</b><span class="muted small"> · ${d}</span></label>`).join("")}</div>
    <div><button class="btn" data-a="demo-gen" ${dis()}>Créer les données d'exemple sélectionnées</button></div></div>`;
}
const dId = p => "demo-" + p + "-" + uid();
const pick = a => a[Math.floor(Math.random() * a.length)];
const dAgo = n => addDays(today(), -n);
async function demoClients() {
  const cl = [["Brasserie Exemple SRL", "Liège", "Julie Exemple"], ["Atelier Démo SA", "Namur", "Marc Démo"], ["Liège Test Airport", "Grâce-Hollogne", "Service technique"], ["Fictif Logistics BV", "Antwerpen", "Jan Fictief"]];
  const ids = [];
  for (const [name, city, contact] of cl) { const id = dId("c"); ids.push(id); await save("clients", id, { name, city, contact, email: "", phone: "", address: "Rue de l'Exemple 1", vat: "BE0000.000.000", lang: city === "Antwerpen" ? "en" : "fr", notes: "", createdAt: today(), demo: true }); }
  const pr = [["EX-SRV", "Conseil (exemple)", "service", "heure", 95], ["EX-JOUR", "Journée sur site (exemple)", "service", "jour", 680], ["EX-DEP", "Déplacement (exemple)", "service", "forfait", 45],
    ["EX-GANT", "Gants de protection (exemple)", "produit", "paire", 6.5], ["EX-DET", "Détendeur (exemple)", "produit", "pièce", 189], ["EX-CAL", "Étalonnage clé dynamométrique (exemple)", "etalonnage", "pièce", 65]];
  for (const [ref, name, kind, unit, price] of pr) await save("products", dId("p"), { ref, name, kind, unit, price, vat: 21, cost: 0, stock: kind === "produit" ? 20 : 0, minStock: kind === "produit" ? 5 : 0, demo: true });
  return ids;
}
async function demoInvoices() {
  let cs = S.clients.filter(c => c.demo).map(c => c.id);
  if (!cs.length) cs = await demoClients();
  const line = (label, qty, price) => ({ productId: "", label, qty, price, vat: 21 });
  const mk = async (kind, st, ago, lines, extra) => {
    const date = dAgo(ago), number = nextNumber(kind, date);
    const id = await save("docs", dId(kind), Object.assign({ kind, number, clientId: pick(cs), date, dueDate: addDays(date, kind === "devis" ? 30 : 30), status: st, lines, notes: "Document d'exemple", demo: true }, extra || {}));
    return { id, number };
  };
  const f1 = await mk("facture", "payee", 60, [line("Journée de prestation (exemple)", 2, 680), line("Déplacement (exemple)", 1, 45)], { paidAt: dAgo(40) });
  await mk("facture", "envoyee", 12, [line("Conseil (exemple)", 6, 95)]);
  await mk("facture", "envoyee", 50, [line("Étalonnage clé dynamométrique (exemple)", 4, 65)]);
  await mk("nc", "envoyee", 30, [line("Remise commerciale (exemple)", 1, 45)], { creditFor: f1.id, creditForNo: f1.number, dueDate: dAgo(30) });
  await mk("devis", "envoye", 5, [line("Journée de prestation (exemple)", 3, 680)]);
  await mk("devis", "brouillon", 1, [line("Détendeur (exemple)", 2, 189)]);
}
async function demoGas() {
  let locs = settings().gasLocations || [];
  if (!locs.filter(l => !l.temp).length) { locs = [...locs, { id: "L" + uid(), name: "Dépôt (exemple)" }]; await saveSettings({ gasLocations: locs }); }
  const loc = locs.filter(l => !l.temp);
  const types = [["Azote", "5.0", "B50", 50, 68], ["Argon", "4.6", "B20", 20, 54], ["CO2", "", "B37", 40, 49]];
  const tIds = [];
  for (const [gas, grade, size, volume, price] of types) { const id = dId("g"); tIds.push(id); await save("gasTypes", id, { gas, grade, size, volume, pressure: 200, content: "", price, vat: 21, minFull: 3, demo: true }); }
  const cs = S.clients.map(c => c.id);
  const serials = [];
  for (let i = 0; i < 20; i++) {
    const serial = "EX" + String(100000 + Math.floor(Math.random() * 899999)), st = i < 10 ? "plein" : i < 15 ? "vide" : cs.length ? "client" : "plein";
    serials.push(serial);
    await save("bottles", bottleId(serial), { serial, typeId: tIds[i % 3], status: st, locationId: st === "client" ? "" : pick(loc).id, clientId: st === "client" ? pick(cs) : "", lot: "EX-" + (2600 + i), fillDate: dAgo(20 + i), lastMoveDate: dAgo(i), firstSeen: dAgo(200), demo: true });
  }
  await save("gasMoves", dId("m"), { kind: "reception", date: dAgo(20), serials: serials.slice(0, 10), ref: "Exemple", locationId: loc[0].id, clientId: "", at: new Date().toISOString(), demo: true });
}
async function demoFleet() {
  const drivers = ["Alex Exemple", "Sam Démo"];
  const s = settings(), have = s.drivers || [];
  const add = drivers.filter(d => !have.includes(d));
  if (add.length) await saveSettings({ drivers: [...have, ...add], demoDrivers: [...new Set([...(s.demoDrivers || []), ...add])] });
  const used = new Set(S.vehicles.map(v => fleetNo(v)));
  let n = 1; const nextNo = () => { while (used.has("EX" + n)) n++; used.add("EX" + n); return "EX" + n; };
  const L3 = () => Array.from({ length: 3 }, () => pick("ABCDEFGHJKLMNPRSTUVWXYZ")).join("");
  const defs = [["Renault Master (exemple)", "Diesel", 148200, 20, 400, "actif"], ["Peugeot 208 (exemple)", "Essence", 62100, -10, 200, "actif"], ["Ford Transit (exemple)", "Diesel", 211000, 5, -15, "atelier"], ["Toyota Yaris (exemple)", "Hybride", 33500, 300, 120, "actif"]];
  for (const [model, fuel, km, ctIn, insIn, status] of defs) {
    const id = dId("v"), ct = addDays(today(), ctIn), ins = addDays(today(), insIn), drv = pick(drivers);
    await save("vehicles", id, { cat: "route", fleetNo: nextNo(), plate: "1-" + L3() + "-" + String(100 + Math.floor(Math.random() * 899)), model, year: String(2016 + Math.floor(Math.random() * 8)), fuel, km, status,
      driver: drv, driverDate: dAgo(3), nextServiceDate: addDays(today(), 25), nextServiceKm: Math.ceil((km + 5000) / 5000) * 5000, ctDate: ct, insuranceDate: ins, webfleetId: "", vin: "",
      docs: [{ id: uid(), type: "ct", name: "Contrôle technique", number: "EX-CT", issued: addDays(ct, -365), expires: ct, note: "Exemple" }, { id: uid(), type: "assurance", name: "Assurance (exemple)", number: "EX-POL", issued: addDays(ins, -365), expires: ins, note: "" }], demo: true });
    await save("vehEvents", dId("e"), { vehicleId: id, type: "entretien", date: dAgo(90), km: km - 8000, cost: 380, supplier: "Garage Exemple", description: "Entretien annuel (exemple)", status: "realisee", invoiceRef: "", faultId: "", demo: true });
    await save("driverLogs", dId("l"), { vehicleId: id, driver: drv, date: dAgo(3), km, note: "", at: new Date().toISOString(), demo: true });
    if (status === "atelier") await save("faults", dId("f"), { vehicleId: id, reporter: drv, date: dAgo(2), km, severity: "bloquante", description: "Bruit au freinage (exemple)", status: "signalee", estDate: "", photo: "", note: "", at: new Date().toISOString(), demo: true });
    if (model.startsWith("Peugeot")) await save("fines", dId("a"), { vehicleId: id, driver: drv, date: dAgo(6), time: "08:15", type: "vitesse", place: "E42 (exemple)", pvNumber: "PV-EXEMPLE", authority: "police", authName: "Zone de police (exemple)", amount: 116,
      description: "", receivedDate: dAgo(4), designRequired: true, designDue: addDays(today(), 10), designatedDate: "", payDue: addDays(today(), 25), paidDate: "", paidBy: "societe", bearer: "chauffeur", refundAmount: 116, refundDate: "", refundHow: "retenue",
      contested: false, contestedDate: "", contestDue: "", contestDoneDate: "", contestDone: false, cancelled: false, note: "", demo: true });
  }
  await save("tires", dId("t"), { width: 205, ratio: 55, rim: 16, load: "91", speed: "V", type: "Hiver", brand: "Michelin", model: "Alpin (exemple)", state: "neuf", qty: 4, location: "Rack (exemple)", dot: "3825", note: "", demo: true });
}
async function demoCalib() {
  const cs = S.clients.map(c => c.id);
  const lab = dId("lab");
  await save("labs", lab, { name: "Laboratoire Exemple", contact: "", email: "", phone: "", address: "", accreditation: "BELAC (exemple)", notes: "", demo: true });
  const tools = [["recu", "Clé dynamométrique 20-100 Nm"], ["picked", "Multimètre Fluke 87V"], ["labo", "Manomètre 0-250 bar"], ["a_livrer", "Pied à coulisse 150 mm"], ["dropped", "Thermomètre de contact"]];
  for (const [status, name] of tools) {
    const recv = dAgo(10 + Math.floor(Math.random() * 10));
    await save("tools", dId("o"), { serial: "EX-" + String(1000 + Math.floor(Math.random() * 8999)), name: name + " (exemple)", brand: "", model: "", category: "", clientId: cs.length ? pick(cs) : "", intervalMonths: 12, calPrice: 65, status,
      job: { receivedDate: recv, movedAt: dAgo(2), labId: status === "labo" ? lab : "" }, lastCalDate: dAgo(365), nextDue: addDays(today(), 5), photos: [], certs: [], history: [], notes: "", createdAt: recv, demo: true });
  }
}
ACTIONS["demo-gen"] = async el => {
  const sel = [...document.querySelectorAll(".dg-opt:checked")].map(c => c.value);
  if (!sel.length) { toast("Cochez au moins un type de données."); return; }
  el.disabled = true; const label = el.textContent;
  const run = { clients: demoClients, factures: demoInvoices, gaz: demoGas, flotte: demoFleet, etalonnage: demoCalib };
  try {
    for (const k of sel) { el.textContent = "Création : " + DEMO_SETS.find(d => d[0] === k)[1] + "…"; await run[k](); }
    toast("Données d'exemple créées");
  } catch (e) { toast("Création interrompue" + (e && e.message ? " : " + e.message : "")); }
  el.disabled = false; el.textContent = label; staticDone = null; render(true);
};
