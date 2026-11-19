"use strict";
/* ======================= FLOTTE ======================= */
const EV_TYPES = { entretien: "Entretien périodique", reparation: "Réparation", diagnostic: "Recherche de panne", remplacement: "Remplacement de pièce", pneus: "Pneus", controle: "Contrôle technique", carrosserie: "Carrosserie", autre: "Autre" };
const SEV = { mineure: ["Mineure", "info"], importante: ["Importante", "orange"], bloquante: ["Bloquante · véhicule immobilisé", "bad"] };
const FAULT_ST = { attente: ["En attente de validation", "orange"], ouverte: ["Ouverte", "warn"], planifiee: ["Réparation planifiée", "info"], reparee: ["Réparée", "good"] };
const FAULT_KIND = { panne: "Panne", defaut: "Défaut", tache: "Tâche" };
const garageName = id => ((S.garages || []).find(g => g.id === id) || {}).name || "";
const veh = id => S.vehicles.find(v => v.id === id);
/* identifiant W.A.Y.S. du véhicule : 000 à 999, jamais réutilisé (même après retrait ou suppression) */
/* lettres et chiffres, en majuscules ; un identifiant uniquement numérique est complété à 3 chiffres (14 → 014) */
const normFleetNo = x => { const t = String(x ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return /^\d+$/.test(t) ? t.padStart(3, "0") : t; };
const fleetNo = v => v && v.fleetNo != null && v.fleetNo !== "" ? normFleetNo(v.fleetNo) : "";
const noBadge = (v, sm) => fleetNo(v) ? `<span class="fleetno ${sm ? "sm" : ""}" title="Identifiant W.A.Y.S.">${fleetNo(v)}</span>` : "";
const usedFleetNos = exceptId => new Set([...S.vehicles.filter(v => v.id !== exceptId).map(fleetNo).filter(Boolean), ...(settings().usedFleetNos || [])]);
function nextFleetNo() { const used = usedFleetNos(); const max = Math.max(0, ...[...used].filter(x => /^\d+$/.test(x)).map(Number)); for (let i = max + 1; i < 1000; i++) { const n = String(i).padStart(3, "0"); if (!used.has(n)) return n; } for (let i = 0; i < 1000; i++) { const n = String(i).padStart(3, "0"); if (!used.has(n)) return n; } return ""; }
const activeVehicles = () => S.vehicles.filter(v => !v.retired);
const retiredVehicles = () => S.vehicles.filter(v => v.retired && !v.archived);
const archivedVehicles = () => S.vehicles.filter(v => v.retired && v.archived);
const VCAT = [["route", "Véhicules routiers", "Voitures, camionnettes, utilitaires immatriculés"], ["route_autre", "Véhicules routiers autres", "Remorques, semi-remorques et autres engins immatriculés"], ["chantier", "Véhicules de chantier", "Chariots élévateurs, engins et matériel non immatriculés"]];
const catOf = v => VCAT.some(c => c[0] === v.cat) ? v.cat : "route";
const isActiveVeh = id => { const v = veh(id); return v && !v.retired; };
const RETIRE_REASONS = { vendu: "Vendu", repris: "Repris (fin de leasing / reprise)", epave: "Hors d'usage / épave", vole: "Volé", autre: "Autre motif" };
const vehLabel = id => { const v = veh(id); return v ? `${fleetNo(v) ? fleetNo(v) + " · " : ""}${v.plate} · ${v.model}` : "Véhicule supprimé"; };
const openFaults = vid => S.faults.filter(f => f.vehicleId === vid && f.status !== "reparee");
function vehState(v) {
  if (v.retired) return [v.retired.reason === "vendu" ? "Vendu" : "Retiré de la flotte", "dark"];
  const of = openFaults(v.id);
  if (v.status === "hors_service") return ["Hors service", ""];
  if (of.some(f => f.severity === "bloquante")) return ["Immobilisé", "bad"];
  if (v.status === "atelier") return ["À l'atelier", "warn"];
  if (of.length) return [`${of.length} panne${of.length > 1 ? "s" : ""} signalée${of.length > 1 ? "s" : ""}`, "warn"];
  return ["Disponible", "good"];
}
const vChip = v => { const [l, c] = vehState(v); return `<span class="chip ${c}">${l}</span>`; };
/* dernier chauffeur : le plus récent entre la prise en charge saisie dans l'ERP et Webfleet (position, trajets) — aucune attribution */
function lastDrv(v) {
  const c = [];
  if (v.driver) c.push({ name: v.driver, at: v.driverDate || "", src: "erp" });
  const p = typeof posOf === "function" ? posOf(v.id) : null;
  if (p && p.driver) c.push({ name: p.driver, at: p.at || "", src: "webfleet" });
  const tr0 = (S.trips || []).filter(t => t.vehicleId === v.id && t.driver).sort((a, b) => (b.end || b.start || "").localeCompare(a.end || a.start || ""))[0];
  if (tr0) c.push({ name: tr0.driver, at: tr0.end || tr0.start || "", src: "webfleet" });
  return c.sort((a, b) => (b.at || "").localeCompare(a.at || ""))[0] || null;
}
const lastDrvHtml = (v, sep) => { const d = lastDrv(v); return d ? `${esc(d.name)}${d.at ? `${sep}<span class="muted">${d.src === "webfleet" ? "Webfleet · " : ""}${fmtDate(d.at.slice(0, 10))}</span>` : ""}` : "—"; };
const driverOptions = cur => { const ds = settings().drivers || []; const all = cur && !ds.includes(cur) ? [cur, ...ds] : ds; return [["", "Choisir…"], ...all.map(d => [d, d])]; };

/* tâches à venir : échéances véhicule, interventions planifiées, réparations estimées */
function fleetTasks(horizon = 45) {
  const lim = addDays(today(), horizon), out = [];
  for (const v of activeVehicles()) {
    if (v.status === "hors_service") continue;
    const add = (date, label, kind) => { if (date && date <= lim) out.push({ date, label, vid: v.id, kind }); };
    add(v.nextServiceDate, "Entretien prévu", "entretien");
    add(v.ctDate, "Contrôle technique", "ct");
    add(v.insuranceDate, "Échéance assurance", "assurance");
    for (const d of Object.values(currentDocs(v))) if (d.expires && !["assurance", "ct"].includes(d.type)) add(d.expires, `Document : ${VDOC_TYPES[d.type] || d.type}${d.name ? " (" + d.name + ")" : ""}`, "doc");
    if (+v.nextServiceKm && kmOf(v) && +v.nextServiceKm - kmOf(v) <= 1500) out.push({ date: today(), label: `Entretien dans ${fmtN.format(Math.max(0, Math.round(v.nextServiceKm - kmOf(v))))} km`, vid: v.id, kind: "km" });
  }
  for (const e of S.vehEvents.filter(e => e.status === "planifiee")) out.push({ date: e.date, label: (EV_TYPES[e.type] || e.type) + (e.description ? " · " + e.description : ""), vid: e.vehicleId, kind: "planif" });
  for (const f of S.fines || []) { const n = fineNext(f); if (n && n.date <= lim && veh(f.vehicleId)) out.push({ date: n.date, label: `Amende ${f.pvNumber ? "PV " + f.pvNumber : ""} · ${n.label}${f.driver ? " · " + f.driver : ""}`, vid: f.vehicleId, kind: "amende", fineId: f.id }); }
  for (const f of S.faults.filter(f => f.status !== "reparee" && isActiveVeh(f.vehicleId))) out.push({ date: f.estDate || f.date, label: "Panne : " + f.description, vid: f.vehicleId, kind: "panne", est: !!f.estDate, sev: f.severity });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function taskRow(t) {
  const d = daysBetween(today(), t.date);
  const when = d < 0 ? `<span class="chip bad">En retard</span>` : d === 0 ? `<span class="chip warn">Aujourd'hui</span>` : `<span class="num muted">${fmtDate(t.date)}</span>`;
  const K = TASK_KINDS[t.kind];
  return `<div class="list-row click task-row ${K ? "c-" + K[1] : ""}" ${t.fineId ? `data-a="fine-form" data-id="${t.fineId}"` : `data-a="veh-open" data-id="${t.vid}"`}><div><div>${K ? `<span class="tk">${K[0]}</span> ` : ""}${esc(t.label)}</div><div class="muted small">${esc(vehLabel(t.vid))}${t.kind === "panne" && !t.est ? " · réparation non planifiée" : ""}</div></div><div>${when}</div></div>`;
}
const evCost = e => +e.cost || 0;
const yearCost = (vid, y) => S.vehEvents.filter(e => e.vehicleId === vid && e.status !== "planifiee" && (e.date || "").startsWith(y)).reduce((a, e) => a + evCost(e), 0);

/* onglets selon le rôle : garage et chauffeur ne voient que l'essentiel */
function fleetTabs(nf) {
  const nv = S.faults.filter(f => f.status === "attente").length;
  const all = [["vehicules", "Véhicules"], ["chauffeurs", "Chauffeurs", (settings().drivers || []).length || ""], ["garages", ME && ME.role === "garage" ? "Mon garage" : "Garages", ME && ME.role === "garage" ? "" : (S.garages || []).length || ""], ["positions", "Positions"], ["trajets", ME && ME.role === "chauffeur" ? "Mes trajets" : "Trajets"], ["taches", "À faire", fleetTasks(+todoF().days || 60).length], ["pannes", "Pannes et défauts", nf, nf > 0 || (isOffice() && nv > 0)], ["documents", "Documents", fleetDocAlerts() || ""], ["pneus", "Pneus en stock", tireStockCount() || ""], ["amendes", ME && ME.role === "chauffeur" ? "Mes amendes" : "Amendes", fineActionCount() || ""], ["entretiens", "Entretiens & travaux"], ["stats", "Coûts"]];
  const keep = ME && ME.role === "garage" ? ["vehicules", "garages", "pannes", "entretiens"] : ME && ME.role === "chauffeur" ? ["vehicules", "pannes", "trajets", "amendes"] : null;
  return keep ? all.filter(t => keep.includes(t[0])) : all;
}
VIEWS.flotte = {
  render() {
    const tab = curTab("flotte", "vehicules");
    const nf = S.faults.filter(f => f.status !== "reparee" && isActiveVeh(f.vehicleId)).length;
    const nr = retiredVehicles().length;
    return head("Flotte", ME && ME.role === "garage" ? plural(S.vehicles.filter(v => v.atMyGarage).length, "véhicule") + " de W.A.Y.S. dans votre garage" : plural(activeVehicles().length, "véhicule") + " en service" + (nr ? ` · ${nr} retiré${nr > 1 ? "s" : ""}` : ""), isOffice() ? `<button class="btn" data-a="wf-import" ${dis()}>⇪ Importer Webfleet (CSV)</button><button class="btn" data-a="dbx-import" ${dis()}>⇪ Importer documents (Dropbox)</button>` : "",
      `<button class="btn btn-alert big" data-a="fault-form" ${dis()}>⚠ Signaler une panne</button>${isOffice() || (ME && ME.role === "terrain") ? `<button class="btn primary big" data-a="veh-form" ${dis()}>+ Ajouter un véhicule</button>` : ""}`) +
      tabs("flotte", fleetTabs(nf)) +
      ({ vehicules: fleetVehicles, taches: fleetTodo, pannes: fleetFaults, documents: fleetDocs, entretiens: fleetEvents, stats: fleetStats, pneus: fleetTires, amendes: fleetFines, chauffeurs: () => driversCard(), positions: fleetPositions, trajets: fleetTrips, garages: () => typeof garagesView === "function" ? garagesView() : "" })[fleetTabs(nf).some(t => t[0] === tab) ? tab : "vehicules"]();
  },
  after() { if (curTab("flotte", "vehicules") === "positions") drawWfMap(); }
};
/* sélecteur de véhicules compact (multi-choix) : puces des véhicules choisis + liste déroulante — reste lisible avec 100+ véhicules */
function vehPicker(sel, action, counts) {
  const vs = activeVehicles().sort((a, b) => (fleetNo(a) || a.plate).localeCompare(fleetNo(b) || b.plate));
  const lab = v => `${fleetNo(v) ? fleetNo(v) + " · " : ""}${v.plate} · ${v.model}`;
  const chips = sel.map(id => veh(id)).filter(Boolean).map(v => `<button class="fpill on" data-a="${action}" data-veh="${v.id}" title="Retirer du filtre">${fleetNo(v) ? `<b class="mono">${fleetNo(v)}</b> ` : ""}${esc(v.plate)}<span class="x" aria-hidden="true">×</span></button>`).join("");
  const opts = vs.filter(v => !sel.includes(v.id)).map(v => { const n = counts ? counts(v.id) : null; return `<option value="${v.id}" ${n === 0 ? "disabled" : ""}>${esc(lab(v))}${n != null ? ` (${n})` : ""}</option>`; }).join("");
  return `<div class="fpills">${chips}<select class="fsel vpick" data-pick="${action}" aria-label="Ajouter un véhicule au filtre"><option value="">${sel.length ? "+ Ajouter un autre véhicule…" : "Tous les véhicules · choisir…"}</option>${opts}</select></div>`;
}
document.addEventListener("change", e => { const p = e.target.dataset && e.target.dataset.pick; if (p && e.target.value) { const v = e.target.value; e.target.value = ""; ACTIONS[p]({ dataset: { veh: v } }); } });

/* onglet Véhicules : recherche, filtre d'état, tri et affichage cartes / liste */
const VST = [["bad", "Immobilisé", "red"], ["warn", "Pannes / atelier", "orange"], ["good", "Disponible", "green"], ["grey", "Hors service", "grey"]];
const vehF = () => UI.vf || (UI.vf = { st: [], sort: "prio", view: (() => { try { return localStorage.getItem("ways-vview") || "cartes"; } catch (e) { return "cartes"; } })() });
const stKey = v => vehState(v)[1] || "grey";
const openF = vid => S.faults.filter(f => f.vehicleId === vid && f.status !== "reparee").length;
/* véhicule au garage : déclaré et/ou détecté par GPS dans la zone d'un garage */
function vGarChip(v) {
  if (typeof garPresence !== "function" || !(S.garages || []).length) return "";
  for (const g of S.garages) { const x = garPresence(g, v); if (x.declared || x.gps) return `<div class="small"><span class="chip ${x.declared && x.gps ? "good" : x.gps ? "info" : "orange"}" title="${x.declared && x.gps ? "Déclaré et confirmé par GPS" : x.gps ? "Détecté par GPS, non déclaré" : "Déclaré, GPS non confirmé"}">🔧 ${esc(g.name)}${x.gps ? " · GPS ✓" : ""}</span></div>`; }
  return "";
}
/* garage : seulement les véhicules présents chez lui (les autres sont réduits à un résumé côté serveur) */
function fleetVehicles() {
  if (!(ME && ME.role === "garage")) return fleetVehiclesAll();
  const keep = S.vehicles; S.vehicles = keep.filter(v => v.atMyGarage);
  try { return `<div class="banner info">Les véhicules de W.A.Y.S. présents dans votre garage (déclarés ou détectés par GPS). Pour un autre véhicule, utilisez « ⚠ Signaler une panne » : le signalement sera validé par W.A.Y.S.</div>` + (S.vehicles.length ? fleetVehiclesAll() : `<div class="panel empty">Aucun véhicule de W.A.Y.S. n'est actuellement dans votre garage.</div>`); }
  finally { S.vehicles = keep; }
}
function fleetVehiclesAll() {
  const ret = retiredVehicles().sort((a, b) => (b.retired.date || "").localeCompare(a.retired.date || ""));
  const retiredBlock = ret.length ? `<div class="retired-zone"><button class="retired-toggle" data-a="toggle-retired" aria-expanded="${UI.showRetired ? "true" : "false"}">
      <span>${UI.showRetired ? "▾" : "▸"} Véhicules ou équipements retirés de la flotte ou vendus</span><span class="chip dark">${ret.length}</span></button>
    ${UI.showRetired ? `<div class="cards">${ret.map(v => `<button class="panel vcard st-dark" data-a="veh-open" data-id="${v.id}"><div class="row-sb"><span class="row-g"><span class="plate">${esc(v.plate)}</span>${noBadge(v)}</span>${vChip(v)}</div>
      <div class="vc-body"><div class="vc-main"><div><b>${esc(v.model)}</b> <span class="muted">${esc(v.year || "")}</span>${demoTag(v)}</div>
      <div class="small"><span class="muted">${esc(RETIRE_REASONS[v.retired.reason] || v.retired.reason)} le</span><br>${fmtDate(v.retired.date)}</div></div>${vehThumb(v)}</div>
      <dl class="kv sm">
      ${v.retired.reason === "vendu" ? `<dt>Acheteur</dt><dd>${esc(v.retired.buyer || "—")}</dd><dt>Prix de vente</dt><dd class="num">${v.retired.price ? eur(v.retired.price) : "—"}</dd>` : ""}
      <dt>Kilométrage final</dt><dd class="num">${v.km ? fmtN.format(v.km) + " km" : "—"}</dd><dt>Coût total enregistré</dt><dd class="num">${eur0(S.vehEvents.filter(e => e.vehicleId === v.id && e.status !== "planifiee").reduce((a, e) => a + evCost(e), 0))}</dd></dl></button>`).join("")}</div>` : ""}</div>` : "";
  const arc = archivedVehicles().sort((a, b) => (b.archived.date || "").localeCompare(a.archived.date || ""));
  const archBlock = arc.length ? `<div class="retired-zone arch-zone"><button class="retired-toggle" data-a="toggle-archived" aria-expanded="${UI.showArchived ? "true" : "false"}">
      <span>${UI.showArchived ? "▾" : "▸"} Archives</span><span class="chip">${arc.length}</span></button>
    ${UI.showArchived ? `<div class="panel"><div class="tablewrap"><table><thead><tr><th>Véhicule</th><th>Modèle</th><th>Catégorie</th><th>Sortie de flotte</th><th>Archivé le</th><th></th></tr></thead><tbody>${arc.map(v => `<tr class="click" data-a="veh-open" data-id="${v.id}">
      <td><div class="row-g nowrap">${noBadge(v, 1)}<span class="plate sm">${esc(v.plate)}</span></div></td><td class="small"><b>${esc(v.model)}</b> <span class="muted">${esc(v.year || "")}</span>${demoTag(v)}</td>
      <td class="small">${esc(VCAT.find(c => c[0] === catOf(v))[1])}</td><td class="small">${esc(RETIRE_REASONS[v.retired.reason] || v.retired.reason)} · ${fmtDate(v.retired.date)}</td><td class="small num">${fmtDate(v.archived.date)}</td>
      <td class="r"><span class="linkbtn">Ouvrir</span></td></tr>`).join("")}</tbody></table></div></div>` : ""}</div>` : "";
  const tail = retiredBlock + archBlock;
  if (!activeVehicles().length) return `<div class="panel empty">Aucun véhicule en service. Ajoutez votre premier véhicule.</div>` + tail;
  const f = vehF(), q = (UI.q || "").toLowerCase().trim();
  const nextOf = {}; for (const t of fleetTasks(365)) if (!nextOf[t.vid]) nextOf[t.vid] = t;
  const yr = today().slice(0, 4);
  const qOk = v => !q || [v.plate, fleetNo(v), v.model, v.driver, lastDrv(v)?.name, v.vin, v.year, v.fuel, v.webfleetId, tireSize(v.tires || {})].join(" ").toLowerCase().includes(q);
  const base = activeVehicles().filter(qOk);
  const rows = base.filter(v => !f.st.length || f.st.includes(stKey(v)));
  const PR = { bad: 0, warn: 1, grey: 3, good: 2 };
  const sorters = {
    prio: (a, b) => PR[stKey(a)] - PR[stKey(b)] || (nextOf[a.id]?.date || "9").localeCompare(nextOf[b.id]?.date || "9"),
    echeance: (a, b) => (nextOf[a.id]?.date || "9").localeCompare(nextOf[b.id]?.date || "9"),
    id: (a, b) => (fleetNo(a) || "zzz").localeCompare(fleetNo(b) || "zzz", undefined, { numeric: true }),
    plate: (a, b) => a.plate.localeCompare(b.plate),
    km: (a, b) => kmOf(b) - kmOf(a),
    cout: (a, b) => yearCost(b.id, yr) - yearCost(a.id, yr)
  };
  rows.sort(sorters[f.sort] || sorters.prio);
  const toolbar = `<div class="panel pad vtool">
    <input type="search" id="q" class="fsearch" placeholder="Plaque, identifiant, modèle, chauffeur, VIN…" value="${esc(UI.q)}" aria-label="Rechercher un véhicule">
    <div class="fpills">${VST.map(([k, l, c]) => `<button class="fpill c-${c} ${f.st.includes(k) ? "on" : ""}" data-a="veh-f" data-st="${k}" aria-pressed="${f.st.includes(k)}">${l}<span class="n">${base.filter(v => stKey(v) === k).length}</span></button>`).join("")}
      ${f.st.length || q ? `<button class="linkbtn" data-a="veh-f" data-reset="1">Effacer</button>` : ""}</div>
    <div class="row-g"><select class="fsel" id="vf-sort" aria-label="Trier">${[["prio", "Tri : urgence d'abord"], ["echeance", "Tri : prochaine échéance"], ["id", "Tri : identifiant"], ["plate", "Tri : plaque"], ["km", "Tri : kilométrage"], ["cout", "Tri : coûts " + yr]].map(([k, l]) => `<option value="${k}" ${f.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <div class="seg" role="group" aria-label="Affichage"><button data-a="veh-f" data-view="cartes" class="${f.view === "cartes" ? "on" : ""}">Cartes</button><button data-a="veh-f" data-view="liste" class="${f.view === "liste" ? "on" : ""}">Liste</button></div></div></div>`;
  const count = `<div class="muted small vcount">${plural(rows.length, "véhicule")}${rows.length !== activeVehicles().length ? ` sur ${activeVehicles().length}` : ""}</div>`;
  const listOf = rows => {
  let list;
  if (!rows.length) list = `<div class="panel empty">Aucun véhicule ne correspond à cette recherche.</div>`;
  else if (f.view === "liste") list = `<div class="panel"><div class="tablewrap"><table class="vlist"><thead><tr><th>Véhicule</th><th>Modèle</th><th>État</th><th>Dernier chauffeur</th><th class="r">Kilométrage</th><th>Prochaine échéance</th><th>Documents</th><th class="r">Coûts ${yr}</th></tr></thead><tbody>
    ${rows.map(v => { const n = nextOf[v.id]; return `<tr class="click vrow st-${stKey(v)}" data-a="veh-open" data-id="${v.id}">
      <td><div class="row-g nowrap">${openF(v.id) ? ADOT : ""}${noBadge(v, 1)}<span class="plate sm">${esc(v.plate)}</span></div></td><td class="small"><b>${esc(v.model)}</b> <span class="muted">${esc(v.year || "")}</span>${demoTag(v)}</td>
      <td>${vChip(v)}</td><td class="small nowrap">${lastDrvHtml(v, " · ")}</td>
      <td class="num r nowrap">${kmOf(v) ? fmtN.format(kmOf(v)) + " km" : "—"}</td>
      <td class="small"><div class="vnext">${n ? `${dueChip(n.date, 30)} <span class="ell" title="${esc(n.label)}">${esc(n.label)}</span>` : "—"}</div></td>
      <td>${docSummary(v)}</td><td class="num r">${eur0(yearCost(v.id, yr))}</td></tr>`; }).join("")}</tbody></table></div></div>`;
  else list = `<div class="cards">${rows.map(v => {
    const next = nextOf[v.id];
    return `<button class="panel vcard st-${stKey(v)}" data-a="veh-open" data-id="${v.id}"><div class="row-sb"><span class="row-g">${openF(v.id) ? `<span title="${esc(plural(openF(v.id), "panne"))} en cours">${ADOT}</span>` : ""}<span class="plate">${esc(v.plate)}</span>${noBadge(v)}</span>${vChip(v)}</div>
      <div class="vc-body"><div class="vc-main"><div><b>${esc(v.model)}</b> <span class="muted">${esc(v.year || "")}</span>${demoTag(v)}</div>${vGarChip(v)}
      <div class="small"><span class="muted">Dernier chauffeur</span><br>${lastDrvHtml(v, " · ")}</div></div>${vehThumb(v)}</div>
      <dl class="kv sm">
      <dt>Kilométrage</dt><dd class="num">${kmOf(v) ? fmtN.format(kmOf(v)) + " km" : "—"}</dd>
      <dt>Pneus</dt><dd>${v.tires && tireSize(v.tires) ? `<span class="mono small">${esc(tireSize(v.tires))}</span>${v.tires.state ? " " + tireStateChip(v.tires.state) : ""}` : `<span class="muted">—</span>`}</dd>
      <dt>Prochaine échéance</dt><dd>${next ? esc(next.label) + " · " + dueChip(next.date, 30) : "—"}</dd>
      <dt>Coûts ${yr}</dt><dd class="num">${eur0(yearCost(v.id, yr))}</dd>
      <dt>Documents</dt><dd>${docSummary(v)}</dd></dl></button>`;
  }).join("")}</div>`;
  return list; };
  const groups = VCAT.map(([k, l, h]) => [k, l, h, rows.filter(v => catOf(v) === k)]).filter(g => g[3].length);
  const list = !rows.length ? listOf(rows) : groups.map(([k, l, h, rs]) => `<section class="vcat"><div class="vcat-h"><h3>${l}</h3><span class="chip">${rs.length}</span><span class="muted small">${h}</span></div>${listOf(rs)}</section>`).join("");
  return `${isLimited() ? "" : `<div class="banner info">WebFleet : positions, compteurs et trajets sont visibles dans les onglets Positions et Trajets, mis à jour par import CSV en attendant la liaison automatique (serveur ONE.COM). Renseignez l'identifiant WebFleet (n° d'objet) de chaque véhicule pour une correspondance fiable.</div>`}` + toolbar + count + list + tail;
}
ACTIONS["veh-f"] = el => {
  const f = vehF(), d = el.dataset;
  if (d.reset) { f.st = []; UI.q = ""; }
  else if (d.st) f.st = f.st.includes(d.st) ? f.st.filter(x => x !== d.st) : [...f.st, d.st];
  else if (d.view) { f.view = d.view; try { localStorage.setItem("ways-vview", d.view); } catch (e) {} }
  UI.focusQ = false; render(true);
};
document.addEventListener("change", e => { if (e.target.id === "vf-sort") { vehF().sort = e.target.value; UI.focusQ = false; render(true); } });
/* ---------- onglet À faire : filtres combinables (types de tâche × véhicules × période) ---------- */
const TASK_KINDS = {
  entretien: ["Entretien (date)", "blue"], km: ["Entretien (kilométrage)", "blue"], planif: ["Intervention planifiée", "green"],
  panne: ["Panne à réparer", "red"], amende: ["Amende", "yellow"], ct: ["Contrôle technique", "orange"], assurance: ["Assurance", "yellow"], doc: ["Document à renouveler", "grey"]
};
const todoF = () => UI.todoF || (UI.todoF = { kinds: [], veh: [], days: 60 });
function fleetTodo() {
  const f = todoF(), all = fleetTasks(+f.days || 60);
  const q = (UI.q || "").toLowerCase().trim();
  const rows = all.filter(t => (!f.kinds.length || f.kinds.includes(t.kind)) && (!f.veh.length || f.veh.includes(t.vid)) && (!q || (t.label + " " + vehLabel(t.vid) + " " + (veh(t.vid)?.driver || "")).toLowerCase().includes(q)));
  const cnt = (k, v) => all.filter(t => (k == null || t.kind === k) && (v == null || t.vid === v)).length;
  const vs = activeVehicles().sort((a, b) => (fleetNo(a) || a.plate).localeCompare(fleetNo(b) || b.plate));
  const pill = (attr, val, on, label, c, n) => `<button class="fpill ${on ? "on" : ""} ${c ? "c-" + c : ""}" data-a="todo-f" data-${attr}="${val}" aria-pressed="${on}">${label}<span class="n">${n}</span></button>`;
  const late = rows.filter(t => t.date < today()).length;
  return `<div class="panel pad stack todo-filters">
    <div class="frow"><span class="flabel">Rechercher</span><input type="search" id="q" class="fsearch" placeholder="Panne, plaque, identifiant, chauffeur…" value="${esc(UI.q)}" aria-label="Rechercher une tâche"><span></span></div>
    <div class="frow"><span class="flabel">Type de tâche</span><div class="fpills">${Object.entries(TASK_KINDS).map(([k, [l, c]]) => pill("kind", k, f.kinds.includes(k), l, c, cnt(k, null))).join("")}</div></div>
    <div class="frow"><span class="flabel">Véhicule</span>${vehPicker(f.veh, "todo-f", id => cnt(null, id))}</div>
    <div class="frow"><span class="flabel">Période</span><div class="fpills">${[[30, "30 jours"], [60, "60 jours"], [90, "90 jours"], [365, "1 an"]].map(([d, l]) => `<button class="fpill ${+f.days === d ? "on" : ""}" data-a="todo-f" data-days="${d}">${l}</button>`).join("")}</div>
      ${f.kinds.length || f.veh.length || UI.q ? `<button class="linkbtn" data-a="todo-f" data-reset="1">Effacer les filtres</button>` : ""}</div>
  </div>
  <div class="panel"><div class="row-sb pad"><h3 class="np">${plural(rows.length, "tâche")}${rows.length !== all.length ? ` sur ${all.length}` : ""} · ${f.days >= 365 ? "12 prochains mois" : f.days + " prochains jours"}</h3>${late ? `<span class="chip bad">${late} en retard</span>` : ""}</div>
    <div>${rows.map(taskRow).join("") || `<div class="empty">${all.length ? "Aucune tâche ne correspond à ces filtres." : "Rien de prévu."}</div>`}</div></div>`;
}
ACTIONS["todo-f"] = el => {
  const f = todoF(), d = el.dataset;
  const tog = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  if (d.reset) { f.kinds = []; f.veh = []; UI.q = ""; }
  else if (d.kind) f.kinds = tog(f.kinds, d.kind);
  else if (d.veh) f.veh = tog(f.veh, d.veh);
  else if (d.days) f.days = +d.days;
  UI.focusQ = false; render(true);
};
function fleetFaults() {
  const nv = S.faults.filter(f => f.status === "attente").length;
  const rows = S.faults.filter(f => UI.filter === "toutes" ? true : UI.filter === "tous" ? f.status !== "reparee" : f.status === UI.filter).sort((a, b) => ((b.status === "attente") - (a.status === "attente")) || (b.date || "").localeCompare(a.date || ""));
  return `${nv && isOffice() ? `<div class="banner warn row-sb wrap"><span><b>${plural(nv, "signalement")} d'un garage en attente de validation</b> (véhicule qui n'était pas chez lui).</span><button class="btn sm" data-filter="attente">Voir</button></div>` : ""}<div class="panel">${searchBar("Rechercher…", [["tous", "En cours"], ...(nv ? [["attente", "À valider"]] : []), ["reparee", "Réparées"], ["toutes", "Toutes"]])}
    <div class="tablewrap"><table><thead><tr><th>Signalée le</th><th>Véhicule</th><th>Type</th><th>Description</th><th>Gravité</th><th>Par</th><th>Garage</th><th>Statut</th><th>Réparation estimée</th></tr></thead><tbody>
    ${rows.filter(f => !UI.q || (f.description + vehLabel(f.vehicleId) + garageName(f.garageId)).toLowerCase().includes(UI.q.toLowerCase())).map(f => `<tr class="click" data-a="fault-open" data-id="${f.id}"><td class="num nowrap">${f.status !== "reparee" && isActiveVeh(f.vehicleId) ? ADOT : ""}${fmtDate(f.date)}</td><td>${esc(vehLabel(f.vehicleId))}</td><td class="small">${esc(FAULT_KIND[f.kind] || "Panne")}</td><td>${esc(f.description)}</td>
      <td><span class="chip ${SEV[f.severity]?.[1] || ""}">${SEV[f.severity]?.[0].split(" ·")[0] || f.severity}</span></td><td>${esc(f.reporter || "—")}</td><td class="small">${esc(garageName(f.garageId) || "—")}</td><td><span class="chip ${(FAULT_ST[f.status] || FAULT_ST.ouverte)[1]}">${(FAULT_ST[f.status] || FAULT_ST.ouverte)[0]}</span></td>
      <td>${f.status === "reparee" ? fmtDate(f.resolvedDate) : f.estDate ? dueChip(f.estDate, 7) : `<span class="muted">À planifier</span>`}</td></tr>`).join("")}
    </tbody></table>${rows.length ? "" : `<div class="empty">Aucune panne ici.</div>`}</div></div>`;
}
function fleetEvents() {
  const q = UI.q.toLowerCase();
  const rows = S.vehEvents.filter(e => !q || [e.description, vehLabel(e.vehicleId), e.supplier, EV_TYPES[e.type]].join(" ").toLowerCase().includes(q)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return `<div class="panel">${searchBar("Véhicule, garage, description…")}
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Véhicule</th><th>Type</th><th>Description</th><th>Garage</th><th class="r">Km</th><th class="r">Coût HT</th></tr></thead><tbody>
    ${rows.map(e => `<tr class="click" data-a="ev-form" data-id="${e.id}"><td class="num">${fmtDate(e.date)}${e.status === "planifiee" ? ` <span class="chip info">Planifié</span>` : ""}</td><td>${esc(vehLabel(e.vehicleId))}</td><td>${esc(EV_TYPES[e.type] || e.type)}</td>
      <td>${esc(e.description)}</td><td>${esc(e.supplier || "—")}</td><td class="r num">${e.km ? fmtN.format(e.km) : "—"}</td><td class="r num">${e.status === "planifiee" ? `<span class="muted">${e.cost ? "≈ " + eur(e.cost) : "—"}</span>` : eur(e.cost)}</td></tr>`).join("")}
    </tbody></table>${rows.length ? "" : `<div class="empty">Aucune intervention enregistrée.</div>`}</div></div>`;
}
function fleetStats() {
  const y = today().slice(0, 4);
  const done = S.vehEvents.filter(e => e.status !== "planifiee");
  const yr = done.filter(e => (e.date || "").startsWith(y));
  const total = yr.reduce((a, e) => a + evCost(e), 0);
  const byType = {}; yr.forEach(e => byType[e.type] = (byType[e.type] || 0) + evCost(e));
  const perVeh = S.vehicles.map(v => {
    const ev = done.filter(e => e.vehicleId === v.id && e.km).sort((a, b) => a.km - b.km);
    const kmSpan = ev.length > 1 ? ev[ev.length - 1].km - ev[0].km : 0;
    const all = done.filter(e => e.vehicleId === v.id).reduce((a, e) => a + evCost(e), 0);
    return { v, y: yearCost(v.id, y), all, perKm: kmSpan > 0 ? all / kmSpan : null, n: done.filter(e => e.vehicleId === v.id && (e.date || "").startsWith(y)).length };
  }).sort((a, b) => b.y - a.y);
  const max = Math.max(1, ...perVeh.map(p => p.y));
  const months = []; const now = new Date(today() + "T12:00:00"); now.setDate(1);
  for (let i = 11; i >= 0; i--) { const d = new Date(now); d.setMonth(d.getMonth() - i); const k = iso(d).slice(0, 7); months.push({ k, v: done.filter(e => (e.date || "").startsWith(k)).reduce((a, e) => a + evCost(e), 0) }); }
  const planned = S.vehEvents.filter(e => e.status === "planifiee").reduce((a, e) => a + evCost(e), 0);
  return `<div class="tiles"><div class="panel tile c-orange"><div class="lbl">Coûts de maintenance ${y}</div><div class="val">${eur0(total)}</div><div class="note">${plural(yr.length, "intervention")} · HT</div></div>
    <div class="panel tile c-blue"><div class="lbl">Moyenne par véhicule en service</div><div class="val">${eur0(activeVehicles().length ? yr.filter(e => isActiveVeh(e.vehicleId)).reduce((a, e) => a + evCost(e), 0) / activeVehicles().length : 0)}</div><div class="note">${y}</div></div>
    <div class="panel tile c-yellow"><div class="lbl">Travaux planifiés</div><div class="val">${eur0(planned)}</div><div class="note">estimation HT</div></div></div>
    <div class="grid2"><div class="panel"><h3>Coûts de maintenance par mois</h3>${barChart(months.map(m => ({ label: MONTHS[+m.k.slice(5) - 1], value: m.v, tip: `${MONTHS[+m.k.slice(5) - 1]} ${m.k.slice(0, 4)}` })), "Coûts de maintenance HT des 12 derniers mois")}</div>
    <div class="panel"><h3>Par type d'intervention · ${y}</h3><div class="pt">${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, v]) => `<div class="list-row block"><div class="row-sb"><span>${esc(EV_TYPES[t] || t)}</span><span class="num">${eur0(v)}</span></div><div class="bar-mini"><span style="width:${Math.max(3, v / Math.max(1, total) * 100)}%"></span></div></div>`).join("") || `<div class="empty">Aucune dépense cette année.</div>`}</div></div></div>
    <div class="panel"><h3>Par véhicule</h3><div class="tablewrap"><table><thead><tr><th>Véhicule</th><th class="r">Interventions ${y}</th><th style="width:30%">Coût ${y}</th><th class="r">Coût total enregistré</th><th class="r">Coût / km</th></tr></thead><tbody>
    ${perVeh.map(p => `<tr class="click" data-a="veh-open" data-id="${p.v.id}"><td>${noBadge(p.v, 1)} <span class="plate sm">${esc(p.v.plate)}</span> ${esc(p.v.model)}${p.v.retired ? ` <span class="chip dark">${vehState(p.v)[0]}</span>` : ""}</td><td class="r num">${p.n}</td>
      <td><div class="row-g"><div class="bar-mini grow"><span style="width:${Math.max(2, p.y / max * 100)}%"></span></div><span class="num">${eur0(p.y)}</span></div></td>
      <td class="r num">${eur0(p.all)}</td><td class="r num">${p.perKm != null ? eur(p.perKm) : "—"}</td></tr>`).join("")}</tbody></table></div></div>`;
}

/* graphique en barres générique (une série) */
let BARS = {};
function barChart(data, aria, id = "bc" + uid()) {
  BARS[id] = data;
  const W = 640, H = 220, L = 50, B = 24, T = 10, R = 6;
  const maxV = Math.max(1, ...data.map(d => d.value)); const step = niceStep(maxV / 4); const top = Math.ceil(maxV / step) * step;
  const y = v => T + (H - T - B) * (1 - v / top), bw = (W - L - R) / data.length, barW = Math.min(30, bw * .6);
  let g = "";
  for (let v = 0; v <= top + 1e-6; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? fmtN.format(v / 1000) + " k€" : fmtN.format(v) + " €"}</text>`;
  data.forEach((d, i) => {
    const x = L + bw * i + (bw - barW) / 2;
    g += roundTop(x, y(d.value), barW, y(0) - y(d.value), "var(--series-1)");
    g += `<text x="${x + barW / 2}" y="${H - 6}" text-anchor="middle">${esc(d.label)}</text><rect class="hit" data-bar="${id}:${i}" x="${L + bw * i}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>`;
  });
  return `<div class="chart-wrap" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(aria)}">${g}</svg><div class="tip"></div></div>`;
}
function roundTop(x, y, w, h, fill) {
  if (h <= 0) return "";
  const r = Math.min(4, h, w / 2);
  return `<path d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z" fill="${fill}"/>`;
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
document.addEventListener("mouseover", e => {
  const h = e.target.closest && e.target.closest("[data-bar]"); if (!h) return;
  const [id, i] = h.dataset.bar.split(":"); const d = BARS[id]?.[+i]; if (!d) return;
  const wrap = h.closest(".chart-wrap"), tip = wrap.querySelector(".tip");
  tip.innerHTML = d.html || `<b>${esc(d.tip || d.label)}</b><div><span>Total</span><span class="num">${eur0(d.value)}</span></div>`;
  tip.style.display = "block";
  const wr = wrap.getBoundingClientRect(), hr = h.getBoundingClientRect();
  tip.style.left = Math.max(4, Math.min(hr.left - wr.left + hr.width / 2 - tip.offsetWidth / 2, wr.width - tip.offsetWidth - 4)) + "px"; tip.style.top = "4px";
  h.setAttribute("fill", "rgba(127,127,127,.08)");
  h.addEventListener("mouseleave", () => { tip.style.display = "none"; h.setAttribute("fill", "transparent"); }, { once: true });
});

/* ---------- fiche véhicule ---------- */
ACTIONS["veh-open"] = el => openVehicle(el.dataset.id);
async function openVehicle(id) {
  const v = await waitFind("vehicles", id); if (!v) return;
  const y = today().slice(0, 4);
  const evs = S.vehEvents.filter(e => e.vehicleId === v.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const fs = S.faults.filter(f => f.vehicleId === v.id).sort((a, b) => (a.status === "reparee") - (b.status === "reparee") || (b.date || "").localeCompare(a.date || ""));
  const logs = S.driverLogs.filter(l => l.vehicleId === v.id).sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at)).slice(0, 6);
  const tasks = fleetTasks(365).filter(t => t.vid === v.id && t.kind !== "panne" && t.kind !== "planif");
  const R = v.retired;
  const m = modal(`${mHead(`<span class="plate">${esc(v.plate)}</span>${noBadge(v)} ${esc(v.model)} ${vChip(v)}${demoTag(v)}`)}<div class="body">
    ${R ? `<div class="retired-banner"><b>${R.reason === "vendu" ? "Véhicule vendu" : "Véhicule retiré de la flotte"} le ${fmtDate(R.date)}${v.archived ? ` · archivé le ${fmtDate(v.archived.date)}` : ""}</b>
      <span>${esc(RETIRE_REASONS[R.reason] || R.reason)}${R.reason === "vendu" && R.buyer ? " · acheteur : " + esc(R.buyer) : ""}${R.price ? " · prix : " + eur(R.price) : ""}${R.note ? " · " + esc(R.note) : ""}</span>
      <span class="small">La fiche est conservée pour l'historique (documents, interventions, coûts). Le véhicule n'apparaît plus dans les tâches, les signalements ni le tableau de bord.</span></div>` : ""}
    <div class="vm-top"><div class="vm-photo">${vehThumb(v, "lg")}${readOnly || R || !assets ? "" : `<div class="row-g wrap center"><label class="btn sm">${v.photo ? "Changer la photo" : "Ajouter une photo"}<input type="file" accept="image/*" data-vphoto="${v.id}" hidden></label>${v.photo ? `<button class="btn sm danger" data-a="vphoto-del" data-id="${v.id}">Supprimer</button>` : ""}</div>`}</div>
    <div class="tiles mini grow"><div class="panel tile c-blue"><div class="lbl">Dernier chauffeur</div><div class="val sm">${esc(lastDrv(v)?.name || "—")}</div><div class="note">${lastDrv(v)?.at ? (lastDrv(v).src === "webfleet" ? "Webfleet · " : "") + fmtDate(lastDrv(v).at.slice(0, 10)) : ""}</div></div>
      <div class="panel tile c-grey"><div class="lbl">Kilométrage</div><div class="val sm">${kmOf(v) ? fmtN.format(kmOf(v)) + " km" : "—"}</div>${kmFromWf(v) ? `<div class="note">compteur WebFleet · ${agoTxt(posOf(v.id).at)}</div>` : ""}${wfOdoNote(v)}</div>
      <div class="panel tile c-orange"><div class="lbl">Coûts ${y}</div><div class="val sm">${eur0(yearCost(v.id, y))}</div></div>
      ${vehWfTile(v)}</div></div>
    <div class="row-g wrap">${readOnly || R ? "" : `<button class="btn" data-a="drive-form" data-id="${v.id}">Prise en charge</button><button class="btn" data-a="ev-form" data-veh="${v.id}">Ajouter une intervention</button><button class="btn" data-a="fault-form" data-veh="${v.id}">Signaler une panne</button><button class="btn" data-a="veh-form" data-id="${v.id}">Modifier la fiche</button>${canWfPush() && wfLinked(v) ? `<button class="btn" data-a="wf-veh-push" data-id="${v.id}" title="Immatriculation, année, puissance, cylindrée, carburant">Envoyer la fiche à WebFleet</button>` : ""}`}</div>
    ${R ? "" : `<h3>Échéances</h3>`}<dl class="kv ${R ? "hidden" : ""}"><dt>Entretien</dt><dd>${dueChip(v.nextServiceDate)}${v.nextServiceKm ? ` · ou à ${fmtN.format(v.nextServiceKm)} km` : ""}</dd><dt>Contrôle technique</dt><dd>${dueChip(v.ctDate)}</dd><dt>Assurance</dt><dd>${dueChip(v.insuranceDate)}</dd>${v.beltNA ? `<dt>Distribution</dt><dd class="muted">Non applicable</dd>` : v.beltDate || v.beltKm || v.beltLastDate || v.beltLastKm ? `<dt>Distribution</dt><dd>${v.beltDate ? dueChip(v.beltDate) : ""}${v.beltKm ? `${v.beltDate ? " · ou" : ""} à ${fmtN.format(v.beltKm)} km` : ""}${v.beltLastDate || v.beltLastKm ? `<div class="muted small">Dernier remplacement : ${[v.beltLastDate ? fmtDate(v.beltLastDate) : "", v.beltLastKm ? fmtN.format(v.beltLastKm) + " km" : ""].filter(Boolean).join(" · ")}</div>` : ""}</dd>` : ""}</dl>
    ${v.todo || v.notes ? `<div class="vnotes">${v.todo ? `<div class="vnote warn"><b>Réparations à prévoir</b><div>${esc(v.todo).replace(/\n/g, "<br>")}</div></div>` : ""}${v.notes ? `<div class="vnote"><b>Commentaires</b><div>${esc(v.notes).replace(/\n/g, "<br>")}</div></div>` : ""}</div>` : ""}
    <div class="row-sb"><h3>Pneus montés</h3>${readOnly || R ? "" : `<button class="btn sm" data-a="vtire-form" data-id="${v.id}">${v.tires && tireSize(v.tires) ? "Modifier les pneus" : "+ Renseigner les pneus"}</button>`}</div>
    ${vehTiresHtml(v)}
    <div class="row-sb"><h3>Documents du véhicule</h3><span class="row-g">${/^https:\/\/www\.dropbox\.com\//.test(v.dropboxLink || "") ? `<a class="btn sm" href="${esc(v.dropboxLink)}" target="_blank" rel="noopener" title="Dossier Dropbox du véhicule (accès avec votre compte)">Dropbox ↗</a>` : ""}${v.docsLink && /^https?:\/\//.test(v.docsLink) ? `<a class="btn sm" href="${esc(v.docsLink)}" target="_blank" rel="noopener" title="Dossier partagé lié au QR code à bord">Dossier en ligne ↗</a>` : ""}</span>${readOnly ? "" : `<button class="btn sm" data-a="vdoc-form" data-veh="${v.id}">+ Ajouter un document</button>`}</div>
    ${vehDocsHtml(v)}
    ${vehTripsHtml(v)}
    <h3>Pannes</h3>${fs.length ? `<div class="stack-s">${fs.map(f => `<div class="list-row click bordered ${f.status !== "reparee" && f.severity === "bloquante" ? "sev-bad" : ""}" data-a="fault-open" data-id="${f.id}"><div><div>${esc(f.description)}</div><div class="muted small">${fmtDate(f.date)} · ${esc(f.reporter || "")} · <span class="chip ${SEV[f.severity]?.[1]}">${SEV[f.severity]?.[0].split(" ·")[0]}</span></div></div>
      <div style="text-align:right"><span class="chip ${FAULT_ST[f.status][1]}">${FAULT_ST[f.status][0]}</span><div class="small muted">${f.status === "reparee" ? "le " + fmtDate(f.resolvedDate) : f.estDate ? "prévue " + fmtDate(f.estDate) : "date à fixer"}</div></div></div>`).join("")}</div>` : `<div class="muted">Aucune panne signalée.</div>`}
    <h3>Interventions</h3>${evs.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="r">Km</th><th class="r">Coût HT</th></tr></thead><tbody>${evs.map(e => `<tr class="click" data-a="ev-form" data-id="${e.id}"><td class="num">${fmtDate(e.date)}${e.status === "planifiee" ? ` <span class="chip info">Planifié</span>` : ""}</td><td>${esc(EV_TYPES[e.type] || e.type)}</td><td>${esc(e.description)}${e.supplier ? `<div class="muted small">${esc(e.supplier)}</div>` : ""}</td><td class="r num">${e.km ? fmtN.format(e.km) : "—"}</td><td class="r num">${eur(e.cost)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="muted">Aucune intervention.</div>`}
    <h3>Dernières prises en charge</h3>${logs.length ? logs.map(l => `<div class="small"><span class="num muted">${fmtDate(l.date)}</span> · ${esc(l.driver)}${l.km ? " · " + fmtN.format(l.km) + " km" : ""}${l.note ? " · " + esc(l.note) : ""}</div>`).join("") : `<div class="muted">Aucune.</div>`}
    <dl class="kv sm muted"><dt>VIN</dt><dd class="mono">${esc(v.vin || "—")}</dd><dt>Carburant</dt><dd>${esc(v.fuel || "—")}</dd><dt>Année</dt><dd>${esc(v.year || "—")}</dd>${v.cc ? `<dt>Cylindrée</dt><dd>${fmtN.format(v.cc)} cc</dd>` : ""}${v.kw ? `<dt>Puissance</dt><dd>${v.kw} kW</dd>` : ""}${v.euro ? `<dt>Norme</dt><dd>EURO ${esc(v.euro)}</dd>` : ""}${v.garage ? `<dt>Garage</dt><dd>${esc(v.garage)}</dd>` : ""}</dl>
  ${histBox("vehicles", v.id, true)}</div>${readOnly ? "" : `<footer>${v.archived ? `<div class="left"><button class="btn danger" data-a="veh-purge" data-id="${v.id}">Supprimer…</button></div><button class="btn" data-a="veh-unarchive" data-id="${v.id}">Désarchiver</button>`
    : R ? `<div class="left"><button class="btn" data-a="veh-archive" data-id="${v.id}">Archiver…</button></div><button class="btn" data-a="veh-reactivate" data-id="${v.id}">Remettre en service</button>`
    : `<div class="left"></div><button class="btn retire-btn" data-a="veh-retire" data-id="${v.id}">Retirer de la flotte…</button>`}</footer>`}`, "lg" + (R ? " retired" : ""));
}
ACTIONS["veh-form"] = el => {
  const v = veh(el.dataset.id) || { status: "actif", fuel: "Diesel" };
  const kmOf0 = Math.round(kmOf(v) * 10) / 10;   // valeur proposée dans le champ (compteur WebFleet si plus récent)
  const isNew = !v.id;
  const m = modal(`${mHead(isNew ? "Nouveau véhicule" : "Modifier " + esc(v.plate))}<form><div class="body"><div class="fields">
    <label class="f">Identifiant W.A.Y.S. *<input id="v-no" class="mono upper" autocapitalize="characters" maxlength="6" required value="${esc(fleetNo(v) || (isNew ? nextFleetNo() : ""))}" placeholder="000"></label>
    ${field("v-cat", "Catégorie", catOf(v), { type: "select", options: VCAT.map(c => [c[0], c[1]]) })}
    ${field("v-plate", "Immatriculation", v.plate, { cls: "mono", ph: "1-ABC-123 (vide pour un engin non immatriculé)" })}${field("v-model", "Marque et modèle", v.model, { required: true, ph: "Renault Master" })}
    ${field("v-year", "Année", v.year, { type: "number" })}${field("v-fuel", "Carburant", v.fuel, { type: "select", options: [["Diesel", "Diesel"], ["Essence", "Essence"], ["Hybride", "Hybride"], ["Électrique", "Électrique"], ["Essence/LPG", "Essence / LPG"], ["CNG", "CNG"]] })}
    ${field("v-vin", "N° de châssis (VIN)", v.vin, { cls: "mono" })}${field("v-km", kmFromWf(v) ? "Kilométrage actuel (WebFleet)" : "Kilométrage actuel", kmOf(v) ? Math.round(kmOf(v) * 10) / 10 : "", { type: "number", step: "0.1", min: 0 })}
    ${field("v-st", "État", v.status, { type: "select", options: [["actif", "En service"], ["atelier", "À l'atelier"], ["hors_service", "Hors service"]] })}
    ${field("v-wf", "Identifiant WebFleet (n° d'objet)", v.webfleetId, { cls: "mono", ph: "vide = même n° que l'identifiant W.A.Y.S." })}
    ${field("v-ns", "Prochain entretien (date)", v.nextServiceDate, { type: "date" })}${field("v-nk", "Prochain entretien (km)", v.nextServiceKm, { type: "number" })}
    ${field("v-ct", "Contrôle technique avant le", v.ctDate, { type: "date" })}${field("v-ins", "Échéance assurance", v.insuranceDate, { type: "date" })}
    ${field("v-cc", "Cylindrée (cc)", v.cc, { type: "number" })}${field("v-kw", "Puissance (kW)", v.kw, { type: "number" })}
    ${field("v-euro", "Norme EURO", v.euro, { ph: "6b" })}${field("v-garage", "Garage habituel", v.garage, { ph: "Collard, Falco, MTGN…" })}
    <label class="chk wide"><input type="checkbox" id="v-bna" ${v.beltNA ? "checked" : ""}> Courroie de distribution : non applicable (chaîne de distribution, véhicule électrique…)</label>
    <div class="belt-f fields wide" ${v.beltNA ? "hidden" : ""} style="grid-column:1/-1">${field("v-bld", "Dernier remplacement de la distribution (date)", v.beltLastDate, { type: "date" })}${field("v-blk", "Dernier remplacement (km)", v.beltLastKm, { type: "number" })}
    ${field("v-bd", "Distribution à remplacer (date)", v.beltDate, { type: "date" })}${field("v-bk", "Distribution à remplacer (km)", v.beltKm, { type: "number" })}</div>
    ${field("v-dbx", "Dossier Dropbox", v.dropboxLink, { ph: "https://www.dropbox.com/home/…", wide: true })}
    ${field("v-link", "Dossier en ligne (lien du QR code à bord)", v.docsLink, { ph: "https://…", wide: true })}
    ${field("v-todo", "Réparations à prévoir", v.todo, { type: "textarea", wide: true })}${field("v-notes", "Commentaires", v.notes, { type: "textarea", wide: true })}</div>
    <div class="hint">Chaque identifiant ne peut servir qu'une seule fois, même après la vente, le retrait ou la suppression d'un véhicule. Il doit être identique au n° du véhicule dans WebFleet${v.webfleetId && fleetNo(v) && normFleetNo(v.webfleetId) !== fleetNo(v) ? ` <b style="color:var(--warn,#b54708)">(ici différent : WebFleet ${esc(v.webfleetId)} — Paramètres → Liaison WEBFLEET → « Aligner les fiches sur WebFleet »)</b>` : ""}.${isNew ? " Le prochain numéro libre est proposé." : ""}</div><div class="err" id="v-err"></div></div>
    <footer>${isNew ? "" : `<div class="left"><button type="button" class="btn danger" data-a="veh-del" data-id="${v.id}" ${dis()}>Supprimer</button></div>`}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "lg");
  const noIn = m.querySelector("#v-no"), err = m.querySelector("#v-err");
  const checkNo = () => {
    const raw = noIn.value.trim();
    if (!/^[A-Za-z0-9]{1,6}$/.test(raw)) return "L'identifiant doit contenir de 1 à 6 lettres ou chiffres (sans espace ni symbole).";
    const n = normFleetNo(raw);
    if (usedFleetNos(v.id).has(n)) {
      const other = S.vehicles.find(x => x.id !== v.id && fleetNo(x) === n);
      return `L'identifiant ${n} est déjà utilisé${other ? ` par ${other.plate} · ${other.model}${other.retired ? " (véhicule retiré)" : ""}` : " par un véhicule supprimé"}. Un identifiant ne peut servir qu'une seule fois. Prochain numéro libre : ${nextFleetNo()}.`;
    }
    return "";
  };
  noIn.addEventListener("input", () => { noIn.value = noIn.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); const msg = noIn.value.length >= 3 ? checkNo() : ""; err.textContent = msg; noIn.classList.toggle("invalid", !!msg); });
  noIn.addEventListener("blur", () => { if (noIn.value) { noIn.value = normFleetNo(noIn.value); const msg = checkNo(); err.textContent = msg; noIn.classList.toggle("invalid", !!msg); } });
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const msg = checkNo(); if (msg) { err.textContent = msg; noIn.classList.add("invalid"); noIn.focus(); return; }
    const plate = val("v-plate").toUpperCase(), dup = plate && S.vehicles.find(x => x.id !== v.id && !x.retired && x.plate === plate);
    if (!plate && val("v-cat") !== "chantier") { err.textContent = "L'immatriculation est obligatoire pour un véhicule routier."; return; }
    if (dup) { err.textContent = `La plaque ${plate} est déjà attribuée au véhicule ${fleetNo(dup) || ""} en service.`; return; }
    const id = await save("vehicles", v.id, Object.assign(strip(v), { fleetNo: normFleetNo(noIn.value), cat: val("v-cat"), plate: val("v-plate").toUpperCase(), model: val("v-model"), year: val("v-year"), fuel: val("v-fuel"), vin: val("v-vin"), km: +val("v-km") || 0, status: val("v-st"), webfleetId: val("v-wf"), nextServiceDate: val("v-ns"), nextServiceKm: +val("v-nk") || 0, ctDate: val("v-ct"), insuranceDate: val("v-ins"), cc: +val("v-cc") || 0, kw: +val("v-kw") || 0, euro: val("v-euro"), garage: val("v-garage"), beltNA: m.querySelector("#v-bna").checked, beltLastDate: val("v-bld"), beltLastKm: +val("v-blk") || 0, beltDate: val("v-bd"), beltKm: +val("v-bk") || 0, todo: val("v-todo"), notes: val("v-notes"), docsLink: val("v-link"), dropboxLink: val("v-dbx") }));
    toast("Véhicule enregistré");
    const nv = veh(id) || Object.assign({ id }, v, { km: +val("v-km") || 0 }), kmIn = +val("v-km") || 0;
    /* compteur modifié et différent de WebFleet : proposer de corriger WebFleet (jamais automatique) */
    if (canWfPush() && wfLinked(nv) && kmIn && wfOdo(nv) && Math.abs(kmIn - wfOdo(nv)) >= 1 && Math.abs(kmIn - kmOf0) >= 0.05) wfOdoAsk(Object.assign({}, nv, { km: kmIn }), kmIn, () => openVehicle(id));
    else openVehicle(id);
  };
};
ACTIONS["veh-del"] = el => {
  const v = veh(el.dataset.id);
  confirmBox(`Supprimer définitivement ce véhicule ? Pour un véhicule vendu ou hors service, préférez « Retirer de la flotte » qui garde la fiche.${fleetNo(v) ? ` L'identifiant ${fleetNo(v)} restera réservé et ne pourra pas être réutilisé.` : ""}`, async () => {
    if (fleetNo(v)) await saveSettings({ usedFleetNos: [...new Set([...(settings().usedFleetNos || []), fleetNo(v)])] });
    await remove("vehicles", v.id);
  });
};
ACTIONS["drive-form"] = el => {
  const v = veh(el.dataset.id);
  const m = modal(`${mHead("Prise en charge · " + esc(v.plate))}<form><div class="body"><div class="fields">
    ${field("dr-name", "Chauffeur", "", { type: (settings().drivers || []).length ? "select" : "text", options: driverOptions(), required: true })}
    ${field("dr-date", "Date", today(), { type: "date" })}${field("dr-km", "Kilométrage au compteur", Math.round(kmOf(v)) || "", { type: "number", min: 0 })}</div>
    ${field("dr-note", "Remarque", "", { wide: true })}<div class="err" id="dr-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`, "sm");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const km = +val("dr-km") || 0;
    if (km && kmOf(v) && km < Math.floor(kmOf(v))) { m.querySelector("#dr-err").textContent = `Le compteur ne peut pas être inférieur au dernier relevé (${fmtN.format(Math.round(kmOf(v)))} km).`; return; }
    await save("driverLogs", null, { vehicleId: v.id, driver: val("dr-name"), date: val("dr-date"), km, note: val("dr-note"), at: new Date().toISOString() });
    await patch("vehicles", v.id, { driver: val("dr-name"), driverDate: val("dr-date"), km: km || v.km || 0 });
    toast("Prise en charge enregistrée"); openVehicle(v.id);
  };
};
ACTIONS["ev-form"] = el => {
  const e0 = S.vehEvents.find(x => x.id === el.dataset.id) || { vehicleId: el.dataset.veh || "", type: "entretien", date: today(), status: "realisee", cost: 0 };
  const isNew = !e0.id;
  const open = S.faults.filter(f => f.status !== "reparee" && (!e0.vehicleId || f.vehicleId === e0.vehicleId));
  const m = modal(`${mHead(isNew ? "Nouvelle intervention" : "Intervention")}<form><div class="body"><div class="fields">
    ${field("e-veh", "Véhicule", e0.vehicleId, { type: "select", options: [["", "Choisir…"], ...S.vehicles.filter(v => (!v.retired || v.id === e0.vehicleId) && (!isLimited() || v.atMyGarage)).map(v => [v.id, v.plate + " · " + v.model])], required: true })}
    ${field("e-type", "Type", e0.type, { type: "select", options: Object.entries(EV_TYPES) })}
    ${field("e-st", "Statut", e0.status, { type: "select", options: [["realisee", "Réalisée"], ["planifiee", "Planifiée"]] })}
    ${field("e-date", "Date (réalisée ou prévue)", e0.date, { type: "date", required: true })}${field("e-km", "Kilométrage", e0.km, { type: "number" })}
    ${field("e-cost", "Coût HT (€)", e0.cost, { type: "number", step: "0.01" })}${isOffice() && (S.garages || []).length ? field("e-gar", "Garage", e0.garageId || "", { type: "select", options: [["", "— autre / aucun —"], ...(S.garages || []).map(g => [g.id, g.name])] }) : ""}${field("e-sup", "Garage / fournisseur", e0.supplier || (ME && ME.role === "garage" ? garageName((S.garages || [])[0]?.id) : ""))}${field("e-ref", "N° de facture fournisseur", e0.invoiceRef, { cls: "mono" })}</div>
    ${field("e-desc", "Travaux effectués / à effectuer", e0.description, { type: "textarea", wide: true, required: true })}
    ${open.length ? field("e-fault", "Cette intervention répare la panne…", e0.faultId, { type: "select", options: [["", "Aucune"], ...open.map(f => [f.id, vehLabel(f.vehicleId) + " · " + f.description])] }) : ""}
    <label class="chk"><input type="checkbox" id="e-next" ${isNew && e0.type === "entretien" ? "checked" : ""}> Après un entretien réalisé : reporter la prochaine échéance (+12 mois, +30 000 km)</label>${isNew ? "" : histBox("vehEvents", e0.id)}</div>
    <footer>${isNew ? "" : `<div class="left"><button type="button" class="btn danger" data-a="ev-del" data-id="${e0.id}" ${dis()}>Supprimer</button></div>`}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "lg");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const data = Object.assign(strip(e0), { vehicleId: val("e-veh"), type: val("e-type"), status: val("e-st"), date: val("e-date"), km: +val("e-km") || 0, cost: +val("e-cost") || 0, supplier: val("e-sup"), invoiceRef: val("e-ref"), description: val("e-desc"), faultId: val("e-fault") }, isOffice() && document.getElementById("e-gar") ? { garageId: val("e-gar"), supplier: val("e-sup") || garageName(val("e-gar")) } : {});
    await save("vehEvents", e0.id, data);
    const v = veh(data.vehicleId);
    if (data.km && v && data.km > (+v.km || 0) && data.status === "realisee") await patch("vehicles", v.id, { km: data.km });
    if (data.faultId) { const f = S.faults.find(x => x.id === data.faultId); if (f) await patch("faults", f.id, data.status === "realisee" ? { status: "reparee", resolvedDate: data.date } : { status: "planifiee", estDate: data.date }); }
    if (document.getElementById("e-next")?.checked && data.type === "entretien" && data.status === "realisee" && v) await patch("vehicles", v.id, { nextServiceDate: addMonths(data.date, 12), nextServiceKm: (data.km || +v.km || 0) + 30000 });
    toast("Intervention enregistrée"); openVehicle(data.vehicleId);
  };
};
ACTIONS["ev-del"] = el => confirmBox("Supprimer cette intervention ?", () => remove("vehEvents", el.dataset.id));

/* ---------- pannes ---------- */
ACTIONS["fault-form"] = el => {
  const m = modal(`${mHead("Signaler une panne")}<form>${faultFields(el.dataset.veh)}<footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Envoyer le signalement</button></footer></form>`);
  wireFault(m.querySelector("form"), id => openVehicle(id));
};
function faultFields(vid) {
  const ds = settings().drivers || [];
  return `<div class="body"><div class="fields">
    ${field("f-veh", "Véhicule", vid || "", { type: "select", options: [["", "Choisir…"], ...activeVehicles().sort((a, b) => a.plate.localeCompare(b.plate)).map(v => [v.id, v.plate + " · " + v.model])], required: true })}
    ${field("f-rep", "Votre nom", "", ds.length ? { type: "select", options: driverOptions(), required: true } : { required: true })}
    ${field("f-km", "Kilométrage au compteur", "", { type: "number", min: 0 })}
    ${field("f-sev", "Gravité", "mineure", { type: "select", options: Object.entries(SEV).map(([k, v]) => [k, v[0]]) })}${field("f-kind", "Type", "panne", { type: "select", options: Object.entries(FAULT_KIND).filter(([k]) => k !== "tache" || isOffice()) })}</div>
    ${ME && ME.role === "garage" ? `<div class="muted small">Un véhicule qui n'est pas dans votre garage : le signalement est enregistré « En attente » et sera validé par W.A.Y.S.</div>` : ""}
    ${field("f-desc", "Qu'avez-vous constaté ?", "", { type: "textarea", wide: true, required: true, ph: "Bruit au freinage, voyant moteur allumé, pneu avant droit usé…" })}
    <label class="f">Photo (facultatif)<input type="file" id="f-photo" accept="image/*" capture="environment"></label>
    <div class="err" id="f-err"></div></div>`;
}
function wireFault(form, after) {
  if (userCap) userCap.me().then(me => { const r = form.querySelector("#f-rep"); if (me.name && r && r.tagName === "INPUT" && !r.value) r.value = me.name; }).catch(() => { });
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = form.querySelector("button.primary"); btn.disabled = true;
    try {
      let photo = "";
      const file = form.querySelector("#f-photo").files[0];
      if (file) {
        if (!assets) toast("Photo non envoyée : l'ajout de fichiers n'est pas autorisé pour votre accès.");
        else { try { photo = (await assets.upload(file, file.type ? undefined : { type: "image/jpeg" })).id; } catch { toast("La photo n'a pas pu être envoyée ; le signalement part sans elle."); } }
      }
      const vid = val("f-veh"), km = +val("f-km") || 0;
      await save("faults", null, { vehicleId: vid, reporter: val("f-rep"), date: today(), km, severity: val("f-sev"), kind: val("f-kind") || "panne", description: val("f-desc"), status: "ouverte", estDate: "", photo, at: new Date().toISOString() });
      const v = veh(vid); if (km && v && km > (+v.km || 0) && (!isLimited() || v.atMyGarage)) await patch("vehicles", vid, { km });
      toast(ME && ME.role === "garage" && v && !v.atMyGarage ? "Signalement envoyé : en attente de validation par W.A.Y.S." : "Panne signalée, merci"); after(vid);
    } catch { btn.disabled = false; }
  };
}
ACTIONS["fault-open"] = el => {
  const f = S.faults.find(x => x.id === el.dataset.id); if (!f) return;
  const m = modal(`${mHead("Panne · " + esc(vehLabel(f.vehicleId)))}<form><div class="body">
    <dl class="kv"><dt>Signalée le</dt><dd>${fmtDate(f.date)} par ${esc(f.reporter || "—")}</dd><dt>Kilométrage</dt><dd>${f.km ? fmtN.format(f.km) + " km" : "—"}</dd><dt>Gravité</dt><dd><span class="chip ${SEV[f.severity]?.[1]}">${SEV[f.severity]?.[0]}</span></dd></dl>
    <div class="quote">${esc(f.description)}</div>${f.photo ? `<img class="photo" src="${esc(blobUrl(f.photo))}" alt="Photo jointe au signalement">` : ""}
    ${f.status === "attente" ? `<div class="banner warn">Signalé par un garage pour un véhicule qui n'était pas chez lui : <b>en attente de validation</b>.${isOffice() ? ` <button type="button" class="btn sm" data-a="fault-validate" data-id="${f.id}" ${dis()}>Valider</button>` : ""}</div>` : ""}
    <div class="fields">${field("fx-st", "Statut", f.status, { type: "select", options: Object.entries(FAULT_ST).filter(([k]) => k !== "attente" || f.status === "attente").map(([k, v]) => [k, v[0]]) })}${field("fx-kind", "Type", f.kind || "panne", { type: "select", options: Object.entries(FAULT_KIND) })}
    ${isOffice() ? field("fx-gar", "Attribuée au garage", f.garageId || "", { type: "select", options: [["", "— aucun —"], ...(S.garages || []).map(g => [g.id, g.name])] }) : f.garageId ? `<label class="f">Garage<input value="${esc(garageName(f.garageId))}" readonly></label>` : ""}
    ${field("fx-est", "Date de réparation estimée", f.estDate, { type: "date" })}${field("fx-sev", "Gravité", f.severity, { type: "select", options: Object.entries(SEV).map(([k, v]) => [k, v[0]]) })}</div>
    ${field("fx-note", "Diagnostic / commentaire atelier", f.note, { type: "textarea", wide: true })}</div>${histBox("faults", f.id)}
    <footer><div class="left"><button type="button" class="btn" data-a="veh-open" data-id="${f.vehicleId}">Voir le véhicule</button>${isOffice() ? `<button type="button" class="btn danger" data-a="fault-del" data-id="${f.id}" ${dis()}>Supprimer</button>` : ""}</div><button type="button" class="btn" data-close>Fermer</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const st = val("fx-st");
    await patch("faults", f.id, Object.assign({ status: st, kind: val("fx-kind"), estDate: val("fx-est"), severity: val("fx-sev"), note: val("fx-note"), resolvedDate: st === "reparee" ? (f.resolvedDate || today()) : "" }, isOffice() ? { garageId: val("fx-gar") } : {}));
    closeModal(); toast("Panne mise à jour");
  };
};

ACTIONS["fault-validate"] = async el => { await patch("faults", el.dataset.id, { status: "ouverte", validatedAt: new Date().toISOString(), validatedBy: (ME && ME.name) || "" }); closeModal(); toast("Signalement validé"); };
ACTIONS["fault-del"] = el => {
  const f = S.faults.find(x => x.id === el.dataset.id); if (!f) return;
  const fixed = f.status === "reparee";
  confirmBox(fixed ? `Supprimer cette panne réparée de <b>${esc(vehLabel(f.vehicleId))}</b> ? Elle disparaîtra de la liste des pannes et de la fiche du véhicule.`
    : `<b>Cette panne n'a pas été réparée</b> (statut : ${esc(FAULT_ST[f.status]?.[0] || f.status || "—")}).<br>Voulez-vous vraiment la supprimer sans réparation ? Elle disparaîtra de la liste des pannes et de la fiche de <b>${esc(vehLabel(f.vehicleId))}</b>. Si elle a simplement été réglée, préférez le statut « Réparée ».`,
    async () => { await remove("faults", f.id); closeModal(); toast("Panne supprimée"); }, fixed ? "Supprimer" : "Supprimer sans réparation");
};

/* ---------- page « Signaler une panne » (mobile, pour les chauffeurs) ---------- */
VIEWS.signaler = {
  static: true,
  render() {
    if (!S.vehicles.length && mode !== "db") return head("Signaler une panne") + `<div class="panel empty">Aucun véhicule enregistré.</div>`;
    return head("Signaler une panne", "Décrivez ce que vous avez constaté : l'atelier est prévenu immédiatement.") +
      `<form class="panel narrow" id="f-sig">${faultFields("")}<footer><button class="btn primary big">Envoyer le signalement</button></footer></form>
      <div class="panel narrow pad"><h3 class="np">Vos derniers signalements</h3><div class="muted small">Les pannes ouvertes et leur date de réparation prévue sont visibles dans Flotte → Pannes.</div></div>`;
  },
  after() {
    const f = document.getElementById("f-sig"); if (!f) return;
    wireFault(f, () => { f.reset(); f.querySelector("button.primary").disabled = false; f.insertAdjacentHTML("afterbegin", `<div class="banner info" style="margin:16px 16px 0">Merci, votre signalement a été enregistré.</div>`); });
  }
};

/* ======================= documents des véhicules ======================= */
const VDOC_TYPES = { assurance: "Assurance (carte verte)", ct: "Contrôle technique", immat: "Certificat d'immatriculation", coc: "Certificat de conformité", lpg: "Installation / réservoir LPG", badge: "Badge aéroport LGG", leasing: "Contrat de leasing / location", tachy: "Tachygraphe", adr: "Certificat ADR", carnet: "Carnet d'entretien", vignette: "Vignette / Viapass", autre: "Autre" };
const VDOC_MAIN = ["assurance", "ct", "immat", "leasing", "adr"];
function docState(d) {
  if (!d.expires) return { cls: "grey", label: "Sans échéance", pct: 100, days: null };
  const days = daysBetween(today(), d.expires);
  const span = d.issued ? Math.max(1, daysBetween(d.issued, d.expires)) : 365;
  const pct = Math.max(0, Math.min(100, days / span * 100));
  if (days < 0) return { cls: "red", label: `Expiré depuis ${-days} j`, pct: 100, days };
  if (days <= 30) return { cls: "orange", label: days === 0 ? "Expire aujourd'hui" : `Expire dans ${days} j`, pct, days };
  if (days <= 90) return { cls: "yellow", label: `Expire dans ${days} j`, pct, days };
  return { cls: "green", label: `Valide · ${fmtDate(d.expires)}`, pct, days };
}
/* document le plus récent de chaque type (les anciens restent en historique) */
function currentDocs(v) {
  const by = {};
  for (const d of (v.docs || []).filter(d => !d.old)) { const k = d.type === "autre" ? d.id : d.type; if (!by[k] || (d.expires || d.issued || "") > (by[k].expires || by[k].issued || "")) by[k] = d; }
  return by;
}
function docSummary(v) {
  const cur = Object.values(currentDocs(v)), n = cur.length;
  if (!n) return `<span class="muted">Aucun</span>`;
  const st = cur.map(docState), bad = st.filter(x => x.cls === "red").length, soon = st.filter(x => x.cls === "orange" || x.cls === "yellow").length;
  return bad ? `<span class="chip bad">${bad} expiré${bad > 1 ? "s" : ""}</span>` : soon ? `<span class="chip warn">${soon} à renouveler</span>` : `<span class="chip good">${n} à jour</span>`;
}
function fleetDocAlerts() { return activeVehicles().reduce((a, v) => a + Object.values(currentDocs(v)).filter(d => ["red", "orange"].includes(docState(d).cls)).length, 0); }
function docCard(v, d, old) {
  const st = docState(d);
  return `<div class="vdoc c-${st.cls} ${old ? "old" : ""}">
    <div class="vdoc-ic">${d.file ? (d.mime || "").startsWith("image/") ? `<img src="${esc(blobUrl(d.file))}" alt="">` : (d.mime || "").includes("pdf") ? "PDF" : "DOC" : "—"}</div>
    <div class="grow"><div class="row-sb"><b>${esc(VDOC_TYPES[d.type] || d.type)}${d.dbx ? ` <span class="chip sm" title="${esc(tr("Copié dans Dropbox") + " : " + d.dbx)}">Dropbox ✓</span>` : d.dbxErr ? ` <span class="chip warn sm" title="${esc(d.dbxErr)}">Dropbox ✗</span>` : ""}</b><span class="chip ${({ red: "bad", orange: "orange", yellow: "warn", green: "good", grey: "" })[st.cls]}">${st.label}</span></div>
      <div class="muted small">${[d.name, d.number ? "n° " + d.number : "", d.issued ? "émis le " + fmtDate(d.issued) : "", d.expires ? "expire le " + fmtDate(d.expires) : ""].filter(Boolean).map(esc).join(" · ")}</div>
      ${d.expires ? `<div class="lifebar" title="Validité restante"><span style="width:${st.pct}%"></span></div>` : ""}</div>
    <div class="row-g">${d.file ? `<a class="btn sm" href="${esc(blobUrl(d.file))}" target="_blank" rel="noopener">Ouvrir</a>` : /^https:\/\/www\.dropbox\.com\//.test(v.dropboxLink || "") ? `<a class="btn sm" href="${esc(v.dropboxLink)}" target="_blank" rel="noopener" title="Le fichier est dans le dossier Dropbox du véhicule">Dropbox ↗</a>` : ""}${readOnly ? "" : `<button class="btn sm" data-a="vdoc-form" data-veh="${v.id}" data-id="${d.id}">Modifier</button>`}</div></div>`;
}
function vehDocsHtml(v) {
  const all = (v.docs || []).slice(), cur = currentDocs(v), curIds = new Set(Object.values(cur).map(d => d.id));
  if (!all.length) return `<div class="muted">Aucun document. Ajoutez la carte verte, le contrôle technique, le certificat d'immatriculation…</div>`;
  const sorted = Object.values(cur).sort((a, b) => (docState(a).days ?? 99999) - (docState(b).days ?? 99999));
  const old = all.filter(d => !curIds.has(d.id)).sort((a, b) => (b.expires || "").localeCompare(a.expires || ""));
  return `<div class="stack-s">${sorted.map(d => docCard(v, d)).join("")}</div>
    ${old.length ? `<details><summary>Anciens documents (${old.length})</summary><div class="stack-s" style="margin-top:8px">${old.map(d => docCard(v, d, true)).join("")}</div></details>` : ""}`;
}
/* ---------- onglet Documents : tous les documents, filtrables ---------- */
const DOC_ST = { red: ["Expiré", "red"], orange: ["Moins de 30 jours", "orange"], yellow: ["Moins de 3 mois", "yellow"], green: ["Valide", "green"], grey: ["Sans échéance", "grey"] };
const docF = () => UI.docF || (UI.docF = { types: [], veh: [], st: [], old: false, view: "liste" });
function fleetDocs() {
  const f = docF(), q = UI.q.toLowerCase();
  const all = [];
  for (const v of activeVehicles()) {
    const curIds = new Set(Object.values(currentDocs(v)).map(d => d.id));
    for (const d of v.docs || []) { const cur = curIds.has(d.id); all.push({ v, d, cur, st: cur ? docState(d) : { cls: "grey", label: d.expires ? "Remplacé · fin " + fmtDate(d.expires) : "Remplacé", pct: 0, days: null } }); }
  }
  const base = all.filter(x => f.old || x.cur);
  const match = (x, skip) => (skip === "t" || !f.types.length || f.types.includes(x.d.type)) && (skip === "v" || !f.veh.length || f.veh.includes(x.v.id)) && (skip === "s" || !f.st.length || f.st.includes(x.st.cls))
    && (!q || [VDOC_TYPES[x.d.type], x.d.name, x.d.number, x.v.plate, fleetNo(x.v), x.v.model, x.d.note].join(" ").toLowerCase().includes(q));
  const rows = base.filter(x => match(x)).sort((a, b) => (a.st.days ?? 1e9) - (b.st.days ?? 1e9) || a.v.plate.localeCompare(b.v.plate));
  const n = (skip, pred) => base.filter(x => match(x, skip) && pred(x)).length;
  const pill = (attr, val, on, label, c, cnt) => `<button class="fpill ${on ? "on" : ""} ${c ? "c-" + c : ""}" data-a="doc-f" data-${attr}="${val}" aria-pressed="${on}">${label}<span class="n">${cnt}</span></button>`;
  const types = Object.keys(VDOC_TYPES).filter(t => all.some(x => x.d.type === t));
  const vs = activeVehicles().sort((a, b) => (fleetNo(a) || a.plate).localeCompare(fleetNo(b) || b.plate));
  const tiles = `<div class="tiles doc-tiles">${Object.entries(DOC_ST).map(([k, [l, c]]) => `<button class="panel tile c-${c} ${f.st.includes(k) ? "sel" : ""}" data-a="doc-f" data-st="${k}"><div class="lbl">${l}</div><div class="val">${n("s", x => x.st.cls === k)}</div></button>`).join("")}</div>`;
  const filters = `<div class="panel pad stack todo-filters">
    <div class="frow"><span class="flabel">Rechercher</span><input type="search" id="q" class="fsearch" placeholder="Organisme, n° de police, plaque, remarque…" value="${esc(UI.q)}" aria-label="Rechercher un document"><span></span></div>
    <div class="frow"><span class="flabel">Type</span><div class="fpills">${types.map(t => pill("type", t, f.types.includes(t), esc(VDOC_TYPES[t]), "", n("t", x => x.d.type === t))).join("")}</div><span></span></div>
    <div class="frow"><span class="flabel">Véhicule</span>${vehPicker(f.veh, "doc-f", id => n("v", x => x.v.id === id))}<span></span></div>
    <div class="frow"><span class="flabel">État</span><div class="fpills">${Object.entries(DOC_ST).map(([k, [l, c]]) => pill("st", k, f.st.includes(k), l, c, n("s", x => x.st.cls === k))).join("")}</div>
      ${f.types.length || f.veh.length || f.st.length || UI.q ? `<button class="linkbtn" data-a="doc-f" data-reset="1">Effacer les filtres</button>` : "<span></span>"}</div>
    <div class="frow"><span class="flabel">Affichage</span><div class="fpills"><button class="fpill ${f.view === "liste" ? "on" : ""}" data-a="doc-f" data-view="liste">Liste</button><button class="fpill ${f.view === "vehicule" ? "on" : ""}" data-a="doc-f" data-view="vehicule">Par véhicule</button>
      <label class="chk small"><input type="checkbox" data-a="doc-f" data-old="1" ${f.old ? "checked" : ""}> Inclure les anciens documents remplacés</label></div><span></span></div></div>`;
  const byVeh = f.view === "vehicule";
  const row = x => `<tr class="click doc-row c-${x.st.cls} ${x.cur ? "" : "old"}" data-a="vdoc-form" data-veh="${x.v.id}" data-id="${x.d.id}">
    ${byVeh ? "" : `<td>${noBadge(x.v, 1)} <span class="plate sm">${esc(x.v.plate)}</span><div class="muted small">${esc(x.v.model)}</div></td>`}
    <td><b>${esc(VDOC_TYPES[x.d.type] || x.d.type)}</b><div class="muted small">${esc([x.d.name, x.d.number ? "n° " + x.d.number : ""].filter(Boolean).join(" · "))}</div></td>
    <td class="num">${fmtDate(x.d.issued)}</td><td class="num">${x.d.expires ? fmtDate(x.d.expires) : "—"}</td>
    <td style="min-width:170px"><span class="chip ${({ red: "bad", orange: "orange", yellow: "warn", green: "good", grey: "" })[x.st.cls]}">${x.st.label}</span>${x.d.expires ? `<span class="lifebar"><span style="width:${x.st.pct}%"></span></span>` : ""}</td>
    <td class="r nowrap">${x.d.file ? `<a class="btn sm" href="${esc(blobUrl(x.d.file))}" target="_blank" rel="noopener" data-stop>Ouvrir</a>` : `<span class="muted small">Pas de fichier</span>`}</td></tr>`;
  const head = `<thead><tr>${byVeh ? "" : "<th>Véhicule</th>"}<th>Document</th><th>Émis le</th><th>Expire le</th><th>État</th><th class="r">Fichier</th></tr></thead>`;
  let body;
  if (!rows.length) body = `<div class="panel empty">${all.length ? "Aucun document ne correspond à ces filtres." : "Aucun document enregistré. Ouvrez une fiche véhicule pour en ajouter."}</div>`;
  else if (f.view === "vehicule") {
    body = vs.filter(v => rows.some(x => x.v.id === v.id)).map(v => { const rs = rows.filter(x => x.v.id === v.id);
      return `<div class="panel doc-group"><div class="row-sb pad"><div class="row-g">${noBadge(v)}<span class="plate">${esc(v.plate)}</span><b>${esc(v.model)}</b></div>
        <div class="row-g">${docSummary(v)}${readOnly ? "" : `<button class="btn sm" data-a="vdoc-form" data-veh="${v.id}">+ Ajouter un document</button>`}</div></div>
        <div class="tablewrap"><table>${head}<tbody>${rs.map(row).join("")}</tbody></table></div></div>`; }).join("");
  } else body = `<div class="panel"><div class="row-sb pad"><h3 class="np">${plural(rows.length, "document")}${rows.length !== base.length ? ` sur ${base.length}` : ""}</h3>
    ${readOnly ? "" : `<select class="fsel" data-a="noop" id="doc-addveh" aria-label="Ajouter un document à un véhicule"><option value="">+ Ajouter un document à…</option>${vs.map(v => `<option value="${v.id}">${esc((fleetNo(v) ? fleetNo(v) + " · " : "") + v.plate + " · " + v.model)}</option>`).join("")}</select>`}</div>
    <div class="tablewrap"><table>${head}<tbody>${rows.map(row).join("")}</tbody></table></div></div>`;
  return tiles + filters + body;
}
ACTIONS["doc-f"] = el => {
  const f = docF(), d = el.dataset, tog = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  if (d.reset) { f.types = []; f.veh = []; f.st = []; UI.q = ""; }
  else if (d.type) f.types = tog(f.types, d.type);
  else if (d.veh) f.veh = tog(f.veh, d.veh);
  else if (d.st) f.st = tog(f.st, d.st);
  else if (d.view) f.view = d.view;
  else if (d.old) f.old = !f.old;
  UI.focusQ = false; render(true);
};
document.addEventListener("change", e => { if (e.target.id === "doc-addveh" && e.target.value) { const vid = e.target.value; e.target.value = ""; ACTIONS["vdoc-form"]({ dataset: { veh: vid } }); } });
ACTIONS["vdoc-form"] = el => {
  const v = veh(el.dataset.veh); if (!v) return;
  const d = (v.docs || []).find(x => x.id === el.dataset.id) || { type: el.dataset.type || "assurance", issued: today() };
  const isNew = !d.id;
  const m = modal(`${mHead((isNew ? "Nouveau document · " : "Document · ") + `<span class="plate sm">${esc(v.plate)}</span>`)}<form><div class="body"><div class="fields">
    ${field("vd-type", "Type de document", d.type, { type: "select", options: Object.entries(VDOC_TYPES) })}
    ${field("vd-name", "Intitulé / organisme", d.name, { ph: "AG Insurance, Autosécurité Mons…" })}${field("vd-num", "N° de document / police", d.number, { cls: "mono" })}
    ${field("vd-iss", "Date d'émission / de début", d.issued, { type: "date" })}${field("vd-exp", "Date d'expiration (si applicable)", d.expires, { type: "date" })}</div>
    ${assets && !readOnly ? `<label class="f">${d.file ? "Remplacer le fichier" : "Fichier (PDF ou photo)"}<input type="file" id="vd-file" accept="application/pdf,image/*"></label>` : `<div class="hint">L'ajout de fichiers est réservé aux éditeurs de l'application.</div>`}
    ${d.file ? `<div><a class="btn sm" href="${esc(blobUrl(d.file))}" target="_blank" rel="noopener">Ouvrir le fichier actuel</a></div>` : ""}
    ${(d.prev || []).length ? `<div class="vprev"><b>Versions précédentes</b>${d.prev.map(p => `<div class="row-sb small"><span>${p.issued || p.expires ? `${p.issued ? fmtDate(p.issued) : "…"} → ${p.expires ? fmtDate(p.expires) : "…"}` : esc(p.fileName || "Version")}${p.number && p.number !== d.number ? ` <span class="muted mono">${esc(p.number)}</span>` : ""}</span>${p.file ? `<a class="linkbtn" href="${esc(blobUrl(p.file))}" target="_blank" rel="noopener">Ouvrir</a>` : ""}</div>`).join("")}</div>` : ""}
    ${field("vd-note", "Remarque", d.note, { type: "textarea", wide: true })}
    ${isNew ? "" : `<label class="chk"><input type="checkbox" id="vd-old" ${d.old ? "checked" : ""}> Classer dans les anciens documents <span class="muted small">(n'est plus le document en cours, ni pris en compte pour les échéances)</span></label>`}
    <div class="hint">Pour l'assurance et le contrôle technique, la date d'expiration met aussi à jour les échéances du véhicule. Remplacer le fichier garde l'ancien dans les versions précédentes.</div><div class="err" id="vd-err"></div></div>
    <footer>${isNew ? "" : `<div class="left"><button type="button" class="btn danger" data-a="vdoc-del" data-veh="${v.id}" data-id="${d.id}">Supprimer</button></div>`}<button type="button" class="btn" data-a="veh-open" data-id="${v.id}">Retour</button><button class="btn primary">Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const btn = m.querySelector("button.primary"); btn.disabled = true;
    const doc = Object.assign({}, d, { id: d.id || uid(), type: val("vd-type"), name: val("vd-name"), number: val("vd-num"), issued: val("vd-iss"), expires: val("vd-exp"), note: val("vd-note") });
    const oldBox = m.querySelector("#vd-old"); if (oldBox) { if (oldBox.checked) doc.old = true; else delete doc.old; }
    const f = m.querySelector("#vd-file")?.files[0];
    if (f) {
      try { const r = await assets.upload(f, f.type ? undefined : { type: "application/pdf" });
        if (d.file) doc.prev = [{ file: d.file, mime: d.mime || "", fileName: d.fileName || "", number: d.number || "", issued: d.issued || "", expires: d.expires || "", archivedAt: today() }, ...(d.prev || [])].slice(0, 10);
        doc.file = r.id; doc.mime = r.contentType; doc.fileName = f.name; delete doc.dbx; delete doc.dbxOld; delete doc.dbxErr; delete doc.dbxAt; }
      catch (er) { m.querySelector("#vd-err").textContent = er.code === "too_large" ? "Fichier trop lourd (20 Mo maximum)." : er.code === "unsupported_type" ? "Format non accepté : utilisez un PDF ou une photo." : "Le fichier n'a pas pu être envoyé. Réessayez."; btn.disabled = false; return; }
    }
    const fresh = veh(v.id), docs = (fresh.docs || []).filter(x => x.id !== doc.id).concat(doc);
    const upd = { docs };
    const latest = t => docs.filter(x => x.type === t && x.expires && !x.old).sort((a, b) => b.expires.localeCompare(a.expires))[0];
    if (doc.type === "assurance" && latest("assurance")) upd.insuranceDate = latest("assurance").expires;
    if (doc.type === "ct" && latest("ct")) upd.ctDate = latest("ct").expires;
    await patch("vehicles", v.id, upd);
    if (typeof dbxSoon === "function") dbxSoon();
    toast(doc.old ? "Document classé dans les anciens documents" : "Document enregistré"); route() === "admin" ? closeModal() : openVehicle(v.id);
  };
};
ACTIONS["vdoc-del"] = el => {
  const v = veh(el.dataset.veh);
  confirmBox("Supprimer ce document de la fiche du véhicule ?", async () => { await patch("vehicles", v.id, { docs: (v.docs || []).filter(x => x.id !== el.dataset.id) }); setTimeout(() => route() === "admin" ? closeModal() : openVehicle(v.id), 50); });
};

/* ======================= retrait de la flotte ======================= */
ACTIONS["toggle-retired"] = () => { UI.showRetired = !UI.showRetired; render(true); };
ACTIONS["toggle-archived"] = () => { UI.showArchived = !UI.showArchived; render(true); };
const vLabel = v => [fleetNo(v) ? "ID " + fleetNo(v) : "", v.plate, v.model].filter(Boolean).join(" · ");
ACTIONS["veh-archive"] = el => {
  const v = veh(el.dataset.id); if (!v || !v.retired) return;
  const m = modal(`${mHead("Archiver le véhicule")}<div class="body stack-s">
    <div>Vous allez archiver <b>${esc(vLabel(v))}</b>.</div>
    <div class="muted small">Le véhicule quitte la liste des véhicules retirés et passe dans les Archives. Sa fiche, ses documents, ses interventions et ses coûts restent consultables, et vous pourrez le désarchiver à tout moment.</div>
    <label class="chk confirm-chk"><input type="checkbox" id="ar-ok"> Je confirme l'archivage de <b>${esc(v.plate || fleetNo(v) || v.model)}</b></label></div>
    <footer><button class="btn" data-close>Annuler</button><button class="btn primary" id="ar-yes" disabled>Archiver</button></footer>`, "sm");
  const ok = m.querySelector("#ar-ok"), yes = m.querySelector("#ar-yes");
  ok.onchange = () => yes.disabled = !ok.checked;
  yes.onclick = async () => { if (!ok.checked) return; closeModal(); await patch("vehicles", v.id, { archived: { date: today() } }); toast("Véhicule archivé"); UI.showArchived = true; render(true); };
};
ACTIONS["veh-unarchive"] = el => {
  const v = veh(el.dataset.id);
  confirmBox(`Sortir <b>${esc(vLabel(v))}</b> des archives ? Il réapparaîtra parmi les véhicules retirés de la flotte.`, async () => { const d = strip(veh(v.id)); delete d.archived; await save("vehicles", v.id, d); }, "Désarchiver");
};
ACTIONS["veh-purge"] = el => {
  const v = veh(el.dataset.id); if (!v || !v.archived) return;
  const key = fleetNo(v) || v.plate || "SUPPRIMER";
  const rel = { vehEvents: S.vehEvents.filter(e => e.vehicleId === v.id), faults: S.faults.filter(f => f.vehicleId === v.id), driverLogs: S.driverLogs.filter(l => l.vehicleId === v.id), fines: (S.fines || []).filter(f => f.vehicleId === v.id), trips: (S.trips || []).filter(t => t.vehicleId === v.id) };
  const n = Object.values(rel).reduce((a, r) => a + r.length, 0);
  const m = modal(`${mHead("Supprimer définitivement")}<div class="body stack-s">
    <div class="banner bad"><b>Action irréversible.</b> La fiche de <b>${esc(vLabel(v))}</b> sera effacée, avec ${plural((v.docs || []).length, "document")} et ${plural(n, "élément lié", "éléments liés")} (interventions, pannes, prises en charge, amendes, trajets).</div>
    ${fleetNo(v) ? `<div class="muted small">L'identifiant ${esc(fleetNo(v))} restera réservé et ne pourra pas être réattribué.</div>` : ""}
    <label class="f">Pour confirmer, tapez <b class="mono">${esc(key)}</b><input id="pg-key" class="mono" autocomplete="off"></label></div>
    <footer><button class="btn" data-close>Annuler</button><button class="btn primary danger-bg" id="pg-yes" disabled>Supprimer définitivement</button></footer>`, "sm");
  const inp = m.querySelector("#pg-key"), yes = m.querySelector("#pg-yes");
  const norm = x => x.toUpperCase().replace(/[^A-Z0-9]/g, "");
  inp.oninput = () => yes.disabled = norm(inp.value) !== norm(key);
  yes.onclick = async () => {
    if (norm(inp.value) !== norm(key)) return; yes.disabled = true;
    closeModal(); toast("Suppression du véhicule…");
    if (fleetNo(v)) await saveSettings({ usedFleetNos: [...new Set([...(settings().usedFleetNos || []), fleetNo(v)])] });
    for (const [col, list] of Object.entries(rel)) for (const x of list) await remove(col, x.id);
    if ((S.vehPos || []).some(p => p.id === v.id)) await remove("vehPos", v.id);
    await remove("vehicles", v.id); toast("Véhicule supprimé définitivement"); render(true);
  };
};
ACTIONS["veh-retire"] = el => {
  const v = veh(el.dataset.id); if (!v) return;
  const nOpen = openFaults(v.id).length, nPlan = S.vehEvents.filter(e => e.vehicleId === v.id && e.status === "planifiee").length;
  const m = modal(`${mHead(`Retirer <span class="plate">${esc(v.plate)}</span> de la flotte`)}<form><div class="body">
    <div class="banner">Le véhicule disparaîtra des véhicules actifs, des tâches, des signalements de panne et du tableau de bord. Sa fiche et tout son historique restent consultables dans « Véhicules retirés ».</div>
    <div class="fields">${field("rt-reason", "Motif", "vendu", { type: "select", options: Object.entries(RETIRE_REASONS) })}${field("rt-date", "Date de sortie", today(), { type: "date", required: true })}
      <span id="rt-sale" class="fields wide-span">${field("rt-buyer", "Acheteur", "")}${field("rt-price", "Prix de vente HT (€)", "", { type: "number", step: "0.01", min: 0 })}</span>
      ${field("rt-km", "Kilométrage final", Math.round(kmOf(v)) || "", { type: "number", min: 0 })}</div>
    ${field("rt-note", "Remarque", "", { type: "textarea", wide: true })}
    ${nOpen || nPlan ? `<div class="hint">${[nOpen ? plural(nOpen, "panne ouverte") : "", nPlan ? plural(nPlan, "intervention planifiée") : ""].filter(Boolean).join(" et ")} seront conservées dans l'historique mais ne seront plus suivies.</div>` : ""}
    <label class="chk confirm-chk"><input type="checkbox" id="rt-ok"> Je confirme le retrait de <b>${esc(v.plate)}</b> de la flotte</label><div class="err" id="rt-err"></div></div>
    <footer><button type="button" class="btn" data-a="veh-open" data-id="${v.id}">Annuler</button><button class="btn primary danger-bg" id="rt-go" disabled>Retirer de la flotte</button></footer></form>`);
  const sale = m.querySelector("#rt-sale"), rs = m.querySelector("#rt-reason"), ok = m.querySelector("#rt-ok"), go = m.querySelector("#rt-go");
  const sync = () => sale.style.display = rs.value === "vendu" ? "" : "none"; sync(); rs.onchange = sync;
  ok.onchange = () => go.disabled = !ok.checked;
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    if (!ok.checked) { m.querySelector("#rt-err").textContent = "Cochez la case de confirmation."; return; }
    go.disabled = true;
    const r = { reason: val("rt-reason"), date: val("rt-date"), note: val("rt-note") };
    if (r.reason === "vendu") { r.buyer = val("rt-buyer"); r.price = +val("rt-price") || 0; }
    const km = +val("rt-km") || 0;
    await patch("vehicles", v.id, Object.assign({ retired: r }, km > (+v.km || 0) ? { km } : {}));
    toast(`${v.plate} retiré de la flotte`); openVehicle(v.id);
  };
};
ACTIONS["veh-reactivate"] = el => {
  const v = veh(el.dataset.id);
  confirmBox(`Remettre <b>${esc(v.plate)}</b> en service ? Il réapparaîtra dans les véhicules actifs.`, async () => { const d = strip(veh(v.id)); delete d.retired; await save("vehicles", v.id, d); setTimeout(() => openVehicle(v.id), 60); }, "Remettre en service");
};

/* ======================= photo du véhicule ======================= */
const CAR_ICON = `<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M8 28v-7l5-9c1-2 3-3 5-3h22c2 0 4 1 5 3l6 9h3c2 0 3 1 3 3v4c0 1-1 2-2 2h-3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M8 30h4m12 0h18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="18" cy="30" r="5" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="48" cy="30" r="5" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M16 20l3-6h11v6zm18 0v-6h6l4 6z" fill="currentColor" opacity=".35"/></svg>`;
function vehThumb(v, size) {
  return `<span class="vthumb ${size || ""}">${v.photo ? `<img src="${esc(blobUrl(v.photo))}" alt="Photo du véhicule ${esc(v.plate)}" loading="lazy">` : CAR_ICON}</span>`;
}
/* réduit la photo (max 1280 px, JPEG) avant l'envoi : plus léger à afficher partout */
async function shrinkImage(file, max = 1280) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b || file), "image/jpeg", 0.85));
  } catch { return file; }
}
document.addEventListener("change", e => {
  const inp = e.target; if (!inp.dataset || !inp.dataset.vphoto) return;
  const f = inp.files[0], vid = inp.dataset.vphoto; inp.value = ""; if (!f || !assets) return;
  openCropper(f, vid);
});
/* cadrage : glisser pour déplacer, curseur / molette / pincement pour zoomer ; format 4:3 */
function openCropper(file, vid) {
  const v = veh(vid);
  const m = modal(`${mHead("Cadrer la photo · " + `<span class="plate sm">${esc(v.plate)}</span>`)}<div class="body">
    <div class="crop-wrap"><canvas id="crop-cv" class="crop-cv"></canvas><div class="crop-grid" aria-hidden="true"></div></div>
    <div class="row-g crop-zoom"><span class="muted small">Zoom</span><input type="range" id="crop-z" min="1" max="4" step="0.01" value="1" aria-label="Zoom"><button type="button" class="btn sm" id="crop-reset">Recentrer</button></div>
    <div class="hint">Faites glisser la photo pour la positionner dans le cadre. Molette ou pincement pour zoomer.</div><div class="err" id="crop-err"></div></div>
    <footer><button type="button" class="btn" data-a="veh-open" data-id="${vid}">Annuler</button><button class="btn primary" id="crop-ok" disabled>Valider la photo</button></footer>`, "crop");
  const cv = m.querySelector("#crop-cv"), ctx = cv.getContext("2d"), zIn = m.querySelector("#crop-z"), ok = m.querySelector("#crop-ok");
  const url = URL.createObjectURL(file), img = new Image();
  let W = 0, H = 0, base = 1, z = 1, ox = 0, oy = 0;
  const size = () => { const w = Math.min(560, m.querySelector(".crop-wrap").clientWidth || 560); W = w; H = Math.round(w * 3 / 4); const d = window.devicePixelRatio || 1; cv.width = W * d; cv.height = H * d; cv.style.width = W + "px"; cv.style.height = H + "px"; ctx.setTransform(d, 0, 0, d, 0, 0); };
  const clamp = () => { const s = base * z, iw = img.width * s, ih = img.height * s; ox = Math.min(0, Math.max(W - iw, ox)); oy = Math.min(0, Math.max(H - ih, oy)); };
  const draw = () => { clamp(); ctx.fillStyle = "#111"; ctx.fillRect(0, 0, W, H); const s = base * z; ctx.drawImage(img, ox, oy, img.width * s, img.height * s); };
  const center = () => { z = 1; zIn.value = 1; const s = base; ox = (W - img.width * s) / 2; oy = (H - img.height * s) / 2; draw(); };
  const zoomAt = (nz, cx, cy) => { nz = Math.max(1, Math.min(4, nz)); const s0 = base * z, s1 = base * nz; ox = cx - (cx - ox) * s1 / s0; oy = cy - (cy - oy) * s1 / s0; z = nz; zIn.value = z; draw(); };
  img.onload = () => { size(); base = Math.max(W / img.width, H / img.height); center(); ok.disabled = false; };
  img.onerror = () => { m.querySelector("#crop-err").textContent = "Cette image ne peut pas être lue. Essayez une photo JPEG ou PNG."; };
  img.src = url;
  zIn.oninput = () => zoomAt(+zIn.value, W / 2, H / 2);
  m.querySelector("#crop-reset").onclick = center;
  const pts = new Map(); let pinch = null;
  cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z }; } });
  cv.addEventListener("pointermove", e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const nx = e.offsetX, ny = e.offsetY;
    if (pts.size === 1) { ox += nx - p.x; oy += ny - p.y; draw(); }
    pts.set(e.pointerId, { x: nx, y: ny });
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; zoomAt(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); }
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => { e.preventDefault(); zoomAt(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.offsetX, e.offsetY); }, { passive: false });
  ok.onclick = async () => {
    ok.disabled = true; ok.textContent = "Envoi…";
    try {
      const OW = 1024, OH = 768, k = OW / W, out = document.createElement("canvas"); out.width = OW; out.height = OH;
      const o = out.getContext("2d"), s = base * z * k; o.fillStyle = "#fff"; o.fillRect(0, 0, OW, OH); o.drawImage(img, ox * k, oy * k, img.width * s, img.height * s);
      const blob = await new Promise(r => out.toBlob(r, "image/jpeg", 0.86));
      const r = await assets.upload(blob, { type: "image/jpeg" });
      const old = veh(vid).photo;
      await patch("vehicles", vid, { photo: r.id });
      if (old) assets.delete(old).catch(() => { });
      URL.revokeObjectURL(url); toast("Photo enregistrée"); openVehicle(vid);
    } catch (er) { m.querySelector("#crop-err").textContent = er && er.code === "too_large" ? "Photo trop lourde." : "La photo n'a pas pu être envoyée. Réessayez."; ok.disabled = false; ok.textContent = "Valider la photo"; }
  };
}
ACTIONS["vphoto-del"] = el => {
  const v = veh(el.dataset.id);
  confirmBox(`Supprimer la photo de <b>${esc(v.plate)}</b> ?`, async () => {
    const old = v.photo; await patch("vehicles", v.id, { photo: "" });
    if (old && assets) assets.delete(old).catch(() => { });
    setTimeout(() => openVehicle(v.id), 60);
  });
};

