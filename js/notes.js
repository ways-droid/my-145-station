"use strict";
/* ======================= NOTES (Administration → Notes) =======================
   Collection « notes » : { title, body, color, labels[], team, owner, ownerName, pinned, order, files[{id,name,mime,size}],
   links[{coll,id,label,name?}], createdAt, updatedAt }.
   Note personnelle (team = false) : visible de son auteur seulement — le serveur ne l'envoie à personne d'autre.
   Note d'équipe : visible et modifiable par toute l'équipe. Passer de personnelle à équipe demande une confirmation.
   Les pièces jointes apparaissent aussi dans Gestion Documents (dossier système « Notes »). */

const NOTE_COLORS = { "": "Par défaut", red: "Rouge", orange: "Orange", yellow: "Jaune", green: "Vert", teal: "Sarcelle", blue: "Bleu", violet: "Violet", grey: "Gris" };
const notesF = () => UI.notesF || (UI.notesF = { scope: "all", label: "" });
const myUid = () => (ME && ME.id) || "local";
const noteMine = n => !n.owner || n.owner === myUid() || (ME && ME.key);
const notesAll = () => (S.notes || []).filter(n => n.team || noteMine(n));
const noteLabels = () => [...new Set(notesAll().flatMap(n => n.labels || []))].sort((a, b) => a.localeCompare(b));
const noteSort = (a, b) => (!!b.pinned - !!a.pinned) || ((a.order ?? 0) - (b.order ?? 0)) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
const noteTitle = n => n.title || (n.body || "").split("\n")[0].slice(0, 60) || "Note sans titre";

/* ---- liens vers les fiches de l'ERP ---- */
const NOTE_LINK = {
  vehicles: { ic: "🚗", act: "veh-open", lbl: v => [fleetNo(v), v.plate, v.model].filter(Boolean).join(" · ") },
  drivers: { ic: "👤", act: "driver-form", by: "name", lbl: d => d.name },
  docs: { ic: "🧾", act: "doc-open", lbl: d => `${({ facture: "Facture", nc: "Note de crédit", devis: "Devis" })[d.kind] || "Document"} ${d.number || "brouillon"}${d.clientName ? " · " + d.clientName : ""}` },
  purchases: { ic: "📥", act: "pur-open", lbl: p => `Achat ${p.number || ""} · ${p.supplierName || ""}` },
  clients: { ic: "🏢", act: "client-form", lbl: c => c.name },
  tools: { ic: "🔧", act: "tool-open", lbl: t => [t.serial, t.name || t.model, t.brand].filter(Boolean).join(" · ") },
  fines: { ic: "🚨", act: "fine-form", lbl: f => `Amende ${f.number || ""} · ${f.date ? fmtDate(f.date) : ""}${f.vehicleId && veh(f.vehicleId) ? " · " + veh(f.vehicleId).plate : ""}` },
  faults: { ic: "⚠", act: "fault-open", lbl: f => `Panne · ${(f.description || "").slice(0, 50)}${f.vehicleId && veh(f.vehicleId) ? " · " + veh(f.vehicleId).plate : ""}` },
  bottles: { ic: "🧪", act: "bottle-open", lbl: b => `Bouteille ${b.serial || ""}` },
  deliveries: { ic: "📦", act: "delivery-open", lbl: d => `Livraison ${d.number || d.no || ""}${d.date ? " · " + fmtDate(d.date) : ""}` },
};
function noteLinkSearch(q) {
  q = (q || "").toLowerCase().trim(); if (q.length < 2) return [];
  const out = [];
  for (const [coll, L] of Object.entries(NOTE_LINK)) {
    for (const x of S[coll] || []) {
      let t = ""; try { t = L.lbl(x) || ""; } catch { }
      if (t && t.toLowerCase().includes(q)) out.push({ coll, id: x.id, label: t, ...(L.by ? { name: x[L.by] } : {}) });
      if (out.length > 40) break;
    }
  }
  return out.slice(0, 12);
}
const noteLinkChip = (l, i) => { const L = NOTE_LINK[l.coll] || { ic: "🔗" }, ok = (S[l.coll] || []).some(x => x.id === l.id);
  return i == null
    ? `<button class="nlink ${ok ? "" : "gone"}" ${ok ? `data-a="${L.act}" ${L.by ? `data-name="${esc(l.name || l.label)}"` : `data-id="${esc(l.id)}"`}` : "disabled"} title="${esc(ok ? "Ouvrir" : "Fiche supprimée")}">${L.ic} ${esc(l.label)}</button>`
    : `<span class="nlink">${L.ic} ${esc(l.label)} <button type="button" class="x" data-nl-del="${i}" aria-label="Retirer le lien">×</button></span>`; };

