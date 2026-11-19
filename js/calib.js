"use strict";
/* ======================= ÉTALONNAGE ======================= */
/* colonnes de l'atelier, dans l'ordre (codes stables : recu, en_cours et a_livrer existaient déjà) */
/* NewTool → Picked → Lab → Calibrated → Dropped → Done (noms repris du tableau habituel de W.A.Y.S.) */
const WORK_COLS = [
  ["recu", "NewTool", "blue"], ["picked", "Picked", "yellow"], ["labo", "Lab", "orange"], ["a_livrer", "Calibrated", "green"], ["dropped", "Dropped", "red"], ["done", "Done", "grey"]];
/* anciens statuts rangés dans la colonne la plus proche */
const COL_OF = { evaluation: "recu", devis: "recu", approuve: "picked", en_cours: "labo" };
const colOf = t => COL_OF[t.status] || t.status;
const T_STATUS = Object.assign(Object.fromEntries(WORK_COLS.map(([k, l, c]) => [k, [l, { blue: "info", grey: "", yellow: "warn", green: "good", orange: "orange", red: "bad" }[c]]])),
  { en_cours: ["En étalonnage", "orange"], dropped: ["Dropped · rendu au client", "bad"], done: ["Done", ""], client: ["Chez le client", ""] });
const IN_SHOP = ["recu", "picked", "labo", "en_cours", "a_livrer", "evaluation", "devis", "approuve"];
const atClient = t => !t.status || ["client", "dropped", "done"].includes(t.status);
const T_RESULT = { conforme: ["Conforme", "good"], ajuste: ["Conforme après ajustage", "good"], non_conforme: ["Non conforme", "bad"] };
const T_COL = Object.fromEntries(WORK_COLS.map(([k, , c]) => [k, "c-" + c]));
const tChip = st => { const [l, c] = T_STATUS[st] || [st, ""]; return `<span class="chip ${c}">${l}</span>`; };
const toolBySerial = s => S.tools.find(t => t.serial === s);
const activeCert = t => (t.certs || []).filter(c => c.validUntil >= today()).sort((a, b) => b.date.localeCompare(a.date))[0];
const toolsDue = (days = 60) => S.tools.filter(t => atClient(t) && t.nextDue && t.nextDue <= addDays(today(), days));

