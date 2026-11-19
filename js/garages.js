"use strict";
/* ======================= GARAGES (Flotte → Garages) =======================
   Collection « garages » : { name, address, lat, lon, radius (m), phone, email, contact, supplierName, supplierVat,
   userIds[] (comptes Garage), comments[{at, by, text}], createdAt }.
   - véhicules présents : déclarés (vehicles.garageId) et/ou confirmés par GPS (dernière position WebFleet dans le rayon) ;
   - chauffeurs du garage : drivers.garageIds ; alerte quand l'un d'eux roule avec un véhicule ;
   - factures : achats du fournisseur relié (n° TVA ou nom) ; coûts : entretiens encodés pour ce garage ;
   - tâches : pannes, défauts et tâches attribués (faults.garageId). */

const gar = id => (S.garages || []).find(g => g.id === id);
const garF = () => UI.garF || (UI.garF = { days: "30" });
const normVat = v => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
function distM(a, b, c, d) { const R = 6371000, r = x => x * Math.PI / 180, dl = r(c - a), dn = r(d - b), h = Math.sin(dl / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); }
/* présence d'un véhicule : déclarée, GPS (dans le rayon), les deux */
function garPresence(g, v) {
  const p = typeof posOf === "function" ? posOf(v.id) : null;
  const hasGeo = g.lat != null && g.lon != null && g.lat !== "" && p && p.lat != null;
  const d = hasGeo ? distM(+g.lat, +g.lon, +p.lat, +p.lon) : null;
  const gps = d != null && d <= (+g.radius || 150);
  return { declared: v.garageId === g.id, gps, dist: d, pos: p };
}
const garVehicles = g => ME && ME.role === "garage"   /* le garage ne reçoit pas les positions : le serveur indique atMyGarage */
  ? S.vehicles.filter(v => v.atMyGarage).map(v => ({ v, declared: v.garageId === g.id, gps: v.atMyGarage !== "declare", dist: null, pos: null }))
  : S.vehicles.filter(v => !v.retired).map(v => ({ v, ...garPresence(g, v) })).filter(x => x.declared || x.gps);
const garDrivers = g => (S.drivers || []).filter(d => (d.garageIds || []).includes(g.id));
const garDriving = g => garDrivers(g).map(d => ({ d, dv: typeof drvDriving === "function" ? drvDriving(d.name, d) : null })).filter(x => x.dv);
const garInvoices = g => { const vat = normVat(g.supplierVat), nm = (g.supplierName || "").trim().toLowerCase();
  return (S.purchases || []).filter(p => (vat && normVat(p.supplierVat) === vat) || (!vat && nm && (p.supplierName || "").toLowerCase().includes(nm))).sort((a, b) => (b.date || "").localeCompare(a.date || "")); };
/* montant dû : reste à payer des factures − reste des notes de crédit non encore imputées (négatif = en notre faveur) */
const garDue = g => garInvoices(g).filter(p => !p.archived && typeof purSt === "function" && purSt(p) !== "paid")
  .reduce((a, p) => a + (p.credit ? -1 : 1) * Math.max(0, (+p.amount || 0) - (typeof purBank === "function" ? purBank(p.id) : 0)), 0);
const garTasks = g => S.faults.filter(f => f.garageId === g.id);
const garEvents = g => S.vehEvents.filter(e => e.garageId === g.id || (!e.garageId && g.name && (e.supplier || "").trim().toLowerCase() === g.name.trim().toLowerCase()));
const presChip = x => x.declared && x.gps ? `<span class="chip good" title="Déclaré au garage et confirmé par la position GPS">Déclaré · GPS ✓</span>`
  : x.gps ? `<span class="chip info" title="Position GPS dans la zone du garage, mais pas déclaré">GPS seulement</span>`
  : x.pos && x.pos.lat != null && x.dist != null ? `<span class="chip warn" title="Déclaré au garage, mais la dernière position GPS est ailleurs">Déclaré · GPS ✗ (${x.dist < 10000 ? Math.round(x.dist) + " m" : Math.round(x.dist / 1000) + " km"})</span>`
  : `<span class="chip" title="Pas de position GPS pour ce véhicule ou zone du garage non définie">Déclaré</span>`;

