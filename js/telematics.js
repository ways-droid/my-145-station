/* ======================= FLOTTE · WEBFLEET : positions, kilométrages, trajets ======================= */
/* Collections : vehPos/<vehicleId> { lat, lon, address, at, odometer(km), speed, ignition, driver, source, importedAt }
                 trips/<id>        { vehicleId, start, end, from, to, km, durationMin, driver, mode, startOdo, endOdo, source, importedAt }
   Sources : "demo" (exemple), "csv" (export Webfleet importé), plus tard "api" (serveur ONE.COM). */

/* les données d'exemple restent « vivantes » : leurs heures sont décalées pour rester relatives à maintenant */
const demoShift = p => p && p.source === "demo" && p.importedAt ? Date.now() - new Date(p.importedAt).getTime() : 0;
const shiftISO = (iso, ms) => iso && ms ? new Date(new Date(iso).getTime() + ms).toISOString() : iso;
const posOf = vid => { const p = (S.vehPos || []).find(p => p.id === vid || p.vehicleId === vid); if (!p) return null; const d = demoShift(p); return d ? Object.assign({}, p, { at: shiftISO(p.at, d) }) : p; };
const allTrips = () => (S.trips || []).map(t => { const d = demoShift(t); if (!d) return t; const days = Math.floor(d / 86400000) * 86400000; return days ? Object.assign({}, t, { start: shiftISO(t.start, days), end: shiftISO(t.end, days) }) : t; });
/* kilométrage le plus récent connu : fiche ou WebFleet */
const kmOf = v => Math.max(+v.km || 0, +(posOf(v.id)?.odometer) || 0);
const kmFromWf = v => (+(posOf(v.id)?.odometer) || 0) > (+v.km || 0);
const minsAgo = iso => iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : Infinity;
function agoTxt(iso) {
  const m = minsAgo(iso); if (!isFinite(m)) return "—";
  if (m < 1) return "à l'instant"; if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24); return `il y a ${d} j`;
}
const fmtDT = iso => { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString(LANG === "en" ? "en-IE" : "fr-BE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); };
const fmtHM = mins => { mins = Math.round(+mins || 0); const h = Math.floor(mins / 60), m = mins % 60; return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };
/* état d'un véhicule d'après son dernier signal */
const POS_ST = { route: ["En route", "good", "green"], arret: ["À l'arrêt, contact mis", "warn", "yellow"], coupe: ["Contact coupé", "", "grey"], ancien: ["Pas de signal depuis 24 h", "bad", "red"], aucun: ["Aucune donnée", "", "grey"] };
function posState(p) {
  if (!p || (p.lat == null && !p.address && !p.at)) return "aucun";
  const m = minsAgo(p.at);
  if (m > 24 * 60) return "ancien";
  if (p.state === "route" || p.state === "arret" || p.state === "coupe") return p.state;
  if (+p.speed > 3 && m <= 30) return "route";
  if (p.ignition && m <= 30) return "arret";
  return "coupe";
}
const mapLink = p => p.lat != null ? `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=16/${p.lat}/${p.lon}` : `https://www.openstreetmap.org/search?query=${encodeURIComponent(p.address || "")}`;
const srcLabel = s => ({ demo: "données d'exemple", csv: "import CSV Webfleet", api: "liaison WebFleet" })[s] || s || "";

/* ---------- onglet Positions ---------- */
const posF = () => UI.posF || (UI.posF = { st: [] });
function fleetPositions() {
  const f = posF(), q = (UI.q || "").toLowerCase().trim();
  const vs = activeVehicles().map(v => ({ v, p: posOf(v.id), st: posState(posOf(v.id)) }));
  const qOk = x => !q || [x.v.plate, fleetNo(x.v), x.v.model, x.p?.address, x.p?.driver, x.v.driver, x.v.webfleetId].join(" ").toLowerCase().includes(q);
  const base = vs.filter(qOk), rows = base.filter(x => !f.st.length || f.st.includes(x.st));
  rows.sort((a, b) => Object.keys(POS_ST).indexOf(a.st) - Object.keys(POS_ST).indexOf(b.st) || (fleetNo(a.v) || "zzz").localeCompare(fleetNo(b.v) || "zzz", undefined, { numeric: true }));
  const withPos = vs.filter(x => x.p && (x.p.lat != null || x.p.address));
  const srcs = [...new Set(withPos.map(x => x.p.source))];
  const lastImp = withPos.map(x => x.p.importedAt || "").sort().pop();
  const banner = !withPos.length ? `<div class="banner info">Aucune position pour l'instant. Importez un export Webfleet (CSV) pour afficher la dernière position et le compteur de chaque véhicule. La liaison automatique viendra avec le serveur ONE.COM.</div>`
    : `<div class="banner ${srcs.includes("demo") ? "warn" : "info"}">Source : ${srcs.map(srcLabel).join(", ")}${lastImp ? ` · dernier import le ${fmtDT(lastImp)}` : ""}. ${srcs.includes("api") ? "" : "Mise à jour manuelle par import CSV en attendant la liaison automatique (serveur ONE.COM)."}</div>`;
  const tiles = `<div class="tiles doc-tiles">${Object.entries(POS_ST).map(([k, [l, , c]]) => `<button class="panel tile c-${c} ${f.st.includes(k) ? "sel" : ""}" data-a="pos-f" data-st="${k}"><div class="lbl">${l}</div><div class="val">${base.filter(x => x.st === k).length}</div></button>`).join("")}</div>`;
  const toolbar = `<div class="panel pad vtool"><input type="search" id="q" class="fsearch" placeholder="Plaque, identifiant, adresse, chauffeur…" value="${esc(UI.q)}" aria-label="Rechercher un véhicule">
    ${f.st.length || q ? `<button class="linkbtn" data-a="pos-f" data-reset="1">Effacer les filtres</button>` : "<span></span>"}
    <span class="row-g">${readOnly ? "" : `<button class="btn sm" data-a="wf-import">Importer un export Webfleet (CSV)</button>`}</span></div>`;
  const map = withPos.some(x => x.p.lat != null) ? `<div class="panel wf-map-wrap"><div id="wf-map" data-keep="map" class="wf-map" role="img" aria-label="Carte des positions des véhicules"></div><div class="wf-map-msg muted small" id="wf-map-msg" hidden></div></div>` : "";
  const list = rows.length ? `<div class="panel"><div class="tablewrap"><table class="vlist"><thead><tr><th>Véhicule</th><th>État</th><th>Dernière position</th><th>Dernier signal</th><th class="r">Vitesse</th><th class="r">Compteur</th><th>Chauffeur</th><th></th></tr></thead><tbody>
    ${rows.map(({ v, p, st }) => `<tr class="click vrow st-${({ route: "good", arret: "warn", ancien: "bad" })[st] || "grey"}" data-a="veh-open" data-id="${v.id}">
      <td><div class="row-g nowrap">${noBadge(v, 1)}<span class="plate sm">${esc(v.plate)}</span></div><div class="small muted">${esc(v.model)}</div></td>
      <td><span class="chip ${POS_ST[st][1]}">${POS_ST[st][0]}</span>${!v.webfleetId ? `<div class="muted small">ID WebFleet manquant</div>` : ""}</td>
      <td class="small">${p?.address ? esc(p.address) : p && p.lat != null ? `<span class="mono">${(+p.lat).toFixed(4)}, ${(+p.lon).toFixed(4)}</span>` : "—"}</td>
      <td class="small nowrap">${p?.at ? `${agoTxt(p.at)}<div class="muted">${fmtDT(p.at)}</div>` : "—"}</td>
      <td class="num r nowrap">${p && p.speed != null && p.speed !== "" ? Math.round(p.speed) + " km/h" : "—"}</td>
      <td class="num r nowrap">${p?.odometer ? fmtN.format(Math.round(p.odometer)) + " km" : "—"}</td>
      <td class="small">${esc(p?.driver || "—")}</td>
      <td class="r">${p && (p.lat != null || p.address) ? `<a class="btn sm" href="${mapLink(p)}" target="_blank" rel="noopener" data-stop>Carte ↗</a>` : ""}</td></tr>`).join("")}</tbody></table></div></div>`
    : `<div class="panel empty">Aucun véhicule ne correspond à ce filtre.</div>`;
  UI.mapPts = rows.filter(x => x.p && x.p.lat != null).map(({ v, p, st }) => ({ id: v.id, lat: +p.lat, lon: +p.lon, st, label: fleetNo(v) || v.plate, title: `${fleetNo(v) ? fleetNo(v) + " · " : ""}${v.plate} · ${v.model}`, addr: p.address || "", at: p.at, driver: p.driver || "", speed: p.speed }));
  return (WF && WF.configured ? wfBanner() : banner) + tiles + toolbar + map + list;
}
ACTIONS["pos-f"] = el => { const f = posF(), d = el.dataset; if (d.reset) { f.st = []; UI.q = ""; } else f.st = f.st.includes(d.st) ? f.st.filter(x => x !== d.st) : [...f.st, d.st]; UI.focusQ = false; render(true); };

/* carte (Leaflet + fond de carte CARTO / OpenStreetMap) ; si elle ne peut pas se charger, la liste reste utilisable */
let wfMap = null, wfLayer = null, leafletP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (!leafletP) {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
    leafletP = loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js");
  }
  return leafletP;
}
async function drawWfMap() {
  const el = document.getElementById("wf-map"); if (!el) return;
  const msg = document.getElementById("wf-map-msg");
  const fail = t => { el.hidden = true; if (msg) { msg.hidden = false; msg.textContent = t; } };
  try { await loadLeaflet(); } catch (e) { return fail("La carte n'a pas pu être chargée. Utilisez les liens « Carte ↗ » de la liste."); }
  if (!window.L || !document.body.contains(el)) return;
  if (wfMap && wfMap.getContainer() !== el) { wfMap.remove(); wfMap = null; }
  const dark = document.documentElement.dataset.theme === "dark";
  if (SERVER && API && !WF) await wfRefresh();
  const key = (WF && WF.mapKey) || "";
  if (wfMap && wfMap._waysKey !== key + dark) { wfMap.remove(); wfMap = null; }   // clé ou thème changé : on recrée le fond
  if (!wfMap) {
    wfMap = L.map(el, { scrollWheelZoom: false, attributionControl: true });
    let errs = 0;
    wfMap._waysKey = key + dark;
    /* CARTO exige une clé (sinon tuiles marquées « API KEY REQUIRED ») : Paramètres → Liaison WEBFLEET → Fond de carte */
    L.tileLayer(key ? `https://basemaps.cartocdn.com/rastertiles/${dark ? "dark_all" : "voyager"}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`
      : `https://{s}.basemaps.cartocdn.com/${dark ? "dark_all" : "rastertiles/voyager"}/{z}/{x}/{y}{r}.png`, { maxZoom: 19, subdomains: "abcd", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>' })
      .on("tileerror", () => { if (++errs === 6) fail("Le fond de carte ne se charge pas ici. Utilisez les liens « Carte ↗ » de la liste."); }).addTo(wfMap);
    wfLayer = L.layerGroup().addTo(wfMap);
  }
  const pts = UI.mapPts || [];
  const dataKey = JSON.stringify(pts);
  if (wfMap._dataKey === dataKey) { setTimeout(() => wfMap && wfMap.invalidateSize(), 50); return; }   // rien n'a bougé : popup ouverte et zoom intacts
  wfMap._dataKey = dataKey;
  wfLayer.clearLayers();
  for (const p of pts) {
    const icon = L.divIcon({ className: "", html: `<div class="wf-pin st-${p.st}">${esc(p.label)}</div>`, iconSize: null, iconAnchor: [18, 30] });
    L.marker([p.lat, p.lon], { icon, title: p.title }).addTo(wfLayer)
      .bindPopup(`<b>${esc(p.title)}</b><br>${esc(tr(POS_ST[p.st][0]))}${p.speed ? " · " + Math.round(p.speed) + " km/h" : ""}<br>${esc(p.addr)}<br><span style="opacity:.7">${esc(tr(agoTxt(p.at)))}${p.driver ? " · " + esc(p.driver) : ""}</span><br><a href="#" data-a="veh-open" data-id="${p.id}">${esc(tr("Ouvrir la fiche véhicule"))}</a>`);
  }
  /* recadrage seulement à la création ou si la sélection de véhicules change : un zoom de l'utilisateur est respecté */
  const fitKey = pts.map(p => p.id).sort().join(",");
  if (pts.length && wfMap._fitKey !== fitKey) { wfMap._fitKey = fitKey; wfMap.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lon])).pad(0.15), { maxZoom: 13 }); }
  setTimeout(() => wfMap && wfMap.invalidateSize(), 50);
}

