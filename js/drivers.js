"use strict";
/* ======================= chauffeurs : cartes et fiches =======================
   Noms : settings.drivers (listes de choix, tous les rôles).
   Fiches : collection drivers (bureau, administrateurs) — coordonnées, permis, lien WebFleet.
   WebFleet recopié dans fiche.wf (miroir, 6 h) ; l'envoi vers WebFleet se fait seulement par bouton. */
const WORKSTATE = { 1: "Temps libre", 2: "Pause", 3: "Disponibilité", 4: "Travail", 5: "Au volant", 6: "Autre travail" };
const DRV_FIELDS = [["name", "name"], ["phone", "telmobile"], ["phonePrivate", "telprivate"], ["email", "email"], ["company", "company"],
  ["street", "street"], ["zip", "zip"], ["city", "city"], ["country", "country"], ["cardId", "dt_cardid"], ["info", "description"]];
const DRV_LBL = { name: "Nom", phone: "GSM", phonePrivate: "Tél. privé", email: "E-mail", company: "Société", street: "Rue", zip: "Code postal", city: "Ville", country: "Pays", cardId: "Carte conducteur", info: "Informations complémentaires" };
const dUntil = d => Math.round((new Date(d + "T12:00:00") - new Date(today() + "T12:00:00")) / 864e5);
const nk = s => String(s || "").trim().toLowerCase();
const drvRec = name => (S.drivers || []).find(d => nk(d.name) === nk(name));
const canWfPush = () => !!(SERVER && API && !readOnly && !SBX && isOffice() && typeof WF !== "undefined" && WF && WF.configured);
/* différences fiche ERP ↔ WebFleet (champs que WebFleet connaît) */
const drvDiff = d => !d || !d.wf ? [] : DRV_FIELDS.filter(([k, w]) => nk(d[k]) !== nk(d.wf[w]) && (d[k] || d.wf[w])).map(([k, w]) => ({ k, erp: d[k] || "", wf: d.wf[w] || "" }));
const vehOfObject = no => { if (!no) return null; const p = (S.vehPos || []).find(x => x.objectno === no); return veh(p?.id) || S.vehicles.find(v => v.webfleetId && nk(v.webfleetId) === nk(no)) || null; };
/* au volant en ce moment : position WebFleet « en route » avec ce chauffeur (signal de moins de 30 min), ou état « Au volant » */
function drvDriving(n, d) {
  const fresh = p => p && p.at && Date.now() - new Date(p.at).getTime() < 30 * 60000;
  const p = (S.vehPos || []).find(x => x.state === "route" && fresh(x) && x.driver && nk(x.driver) === nk(n));
  if (p) return { v: veh(p.id), p };
  if (d?.wf?.workstate === 5 && d.wf.objectno) { const v = vehOfObject(d.wf.objectno); if (v) return { v, p: posOf(v.id) }; }
  return null;
}
/* amendes du chauffeur : lien par fiche (driverId) ou, pour les anciennes, par le nom */
const finesOf = (n, d) => (S.fines || []).filter(f => (d?.id && f.driverId === d.id) || (!f.driverId && nk(f.driver) === nk(n)));
const fineActive = f => typeof fineStage !== "function" || fineStage(f) !== "reglee";
const drvInit = n => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join("");

