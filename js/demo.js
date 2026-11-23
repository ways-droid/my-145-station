/* =========================================================================
   Données d'exemple à la demande (Paramètres → Données d'exemple)
   Tout ce qui est créé ici porte demo: true → repère « Exemple » et suppression en un clic.
   ========================================================================= */
const DEMO_SETS = [
  ["personnel", "Personnel et roster", "5 personnes, licences, qualifications, documents, roster du mois"],
  ["clients", "Clients & tarifs", "3 compagnies aériennes, 6 tarifs"],
  ["flotte", "Véhicules", "4 véhicules, entretiens, panne, pneus"],
  ["etalonnage", "Outillage", "1 laboratoire, 6 outils (au labo, échéance proche ou dépassée…)"]
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
  const cl = [["Example Cargo Airlines", "EX", "9X-", "Malta"], ["Demo Air Freight", "DM", "OO- OE-", "Belgium"], ["Fictive Cargo", "FC", "4X-", "Israel"]];
  const ids = [];
  for (const [name, code, regPrefixes, city] of cl) { const id = dId("c"); ids.push(id); await save("clients", id, { name, code, regPrefixes, city, contact: "Maintenance Control", email: "", phone: "", address: "", vat: "", lang: "en", notes: "Sample customer", demo: true }); }
  const pr = [["PKG-767", "Transit check 767 (sample)", "forfait", "767", "EA", 1200], ["PKG-777", "Transit check 777 (sample)", "forfait", "777", "EA", 1400], ["CRS-H", "CRS MHRS (sample)", "heure", "", "MHRS", 95],
    ["NCRS-H", "NON-CRS MHRS (sample)", "heure", "", "MHRS", 75], ["GPU", "GPU (sample)", "materiel", "", "HR", 60], ["N2", "Azote (sample)", "materiel", "", "EA", 40]];
  for (const [ref, name, kind, acType, unit, price] of pr) await save("products", dId("p"), { ref, name, kind, acType, unit, price, currency: "EUR", clientId: ["PKG-767", "PKG-777"].includes(ref) ? ids[0] : "", notes: "", demo: true });
  return ids;
}
async function demoFleet() {
  const drivers = ["Alex Example", "Sam Demo"];
  const used = new Set(S.vehicles.map(v => fleetNo(v)));
  let n = 1; const nextNo = () => { while (used.has("EX" + n)) n++; used.add("EX" + n); return "EX" + n; };
  const L3 = () => Array.from({ length: 3 }, () => pick("ABCDEFGHJKLMNPRSTUVWXYZ")).join("");
  const defs = [["Renault Master (sample)", "Diesel", 148200, 20, 400, "actif"], ["Peugeot 208 (sample)", "Essence", 62100, -10, 200, "actif"], ["Ford Transit (sample)", "Diesel", 211000, 5, -15, "atelier"], ["Toyota Yaris (sample)", "Hybride", 33500, 300, 120, "actif"]];
  for (const [model, fuel, km, ctIn, insIn, status] of defs) {
    const id = dId("v"), ct = addDays(today(), ctIn), ins = addDays(today(), insIn), drv = pick(drivers);
    await save("vehicles", id, { cat: "route", fleetNo: nextNo(), plate: "1-" + L3() + "-" + String(100 + Math.floor(Math.random() * 899)), model, year: String(2016 + Math.floor(Math.random() * 8)), fuel, km, status,
      driver: drv, driverDate: dAgo(3), nextServiceDate: addDays(today(), 25), nextServiceKm: Math.ceil((km + 5000) / 5000) * 5000, ctDate: ct, insuranceDate: ins, vin: "",
      docs: [{ id: uid(), type: "ct", name: "Roadworthiness test", number: "EX-CT", issued: addDays(ct, -365), expires: ct, note: "Sample" }, { id: uid(), type: "assurance", name: "Insurance (sample)", number: "EX-POL", issued: addDays(ins, -365), expires: ins, note: "" }], demo: true });
    await save("vehEvents", dId("e"), { vehicleId: id, type: "entretien", date: dAgo(90), km: km - 8000, cost: 380, supplier: "Example Garage", description: "Annual service (sample)", status: "realisee", invoiceRef: "", faultId: "", demo: true });
    await save("driverLogs", dId("l"), { vehicleId: id, driver: drv, date: dAgo(3), km, note: "", at: new Date().toISOString(), demo: true });
    if (status === "atelier") await save("faults", dId("f"), { vehicleId: id, reporter: drv, date: dAgo(2), km, severity: "bloquante", description: "Brake noise (sample)", status: "signalee", estDate: "", photo: "", note: "", at: new Date().toISOString(), demo: true });
  }
  await save("tires", dId("t"), { width: 205, ratio: 55, rim: 16, load: "91", speed: "V", type: "Hiver", brand: "Michelin", model: "Alpin (sample)", state: "neuf", qty: 4, location: "Rack (sample)", dot: "3825", note: "", demo: true });
}
async function demoStaff() {
  const T = acTypes(), r = n => Object.fromEntries(T.slice(0, n).map((t, i) => [t, ["E+I", "E", "E+F"][i % 3]]));
  const ppl = [["Alex Example", "lead", ["B1", "B2"], 3, 20], ["Sam Demo", "foreman", ["B1"], 2, 45], ["Charlie Fictive", "engineer", ["B1"], 2, -5], ["Dana Test", "mechanic", [], 0, 200], ["Robin Trial", "storekeeper", [], 0, 120]];
  const ym = today().slice(0, 7), nd = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(), pat = [["D", "D", "D", "OFF", "OFF", "N", "N", "N", "OFF", "OFF"], ["N", "N", "OFF", "OFF", "D", "D", "D/N", "OFF", "T", "D"], ["T", "D", "D", "D", "OFF", "N", "N", "OFF", "LGG", "LGG"], ["TLV", "D", "D", "OFF", "OFF", "OJT", "D", "D", "OFF", "OFF"], ["D", "D", "D", "D", "D", "OFF", "OFF", "D", "D", "D"]];
  let k = 0;
  for (const [name, fn, lic, nr, visaIn] of ppl) { const sid = dId("s"), row = pat[k++ % pat.length], days = {};
    for (let i = 1; i <= nd; i++) days[i] = { c: row[(i - 1) % row.length] };
    await save("roster", sid + "_" + ym, { staffId: sid, month: ym, days, demo: true });
    await save("staff", sid, { name: name + " (sample)", function: fn, employer: "Example Technic", base: "TLV", email: "", phone: "", active: true, shift: pick(["day", "night"]),
    licences: lic.map(cat => ({ cat, number: "EX." + cat + "." + String(1000 + Math.floor(Math.random() * 8999)), authority: "Example CAA", expires: addDays(today(), 400) })), ratings: r(nr),
    docs: [{ id: uid(), type: "visa", name: "Work visa (sample)", number: "EX-V", issued: dAgo(300), expires: addDays(today(), visaIn) }, { id: uid(), type: "ramp", name: "TLV", number: "EX-R", issued: dAgo(200), expires: addDays(today(), visaIn + 60) }],
    notes: "", demo: true }); }
}
async function demoCalib() {
  const lab = dId("lab");
  await save("labs", lab, { name: "Example Lab", contact: "", email: "", phone: "", address: "", accreditation: "ISO 17025 (sample)", leadDays: 14, notes: "", demo: true });
  const tools = [["Torque wrench 20-100 Nm", "service", 200], ["Fluke 87V multimeter", "service", 20], ["Tyre pressure gauge 0-250 psi", "lab", 3], ["Caliper 150 mm", "service", -4], ["Cable tensiometer", "us", 90], ["Open-end wrench set", "service", null]];
  let n = 1;
  for (const [name, status, dueIn] of tools) {
    const no = "EX-T-" + String(n++).padStart(3, "0");
    await save("tools", dId("o"), { toolNo: no, name: name + " (sample)", pn: "", serial: "", brand: "", model: "", category: "", location: "Box " + (1 + n % 2), owner: settings().name || "", calRequired: dueIn !== null, intervalMonths: 12, status,
      lastCalDate: dueIn !== null ? addDays(today(), dueIn - 365) : "", nextDue: dueIn !== null ? addDays(today(), dueIn) : "", job: status === "lab" ? { labId: lab, sentDate: dAgo(6), ref: "EX-001", expected: addDays(today(), 8) } : undefined,
      photos: [], certs: [], history: [], shipments: [], notes: "", demo: true });
  }
}
ACTIONS["demo-gen"] = async el => {
  const sel = [...document.querySelectorAll(".dg-opt:checked")].map(c => c.value);
  if (!sel.length) { toast("Cochez au moins un type de données."); return; }
  el.disabled = true; const label = el.textContent;
  const run = { personnel: demoStaff, clients: demoClients, flotte: demoFleet, etalonnage: demoCalib };
  try {
    for (const k of sel) { el.textContent = "Création : " + DEMO_SETS.find(d => d[0] === k)[1] + "…"; await run[k](); }
    toast("Données d'exemple créées");
  } catch (e) { toast("Création interrompue" + (e && e.message ? " : " + e.message : "")); }
  el.disabled = false; el.textContent = label; staticDone = null; render(true);
};