/* ---------- onglet Trajets ---------- */
const tripF = () => UI.tripF || (UI.tripF = { veh: [], period: "30", driver: "", mode: "", view: "trajets" });
function periodRange(p) {
  const t = today();
  if (p === "7") return [addDays(t, -6), t];
  if (p === "30") return [addDays(t, -29), t];
  if (p === "mois") return [t.slice(0, 8) + "01", t];
  if (p === "mois-1") { const d = new Date(t.slice(0, 8) + "01T12:00:00"); d.setMonth(d.getMonth() - 1); const s = d.toISOString().slice(0, 10); const e = addDays(t.slice(0, 8) + "01", -1); return [s, e]; }
  if (p === "annee") return [t.slice(0, 4) + "-01-01", t];
  if (p === "plage") { const f = tripF(); return [f.from || "", f.to || "9999"]; }
  return ["", "9999"];
}
function fleetTrips() {
  const f = tripF(), q = (UI.q || "").toLowerCase().trim(), all = allTrips();
  const [from, to] = periodRange(f.period);
  const drivers = [...new Set([...all.map(t => t.driver).filter(Boolean), ...(f.driver ? [f.driver] : [])])].sort((a, b) => a.localeCompare(b));
  const inPer = t => { const d = (t.start || "").slice(0, 10); return d >= from && d <= to; };
  const rows = all.filter(t => inPer(t) && (!f.veh.length || f.veh.includes(t.vehicleId)) && (!f.driver || (t.driver || "").trim().toLowerCase() === f.driver.trim().toLowerCase()) && (!f.mode || t.mode === f.mode)
    && (!q || [t.from, t.to, t.driver, vehLabel(t.vehicleId)].join(" ").toLowerCase().includes(q))).sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  const km = rows.reduce((a, t) => a + (+t.km || 0), 0), mins = rows.reduce((a, t) => a + (+t.durationMin || 0), 0), priv = rows.filter(t => t.mode === "private").reduce((a, t) => a + (+t.km || 0), 0);
  const hasMode = all.some(t => t.mode);
  const filters = `<div class="panel pad stack todo-filters">
    <div class="frow"><span class="flabel">Période</span><div class="fpills">${[["7", "7 jours"], ["30", "30 jours"], ["mois", "Ce mois"], ["mois-1", "Mois précédent"], ["annee", "Cette année"], ["tout", "Tout"], ["plage", "Dates…"]].map(([k, l]) => `<button class="fpill ${f.period === k ? "on" : ""}" data-a="trip-f" data-period="${k}">${l}</button>`).join("")}${f.period === "plage" ? `<span class="row-g nowrap small">du <input type="date" id="trip-from" class="fsel" value="${esc(f.from || "")}"> au <input type="date" id="trip-to" class="fsel" value="${esc(f.to || "")}"></span>` : ""}
      <select class="fsel" id="trip-driver" aria-label="Chauffeur"><option value="">Tous les chauffeurs</option>${drivers.map(d => `<option ${d === f.driver ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
      ${hasMode ? `<select class="fsel" id="trip-mode" aria-label="Type de trajet"><option value="">Pro + privé</option><option value="business" ${f.mode === "business" ? "selected" : ""}>Professionnels</option><option value="private" ${f.mode === "private" ? "selected" : ""}>Privés</option></select>` : ""}</div>
      <span>${readOnly ? "" : `<button class="btn sm" data-a="wf-import">Importer un export Webfleet (CSV)</button>`}</span></div>
    <div class="frow"><span class="flabel">Véhicule</span>${vehPicker(f.veh, "trip-f", id => all.filter(t => t.vehicleId === id && inPer(t)).length)}<span></span></div>
    <div class="frow"><span class="flabel">Rechercher</span><input type="search" id="q" class="fsearch" placeholder="Lieu, chauffeur, plaque…" value="${esc(UI.q)}" aria-label="Rechercher un trajet"><span></span></div></div>`;
  const kpis = `<div class="tiles doc-tiles"><div class="panel tile c-blue"><div class="lbl">Trajets</div><div class="val">${fmtN.format(rows.length)}</div></div>
    <div class="panel tile c-green"><div class="lbl">Distance</div><div class="val">${fmtN.format(Math.round(km))} km</div></div>
    <div class="panel tile c-orange"><div class="lbl">Temps de conduite</div><div class="val">${fmtHM(mins)}</div></div>
    ${hasMode ? `<div class="panel tile c-red"><div class="lbl">Dont privé</div><div class="val">${fmtN.format(Math.round(priv))} km</div></div>` : ""}</div>`;
  const seg = `<div class="row-sb mb"><div class="seg" role="group" aria-label="Affichage">${[["trajets", "Trajets"], ["vehicule", "Par véhicule"], ["chauffeur", "Par chauffeur"]].map(([k, l]) => `<button data-a="trip-f" data-view="${k}" class="${f.view === k ? "on" : ""}">${l}</button>`).join("")}</div>
    ${(S.trips || []).some(t => t.source === "demo") ? `<span class="chip warn">Données d'exemple</span>` : ""}</div>`;
  if (!all.length && WF && WF.configured) return wfBanner() + `<div class="panel empty">Aucun trajet reçu de Webfleet pour l'instant.</div>` + filters;
  if (!all.length) return `<div class="banner info">Aucun trajet pour l'instant. Exportez le rapport de trajets depuis Webfleet (CSV) puis importez-le ici. La liaison automatique viendra avec le serveur ONE.COM.</div>` + filters;
  let body;
  if (!rows.length) body = `<div class="panel empty">Aucun trajet sur cette période avec ces filtres.</div>`;
  else if (f.view === "trajets") {
    const lim = UI.tripLim || 150;
    body = `<div class="panel"><div class="tablewrap"><table><thead><tr><th>Départ</th><th>Véhicule</th><th>Chauffeur</th><th>Trajet</th><th class="r">Distance</th><th class="r">Durée</th>${hasMode ? "<th>Type</th>" : ""}</tr></thead><tbody>
      ${rows.slice(0, lim).map(t => { const v = veh(t.vehicleId); return `<tr class="click" data-a="veh-open" data-id="${t.vehicleId}"><td class="num small nowrap">${fmtDT(t.start)}${t.end ? `<div class="muted">→ ${fmtDT(t.end).split(" ").pop()}</div>` : ""}</td>
        <td class="nowrap">${v ? `${noBadge(v, 1)} <span class="plate sm">${esc(v.plate)}</span>` : "—"}</td><td class="small">${esc(t.driver || "—")}</td>
        <td class="small">${esc(t.from || "—")}<div class="muted">→ ${esc(t.to || "—")}</div></td><td class="num r nowrap">${fmtN.format(Math.round((+t.km || 0) * 10) / 10)} km</td><td class="num r nowrap">${fmtHM(t.durationMin)}</td>
        ${hasMode ? `<td>${t.mode === "private" ? `<span class="chip bad">Privé</span>` : t.mode === "business" ? `<span class="chip info">Pro</span>` : ""}</td>` : ""}</tr>`; }).join("")}</tbody></table></div>
      ${rows.length > lim ? `<div class="pad center"><button class="btn sm" data-a="trip-more">Afficher plus (${rows.length - lim} restants)</button></div>` : ""}</div>`;
  } else {
    const key = f.view === "vehicule" ? (t => t.vehicleId) : (t => t.driver || "—");
    const g = {};
    for (const t of rows) { const k = key(t); const x = g[k] || (g[k] = { n: 0, km: 0, min: 0, priv: 0, days: new Set() }); x.n++; x.km += +t.km || 0; x.min += +t.durationMin || 0; if (t.mode === "private") x.priv += +t.km || 0; x.days.add((t.start || "").slice(0, 10)); }
    const ent = Object.entries(g).sort((a, b) => b[1].km - a[1].km), max = ent[0]?.[1].km || 1;
    body = `<div class="panel"><div class="tablewrap"><table><thead><tr><th>${f.view === "vehicule" ? "Véhicule" : "Chauffeur"}</th><th class="r">Trajets</th><th class="r">Jours roulés</th><th class="r">Distance</th><th></th><th class="r">Temps</th>${hasMode ? `<th class="r">Privé</th>` : ""}</tr></thead><tbody>
      ${ent.map(([k, x]) => { const v = f.view === "vehicule" ? veh(k) : null; return `<tr ${v ? `class="click" data-a="veh-open" data-id="${k}"` : ""}><td>${v ? `${noBadge(v, 1)} <span class="plate sm">${esc(v.plate)}</span> <span class="small muted">${esc(v.model)}</span>` : esc(k)}</td>
        <td class="num r">${x.n}</td><td class="num r">${x.days.size}</td><td class="num r nowrap"><b>${fmtN.format(Math.round(x.km))} km</b></td><td class="barcell"><div class="lifebar"><span style="width:${Math.round(x.km / max * 100)}%"></span></div></td><td class="num r nowrap">${fmtHM(x.min)}</td>${hasMode ? `<td class="num r">${x.priv ? fmtN.format(Math.round(x.priv)) + " km" : "—"}</td>` : ""}</tr>`; }).join("")}</tbody></table></div></div>`;
  }
  return (WF && WF.configured ? wfBanner() : "") + filters + kpis + seg + body;
}
ACTIONS["trip-f"] = el => {
  const f = tripF(), d = el.dataset;
  if (d.period) f.period = d.period; else if (d.view) f.view = d.view; else if (d.veh) f.veh = f.veh.includes(d.veh) ? f.veh.filter(x => x !== d.veh) : [...f.veh, d.veh];
  UI.tripLim = 150; UI.focusQ = false; render(true);
};
ACTIONS["trip-more"] = () => { UI.tripLim = (UI.tripLim || 150) + 300; render(true); };
document.addEventListener("change", e => {
  if (e.target.id === "trip-driver") { tripF().driver = e.target.value; UI.focusQ = false; render(true); }
  if (e.target.id === "trip-mode") { tripF().mode = e.target.value; UI.focusQ = false; render(true); }
  if (e.target.id === "trip-from" || e.target.id === "trip-to") { tripF()[e.target.id === "trip-from" ? "from" : "to"] = e.target.value; UI.tripLim = 150; UI.focusQ = false; render(true); }
});

/* ---------- bloc WebFleet dans la fiche véhicule ---------- */
function vehWfTile(v) {
  const p = posOf(v.id), st = posState(p);
  if (!p || (p.lat == null && !p.address)) return `<div class="panel tile c-green"><div class="lbl">Position</div><div class="val sm muted">WebFleet</div><div class="note">${v.webfleetId ? "ID " + esc(v.webfleetId) + " · pas encore de données" : "ID WebFleet à renseigner"}</div></div>`;
  return `<a class="panel tile c-${POS_ST[st][2]} wf-tile" href="${mapLink(p)}" target="_blank" rel="noopener" data-stop title="Voir sur la carte"><div class="lbl">${POS_ST[st][0]}</div><div class="val sm">${esc(p.address || `${(+p.lat).toFixed(4)}, ${(+p.lon).toFixed(4)}`)}</div><div class="note">${agoTxt(p.at)} · Carte ↗</div></a>`;
}
function vehTripsHtml(v) {
  const ts = allTrips().filter(t => t.vehicleId === v.id).sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  if (!ts.length) return "";
  const last30 = ts.filter(t => (t.start || "").slice(0, 10) >= addDays(today(), -29));
  return `<div class="row-sb"><h3>Derniers trajets <span class="muted small">${fmtN.format(Math.round(last30.reduce((a, t) => a + (+t.km || 0), 0)))} km sur 30 jours</span></h3><button class="btn sm" data-a="veh-trips" data-id="${v.id}">Tous les trajets</button></div>
    <div class="stack-s">${ts.slice(0, 5).map(t => `<div class="small trip-ln"><span class="num muted nowrap">${fmtDT(t.start)}</span><span>${esc(t.from || "—")} → ${esc(t.to || "—")}</span><span class="num nowrap"><b>${fmtN.format(Math.round(+t.km || 0))} km</b> · ${fmtHM(t.durationMin)}</span></div>`).join("")}</div>`;
}
ACTIONS["veh-trips"] = el => { const f = tripF(); f.veh = [el.dataset.id]; f.view = "trajets"; closeModal(); UI.tab.flotte = "trajets"; UI.q = ""; if (route() !== "flotte") location.hash = "#flotte"; render(true); };

/* ======================= IMPORT CSV WEBFLEET ======================= */
const normH = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const normPlate = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/).find(l => l.trim()) || "";
  const cnt = c => (first.match(new RegExp("\\" + c, "g")) || []).length;
  const sep = [";", ",", "\t", "|"].sort((a, b) => cnt(b) - cnt(a))[0];
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some(x => x.trim() !== "")) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some(x => x.trim() !== "")) rows.push(row);
  return { sep, header: (rows.shift() || []).map(h => h.trim()), rows };
}
async function readTextSmart(file) {
  const buf = await file.arrayBuffer();
  let t = new TextDecoder("utf-8").decode(buf);
  if ((t.match(/�/g) || []).length > 2) t = new TextDecoder("windows-1252").decode(buf);
  return t;
}
/* champs reconnus (en-têtes Webfleet FR / EN / NL / DE et noms de l'API WEBFLEET.connect) */
const WF_FIELDS = {
  status: ["statut", "status", "etat", "state", "toestand"],
  objno: ["num", "numero", "nr", "no", "n", "objectno", "object no", "objectnr", "numero d objet", "n objet", "no objet", "objectnummer", "objekt nr", "objektnummer", "vehicle id", "id vehicule", "unit id"],
  objname: ["objectname", "object name", "objet", "nom de l objet", "nom objet", "object", "vehicule", "vehicle", "voertuig", "fahrzeug", "nom"],
  plate: ["licenseplatenumber", "license plate number", "licence plate", "license plate", "numero d immatriculation", "immatriculation", "plaque", "plaque d immatriculation", "kenteken", "kennzeichen", "registration", "registration number", "plate"],
  model: ["description", "vehicle type", "type de vehicule", "modele", "model", "marque et modele", "brand", "marque", "voertuigtype", "fahrzeugtyp", "objectdescription"],
  vin: ["vin", "identnumber", "numero de chassis", "chassis", "n de chassis", "chassisnummer", "fahrgestellnummer"],
  fuel: ["fueltype", "fuel type", "carburant", "type de carburant", "brandstof", "kraftstoff", "fuel"],
  lat: ["latitude", "lat", "latitude mdeg", "breedtegraad", "breitengrad"],
  lon: ["longitude", "lon", "lng", "long", "longitude mdeg", "lengtegraad", "langengrad"],
  address: ["postext", "position", "adresse", "address", "location", "lieu", "positie", "standort", "derniere position", "last position"],
  time: ["msgtime", "pos time", "postime", "date heure", "date et heure", "datetime", "timestamp", "horodatage", "time", "heure", "date", "tijd", "zeit", "derniere mise a jour", "last update"],
  odometer: ["odometer", "kilometrage", "compteur", "compteur kilometrique", "km stand", "kilometerstand", "mileage", "odometre", "total km"],
  speed: ["speed", "vitesse", "snelheid", "geschwindigkeit"],
  ignition: ["ignition", "contact", "contact mis", "ontsteking", "zundung", "standstill"],
  driver: ["drivername", "driver", "chauffeur", "conducteur", "bestuurder", "fahrer", "driver name", "nom du conducteur"],
  start: ["start time", "starttime", "start", "debut", "depart", "heure de depart", "date de depart", "begin", "beginn", "start date", "trip start"],
  end: ["end time", "endtime", "end", "fin", "arrivee", "heure d arrivee", "date d arrivee", "einde", "ende", "end date", "trip end"],
  from: ["start postext", "start address", "start position", "adresse de depart", "lieu de depart", "depart adresse", "de", "from", "vertrek", "startadresse", "position de depart"],
  to: ["end postext", "end address", "end position", "adresse d arrivee", "lieu d arrivee", "arrivee adresse", "a", "to", "aankomst", "zieladresse", "position d arrivee", "destination"],
  distance: ["distance", "distance km", "km", "kilometres", "kilometers", "afstand", "strecke", "distance parcourue", "trip distance"],
  duration: ["duration", "duree", "duur", "dauer", "temps de conduite", "driving time", "trip duration"],
  mode: ["tripmode", "trip mode", "type de trajet", "mode", "rittype", "fahrtmodus", "type"],
  startOdo: ["start odometer", "compteur de depart", "km depart", "start km"],
  endOdo: ["end odometer", "compteur d arrivee", "km arrivee", "end km"]
};
function guessCols(header) {
  const H = header.map(normH), used = new Set(), map = {};
  const pick = (k, exactOnly) => {
    for (const cand of WF_FIELDS[k]) { const i = H.findIndex((h, j) => !used.has(j) && (h === cand || h.replace(/ /g, "") === cand.replace(/ /g, ""))); if (i >= 0) return i; }
    if (exactOnly) return -1;
    for (const cand of WF_FIELDS[k]) { if (cand.length < 4) continue; const i = H.findIndex((h, j) => !used.has(j) && h.includes(cand)); if (i >= 0) return i; }
    return -1;
  };
  for (const k of ["from", "to", "startOdo", "endOdo", "start", "end", "status", "objno", "plate", "vin", "fuel", "objname", "model", "lat", "lon", "odometer", "address", "driver", "distance", "duration", "speed", "ignition", "mode", "time"]) {
    const i = pick(k); if (i >= 0) { map[k] = i; used.add(i); }
  }
  return map;
}
function parseNum(s) { if (s == null) return NaN; s = String(s).trim().replace(/\s| /g, ""); if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", "."); else s = s.replace(/,(?=\d{3}\b)/g, ""); return parseFloat(s); }
function parseWhen(s) {
  s = String(s || "").trim(); if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).toISOString();
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return new Date(y, m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).toISOString(); }
  const d = new Date(s); return isNaN(d) ? "" : d.toISOString();
}
function parseDur(s) { s = String(s || "").trim(); if (!s) return 0; const m = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/); if (m) return +m[1] * 60 + +m[2] + (+(m[3] || 0)) / 60; const h = s.match(/(\d+)\s*h\D*(\d+)?/i); if (h) return +h[1] * 60 + +(h[2] || 0); const n = parseNum(s); return isNaN(n) ? 0 : n; }
/* trouve le véhicule : identifiant WebFleet, puis plaque, puis identifiant W.A.Y.S. */
function matchVeh(objno, objname) {
  const no = String(objno || "").trim().toUpperCase(), nm = String(objname || "");
  const vs = [...S.vehicles.filter(v => !v.retired), ...S.vehicles.filter(v => v.retired)];
  if (no) { const v = vs.find(v => v.webfleetId && v.webfleetId.trim().toUpperCase() === no); if (v) return v; }
  const np = normPlate(nm) + "|" + normPlate(no);
  for (const v of vs) { const p = normPlate(v.plate); if (p.length >= 5 && np.includes(p)) return v; }
  if (no || nm) {
    const t = (no + " " + nm).toUpperCase(), pm = t.replace(/\u00a0/g, " ").match(/\b(\d-?[A-Z]{3}-?\d{3})\b/), rowPlate = pm ? normPlate(pm[1]) : "";
    /* par identifiant W.A.Y.S., seulement si la plaque de la ligne (quand il y en a une) est la même */
    const v = vs.find(v => fleetNo(v) && new RegExp(`(^|[^A-Z0-9])${fleetNo(v)}([^A-Z0-9]|$)`).test(t) && (!rowPlate || normPlate(v.plate) === rowPlate)); if (v) return v;
  }
  return null;
}