function driversCard() {
  const names = (settings().drivers || []).slice();
  for (const d of S.drivers || []) if (d.name && !names.some(n => nk(n) === nk(d.name))) names.push(d.name);
  const q = nk(UI.q), demoDs = settings().demoDrivers || [], found = driversFound(), wfNames = settings().wfDrivers || [];
  const hay = ({ n, d }) => { const dv = drvDriving(n, d), cur = d?.wf?.objectno ? vehOfObject(d.wf.objectno) : null;
    return [n, d?.wf?.driverno, d?.driverNo, d?.phone, d?.phonePrivate, d?.email, d?.company, d?.city, d?.cardId, d?.licenseNo, d?.info, dv?.v?.plate, cur?.plate, cur && fleetNo(cur)].join(" ").toLowerCase(); };
  const qd = q.replace(/[\s.\/-]/g, "");
  const all = names.map(n => ({ n, d: drvRec(n) }));
  const list = all.filter(x => { if (!q) return true; const h = hay(x); return h.includes(q) || (qd.length >= 4 && h.replace(/[\s.\/-]/g, "").includes(qd)); })
    .sort((a, b) => !!drvDriving(b.n, b.d) - !!drvDriving(a.n, a.d) || a.n.localeCompare(b.n));
  const nDrive = all.filter(x => drvDriving(x.n, x.d)).length;
  const gone = list.filter(x => x.d?.wfGone), act = list.filter(x => !x.d?.wfGone);
  const office = isOffice();
  const card = ({ n, d }) => {
    const u = driverUse(n), wf = d?.wf, dv = drvDriving(n, d), now = dv?.v || (wf?.objectno ? vehOfObject(wf.objectno) : null);
    const fa = finesOf(n, d).filter(fineActive).length;
    const last = !now ? S.driverLogs.filter(l => l.driver === n).sort((a, b) => (b.date + (b.at || "")).localeCompare(a.date + (a.at || "")))[0] : null;
    const lv = last ? veh(last.vehicleId) : null;
    const lic = d?.licenseExpiry ? dUntil(d.licenseExpiry) : null;
    const st = lic != null && lic < 0 ? "bad" : lic != null && lic <= 60 ? "warn" : "good";
    const diff = office ? drvDiff(d).length : 0;
    return `<button class="dcard st-${st} ${dv ? "driving" : ""} ${d?.wfGone ? "gone" : ""}" data-a="driver-form" data-name="${esc(n)}"${dv ? ` title="${esc(tr("Au volant en ce moment"))}"` : ""}>
      <span class="dc-av">${esc(drvInit(n))}</span>
      <span class="dc-b"><span class="dc-n">${esc(n)}${demoDs.includes(n) ? demoTag({ demo: true }) : ""}</span>
        <span class="dc-chips">${(d?.garageIds || []).map(id => `<span class="chip orange" title="${esc(tr("Chauffeur de ce garage"))}">🔧 ${esc(typeof garageName === "function" ? garageName(id) : "")}</span>`).join("")}${d?.wfGone ? `<span class="chip" title="${esc(tr("Absent de la liste des chauffeurs actifs de WebFleet depuis le"))} ${esc(fmtDate(d.wfGone.slice(0, 10)))}">${esc(tr("Désactivé"))}</span>` : ""}${dv ? `<span class="chip good">${esc(tr("En route"))}${dv.p?.speed ? " · " + Math.round(dv.p.speed) + " km/h" : ""}</span>` : ""}${fa ? `<span class="chip bad">${plural(fa, "amende active", "amendes actives")}</span>` : ""}${wf || wfNames.includes(n) ? `<span class="chip" title="${esc(tr("Synchronisé depuis WebFleet"))}">WebFleet${wf?.driverno ? " · " + esc(wf.driverno) : ""}</span>` : ""}${diff ? `<span class="chip warn" title="${esc(tr("La fiche de l'ERP et WebFleet diffèrent"))}">≠ WebFleet</span>` : ""}</span>
        <span class="dc-l small">${now ? `🚗 <b>${esc(now.plate || fleetNo(now))}</b>${dv?.p?.address ? " · " + esc(dv.p.address) : wf?.workstate ? " · " + esc(tr(WORKSTATE[wf.workstate] || "")) : ""}` : lv ? `<span class="muted">${esc(tr("Dernier véhicule"))} :</span> ${esc(lv.plate || fleetNo(lv))} · ${fmtDate(last.date)}` : `<span class="muted">${esc(tr("Aucune prise en charge"))}</span>`}</span>
        ${d?.phone || d?.email ? `<span class="dc-l small muted">${esc([d.phone, d.email].filter(Boolean).join(" · "))}</span>` : ""}
        ${lic != null && lic <= 60 ? `<span class="dc-l small"><span class="chip ${st === "bad" ? "bad" : "warn"}">${esc(tr(lic < 0 ? "Permis expiré" : "Permis expire"))} · ${fmtDate(d.licenseExpiry)}</span></span>` : ""}
        <span class="dc-l small muted">${plural(u.logs, "prise en charge", "prises en charge")}${u.fines ? " · " + plural(u.fines, "amende") : ""}${u.faults ? " · " + plural(u.faults, "panne signalée", "pannes signalées") : ""}</span></span></button>`;
  };
  return `<div class="stack" style="grid-template-columns:minmax(0,1fr)">
    ${searchBar("Nom, n° WebFleet, téléphone, société, e-mail, plaque…")}
    <div class="row-sb wrap"><div class="muted small">${plural(act.length, "chauffeur")}${gone.length ? ` actif${act.length > 1 ? "s" : ""} · ${gone.length} désactivé${gone.length > 1 ? "s" : ""}` : ""}${q && list.length !== all.length ? ` sur ${all.length}` : ""}${nDrive ? ` · <b class="ok-t">${plural(nDrive, "au volant", "au volant")} en ce moment</b>` : ""}</div>
      <div class="seg" role="group" aria-label="${esc(tr("Affichage"))}">${[["cartes", "Cartes"], ["liste", "Liste"]].map(([k, l]) => `<button data-a="drv-view" data-v="${k}" class="${(UI.drvView || "cartes") === k ? "on" : ""}" aria-pressed="${(UI.drvView || "cartes") === k}">${l}</button>`).join("")}</div></div>
    <div class="row-sb wrap"><div class="muted small" style="max-width:640px">Proposés pour les prises de véhicule, les amendes et les signalements de panne. Les chauffeurs WebFleet s'ajoutent automatiquement (un chauffeur supprimé ici n'est pas réajouté).${office ? " Cliquez sur une carte pour ouvrir la fiche." : ""}</div>
      <button class="btn primary" data-a="driver-form" ${dis()}>Ajouter un chauffeur</button></div>
    ${found.length ? `<div class="banner info row-sb wrap"><span>${plural(found.length, "nom trouvé", "noms trouvés")} dans les fiches véhicules et les prises en charge : ${found.slice(0, 6).map(esc).join(", ")}${found.length > 6 ? "…" : ""}</span><button class="btn sm" data-a="driver-import" ${dis()}>Les ajouter</button></div>` : ""}
    ${!list.length ? `<div class="panel empty">${q ? "Aucun chauffeur ne correspond à la recherche." : "Aucun chauffeur enregistré."}</div>`
      : (act.length ? (UI.drvView === "liste" ? drvTable(act, office) : `<div class="dcards">${act.map(card).join("")}</div>`) : `<div class="panel empty">Aucun chauffeur actif ne correspond.</div>`)
        + (gone.length ? `<details class="drv-gone" id="drv-gone" ${UI.drvGoneOpen || (q && !act.length) ? "open" : ""}><summary>${esc(tr("Désactivés dans WebFleet"))} (${gone.length})</summary>
          <div class="small muted" style="margin:6px 0 10px">Ces chauffeurs ne sont plus dans la liste des chauffeurs actifs de WebFleet. Leur fiche, leurs amendes et leurs trajets restent consultables ; Axel ne les reconnaît plus sur WhatsApp. S'ils sont réactivés dans WebFleet, ils remontent automatiquement.</div>
          ${UI.drvView === "liste" ? drvTable(gone, office) : `<div class="dcards">${gone.map(card).join("")}</div>`}</details>` : "")}</div>`;
}

document.addEventListener("toggle", e => { if (e.target && e.target.id === "drv-gone") UI.drvGoneOpen = e.target.open; }, true);
ACTIONS["drv-view"] = el => { UI.drvView = el.dataset.v; try { localStorage.setItem("ways-drv-view", el.dataset.v); } catch {} render(true); };
try { UI.drvView = localStorage.getItem("ways-drv-view") || "cartes"; } catch {}
function drvTable(list, office) {
  return `<div class="panel"><div class="tablewrap"><table class="drv-tbl"><thead><tr><th>Chauffeur</th>${office ? "<th>N° WebFleet</th><th>GSM</th><th>E-mail</th><th>Société</th>" : ""}<th>Véhicule</th>${office ? "<th>Permis</th>" : ""}<th class="r">Amendes actives</th><th class="r">Prises en charge</th></tr></thead><tbody>
    ${list.map(({ n, d }) => { const dv = drvDriving(n, d), wf = d?.wf, now = dv?.v || (wf?.objectno ? vehOfObject(wf.objectno) : null), fa = finesOf(n, d).filter(fineActive).length, u = driverUse(n);
      const lic = d?.licenseExpiry ? dUntil(d.licenseExpiry) : null;
      return `<tr class="click ${dv ? "drv-on" : ""} ${d?.wfGone ? "gone" : ""}" data-a="driver-form" data-name="${esc(n)}"><td class="nowrap"><b>${esc(n)}</b>${d?.wfGone ? ` <span class="chip">${esc(tr("Désactivé"))}</span>` : ""}${dv ? ` <span class="chip good">${esc(tr("En route"))}</span>` : ""}${office && drvDiff(d).length ? ` <span class="chip warn" title="${esc(tr("La fiche de l'ERP et WebFleet diffèrent"))}">≠</span>` : ""}</td>
        ${office ? `<td class="mono small">${esc(wf?.driverno || d?.driverNo || "—")}</td><td class="nowrap small">${d?.phone ? `<a href="tel:${esc(d.phone.replace(/\s/g, ""))}" data-stop>${esc(d.phone)}</a>` : "—"}</td><td class="small">${d?.email ? `<a href="mailto:${esc(d.email)}" data-stop>${esc(d.email)}</a>` : "—"}</td><td class="small">${esc(d?.company || "—")}</td>` : ""}
        <td class="small nowrap">${now ? `<span class="plate sm">${esc(now.plate || fleetNo(now))}</span>${dv?.p?.speed ? " · " + Math.round(dv.p.speed) + " km/h" : ""}` : "—"}</td>
        ${office ? `<td class="small nowrap">${d?.licenseExpiry ? `<span class="${lic < 0 ? "chip bad" : lic <= 60 ? "chip warn" : ""}">${fmtDate(d.licenseExpiry)}</span>` : "—"}</td>` : ""}
        <td class="r">${fa ? `<span class="chip bad">${fa}</span>` : "—"}</td><td class="r num">${u.logs || "—"}</td></tr>`; }).join("")}</tbody></table></div></div>`;
}
/* historique des trajets d'un chauffeur : la page Trajets, filtrée sur lui */
ACTIONS["drv-trips"] = el => {
  const f = tripF(); Object.assign(f, { driver: el.dataset.name, view: "trajets", veh: [] });
  UI.q = ""; UI.tripLim = 150; closeModal(); UI.tab = Object.assign(UI.tab || {}, { flotte: "trajets" });
  if (location.hash !== "#flotte") location.hash = "#flotte"; render(true); window.scrollTo(0, 0);
};
function drvTripsHtml(n) {
  if (!n || typeof allTrips !== "function") return "";
  const ts = allTrips().filter(t => nk(t.driver) === nk(n)), from = addDays(today(), -29), last = ts.filter(t => (t.start || "").slice(0, 10) >= from);
  const km = last.reduce((a, t) => a + (+t.km || 0), 0);
  return `<div class="row-sb wrap"><div><h4 class="np">Trajets</h4><div class="small muted">${ts.length ? `30 derniers jours : ${plural(last.length, "trajet")} · ${fmtN.format(Math.round(km))} km${ts.length > last.length ? ` · ${plural(ts.length, "trajet")} en tout` : ""}` : "Aucun trajet WebFleet pour ce chauffeur."}</div></div>
    <button type="button" class="btn sm" data-a="drv-trips" data-name="${esc(n)}">Historique trajets</button></div>`;
}
/* renommage : le nom est repris partout où il apparaît */
async function renameDriver(old, name) {
  const ds = settings().drivers || [];
  await saveSettings({ drivers: ds.some(d => d === old) ? ds.map(d => d === old ? name : d) : [...ds, name], demoDrivers: (settings().demoDrivers || []).map(d => d === old ? name : d) });
  if (!old || old === name) return;
  for (const v of S.vehicles.filter(v => v.driver === old)) await patch("vehicles", v.id, { driver: name });
  for (const l of S.driverLogs.filter(l => l.driver === old)) await patch("driverLogs", l.id, { driver: name });
  for (const f of (S.fines || []).filter(f => f.driver === old)) await patch("fines", f.id, { driver: name });
  for (const f of S.faults.filter(f => f.reporter === old)) await patch("faults", f.id, { reporter: name });
}

ACTIONS["driver-form"] = el => {
  const old = el.dataset.name || "", ds = settings().drivers || [];
  const office = isOffice();
  const u = old ? driverUse(old) : null, n = u ? u.veh + u.logs + u.fines + u.faults : 0;
  if (!office) {   // terrain : le nom seulement (coordonnées réservées au bureau)
    const m = modal(`${mHead(old ? "Renommer le chauffeur" : "Nouveau chauffeur")}<form><div class="body stack-s">${field("dv-name", "Nom et prénom", old, { required: true, autofocus: true })}
      ${old && n ? `<div class="muted small">Le nom sera aussi corrigé dans ${plural(n, "fiche")} où il apparaît (véhicules, prises en charge, amendes, pannes).</div>` : ""}<div class="err" id="dv-err"></div></div>
      <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "sm");
    m.querySelector("form").onsubmit = async e => { e.preventDefault();
      const name = val("dv-name").replace(/\s+/g, " ").trim(); if (!name) return;
      if (name !== old && ds.some(d => nk(d) === nk(name))) { m.querySelector("#dv-err").textContent = "Ce chauffeur existe déjà."; return; }
      await renameDriver(old, name); closeModal(); render(true); toast(old ? "Chauffeur enregistré" : "Chauffeur ajouté"); };
    return;
  }
  const d = (old && drvRec(old)) || { name: old, country: "BE" }, wf = d.wf || null, diff = drvDiff(d);
  const lastLogs = old ? S.driverLogs.filter(l => l.driver === old).sort((a, b) => (b.date + (b.at || "")).localeCompare(a.date + (a.at || ""))).slice(0, 5) : [];
  const now = wf?.objectno ? vehOfObject(wf.objectno) : null;
  const m = modal(`${mHead(old ? esc(old) : "Nouveau chauffeur")}<form autocomplete="off"><div class="body stack">
    ${d?.wfGone ? `<div class="banner warn small">${esc(tr("Désactivé dans WebFleet"))} : absent de la liste des chauffeurs actifs depuis le ${esc(fmtDate(d.wfGone.slice(0, 10)))}. La fiche reste dans l'ERP ; elle redevient active d'elle-même s'il est réactivé dans WebFleet.</div>` : ""}
    ${wf ? `<div class="banner info small">Lié à WebFleet (chauffeur n° <b>${esc(wf.driverno || "—")}</b>)${now ? ` · actuellement sur <b>${esc(now.plate || fleetNo(now))}</b>${wf.workstate ? " (" + esc(tr(WORKSTATE[wf.workstate] || "")) + ")" : ""}` : ""}${wf.syncedAt ? ` · lu le ${esc(fmtDT(wf.syncedAt))}` : ""}</div>` : ""}
    ${diff.length ? `<div class="banner warn small"><b>La fiche de l'ERP et WebFleet diffèrent :</b> ${diff.map(x => `${esc(tr(DRV_LBL[x.k]))} — ERP : ${esc(x.erp || "vide")} · WebFleet : ${esc(x.wf || "vide")}`).join(" ; ")}${canWfPush() ? `. « Envoyer à WebFleet » y reprend les valeurs de l'ERP.` : ""}</div>` : ""}
    <div class="fields">
      ${field("dv-name", "Nom et prénom", d.name, { required: true, autofocus: !old })}${field("dv-company", "Société", d.company)}
      ${field("dv-phone", "GSM", d.phone, { type: "tel" })}${field("dv-phone2", "Téléphone privé", d.phonePrivate, { type: "tel" })}
      ${field("dv-email", "E-mail", d.email, { type: "email" })}${field("dv-country", "Pays (code ISO, ex. BE)", d.country, { ph: "BE" })}
      ${field("dv-street", "Rue et numéro", d.street)}${field("dv-zip", "Code postal", d.zip)}${field("dv-city", "Ville", d.city)}
      ${field("dv-lic", "N° de permis", d.licenseNo, { cls: "mono" })}${field("dv-licx", "Permis valable jusqu'au", d.licenseExpiry, { type: "date" })}
      ${field("dv-cats", "Catégories de permis", d.licenseCats, { ph: "B, BE, C…" })}${field("dv-card", "N° carte conducteur (tachygraphe)", d.cardId, { cls: "mono" })}
      ${wf ? "" : field("dv-wfno", "N° chauffeur WebFleet (pour le créer dans WebFleet)", d.driverNo, { cls: "mono", ph: "ex. 042" })}
      ${field("dv-info", "Informations complémentaires (partagées avec WebFleet)", d.info, { type: "textarea", wide: true })}
      ${field("dv-notes", "Note interne (reste dans l'ERP, jamais envoyée à WebFleet)", d.notes, { type: "textarea", wide: true })}</div>
    ${drvTripsHtml(old)}
    ${drvFinesHtml(old, d)}
    ${old && n ? `<div class="muted small">Un changement de nom est repris dans ${plural(n, "fiche")} où il apparaît (véhicules, prises en charge, amendes, pannes).</div>` : ""}
    ${lastLogs.length ? `<div><h4 class="np">Dernières prises en charge</h4>${lastLogs.map(l => { const v = veh(l.vehicleId); return `<div class="small"><span class="num muted">${fmtDate(l.date)}</span> · ${esc(v ? v.plate || fleetNo(v) : "—")}${l.km ? " · " + fmtN.format(l.km) + " km" : ""}</div>`; }).join("")}</div>` : ""}
    ${d.id && typeof histBox === "function" ? histBox("drivers", d.id) : ""}
    <div class="err" id="dv-err"></div></div>
    <footer>${old ? `<div class="left"><button type="button" class="btn danger" data-a="driver-del" data-name="${esc(old)}" ${dis()}>Supprimer</button></div>` : ""}
      ${canWfPush() && old && d.id ? `<button type="button" class="btn" id="dv-push" title="Remplace dans WebFleet les coordonnées par celles de cette fiche">${wf ? "Envoyer à WebFleet" : "Créer dans WebFleet"}</button>` : ""}
      <button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "lg");
  const collect = () => {
    const name = val("dv-name").replace(/\s+/g, " ").trim();
    const data = Object.assign({}, strip(d), { name, company: val("dv-company"), phone: val("dv-phone"), phonePrivate: val("dv-phone2"), email: val("dv-email"),
      country: val("dv-country").toUpperCase().slice(0, 2), street: val("dv-street"), zip: val("dv-zip"), city: val("dv-city"), licenseNo: val("dv-lic"), licenseExpiry: val("dv-licx"),
      licenseCats: val("dv-cats"), cardId: val("dv-card"), info: val("dv-info"), notes: val("dv-notes") });
    if (!wf) data.driverNo = val("dv-wfno");
    return data;
  };
  const store = async () => {
    const data = collect(), err = m.querySelector("#dv-err");
    if (!data.name) { err.textContent = "Le nom est obligatoire."; return null; }
    if (nk(data.name) !== nk(old) && ((settings().drivers || []).some(x => nk(x) === nk(data.name)) || (S.drivers || []).some(x => x.id !== d.id && nk(x.name) === nk(data.name)))) { err.textContent = "Ce chauffeur existe déjà."; return null; }
    const id = await save("drivers", d.id || "drv-" + uid(), data);
    await renameDriver(old, data.name);
    return Object.assign({ id }, data);
  };
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const r = await store(); if (!r) return;
    closeModal(); render(true); toast(old ? "Fiche chauffeur enregistrée" : "Chauffeur ajouté");
    if (canWfPush() && r.wf && drvDiff(r).length) wfDriverAsk(r);
  };
  const pb = m.querySelector("#dv-push");
  if (pb) pb.onclick = async () => { pb.disabled = true; const r = await store(); if (!r) { pb.disabled = false; return; } closeModal(); wfDriverPush(r); };
};
function drvFinesHtml(n, d) {
  if (!n) return "";
  const fs = finesOf(n, d).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const act = fs.filter(fineActive), old = fs.filter(f => !fineActive(f));
  const row = f => { const st = typeof fineStage === "function" ? fineStage(f) : "", nx = typeof fineNext === "function" ? fineNext(f) : null, v = veh(f.vehicleId);
    return `<button type="button" class="list-row fine-mini" data-a="fine-form" data-id="${esc(f.id)}"><span><span class="num muted">${fmtDate(f.date)}</span> · <b>${esc((typeof FINE_TYPES !== "undefined" && FINE_TYPES[f.type]) || f.type || "Amende")}</b>${v ? ` · <span class="plate sm">${esc(v.plate)}</span>` : ""}${f.place ? ` <span class="muted small">${esc(f.place)}</span>` : ""}
      ${nx ? `<span class="small muted"> · ${esc(nx.label)} avant le ${fmtDate(nx.date)}</span>` : ""}</span>
      <span class="row-g nowrap">${f.amount ? `<span class="num">${eur(f.amount)}</span>` : ""}${st && typeof FINE_ST !== "undefined" ? `<span class="chip ${FINE_ST[st][1]}">${esc(FINE_ST[st][0])}</span>` : ""}</span></button>`; };
  return `<div class="stack-s"><h4 class="np">Amendes ${act.length ? `<span class="chip bad">${act.length} active${act.length > 1 ? "s" : ""}</span>` : ""}</h4>
    ${act.length ? act.map(row).join("") : `<div class="muted small">Aucune amende active.</div>`}
    ${old.length ? `<details class="fines-old"><summary class="small">${plural(old.length, "amende clôturée", "amendes clôturées")} (réglées ou annulées)</summary><div class="stack-s" style="margin-top:6px">${old.map(row).join("")}</div></details>` : ""}</div>`;
}
function wfDriverAsk(d) {
  const diff = drvDiff(d);
  const m = modal(`${mHead("Mettre aussi WebFleet à jour ?")}<div class="body stack-s">
    <div>La fiche de <b>${esc(d.name)}</b> diffère de WebFleet :</div>
    <ul class="small" style="margin:0">${diff.map(x => `<li>${esc(tr(DRV_LBL[x.k]))} : WebFleet <s>${esc(x.wf || "vide")}</s> → <b>${esc(x.erp || "vide")}</b></li>`).join("")}</ul>
    <div class="muted small">Rien n'est envoyé sans votre accord. Si vous ne l'envoyez pas, WebFleet garde ses valeurs et la carte reste marquée « ≠ WebFleet ».</div></div>
    <footer><button class="btn" data-close>Pas maintenant</button><button class="btn primary" id="wd-go">Envoyer à WebFleet</button></footer>`, "sm");
  m.querySelector("#wd-go").onclick = () => { closeModal(); wfDriverPush(d); };
}
async function wfDriverPush(d) {
  try { const r = await API.call("POST", "webfleet/push-driver", { id: d.id }); toast(`WebFleet : fiche de ${d.name} ${r.action}`); }
  catch (e) { alertBox(tr(e.message)); }
}
const alertBox = msg => modal(`${mHead("WebFleet")}<div class="body"><div>${esc(msg)}</div></div><footer><button class="btn primary" data-close>OK</button></footer>`, "sm");

ACTIONS["driver-del"] = el => {
  const name = el.dataset.name, u = driverUse(name), rec = drvRec(name);
  const m = modal(`${mHead("Supprimer le chauffeur")}<div class="body stack-s">
    <div>Retirer <b>${esc(name)}</b> de la liste des chauffeurs${rec ? " et supprimer sa fiche" : ""} ?</div>
    <div class="muted small">L'historique est conservé : ses prises en charge, amendes et signalements gardent son nom.${rec?.wf ? " Rien n'est supprimé dans WebFleet, et il ne sera pas réimporté." : ""}</div>
    ${u.veh ? `<label class="chk line"><input type="checkbox" id="dd-unassign" checked> Le retirer aussi ${u.veh > 1 ? `des ${u.veh} véhicules` : "du véhicule"} qui lui ${u.veh > 1 ? "sont attribués" : "est attribué"}</label>` : ""}
    <label class="chk confirm-chk"><input type="checkbox" id="dr-ok"> Je confirme la suppression de <b>${esc(name)}</b></label></div>
    <footer><button class="btn" data-close>Annuler</button><button class="btn primary danger-bg" id="dr-yes" disabled>Supprimer</button></footer>`, "sm");
  const ok = m.querySelector("#dr-ok"), yes = m.querySelector("#dr-yes");
  ok.onchange = () => yes.disabled = !ok.checked;
  yes.onclick = async () => {
    if (!ok.checked) return; yes.disabled = true;
    const unassign = u.veh && m.querySelector("#dd-unassign")?.checked; closeModal();
    await saveSettings({ drivers: (settings().drivers || []).filter(d => d !== name), demoDrivers: (settings().demoDrivers || []).filter(d => d !== name) });
    if (rec) await remove("drivers", rec.id);
    if (unassign) for (const v of S.vehicles.filter(v => !v.retired && v.driver === name)) await patch("vehicles", v.id, { driver: "", driverDate: "" });
    render(true); toast("Chauffeur supprimé");
  };
};

/* ---------- véhicules : corriger le compteur / envoyer la fiche à WebFleet ---------- */
const wfLinked = v => !!(v && ((typeof posOf === "function" && posOf(v.id)?.objectno) || v.webfleetId));
const wfOdo = v => +((typeof posOf === "function" && posOf(v.id)?.odometer) || 0);
/* écart entre le relevé saisi dans l'ERP et le compteur WebFleet (≥ 1 km) */
const odoGap = v => wfOdo(v) && +v.km && Math.abs(+v.km - wfOdo(v)) >= 1;
function wfOdoNote(v) {
  if (!canWfPush() || !wfLinked(v) || !odoGap(v) || v.retired) return "";
  return `<div class="note">Saisi : ${fmtN.format(Math.round(+v.km))} km · <button class="linkbtn small" data-a="wf-odo" data-id="${v.id}">Corriger WebFleet</button></div>`;
}
function wfOdoAsk(v, km, after) {
  const odo = wfOdo(v), p = posOf(v.id);
  const m = modal(`${mHead("Corriger le compteur dans WebFleet")}<form><div class="body stack-s">
    <div><span class="plate">${esc(v.plate || "")}</span> ${esc(v.model || "")}</div>
    <dl class="kv sm"><dt>WebFleet indique</dt><dd class="num">${odo ? fmtN.format(odo) + " km" : "—"}${p?.at ? ` <span class="muted small">(${esc(agoTxt(p.at))})</span>` : ""}</dd><dt>Relevé de l'ERP</dt><dd class="num">${+v.km ? fmtN.format(+v.km) + " km" : "—"}</dd></dl>
    ${field("wo-km", "Compteur à envoyer à WebFleet (km)", Math.round((km || +v.km || odo) * 10) / 10, { type: "number", step: "0.1", min: 0, required: true })}
    <div class="hint">WebFleet remplace son compteur par cette valeur et note un « trajet de correction ». L'ERP repart aussitôt de la même valeur. À faire si le compteur du tableau de bord du véhicule est différent de WebFleet.</div>
    <div class="err" id="wo-err"></div></div>
    <footer><button type="button" class="btn" data-close>Ne pas corriger</button><button class="btn primary" id="wo-go">Corriger dans WebFleet</button></footer></form>`, "sm");
  const done = () => { if (after) after(); };
  m.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => setTimeout(done, 0)));
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const go = m.querySelector("#wo-go"), err = m.querySelector("#wo-err"), k = +val("wo-km");
    if (!(k > 0)) { err.textContent = "Kilométrage invalide."; return; }
    if (odo && Math.abs(k - odo) > 20000 && !confirm(tr(`Écart de ${fmtN.format(Math.round(Math.abs(k - odo)))} km avec WebFleet. Confirmer ?`))) return;
    go.disabled = true; err.textContent = "";
    try {
      await API.call("POST", "webfleet/push-vehicle", { id: v.id, odometer: k });
      const pp = posOf(v.id); if (pp) pp.odometer = k; const vv = veh(v.id); if (vv) vv.km = k;
      closeModal(); toast(`Compteur corrigé dans WebFleet : ${fmtN.format(k)} km`); render(true); done();
    } catch (x) { err.textContent = tr(x.message); go.disabled = false; }
  };
}
ACTIONS["wf-odo"] = el => { const v = veh(el.dataset.id); if (v) wfOdoAsk(v, null, () => openVehicle(v.id)); };
ACTIONS["wf-veh-push"] = el => {
  const v = veh(el.dataset.id); if (!v) return;
  const rows = [["Immatriculation", v.plate], ["Année", v.year], ["Puissance", v.kw ? v.kw + " kW" : ""], ["Cylindrée", v.cc ? fmtN.format(v.cc) + " cc" : ""],
    ["Carburant", /^(diesel|essence)$/i.test(v.fuel || "") ? v.fuel : ""]].filter(r => r[1]);
  const m = modal(`${mHead("Envoyer la fiche à WebFleet")}<div class="body stack-s">
    <div>Ces données de la fiche <span class="plate">${esc(v.plate || "")}</span> remplaceront celles de WebFleet :</div>
    ${rows.length ? `<dl class="kv sm">${rows.map(([l, x]) => `<dt>${esc(tr(l))}</dt><dd>${esc(x)}</dd>`).join("")}</dl>` : `<div class="muted">Rien à envoyer : la fiche est vide.</div>`}
    <div class="muted small">Le nom du véhicule dans WebFleet (${esc(posOf(v.id)?.objectno || v.webfleetId || "")}) n'est pas modifié : l'ERP s'en sert pour reconnaître le véhicule. Le n° de châssis n'est pas envoyé (WebFleet le lit lui-même sur les boîtiers reliés au véhicule). Pour le compteur, utilisez « Corriger WebFleet ».</div>
    <div class="err" id="wv-err"></div></div>
    <footer><button class="btn" data-close>Annuler</button><button class="btn primary" id="wv-go" ${rows.length ? "" : "disabled"}>Envoyer</button></footer>`, "sm");
  m.querySelector("#wv-go").onclick = async () => {
    const go = m.querySelector("#wv-go"); go.disabled = true;
    try { const r = await API.call("POST", "webfleet/push-vehicle", { id: v.id, details: true }); closeModal(); toast("WebFleet mis à jour : " + r.sent.join(", ")); openVehicle(v.id); }
    catch (x) { m.querySelector("#wv-err").textContent = tr(x.message); go.disabled = false; }
  };
};