/* ======================= PNEUS ======================= */
const TIRE_TYPES = ["Été", "Hiver", "4 saisons"];
const TIRE_STATES = { neuf: ["Neuf", "good"], moyen: ["Moyen", "warn"], limite: ["À la limite", "bad"] };
const SPEED_IDX = ["J", "K", "L", "M", "N", "P", "Q", "R", "S", "T", "U", "H", "V", "W", "Y", "Z"];
const tireStateChip = st => TIRE_STATES[st] ? `<span class="chip ${TIRE_STATES[st][1]}">${TIRE_STATES[st][0]}</span>` : "";
/* « 195/50-15 » : largeur / hauteur (%) - jante (pouces) */
const tireSize = t => t && t.width && t.ratio && t.rim ? `${t.width}/${t.ratio}-${t.rim}` : "";
const tireLabel = t => [tireSize(t) + (t.load || t.speed ? ` ${t.load || ""}${t.speed || ""}` : ""), t.type, t.brand, t.model].filter(Boolean).join(" ");
const sameSize = (a, b) => a && b && +a.width === +b.width && +a.ratio === +b.ratio && +a.rim === +b.rim;
const tireStockCount = () => S.tires.reduce((a, t) => a + (+t.qty || 0), 0);
const stockFor = t => S.tires.filter(x => sameSize(x, t) && +x.qty > 0);