ACTIONS["wf-import"] = () => {
  const m = modal(`${mHead("Importer un export Webfleet (CSV ou Excel)")}<div class="body">
    <p class="small">Dans Webfleet, exportez (CSV ou Excel) la <b>liste des véhicules</b>, la <b>vue des dernières positions</b> ou le <b>rapport de trajets</b>. L'application reconnaît le type de fichier et les colonnes, en français, anglais, néerlandais ou allemand.</p>
    <label class="dropzone" for="wf-file"><b>Choisir le fichier (CSV ou Excel)</b><span class="muted small">ou le déposer ici</span></label><input type="file" id="wf-file" accept=".csv,.txt,.xlsx,.xls,text/csv" hidden>
    <div id="wf-step"></div></div>
    <footer><button type="button" class="btn" data-close>Fermer</button><button type="button" class="btn primary" id="wf-go" disabled>Importer</button></footer>`, "lg");
  const z = m.querySelector(".dropzone"), inp = m.querySelector("#wf-file");
  ["dragenter", "dragover"].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.remove("over"); }));
  z.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) wfPrepare(m, f); });
  inp.onchange = () => { if (inp.files[0]) wfPrepare(m, inp.files[0]); };
};
async function wfPrepare(m, file, forced) {
  const step = m.querySelector("#wf-step"), go = m.querySelector("#wf-go");
  let csv;
  try { csv = /\.(xlsx|xls|xlsm|ods)$/i.test(file.name || "") ? await readSheet(file) : parseCSV(await readTextSmart(file)); }
  catch (e) { step.innerHTML = `<div class="err">Le fichier n'a pas pu être lu${/\.(xlsx|xls)$/i.test(file.name || "") ? " (lecteur Excel indisponible : enregistrez-le en CSV depuis Excel)" : ""}.</div>`; return; }
  if (!csv.header.length || !csv.rows.length) { step.innerHTML = `<div class="err">Le fichier est vide ou n'est pas un CSV.</div>`; return; }
  const cols = guessCols(csv.header);
  const kind = forced || (cols.start != null && (cols.end != null || cols.distance != null) ? "trips" : (cols.lat != null || cols.odometer != null || cols.speed != null) ? "pos" : "veh");
  if (kind === "trips" && cols.start == null && cols.time != null) { cols.start = cols.time; delete cols.time; }
  const need = kind === "veh" ? [["objname", "Nom de l'objet WebFleet"], ["objno", "N° d'objet WebFleet"], ["plate", "Immatriculation"], ["model", "Marque / modèle / description"], ["vin", "N° de châssis (VIN)"], ["fuel", "Carburant"], ["odometer", "Compteur kilométrique"], ["driver", "Chauffeur"], ["address", "Dernière position (adresse)"], ["time", "Dernière mise à jour"], ["status", "Statut WebFleet"]]
    : kind === "trips" ? [["objname", "Véhicule (nom / plaque)"], ["objno", "N° d'objet WebFleet"], ["start", "Départ (date et heure)"], ["end", "Arrivée (date et heure)"], ["from", "Adresse de départ"], ["to", "Adresse d'arrivée"], ["distance", "Distance"], ["duration", "Durée"], ["driver", "Chauffeur"], ["mode", "Type (pro / privé)"], ["startOdo", "Compteur au départ"], ["endOdo", "Compteur à l'arrivée"]]
    : [["objname", "Véhicule (nom / plaque)"], ["objno", "N° d'objet WebFleet"], ["time", "Date et heure du signal"], ["lat", "Latitude"], ["lon", "Longitude"], ["address", "Adresse"], ["odometer", "Compteur kilométrique"], ["speed", "Vitesse"], ["ignition", "Contact"], ["status", "Statut WebFleet"], ["driver", "Chauffeur"]];
  const colSel = (k, l) => `<label class="f">${l}<select class="fsel" data-col="${k}"><option value="">— ignorée —</option>${csv.header.map((h, i) => `<option value="${i}" ${cols[k] === i ? "selected" : ""}>${esc(h)}</option>`).join("")}</select></label>`;
  step.innerHTML = `<div class="panel pad stack"><div class="row-sb wrap"><b>${esc(file.name)}</b><span class="muted small">${plural(csv.rows.length, "ligne")}${csv.sep ? ` · séparateur « ${csv.sep === "\t" ? "tabulation" : csv.sep} »` : " · fichier Excel"}</span></div>
    <label class="f">Type de fichier<select class="fsel" id="wf-kind"><option value="veh" ${kind === "veh" ? "selected" : ""}>Liste des véhicules (créer / compléter les fiches)</option><option value="pos" ${kind === "pos" ? "selected" : ""}>Dernières positions / compteurs</option><option value="trips" ${kind === "trips" ? "selected" : ""}>Rapport de trajets</option></select></label>
    <details ${Object.keys(cols).length < 4 ? "open" : ""}><summary class="small">Colonnes reconnues (vérifier ou corriger)</summary><div class="fields mt">${need.map(([k, l]) => colSel(k, l)).join("")}</div></details>
    <div class="${kind === "veh" ? "stack" : "fields"}">${kind === "veh" ? `<label class="f" style="max-width:320px">Unité du compteur<select class="fsel" id="wf-odo"><option value="auto">Automatique</option><option value="km">km</option><option value="hm">centaines de mètres (API WebFleet)</option><option value="m">mètres</option></select></label>
      <label class="chk"><input type="checkbox" id="wf-create" checked> Créer une fiche pour chaque véhicule absent de l'ERP</label>
      <label class="chk"><input type="checkbox" id="wf-useno" checked> Reprendre l'identifiant WebFleet (004, 015… en tête du nom, sinon le n° d'objet) comme identifiant W.A.Y.S. quand il est libre</label>
      ${cols.address != null || cols.time != null ? `<label class="chk"><input type="checkbox" id="wf-withpos" checked> Enregistrer aussi la dernière position (adresse, état, dernière mise à jour)</label>
      <label class="chk"><input type="checkbox" id="wf-geo"> Placer les adresses sur la carte (géocodage OpenStreetMap, ≈ 1 seconde par véhicule)</label>` : ""}`
      : kind === "pos" ? `<label class="f">Unité du compteur<select class="fsel" id="wf-odo"><option value="auto">Automatique</option><option value="km">km</option><option value="hm">centaines de mètres (API WebFleet)</option><option value="m">mètres</option></select></label>
      <label class="chk"><input type="checkbox" id="wf-updkm" checked> Mettre à jour le kilométrage des fiches véhicules (seulement s'il est plus élevé)</label>`
      : `<label class="f">Unité de la distance<select class="fsel" id="wf-dist"><option value="auto">Automatique</option><option value="km">km</option><option value="m">mètres</option></select></label>`}</div>
    <div id="wf-sum"></div></div>`;
  m.querySelector("#wf-kind").onchange = e => wfPrepare(m, file, e.target.value);
  const recompute = () => wfSummary(m, csv);
  step.querySelectorAll("select:not(#wf-kind), input").forEach(x => x.addEventListener("change", recompute));
  recompute();
  go.disabled = false;
  go.onclick = () => wfRun(m, csv, file.name);
}
function wfCols(m) { const c = {}; m.querySelectorAll("[data-col]").forEach(s => { if (s.value !== "") c[s.dataset.col] = +s.value; }); return c; }
function wfRows(m, csv) {
  const c = wfCols(m), kind = m.querySelector("#wf-kind").value, get = (r, k) => c[k] != null ? (r[c[k]] ?? "").trim() : "";
  const out = [];
  for (const r of csv.rows) {
    const v = matchVeh(get(r, "objno"), [get(r, "plate"), get(r, "objname")].join(" "));
    out.push({ r, v, key: get(r, "objno") || get(r, "plate") || get(r, "objname"), get: k => get(r, k) });
  }
  return { kind, c, out };
}
function odoFactor(m, rows) {
  const sel = m.querySelector("#wf-odo")?.value || "auto";
  if (sel !== "auto") return { km: 1, hm: 0.1, m: 0.001 }[sel];
  const ratios = rows.filter(x => x.v && +x.v.km > 1000).map(x => parseNum(x.get("odometer")) / x.v.km).filter(x => x > 0).sort((a, b) => a - b);
  const med = ratios[Math.floor(ratios.length / 2)];
  if (!med) { const vals = rows.map(x => parseNum(x.get("odometer"))).filter(n => n > 0).sort((a, b) => a - b); const mv = vals[Math.floor(vals.length / 2)]; return !mv ? 1 : mv > 5e6 ? 0.001 : mv > 1.5e6 ? 0.1 : 1; }
  if (med > 300) return 0.001; if (med > 4) return 0.1; return 1;
}
function distFactor(m, rows) {
  const sel = m.querySelector("#wf-dist")?.value || "auto";
  if (sel !== "auto") return sel === "m" ? 0.001 : 1;
  const ds = rows.map(x => parseNum(x.get("distance"))).filter(n => n > 0).sort((a, b) => a - b);
  return ds.length && ds[Math.floor(ds.length / 2)] > 1500 ? 0.001 : 1;
}
function wfSummary(m, csv) {
  const { kind, c, out } = wfRows(m, csv), box = m.querySelector("#wf-sum");
  const ok = out.filter(x => x.v), miss = [...new Set(out.filter(x => !x.v).map(x => x.key).filter(Boolean))];
  const nVeh = new Set(ok.map(x => x.v.id)).size;
  if (kind === "veh") return wfVehSummary(m, csv, c, out, box);
  const warn = kind === "pos" ? (c.lat == null && c.address == null && c.odometer == null ? "Aucune colonne de position ni de compteur reconnue : choisissez-les ci-dessus." : "")
    : (c.start == null ? "La colonne de départ (date et heure) est nécessaire." : "");
  box.innerHTML = `${warn ? `<div class="err">${warn}</div>` : ""}
    <div class="row-g wrap"><span class="chip good">${plural(ok.length, "ligne")} → ${plural(nVeh, "véhicule")}</span>${miss.length ? `<span class="chip warn">${plural(miss.length, "véhicule")} non reconnu${miss.length > 1 ? "s" : ""}</span>` : ""}
    ${kind === "pos" && c.odometer != null ? `<span class="muted small">Compteur : ${({ 1: "km", 0.1: "centaines de mètres", 0.001: "mètres" })[odoFactor(m, out)]}</span>` : ""}${kind === "trips" && c.distance != null ? `<span class="muted small">Distance : ${distFactor(m, out) === 1 ? "km" : "mètres"}</span>` : ""}</div>
    ${miss.length ? `<div class="small muted">Non reconnus : ${miss.slice(0, 12).map(esc).join(", ")}${miss.length > 12 ? "…" : ""}. Renseignez leur « Identifiant WebFleet » (n° d'objet) dans la fiche du véhicule, ou vérifiez que la plaque figure dans le nom de l'objet.</div>` : ""}
    <div class="tablewrap mt"><table class="small"><thead><tr><th>Véhicule trouvé</th>${csv.header.slice(0, 7).map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${out.slice(0, 4).map(x => `<tr><td>${x.v ? `${noBadge(x.v, 1)} ${esc(x.v.plate)}` : `<span class="chip warn">?</span>`}</td>${x.r.slice(0, 7).map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  m.querySelector("#wf-go").disabled = !!warn || !ok.length;
}
async function wfRun(m, csv, fileName) {
  const { kind, out } = wfRows(m, csv), go = m.querySelector("#wf-go"), now = new Date().toISOString();
  if (kind === "veh") return wfVehRun(m, out, now);
  const ok = out.filter(x => x.v); if (!ok.length) return;
  go.disabled = true;
  const prog = n => { go.textContent = `Import… ${n}/${kind === "pos" ? new Set(ok.map(x => x.v.id)).size : ok.length}`; };
  let done = 0, added = 0, kmUpd = 0;
  if (kind === "pos") {
    const f = odoFactor(m, out), upd = m.querySelector("#wf-updkm")?.checked;
    const last = {};
    for (const x of ok) { const at = parseWhen(x.get("time")) || now; if (!last[x.v.id] || at >= last[x.v.id].at) last[x.v.id] = { x, at }; }
    for (const [vid, { x, at }] of Object.entries(last)) {
      let lat = parseNum(x.get("lat")), lon = parseNum(x.get("lon"));
      if (Math.abs(lat) > 1000) lat /= 1e6; if (Math.abs(lon) > 1000) lon /= 1e6;
      const odo = parseNum(x.get("odometer")) * f, sp = parseNum(x.get("speed")), ign = x.get("ignition");
      const data = { vehicleId: vid, lat: isNaN(lat) ? null : lat, lon: isNaN(lon) ? null : lon, address: x.get("address"), at, odometer: isNaN(odo) ? 0 : Math.round(odo), speed: isNaN(sp) ? null : sp,
        ignition: /^(1|on|oui|yes|ja|true|aan|an|mis)/i.test(ign), driver: cleanDriver(x.get("driver")), state: wfState(x.get("status")), source: "csv", importedAt: now, file: fileName };
      await save("vehPos", vid, data);
      if (upd && data.odometer > (+veh(vid)?.km || 0)) { await patch("vehicles", vid, { km: data.odometer }); kmUpd++; }
      prog(++done);
    }
    closeModal(); toast(`${plural(done, "position")} importée${done > 1 ? "s" : ""}${kmUpd ? ` · ${plural(kmUpd, "kilométrage")} mis à jour` : ""}`);
  } else {
    const df = distFactor(m, out), existing = new Set((S.trips || []).map(t => t.id));
    for (const x of ok) {
      const start = parseWhen(x.get("start")); if (!start) { prog(++done); continue; }
      const end = parseWhen(x.get("end"));
      let km = parseNum(x.get("distance")) * df;
      const so = parseNum(x.get("startOdo")), eo = parseNum(x.get("endOdo"));
      if (isNaN(km) && !isNaN(so) && !isNaN(eo)) km = eo - so;
      let dur = parseDur(x.get("duration"));
      if (/^\d+$/.test(x.get("duration")) && dur > 600) dur = dur / 60; /* secondes */
      if (!dur && end) dur = (new Date(end) - new Date(start)) / 60000;
      const md = x.get("mode").toLowerCase();
      const id = "t-" + x.v.id + "-" + start.replace(/[^0-9]/g, "").slice(0, 12);
      if (!existing.has(id)) added++;
      await save("trips", id, { vehicleId: x.v.id, start, end, from: x.get("from"), to: x.get("to"), km: isNaN(km) ? 0 : Math.round(km * 10) / 10, durationMin: Math.round(dur || 0),
        driver: x.get("driver"), mode: /priv|prive/.test(md) ? "private" : /busi|pro|zakel|gesch|travail/.test(md) ? "business" : "", startOdo: isNaN(so) ? 0 : so, endOdo: isNaN(eo) ? 0 : eo, source: "csv", importedAt: now });
      prog(++done);
    }
    closeModal(); toast(`${plural(added, "nouveau trajet", "nouveaux trajets")}${done - added ? ` · ${done - added} déjà connu${done - added > 1 ? "s" : ""} mis à jour` : ""}`);
  }
}

/* ---------- import de la liste des véhicules WebFleet ---------- */
let vehFromRow;
const PLATE_RE = /\b(\d-?[A-Z]{3}-?\d{3}|[A-Z]{3}-?\d{3}|\d{3}-?[A-Z]{3})\b/;
function wfVehSummary(m, csv, c, out, box) {
  const rows = out.filter(x => x.get("objno") || x.get("objname") || x.get("plate"));
  const upd = rows.filter(x => x.v), neu = rows.filter(x => !x.v);
  const warn = c.objno == null && c.objname == null && c.plate == null ? "Choisissez au moins la colonne du nom de l'objet, du n° d'objet ou de l'immatriculation." : "";
  const create = m.querySelector("#wf-create")?.checked, useNo = m.querySelector("#wf-useno")?.checked, usedNos = usedFleetNos();
  box.innerHTML = `${warn ? `<div class="err">${warn}</div>` : ""}
    <div class="row-g wrap"><span class="chip info">${plural(upd.length, "véhicule")} déjà dans l'ERP → fiche complétée</span><span class="chip ${create ? "good" : ""}">${plural(neu.length, "nouveau véhicule", "nouveaux véhicules")}${create ? " → fiche créée" : " (ignorés)"}</span></div>
    <div class="small muted">Fiches existantes : l'identifiant WebFleet est ajouté et le kilométrage mis à jour s'il est plus élevé. Nouvelles fiches : un identifiant W.A.Y.S. libre leur est attribué ; complétez ensuite les documents, pneus et échéances.</div>
    <div class="tablewrap mt"><table class="small"><thead><tr><th>Action</th><th>Identifiant</th><th>Plaque</th><th>Modèle</th><th>N° d'objet</th><th>Dernière position</th></tr></thead><tbody>
    ${rows.slice(0, 60).map(x => { const d = vehFromRow(x), f = odoFactor(m, out), km = Math.round(parseNum(x.get("odometer")) * f) || 0;
      return `<tr><td>${x.v ? `<span class="chip info">Compléter</span>` : create ? `<span class="chip good">Créer</span>` : `<span class="chip">Ignorer</span>`}</td><td>${x.v ? noBadge(x.v, 1) : useNo && (d.prefix || d.objno) && !usedNos.has(normFleetNo(d.prefix || d.objno)) ? `<span class="fleetno sm">${esc(normFleetNo(d.prefix || d.objno))}</span>` : `<span class="muted">auto</span>`}</td>
        <td class="mono">${x.v ? esc(x.v.plate) : d.plate ? esc(d.plate) : `<span class="chip warn">à compléter</span>`}</td><td>${esc(x.v ? x.v.model : d.model)}${!x.v && d.color ? ` <span class="muted">· ${esc(d.color)}</span>` : ""}</td><td class="mono">${esc(d.objno || "—")}</td><td class="small">${esc(x.get("address") || (km ? fmtN.format(km) + " km" : "—"))}</td></tr>`; }).join("")}
    </tbody></table>${rows.length > 60 ? `<div class="muted small pad">… et ${rows.length - 60} autres</div>` : ""}</div>`;
  m.querySelector("#wf-go").disabled = !!warn || !(upd.length || (create && neu.length));
}
async function wfVehRun(m, out, now) {
  const go = m.querySelector("#wf-go"); go.disabled = true;
  const rows = out.filter(x => x.get("objno") || x.get("objname") || x.get("plate"));
  const create = m.querySelector("#wf-create")?.checked, f = odoFactor(m, out);
  const useNo = m.querySelector("#wf-useno")?.checked, withPos = m.querySelector("#wf-withpos")?.checked, geo = m.querySelector("#wf-geo")?.checked;
  const posList = [];
  const used = usedFleetNos(); let n = Math.max(0, ...[...used].filter(x => /^\d+$/.test(x)).map(Number));
  const nextNo = d => {
    const want = normFleetNo(d.prefix || d.objno || "");
    if (useNo && want && /^[A-Z0-9]{1,6}$/.test(want) && !used.has(want)) { used.add(want); return want; }
    do { n++; } while (used.has(String(n).padStart(3, "0"))); const no = String(n).padStart(3, "0"); used.add(no); return no;
  };
  let created = 0, updated = 0, done = 0; const seen = new Set();
  for (const x of rows) {
    const d = vehFromRow(x), km = Math.round(parseNum(x.get("odometer")) * f) || 0;
    let vid = null;
    if (x.v) {
      vid = x.v.id;
      const upd = {}; if (d.objno && !x.v.webfleetId) upd.webfleetId = d.objno; if (km > (+x.v.km || 0)) upd.km = km; if (d.vin && !x.v.vin) upd.vin = d.vin; if (d.color && !x.v.color) upd.color = d.color;
      if (Object.keys(upd).length) { await patch("vehicles", x.v.id, upd); updated++; }
    } else if (create) {
      const key = normPlate(d.plate) + "|" + d.objno; if (seen.has(key)) continue; seen.add(key);
      vid = await save("vehicles", null, { fleetNo: nextNo(d), plate: d.plate, model: d.model, color: d.color, year: "", fuel: d.fuel || "", vin: d.vin, km, status: "actif", driver: d.driver, driverDate: d.driver ? today() : "",
        webfleetId: d.objno, nextServiceDate: "", nextServiceKm: 0, ctDate: "", insuranceDate: "", docs: [], importedFrom: "webfleet", createdAt: now });
      created++;
    }
    if (vid && withPos && (x.get("address") || x.get("time"))) posList.push({ vid, address: x.get("address"), at: parseWhen(x.get("time")) || now, state: wfState(x.get("status")), driver: d.driver, km });
    go.textContent = `Import… ${++done}/${rows.length}`;
  }
  let placed = 0;
  for (const [i, p] of posList.entries()) {
    const prev = posOf(p.vid);
    let ll = prev && prev.address === p.address && prev.lat != null ? { lat: prev.lat, lon: prev.lon } : null;
    if (!ll && geo && p.address) { go.textContent = `Localisation des adresses… ${i + 1}/${posList.length}`; ll = await geocode(p.address); await new Promise(r => setTimeout(r, 1100)); }
    if (ll) placed++;
    await save("vehPos", p.vid, { vehicleId: p.vid, lat: ll ? ll.lat : null, lon: ll ? ll.lon : null, address: p.address, at: p.at, odometer: p.km || (prev?.odometer || 0), speed: null, ignition: p.state === "arret" || p.state === "route", state: p.state, driver: p.driver, source: "csv", importedAt: now });
  }
  closeModal(); UI.tab.flotte = "vehicules"; render(true);
  if (posList.length) toast(`${plural(posList.length, "position")} enregistrée${posList.length > 1 ? "s" : ""}${geo ? ` · ${placed} placée${placed > 1 ? "s" : ""} sur la carte` : ""}`);
  toast(`${plural(created, "véhicule créé", "véhicules créés")}${updated ? ` · ${plural(updated, "fiche complétée", "fiches complétées")}` : ""}`);
}

/* ---------- lecture Excel (SheetJS) ---------- */
async function readSheet(file) {
  if (!window.XLSX) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }).map(r => r.map(x => String(x ?? "").replace(/\u00a0/g, " ").trim()));
  const hi = rows.findIndex(r => r.filter(Boolean).length >= 2);
  const header = (rows[hi] || []).map(h => h.trim());
  return { sep: "", header, rows: rows.slice(hi + 1).filter(r => r.some(x => x !== "")) };
}
const cleanDriver = d => (d && !/^[—–\-\s]*$/.test(d)) ? d.trim() : "";
/* état WebFleet (« En déplacement », « Immobilisation (contact coupé) »…) → état ERP */
function wfState(s) {
  s = normH(s);
  if (!s) return "";
  if (/deplacement|driving|moving|en route|rijdend|fahrt/.test(s)) return "route";
  if (/contact active|contact mis|ignition on|contact aan|zundung an/.test(s)) return "arret";
  if (/contact coupe|ignition off|immobil|stationary|stilstand|parked|gepark/.test(s)) return "coupe";
  if (/inactif|inactive|offline/.test(s)) return "coupe";
  return "";
}
const COLOR_WORDS = ["light blue", "dark blue", "dark grey", "light grey", "blue grey", "dark green", "dark red", "blue", "red", "grey", "gray", "white", "black", "yellow", "green", "orange", "brown", "silver", "rust", "beige", "bleu", "rouge", "gris", "blanc", "noir", "jaune", "vert", "brun", "argent"];
/* nom d'objet WebFleet « 004 - 1WHE500 - Chevrolet Cruze (Station) - Blue » → plaque, modèle, couleur */
vehFromRow = function (x) {
  const objno = x.get("objno").replace(/\u00a0/g, " ").trim();
  const name = x.get("objname").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  let parts = name.split(/\s+-\s*|\s*-\s+/).map(p => p.trim()).filter(Boolean);
  /* identifiant interne en tête du nom (« 052 - … », « E01 - … ») */
  let prefix = "";
  if (parts.length > 1 && /^[A-Z0-9]{1,4}$/i.test(parts[0]) && !/^\d[A-Z]{3}\d{3}$/i.test(parts[0])) prefix = parts.shift().toUpperCase();
  if (objno) parts = parts.filter(p => p.toUpperCase() !== objno.toUpperCase());
  let plate = (x.get("plate") || "").toUpperCase().replace(/[\s.]/g, "");
  if (!plate) { const i = parts.findIndex(p => /^(\d-?[A-Z]{3}-?\d{3}|[A-Z]{3}-?\d{3})$/i.test(p.replace(/\s/g, ""))); if (i >= 0) { plate = parts[i].toUpperCase().replace(/\s/g, ""); parts.splice(i, 1); } }
  if (!plate) { const m = name.toUpperCase().match(PLATE_RE); if (m) { plate = m[1]; parts = parts.map(p => p.toUpperCase().includes(m[1]) ? p.replace(new RegExp(m[1], "i"), "").trim() : p).filter(Boolean); } }
  if (/^\d[A-Z]{3}\d{3}$/.test(plate)) plate = plate[0] + "-" + plate.slice(1, 4) + "-" + plate.slice(4);
  let color = "";
  if (parts.length > 1 && COLOR_WORDS.includes(parts[parts.length - 1].toLowerCase())) color = parts.pop();
  let model = x.get("model") || parts.join(" - ");
  if (!color) { const cw = COLOR_WORDS.find(c => new RegExp(`\\b${c}\\b`, "i").test(model)); if (cw && model.split(" ").length > 2) { color = model.match(new RegExp(`\\b${cw}\\b`, "i"))[0]; model = model.replace(new RegExp(`\\s*\\b${cw}\\b`, "i"), "").replace(/\s+/g, " ").trim(); } }
  model = model.replace(/^([A-Za-z]+)\.\s/, "$1 ").trim();
  if (!model) model = name || objno;
  return { prefix, plate, model, color: color ? color[0].toUpperCase() + color.slice(1) : "", vin: (x.get("vin") || "").toUpperCase(), fuel: x.get("fuel"), driver: cleanDriver(x.get("driver")), objno };
};
/* géocodage (OpenStreetMap Nominatim), une adresse par seconde, résultat gardé dans la position */
async function geocode(addr) {
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=be,nl,lu,fr,de&q=" + encodeURIComponent(addr), { headers: { "Accept-Language": "fr" } });
    if (!r.ok) return null; const j = await r.json(); return j[0] ? { lat: +j[0].lat, lon: +j[0].lon } : null;
  } catch (e) { return null; }
}

/* ======================= LIAISON WEBFLEET AUTOMATIQUE (serveur ways.support) ======================= */
/* Le serveur interroge WEBFLEET.connect avec ses propres identifiants ; le navigateur ne fait que
   déclencher la synchronisation (le serveur impose la cadence : positions 1 min, trajets 15 min). */
let WF = null;
const msIso = ms => ms ? new Date(ms).toISOString() : "";
async function wfRefresh() { try { WF = await API.call("GET", "webfleet/status"); } catch { WF = null; } return WF; }
async function wfTick(force) {
  if (!SERVER || !API) return null;
  if (!WF) await wfRefresh();
  if (!WF || !WF.configured || (!force && document.hidden)) return null;
  let r;
  try { r = await API.call("POST", "webfleet/sync", force ? { force: true } : {}); } catch (e) { r = { ok: false, error: e.message }; }
  if (!r.skipped && !r.busy) { await wfRefresh(); if (document.getElementById("wf-box")) loadWf(); }
  return r;
}
let wfStarted = false;
function wfStart() {
  if (!SERVER || wfStarted) return; wfStarted = true;
  setTimeout(() => wfTick(), 1500);
  setInterval(() => wfTick(), 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) wfTick(); });
}
function wfBanner() {
  if (!WF || !WF.configured) return "";
  const bad = WF.error && isAdmin(), un = (WF.unmatched || []).length;
  return `<div class="banner ${bad ? "warn" : "info"}">Liaison WebFleet automatique · positions ${WF.posOk ? tr(agoTxt(msIso(WF.posOk))) : "en attente"} · trajets ${WF.tripsOk ? tr(agoTxt(msIso(WF.tripsOk))) : "en attente"}.
    ${bad ? ` <b>Dernière erreur :</b> ${esc(WF.error)}` : ""}${un && isAdmin() ? ` ${un} véhicule${un > 1 ? "s" : ""} Webfleet sans fiche : <a href="#parametres">voir Paramètres</a>.` : ""}</div>`;
}

/* ---------- carte Paramètres (administrateur) ---------- */
function wfCardShell() {
  if (!SERVER || !isAdmin()) return "";
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><h3 class="np">Liaison WEBFLEET</h3><div id="wf-box"><div class="muted">Chargement…</div></div></div></div>`;
}
const mapKeyHtml = s => `<div class="stack-s" style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px"><h4 class="np">Fond de carte (CARTO)</h4>
  <div class="small">${s.mapKey ? `Clé enregistrée <span class="mono">${esc(s.mapKey.slice(0, 4))}…${esc(s.mapKey.slice(-4))}</span> · la carte des positions utilise le fond CARTO Voyager (sombre en mode sombre).` : `<span class="chip warn">Aucune clé</span> La carte des positions affiche « API KEY REQUIRED ». Demandez une clé gratuite sur <b>carto.com/basemaps/apikey</b> (domaine : ways.support) puis collez-la ici.`}</div>
  <div class="row-g"><button class="btn" data-a="map-key">${s.mapKey ? "Changer la clé" : "Saisir la clé CARTO"}</button>${s.mapKey ? `<button class="btn danger" data-a="map-key-off">Retirer</button>` : ""}</div></div>`;
ACTIONS["map-key"] = () => {
  const m = modal(`${mHead("Clé du fond de carte CARTO")}<form autocomplete="off"><div class="body stack-s">${field("mk-key", "Clé API CARTO (basemaps)", "", { required: true, cls: "mono", ph: "collez la clé reçue par e-mail", autofocus: true })}
    <div class="hint">Gratuite jusqu'à 5 millions de tuiles par mois. Cette clé n'est pas secrète au sens d'un mot de passe : le navigateur doit l'envoyer avec chaque tuile, et CARTO la limite au domaine déclaré (ways.support). Elle ne marche donc pas dans l'aperçu sur claude.ai.</div>
    <div class="err" id="mk-err"></div></div><footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`, "sm");
  m.querySelector("form").onsubmit = async e => { e.preventDefault();
    try { await API.call("POST", "webfleet/mapkey", { key: val("mk-key").trim() }); closeModal(); await wfRefresh(); loadWf(); toast("Clé CARTO enregistrée : la carte des positions l'utilise"); }
    catch (x) { m.querySelector("#mk-err").textContent = tr(x.message); } };
};
ACTIONS["map-key-off"] = () => confirmBox("Retirer la clé CARTO ? La carte affichera de nouveau « API KEY REQUIRED ».", async () => { await API.call("POST", "webfleet/mapkey", { key: "" }); await wfRefresh(); loadWf(); }, "Retirer");
async function loadWf() {
  const box = document.getElementById("wf-box"); if (!box) return;
  const s = await wfRefresh();
  if (!s) { box.innerHTML = `<div class="err">${esc(tr("Le serveur ne répond pas."))}</div>`; return; }
  try { await loadWfBody(box, s); } finally { box.insertAdjacentHTML("beforeend", mapKeyHtml(s)); }
}
async function loadWfBody(box, s) {
  if (!s.configured) {
    box.innerHTML = `<div class="stack-s"><div>Positions, compteurs et trajets arrivent automatiquement depuis Webfleet. Les identifiants restent sur le serveur ways.support : ils ne sont jamais renvoyés au navigateur.</div>
      <ol class="small stack-s" style="margin:0;padding-left:18px"><li>Dans Webfleet : <b>Admin → Utilisateurs</b>, créez un utilisateur dédié (par ex. « erp-ways ») avec l'accès <b>WEBFLEET.connect</b> et le droit de voir tous les véhicules.</li>
      <li>Demandez une <b>clé API</b> à Webfleet (formulaire « Request an API key » sur webfleet.com) si votre compte n'en a pas encore.</li>
      <li>Saisissez ici le nom du compte Webfleet, cet utilisateur, son mot de passe et la clé API.</li>
      <li>Dans chaque fiche véhicule, le champ <b>ID WebFleet</b> doit contenir le n° d'objet Webfleet (le bouton « Tester » vous les liste).</li></ol>
      <div><button class="btn primary" data-a="wf-form">Saisir les identifiants Webfleet</button></div></div>`;
    return;
  }
  const un = s.unmatched || [];
  box.innerHTML = `<div class="stack-s"><dl class="kv"><dt>Compte</dt><dd><b>${esc(s.account)}</b> · utilisateur ${esc(s.username)}${s.hasApikey ? "" : ` · <span class="chip warn">sans clé API</span>`}</dd>
      <dt>Positions</dt><dd>${s.posOk ? `${esc(tr(agoTxt(msIso(s.posOk))))} · ${s.objects} objet${s.objects > 1 ? "s" : ""} Webfleet` : "pas encore synchronisées"}</dd>
      <dt>Trajets</dt><dd>${s.tripsOk ? esc(tr(agoTxt(msIso(s.tripsOk)))) : "pas encore synchronisés"} <span class="muted small">(toutes les 15 min, 30 derniers jours au premier passage)</span></dd></dl>
    ${s.error ? `<div class="banner warn"><b>Dernière erreur :</b> ${esc(s.error)}</div>` : ""}
    ${un.length ? `<div class="banner info">${un.length} véhicule${un.length > 1 ? "s" : ""} Webfleet sans fiche dans l'ERP : ${un.map(o => `<span class="mono">${esc(o.objectno)}</span> ${esc(o.objectname)}`).join(" · ")}. <div style="margin-top:8px"><button class="btn primary sm" data-a="wf-import-veh">Créer les fiches manquantes…</button></div></div>` : ""}
    <div class="muted small">La synchronisation tourne tant qu'au moins une personne a l'ERP ouvert ; à la réouverture, les trajets manqués sont rattrapés.</div>
    <div class="row-g wrap"><button class="btn primary" data-a="wf-sync">Synchroniser maintenant</button><button class="btn" data-a="wf-import-veh">Aligner les fiches sur WebFleet…</button><button class="btn" data-a="wf-test">Tester et voir les véhicules Webfleet</button><button class="btn" data-a="wf-form">Modifier les identifiants</button><button class="btn danger" data-a="wf-off">Déconnecter</button></div></div>`;
}
ACTIONS["wf-import-veh"] = async () => {
  let r; try { r = await API.call("POST", "webfleet/import-vehicles", {}); } catch (x) { toast(tr(x.message)); return; }
  const it = r.items || [], k = a => it.filter(x => x.action === a), cr = k("create"), ln = k("link"), rn = k("rename"), cf = k("conflict");
  if (!it.length) { toast("Toutes les fiches correspondent déjà à WebFleet"); return; }
  const act = { create: `<span class="chip good">Créer</span>`, link: `<span class="chip info">Relier</span>`, rename: `<span class="chip warn">Renommer</span>`, conflict: `<span class="chip bad">Conflit</span>` };
  const m = modal(`${mHead("Fiches véhicules ↔ WebFleet")}<div class="body stack-s">
    <div class="row-g wrap">${cr.length ? `<span class="chip good">${plural(cr.length, "fiche à créer", "fiches à créer")}</span>` : ""}${ln.length ? `<span class="chip info">${plural(ln.length, "fiche à relier", "fiches à relier")}</span>` : ""}${rn.length ? `<span class="chip warn">${plural(rn.length, "identifiant à aligner", "identifiants à aligner")}</span>` : ""}${cf.length ? `<span class="chip bad">${plural(cf.length, "conflit", "conflits")} à régler à la main</span>` : ""}</div>
    <div class="small muted">L'identifiant W.A.Y.S. de chaque fiche devient exactement le n° du véhicule dans WebFleet. Une fiche dont l'identifiant diffère est renommée ; son ancien identifiant reste réservé et ne sera jamais réutilisé. Si le n° WebFleet est déjà l'identifiant d'un autre véhicule (même supprimé), rien n'est fait pour cette ligne. Positions, compteurs et 30 jours de trajets suivent automatiquement.</div>
    <div class="tablewrap"><table class="small"><thead><tr><th>Action</th><th>Identifiant</th><th>Plaque</th><th>Modèle</th><th>Véhicule WebFleet</th></tr></thead><tbody>
    ${it.map(x => `<tr><td>${act[x.action] || ""}</td><td>${x.action === "rename" ? `<span class="muted mono">${esc(x.from || "—")}</span> → ` : ""}<span class="fleetno sm">${esc(x.fleetNo)}</span></td>
      <td class="mono">${x.plate ? esc(x.plate) : `<span class="chip warn">à compléter</span>`}</td><td>${esc(x.model || "") || `<span class="muted">—</span>`}</td><td><span class="mono">${esc(x.objectno)}</span> ${esc(x.objectname)}${x.why ? `<div class="small" style="color:var(--bad,#b42318)">${esc(x.why)}</div>` : ""}</td></tr>`).join("")}
    </tbody></table></div></div><footer><button class="btn" data-close>Annuler</button><button class="btn primary" id="wfi-go" ${it.length === cf.length ? "disabled" : ""}>Appliquer</button></footer>`, "lg");
  m.querySelector("#wfi-go").onclick = async e => { e.target.disabled = true; e.target.textContent = "En cours…";
    try { const g = await API.call("POST", "webfleet/import-vehicles", { go: true }); closeModal(); if (API.refresh) await API.refresh(); await wfRefresh(); loadWf(); render(true);
      const n = a => (g.items || []).filter(x => x.action === a).length;
      toast(`WebFleet : ${plural(n("create"), "fiche créée", "fiches créées")} · ${plural(n("link"), "reliée", "reliées")} · ${plural(n("rename"), "identifiant aligné", "identifiants alignés")}`); }
    catch (x) { e.target.disabled = false; e.target.textContent = "Appliquer"; toast(tr(x.message)); } };
};
ACTIONS["wf-form"] = () => {
  const s = WF || {}, has = !!s.configured;
  const m = modal(`${mHead("Identifiants Webfleet")}<form autocomplete="off"><div class="body stack-s"><div class="fields">
    ${field("wf-acc", "Compte Webfleet (account)", s.account || "", { required: !has })}${field("wf-usr", "Utilisateur WEBFLEET.connect", s.username || "", { required: !has })}
    ${field("wf-pwd", "Mot de passe", "", { type: "password", required: !has, ph: has ? "inchangé" : "" })}${field("wf-key", "Clé API", "", { type: "password", ph: has && s.hasApikey ? "inchangée" : "36 caractères" })}</div>
    <div class="hint">Enregistrés sur le serveur ways.support uniquement ; laissez un champ vide pour garder la valeur actuelle.</div><div class="err" id="wf-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" id="wf-go">Enregistrer et tester</button></footer></form>`);
  m.querySelector("#wf-pwd").setAttribute("autocomplete", "new-password");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const err = m.querySelector("#wf-err"), go = m.querySelector("#wf-go"); go.disabled = true; err.textContent = "";
    try {
      await API.call("POST", "webfleet/config", { account: val("wf-acc"), username: val("wf-usr"), password: m.querySelector("#wf-pwd").value, apikey: m.querySelector("#wf-key").value });
      closeModal(); await wfRefresh(); loadWf(); ACTIONS["wf-test"]();
    } catch (x) { err.textContent = tr(x.message); go.disabled = false; }
  };
};
ACTIONS["wf-test"] = async () => {
  const m = modal(`${mHead("Véhicules Webfleet")}<div class="body" id="wf-t"><div class="muted">Connexion à Webfleet…</div></div><footer><button class="btn" data-close>Fermer</button></footer>`, "lg");
  const box = m.querySelector("#wf-t");
  try {
    const r = await API.call("POST", "webfleet/test");
    const ok = r.objects.filter(o => o.vehicleId).length;
    box.innerHTML = `<div class="banner ${ok === r.objects.length ? "info" : "warn"}">Connexion réussie : ${r.objects.length} objet${r.objects.length > 1 ? "s" : ""} Webfleet, dont ${ok} relié${ok > 1 ? "s" : ""} à une fiche véhicule.</div>
      <div class="tablewrap"><table><thead><tr><th>N° Webfleet</th><th>Nom dans Webfleet</th><th>Fiche ERP</th></tr></thead><tbody>
      ${r.objects.map(o => { const v = o.vehicleId && veh(o.vehicleId); return `<tr><td class="mono">${esc(o.objectno)}</td><td>${esc(o.objectname)}</td><td>${v ? `<button class="linkbtn" data-a="veh-open" data-id="${v.id}">${noBadge(v, 1)} <span class="plate sm">${esc(v.plate)}</span></button>` : `<span class="muted small">aucune — mettez « ${esc(o.objectno)} » dans le champ ID WebFleet de la fiche</span>`}</td></tr>`; }).join("")}</tbody></table></div>`;
  } catch (e) { box.innerHTML = `<div class="err">${esc(tr(e.message))}</div><div class="hint">Vérifiez le compte, l'utilisateur, son mot de passe, la clé API et que l'utilisateur a bien l'accès WEBFLEET.connect.</div>`; }
};
ACTIONS["wf-sync"] = async el => {
  el.disabled = true; el.textContent = "Synchronisation…";
  const r = await wfTick(true);
  if (r && r.ok) toast(r.positions != null || r.trips != null ? `Synchronisé : ${r.positions ?? 0} position(s), ${r.trips ?? 0} trajet(s) mis à jour` : "Déjà à jour");
  else if (r) toast(tr(r.error || "Erreur"));
  loadWf();
};
ACTIONS["wf-off"] = () => confirmBox("Déconnecter Webfleet ? Les identifiants sont effacés du serveur ; positions et trajets déjà importés restent.", async () => { await API.call("POST", "webfleet/disconnect"); WF = null; loadWf(); }, "Déconnecter");
