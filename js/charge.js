"use strict";
/* ======================= CHARGE SHEET =======================
   Même présentation que le fichier « TLV Work Report » : une ligne par prestation, un onglet par mois.
   chargeLines/<id> = { date, clientId, company, reg, rotation, type, workType, productId, task, description, qty, unit, price, currency,
                       reviewed, invoiced, src: { ho, item, part } }
   Rotation # = AAMMJJ-REGSANSTIRET-CODEnn (nn = numéro de la rotation du client dans le mois), comme dans le fichier.
   Les lignes se préparent depuis les shifts (forfait du client pour le type d'avion, heures, matériel) et se revoient avant l'envoi. */
const CH_TYPES = ["TLV Rotation", "Tech Assist", "Equipment", "Material", "Sheetmetal MHRS", "Expenses", "STORES", "Administration", "Escort fee"];
const KIND_TYPE = { forfait: "TLV Rotation", heure: "Tech Assist", materiel: "Equipment", autre: "Material" };
const chAmount = l => r2((+l.qty || 0) * (+l.price || 0));
const chMonth = () => UI.chMonth || (UI.chMonth = today().slice(0, 7));
const chLines = ym => S.chargeLines.filter(l => (l.date || "").startsWith(ym));
const digits = s => String(s || "").replace(/\D/g, "");
const chCode = c => c ? (c.code || c.name || "").toUpperCase() : "";
/* tarif : article du client d'abord, puis tarif général ; pour un forfait, même type d'avion et, si possible, même nature (Daily, Transit…) */
function chFindProduct(clientId, { kind, acType, text, name }) {
  const ps = S.products.filter(p => (!kind || p.kind === kind) && (!acType || !p.acType || digits(p.acType) === digits(acType)) && (!name || p.name.toLowerCase() === name.toLowerCase()));
  const own = ps.filter(p => p.clientId === clientId), pool = own.length ? own : ps.filter(p => !p.clientId);
  if (!text || pool.length < 2) return pool[0] || null;
  const t = text.toLowerCase(), words = ["daily", "etops", "edto", "weekly", "transit"];
  return pool.find(p => words.some(w => t.includes(w) && p.name.toLowerCase().includes(w))) || pool.find(p => p.name.toLowerCase().includes("transit")) || pool[0];
}
/* numéro de rotation : suite du client dans le mois (reprend les numéros déjà attribués) */
function chRotation(date, reg, clientId, taken) {
  const c = client(clientId), code = chCode(c) || "XX", ym = date.slice(0, 7);
  const used = [...S.chargeLines.filter(l => (l.date || "").startsWith(ym) && l.clientId === clientId).map(l => l.rotation), ...taken].map(r => { const m = new RegExp(code + "(\\d+)$").exec(r || ""); return m ? +m[1] : 0; });
  return `${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}-${String(reg || "").replace(/[^A-Z0-9]/gi, "").toUpperCase()}-${code}${pad(Math.max(0, ...used) + 1)}`;
}
const numQty = s => { const m = /(\d+(?:[.,]\d+)?)/.exec(String(s || "")); return m ? +m[1].replace(",", ".") : 0; };
/* propositions de lignes pour les shifts du mois qui n'ont pas encore de lignes */
function chProposals(ym) {
  const done = new Set(S.chargeLines.map(l => l.src && l.src.item + "|" + l.src.part).filter(Boolean)), out = [], taken = [], rotOf = {};
  const visits = S.shiftItems.filter(x => x.kind === "visit" && (x.ho || "").startsWith(ym) && x.reg).sort((a, b) => (a.ho + (a.arr || "")).localeCompare(b.ho + (b.arr || "")));
  for (const v of visits) {
    const date = v.ho.slice(0, 10), c = client(v.clientId) || clientOfReg(v.reg); if (!c) continue;
    const sameRot = S.chargeLines.find(l => l.src && l.src.item === v.id);
    const rot = sameRot ? sameRot.rotation : chRotation(date, v.reg, c.id, taken); taken.push(rot); rotOf[v.id] = rot;
    const base = { date, clientId: c.id, company: chCode(c), reg: v.reg, rotation: rot, currency: "EUR", reviewed: false, invoiced: false };
    if (!done.has(v.id + "|pkg")) { const p = chFindProduct(c.id, { kind: "forfait", acType: v.acType, text: [v.planned, v.done].join(" ") });
      out.push(Object.assign({}, base, { type: "TLV Rotation", workType: p ? p.name : "", productId: p ? p.id : "", description: (v.planned || "TRANSIT").toUpperCase().slice(0, 300), qty: 1, unit: p?.unit || "EA", price: p ? +p.price || 0 : 0, currency: p?.currency || "EUR", src: { ho: v.ho, item: v.id, part: "pkg" }, warn: p ? "" : "Aucun forfait trouvé pour ce client et ce type" })); }
    if (v.done && !done.has(v.id + "|crs")) { const p = chFindProduct(c.id, { name: "CRS MHRS" }) || chFindProduct(c.id, { kind: "heure" });
      out.push(Object.assign({}, base, { type: "Tech Assist", workType: p ? p.name : "CRS MHRS", productId: p ? p.id : "", description: v.done.slice(0, 1000), qty: numQty(v.mhrs) || null, unit: "Mhrs", price: p ? +p.price || 0 : 0, src: { ho: v.ho, item: v.id, part: "crs" } })); }
  }
  for (const e of S.shiftItems.filter(x => x.kind === "equip" && (x.ho || "").startsWith(ym) && !done.has(x.id + "|eq"))) {
    const c = S.clients.find(k => chCode(k) === String(e.user || "").toUpperCase()) || clientOfReg(e.reg); if (!c) continue;   // matériel de la station (CHALLENGE…) : pas facturé
    const p = chFindProduct(c.id, { name: e.item }) || chFindProduct(c.id, { kind: "materiel", text: e.item });
    const vis = visits.find(v => v.ho === e.ho && v.reg && v.reg === e.reg);
    out.push({ date: e.ho.slice(0, 10), clientId: c.id, company: chCode(c), reg: e.reg || "", rotation: vis ? rotOf[vis.id] || "" : "", type: p && p.kind === "materiel" ? "Equipment" : "Material", workType: p ? p.name : e.item, productId: p ? p.id : "",
      description: [e.item, e.note].filter(Boolean).join(" · "), qty: +e.qty || 1, unit: e.unit || p?.unit || "EA", price: p ? +p.price || 0 : 0, currency: p?.currency || "EUR", reviewed: false, invoiced: false, src: { ho: e.ho, item: e.id, part: "eq" }, warn: p ? "" : "Article sans tarif" });
  }
  return out;
}