VIEWS.etalonnage = {
  render() {
    const tab = curTab("etalonnage", "atelier");
    const n = st => S.tools.filter(t => t.status === st).length;
    return head("Étalonnage", plural(S.tools.length, "outil") + " suivi" + (S.tools.length > 1 ? "s" : ""),
      `<button class="btn" data-a="tool-form" ${dis()}>Ajouter un outil</button><button class="btn primary" data-a="tool-reception" ${dis()}>Réceptionner des outils</button>`) +
      `<div class="pipeline">${[["NewTool", ["recu", "evaluation", "devis"], "c-blue"], ["Picked", ["picked", "approuve"], "c-yellow"], ["Lab", ["labo", "en_cours"], "c-orange"], ["Calibrated", ["a_livrer"], "c-green"]].map(([l, sts, c]) => `<div class="panel tile ${c}"><div class="lbl">${l}</div><div class="val">${sts.reduce((a, st) => a + n(st), 0)}</div></div>`).join("")}
        <div class="panel tile c-red ${toolsDue(0).length ? "alert" : ""}"><div class="lbl">Échéance dépassée chez les clients</div><div class="val">${toolsDue(0).length}</div><div class="note">${toolsDue(30).length} dans les 30 jours</div></div></div>` +
      tabs("etalonnage", [["atelier", "En atelier", IN_SHOP.reduce((a, st) => a + n(st), 0), n("a_livrer") > 0], ["outils", "Tous les outils", S.tools.length], ["labos", "Laboratoires", (S.labs || []).length || ""], ["echeances", "Rappels d'échéance", toolsDue(60).length]]) +
      ({ atelier: calibWorkshop, outils: calibAll, labos: calibLabs, echeances: calibDue })[tab]();
  }
};
function toolRow(t) {
  const ac = activeCert(t);
  return `<tr class="click" data-a="tool-open" data-id="${t.id}"><td class="mono"><b>${esc(t.serial)}</b>${demoTag(t)}</td><td>${esc(t.name)}<div class="muted small">${esc([t.brand, t.model].filter(Boolean).join(" "))}</div></td>
    <td>${esc(clientName(t.clientId))}</td><td>${tChip(t.status)}${t.status === "labo" && t.job?.labId ? `<div class="muted small">${esc(labName(t.job.labId))}</div>` : ""}</td><td>${ac ? `<span class="chip good">${esc(ac.number || "Actif")}</span>` : `<span class="muted">Aucun actif</span>`}</td><td>${atClient(t) ? dueChip(t.nextDue) : `<span class="num muted">${fmtDate(t.nextDue)}</span>`}</td></tr>`;
}
const toolHead = `<thead><tr><th>N° de série</th><th>Outil</th><th>Client</th><th>Statut</th><th>Certificat</th><th>Prochain étalonnage</th></tr></thead>`;
const doneOpen = () => { try { return localStorage.getItem("ways-done-open") === "1"; } catch (e) { return false; } };
const labName = id => (S.labs || []).find(l => l.id === id)?.name || "";
function kcard(t) {
  const since = t.job?.movedAt || t.job?.receivedDate, days = since ? daysBetween(since, today()) : 0;
  const shp = (t.shipments || []).filter(x => !x.delivered).slice(-1)[0];
  return `<div class="kcard" draggable="${readOnly ? "false" : "true"}" data-drag="${t.id}" data-a="tool-open" data-id="${t.id}" role="button" tabindex="0">
    <div class="row-sb"><span class="mono small">${t.status === "a_livrer" ? ADOT : ""}<b>${esc(t.serial)}</b></span><span class="small ${days > 10 && t.status !== "done" ? "txt-warn" : "muted"}" title="Depuis le ${fmtDate(since)}">${days} j</span></div>
    <div class="kname">${t.job?.so ? `<b>${esc(t.job.so)}</b> - ` : ""}${esc(t.name)}${demoTag(t)}</div><div class="muted small">${esc(clientName(t.clientId))}</div>
    ${t.job?.ro || (t.status === "labo" && t.job?.labId) || shp ? `<div class="ktags">${t.job?.ro ? `<span class="ktag">${esc(t.job.ro)}</span>` : ""}${t.status === "labo" && t.job?.labId ? `<span class="ktag lab">${esc(labName(t.job.labId))}</span>` : ""}${shp ? `<span class="ktag ship" title="${esc(CARRIERS[shp.carrier]?.[0] || shp.carrier)} ${esc(shp.number)}">📦 ${esc(CARRIERS[shp.carrier]?.[0] || shp.carrier)}</span>` : ""}</div>` : ""}</div>`;
}
function calibWorkshop() {
  const open = doneOpen(), lim = addDays(today(), -30);
  const tot = S.tools.filter(t => WORK_COLS.some(c => c[0] === colOf(t)) && (t.status !== "done" || (t.job?.closedDate || t.job?.movedAt || "") >= lim)).length;
  return `<div class="hint mb">${readOnly ? "" : "Glissez-déposez les cartes d'une colonne à l'autre. "}Dropped : rendu au client · Done : dossier clôturé (30 derniers jours affichés).</div><div class="kanban kboard">${WORK_COLS.map(([st, label, c]) => {
    let ts = S.tools.filter(t => colOf(t) === st);
    if (st === "done") ts = ts.filter(t => (t.job?.closedDate || t.job?.movedAt || "") >= lim).sort((a, b) => (b.job?.closedDate || "").localeCompare(a.job?.closedDate || ""));
    else ts.sort((a, b) => (a.job?.movedAt || a.job?.receivedDate || "").localeCompare(b.job?.movedAt || b.job?.receivedDate || ""));
    if (st === "done" && !open) return `<div class="panel kcol c-${c} collapsed" data-drop="done"><button class="kcollapse" data-a="done-toggle" aria-expanded="false" title="Afficher la colonne Done"><span class="vlab">${label}</span><span class="chip">${ts.length}</span><span aria-hidden="true">▸</span></button></div>`;
    return `<div class="panel kcol c-${c}" data-drop="${st}"><h3><span>${st === "a_livrer" && ts.length ? ADOT : ""}${label}</span><span class="row-g">${st === "recu" && !readOnly ? `<button class="x" data-a="tool-reception" title="Réceptionner des outils" aria-label="Réceptionner des outils">+</button>` : ""}${st === "done" ? `<button class="x" data-a="done-toggle" aria-expanded="true" aria-label="Replier la colonne Done" title="Replier">◂</button>` : ""}</span></h3>
      <div class="kbar"><span style="width:${tot ? Math.round(ts.length / tot * 100) : 0}%"></span></div><div class="kcount">${ts.length}</div>
      <div class="kbody">${ts.map(kcard).join("") || `<div class="muted small kempty">Rien ici.</div>`}</div></div>`;
  }).join("")}</div>`;
}
ACTIONS["done-toggle"] = () => { try { localStorage.setItem("ways-done-open", doneOpen() ? "0" : "1"); } catch (e) {} render(true); };
/* glisser-déposer (délégué : survit aux re-rendus) */
let dragId = null;
document.addEventListener("dragstart", e => { const c = e.target.closest && e.target.closest("[data-drag]"); if (!c || readOnly) return; dragId = c.dataset.drag; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", dragId); } catch (x) {} c.classList.add("dragging"); });
document.addEventListener("dragend", e => { dragId = null; document.querySelectorAll(".dragging,.dropover").forEach(x => x.classList.remove("dragging", "dropover")); });
document.addEventListener("dragover", e => { const col = dragId && e.target.closest && e.target.closest("[data-drop]"); if (!col) return; e.preventDefault(); document.querySelectorAll(".dropover").forEach(x => x !== col && x.classList.remove("dropover")); col.classList.add("dropover"); });
document.addEventListener("drop", e => { const col = dragId && e.target.closest && e.target.closest("[data-drop]"); if (!col) return; e.preventDefault(); const id = dragId; dragId = null; col.classList.remove("dropover"); moveTool(id, col.dataset.drop); });
/* déplacement d'un outil vers une colonne (glisser-déposer ou menu « Déplacer vers ») */
async function moveTool(id, st, after) {
  const t = S.tools.find(x => x.id === id); if (!t || t.status === st) return;
  if (st === "labo") return labSendForm(t, after);
  const job = Object.assign({}, t.job || {}, { movedAt: today() });
  if (colOf(t) === st) return;
  if (st === "recu" && ["client", "done"].includes(t.status || "client")) { await patch("tools", t.id, { status: "recu", job: { receivedDate: today(), movedAt: today() } }); toast("Outil réceptionné"); after && after(); return; }
  if (st === "picked") job.pickedDate = today();
  if (st === "done") {
    job.closedDate = today();
    await patch("tools", t.id, { status: "done", job, history: [...(t.history || []), Object.assign({}, job, { done: job.doneDate || t.lastCalDate || today(), delivered: job.delivered || today() })] });
    toast("Rendu au client · Done"); after && after(); return;
  }
  if (st === "dropped") job.delivered = job.delivered || today();
  await patch("tools", t.id, { status: st, job });
  toast("Déplacé vers « " + T_STATUS[st][0] + " »"); after && after();
}
/* envoi au labo : labo présélectionné = dernier labo utilisé pour cet outil */
function labSendForm(t, after) {
  const labs = (S.labs || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const def = t.job?.labId || t.defaultLabId || "";
  const m = modal(`${mHead("Envoyer au laboratoire · <span class=\"mono\">" + esc(t.serial) + "</span>")}<form><div class="body">
    ${labs.length ? "" : `<div class="banner warn">Aucun laboratoire enregistré. Ajoutez-en un dans l'onglet Laboratoires (vous pourrez le choisir ensuite).</div>`}
    <div class="fields">${field("ls-lab", "Laboratoire", def, { type: "select", options: [["", "Choisir…"], ...labs.map(l => [l.id, l.name])] })}${field("ls-date", "Date d'envoi", today(), { type: "date" })}
    ${field("ls-carrier", "Transporteur", "dhl", { type: "select", options: [["", "Pas d'envoi (déposé / enlevé)"], ...Object.entries(CARRIERS).map(([k, v]) => [k, v[0]])] })}${field("ls-no", "N° de suivi", "", { cls: "mono", ph: "Ex. 1234567890" })}</div>
    ${def ? `<div class="hint">Labo présélectionné : ${esc(labName(def))} (dernier labo utilisé pour cet outil).</div>` : ""}<div class="err" id="ls-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Envoyer au labo</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const lab = val("ls-lab"); if (!lab) { m.querySelector("#ls-err").textContent = "Choisissez le laboratoire."; return; }
    const job = Object.assign({}, t.job || {}, { labId: lab, sentDate: val("ls-date") || today(), movedAt: val("ls-date") || today() });
    const shipments = [...(t.shipments || [])];
    if (val("ls-no")) shipments.push({ id: "s" + Date.now().toString(36), carrier: val("ls-carrier") || "autre", number: val("ls-no").trim(), dir: "vers_labo", date: val("ls-date") || today(), labId: lab });
    await patch("tools", t.id, { status: "labo", job, defaultLabId: lab, shipments });
    closeModal(); toast("Envoyé chez " + labName(lab)); after ? after() : render(true);
  };
}
function calibAll() {
  const q = UI.q.toLowerCase();
  const rows = S.tools.filter(t => (UI.filter === "tous" || (UI.filter === "atelier" ? IN_SHOP.includes(t.status) : UI.filter === "client" ? atClient(t) : t.status === UI.filter)) && (!q || [t.serial, t.pn, t.job?.so, t.job?.ro, t.name, t.brand, t.model, clientName(t.clientId), t.category].join(" ").toLowerCase().includes(q))).sort((a, b) => a.serial.localeCompare(b.serial));
  return `<div class="panel">${searchBar("Numéro de série, outil, marque, client…", [["tous", "Tous"], ["atelier", "En atelier"], ["labo", "Lab"], ["a_livrer", "Calibrated"], ["client", "Chez le client"]])}
    <div class="tablewrap"><table>${toolHead}<tbody>${rows.map(toolRow).join("")}</tbody></table>${rows.length ? "" : `<div class="empty">Aucun outil ne correspond.</div>`}</div></div>`;
}
function calibDue() {
  const due = toolsDue(60), groups = {};
  due.forEach(t => (groups[t.clientId] = groups[t.clientId] || []).push(t));
  const list = Object.entries(groups);
  if (!list.length) return `<div class="panel empty">Aucun outil n'arrive à échéance dans les 60 prochains jours.</div>`;
  return `<div class="stack">${list.map(([cid, ts]) => `<div class="panel"><div class="row-sb pad"><div><b>${esc(clientName(cid))}</b> <span class="muted">· ${plural(ts.length, "outil")}</span>${client(cid)?.email ? `<div class="muted small">${esc(client(cid).email)}</div>` : ""}</div>
    <div class="row-g"><button class="btn sm" data-a="tool-remind" data-client="${cid}">Préparer l'e-mail de rappel</button>${readOnly ? "" : `<button class="btn sm" data-a="tool-reminded" data-client="${cid}">Marquer comme relancé</button>`}</div></div>
    <div class="tablewrap"><table>${toolHead}<tbody>${ts.sort((a, b) => a.nextDue.localeCompare(b.nextDue)).map(toolRow).join("")}</tbody></table></div>
    ${ts.some(t => t.remindedAt) ? `<div class="pad small muted">Dernière relance : ${fmtDate(ts.map(t => t.remindedAt || "").sort().pop())}</div>` : ""}</div>`).join("")}</div>`;
}
ACTIONS["tool-remind"] = el => {
  const ts = toolsDue(60).filter(t => t.clientId === el.dataset.client);
  mailBox(el.dataset.client, (cl, s) => MAIL.rappel[LANG](cl, ts, s));
};
ACTIONS["tool-reminded"] = async el => { for (const t of toolsDue(60).filter(t => t.clientId === el.dataset.client)) await patch("tools", t.id, { remindedAt: today() }); toast("Relance notée"); };

/* ---------- réception par scan ---------- */
ACTIONS["tool-reception"] = () => {
  let items = [];
  const m = modal(`${mHead("Réception d'outils à étalonner")}<form><div class="body"><div class="fields">
    ${field("r-client", "Client (pour les nouveaux outils)", "", { type: "select", options: clientOptions() })}${field("r-date", "Date de collecte", today(), { type: "date" })}</div>
    ${scanBox("tscan", "Scanner ou saisir le numéro de série de l'outil")}<div id="t-list"></div><div class="err" id="r-err"></div></div>
    <footer><div class="left muted" id="t-count"></div><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" id="r-go">Réceptionner</button></footer></form>`, "lg");
  const check = s => {
    const t = toolBySerial(s);
    if (!t) return { lvl: "new", msg: "Nouvel outil : complétez sa désignation" };
    if (!atClient(t)) return { lvl: "warn", msg: `${t.name} · déjà en atelier (${T_STATUS[t.status][0].toLowerCase()})` };
    return { lvl: "ok", msg: `${t.name} · ${clientName(t.clientId)} · échéance ${fmtDate(t.nextDue)}` };
  };
  const draw = () => {
    items.forEach(i => Object.assign(i, check(i.serial)));
    m.querySelector("#t-list").innerHTML = items.length ? `<div class="scanlist">${items.map((i, k) => `<div class="scanitem ${i.lvl}"><span class="mono"><b>${esc(i.serial)}</b></span>
      ${i.lvl === "new" ? `<span class="grow row-g wrap"><input placeholder="Désignation *" data-k="name" data-i="${k}" value="${esc(i.name || "")}"><input placeholder="Marque" data-k="brand" data-i="${k}" value="${esc(i.brand || "")}"><input placeholder="Modèle" data-k="model" data-i="${k}" value="${esc(i.model || "")}"></span>` : `<span class="grow">${esc(i.msg)}</span>`}
      <button type="button" class="x" data-rmscan="${k}" aria-label="Retirer">×</button></div>`).join("")}</div>` : `<div class="empty small">Aucun outil scanné.</div>`;
    m.querySelector("#t-count").textContent = plural(items.length, "outil");
  };
  wireScan("tscan", s => { if (items.some(i => i.serial === s)) { toast(s + " est déjà dans la liste"); return; } items.unshift({ serial: s }); draw(); });
  m.addEventListener("input", e => { if (e.target.dataset.i != null) items[+e.target.dataset.i][e.target.dataset.k] = e.target.value; });
  m.addEventListener("click", e => { const b = e.target.closest("[data-rmscan]"); if (b) { items.splice(+b.dataset.rmscan, 1); draw(); } });
  draw();
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const err = m.querySelector("#r-err"), date = val("r-date") || today(), cl = val("r-client");
    if (!items.length) { err.textContent = "Scannez au moins un outil."; return; }
    const news = items.filter(i => i.lvl === "new");
    if (news.length && !cl) { err.textContent = "Choisissez le client pour les nouveaux outils."; return; }
    if (news.some(i => !(i.name || "").trim())) { err.textContent = "Indiquez la désignation de chaque nouvel outil."; return; }
    m.querySelector("#r-go").disabled = true;
    for (const i of items) {
      const t = toolBySerial(i.serial);
      if (t) await patch("tools", t.id, { status: "recu", job: { receivedDate: date, movedAt: date } });
      else await save("tools", "t-" + safeId(i.serial), { serial: i.serial, name: i.name.trim(), brand: i.brand || "", model: i.model || "", category: "", clientId: cl, intervalMonths: 12, calPrice: 0, status: "recu", job: { receivedDate: date, movedAt: date }, nextDue: "", photos: [], certs: [], history: [], shipments: [], createdAt: date });
    }
    closeModal(); toast(`${plural(items.length, "outil")} réceptionné${items.length > 1 ? "s" : ""}`);
    UI.tab.etalonnage = "atelier"; render(true);
  };
};

/* ---------- dossier outil ---------- */
ACTIONS["tool-open"] = el => openTool(el.dataset.id);
async function openTool(id) {
  const t = await waitFind("tools", id); if (!t) return;
  const ready = S.tools.filter(x => x.clientId === t.clientId && x.status === "a_livrer").length;
  const inShop = IN_SHOP.includes(t.status);
  const act = readOnly ? "" : atClient(t) ? `<button class="btn primary" data-a="tool-st" data-st="recu">Réceptionner pour étalonnage</button>`
    : t.status === "a_livrer" ? `<button class="btn primary" data-a="tool-deliver">Livrer au client${ready > 1 ? ` (${ready} outils prêts)` : ""}</button>`
    : t.status === "dropped" ? `<button class="btn primary" data-a="tool-st" data-st="done">Clôturer (Done)</button>`
    : ["labo", "en_cours"].includes(t.status) ? `<button class="btn primary" data-a="tool-done">Enregistrer le certificat (Calibrated)</button>`
    : t.status === "recu" ? `<button class="btn" data-a="tool-st" data-st="picked">Picked</button><button class="btn primary" data-a="tool-st" data-st="labo">Envoyer au labo</button>`
    : `<button class="btn" data-a="tool-done">Étalonné en interne</button><button class="btn primary" data-a="tool-st" data-st="labo">Envoyer au labo</button>`;
  const inShopD = inShop || t.status === "dropped";
  const so = t.job?.soId ? S.docs.find(d => d.id === t.job.soId) : null;
  const labs = (S.labs || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const m = modal(`${mHead(`<span class="mono">${esc(t.serial)}</span> ${esc(t.name)} ${tChip(t.status)}`)}<div class="body">
    ${inShopD ? `<div class="panel pad jobbox"><div class="row-sb wrap"><b>Dossier en cours</b>${readOnly ? "" : `<label class="row-g small">Déplacer vers <select id="tm-move" class="fsel">${WORK_COLS.map(([k, l]) => `<option value="${k}" ${k === colOf(t) ? "selected" : ""}>${l}</option>`).join("")}</select></label>`}</div>
      <dl class="kv sm"><dt>Sales Order (devis)</dt><dd>${so && allowed("devis") ? `<button class="linkbtn mono" data-a="doc-open" data-id="${so.id}">${esc(so.number)}</button>` : so ? `<span class="mono">${esc(so.number)}</span>` : t.job?.so ? `<span class="mono">${esc(t.job.so)}</span>` : `<span class="muted">—</span>`}</dd>
      <dt>Repair Order (RO)</dt><dd class="mono">${esc(t.job?.ro || "—")}</dd>
      <dt>Laboratoire</dt><dd>${readOnly ? esc(labName(t.job?.labId) || "—") : `<select id="tm-lab" class="fsel"><option value="">Atelier interne / pas encore choisi</option>${labs.map(l => `<option value="${l.id}" ${l.id === (t.job?.labId || t.defaultLabId) ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select>${!t.job?.labId && t.defaultLabId ? `<div class="hint">Présélectionné : dernier labo utilisé pour cet outil.</div>` : ""}`}</dd>
      ${t.job?.receivedDate ? `<dt>En atelier depuis</dt><dd>${fmtDate(t.job.receivedDate)}</dd>` : ""}</dl></div>` : ""}
    <dl class="kv"><dt>Client</dt><dd><b>${esc(clientName(t.clientId))}</b></dd>${t.pn ? `<dt>Part number (P/N)</dt><dd class="mono">${esc(t.pn)}</dd>` : ""}<dt>Marque / modèle</dt><dd>${esc([t.brand, t.model].filter(Boolean).join(" ") || "—")}</dd>
    <dt>Catégorie</dt><dd>${esc(t.category || "—")}</dd><dt>Périodicité</dt><dd>${t.intervalMonths ? t.intervalMonths + " mois" : "—"}</dd>
    <dt>Dernier étalonnage</dt><dd>${fmtDate(t.lastCalDate)}</dd><dt>Prochain étalonnage</dt><dd>${dueChip(t.nextDue)}</dd><dt>Prix de l'étalonnage</dt><dd>${t.calPrice ? eur(t.calPrice) + " HT" : "—"}</dd>
    ${t.defaultLabId ? `<dt>Labo habituel</dt><dd>${esc(labName(t.defaultLabId))}</dd>` : ""}</dl>
    <h3>Suivi des envois</h3>${shipmentsHtml(t)}
    <h3>Photos</h3><div class="photos">${(t.photos || []).map(p => `<a href="${esc(blobUrl(p))}" target="_blank" rel="noopener"><img src="${esc(blobUrl(p))}" alt="Photo de l'outil ${esc(t.serial)}"></a>`).join("")}
      ${assets && !readOnly ? `<label class="addphoto">+ Photo<input type="file" accept="image/*" capture="environment" id="tp-file" hidden></label>` : ""}</div>${!(t.photos || []).length && !assets ? `<div class="muted small">Aucune photo.</div>` : ""}
    <h3>Certificats</h3>${(t.certs || []).length ? `<div class="tablewrap"><table><thead><tr><th>N°</th><th>Date</th><th>Résultat</th><th>Valide jusqu'au</th><th></th></tr></thead><tbody>${(t.certs || []).slice().sort((a, b) => b.date.localeCompare(a.date)).map(c => `<tr><td class="mono">${esc(c.number || "—")}</td><td class="num">${fmtDate(c.date)}</td>
      <td><span class="chip ${T_RESULT[c.result]?.[1] || ""}">${T_RESULT[c.result]?.[0] || "—"}</span></td><td>${c.validUntil >= today() ? `<span class="chip good">Actif · ${fmtDate(c.validUntil)}</span>` : `<span class="chip">Expiré · ${fmtDate(c.validUntil)}</span>`}</td>
      <td class="r">${c.file ? `<a class="btn sm" href="${esc(blobUrl(c.file))}" target="_blank" rel="noopener">Ouvrir</a>` : `<span class="muted small">pas de fichier</span>`}</td></tr>`).join("")}</tbody></table></div>` : `<div class="muted">Aucun certificat.</div>`}
    ${assets && !readOnly ? `<label class="btn sm">Joindre un certificat existant (PDF)<input type="file" accept="application/pdf,image/*" id="tc-file" hidden></label>` : ""}
    <h3>Historique</h3><div class="timeline">${(t.history || []).slice().reverse().map(h => `<div><span class="num muted">${fmtDate(h.done)}</span> <b>Étalonnage</b>${h.result ? " · " + (T_RESULT[h.result]?.[0] || "") : ""}${h.so ? ` · SO <span class="mono">${esc(h.so)}</span>` : ""}${h.ro ? ` · <span class="mono">${esc(h.ro)}</span>` : ""}${h.certNo ? ` · <span class="mono">${esc(h.certNo)}</span>` : ""}${h.labId ? " · " + esc(labName(h.labId)) : h.lab ? " · " + esc(h.lab) : ""}${h.delivered ? ` · livré le ${fmtDate(h.delivered)}` : ""}</div>`).join("") || `<div class="muted">Aucun étalonnage enregistré.</div>`}</div>
    ${t.notes ? `<div class="quote">${esc(t.notes)}</div>` : ""}</div>
    <footer><div class="left">${readOnly ? "" : `<button class="btn" data-a="tool-form" data-id="${t.id}">Modifier la fiche</button>`}</div>${act || ""}</footer>`, "lg");
  m.dataset.tool = t.id;
  const up = async (inp, kind) => {
    const f = inp.files[0]; inp.value = ""; if (!f) return;
    toast("Envoi du fichier…");
    try {
      const r = await assets.upload(f, f.type ? undefined : { type: kind === "photo" ? "image/jpeg" : "application/pdf" });
      if (kind === "photo") await patch("tools", t.id, { photos: [...(t.photos || []), r.id] });
      else await patch("tools", t.id, { certs: [...(t.certs || []), { number: f.name.replace(/\.[^.]+$/, ""), date: today(), validUntil: t.nextDue || addMonths(today(), +t.intervalMonths || 12), result: "conforme", file: r.id }] });
      toast("Fichier ajouté"); openTool(t.id);
    } catch (e) { toast(e.code === "too_large" ? "Fichier trop lourd (20 Mo maximum)." : e.code === "unsupported_type" ? "Format non accepté : utilisez une photo ou un PDF." : "Envoi impossible pour l'instant."); }
  };
  m.querySelector("#tp-file")?.addEventListener("change", e => up(e.target, "photo"));
  m.querySelector("#tm-move")?.addEventListener("change", e => moveTool(t.id, e.target.value, () => openTool(t.id)));
  m.querySelector("#tm-lab")?.addEventListener("change", async e => { const lab = e.target.value; await patch("tools", t.id, Object.assign({ job: Object.assign({}, t.job || {}, { labId: lab }) }, lab ? { defaultLabId: lab } : {})); toast(lab ? "Labo : " + labName(lab) : "Atelier interne"); openTool(t.id); });
  wireShipments(m, t);
  m.querySelector("#tc-file")?.addEventListener("change", e => up(e.target, "cert"));
}
const curTool = () => S.tools.find(x => x.id === document.querySelector(".modal")?.dataset.tool);
ACTIONS["tool-st"] = async el => {
  const t = curTool(), st = el.dataset.st;
  if (st !== "recu" || !atClient(t)) return moveTool(t.id, st, () => openTool(t.id));
  const job = Object.assign({}, t.job || {}, st === "recu" ? { receivedDate: today() } : { startedDate: today() });
  await patch("tools", t.id, { status: st, job: st === "recu" ? { receivedDate: today(), movedAt: today() } : job });
  toast(T_STATUS[st][0]); openTool(t.id);
};
ACTIONS["tool-done"] = () => {
  const t = curTool();
  const m = modal(`${mHead("Terminer l'étalonnage · " + esc(t.serial))}<form><div class="body"><div class="fields">
    ${field("c-date", "Date d'étalonnage", today(), { type: "date", required: true })}${field("c-res", "Résultat", "conforme", { type: "select", options: Object.entries(T_RESULT).map(([k, v]) => [k, v[0]]) })}
    ${field("c-no", "N° de certificat", "", { cls: "mono", required: true })}${field("c-lab", "Réalisé par", labName(t.job?.labId) || "Atelier W.A.Y.S.", { ph: "Atelier interne ou laboratoire externe" })}
    ${field("c-int", "Périodicité (mois)", t.intervalMonths || 12, { type: "number", min: 1 })}${field("c-next", "Prochain étalonnage", addMonths(today(), +t.intervalMonths || 12), { type: "date" })}</div>
    ${assets ? `<label class="f">Certificat (PDF ou photo)<input type="file" id="c-file" accept="application/pdf,image/*"></label>` : `<div class="hint">L'ajout de fichiers est réservé aux éditeurs : le certificat pourra être joint plus tard.</div>`}
    ${field("c-note", "Remarques (valeurs relevées, ajustages…)", "", { type: "textarea", wide: true })}<div class="err" id="c-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`, "lg");
  const sync = () => { m.querySelector("#c-next").value = addMonths(val("c-date") || today(), +val("c-int") || 12); };
  m.querySelector("#c-date").onchange = sync; m.querySelector("#c-int").oninput = sync;
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const btn = m.querySelector("button.primary"); btn.disabled = true;
    let file = "";
    const f = m.querySelector("#c-file")?.files[0];
    if (f) { try { file = (await assets.upload(f, f.type ? undefined : { type: "application/pdf" })).id; } catch { m.querySelector("#c-err").textContent = "Le fichier n'a pas pu être envoyé. Réessayez ou enregistrez sans fichier."; btn.disabled = false; return; } }
    const date = val("c-date"), res = val("c-res"), no = val("c-no"), next = val("c-next");
    const cert = { number: no, date, validUntil: res === "non_conforme" ? date : next, result: res, file, lab: val("c-lab") };
    await patch("tools", t.id, {
      status: "a_livrer", lastCalDate: date,
      ...(t.status === "labo" ? {} : {}), nextDue: res === "non_conforme" ? date : next, intervalMonths: +val("c-int") || 12,
      certs: [...(t.certs || []), cert], job: Object.assign({}, t.job || {}, { movedAt: today(), doneDate: date, result: res, certNo: no, lab: val("c-lab"), note: val("c-note") })
    });
    toast("Étalonnage enregistré : outil prêt à livrer"); openTool(t.id);
  };
};
ACTIONS["tool-deliver"] = () => {
  const t = curTool(), ready = S.tools.filter(x => x.clientId === t.clientId && x.status === "a_livrer");
  const m = modal(`${mHead("Livraison au client · " + esc(clientName(t.clientId)))}<form><div class="body">
    <div class="checklist">${ready.map(x => `<label class="chk"><input type="checkbox" value="${x.id}" checked> <span class="mono"><b>${esc(x.serial)}</b></span> ${esc(x.name)} <span class="muted">· ${x.calPrice ? eur(x.calPrice) : "prix non défini"}</span></label>`).join("")}</div>
    <div class="fields">${field("dl-date", "Date de livraison", today(), { type: "date" })}</div>
    <label class="chk"><input type="checkbox" id="dl-inv" checked> Créer une facture brouillon pour les outils cochés</label><div class="err" id="dl-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Valider la livraison</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const ids = [...m.querySelectorAll(".checklist input:checked")].map(i => i.value), date = val("dl-date");
    if (!ids.length) { m.querySelector("#dl-err").textContent = "Cochez au moins un outil."; return; }
    m.querySelector("button.primary").disabled = true;
    const sel = ids.map(id => S.tools.find(x => x.id === id));
    let invId = "";
    if (m.querySelector("#dl-inv").checked) {
      const lines = sel.map(x => ({ productId: "", cat: "etalonnage", label: `Étalonnage ${x.name}${x.brand ? " " + x.brand : ""} · S/N ${x.serial}${x.job?.certNo ? " · certificat " + x.job.certNo : ""}`, qty: 1, price: +x.calPrice || 0, vat: 21 }));
      invId = await createInvoice(t.clientId, lines, `Étalonnage d'outils livrés le ${fmtDate(date)}.`, { source: "etalonnage" });
    }
    for (const x of sel) await patch("tools", x.id, { status: "dropped", job: Object.assign({}, x.job || {}, { delivered: date, invoiceId: invId, movedAt: date }) });
    closeModal(); toast(`${plural(sel.length, "outil")} livré${sel.length > 1 ? "s" : ""}${invId ? ", facture brouillon créée" : ""}`);
    if (invId && allowed("factures")) setTimeout(() => openDoc(invId), 100);
  };
};
ACTIONS["tool-form"] = el => {
  const t = S.tools.find(x => x.id === el.dataset.id) || { intervalMonths: 12, status: "client", calPrice: 0 };
  const isNew = !t.id;
  const cats = [...new Set(S.tools.map(x => x.category).filter(Boolean))];
  const m = modal(`${mHead(isNew ? "Nouvel outil" : "Modifier " + esc(t.serial))}<form><div class="body"><div class="fields">
    ${field("tf-serial", "N° de série", t.serial, { required: true, cls: "mono" })}${field("tf-name", "Désignation", t.name, { required: true, ph: "Clé dynamométrique 20-100 Nm" })}
    ${field("tf-pn", "Part number (P/N)", t.pn, { cls: "mono" })}${field("tf-brand", "Marque", t.brand)}${field("tf-model", "Modèle", t.model)}${field("tf-cat", "Catégorie", t.category, { ph: cats.slice(0, 3).join(", ") || "Couple, pression, électrique…" })}
    ${field("tf-client", "Client propriétaire", t.clientId, { type: "select", options: clientOptions(), required: true })}
    ${field("tf-int", "Périodicité (mois)", t.intervalMonths, { type: "number", min: 1 })}${field("tf-next", "Prochain étalonnage", t.nextDue, { type: "date" })}
    ${field("tf-price", "Prix de l'étalonnage HT", t.calPrice, { type: "number", step: "0.01" })}
    ${isNew ? field("tf-st", "Où est l'outil ?", "client", { type: "select", options: [["client", "Chez le client"], ["recu", "Réceptionné à l'atelier"]] }) : ""}</div>
    ${field("tf-notes", "Notes", t.notes, { type: "textarea", wide: true })}<div class="err" id="tf-err"></div></div>
    <footer>${isNew ? "" : `<div class="left"><button type="button" class="btn danger" data-a="tool-del" data-id="${t.id}" ${dis()}>Supprimer</button></div>`}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "lg");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const serial = normSerial(val("tf-serial")), other = toolBySerial(serial);
    if (other && other.id !== t.id) { m.querySelector("#tf-err").textContent = `Le n° de série ${serial} existe déjà (${other.name}).`; return; }
    const st = isNew ? val("tf-st") : t.status;
    const data = Object.assign({ photos: [], certs: [], history: [], job: {} }, strip(t), { serial, pn: val("tf-pn").trim().toUpperCase(), name: val("tf-name"), brand: val("tf-brand"), model: val("tf-model"), category: val("tf-cat"), clientId: val("tf-client"), intervalMonths: +val("tf-int") || 12, nextDue: val("tf-next"), calPrice: +val("tf-price") || 0, notes: val("tf-notes"), status: st });
    if (isNew && st === "recu") data.job = { receivedDate: today(), movedAt: today() };
    const id = await save("tools", t.id || "t-" + safeId(serial), data);
    toast("Outil enregistré"); openTool(id);
  };
};
ACTIONS["tool-del"] = el => confirmBox("Supprimer ce dossier outil ? Ses photos et certificats ne seront plus accessibles depuis l'application.", () => remove("tools", el.dataset.id));

/* ======================= SUIVI DES ENVOIS (DHL, FedEx…) ======================= */
const CARRIERS = {
  dhl: ["DHL", n => `https://www.dhl.com/be-fr/home/tracking/tracking-express.html?submit=1&tracking-id=${n}`],
  fedex: ["FedEx", n => `https://www.fedex.com/fedextrack/?trknbr=${n}`],
  ups: ["UPS", n => `https://www.ups.com/track?tracknum=${n}`],
  tnt: ["TNT", n => `https://www.tnt.com/express/fr_be/site/outils-expedition/suivi.html?searchType=con&cons=${n}`],
  bpost: ["bpost", n => `https://track.bpost.cloud/btr/web/#/search?itemCode=${n}`],
  autre: ["Autre", null]
};
const SHIP_DIR = { vers_labo: "Vers le labo", retour_labo: "Retour du labo", vers_client: "Vers le client", depuis_client: "Depuis le client" };
const trackUrl = x => { const c = CARRIERS[x.carrier]; return c && c[1] ? c[1](encodeURIComponent(x.number)) : ""; };
function shipmentsHtml(t) {
  const list = (t.shipments || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return `<div class="ships">${list.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Sens</th><th>Transporteur</th><th>N° de suivi</th><th>État</th><th></th></tr></thead><tbody>${list.map(x => `<tr>
    <td class="num">${fmtDate(x.date)}</td><td>${esc(SHIP_DIR[x.dir] || x.dir || "—")}${x.labId ? `<div class="muted small">${esc(labName(x.labId))}</div>` : ""}</td><td><b>${esc(CARRIERS[x.carrier]?.[0] || x.carrier)}</b></td>
    <td class="mono">${trackUrl(x) ? `<a href="${esc(trackUrl(x))}" target="_blank" rel="noopener" data-stop>${esc(x.number)} ↗</a>` : esc(x.number)}</td>
    <td>${x.delivered ? `<span class="chip good">Livré · ${fmtDate(x.delivered)}</span>` : readOnly ? `<span class="chip info">En transit</span>` : `<button type="button" class="btn sm" data-shipdone="${x.id}">Marquer livré</button>`}</td>
    <td class="r">${readOnly ? "" : `<button type="button" class="x" data-shiprm="${x.id}" aria-label="Supprimer cet envoi">×</button>`}</td></tr>`).join("")}</tbody></table></div>` : `<div class="muted small">Aucun envoi enregistré.</div>`}
    ${readOnly ? "" : `<div class="shipadd row-g wrap"><select id="sh-dir" class="fsel" aria-label="Sens">${Object.entries(SHIP_DIR).map(([k, l]) => `<option value="${k}" ${k === (t.status === "labo" ? "retour_labo" : IN_SHOP.includes(t.status) ? "vers_labo" : "depuis_client") ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select id="sh-car" class="fsel" aria-label="Transporteur">${Object.entries(CARRIERS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select>
      <input id="sh-no" class="mono" placeholder="N° de suivi" aria-label="Numéro de suivi"><input id="sh-date" type="date" value="${today()}" aria-label="Date d'envoi"><button type="button" class="btn sm" id="sh-add">+ Ajouter l'envoi</button></div>`}</div>`;
}
function wireShipments(m, t) {
  m.querySelector("#sh-add")?.addEventListener("click", async () => {
    const no = (m.querySelector("#sh-no").value || "").trim(); if (!no) { m.querySelector("#sh-no").focus(); toast("Indiquez le n° de suivi."); return; }
    const x = { id: "s" + Date.now().toString(36), carrier: m.querySelector("#sh-car").value, number: no, dir: m.querySelector("#sh-dir").value, date: m.querySelector("#sh-date").value || today() };
    if (x.dir.includes("labo") && t.job?.labId) x.labId = t.job.labId;
    await patch("tools", t.id, { shipments: [...(t.shipments || []), x] }); toast("Envoi ajouté"); openTool(t.id);
  });
  m.querySelector(".ships")?.addEventListener("click", async e => {
    const d = e.target.closest("[data-shipdone]"), r = e.target.closest("[data-shiprm]");
    if (d) { await patch("tools", t.id, { shipments: (t.shipments || []).map(x => x.id === d.dataset.shipdone ? Object.assign({}, x, { delivered: today() }) : x) }); openTool(t.id); }
    if (r) { await patch("tools", t.id, { shipments: (t.shipments || []).filter(x => x.id !== r.dataset.shiprm) }); openTool(t.id); }
  });
}

/* ======================= LABORATOIRES ======================= */
const labTools = id => S.tools.filter(t => t.status === "labo" && t.job?.labId === id);
function calibLabs() {
  const labs = (S.labs || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const sel = labs.find(l => l.id === UI.labSel) || null;
  const list = `<div class="panel"><div class="row-sb pad"><h3 class="np">${plural(labs.length, "laboratoire")}</h3>${readOnly ? "" : `<button class="btn primary sm" data-a="lab-form">Ajouter un laboratoire</button>`}</div>
    ${labs.length ? `<div class="tablewrap"><table><thead><tr><th>Laboratoire</th><th>Accréditation</th><th>Contact</th><th class="r">Outils chez eux</th></tr></thead><tbody>${labs.map(l => { const n = labTools(l.id).length; return `<tr class="click ${sel && sel.id === l.id ? "sel" : ""}" data-a="lab-sel" data-id="${l.id}">
      <td><b>${esc(l.name)}</b><div class="muted small">${esc(l.city || "")}</div></td><td class="small">${esc(l.accreditation || "—")}</td><td class="small">${esc(l.contact || "")}${l.email ? `<div class="muted">${esc(l.email)}</div>` : ""}</td>
      <td class="r">${n ? `<span class="chip bad">${n}</span>` : `<span class="muted">0</span>`}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="empty">Aucun laboratoire. Ajoutez les labos avec qui vous travaillez : ils pourront être choisis dans la fiche de chaque outil.</div>`}</div>`;
  if (!sel) return `<div class="labs-grid">${list}<div class="panel empty">Sélectionnez un laboratoire pour voir ses coordonnées et les outils qui s'y trouvent actuellement.</div></div>`;
  const ts = labTools(sel.id).sort((a, b) => (a.job?.sentDate || "").localeCompare(b.job?.sentDate || ""));
  const usual = S.tools.filter(t => t.defaultLabId === sel.id).length;
  return `<div class="labs-grid">${list}<div class="panel"><div class="row-sb pad"><div><h3 class="np">${esc(sel.name)}</h3><div class="muted small">${plural(usual, "outil")} l'ont comme labo habituel</div></div>${readOnly ? "" : `<button class="btn sm" data-a="lab-form" data-id="${sel.id}">Modifier</button>`}</div>
    <dl class="kv sm pad">${[["Accréditation", sel.accreditation], ["Adresse", [sel.address, sel.city].filter(Boolean).join(", ")], ["Contact", sel.contact], ["E-mail", sel.email], ["Téléphone", sel.phone], ["Délai habituel", sel.leadDays ? sel.leadDays + " jours" : ""]].filter(r => r[1]).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
    ${sel.notes ? `<div class="pad quote">${esc(sel.notes)}</div>` : ""}
    <div class="pad"><h3 class="np">Outils actuellement chez ${esc(sel.name)} <span class="muted">${ts.length}</span></h3></div>
    ${ts.length ? `<div class="tablewrap"><table><thead><tr><th>N° de série</th><th>Outil</th><th>Client</th><th>SO · RO</th><th>Envoyé le</th><th>Suivi</th></tr></thead><tbody>${ts.map(t => { const d = t.job?.sentDate ? daysBetween(t.job.sentDate, today()) : null, shp = (t.shipments || []).filter(x => x.dir === "vers_labo").slice(-1)[0];
      return `<tr class="click" data-a="tool-open" data-id="${t.id}"><td class="mono"><b>${esc(t.serial)}</b>${demoTag(t)}</td><td>${esc(t.name)}</td><td class="small">${esc(clientName(t.clientId))}</td><td class="small mono">${esc([t.job?.so, t.job?.ro].filter(Boolean).join(" · ") || "—")}</td>
        <td class="num">${fmtDate(t.job?.sentDate)}${d != null ? ` <span class="small ${sel.leadDays && d > +sel.leadDays ? "txt-warn" : "muted"}">· ${d} j</span>` : ""}</td>
        <td>${shp ? (trackUrl(shp) ? `<a href="${esc(trackUrl(shp))}" target="_blank" rel="noopener" data-stop class="mono small nowrap">${esc(CARRIERS[shp.carrier]?.[0])} ${esc(shp.number)} ↗</a>` : `<span class="mono small">${esc(shp.number)}</span>`) : `<span class="muted small">—</span>`}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="empty">Aucun outil chez ce laboratoire en ce moment.</div>`}</div></div>`;
}
ACTIONS["lab-sel"] = el => { UI.labSel = UI.labSel === el.dataset.id ? null : el.dataset.id; render(true); };
ACTIONS["lab-form"] = el => {
  const l = (S.labs || []).find(x => x.id === el.dataset.id) || {};
  const m = modal(`${mHead(l.id ? "Modifier " + esc(l.name) : "Nouveau laboratoire")}<form><div class="body"><div class="fields">
    ${field("lb-name", "Nom", l.name, { required: true, wide: true })}${field("lb-acc", "Accréditation", l.accreditation, { ph: "BELAC ISO 17025 n° …" })}${field("lb-lead", "Délai habituel (jours)", l.leadDays, { type: "number", min: 0 })}
    ${field("lb-addr", "Adresse", l.address)}${field("lb-city", "Ville / pays", l.city)}${field("lb-contact", "Personne de contact", l.contact)}${field("lb-email", "E-mail", l.email, { type: "email" })}${field("lb-phone", "Téléphone", l.phone)}</div>
    ${field("lb-notes", "Notes (domaines couverts, conditions…)", l.notes, { type: "textarea", wide: true })}</div>
    <footer>${l.id ? `<div class="left"><button type="button" class="btn danger" data-a="lab-del" data-id="${l.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const id = await save("labs", l.id, Object.assign(strip(l), { name: val("lb-name"), accreditation: val("lb-acc"), leadDays: +val("lb-lead") || 0, address: val("lb-addr"), city: val("lb-city"), contact: val("lb-contact"), email: val("lb-email"), phone: val("lb-phone"), notes: val("lb-notes") }));
    closeModal(); UI.labSel = id; toast("Laboratoire enregistré"); render(true);
  };
};
ACTIONS["lab-del"] = el => { const n = labTools(el.dataset.id).length; confirmBox(n ? `${plural(n, "outil")} se trouve${n > 1 ? "nt" : ""} encore chez ce labo. Supprimer quand même ?` : "Supprimer ce laboratoire ?", async () => { await remove("labs", el.dataset.id); UI.labSel = null; }); };
