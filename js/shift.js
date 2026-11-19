"use strict";
/* ======================= SHIFTS ET HANDOVER =======================
   Une fiche par shift (jour 08-20, nuit 20-08, heure de la station), avec les 5 sections du handover Notion
   approuvé par l'autorité : 1. travail non terminé, 2. travail prévu / fait par avion, 3. équipement et matériel,
   4. Station Control (contrôles de fin de shift), 5. manpower et signatures des chefs d'équipe.
   handovers/<AAAA-MM-JJ>-<day|night> = { date, shift, foreman, extra[], checks{}, out{by,at}, in{by,at} }
   shiftItems/<id> = { ho, kind: todo|visit|equip, … } (une ligne = un document : plusieurs personnes saisissent en même temps)
   Le bouton Notion écrit la page du shift sous la page Notion choisie dans Paramètres (api/notion.php). Rien ici ne remplace la CRS dans AMOS. */
const SHIFTS = { day: "Jour (08-20)", night: "Nuit (20-08)" };
/* contrôles du handover approuvé (modifiables dans Paramètres), écrits dans Notion deux par ligne */
const STATION_CHECKS = ["Tool Check Per MOE 2.6.5", "Temp / Humidity Per MOE 2.3.1", "Cleanliness of Office", "Line Vans Cleaned and Restocked"];
const stationChecks = () => { const s = String(settings().stationChecks || "").split("\n").map(x => x.trim()).filter(Boolean); return s.length ? s : STATION_CHECKS; };
const hoId = (date, sh) => `${date}-${sh}`;
const hoDoc = id => S.handovers.find(h => h.id === id);
const hoItems = (id, kind) => S.shiftItems.filter(x => x.ho === id && (!kind || x.kind === kind)).sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.arr || "").localeCompare(String(b.arr || "")));
const prevShift = (date, sh) => sh === "night" ? [date, "day"] : [addDays(date, -1), "night"];
const nextShift = (date, sh) => sh === "day" ? [date, "night"] : [addDays(date, 1), "day"];
/* shift en cours à l'heure de la station (fuseau des paramètres, sinon celui de l'appareil) */
function currentShift() {
  let d = new Date(), date = today(), h = d.getHours();
  try { if (settings().timeZone) { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: settings().timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
    date = `${p.year}-${p.month}-${p.day}`; h = +p.hour % 24; } } catch { }
  return h >= 20 ? [date, "night"] : h < 8 ? [addDays(date, -1), "night"] : [date, "day"];
}
const shiftName = (date, sh) => `${fmtDate(date)} · ${tr(SHIFTS[sh])}`;
const sName = id => staff(id)?.name || "?";
/* contrôle des qualifications d'un avion : au moins un CRS qualifié sur le type, et avec I pour un 4X- */
function visitCheck(v) {
  if (!v.acType) return { ok: true, msg: "" };
  const crs = (v.crs || []).map(staff).filter(Boolean), is4X = /^4X/i.test(v.reg || "");
  if (!crs.length) return { ok: false, msg: "Aucun CRS affecté" };
  if (!crs.some(p => rated(p, v.acType))) return { ok: false, msg: `Aucun CRS qualifié ${v.acType}` };
  if (is4X && !crs.some(p => hasI(p, v.acType))) return { ok: false, msg: `4X- : aucun CRS avec I sur ${v.acType}` };
  return { ok: true, msg: "" };
}
const hoClosed = h => !!(h && h.in && h.in.at);

VIEWS.shift = {
  after() { if (SERVER && !FR24) fr24Status().then(s => { if (s && s.configured) render(true); }); if (SERVER && !NOTION) notionStatus().then(s => { if (s && s.configured) render(true); }); if (SERVER && !OD) odStatus(); },
  render() {
    if (!UI.shift) UI.shift = currentShift();
    const [date, sh] = UI.shift, id = hoId(date, sh), h = hoDoc(id) || {}, cur = currentShift(), isCur = cur[0] === date && cur[1] === sh;
    const visits = hoItems(id, "visit"), bad = visits.filter(v => !visitCheck(v).ok).length;
    return head("Shift", "Planning des avions et handover : les 5 sections du handover de la station", "",
      `<div class="row-g wrap"><button class="btn sm" data-a="shift-go" data-n="-1" aria-label="Shift précédent">‹</button><b class="rmonth">${esc(shiftName(date, sh))}</b><button class="btn sm" data-a="shift-go" data-n="1" aria-label="Shift suivant">›</button>
        <input type="date" id="shift-date" value="${esc(date)}" aria-label="Date"><div class="seg">${Object.keys(SHIFTS).map(k => `<button data-a="shift-sh" data-sh="${k}" class="${k === sh ? "on" : ""}">${k === "day" ? "Jour" : "Nuit"}</button>`).join("")}</div>
        ${isCur ? `<span class="chip good">Shift en cours</span>` : `<button class="btn sm" data-a="shift-now">Shift en cours</button>`}
        ${h.notion?.url ? `<a class="btn sm" href="${esc(h.notion.url)}" target="_blank" rel="noopener" title="${esc(tr("Envoyé par") + " " + (h.notion.by || "") + " · " + fmtDT(h.notion.at))}">Page Notion ↗</a>` : ""}
        ${NOTION && NOTION.configured && h.date && !readOnly ? `<button class="btn sm" data-a="ho-notion" data-ho="${id}">${h.notion?.url ? "Renvoyer vers Notion" : "Envoyer vers Notion"}</button>` : ""}</div>`) +
      (hoClosed(h) ? `<div class="banner good">Handover terminé : remis par ${esc(h.out?.by || "?")} et repris par ${esc(h.in.by)} (${fmtDT(h.in.at)}).</div>` : "") +
      (bad ? `<div class="banner warn">${plural(bad, "avion")} sans CRS qualifié affecté : voir la section 2.</div>` : "") +
      shiftTodo(id, date, sh) + shiftVisits(id) + shiftEquip(id) + shiftChecks(id, h) + shiftCrew(id, date, sh, h);
  }
};
const hoEd = id => !readOnly && (!hoClosed(hoDoc(id)) || isOffice());
const sec = (n, title, sub, actions, body) => `<section class="panel ho-sec"><div class="pad row-sb"><div><h3><span class="ho-n">${n}</span>${title}</h3>${sub ? `<div class="muted small">${sub}</div>` : ""}</div><div class="row-g">${actions || ""}</div></div>${body}</section>`;