VIEWS.charge = {
  render() {
    const ym = chMonth(), [y, m] = ym.split("-"), f = UI.filter, q = UI.q.toLowerCase();
    const all = chLines(ym), rows = all.filter(l => (f === "tous" || (f === "arevoir" ? !l.reviewed : l.clientId === f)) && (!q || [l.reg, l.rotation, l.workType, l.description, l.company].join(" ").toLowerCase().includes(q)))
      .sort((a, b) => (a.date + a.rotation + CH_TYPES.indexOf(a.type)).localeCompare(b.date + b.rotation + CH_TYPES.indexOf(b.type)));
    const props = chProposals(ym), tot = {};
    for (const l of all) { const k = (l.company || "?") + " " + (l.currency || "EUR"); tot[k] = (tot[k] || 0) + chAmount(l); }
    const cl = Array.from(new Set(all.map(l => l.clientId))).map(client).filter(Boolean);
    return head("Charge Sheet", "Prestations facturables du mois, préparées depuis les shifts et revues avant l'envoi à la finance",
      `<button class="btn" data-a="ch-export">Exporter (Excel)</button><button class="btn" data-a="ch-form" ${dis()}>Ajouter une ligne</button>${props.length ? `<button class="btn primary" data-a="ch-prep" ${dis()}>Préparer depuis les shifts (${props.length})</button>` : ""}`,
      `<div class="row-g"><button class="btn sm" data-a="ch-month" data-n="-1" aria-label="Mois précédent">‹</button><b class="rmonth">${MONTHS[+m - 1]} ${y}</b><button class="btn sm" data-a="ch-month" data-n="1" aria-label="Mois suivant">›</button></div>`) +
      `<div class="row-g wrap mb">${Object.entries(tot).map(([k, v]) => { const [code, cur] = k.split(" "); return `<div class="panel tile"><div class="lbl">${esc(code)}</div><div class="val num">${esc(new Intl.NumberFormat(LOCALES[LANG], { style: "currency", currency: cur || "EUR" }).format(v))}</div><div class="note">${plural(all.filter(l => l.company === code).length, "ligne")}</div></div>`; }).join("") || ""}
        <div class="panel tile ${all.some(l => !l.reviewed) ? "c-yellow" : ""}"><div class="lbl">À revoir</div><div class="val">${all.filter(l => !l.reviewed).length}</div><div class="note">sur ${all.length}</div></div></div>` +
      `<div class="panel">${searchBar("Rechercher une immatriculation, une rotation, une description…", [["tous", "Tout"], ["arevoir", "À revoir", all.some(l => !l.reviewed)], ...cl.map(c => [c.id, chCode(c)])])}
      <div class="tablewrap"><table class="chs"><thead><tr><th>Date</th><th>Company</th><th>Reg</th><th>Rotation #</th><th>Type</th><th>Work Type</th><th>Description</th><th class="r">Qty</th><th>Unit</th><th class="c">Reviewed</th><th class="c">Invoiced</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>
      ${rows.map(l => `<tr class="click" data-a="ch-form" data-id="${l.id}"><td class="num small">${esc(l.date.slice(8))}/${esc(l.date.slice(5, 7))}</td><td class="mono"><b>${esc(l.company)}</b></td><td class="mono">${esc(l.reg)}</td><td class="mono small">${esc(l.rotation)}</td>
        <td class="small">${esc(l.type)}</td><td class="small">${esc(l.workType)}${l.warn ? ` <span class="chip sm warn" title="${esc(tr(l.warn))}">!</span>` : ""}</td><td class="small pre chdesc">${esc(l.description)}</td><td class="r num">${l.qty ?? ""}</td><td class="small">${esc(l.unit || "")}</td>
        <td class="c"><input type="checkbox" data-chk="reviewed" data-id="${l.id}" ${l.reviewed ? "checked" : ""} ${dis()} aria-label="Reviewed"></td><td class="c"><input type="checkbox" data-chk="invoiced" data-id="${l.id}" ${l.invoiced ? "checked" : ""} ${dis()} aria-label="Invoiced"></td>
        <td class="r num">${fmtN.format(+l.price || 0)}</td><td class="r num"><b>${fmtN.format(chAmount(l))}</b></td></tr>`).join("")}
      </tbody></table>${rows.length ? "" : `<div class="empty">${all.length ? "Rien ne correspond." : props.length ? "Aucune ligne pour ce mois : cliquez sur « Préparer depuis les shifts »." : "Aucune ligne pour ce mois."}</div>`}</div></div>`;
  }
};
document.addEventListener("change", e => { const t = e.target; if (t.dataset && t.dataset.chk && t.dataset.id) patch("chargeLines", t.dataset.id, { [t.dataset.chk]: t.checked }); });
document.addEventListener("click", e => { if (e.target.dataset && e.target.dataset.chk) e.stopPropagation(); }, true);
ACTIONS["ch-month"] = el => { UI.chMonth = ymAdd(chMonth(), +el.dataset.n); render(true); };
ACTIONS["ch-prep"] = () => {
  const props = chProposals(chMonth());
  const m = modal(`${mHead("Préparer depuis les shifts")}<form><div class="body stack"><div class="hint">Lignes proposées d'après les avions et le matériel notés dans les shifts du mois. Décochez ce qui ne se facture pas. Tout reste « à revoir » jusqu'à votre contrôle.</div>
    <div class="tablewrap"><table class="small"><thead><tr><th></th><th>Date</th><th>Reg</th><th>Rotation #</th><th>Type</th><th>Work Type</th><th class="r">Qty</th><th class="r">Price</th></tr></thead><tbody>
    ${props.map((l, i) => `<tr><td><input type="checkbox" class="chp" value="${i}" checked></td><td class="num">${esc(l.date.slice(8))}/${esc(l.date.slice(5, 7))}</td><td class="mono">${esc(l.reg)}</td><td class="mono">${esc(l.rotation)}</td><td>${esc(l.type)}</td>
      <td>${esc(l.workType || "—")}${l.warn ? `<div class="txt-warn">${esc(tr(l.warn))}</div>` : ""}</td><td class="r num">${l.qty ?? ""}</td><td class="r num">${fmtN.format(l.price || 0)}</td></tr>`).join("")}</tbody></table></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Créer les lignes cochées</button></footer></form>`, "lg");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const pick = [...m.querySelectorAll(".chp:checked")].map(i => props[+i.value]);
    const btn = m.querySelector("button.primary"); btn.disabled = true;
    for (const l of pick) await save("chargeLines", null, l);
    closeModal(); toast(plural(pick.length, "ligne créée", "lignes créées"));
  };
};
ACTIONS["ch-form"] = el => {
  const l = S.chargeLines.find(x => x.id === el.dataset.id) || { date: today().slice(0, 7) === chMonth() ? today() : chMonth() + "-01", type: "TLV Rotation", qty: 1, unit: "EA", currency: "EUR" };
  const isNew = !l.id, prods = S.products.slice().sort((a, b) => (clientName(a.clientId) + a.name).localeCompare(clientName(b.clientId) + b.name, "fr"));
  const m = modal(`${mHead(isNew ? "Nouvelle ligne" : "Ligne · " + esc(l.rotation || l.reg || ""))}<form><div class="body stack"><div class="fields">
    ${field("cl-date", "Date", l.date, { type: "date", required: true })}${field("cl-client", "Client", l.clientId || "", { type: "select", options: clientOptions() })}${field("cl-reg", "Reg", l.reg, { cls: "mono" })}
    ${field("cl-rot", "Rotation #", l.rotation, { cls: "mono", ph: "AAMMJJ-REG-CODE01" })}${field("cl-type", "Type", l.type, { type: "select", options: Array.from(new Set([...CH_TYPES, l.type].filter(Boolean))).map(t => [t, t]) })}
    <label class="f wide">Work Type (article)<select id="cl-prod"><option value="">${esc(tr("— texte libre —"))}</option>${prods.map(p => `<option value="${p.id}" ${p.id === l.productId ? "selected" : ""}>${esc(p.name)}${p.clientId ? " · " + esc(chCode(client(p.clientId))) : ""} · ${fmtN.format(p.price || 0)} ${esc(p.currency || "EUR")}</option>`).join("")}</select></label>
    ${field("cl-wt", "Work Type (texte)", l.workType, { wide: true })}${field("cl-task", "Task", l.task)}
    ${field("cl-qty", "Qty", l.qty ?? "", { type: "number", step: "0.01" })}${field("cl-unit", "Unit", l.unit, { ph: "EA, Mhrs…" })}${field("cl-price", "Price", l.price ?? 0, { type: "number", step: "0.01" })}${field("cl-cur", "Devise", l.currency || "EUR", { type: "select", options: [["EUR", "EUR"], ["USD", "USD"], ["ILS", "ILS"]] })}</div>
    ${field("cl-desc", "Description (n° de WO du client…)", l.description, { type: "textarea" })}
    <div class="row-g"><label class="chk"><input type="checkbox" id="cl-rev" ${l.reviewed ? "checked" : ""}> Reviewed</label><label class="chk"><input type="checkbox" id="cl-inv" ${l.invoiced ? "checked" : ""}> Invoiced</label></div>
    ${l.src ? `<div class="hint">Préparée depuis le shift ${esc(shiftName(l.src.ho.slice(0, 10), l.src.ho.slice(11)))}.</div>` : ""}</div>
    <footer>${isNew ? "" : `<div class="left"><button type="button" class="btn danger" data-a="ch-del" data-id="${l.id}" ${dis()}>Supprimer</button></div>`}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "lg");
  const sel = m.querySelector("#cl-prod");
  sel.onchange = () => { const p = S.products.find(x => x.id === sel.value); if (!p) return; m.querySelector("#cl-wt").value = p.name; m.querySelector("#cl-price").value = p.price || 0; m.querySelector("#cl-cur").value = p.currency || "EUR"; if (p.unit) m.querySelector("#cl-unit").value = p.unit; if (KIND_TYPE[p.kind]) m.querySelector("#cl-type").value = KIND_TYPE[p.kind]; };
  m.querySelector("#cl-reg").onchange = () => { const c = clientOfReg(val("cl-reg")); if (c && !val("cl-client")) m.querySelector("#cl-client").value = c.id; };
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const c = client(val("cl-client"));
    const data = Object.assign(strip(l), { date: val("cl-date"), clientId: val("cl-client"), company: chCode(c), reg: val("cl-reg").toUpperCase(), rotation: val("cl-rot") || (c ? chRotation(val("cl-date"), val("cl-reg"), c.id, []) : ""), type: val("cl-type"),
      productId: val("cl-prod"), workType: val("cl-wt"), task: val("cl-task"), description: val("cl-desc"), qty: val("cl-qty") === "" ? null : +val("cl-qty"), unit: val("cl-unit"), price: +val("cl-price") || 0, currency: val("cl-cur"),
      reviewed: m.querySelector("#cl-rev").checked, invoiced: m.querySelector("#cl-inv").checked });
    delete data.warn; await save("chargeLines", l.id, data); closeModal(); toast("Ligne enregistrée");
  };
};
ACTIONS["ch-del"] = el => confirmBox("Supprimer cette ligne ?", () => remove("chargeLines", el.dataset.id));
ACTIONS["ch-export"] = async () => {
  const ym = chMonth(), ls = chLines(ym).sort((a, b) => (a.date + a.rotation + CH_TYPES.indexOf(a.type)).localeCompare(b.date + b.rotation + CH_TYPES.indexOf(b.type)));
  try { await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"); } catch { toast("Export Excel indisponible pour l'instant."); return; }
  const X = window.XLSX, rows = [["Date", "Company", "Reg", "Rotation #", "Type", "Work Type", "Task", "Description", "Qty", "Type", "Reviewed", "Invoiced", "Month", "Price", "Amount"]];
  for (const l of ls) rows.push([new Date(l.date + "T12:00:00"), l.company, l.reg, l.rotation, l.type, l.workType, l.task || "", l.description, l.qty ?? "", l.unit || "", l.reviewed ? "V" : "", l.invoiced ? "V" : "", new Date(ym + "-01T12:00:00"), +l.price || 0, chAmount(l)]);
  const ws = X.utils.aoa_to_sheet(rows, { cellDates: true }); ws["!cols"] = [10, 8, 9, 20, 12, 26, 8, 50, 6, 6, 9, 9, 10, 9, 10].map(w => ({ wch: w }));
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, `${MONTHS_L.en[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`.replace(/\./g, ""));
  await offerFile(`charge-sheet-${(settings().stationCode || "station").toLowerCase()}-${ym}.xlsx`, new Blob([X.write(wb, { bookType: "xlsx", type: "array", cellDates: true })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
};
