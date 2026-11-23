"use strict";
/* ======================= VOYAGES DU PERSONNEL : VOLS ET HÔTELS =======================
   travel/<id> = { kind: flight|hotel, staffId, status: booked|cancel, notes, cost, currency,
                   flight : date, from, to, flightNo, dep, arr, pnr, airline
                   hotel  : hotelId, checkIn, checkOut, room, conf }
   hotels/<id> = { name, address, phone, email, contact, rate, currency, notes }
   « À organiser » : jours T (voyage) du roster sans vol réservé pour la personne ce jour-là (ou la veille / le lendemain).
   Le terrain ne voit que ses propres voyages (contrôlé sur le serveur). */
const trActive = x => x.status !== "cancel";
const trFlights = () => S.travel.filter(x => x.kind === "flight");
const trStays = () => S.travel.filter(x => x.kind === "hotel");
const hotelName = id => (S.hotels || []).find(h => h.id === id)?.name || "";
const nightsOf = x => x.checkIn && x.checkOut ? Math.max(0, daysBetween(x.checkIn, x.checkOut)) : 0;
/* nuits d'hôtel couvrant une date (arrivée incluse, départ exclu) */
const staysOn = date => trStays().filter(x => trActive(x) && x.checkIn && x.checkOut && x.checkIn <= date && date < x.checkOut);
/* jours T du roster (aujourd'hui → +60 j) sans vol réservé à ±1 jour */
function travelToBook(days = 60) {
  const out = [], end = addDays(today(), days);
  for (const r of S.roster) for (const [d, x] of Object.entries(r.days || {})) {
    if (!x || x.c !== "T") continue;
    const date = `${r.month}-${String(d).padStart(2, "0")}`; if (date < today() || date > end) continue;
    const p = staff(r.staffId); if (!p || p.active === false) continue;
    const du = typeof dutyFor === "function" ? dutyFor(r.staffId, date) : null;   // T d'un déplacement flight mech / outstation : vol dans la fiche duty
    const ok = du ? [du.out, du.back].some(f => f && (f.flightNo || f.pnr) && Math.abs(daysBetween(f.date || date, date)) <= 1)
      : trFlights().some(f => trActive(f) && f.staffId === r.staffId && f.date && Math.abs(daysBetween(f.date, date)) <= 1);
    if (!ok) out.push({ staffId: r.staffId, date });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || sName(a.staffId).localeCompare(sName(b.staffId)));
}