function tireFields(prefix, t) {
  t = t || {};
  return `<div class="tire-grid">
    ${field(prefix + "-w", "Largeur (mm)", t.width, { type: "number", min: 100, ph: "195", required: true })}
    ${field(prefix + "-r", "Hauteur (%)", t.ratio, { type: "number", min: 20, ph: "50", required: true })}
    ${field(prefix + "-rim", "Jante (pouces)", t.rim, { type: "number", min: 10, ph: "15", required: true })}
    ${field(prefix + "-li", "Indice de charge", t.load, { type: "number", min: 50, ph: "95" })}
    ${field(prefix + "-si", "Indice de vitesse", t.speed || "", { type: "select", options: [["", "—"], ...SPEED_IDX.map(x => [x, x])] })}
    ${field(prefix + "-ty", "Type", t.type || "Été", { type: "select", options: TIRE_TYPES.map(x => [x, x]) })}
    ${field(prefix + "-br", "Marque", t.brand, { ph: "Bridgestone" })}${field(prefix + "-mo", "Modèle", t.model, { ph: "Potenza" })}
    ${field(prefix + "-st", "État", t.state || "neuf", { type: "select", options: Object.entries(TIRE_STATES).map(([k, v]) => [k, v[0]]) })}</div>
    <div class="tire-preview muted small" data-prev="${prefix}"></div>`;
}
const readTire = p => ({ width: +val(p + "-w") || 0, ratio: +val(p + "-r") || 0, rim: +val(p + "-rim") || 0, load: val(p + "-li"), speed: val(p + "-si"), type: val(p + "-ty"), brand: val(p + "-br"), model: val(p + "-mo"), state: val(p + "-st") });
function wirePreview(m, p) {
  const out = m.querySelector(`[data-prev="${p}"]`); if (!out) return;
  const upd = () => { const t = readTire(p); out.innerHTML = tireSize(t) ? `Aperçu : <b class="mono">${esc(tireLabel(t))}</b>` : ""; };
  m.addEventListener("input", upd); m.addEventListener("change", upd); upd();
}