/* ---- carte ---- */
function noteCard(n) {
  const imgs = (n.files || []).filter(f => (f.mime || "").startsWith("image/")), others = (n.files || []).filter(f => !(f.mime || "").startsWith("image/"));
  return `<div class="ncard nc-${n.color || "def"}" ${readOnly ? "" : `draggable="true"`} data-note="${n.id}">
    ${imgs.length ? `<div class="n-imgs">${imgs.slice(0, 3).map(f => `<img src="${esc(blobUrl(f.id))}" alt="" loading="lazy">`).join("")}</div>` : ""}
    <button class="n-open" data-a="note-form" data-id="${n.id}" aria-label="Ouvrir la note ${esc(noteTitle(n))}">
      ${n.title ? `<b class="n-t">${n.pinned ? `<span class="pin" title="Épinglée">📌</span> ` : ""}${esc(n.title)}</b>` : n.pinned ? `<span class="pin">📌</span>` : ""}
      ${n.body ? `<div class="n-b">${esc(n.body)}</div>` : ""}</button>
    ${others.length ? `<div class="n-files">${others.map(f => `<a class="n-file" href="${esc(blobUrl(f.id))}" target="_blank" rel="noopener" download="${esc(f.name)}">📎 ${esc(f.name)}</a>`).join("")}</div>` : ""}
    ${(n.links || []).length ? `<div class="n-links">${n.links.map(l => noteLinkChip(l)).join("")}</div>` : ""}
    <div class="n-foot">${(n.labels || []).map(l => `<button class="n-lab" data-a="note-label" data-l="${esc(l)}">${esc(l)}</button>`).join("")}
      <span class="n-who">${n.team ? `👥 ${esc(tr("Équipe"))}${n.ownerName && !noteMine(n) ? " · " + esc(n.ownerName) : ""}` : `🔒 ${esc(tr("Personnelle"))}`}</span></div></div>`;
}

function notesView() {
  const f = notesF(), q = (UI.q || "").toLowerCase().trim(), labs = noteLabels();
  if (f.label && !labs.includes(f.label)) f.label = "";
  const all = notesAll();
  const list = all.filter(n => (f.scope === "all" || (f.scope === "team" ? n.team : !n.team)) && (!f.label || (n.labels || []).includes(f.label))
    && (!q || [n.title, n.body, ...(n.labels || []), ...(n.links || []).map(l => l.label), ...(n.files || []).map(x => x.name), n.ownerName].join(" ").toLowerCase().includes(q))).sort(noteSort);
  const pinned = list.filter(n => n.pinned), rest = list.filter(n => !n.pinned);
  const grid = (ns, sec) => `<div class="ngrid" data-nsec="${sec}">${ns.map(noteCard).join("")}</div>`;
  const cnt = s => all.filter(n => s === "all" || (s === "team" ? n.team : !n.team)).length;
  return `<div class="notes">
    ${readOnly ? "" : `<button class="n-new" data-a="note-form">✎ ${esc(tr("Créer une note…"))}</button>`}
    <div class="panel pad vtool"><input type="search" id="q" class="fsearch" placeholder="Rechercher dans les notes…" value="${esc(UI.q)}" aria-label="Rechercher une note">
      <div class="seg" role="group" aria-label="Notes">${[["all", "Toutes"], ["mine", "Personnelles"], ["team", "Équipe"]].map(([k, l]) => `<button data-a="note-scope" data-v="${k}" class="${f.scope === k ? "on" : ""}">${l} <span class="muted">${cnt(k)}</span></button>`).join("")}</div>
      ${labs.length ? `<div class="fpills"><button class="fpill ${!f.label ? "on" : ""}" data-a="note-label" data-l="">Toutes les étiquettes</button>${labs.map(l => `<button class="fpill ${f.label === l ? "on" : ""}" data-a="note-label" data-l="${esc(l)}">🏷 ${esc(l)}</button>`).join("")}</div>` : ""}</div>
    ${!list.length ? `<div class="panel empty">${q || f.label || f.scope !== "all" ? "Aucune note ne correspond." : "Aucune note pour l'instant. Vos notes personnelles ne sont visibles que de vous ; les notes d'équipe, de toute l'équipe."}</div>`
      : `${pinned.length ? `<h3 class="adoc-h">📌 Épinglées</h3>${grid(pinned, "p")}${rest.length ? `<h3 class="adoc-h">Autres</h3>` : ""}` : ""}${grid(rest, "r")}
      ${readOnly ? "" : `<div class="muted small">Glissez une note sur une autre pour changer l'ordre.</div>`}`}</div>`;
}
ACTIONS["note-scope"] = el => { notesF().scope = el.dataset.v; render(true); };
ACTIONS["note-label"] = el => { const f = notesF(); f.label = f.label === el.dataset.l ? "" : el.dataset.l; UI.tab.admin = "notes"; if (location.hash !== "#admin") location.hash = "#admin"; render(true); };