/* 1. travail non terminé */
function shiftTodo(id, date, sh) {
  const rows = hoItems(id, "todo"), ed = hoEd(id), pid = hoId(...prevShift(date, sh));
  const prevOpen = [...hoItems(pid, "todo").filter(x => !x.done), ...hoItems(pid, "visit").filter(v => v.open)].filter(x => !rows.some(r => r.from === x.id));
  return sec(1, "Travail non terminé", "Ce qui reste à faire, repris par le shift suivant.", ed ? `${prevOpen.length ? `<button class="btn sm" data-a="todo-carry" data-id="${id}" data-prev="${pid}">Reprendre du shift précédent (${prevOpen.length})</button>` : ""}<button class="btn sm" data-a="todo-form" data-ho="${id}">Ajouter</button>` : "",
    rows.length ? `<div class="tablewrap"><table><thead><tr><th style="width:40px"></th><th>Avion</th><th>Travail</th><th>Remarque</th></tr></thead><tbody>${rows.map(x => `<tr class="${ed ? "click" : ""} ${x.done ? "muted" : ""}" ${ed ? `data-a="todo-form" data-ho="${id}" data-id="${x.id}"` : ""}>
      <td><input type="checkbox" data-a="todo-done" data-id="${x.id}" ${x.done ? "checked" : ""} ${ed ? "" : "disabled"} aria-label="Fait"></td><td class="mono"><b>${esc(x.reg || "")}</b></td><td class="pre">${esc(x.text || "")}</td><td class="small">${esc(x.note || "")}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="pad muted">Rien en attente.</div>`);
}
ACTIONS["todo-form"] = el => {
  const x = S.shiftItems.find(i => i.id === el.dataset.id) || { kind: "todo", ho: el.dataset.ho };
  const m = modal(`${mHead(x.id ? "Travail non terminé" : "Nouveau travail non terminé")}<form><div class="body"><div class="fields">
    ${field("td-reg", "Immatriculation", x.reg, { cls: "mono", ph: "9H-ABC" })}${field("td-text", "Travail à faire", x.text, { type: "textarea", wide: true, required: true })}${field("td-note", "Remarque", x.note, { wide: true })}</div></div>
    <footer>${x.id ? `<div class="left"><button type="button" class="btn danger" data-a="item-del" data-id="${x.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); await save("shiftItems", x.id, Object.assign(strip(x), { reg: val("td-reg").toUpperCase(), text: val("td-text"), note: val("td-note"), order: x.order || Date.now() })); closeModal(); };
};
document.addEventListener("change", e => { const t = e.target; if (t.dataset && t.dataset.a === "todo-done") patch("shiftItems", t.dataset.id, { done: t.checked }); });
ACTIONS["todo-done"] = () => { };
ACTIONS["todo-carry"] = async el => {
  const id = el.dataset.id, pid = el.dataset.prev, have = hoItems(id, "todo").map(r => r.from);
  const src = [...hoItems(pid, "todo").filter(x => !x.done).map(x => ({ reg: x.reg, text: x.text, note: x.note, from: x.id })),
    ...hoItems(pid, "visit").filter(v => v.open).map(v => ({ reg: v.reg, text: v.openText || v.planned || "", note: v.notes || "", from: v.id }))].filter(x => !have.includes(x.from));
  for (const [i, x] of src.entries()) await save("shiftItems", null, Object.assign({ kind: "todo", ho: id, order: Date.now() + i }, x));
  toast(plural(src.length, "travail repris", "travaux repris"));
};
ACTIONS["item-del"] = el => confirmBox("Supprimer cette ligne ?", () => remove("shiftItems", el.dataset.id));

/* 2. travail prévu / fait par avion */
function shiftVisits(id) {
  const rows = hoItems(id, "visit"), ed = hoEd(id);
  return sec(2, "Travail du shift (prévu et fait)", "Un avion par ligne. Le client est retrouvé par l'immatriculation. La CRS se fait dans AMOS.", (FR24 && FR24.configured && rows.length ? `<button class="btn sm" data-a="fr24-track" data-ho="${id}">Flightradar24</button>` : "") + (ed ? `<button class="btn sm primary" data-a="visit-form" data-ho="${id}">Ajouter un avion</button>` : ""),
    rows.length ? `<div class="tablewrap"><table><thead><tr><th>Avion</th><th>ARR / DEP (UTC)</th><th>CRS</th><th>Mécanos</th><th>Prévu</th><th>Fait</th><th>MHRS</th><th>ATL</th></tr></thead><tbody>${rows.map(v => { const ck = visitCheck(v), c = clientOfReg(v.reg);
      return `<tr class="${ed ? "click" : ""}" ${ed ? `data-a="visit-form" data-ho="${id}" data-id="${v.id}"` : ""}><td><b class="mono">${esc(v.reg || "")}</b> <span class="muted small">${esc(v.acType || "")}</span><div class="muted small">${esc(c ? c.code || c.name : "")}${(v.scans || []).length ? ` · <span title="${esc(tr("Scans dans OneDrive"))}">📎 ${v.scans.length}</span>` : ""}</div>${ck.ok ? "" : `<span class="chip sm bad">${esc(ck.msg)}</span>`}${v.open ? ` <span class="chip sm warn">Non terminé</span>` : ""}</td>
        <td class="mono small">${esc(v.arr || "—")} / ${esc(v.dep || "—")}${fr24Line(v)}</td><td class="small">${(v.crs || []).map(s => esc(sName(s))).join("<br>") || "—"}</td><td class="small">${(v.mech || []).map(s => esc(sName(s))).join("<br>") || "—"}</td>
        <td class="small pre">${esc(v.planned || "")}</td><td class="small pre">${esc(v.done || "")}</td><td class="mono small">${esc(v.mhrs || "")}</td><td class="mono small">${esc(v.atl || "")}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="pad muted">Aucun avion pour ce shift.</div>`);
}
function staffPick(id, label, sel, list) {
  return `<div class="f wide"><span>${label}</span><div class="pick" id="${id}">${list.map(p => `<label class="chk"><input type="checkbox" value="${p.id}" ${sel.includes(p.id) ? "checked" : ""}> ${esc(p.name)} <span class="muted small">${esc(Object.entries(p.ratings || {}).map(([t, l]) => t + " " + l).join(" · "))}</span></label>`).join("")}</div></div>`;
}
const picked = (m, id) => [...m.querySelectorAll(`#${id} input:checked`)].map(i => i.value);
ACTIONS["visit-form"] = el => {
  const v = S.shiftItems.find(i => i.id === el.dataset.id) || { kind: "visit", ho: el.dataset.ho, crs: [], mech: [] };
  const h = hoDoc(v.ho) || {}, [date, sh] = [v.ho.slice(0, 10), v.ho.slice(11)];
  const crew = Array.from(new Set([...onShift(date, sh).map(p => p.id), ...(h.extra || []), ...(v.crs || []), ...(v.mech || [])])).map(staff).filter(Boolean).sort(staffSort);
  const others = staffActive().filter(p => !crew.includes(p)).sort(staffSort);
  const certs = crew.filter(p => (p.licences || []).length || Object.keys(p.ratings || {}).length);
  const m = modal(`${mHead(v.id ? "Avion · " + esc(v.reg) : "Nouvel avion")}<form><div class="body stack"><div class="fields">
    ${field("vi-reg", "Immatriculation", v.reg, { cls: "mono", ph: "9H-ABC", required: true, autofocus: true })}${field("vi-ac", "Type d'avion", v.acType || "", { type: "select", options: [["", "—"], ...acTypes().map(t => [t, t])] })}
    ${field("vi-arr", "ARR (UTC)", v.arr, { ph: "14:35", cls: "mono" })}${field("vi-dep", "DEP (UTC)", v.dep, { ph: "17:10", cls: "mono" })}
    ${field("vi-flt", "Vol / rotation", v.flight, { cls: "mono", ph: "Rotation, n° de vol…" })}${field("vi-mhrs", "MHRS", v.mhrs, { cls: "mono", ph: "1EA, 2.5…" })}${field("vi-atl", "LOG PAGE / ATL n°", v.atl, { cls: "mono" })}${field("vi-cht", "CHT covers", v.cht)}</div>
    <div class="muted small" id="vi-client"></div>
    ${staffPick("vi-crs", "CRS (affectés à cet avion)", v.crs || [], certs.length ? certs : crew)}${staffPick("vi-mech", "Mécanos / aides", v.mech || [], crew)}
    ${others.length ? `<label class="f">Ajouter quelqu'un qui n'est pas au roster de ce shift<select id="vi-add"><option value="">—</option>${others.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>` : ""}
    ${field("vi-plan", "Travail prévu", v.planned, { type: "textarea" })}${field("vi-done", "Travail fait", v.done, { type: "textarea" })}${field("vi-notes", "Notes", v.notes, { type: "textarea" })}
    <label class="chk"><input type="checkbox" id="vi-open" ${v.open ? "checked" : ""}> Travail non terminé : à reprendre par le shift suivant</label>
    <div class="err" id="vi-warn"></div>${v.id ? odScansHtml(v) : ""}</div>
    <footer>${v.id ? `<div class="left"><button type="button" class="btn danger" data-a="item-del" data-id="${v.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "lg");
  const cur = () => ({ reg: val("vi-reg").toUpperCase(), acType: val("vi-ac"), crs: picked(m, "vi-crs") });
  const upd = () => { const c = clientOfReg(val("vi-reg")); m.querySelector("#vi-client").textContent = c ? tr("Client") + " : " + c.name + (c.code ? " (" + c.code + ")" : "") : "";
    const ck = visitCheck(cur()); m.querySelector("#vi-warn").textContent = ck.ok ? "" : tr(ck.msg); };
  if (v.id) odWire(m, v);
  m.querySelector("#vi-reg").oninput = upd; m.querySelector("#vi-ac").onchange = upd; m.querySelector("#vi-crs").onchange = upd; upd();
  const add = m.querySelector("#vi-add");
  if (add) add.onchange = () => { const p = staff(add.value); if (!p) return; for (const box of ["vi-crs", "vi-mech"]) m.querySelector("#" + box).insertAdjacentHTML("beforeend", `<label class="chk"><input type="checkbox" value="${p.id}"> ${esc(p.name)}</label>`); add.querySelector(`option[value="${p.id}"]`).remove(); add.value = ""; };
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const c = clientOfReg(val("vi-reg"));
    await save("shiftItems", v.id, Object.assign(strip(v), cur(), { clientId: c ? c.id : "", arr: val("vi-arr"), dep: val("vi-dep"), flight: val("vi-flt"), mhrs: val("vi-mhrs"), atl: val("vi-atl"), cht: val("vi-cht"),
      mech: picked(m, "vi-mech"), planned: val("vi-plan"), done: val("vi-done"), notes: val("vi-notes"), open: m.querySelector("#vi-open").checked, order: v.order || Date.now() }));
    closeModal(); toast("Avion enregistré");
  };
};

/* 3. équipement et matériel */
function shiftEquip(id) {
  const rows = hoItems(id, "equip"), ed = hoEd(id);
  return sec(3, "Équipement et matériel", "Équipements et consommables utilisés, par client ou utilisateur.", ed ? `<button class="btn sm" data-a="equip-form" data-ho="${id}">Ajouter</button>` : "",
    rows.length ? `<div class="tablewrap"><table><thead><tr><th>Client / utilisateur</th><th>Avion</th><th>Équipement ou matériel</th><th class="r">Quantité</th><th>Remarque</th></tr></thead><tbody>${rows.map(x => `<tr class="${ed ? "click" : ""}" ${ed ? `data-a="equip-form" data-ho="${id}" data-id="${x.id}"` : ""}>
      <td class="mono"><b>${esc(x.user || "")}</b></td><td class="mono">${esc(x.reg || "")}</td><td>${esc(x.item || "")}</td><td class="r num">${esc(x.qty ?? "")} ${esc(x.unit || "")}</td><td class="small">${esc(x.note || "")}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="pad muted">Rien de noté.</div>`);
}
ACTIONS["equip-form"] = el => {
  const x = S.shiftItems.find(i => i.id === el.dataset.id) || { kind: "equip", ho: el.dataset.ho, qty: 1 };
  const users = Array.from(new Set(["CHALLENGE", ...S.clients.map(c => c.code).filter(Boolean), ...S.shiftItems.filter(i => i.kind === "equip").map(i => i.user).filter(Boolean)]));
  const items = Array.from(new Set([...S.products.filter(p => ["materiel", "autre"].includes(p.kind)).map(p => p.name), ...S.shiftItems.filter(i => i.kind === "equip").map(i => i.item).filter(Boolean)]));
  const m = modal(`${mHead(x.id ? "Équipement et matériel" : "Nouvel équipement ou matériel")}<form><div class="body"><div class="fields">
    <label class="f">Client / utilisateur<input id="eq-user" class="mono" list="eq-users" value="${esc(x.user || "")}" required></label><datalist id="eq-users">${users.map(u => `<option value="${esc(u)}">`).join("")}</datalist>
    ${field("eq-reg", "Avion (si applicable)", x.reg, { cls: "mono" })}
    <label class="f wide">Équipement ou matériel<input id="eq-item" list="eq-items" value="${esc(x.item || "")}" required></label><datalist id="eq-items">${items.map(u => `<option value="${esc(u)}">`).join("")}</datalist>
    ${field("eq-qty", "Quantité", x.qty, { type: "number", step: "0.01" })}${field("eq-unit", "Unité", x.unit, { ph: "EA, HR…" })}${field("eq-note", "Remarque", x.note, { wide: true })}</div></div>
    <footer>${x.id ? `<div class="left"><button type="button" class="btn danger" data-a="item-del" data-id="${x.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); await save("shiftItems", x.id, Object.assign(strip(x), { user: val("eq-user").toUpperCase(), reg: val("eq-reg").toUpperCase(), item: val("eq-item"), qty: +val("eq-qty") || 0, unit: val("eq-unit"), note: val("eq-note"), order: x.order || Date.now() })); closeModal(); };
};

/* 4. Station Control */
function shiftChecks(id, h) {
  const ed = hoEd(id), ck = h.checks || {};
  return sec(4, "Station Control", "Contrôles de fin de shift.", "",
    `<div class="pad stack"><div class="ho-checks">${stationChecks().map((c, i) => { const x = ck[c]; return `<label class="chk"><input type="checkbox" data-hock="${esc(c)}" data-ho="${id}" ${x ? "checked" : ""} ${ed ? "" : "disabled"}> ${esc(c)}${x ? ` <span class="muted small">· ${esc(x.by || "")} ${fmtDT(x.at)}</span>` : ""}</label>`; }).join("")}</div>
    ${field("ho-ckn", "Remarque Station Control", h.checkNote, { type: "textarea" })}</div>`);
}
async function hoPatch(id, data) {
  const [date, sh] = [id.slice(0, 10), id.slice(11)], h = hoDoc(id);
  if (h) await patch("handovers", id, data); else await save("handovers", id, Object.assign({ date, shift: sh }, data));
}
const meName = () => (ME && ME.name) || tr("Moi");
document.addEventListener("change", e => {
  const t = e.target; if (!t.dataset) return;
  if (t.dataset.hock != null) { const ck = Object.assign({}, hoDoc(t.dataset.ho)?.checks || {}); if (t.checked) ck[t.dataset.hock] = { by: meName(), at: new Date().toISOString() }; else delete ck[t.dataset.hock]; hoPatch(t.dataset.ho, { checks: ck }); }
  if (t.id === "ho-ckn") hoPatch(hoId(...UI.shift), { checkNote: t.value.trim() });
  if (t.id === "ho-fm") hoPatch(hoId(...UI.shift), { foreman: t.value });
  if (t.id === "ho-add" && t.value) { const id = hoId(...UI.shift); hoPatch(id, { extra: Array.from(new Set([...(hoDoc(id)?.extra || []), t.value])) }); }
  if (t.id === "shift-date" && t.value) { UI.shift = [t.value, UI.shift[1]]; render(true); }
});

/* 5. manpower et signatures */
function shiftCrew(id, date, sh, h) {
  const ed = hoEd(id), ros = onShift(date, sh), extra = (h.extra || []).map(staff).filter(Boolean).filter(p => !ros.includes(p));
  const crew = [...ros, ...extra].sort(staffSort), fms = crew.filter(p => ["lead", "foreman"].includes(p.function));
  const others = staffActive().filter(p => !crew.includes(p)).sort(staffSort);
  const nxt = nextShift(date, sh);
  return sec(5, "Manpower et signatures", "Personnel du shift d'après le roster. La signature confirme la remise du shift, pas un travail sur avion.", "",
    `<div class="pad stack"><div class="fields">${field("ho-fm", "Shift Foreman", h.foreman || (fms[0] && fms[0].id) || "", { type: "select", options: [["", "—"], ...crew.map(p => [p.id, p.name])] })}
      ${ed && others.length ? `<label class="f">Ajouter au shift<select id="ho-add"><option value="">—</option>${others.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>` : ""}</div>
    <div class="tablewrap"><table><thead><tr><th>Nom</th><th>Fonction</th><th>Qualifications</th><th></th></tr></thead><tbody>${crew.map(p => { const x = rcell(p.id, date); return `<tr><td><b>${esc(p.name)}</b></td><td class="small">${esc(STAFF_FN[p.function] || "")}</td><td>${ratingChips(p)}</td>
      <td class="small">${extra.includes(p) ? `<span class="chip sm">Ajouté</span>${ed ? ` <button class="x" data-a="ho-rm" data-id="${p.id}" aria-label="Retirer">×</button>` : ""}` : x && rcode(x.c).k === "custom" ? esc(cellTxt(x)) : ""}</td></tr>`; }).join("") || `<tr><td colspan="4" class="muted">Personne au roster pour ce shift.</td></tr>`}</tbody></table></div>
    <div class="row-g wrap ho-sign"><div class="panel pad"><b>Remis par</b><div>${h.out?.at ? `${esc(h.out.by)} · ${fmtDT(h.out.at)}` : `<span class="muted">Pas encore</span>`}</div>${ed && !h.out?.at ? `<button class="btn sm" data-a="ho-sign" data-k="out">Je remets le shift</button>` : ""}</div>
      <div class="panel pad"><b>Repris par</b> <span class="muted small">(${esc(shiftName(...nxt))})</span><div>${h.in?.at ? `${esc(h.in.by)} · ${fmtDT(h.in.at)}` : `<span class="muted">Pas encore</span>`}</div>${!readOnly && h.out?.at && !h.in?.at ? `<button class="btn sm primary" data-a="ho-sign" data-k="in">Je reprends le shift</button>` : ""}</div>
      ${isOffice() && (h.out?.at || h.in?.at) && !readOnly ? `<button class="linkbtn small" data-a="ho-unsign">Annuler les signatures</button>` : ""}</div></div>`);
}
ACTIONS["ho-rm"] = el => { const id = hoId(...UI.shift); hoPatch(id, { extra: (hoDoc(id)?.extra || []).filter(x => x !== el.dataset.id) }); };
ACTIONS["ho-sign"] = el => {
  const id = hoId(...UI.shift), k = el.dataset.k, open = hoItems(id, "visit").filter(v => !visitCheck(v).ok).length;
  confirmBox(`${k === "out" ? "Remettre" : "Reprendre"} le shift ${esc(shiftName(...UI.shift))} au nom de ${esc(meName())} ?${open && k === "out" ? `<div class="banner warn small" style="margin-top:8px">${plural(open, "avion")} sans CRS qualifié affecté.</div>` : ""}`,
    async () => { await hoPatch(id, { [k]: { by: meName(), at: new Date().toISOString() } }); render(true); }, k === "out" ? "Remettre" : "Reprendre");
};
ACTIONS["ho-unsign"] = () => confirmBox("Annuler les signatures de ce shift ?", async () => { await hoPatch(hoId(...UI.shift), { out: null, in: null }); render(true); }, "Annuler les signatures");
ACTIONS["shift-go"] = el => { UI.shift = (+el.dataset.n < 0 ? prevShift : nextShift)(...(UI.shift || currentShift())); render(true); };
ACTIONS["shift-sh"] = el => { UI.shift = [(UI.shift || currentShift())[0], el.dataset.sh]; render(true); };
ACTIONS["shift-now"] = () => { UI.shift = currentShift(); render(true); };

/* ---- tableau de bord ---- */
WIDGETS.shift_now = { h: 8, t: "Shift en cours", ic: "✈", c: "blue", m: "shift", size: "m", d: "Avions du shift en cours, travail non terminé, CRS manquants.",
  r() { const [d, sh] = currentShift(), id = hoId(d, sh), vs = hoItems(id, "visit"), todo = hoItems(id, "todo").filter(x => !x.done), bad = vs.filter(v => !visitCheck(v).ok);
    return `<div class="w-stats">${wStat(vs.length, "avions")}${wStat(todo.length, "non terminés", todo.length ? "warn" : "")}${wStat(bad.length, "sans CRS qualifié", bad.length ? "bad" : "")}</div>
      <div class="w-list">${vs.slice(0, 5).map(v => `<div class="list-row"><span><b class="mono">${esc(v.reg)}</b> <span class="muted small">${esc(v.acType || "")} · ${esc(v.arr || "—")}/${esc(v.dep || "—")} UTC</span></span><span class="small">${(v.crs || []).map(s => esc(sName(s))).join(", ")}</span></div>`).join("") || wEmpty("Aucun avion pour ce shift.")}</div>${wLink("shift", "Ouvrir le shift")}`; },
  go() { UI.shift = currentShift(); } };

/* ---- Flightradar24 (facultatif : clé de l'offre API FR24 ; sans clé, les heures se saisissent à la main) ---- */
let FR24 = null;
async function fr24Status() { if (!SERVER || !API || !ME) return null; if (FR24) return FR24; try { FR24 = await API.call("GET", "fr24/status"); } catch { FR24 = { configured: false }; } return FR24; }
const utcHM = iso => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
function fr24Line(v) {
  const f = v.fr24; if (!f) return "";
  const st = settings().stationCode || "", L = f.live, P = f.last;
  let t = "";
  if (L) t = `En vol ${L.from || "?"} → ${L.to || "?"}${L.eta ? " · ETA " + utcHM(L.eta) : ""}`;
  else if (P && P.landed) t = `Atterri ${utcHM(P.landed)}${P.to ? " à " + P.to : ""}${P.from ? " (de " + P.from + ")" : ""}`;
  else if (P && P.takeoff) t = `Parti ${utcHM(P.takeoff)}${P.from ? " de " + P.from : ""}${P.to ? " vers " + P.to : ""}`;
  else t = "Pas de vol trouvé";
  return `<div class="small ${L && st && L.to && L.to !== st ? "txt-warn" : "muted"}" title="Flightradar24 · ${esc(fmtDT(f.at))}">FR24 · ${esc(tr(t))}</div>`;
}
ACTIONS["fr24-track"] = async el => {
  const id = el.dataset.ho, vs = hoItems(id, "visit").filter(v => v.reg);
  if (!vs.length) { toast("Aucune immatriculation dans ce shift."); return; }
  el.disabled = true;
  try { const r = await API.call("POST", "fr24/track", { regs: vs.map(v => v.reg) });
    for (const v of vs) { const x = r.items[String(v.reg).toUpperCase().replace(/[^A-Z0-9-]/g, "")]; if (x) await patch("shiftItems", v.id, { fr24: Object.assign({ at: r.at }, x.live ? { live: x.live } : {}, x.last ? { last: x.last } : {}) }); }
    toast("Positions Flightradar24 mises à jour"); }
  catch (e) { toast(tr(e.message)); }
  el.disabled = false;
};
function fr24CardShell() {
  if (!SERVER || !isAdmin()) return "";
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><h3 class="np">Flightradar24</h3><div id="fr24-box"><div class="muted">Chargement…</div></div></div></div>`;
}
async function loadFr24() {
  const box = document.getElementById("fr24-box"); if (!box) return;
  FR24 = null; const s = await fr24Status();
  box.innerHTML = `<div class="small">Suivi des avions du shift par immatriculation (en vol, ETA, atterrissage). Il faut une clé de l'<b>offre API</b> de Flightradar24 (fr24api.flightradar24.com), différente de l'abonnement Premium de l'application. Sans clé, les heures ARR / DEP se saisissent à la main.</div>
    <div class="row-g wrap">${s && s.configured ? `<span class="chip good">Clé enregistrée ${esc(s.hint || "")}</span><button class="btn sm" data-a="fr24-test">Tester</button><button class="btn sm" data-a="fr24-off">Retirer la clé</button>` : `<span class="chip">Non configuré</span>`}
    <input type="password" id="fr24-key" placeholder="${esc(tr("Clé API Flightradar24"))}" autocomplete="off" style="min-width:260px"><button class="btn sm primary" data-a="fr24-save">Enregistrer la clé</button></div>`;
}
ACTIONS["fr24-save"] = async () => { const k = val("fr24-key"); if (!k) return; try { await API.call("POST", "fr24/config", { key: k }); toast("Clé Flightradar24 enregistrée"); } catch (e) { toast(tr(e.message)); } loadFr24(); };
ACTIONS["fr24-off"] = () => confirmBox("Retirer la clé Flightradar24 ?", async () => { await API.call("POST", "fr24/config", { key: "" }); loadFr24(); }, "Retirer");
ACTIONS["fr24-test"] = async () => { try { await API.call("POST", "fr24/test", {}); toast("Connexion Flightradar24 OK"); } catch (e) { toast(tr(e.message)); } };

/* ---- Notion : page du handover (sous la page parente choisie dans Paramètres ; jeton gardé sur le serveur) ---- */
let NOTION = null;
async function notionStatus() { if (!SERVER || !API || !ME) return null; if (NOTION) return NOTION; try { NOTION = await API.call("GET", "notion/status"); } catch { NOTION = { configured: false }; } return NOTION; }
ACTIONS["ho-notion"] = el => {
  const id = el.dataset.ho, h = hoDoc(id) || {}, [date, sh] = [id.slice(0, 10), id.slice(11)];
  const crew = Array.from(new Set([...onShift(date, sh).map(p => p.id), ...(h.extra || [])]));
  confirmBox(`${h.notion?.url ? "Renvoyer" : "Envoyer"} le handover ${esc(shiftName(date, sh))} vers Notion ?<div class="muted small" style="margin-top:6px">${esc(tr(h.notion?.url ? "La page déjà envoyée pour ce shift sera remplacée (l'ancienne va dans la corbeille de Notion)." : "Une page est créée sous la page Notion choisie dans Paramètres, avec les 5 sections."))}</div>`, async () => {
    el.disabled = true;
    try { const r = await API.call("POST", "notion/push", { ho: id, crew, checks: stationChecks() }); toast(r.replaced ? "Page Notion remplacée" : "Handover envoyé vers Notion"); }
    catch (e) { toast(tr(e.message)); }
    el.disabled = false;
  }, h.notion?.url ? "Renvoyer" : "Envoyer");
};
function notionCardShell() { return isAdmin() ? `<section class="panel"><div class="pad"><h3>Notion (handover)</h3><div class="muted small">Le handover de chaque shift est écrit sous une seule page Notion, choisie ici. L'outil ne modifie jamais une autre page. Dans Notion : créez une intégration interne, copiez son jeton, puis ajoutez l'intégration à cette page (••• › Connexions).</div></div><div class="pad" id="notion-card"><span class="muted">…</span></div></section>` : ""; }
async function loadNotion() {
  const el = document.getElementById("notion-card"); if (!el) return;
  NOTION = null; const s = await notionStatus();
  el.innerHTML = `<div class="stack"><div class="row-g wrap">${s && s.token ? `<span class="chip good">Jeton enregistré ${esc(s.hint || "")}</span><button class="btn sm" data-a="notion-off">Retirer le jeton</button>` : `<span class="chip">Pas de jeton</span>`}
    <input type="password" id="notion-token" placeholder="${esc(tr("Jeton d'intégration Notion"))}" autocomplete="off" style="min-width:260px"><button class="btn sm primary" data-a="notion-save">Enregistrer le jeton</button></div>
    <div class="row-g wrap"><input id="notion-parent" placeholder="${esc(tr("Lien de la page Notion du handover"))}" value="${esc(s && s.parent ? s.parent : "")}" class="mono" style="min-width:320px"><button class="btn sm" data-a="notion-parent">Enregistrer la page</button>${s && s.configured ? `<button class="btn sm" data-a="notion-test">Tester</button>` : ""}</div></div>`;
}
ACTIONS["notion-save"] = async () => { const k = val("notion-token"); if (!k) return; try { await API.call("POST", "notion/config", { token: k }); toast("Jeton Notion enregistré"); } catch (e) { toast(tr(e.message)); } loadNotion(); };
ACTIONS["notion-parent"] = async () => { try { await API.call("POST", "notion/config", { parent: val("notion-parent") }); toast("Page Notion enregistrée"); } catch (e) { toast(tr(e.message)); } loadNotion(); };
ACTIONS["notion-off"] = () => confirmBox("Retirer le jeton Notion ?", async () => { await API.call("POST", "notion/config", { token: "" }); loadNotion(); }, "Retirer");
ACTIONS["notion-test"] = async () => { try { const r = await API.call("POST", "notion/test", {}); toast(tr("Connexion Notion OK") + " · " + (r.title || "")); } catch (e) { toast(tr(e.message)); } };

/* ---- OneDrive : scans par avion du shift (rangés dans <racine>/<mois>/<date> Day|Night/<immat>) ---- */
let OD = null;
async function odStatus() { if (!SERVER || !API || !ME) return null; if (OD) return OD; try { OD = await API.call("GET", "onedrive/status"); } catch { OD = { configured: false }; } return OD; }
function odScansHtml(v) {
  const list = (v.scans || []).slice().reverse();
  if (!(OD && OD.configured) && !list.length) return "";
  return `<div class="stack od-scans"><b>Scans (OneDrive)</b><div class="row-g wrap">${list.map(f => `<a class="btn sm" href="${esc(f.url)}" target="_blank" rel="noopener" title="${esc((f.by || "") + " · " + fmtDT(f.at))}">${esc(f.name)} ↗</a>`).join("") || `<span class="muted small">Aucun scan.</span>`}
    ${OD && OD.configured && !readOnly ? `<label class="btn sm primary">+ Scanner / joindre<input type="file" id="od-file" accept="application/pdf,image/*" capture="environment" multiple hidden></label>` : ""}</div></div>`;
}
function odWire(m, v) {
  m.querySelector("#od-file")?.addEventListener("change", async e => {
    const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
    for (const f of files) { toast(tr("Envoi vers OneDrive…") + " " + f.name);
      try { await API.postFile("onedrive/upload", f, { item: v.id }); } catch (x) { toast(tr(x.message)); return; } }
    toast(files.length > 1 ? "Scans rangés dans OneDrive" : "Scan rangé dans OneDrive");
    if (API.refresh) await API.refresh();
    setTimeout(() => { const nv = S.shiftItems.find(i => i.id === v.id); const box = document.querySelector(".od-scans"); if (nv && box) { box.outerHTML = odScansHtml(nv); odWire(document.querySelector(".modal"), nv); } }, 400);
  });
}
function odCardShell() { return isAdmin() ? `<section class="panel"><div class="pad"><h3>OneDrive (scans)</h3><div class="muted small">Les scans du shift sont rangés dans le OneDrive Microsoft 365 de la station, sous un seul dossier racine. Dans Entra ID : inscription d'application, permission Files.ReadWrite.All (application) avec consentement administrateur, puis un secret client.</div></div><div class="pad" id="od-card"><span class="muted">…</span></div></section>` : ""; }
async function loadOd() {
  const el = document.getElementById("od-card"); if (!el) return;
  OD = null; const s = await odStatus() || {};
  el.innerHTML = `<div class="stack"><div class="row-g wrap">${s.configured ? `<span class="chip good">Relié</span><button class="btn sm" data-a="od-test">Tester</button>` : `<span class="chip">Non configuré</span>`}${s.secret ? `<span class="chip sm">Secret enregistré</span>` : ""}</div>
    <div class="fields">${field("od-tenant", "Locataire (tenant ID ou domaine)", s.tenant || "", { cls: "mono" })}${field("od-client", "ID d'application (client)", s.clientId || "", { cls: "mono" })}
    <label class="f">Secret client<input type="password" id="od-secret" autocomplete="off" placeholder="${esc(tr(s.secret ? "Laisser vide pour garder le secret actuel" : "Secret client"))}"></label>
    ${field("od-user", "Compte OneDrive (adresse)", s.user || "", { cls: "mono", ph: "station@challenge-technic.com" })}${field("od-root", "Dossier racine des scans", s.root || "", { ph: "Station TLV/Scans" })}</div>
    <div><button class="btn sm primary" data-a="od-save">Enregistrer</button></div></div>`;
}
ACTIONS["od-save"] = async () => {
  const b = { tenant: val("od-tenant"), clientId: val("od-client"), user: val("od-user"), root: val("od-root") }; if (val("od-secret")) b.secret = val("od-secret");
  try { await API.call("POST", "onedrive/config", b); toast("Réglages OneDrive enregistrés"); } catch (e) { toast(tr(e.message)); } loadOd();
};
ACTIONS["od-test"] = async () => { try { const r = await API.call("POST", "onedrive/test", {}); toast(tr("Connexion OneDrive OK") + " · " + (r.drive || "")); } catch (e) { toast(tr(e.message)); } };