VIEWS.voyages = {
  render() {
    const tab = curTab("voyages", "vols"), tb = isOffice() ? travelToBook() : [], fut = trFlights().filter(f => trActive(f) && f.date >= today()), tonight = staysOn(today());
    return head("Voyages", isOffice() ? "Vols et hôtels du personnel" : "Mes vols et mes nuits d'hôtel",
      readOnly || !isOffice() ? "" : `<button class="btn" data-a="tr-form" data-kind="hotel">Réserver un hôtel</button><button class="btn primary" data-a="tr-form" data-kind="flight">Ajouter un vol</button>`) +
      `<div class="pipeline"><div class="panel tile c-blue"><div class="lbl">Vols à venir</div><div class="val">${fut.length}</div><div class="note">${fut.filter(f => f.date <= addDays(today(), 7)).length} dans les 7 jours</div></div>
        <div class="panel tile c-teal"><div class="lbl">À l'hôtel cette nuit</div><div class="val">${tonight.length}</div></div>
        ${isOffice() ? `<div class="panel tile c-orange ${tb.length ? "alert" : ""}"><div class="lbl">Voyages à organiser</div><div class="val">${tb.length}</div><div class="note">Jours T du roster sans vol</div></div>` : ""}</div>` +
      tabs("voyages", [["vols", "Vols", fut.length], ["sejours", "Hôtel", trStays().filter(x => trActive(x) && x.checkOut >= today()).length], ["duties", "Duties", dutyDocs().filter(x => trActive(x) && x.to >= today()).length], ...(isOffice() ? [["organiser", "À organiser", tb.length, tb.length > 0], ["hotels", "Hôtels", (S.hotels || []).length || ""], ["costs", "Costs"]] : [])]) +
      ({ vols: trFlightList, sejours: trStayList, duties: trDutyList, organiser: trToBookList, hotels: trHotelList, costs: trCostList })[tab]();
  }
};
const trPast = () => UI.filter === "passe";
function trFlightList() {
  const q = UI.q.toLowerCase(), past = trPast();
  const rows = trFlights().filter(f => (past ? f.date < today() : f.date >= today() || !f.date) && (!q || [sName(f.staffId), f.from, f.to, f.flightNo, f.pnr, f.airline].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => past ? String(b.date).localeCompare(String(a.date)) : String(a.date).localeCompare(String(b.date)) || String(a.dep || "").localeCompare(String(b.dep || "")));
  return `<div class="panel">${searchBar("Nom, aéroport, n° de vol, PNR…", [["tous", "À venir"], ["passe", "Passés"]])}
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Personne</th><th>Trajet</th><th>Vol</th><th>Horaires</th><th>PNR</th><th></th></tr></thead><tbody>${rows.map(f => `<tr class="click ${trActive(f) ? "" : "muted"}" data-a="tr-form" data-id="${f.id}">
      <td class="num">${fmtDate(f.date)}</td><td><b>${esc(sName(f.staffId))}</b>${demoTag(f)}</td><td class="mono">${esc(f.from || "?")} → ${esc(f.to || "?")}</td><td class="mono">${esc([f.airline, f.flightNo].filter(Boolean).join(" ") || "—")}</td>
      <td class="mono small">${esc([f.dep, f.arr].filter(Boolean).join(" → ") || "—")}</td><td class="mono small">${esc(f.pnr || "—")}</td><td>${trActive(f) ? "" : `<span class="chip">Annulé</span>`}</td></tr>`).join("")}</tbody></table>
      ${rows.length ? "" : `<div class="empty">${past ? "Aucun vol passé." : "Aucun vol à venir."}</div>`}</div></div>`;
}
function trStayList() {
  const past = trPast(), ym = UI.trMonth || today().slice(0, 7);
  const q = UI.q.toLowerCase(), rows = trStays().filter(x => (past ? x.checkOut < today() : x.checkOut >= today() || !x.checkOut) && (!q || [sName(x.staffId), hotelName(x.hotelId), x.room, x.conf].join(" ").toLowerCase().includes(q))).sort((a, b) => past ? String(b.checkIn).localeCompare(String(a.checkIn)) : String(a.checkIn).localeCompare(String(b.checkIn)));
  const days = ymDays(ym), hs = (S.hotels || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const grid = isOffice() && hs.length ? `<div class="panel"><div class="row-sb pad"><h3 class="np">Chambres occupées par nuit</h3><div class="row-g"><button class="btn sm" data-a="tr-month" data-n="-1" aria-label="Mois précédent">‹</button><b>${esc(fmtMonth(ym))}</b><button class="btn sm" data-a="tr-month" data-n="1" aria-label="Mois suivant">›</button></div></div>
    <div class="tablewrap"><table class="occ"><thead><tr><th>Hôtel</th>${Array.from({ length: days }, (_, i) => `<th class="r">${i + 1}</th>`).join("")}<th class="r">Nuits</th></tr></thead><tbody>${hs.map(h => { let tot = 0;
      return `<tr><td><b>${esc(h.name)}</b></td>${Array.from({ length: days }, (_, i) => { const d = `${ym}-${String(i + 1).padStart(2, "0")}`, n = staysOn(d).filter(x => x.hotelId === h.id).length; tot += n; return `<td class="r num ${n ? "" : "muted"}" title="${esc(staysOn(d).filter(x => x.hotelId === h.id).map(x => sName(x.staffId)).join(", "))}">${n || "·"}</td>`; }).join("")}<td class="r num"><b>${tot}</b></td></tr>`; }).join("")}</tbody></table></div></div>` : "";
  return `<div class="stack">${grid}<div class="panel">${searchBar("Nom, hôtel, chambre, confirmation…", [["tous", "En cours et à venir"], ["passe", "Passés"]])}
    <div class="tablewrap"><table><thead><tr><th>Personne</th><th>Hôtel</th><th>Check-in</th><th>Check-out</th><th class="r">Nuits</th><th>Chambre</th><th>Confirmation</th></tr></thead><tbody>${rows.map(x => `<tr class="click ${trActive(x) ? "" : "muted"}" data-a="tr-form" data-id="${x.id}">
      <td><b>${esc(sName(x.staffId))}</b>${demoTag(x)}</td><td>${esc(hotelName(x.hotelId) || "—")}</td><td class="num">${fmtDate(x.checkIn)}</td><td class="num">${fmtDate(x.checkOut)}</td><td class="r num">${nightsOf(x)}</td>
      <td class="mono small">${esc(x.room || "—")}</td><td class="mono small">${esc(x.conf || "—")}${trActive(x) ? "" : ` <span class="chip">Annulé</span>`}</td></tr>`).join("")}</tbody></table>
      ${rows.length ? "" : `<div class="empty">Aucune nuit d'hôtel ${past ? "passée" : "prévue"}.</div>`}</div></div></div>`;
}
const fmtMonth = ym => { try { return new Date(ym + "-01T12:00:00").toLocaleDateString(LANG === "en" ? "en-GB" : "fr-BE", { month: "long", year: "numeric" }); } catch { return ym; } };
ACTIONS["tr-month"] = el => { UI.trMonth = ymAdd(UI.trMonth || today().slice(0, 7), +el.dataset.n); render(true); };
function trToBookList() {
  const rows = travelToBook();
  return `<div class="panel"><div class="pad muted small">Jours T (voyage) des 60 prochains jours dans le roster, sans vol enregistré pour la personne ce jour-là, la veille ou le lendemain.</div>
    ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Personne</th><th>Fonction</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td class="num">${fmtDate(r.date)}</td><td><b>${esc(sName(r.staffId))}</b></td><td class="small">${esc(STAFF_FN[staff(r.staffId)?.function] || "")}</td>
      <td class="r">${readOnly ? "" : `${typeof dutyFor === "function" && dutyFor(r.staffId, r.date) ? `<button class="btn sm primary" data-a="duty-open" data-staff="${r.staffId}" data-date="${r.date}">${esc(tr("Open the duty sheet"))}</button>` : `<button class="btn sm primary" data-a="tr-form" data-kind="flight" data-staff="${r.staffId}" data-date="${r.date}">Ajouter le vol</button>`}`}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">Tous les jours de voyage du roster ont un vol.</div>`}</div>`;
}
function trHotelList() {
  const hs = (S.hotels || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="panel"><div class="row-sb pad"><h3 class="np">${plural(hs.length, "hôtel")}</h3>${readOnly ? "" : `<button class="btn primary sm" data-a="hotel-form">Ajouter un hôtel</button>`}</div>
    ${hs.length ? `<div class="tablewrap"><table><thead><tr><th>Hôtel</th><th>Adresse</th><th>Contact</th><th class="r">Tarif</th><th class="r">Ce soir</th></tr></thead><tbody>${hs.map(h => `<tr class="click" data-a="hotel-form" data-id="${h.id}">
      <td><b>${esc(h.name)}</b>${demoTag(h)}</td><td class="small">${esc(h.address || "")}</td><td class="small">${esc(h.contact || "")}${h.phone ? `<div class="muted">${esc(h.phone)}</div>` : ""}${h.email ? `<div class="muted">${esc(h.email)}</div>` : ""}</td>
      <td class="r num">${h.rate ? esc(h.rate + " " + (h.currency || "")) : "—"}</td><td class="r num">${staysOn(today()).filter(x => x.hotelId === h.id).length}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">Aucun hôtel. Ajoutez les hôtels où loge le personnel de la station.</div>`}</div>`;
}
ACTIONS["tr-form"] = el => {
  if (!isOffice() && !el.dataset.id) return;
  const x = S.travel.find(t => t.id === el.dataset.id) || (el.dataset.kind === "hotel" ? { kind: "hotel", status: "booked", checkIn: today(), checkOut: addDays(today(), 1) }
    : { kind: "flight", status: "booked", staffId: el.dataset.staff || "", date: el.dataset.date || today(), to: el.dataset.staff ? settings().stationCode || "TLV" : "" });
  const ro = readOnly || !isOffice(), crew = staffActive().slice().sort(staffSort), hs = (S.hotels || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const f = x.kind === "flight";
  const m = modal(`${mHead(f ? (x.id ? "Vol" : "Nouveau vol") : (x.id ? "Nuits d'hôtel" : "Réserver un hôtel"))}<form><div class="body"><fieldset ${ro ? "disabled" : ""} class="plain"><div class="fields">
    ${field("tr-staff", "Personne", x.staffId, { type: "select", required: true, options: [["", "Choisir…"], ...crew.map(p => [p.id, p.name])] })}
    ${f ? `${field("tr-date", "Date", x.date, { type: "date", required: true })}${field("tr-from", "De (aéroport)", x.from, { cls: "mono", ph: "BRU" })}${field("tr-to", "Vers (aéroport)", x.to, { cls: "mono", ph: "TLV" })}
      ${field("tr-air", "Compagnie", x.airline)}${field("tr-no", "N° de vol", x.flightNo, { cls: "mono", ph: "LY336" })}${field("tr-dep", "Départ (heure locale)", x.dep, { cls: "mono", ph: "08:15" })}${field("tr-arr", "Arrivée (heure locale)", x.arr, { cls: "mono", ph: "13:40" })}${field("tr-pnr", "PNR / réservation", x.pnr, { cls: "mono" })}`
      : `${field("tr-hotel", "Hôtel", x.hotelId, { type: "select", required: true, options: [["", hs.length ? "Choisir…" : "Ajoutez d'abord un hôtel (onglet Hôtels)"], ...hs.map(h => [h.id, h.name])] })}${field("tr-in", "Arrivée (check-in)", x.checkIn, { type: "date", required: true })}${field("tr-out", "Départ (check-out)", x.checkOut, { type: "date", required: true })}
      ${field("tr-room", "Chambre", x.room, { cls: "mono" })}${field("tr-conf", "N° de confirmation", x.conf, { cls: "mono" })}`}
    ${isOffice() ? `${field("tr-cost", "Coût", x.cost, { type: "number", step: "0.01" })}${field("tr-cur", "Devise", x.currency || "EUR", { type: "select", options: ["EUR", "USD", "ILS"].map(c => [c, c]) })}` : ""}</div>
    ${field("tr-notes", "Notes", x.notes, { type: "textarea", wide: true })}</fieldset>${f && x.staffId && typeof travelRosterNote === "function" ? travelRosterNote(x) : ""}<div class="err" id="tr-err"></div></div>
    <footer>${x.id && !ro ? `<div class="left"><button type="button" class="btn danger" data-a="tr-del" data-id="${x.id}">Supprimer</button>${trActive(x) ? ` <button type="button" class="btn" data-a="tr-cancel" data-id="${x.id}">Annulé</button>` : ""}</div>` : ""}<button type="button" class="btn" data-close>${ro ? "Fermer" : "Annuler"}</button>${ro ? "" : `<button class="btn primary">Enregistrer</button>`}</footer></form>`, "lg");
  if (ro) return;
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const d = Object.assign(strip(x), { staffId: val("tr-staff"), notes: val("tr-notes"), cost: +val("tr-cost") || 0, currency: val("tr-cur") || "EUR" });
    if (f) Object.assign(d, { date: val("tr-date"), from: val("tr-from").toUpperCase(), to: val("tr-to").toUpperCase(), airline: val("tr-air"), flightNo: val("tr-no").toUpperCase().replace(/\s+/g, ""), dep: val("tr-dep"), arr: val("tr-arr"), pnr: val("tr-pnr").toUpperCase() });
    else { if (val("tr-out") <= val("tr-in")) { m.querySelector("#tr-err").textContent = tr("Le départ doit être après l'arrivée."); return; } Object.assign(d, { hotelId: val("tr-hotel"), checkIn: val("tr-in"), checkOut: val("tr-out"), room: val("tr-room"), conf: val("tr-conf") }); }
    await save("travel", x.id, d); closeModal(); toast(f ? "Vol enregistré" : "Nuits d'hôtel enregistrées");
  };
};
ACTIONS["tr-cancel"] = el => confirmBox("Marquer cette réservation comme annulée ?", async () => { await patch("travel", el.dataset.id, { status: "cancel" }); closeModal(); }, "Annulée");
ACTIONS["tr-del"] = el => confirmBox("Supprimer cette réservation ?", () => remove("travel", el.dataset.id));
ACTIONS["hotel-form"] = el => {
  const h = (S.hotels || []).find(x => x.id === el.dataset.id) || { currency: "USD" };
  const ro = readOnly || !isOffice();
  const m = modal(`${mHead(h.id ? esc(h.name) : "Nouvel hôtel")}<form><div class="body"><fieldset ${ro ? "disabled" : ""} class="plain"><div class="fields">
    ${field("ho-name", "Nom", h.name, { required: true, wide: true })}${field("ho-addr", "Adresse", h.address, { wide: true })}${field("ho-contact", "Contact", h.contact)}${field("ho-phone", "Téléphone", h.phone)}${field("ho-email", "E-mail", h.email, { type: "email" })}
    ${field("ho-rate", "Tarif par nuit", h.rate, { type: "number", step: "0.01" })}${field("ho-cur", "Devise", h.currency, { type: "select", options: ["EUR", "USD", "ILS"].map(c => [c, c]) })}</div>
    ${field("ho-notes", "Notes (contrat, petit-déjeuner, navette…)", h.notes, { type: "textarea", wide: true })}</fieldset></div>
    <footer>${h.id && !ro ? `<div class="left"><button type="button" class="btn danger" data-a="hotel-del" data-id="${h.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>${ro ? "Fermer" : "Annuler"}</button>${ro ? "" : `<button class="btn primary">Enregistrer</button>`}</footer></form>`);
  if (ro) return;
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); await save("hotels", h.id, Object.assign(strip(h), { name: val("ho-name"), address: val("ho-addr"), contact: val("ho-contact"), phone: val("ho-phone"), email: val("ho-email"), rate: +val("ho-rate") || 0, currency: val("ho-cur"), notes: val("ho-notes") })); closeModal(); toast("Hôtel enregistré"); };
};
ACTIONS["hotel-del"] = el => { const n = trStays().filter(x => x.hotelId === el.dataset.id && trActive(x) && x.checkOut >= today()).length;
  confirmBox(n ? `${plural(n, "réservation")} en cours ou à venir dans cet hôtel. Supprimer quand même ?` : "Supprimer cet hôtel ?", async () => { await remove("hotels", el.dataset.id); closeModal(); }); };

WIDGETS.travel_next = { h: 7, t: "Voyages", ic: "🛫", c: "blue", m: "voyages", size: "m", d: "Prochains vols du personnel, nuits d'hôtel, jours de voyage sans vol.",
  r() { const fut = trFlights().filter(f => trActive(f) && f.date >= today()).sort((a, b) => a.date.localeCompare(b.date)), tb = isOffice() ? travelToBook().length : 0;
    return `<div class="w-stats">${wStat(fut.filter(f => f.date <= addDays(today(), 7)).length, "vols dans 7 j")}${wStat(staysOn(today()).length, "à l'hôtel ce soir")}${isOffice() ? wStat(tb, "à organiser", tb ? "warn" : "") : ""}</div>
      <div class="w-list">${fut.slice(0, 4).map(f => `<div class="list-row"><span><b>${esc(sName(f.staffId))}</b> <span class="mono small muted">${esc(f.from || "?")} → ${esc(f.to || "?")} ${esc(f.flightNo || "")}</span></span><span class="small">${fmtDate(f.date)}</span></div>`).join("") || wEmpty("Aucun vol à venir.")}</div>${wLink("voyages")}`; } };