/* ---- glisser-déposer : la note lâchée sur une autre prend sa place ---- */
let noteDrag = null;
document.addEventListener("dragstart", e => { const c = e.target.closest && e.target.closest(".ncard[data-note]"); if (!c) return; noteDrag = c.dataset.note; c.classList.add("dragging"); try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", noteDrag); } catch { } });
document.addEventListener("dragend", () => { noteDrag = null; document.querySelectorAll(".ncard.dragging, .ncard.drop-before").forEach(x => x.classList.remove("dragging", "drop-before")); });
document.addEventListener("dragover", e => { if (!noteDrag) return; const c = e.target.closest && e.target.closest(".ncard[data-note]"); if (!c || c.dataset.note === noteDrag) return; e.preventDefault();
  document.querySelectorAll(".ncard.drop-before").forEach(x => x !== c && x.classList.remove("drop-before")); c.classList.add("drop-before"); });
document.addEventListener("drop", async e => {
  if (!noteDrag) return; const c = e.target.closest && e.target.closest(".ncard[data-note]"); if (!c || c.dataset.note === noteDrag) return; e.preventDefault();
  const moved = (S.notes || []).find(n => n.id === noteDrag), target = (S.notes || []).find(n => n.id === c.dataset.note); noteDrag = null; if (!moved || !target) return;
  const sec = notesAll().filter(n => !!n.pinned === !!target.pinned && n.id !== moved.id).sort(noteSort);
  const i = sec.findIndex(n => n.id === target.id), prev = sec[i - 1];
  const to = target.order ?? 0, po = prev ? (prev.order ?? 0) : to - 2000;
  let order = (to + po) / 2;
  if (!(Math.abs(to - po) > 1e-6)) { /* ordres identiques : on renumérote la section */
    let k = 0; for (const n of sec) { if (n.id === target.id) { await patch("notes", moved.id, { order: k * 1000, pinned: !!target.pinned }); k++; } await patch("notes", n.id, { order: k * 1000 }); k++; }
    return;
  }
  await patch("notes", moved.id, { order, pinned: !!target.pinned });
});

/* ---- éditeur ---- */
ACTIONS["note-form"] = el => {
  const n0 = (S.notes || []).find(x => x.id === el.dataset.id);
  const n = n0 ? JSON.parse(JSON.stringify(n0)) : { title: "", body: "", color: "", labels: [], team: notesF().scope === "team", pinned: false, files: [], links: [] };
  const isNew = !n0, mine = isNew || noteMine(n0), canEdit = !readOnly && (n.team || mine);
  const wasTeam = !!(n0 && n0.team);
  let confirmShare = false, confirmDel = false;
  const m = modal(`${mHead(isNew ? "Nouvelle note" : n.team ? "Note d'équipe" : "Note personnelle")}<form autocomplete="off" class="nform"><div class="body stack-s">
    <input id="nt-title" class="nt-title" placeholder="Titre" value="${esc(n.title)}" ${canEdit ? "" : "readonly"}>
    <textarea id="nt-body" class="nt-body" rows="8" placeholder="Votre note…" ${canEdit ? "" : "readonly"}>${esc(n.body)}</textarea>
    <div id="nt-files"></div>
    <div id="nt-links"></div>
    ${canEdit ? `<div class="nt-tools row-g wrap">
      <label class="btn sm">📎 Joindre des fichiers<input type="file" id="nt-up" multiple hidden></label>
      <span class="nt-linkbox"><input id="nt-lq" class="sm" placeholder="🔗 Lier à une fiche (plaque, facture, chauffeur, outil…)"><div id="nt-lres" class="ac-pop" hidden></div></span>
      <label class="small row-g"><input type="checkbox" id="nt-pin" ${n.pinned ? "checked" : ""}> 📌 Épingler</label></div>
    <div class="row-g wrap nt-colors" role="radiogroup" aria-label="Couleur">${Object.entries(NOTE_COLORS).map(([k, l]) => `<button type="button" class="nt-sw nc-${k || "def"} ${(n.color || "") === k ? "on" : ""}" data-col="${k}" title="${l}" aria-label="${l}"></button>`).join("")}</div>
    <div class="nt-labels row-g wrap"><span id="nt-labs"></span><input id="nt-lab" class="sm" list="nt-lablist" placeholder="🏷 Ajouter une étiquette (Entrée)"><datalist id="nt-lablist">${noteLabels().map(l => `<option value="${esc(l)}">`).join("")}</datalist></div>` : ""}
    <div class="nt-share">${n.team ? `<span class="chip info">👥 Note d'équipe</span> <span class="muted small">Visible et modifiable par toute l'équipe${n.ownerName ? " · créée par " + esc(n.ownerName) : ""}.</span>${wasTeam && mine && canEdit ? ` <label class="small"><input type="checkbox" id="nt-unshare"> La rendre personnelle</label>` : ""}`
      : `<span class="chip">🔒 Note personnelle</span> <span class="muted small">Visible de vous seul.</span>${canEdit ? ` <label class="small"><input type="checkbox" id="nt-team"> Partager avec l'équipe</label>` : ""}`}</div>
    <div class="banner warn" id="nt-warn" hidden></div><div class="err" id="nt-err"></div></div>
    <footer>${!isNew && canEdit && (mine || n.team) ? `<div class="left"><button type="button" class="btn danger" id="nt-del">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>${canEdit ? "Annuler" : "Fermer"}</button>${canEdit ? `<button class="btn primary" id="nt-save">Enregistrer</button>` : ""}</footer></form>`, "lg");
  if (n.color) m.classList.add("nc-" + n.color);
  const form = m.querySelector("form"), warn = m.querySelector("#nt-warn"), saveBtn = m.querySelector("#nt-save");
  const drawFiles = () => { m.querySelector("#nt-files").innerHTML = (n.files || []).length ? `<div class="n-files">${n.files.map((f, i) => `<span class="n-file">${(f.mime || "").startsWith("image/") ? `<img src="${esc(blobUrl(f.id))}" alt="">` : "📎"} <a href="${esc(blobUrl(f.id))}" target="_blank" rel="noopener">${esc(f.name)}</a>${canEdit ? ` <button type="button" class="x" data-nf-del="${i}" aria-label="Retirer ${esc(f.name)}">×</button>` : ""}</span>`).join("")}</div>` : ""; };
  const drawLinks = () => { m.querySelector("#nt-links").innerHTML = (n.links || []).length ? `<div class="n-links">${n.links.map((l, i) => canEdit ? noteLinkChip(l, i) : noteLinkChip(l)).join("")}</div>` : ""; };
  const drawLabs = () => { const b = m.querySelector("#nt-labs"); if (b) b.innerHTML = (n.labels || []).map((l, i) => `<span class="n-lab">${esc(l)} <button type="button" class="x" data-lb-del="${i}" aria-label="Retirer ${esc(l)}">×</button></span>`).join(""); };
  drawFiles(); drawLinks(); drawLabs();
  m.addEventListener("click", e => {
    const t = e.target;
    if (t.dataset.nfDel != null) { n.files.splice(+t.dataset.nfDel, 1); drawFiles(); }
    else if (t.dataset.nlDel != null) { n.links.splice(+t.dataset.nlDel, 1); drawLinks(); }
    else if (t.dataset.lbDel != null) { n.labels.splice(+t.dataset.lbDel, 1); drawLabs(); }
    else if (t.dataset.col != null) { n.color = t.dataset.col; m.querySelectorAll(".nt-sw").forEach(x => x.classList.toggle("on", x === t)); m.className = m.className.replace(/\bnc-\S+/g, "").trim() + (n.color ? " nc-" + n.color : ""); }
  });
  const lab = m.querySelector("#nt-lab");
  if (lab) lab.addEventListener("keydown", e => { if (e.key !== "Enter") return; e.preventDefault(); const v = lab.value.trim().slice(0, 30); if (v && !(n.labels || []).includes(v)) { (n.labels ||= []).push(v); drawLabs(); } lab.value = ""; });
  const up = m.querySelector("#nt-up");
  if (up) up.onchange = async () => {
    if (!assets) { toast("L'ajout de fichiers n'est pas disponible ici."); return; }
    for (const f of [...up.files]) {
      if (f.size > 25 * 1048576) { toast(`« ${f.name} » dépasse 25 Mo`); continue; }
      try { const r = await assets.upload(f, f.type ? undefined : { type: "application/octet-stream" }); (n.files ||= []).push({ id: r.id, name: f.name, mime: f.type || "application/octet-stream", size: f.size }); drawFiles(); }
      catch { toast(`« ${f.name} » n'a pas pu être envoyé.`); }
    }
    up.value = "";
  };
  const lq = m.querySelector("#nt-lq"), lres = m.querySelector("#nt-lres");
  if (lq) {
    lq.addEventListener("input", () => { const r = noteLinkSearch(lq.value); lres.hidden = !r.length;
      lres.innerHTML = r.map((x, i) => `<button type="button" class="ac-item" data-li="${i}">${(NOTE_LINK[x.coll] || {}).ic || "🔗"} ${esc(x.label)}</button>`).join(""); lres._r = r; });
    lres.addEventListener("mousedown", e => { const b = e.target.closest("[data-li]"); if (!b) return; e.preventDefault(); const x = lres._r[+b.dataset.li];
      if (!(n.links || []).some(l => l.coll === x.coll && l.id === x.id)) (n.links ||= []).push(x); drawLinks(); lq.value = ""; lres.hidden = true; });
    lq.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); lres.querySelector("[data-li]")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); } });
    lq.addEventListener("blur", () => setTimeout(() => { lres.hidden = true; }, 150));
  }
  const teamBox = m.querySelector("#nt-team");
  if (teamBox) teamBox.onchange = () => { confirmShare = false; warn.hidden = !teamBox.checked; warn.innerHTML = teamBox.checked ? "<b>Cette note deviendra une note d'équipe</b> : toute l'équipe pourra la lire et la modifier, avec ses pièces jointes. Cliquez sur « Confirmer le partage » pour valider." : ""; if (saveBtn) saveBtn.textContent = teamBox.checked && !isNew ? "Confirmer le partage" : "Enregistrer"; };
  const del = m.querySelector("#nt-del");
  if (del) del.onclick = async () => {
    if (!confirmDel) { confirmDel = true; del.textContent = "Confirmer la suppression"; del.classList.add("danger-bg"); del.style.color = "#fff"; warn.hidden = false; warn.innerHTML = `Supprimer définitivement cette note${n.team ? " d'équipe (pour toute l'équipe)" : ""} ?`; return; }
    await remove("notes", n0.id); closeModal(); toast("Note supprimée");
  };
  form.onsubmit = async e => {
    e.preventDefault(); if (!canEdit) return;
    n.title = val("nt-title").trim().slice(0, 200); n.body = m.querySelector("#nt-body").value.slice(0, 20000);
    const pin = m.querySelector("#nt-pin"); if (pin) n.pinned = pin.checked;
    const pend = lab && lab.value.trim(); if (pend && !(n.labels || []).includes(pend)) (n.labels ||= []).push(pend.slice(0, 30));
    if (!n.title && !n.body.trim() && !(n.files || []).length && !(n.links || []).length) { m.querySelector("#nt-err").textContent = "La note est vide."; return; }
    if (teamBox && teamBox.checked && !n.team) {
      if (!isNew && !confirmShare) { confirmShare = true; return; }   // 1er clic : avertissement affiché ; 2e : partage confirmé
      n.team = true;
    }
    const uns = m.querySelector("#nt-unshare"); if (uns && uns.checked) n.team = false;
    const data = Object.assign({}, n, { updatedAt: new Date().toISOString() }); delete data.id;
    if (isNew) Object.assign(data, { createdAt: data.updatedAt, order: Math.min(0, ...notesAll().map(x => x.order ?? 0)) - 1000, owner: myUid(), ownerName: (ME && ME.name) || "" });
    await save("notes", n0 ? n0.id : null, data); closeModal(); toast(isNew ? "Note créée" : n.team && !wasTeam ? "Note partagée avec l'équipe" : "Note enregistrée");
  };
  if (teamBox && isNew) teamBox.checked = !!n.team;
  if (isNew) setTimeout(() => m.querySelector("#nt-title")?.focus(), 30);
};