function garagesView() {
  if (ME && ME.role === "garage") { const g = (S.garages || [])[0]; return g ? garageSheet(g, true) : `<div class="panel empty">Votre compte n'est relié à aucun garage : demandez à W.A.Y.S. de le faire.</div>`; }
  const list = (S.garages || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const q = (UI.q || "").toLowerCase().trim();
  const rows = list.filter(g => !q || [g.name, g.address, g.contact, g.phone, g.supplierName, g.supplierVat].join(" ").toLowerCase().includes(q));
  const card = g => { const vs = garVehicles(g), dr = garDriving(g), tk = garTasks(g).filter(f => f.status !== "reparee"), due = garDue(g);
    return `<button class="panel gcard ${dr.length ? "alert" : ""}" data-a="garage-open" data-id="${g.id}">
      <div class="row-sb"><b class="gc-n">🔧 ${esc(g.name)}</b>${dr.length ? `<span class="chip bad" title="Un chauffeur du garage roule en ce moment">🚗 ${esc(dr.map(x => x.d.name).join(", "))} au volant</span>` : ""}</div>
      ${g.address ? `<div class="muted small">${esc(g.address)}</div>` : ""}
      <div class="gc-stats"><span><b>${vs.length}</b> véhicule${vs.length > 1 ? "s" : ""} présent${vs.length > 1 ? "s" : ""}</span><span><b>${tk.length}</b> tâche${tk.length > 1 ? "s" : ""} en cours</span><span><b>${garDrivers(g).length}</b> chauffeur${garDrivers(g).length > 1 ? "s" : ""}</span>${due > 0.005 ? `<span class="txt-bad"><b>${eur(due)}</b> dû</span>` : ""}</div>
      ${vs.length ? `<div class="gc-veh">${vs.slice(0, 6).map(x => `<span class="plate sm">${esc(x.v.plate)}</span>`).join(" ")}${vs.length > 6 ? ` +${vs.length - 6}` : ""}</div>` : ""}</button>`; };
  return `<div class="stack" style="grid-template-columns:minmax(0,1fr)">
    <div class="row-sb wrap">${searchBar("Nom, adresse, contact, n° TVA…")}<button class="btn primary" data-a="garage-form" ${dis()}>+ Nouveau garage</button></div>
    ${rows.length ? `<div class="gcards">${rows.map(card).join("")}</div>` : `<div class="panel empty">${q ? "Aucun garage ne correspond." : "Aucun garage. Créez la fiche de vos garages partenaires : véhicules présents (déclarés et confirmés par GPS), chauffeurs du garage, factures, coûts, tâches, et comptes Garage pour qu'ils encodent eux-mêmes l'entretien."}</div>`}</div>`;
}
/* fiche ouverte : mise à jour en direct (paiement relié, véhicule entré, tâche…) */
function refreshGarageModal() {
  const body = document.querySelector(".modal .body[data-gid]"); if (!body) return;
  const g = gar(body.dataset.gid); if (!g) return;
  const ae = document.activeElement; if (ae && body.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  const html = garageSheet(g, false); if (html === body._html) return;
  const top = body.scrollTop, wrap = body.closest(".overlay"), wtop = wrap ? wrap.scrollTop : 0;
  body.innerHTML = html; body._html = html; body.scrollTop = top; if (wrap) wrap.scrollTop = wtop;
}
ACTIONS["garage-open"] = el => { const g = gar(el.dataset.id); if (!g) return; const html = garageSheet(g, false); const m = modal(`${mHead("🔧 " + esc(g.name))}<div class="body" data-gid="${g.id}">${html}</div><footer><div class="left"><button class="btn" data-a="garage-form" data-id="${g.id}" autofocus ${dis()}>Modifier la fiche</button></div><button class="btn" data-close>Fermer</button></footer>`, "xl"); m.querySelector(".body")._html = html; };

function garageSheet(g, own) {
  const office = isOffice(), vs = garVehicles(g), drs = garDrivers(g), dr = garDriving(g), f = garF(), days = +f.days || 30;
  const from = addDays(today(), -(days - 1));
  const names = new Set(drs.map(d => nk(d.name)));
  const trips = office && typeof allTrips === "function" ? allTrips().filter(t => names.has(nk(t.driver)) && (t.start || "").slice(0, 10) >= from) : [];
  const byDrv = {}; for (const t of trips) { const k = t.driver || "?"; (byDrv[k] ||= { km: 0, n: 0, veh: new Set() }); byDrv[k].km += +t.km || 0; byDrv[k].n++; byDrv[k].veh.add(t.vehicleId); }
  const tasks = garTasks(g).sort((a, b) => (a.status === "reparee") - (b.status === "reparee") || (b.date || "").localeCompare(a.date || ""));
  const evs = garEvents(g).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const inv = office ? garInvoices(g) : [], due = office ? garDue(g) : 0;
  const cost = evs.filter(e => e.status !== "planifiee").reduce((a, e) => a + (typeof evCost === "function" ? evCost(e) : +e.cost || 0), 0);
  const invTot = inv.filter(p => !p.archived).reduce((a, p) => a + (p.credit ? -1 : 1) * (+p.amount || 0), 0);
  const sec = (t, body, extra) => `<section class="gsec"><div class="row-sb"><h3 class="np">${t}</h3>${extra || ""}</div>${body}</section>`;
  return `<div class="gsheet">
    ${dr.length ? `<div class="banner bad">🚗 <b>${esc(dr.map(x => x.d.name).join(", "))}</b> (chauffeur${dr.length > 1 ? "s" : ""} du garage) roule${dr.length > 1 ? "nt" : ""} en ce moment avec ${dr.map(x => `<b>${esc(x.dv.v ? x.dv.v.plate : "?")}</b>`).join(", ")}.</div>` : ""}
    <dl class="kv"><dt>Adresse</dt><dd>${esc(g.address || "—")}${g.lat != null && g.lat !== "" ? ` <span class="muted small">· zone GPS ${+g.radius || 150} m</span>` : office ? ` <span class="chip warn">zone GPS non définie</span>` : ""}</dd>
      ${g.contact || g.phone || g.email ? `<dt>Contact</dt><dd>${esc([g.contact, g.phone, g.email].filter(Boolean).join(" · "))}</dd>` : ""}
      ${office ? `<dt>Fournisseur</dt><dd>${esc(g.supplierName || "—")}${g.supplierVat ? ` <span class="mono small muted">${esc(g.supplierVat)}</span>` : ""}</dd><dt>Comptes Garage</dt><dd>${(g.userIds || []).length ? plural(g.userIds.length, "compte") : `<span class="muted">aucun (Paramètres → Utilisateurs, rôle Garage)</span>`}</dd>` : ""}</dl>
    ${office ? `<div class="tiles"><div class="panel tile c-blue"><div class="lbl">Véhicules présents</div><div class="val">${vs.length}</div><div class="note">${vs.filter(x => x.gps).length} confirmé${vs.filter(x => x.gps).length > 1 ? "s" : ""} par GPS</div></div>
      <div class="panel tile c-orange"><div class="lbl">Coûts encodés</div><div class="val">${eur0(cost)}</div><div class="note">${plural(evs.length, "intervention")}</div></div>
      <div class="panel tile c-yellow"><div class="lbl">Factures reçues</div><div class="val">${eur0(invTot)}</div><div class="note">${plural(inv.length, "facture")}</div></div>
      <div class="panel tile ${due > 0.005 ? "c-red" : "c-green"}"><div class="lbl">Montant dû</div><div class="val">${eur(Math.abs(due))}</div><div class="note">${due < -0.005 ? "en notre faveur (notes de crédit)" : "factures non payées, notes de crédit déduites"}</div></div></div>` : ""}
    ${sec("Véhicules présents", vs.length ? `<div class="tablewrap"><table><thead><tr><th>Véhicule</th><th>Présence</th><th>Depuis</th><th>Dernière position</th><th></th></tr></thead><tbody>${vs.map(x => `<tr><td><button class="linkbtn" data-a="veh-open" data-id="${x.v.id}">${noBadge(x.v, 1)} <span class="plate sm">${esc(x.v.plate)}</span> ${esc(x.v.model)}</button></td><td>${presChip(x)}</td>
        <td class="small">${x.declared && x.v.garageSince ? fmtDate(x.v.garageSince) : "—"}</td><td class="small">${x.pos ? esc(x.pos.address || "") + (x.pos.at ? ` <span class="muted">· ${esc(tr(agoTxt(x.pos.at)))}</span>` : "") : "—"}</td>
        <td class="r">${office ? x.declared ? `<button class="btn sm" data-a="garage-out" data-id="${g.id}" data-veh="${x.v.id}" ${dis()}>Sortie</button>` : `<button class="btn sm" data-a="garage-in" data-id="${g.id}" data-veh="${x.v.id}" ${dis()}>Déclarer</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="muted small">Aucun véhicule déclaré ni détecté par GPS dans ce garage.</div>`, office ? `<button class="btn sm" data-a="garage-in" data-id="${g.id}" ${dis()}>+ Entrée d'un véhicule</button>` : "")}
    ${sec("Tâches, pannes et défauts", tasks.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Véhicule</th><th>Type</th><th>Description</th><th>Statut</th></tr></thead><tbody>${tasks.map(t => `<tr class="click" data-a="fault-open" data-id="${t.id}"><td class="num">${fmtDate(t.date)}</td><td>${esc(vehLabel(t.vehicleId))}</td><td class="small">${esc(FAULT_KIND[t.kind] || "Panne")}</td><td>${esc(t.description)}</td><td><span class="chip ${(FAULT_ST[t.status] || FAULT_ST.ouverte)[1]}">${(FAULT_ST[t.status] || FAULT_ST.ouverte)[0]}</span></td></tr>`).join("")}</tbody></table></div>` : `<div class="muted small">Aucune tâche attribuée.</div>`,
      office ? `<span class="row-g"><button class="btn sm" data-a="garage-assign" data-id="${g.id}" ${dis()}>Attribuer une panne</button><button class="btn sm" data-a="garage-task" data-id="${g.id}" ${dis()}>+ Nouvelle tâche</button></span>` : "")}
    ${sec(office ? "Chauffeurs du garage" : "Vos chauffeurs", drs.length ? `<div class="row-g wrap">${drs.map(d => `<span class="chip ${dr.some(x => x.d.id === d.id) ? "bad" : ""}">👤 ${esc(d.name)}${dr.some(x => x.d.id === d.id) ? " · au volant" : ""}</span>`).join("")}</div>` : `<div class="muted small">Aucun chauffeur relié à ce garage.</div>`,
      office ? `<button class="btn sm" data-a="garage-drivers" data-id="${g.id}" ${dis()}>Choisir les chauffeurs</button>` : "")}
    ${office ? sec("Kilomètres parcourus par les chauffeurs du garage", Object.keys(byDrv).length ? `<div class="tablewrap"><table><thead><tr><th>Chauffeur</th><th class="r">Trajets</th><th class="r">Km</th><th>Véhicules</th></tr></thead><tbody>${Object.entries(byDrv).sort((a, b) => b[1].km - a[1].km).map(([n, x]) => `<tr><td>${esc(n)}</td><td class="r num">${x.n}</td><td class="r num"><b>${fmtN.format(Math.round(x.km))}</b></td><td class="small">${[...x.veh].map(id => esc(veh(id)?.plate || "?")).join(", ")}</td></tr>`).join("")}</tbody></table></div>
        <div class="muted small">Total : <b>${fmtN.format(Math.round(trips.reduce((a, t) => a + (+t.km || 0), 0)))} km</b> en ${plural(trips.length, "trajet")}.</div>` : `<div class="muted small">Aucun trajet WebFleet d'un chauffeur du garage sur la période.</div>`,
      `<div class="seg">${[["30", "30 j"], ["90", "90 j"], ["365", "1 an"]].map(([k, l]) => `<button data-a="garage-days" data-v="${k}" data-id="${g.id}" class="${f.days === k ? "on" : ""}">${l}</button>`).join("")}</div>`) : ""}
    ${sec("Historique des interventions", evs.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Véhicule</th><th>Type</th><th>Description</th><th class="r">Km</th>${office ? `<th class="r">Coût HT</th>` : ""}</tr></thead><tbody>${evs.slice(0, 50).map(e => `<tr class="click" data-a="ev-form" data-id="${e.id}"><td class="num">${fmtDate(e.date)}</td><td>${esc(vehLabel(e.vehicleId))}</td><td class="small">${esc((typeof EV_TYPES !== "undefined" && EV_TYPES[e.type]) || e.type || "")}</td><td>${esc(e.description || "")}</td><td class="r num">${e.km ? fmtN.format(e.km) : "—"}</td>${office ? `<td class="r num">${eur(e.cost || 0)}</td>` : ""}</tr>`).join("")}</tbody></table></div>` : `<div class="muted small">Aucune intervention encodée pour ce garage.</div>`,
      `<button class="btn sm" data-a="ev-form" ${dis()}>+ Encoder une intervention</button>`)}
    ${office ? sec("Factures du garage", inv.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>N°</th><th class="r">Montant TTC</th><th>Paiement</th></tr></thead><tbody>${inv.slice(0, 50).map(p => { const st = typeof purSt === "function" ? purSt(p) : "not_paid"; return `<tr class="click" data-a="pur-open" data-id="${p.id}"><td class="num">${fmtDate(p.date)}</td><td class="mono">${esc(p.number || "")}${p.credit ? ` <span class="chip">NC</span>` : ""}</td><td class="r num">${eur(+p.amount || 0)}</td><td><span class="chip ${(PAY_ST[st] || ["", ""])[1]}">${(PAY_ST[st] || [st])[0]}</span></td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="muted small">${g.supplierVat || g.supplierName ? "Aucune facture d'achat de ce fournisseur." : "Indiquez le n° de TVA (ou le nom) du garage comme fournisseur dans la fiche pour retrouver ses factures d'achat."}</div>`) : ""}
    ${office ? sec("Commentaires", `${(g.comments || []).length ? `<div class="stack-s">${g.comments.slice().reverse().map(c => `<div class="gcom"><div class="muted small">${esc(fmtDT(c.at))} · ${esc(c.by || "")}</div><div>${esc(c.text)}</div></div>`).join("")}</div>` : `<div class="muted small">Aucun commentaire.</div>`}
      ${readOnly ? "" : `<div class="row-g" style="margin-top:8px"><input id="gc-txt" placeholder="Ajouter un commentaire…" style="flex:1"><button class="btn sm" data-a="garage-comment" data-id="${g.id}">Ajouter</button></div>`}`) : ""}
  </div>`;
}
const garReopen = id => { if (document.querySelector(".modal .gsheet")) ACTIONS["garage-open"]({ dataset: { id } }); else render(true); };
ACTIONS["garage-days"] = el => { garF().days = el.dataset.v; garReopen(el.dataset.id); };
ACTIONS["garage-comment"] = async el => { const g = gar(el.dataset.id), t = (document.getElementById("gc-txt")?.value || "").trim(); if (!g || !t) return;
  await patch("garages", g.id, { comments: [...(g.comments || []), { at: new Date().toISOString(), by: (ME && ME.name) || "", text: t.slice(0, 2000) }] }); setTimeout(() => garReopen(g.id), 300); };
ACTIONS["garage-out"] = async el => { await patch("vehicles", el.dataset.veh, { garageId: "", garageSince: "" }); toast("Sortie du garage enregistrée"); setTimeout(() => garReopen(el.dataset.id), 300); };
ACTIONS["garage-in"] = el => {
  const g = gar(el.dataset.id); if (!g) return;
  if (el.dataset.veh) { patch("vehicles", el.dataset.veh, { garageId: g.id, garageSince: today() }).then(() => { toast("Véhicule déclaré au garage"); setTimeout(() => garReopen(g.id), 300); }); return; }
  const m = modal(`${mHead("Entrée au garage · " + esc(g.name))}<form><div class="body">${field("gi-veh", "Véhicule", "", { type: "select", required: true, options: [["", "Choisir…"], ...activeVehicles().filter(v => v.garageId !== g.id).sort((a, b) => (fleetNo(a) || a.plate).localeCompare(fleetNo(b) || b.plate)).map(v => [v.id, `${fleetNo(v) ? fleetNo(v) + " · " : ""}${v.plate} · ${v.model}${v.garageId ? " (déjà chez " + garageName(v.garageId) + ")" : ""}`])] })}
    ${field("gi-date", "Date d'entrée", today(), { type: "date" })}</div><footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); await patch("vehicles", val("gi-veh"), { garageId: g.id, garageSince: val("gi-date") }); toast("Véhicule déclaré au garage"); setTimeout(() => garReopen(g.id), 300); };
};
ACTIONS["garage-assign"] = el => {
  const g = gar(el.dataset.id); if (!g) return;
  const open = S.faults.filter(f => f.status !== "reparee" && f.garageId !== g.id);
  const m = modal(`${mHead("Attribuer à " + esc(g.name))}<form><div class="body">${open.length ? `<div class="checklist">${open.map(f => `<label class="chk line"><input type="checkbox" value="${f.id}"> ${esc(vehLabel(f.vehicleId))} · ${esc(f.description)}${f.garageId ? ` <span class="muted small">(chez ${esc(garageName(f.garageId))})</span>` : ""}</label>`).join("")}</div>` : `<div class="muted">Aucune panne en cours à attribuer.</div>`}</div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${open.length ? "" : "disabled"}>Attribuer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); const ids = [...m.querySelectorAll("input:checked")].map(x => x.value); for (const id of ids) await patch("faults", id, { garageId: g.id }); toast(plural(ids.length, "panne attribuée", "pannes attribuées")); setTimeout(() => garReopen(g.id), 300); };
};
ACTIONS["garage-task"] = el => {
  const g = gar(el.dataset.id); if (!g) return;
  const m = modal(`${mHead("Nouvelle tâche · " + esc(g.name))}<form><div class="body"><div class="fields">${field("gt-veh", "Véhicule", "", { type: "select", required: true, options: [["", "Choisir…"], ...activeVehicles().map(v => [v.id, v.plate + " · " + v.model])] })}${field("gt-est", "À faire pour le", "", { type: "date" })}</div>
    ${field("gt-desc", "Tâche", "", { type: "textarea", wide: true, required: true, ph: "Remplacer les plaquettes avant, contrôle des pneus…" })}</div><footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Créer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => { e.preventDefault();
    await save("faults", null, { vehicleId: val("gt-veh"), kind: "tache", garageId: g.id, description: val("gt-desc"), estDate: val("gt-est"), status: val("gt-est") ? "planifiee" : "ouverte", severity: "mineure", date: today(), reporter: (ME && ME.name) || "", at: new Date().toISOString() });
    toast("Tâche attribuée au garage"); setTimeout(() => garReopen(g.id), 300); };
};
ACTIONS["garage-drivers"] = el => {
  const g = gar(el.dataset.id); if (!g) return;
  const ds = (S.drivers || []).filter(d => !d.wfGone || (d.garageIds || []).includes(g.id)).sort((a, b) => a.name.localeCompare(b.name));
  const m = modal(`${mHead("Chauffeurs de " + esc(g.name))}<form><div class="body"><div class="muted small">Un chauffeur peut appartenir à plusieurs garages. Ses trajets WebFleet sont alors comptés pour le garage, et l'ERP signale quand il roule avec un de nos véhicules.</div>
    <input id="gd-q" type="search" placeholder="Rechercher un chauffeur…" style="margin:8px 0">
    <div class="checklist">${ds.map(d => `<label class="chk line" data-n="${esc(nk(d.name))}"><input type="checkbox" value="${d.id}" ${(d.garageIds || []).includes(g.id) ? "checked" : ""}> ${esc(d.name)}${(d.garageIds || []).filter(x => x !== g.id).map(x => ` <span class="chip sm">${esc(garageName(x))}</span>`).join("")}</label>`).join("") || `<div class="muted">Aucune fiche chauffeur.</div>`}</div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`);
  m.querySelector("#gd-q").oninput = e => { const q = nk(e.target.value); m.querySelectorAll("[data-n]").forEach(x => x.hidden = q && !x.dataset.n.includes(q)); };
  m.querySelector("form").onsubmit = async e => { e.preventDefault();
    const on = new Set([...m.querySelectorAll("input[type=checkbox]:checked")].map(x => x.value));
    for (const d of ds) { const has = (d.garageIds || []).includes(g.id); if (has !== on.has(d.id)) await patch("drivers", d.id, { garageIds: on.has(d.id) ? [...(d.garageIds || []), g.id] : (d.garageIds || []).filter(x => x !== g.id) }); }
    toast("Chauffeurs du garage enregistrés"); setTimeout(() => garReopen(g.id), 300); };
};
ACTIONS["garage-form"] = el => {
  const g0 = gar(el.dataset.id) || { radius: 150 };
  const isNew = !g0.id;
  const m = modal(`${mHead(isNew ? "Nouveau garage" : "Fiche garage")}<form autocomplete="off"><div class="body"><div class="fields">
    ${field("gf-name", "Nom du garage", g0.name, { required: true })}${field("gf-contact", "Personne de contact", g0.contact)}
    ${field("gf-addr", "Adresse", g0.address, { wide: true, ph: "Rue, n°, code postal, ville" })}
    ${field("gf-phone", "Téléphone", g0.phone)}${field("gf-email", "E-mail", g0.email, { type: "email" })}
    ${field("gf-sname", "Nom du fournisseur (factures d'achat)", g0.supplierName)}${field("gf-svat", "N° TVA du fournisseur", g0.supplierVat, { cls: "mono", ph: "BE0123456789" })}
    ${field("gf-lat", "Latitude", g0.lat, { type: "number", step: "any" })}${field("gf-lon", "Longitude", g0.lon, { type: "number", step: "any" })}${field("gf-rad", "Rayon de la zone GPS (m)", g0.radius || 150, { type: "number", min: 50, max: 2000 })}</div>
    <div class="row-g wrap" style="margin-top:6px"><button type="button" class="btn sm" id="gf-geo">📍 Localiser l'adresse</button><span class="muted small" id="gf-geo-msg">La zone sert à confirmer par GPS les véhicules présents au garage.</span></div>
    <div class="err" id="gf-err"></div></div>
    <footer>${isNew ? "" : `<div class="left"><button type="button" class="btn danger" data-a="garage-del" data-id="${g0.id}" ${dis()}>Supprimer</button></div>`}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "lg");
  m.querySelector("#gf-geo").onclick = async () => { const msg = m.querySelector("#gf-geo-msg"); const a = val("gf-addr"); if (!a) { msg.textContent = "Indiquez d'abord l'adresse."; return; }
    msg.textContent = "Recherche…"; const r = typeof geocode === "function" ? await geocode(a) : null;
    if (!r) { msg.textContent = "Adresse introuvable : saisissez la latitude et la longitude (clic droit sur Google Maps)."; return; }
    m.querySelector("#gf-lat").value = r.lat.toFixed(6); m.querySelector("#gf-lon").value = r.lon.toFixed(6); msg.textContent = "Position trouvée."; };
  m.querySelector("form").onsubmit = async e => { e.preventDefault();
    const num = k => val(k) === "" ? null : +val(k);
    const data = Object.assign(strip(g0), { name: val("gf-name").trim(), contact: val("gf-contact"), address: val("gf-addr"), phone: val("gf-phone"), email: val("gf-email"), supplierName: val("gf-sname"), supplierVat: val("gf-svat").toUpperCase().replace(/\s/g, ""),
      lat: num("gf-lat"), lon: num("gf-lon"), radius: Math.max(50, Math.min(2000, +val("gf-rad") || 150)) }, isNew ? { createdAt: new Date().toISOString(), userIds: [], comments: [] } : {});
    const id = await save("garages", g0.id, data); closeModal(); toast(isNew ? "Garage créé" : "Fiche garage enregistrée"); if (!isNew) setTimeout(() => ACTIONS["garage-open"]({ dataset: { id } }), 300); };
};
ACTIONS["garage-del"] = el => confirmBox("Supprimer ce garage ? Les véhicules déclarés chez lui ne le seront plus ; les pannes et interventions restent, sans garage.", async () => {
  for (const v of S.vehicles.filter(v => v.garageId === el.dataset.id)) await patch("vehicles", v.id, { garageId: "", garageSince: "" });
  await remove("garages", el.dataset.id); closeModal(); toast("Garage supprimé");
});