/* ---------- pneus montés sur un véhicule ---------- */
function vehTiresHtml(v) {
  const t = v.tires;
  if (!t || !tireSize(t)) return `<div class="muted">Taille des pneus non renseignée.</div>`;
  const axle = (lbl, x) => {
    const st = stockFor(x), n = st.reduce((a, y) => a + (+y.qty || 0), 0);
    return `<div class="tire-card"><div class="tire-ic" aria-hidden="true"></div><div class="grow"><div class="muted small">${lbl}</div>
      <div><b class="mono">${esc(tireSize(x))}</b> ${esc(`${x.load || ""}${x.speed || ""}`)} <span class="muted">${esc([x.type, x.brand, x.model].filter(Boolean).join(" · "))}</span></div></div>
      <div class="stack-s r">${tireStateChip(x.state)}<button class="linkbtn small" data-a="tire-goto" data-size="${esc(tireSize(x))}">${n ? `${n} en stock` : "Aucun en stock"}</button></div></div>`;
  };
  return `<div class="stack-s">${t.rear && tireSize(t.rear) ? axle("Essieu avant", t) + axle("Essieu arrière", t.rear) : axle("4 roues", t)}${t.mounted ? `<div class="muted small">Montés le ${fmtDate(t.mounted)}${t.mountedKm ? " à " + fmtN.format(t.mountedKm) + " km" : ""}</div>` : ""}</div>`;
}
ACTIONS["vtire-form"] = el => {
  const v = veh(el.dataset.id), t = v.tires || {};
  const m = modal(`${mHead("Pneus montés · " + `<span class="plate sm">${esc(v.plate)}</span>`)}<form><div class="body">
    <h3>${t.rear && tireSize(t.rear) ? "Essieu avant" : "Pneus (4 roues)"}</h3>${tireFields("tf", t)}
    <label class="chk"><input type="checkbox" id="tf-diff" ${t.rear && tireSize(t.rear) ? "checked" : ""}> Taille différente à l'arrière</label>
    <div id="tf-rear" ${t.rear && tireSize(t.rear) ? "" : "hidden"}><h3>Essieu arrière</h3>${tireFields("tr", t.rear || t)}</div>
    <div class="fields">${field("tf-date", "Date de montage", t.mounted || today(), { type: "date" })}${field("tf-km", "Kilométrage au montage", t.mountedKm || Math.round(kmOf(v)) || "", { type: "number", min: 0 })}</div>
    ${S.tires.length ? `<label class="chk"><input type="checkbox" id="tf-take"> Retirer ces pneus du stock (4 pneus, ou 2 + 2 si l'arrière diffère)</label>` : ""}<div class="err" id="tf-err"></div></div>
    <footer><button type="button" class="btn" data-a="veh-open" data-id="${v.id}">Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`, "lg");
  const diff = m.querySelector("#tf-diff"), rear = m.querySelector("#tf-rear");
  diff.onchange = () => { rear.hidden = !diff.checked; rear.querySelectorAll("input[id$='-w'],input[id$='-r'],input[id$='-rim']").forEach(i => i.required = diff.checked); };
  diff.onchange();
  wirePreview(m, "tf"); wirePreview(m, "tr");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const front = readTire("tf"), back = diff.checked ? readTire("tr") : null, err = m.querySelector("#tf-err");
    const data = Object.assign(front, { rear: back, mounted: val("tf-date"), mountedKm: +val("tf-km") || 0 });
    if (m.querySelector("#tf-take")?.checked) {
      const need = back ? [[front, 2], [back, 2]] : [[front, 4]];
      for (const [t, n] of need) {
        const cand = stockFor(t).filter(x => (!t.type || x.type === t.type)).sort((a, b) => (a.state === t.state ? -1 : 1) - (b.state === t.state ? -1 : 1));
        let left = n; for (const c of cand) { if (!left) break; const take = Math.min(left, +c.qty); await patch("tires", c.id, { qty: +c.qty - take }); left -= take; }
        if (left) toast(`Stock insuffisant pour ${tireSize(t)} : ${left} pneu(s) manquant(s).`);
      }
    }
    await patch("vehicles", v.id, { tires: data });
    toast("Pneus enregistrés"); openVehicle(v.id);
  };
};
ACTIONS["tire-goto"] = el => { closeModal(); const [w, rr] = el.dataset.size.split("/"); const [r, rim] = rr.split("-"); UI.tf = { w, r, rim, ty: "", st: "", veh: "" }; UI.tab.flotte = "pneus"; location.hash = "#flotte"; render(true); };

/* ---------- onglet pneus en stock ---------- */
function fleetTires() {
  const f = UI.tf || (UI.tf = { w: "", r: "", rim: "", ty: "", st: "", veh: "" });
  const uniq = k => [...new Set(S.tires.map(t => t[k]).filter(x => x !== "" && x != null))].sort((a, b) => a - b);
  const vs = activeVehicles().filter(v => v.tires && tireSize(v.tires));
  const rows = S.tires.filter(t => (!f.w || +t.width === +f.w) && (!f.r || +t.ratio === +f.r) && (!f.rim || +t.rim === +f.rim) && (!f.ty || t.type === f.ty) && (!f.st || t.state === f.st) && (f.zero || +t.qty > 0))
    .sort((a, b) => tireSize(a).localeCompare(tireSize(b)) || (a.type || "").localeCompare(b.type || ""));
  const qty = rows.reduce((a, t) => a + (+t.qty || 0), 0), sized = f.w && f.r && f.rim;
  const sel = (k, lbl, opts) => `<label class="f">${lbl}<select data-tf="${k}"><option value="">Toutes</option>${opts.map(o => `<option ${String(f[k]) === String(o) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
  const verdict = sized ? (qty ? `<div class="stock-verdict ok"><b>${qty} pneu${qty > 1 ? "s" : ""} en stock</b> en ${f.w}/${f.r}-${f.rim}${f.ty ? " " + f.ty : ""}${qty < 4 ? " · pas assez pour un train complet" : ""}</div>` : `<div class="stock-verdict ko"><b>Aucun pneu en stock</b> en ${f.w}/${f.r}-${f.rim}${f.ty ? " " + f.ty : ""}</div>`) : "";
  return `<div class="row-sb mb"><div class="muted">${plural(tireStockCount(), "pneu")} en stock · ${plural(S.tires.length, "référence")}</div><button class="btn primary" data-a="tire-form" ${dis()}>Ajouter des pneus au stock</button></div>
  <div class="panel"><div class="pad stack">
    <div class="tire-filters">
      <label class="f">Taille d'un véhicule<select data-tf="veh"><option value="">Choisir un véhicule…</option>${vs.map(v => `<option value="${v.id}" ${f.veh === v.id ? "selected" : ""}>${esc((fleetNo(v) ? fleetNo(v) + " · " : "") + v.plate + " · " + tireSize(v.tires))}</option>`).join("")}</select></label>
      ${sel("w", "Largeur", uniq("width"))}${sel("r", "Hauteur %", uniq("ratio"))}${sel("rim", "Jante (pouces)", uniq("rim"))}${sel("ty", "Type", TIRE_TYPES)}
      <label class="f">État<select data-tf="st"><option value="">Tous</option>${Object.entries(TIRE_STATES).map(([k, v]) => `<option value="${k}" ${f.st === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
    </div>
    <div class="row-sb"><label class="chk small"><input type="checkbox" data-tf="zero" ${f.zero ? "checked" : ""}> Afficher aussi les références épuisées</label>${f.w || f.r || f.rim || f.ty || f.st || f.veh ? `<button class="linkbtn" data-a="tf-reset">Effacer les filtres</button>` : ""}</div>
    ${verdict}</div>
  <div class="tablewrap"><table><thead><tr><th>Dimension</th><th>Indices</th><th>Type</th><th>Marque et modèle</th><th>État</th><th>Emplacement</th><th class="r">Quantité</th><th></th></tr></thead><tbody>
  ${rows.map(t => `<tr class="${+t.qty ? "" : "faded"}"><td><b class="mono">${esc(tireSize(t))}</b></td><td class="mono">${esc((t.load || "") + (t.speed || "")) || "—"}</td><td><span class="chip ${t.type === "Hiver" ? "info" : t.type === "Été" ? "warn" : "good"}">${esc(t.type || "—")}</span></td>
    <td>${esc([t.brand, t.model].filter(Boolean).join(" ") || "—")}${t.dot ? `<div class="muted small">DOT ${esc(t.dot)}</div>` : ""}</td><td>${tireStateChip(t.state)}</td><td>${esc(t.location || "—")}</td>
    <td class="r"><span class="qty-ctl">${readOnly ? "" : `<button class="btn sm" data-a="tire-qty" data-id="${t.id}" data-d="-1" aria-label="Retirer un pneu" ${+t.qty ? "" : "disabled"}>−</button>`}<b class="num">${+t.qty || 0}</b>${readOnly ? "" : `<button class="btn sm" data-a="tire-qty" data-id="${t.id}" data-d="1" aria-label="Ajouter un pneu">+</button>`}</span></td>
    <td class="r">${readOnly ? "" : `<button class="btn sm" data-a="tire-form" data-id="${t.id}">Modifier</button>`}</td></tr>`).join("")}
  </tbody></table>${rows.length ? "" : `<div class="empty">${S.tires.length ? "Aucun pneu en stock ne correspond à ces critères." : "Aucun pneu en stock pour l'instant."}</div>`}</div></div>`;
}
document.addEventListener("change", e => {
  const k = e.target.dataset && e.target.dataset.tf; if (!k) return;
  const f = UI.tf;
  if (k === "veh") { const v = veh(e.target.value); f.veh = e.target.value; if (v && v.tires) Object.assign(f, { w: v.tires.width, r: v.tires.ratio, rim: v.tires.rim, ty: "" }); else Object.assign(f, { w: "", r: "", rim: "" }); }
  else if (k === "zero") f.zero = e.target.checked;
  else { f[k] = e.target.value; f.veh = ""; }
  render(true);
});
ACTIONS["tf-reset"] = () => { UI.tf = { w: "", r: "", rim: "", ty: "", st: "", veh: "" }; render(true); };
ACTIONS["tire-qty"] = async el => { const t = S.tires.find(x => x.id === el.dataset.id); await patch("tires", t.id, { qty: Math.max(0, (+t.qty || 0) + +el.dataset.d) }); };
ACTIONS["tire-form"] = el => {
  const t = S.tires.find(x => x.id === el.dataset.id) || { qty: 4, state: "neuf", type: "Été" };
  const isNew = !t.id;
  const m = modal(`${mHead(isNew ? "Ajouter des pneus au stock" : "Pneus · " + esc(tireLabel(t)))}<form><div class="body">${tireFields("ts", t)}
    <div class="fields">${field("ts-q", "Quantité", t.qty, { type: "number", min: 0, required: true })}${field("ts-loc", "Emplacement", t.location, { ph: "Rack A, garage…" })}${field("ts-dot", "DOT (semaine/année)", t.dot, { ph: "2425", cls: "mono" })}</div>
    ${field("ts-note", "Remarque", t.note, { wide: true })}</div>
    <footer>${isNew ? "" : `<div class="left"><button type="button" class="btn danger" data-a="tire-del" data-id="${t.id}">Supprimer</button></div>`}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`, "lg");
  wirePreview(m, "ts");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const data = Object.assign(strip(t), readTire("ts"), { qty: +val("ts-q") || 0, location: val("ts-loc"), dot: val("ts-dot"), note: val("ts-note") });
    const twin = isNew && S.tires.find(x => sameSize(x, data) && x.type === data.type && x.state === data.state && (x.brand || "") === data.brand && (x.model || "") === data.model && (x.load || "") === data.load && (x.speed || "") === data.speed && (x.location || "") === data.location);
    if (twin) { await patch("tires", twin.id, { qty: (+twin.qty || 0) + data.qty }); toast(`Ajouté à la référence existante : ${twin.qty + data.qty} en stock`); }
    else { await save("tires", t.id, data); toast("Pneus enregistrés"); }
    closeModal();
  };
};
ACTIONS["tire-del"] = el => confirmBox("Supprimer cette référence de pneus du stock ?", () => remove("tires", el.dataset.id));

/* amendes : voir js/fines.js */