/* ---- pièces jointes des notes dans Gestion Documents (dossier système « Notes ») ---- */
const NOTE_F = "_notes";
const noteAsAdoc = (n, f) => ({ id: `n:${n.id}:${f.id}`, nid: n.id, title: f.name, category: "Note : " + noteTitle(n), file: f.id, mime: f.mime || "", fileName: f.name, size: f.size || 0, updatedAt: n.updatedAt || n.createdAt || "", team: !!n.team });
const noteLinkedDocs = () => notesAll().flatMap(n => (n.files || []).map(f => noteAsAdoc(n, f)));
function noteFileCard(a) {
  const k = fileKind(a), [kl] = KIND_LABEL[k];
  return `<div class="panel adoc c-blue"><button class="adoc-prev" data-a="adoc-view" data-id="${esc(a.id)}" title="Aperçu">${k === "img" ? `<img src="${esc(blobUrl(a.file))}" alt="" loading="lazy">` : `<span class="adoc-ic">${kl}</span>`}</button>
    <div class="adoc-body"><b class="adoc-t">${esc(a.title)}</b><div class="muted small"><span class="fold-tag">📝 ${esc(a.category.slice(7))}</span> · ${a.team ? "👥 Équipe" : "🔒 Personnelle"}</div><div class="muted small">${[fmtDate((a.updatedAt || "").slice(0, 10)), fmtSize(a.size)].filter(Boolean).join(" · ")}</div></div>
    <div class="adoc-acts"><button class="btn sm" data-a="adoc-dl" data-id="${esc(a.id)}">Télécharger</button><button class="btn sm" data-a="adoc-print" data-id="${esc(a.id)}">Imprimer</button><button class="btn sm ghost" data-a="note-form" data-id="${esc(a.nid)}">Ouvrir la note</button></div></div>`;
}
function notesFolderTile() {
  const ds = noteLinkedDocs(); if (!ds.length) return "";
  return `<div class="panel folder c-blue sys" data-a="folder-open" data-id="${NOTE_F}" role="button" tabindex="0"><div class="folder-ic">${folderSvg}</div>
    <div class="folder-body"><b>Notes</b><div class="muted small">${plural(ds.length, "pièce jointe", "pièces jointes")}</div><span class="chip info sm">Lié aux Notes</span></div></div>`;
}
function notesFolderView(search) {
  const ds = noteLinkedDocs().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return `<div class="crumb"><button class="linkbtn" data-a="folder-open" data-id="">Tous les dossiers</button><span aria-hidden="true">›</span><span class="folder-ic sm c-blue">${folderSvg}</span><b>Notes</b><span class="chip info">Lié aux Notes</span></div>
    <div class="banner info">Les pièces jointes de vos notes personnelles et des notes d'équipe. Elles ne sont pas copiées : ajoutez-les ou retirez-les depuis la note.</div>
    <div class="panel pad vtool">${search}</div>
    ${ds.length ? `<div class="adoc-grid">${ds.map(noteFileCard).join("")}</div>` : `<div class="panel empty">Aucune pièce jointe dans les notes.</div>`}`;
}
