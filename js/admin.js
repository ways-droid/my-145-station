/* ======================= MODULE ADMINISTRATION ======================= */
/* Onglet Gestion Documents : bibliothèque des documents utilisés régulièrement (formulaires vierges, modèles…)
   Collection « adminDocs » : { title, category, issuer, description, file, mime, fileName, size, version, pinned, uploadedAt, updatedAt, prev[] } */

const ADOC_CATS = ["Autorité (CAA)", "Aéroport", "Sécurité & badges", "Ressources humaines", "Assurances", "Qualité", "Modèles", "Autre"];
const adocF = () => UI.adocF || (UI.adocF = { cat: "", folder: "", view: (() => { try { return localStorage.getItem("st-adoc-view") || "cartes"; } catch (e) { return "cartes"; } })() });
const fileKind = d => {
  const m = d.mime || "", n = (d.fileName || "").toLowerCase();
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (m.startsWith("image/")) return "img";
  if (/\.(docx?|odt|rtf)$/.test(n) || m.includes("word")) return "word";
  if (/\.(xlsx?|ods|csv)$/.test(n) || m.includes("sheet") || m.includes("excel")) return "excel";
  return "file";
};
const KIND_LABEL = { pdf: ["PDF", "red"], img: ["Image", "blue"], word: ["Word", "blue"], excel: ["Excel", "green"], file: ["Fichier", "grey"] };
const canPrint = d => ["pdf", "img"].includes(fileKind(d));
const fmtSize = b => !b ? "" : b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " Ko" : (b / 1048576).toLocaleString(LANG === "en" ? "en-IE" : "fr-BE", { maximumFractionDigits: 1 }) + " Mo";
/* dossiers (un par organisme) : collection « adminFolders » { name } ; un document porte folderId */
const folders = () => (S.adminFolders || []).slice().sort((a, b) => a.name.localeCompare(b.name));
const folderOf = d => d.folderId && (S.adminFolders || []).find(f => f.id === d.folderId) ? d.folderId : "_none";
const folderName = id => id === "_none" ? "Sans dossier" : (S.adminFolders || []).find(f => f.id === id)?.name || "Sans dossier";
const docsIn = id => (S.adminDocs || []).filter(d => folderOf(d) === id);
const folderSvg = `<svg viewBox="0 0 48 40" aria-hidden="true"><path d="M3 8a4 4 0 0 1 4-4h11l5 5h18a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" fill="var(--tb)" stroke="var(--tc)" stroke-width="2.2"/><path d="M3 15h42" stroke="var(--tc)" stroke-width="2.2"/></svg>`;
/* ---- dossier système « Véhicules » : les documents des fiches véhicules, liés (pas copiés) ---- */
const VEH_F = "_veh";
const vehFolderName = v => `${fleetNo(v) ? "ID " + fleetNo(v) + " - " : ""}${v.plate} - ${v.model}${v.retired ? " (retiré)" : ""}`;
const vehDocsAll = v => (v.docs || []).slice().sort((a, b) => (VDOC_TYPES[a.type] || "").localeCompare(VDOC_TYPES[b.type] || "") || (b.expires || b.issued || "").localeCompare(a.expires || a.issued || ""));
/* document de véhicule présenté comme un document de la bibliothèque (id « v:<véhicule>:<doc> ») */
const vdocAsAdoc = (v, d) => ({ id: `v:${v.id}:${d.id}`, vid: v.id, vdoc: d, title: (VDOC_TYPES[d.type] || "Document") + (d.name && d.type !== "immat" && !d.name.toLowerCase().startsWith((VDOC_TYPES[d.type] || "").split(" ")[0].toLowerCase()) ? " · " + d.name : ""), category: VDOC_TYPES[d.type] || "Document",
  file: d.file || "", mime: d.mime || (d.file ? "application/pdf" : ""), fileName: d.fileName || `${v.plate} - ${VDOC_TYPES[d.type] || "document"}.pdf`, updatedAt: d.issued || "", number: d.number || "" });
const vehLinkedDocs = () => S.vehicles.flatMap(v => vehDocsAll(v).map(d => vdocAsAdoc(v, d)));
const findAdoc = id => { if (String(id).startsWith("n:") && typeof noteLinkedDocs === "function") return noteLinkedDocs().find(x => x.id === id) || null; if (String(id).startsWith("v:")) { const [, vid, did] = id.split(":"); const v = veh(vid), d = v && (v.docs || []).find(x => x.id === did); return v && d ? vdocAsAdoc(v, d) : null; } return (S.adminDocs || []).find(x => x.id === id); };
const isCurrentVdoc = (v, d) => Object.values(currentDocs(v)).some(x => x.id === d.id);
function vdocCard(a) {
  const v = veh(a.vid), d = a.vdoc, st = docState(d), k = a.file ? fileKind(a) : "none", cur = isCurrentVdoc(v, d);
  const [kl, kc] = k === "none" ? ["—", "grey"] : KIND_LABEL[k];
  return `<div class="panel adoc c-${st.cls} ${cur ? "" : "old"}">
    <button class="adoc-prev" ${a.file ? `data-a="adoc-view" data-id="${a.id}"` : `data-a="vdoc-form" data-veh="${v.id}" data-id="${d.id}"`} title="${a.file ? "Aperçu" : "Aucun fichier joint"}">
      ${k === "img" ? `<img src="${blobUrl(a.file)}" alt="" loading="lazy">` : `<span class="adoc-ic ${k === "none" ? "none" : ""}">${k === "none" ? "Aucun fichier · ajouter" : kl}</span>`}</button>
    <div class="adoc-body"><b class="adoc-t">${esc(a.title)}</b>${UI.q ? `<div class="muted small"><span class="fold-tag">📁 ${esc(vehFolderName(v))}</span></div>` : ""}
      <div class="small"><span class="chip ${({ red: "bad", orange: "orange", yellow: "warn", green: "good" })[st.cls] || ""}">${esc(st.label)}</span>${cur ? "" : ` <span class="chip">Ancienne version</span>`}</div>
      <div class="muted small">${[a.number ? `<span class="mono">${esc(a.number)}</span>` : "", d.issued ? "Émis le " + fmtDate(d.issued) : ""].filter(Boolean).join(" · ")}</div></div>
    <div class="adoc-acts">${a.file ? `<button class="btn sm" data-a="adoc-dl" data-id="${a.id}">Télécharger</button><button class="btn sm" data-a="adoc-print" data-id="${a.id}">Imprimer</button>` : `<span class="muted small">Aucun fichier joint</span>`}
      ${readOnly ? "" : `<button class="btn sm ghost adoc-edit" data-a="vdoc-form" data-veh="${v.id}" data-id="${d.id}" title="Modifier dans la fiche véhicule" aria-label="Modifier ${esc(a.title)}">✎</button>`}</div></div>`;
}
function vehRootView(search) {
  const vs = S.vehicles.slice().sort((a, b) => (!!a.retired - !!b.retired) || (fleetNo(a) || "zzz").localeCompare(fleetNo(b) || "zzz", undefined, { numeric: true }) || a.plate.localeCompare(b.plate));
  const tile = v => { const ds = v.docs || [], n = ds.length, bad = Object.values(currentDocs(v)).filter(d => ["red", "orange"].includes(docState(d).cls)).length;
    return `<div class="panel folder c-${v.retired ? "grey" : "blue"}" data-a="folder-open" data-id="${VEH_F}:${v.id}" role="button" tabindex="0"><div class="folder-ic">${folderSvg}</div>
      <div class="folder-body"><b class="mono-id">${esc(vehFolderName(v))}</b><div class="muted small">${plural(n, "document")}${bad ? ` · <span class="txt-bad">${plural(bad, "à renouveler", "à renouveler")}</span>` : ""}</div></div></div>`; };
  const act = vs.filter(v => !v.retired), ret = vs.filter(v => v.retired);
  return `<div class="crumb"><button class="linkbtn" data-a="folder-open" data-id="">Tous les dossiers</button><span aria-hidden="true">›</span><span class="folder-ic sm c-blue">${folderSvg}</span><b>Véhicules</b><span class="chip info">Lié à la Flotte</span></div>
    <div class="banner info">Ces dossiers sont créés automatiquement à partir des fiches véhicules : les documents ne sont pas copiés, ce sont ceux de la Flotte. Ajouter, modifier ou supprimer un document ici ou dans la fiche véhicule est visible des deux côtés.</div>
    <div class="panel pad vtool">${search}<span class="muted small">${plural(act.length, "véhicule")}${ret.length ? ` · ${ret.length} retiré${ret.length > 1 ? "s" : ""}` : ""}</span></div>
    <div class="folder-grid">${act.map(tile).join("")}</div>${ret.length ? `<h3 class="adoc-h">Retirés de la flotte <span class="muted">${ret.length}</span></h3><div class="folder-grid">${ret.map(tile).join("")}</div>` : ""}`;
}
function vehFolderView(vid, search) {
  const v = veh(vid); if (!v) { adocF().folder = VEH_F; return vehRootView(search); }
  const ds = vehDocsAll(v).map(d => vdocAsAdoc(v, d));
  const cur = ds.filter(a => isCurrentVdoc(v, a.vdoc)), old = ds.filter(a => !isCurrentVdoc(v, a.vdoc));
  return `<div class="crumb"><button class="linkbtn" data-a="folder-open" data-id="">Tous les dossiers</button><span aria-hidden="true">›</span><button class="linkbtn" data-a="folder-open" data-id="${VEH_F}">Véhicules</button><span aria-hidden="true">›</span>
      <span class="folder-ic sm c-blue">${folderSvg}</span><b>${esc(vehFolderName(v))}</b><button class="btn sm" data-a="veh-open" data-id="${v.id}">Ouvrir la fiche véhicule</button>${readOnly || v.retired ? "" : `<button class="btn sm primary" data-a="vdoc-form" data-veh="${v.id}">+ Ajouter un document</button>`}</div>
    <div class="panel pad vtool">${search}<span class="muted small">Le nom du dossier suit la fiche véhicule (identifiant, plaque, modèle) : modifiez-la dans la Flotte pour le changer.</span></div>
    ${ds.length ? `<div class="adoc-grid">${cur.map(vdocCard).join("")}</div>${old.length ? `<h3 class="adoc-h">Anciennes versions <span class="muted">${old.length}</span></h3><div class="adoc-grid">${old.map(vdocCard).join("")}</div>` : ""}`
      : `<div class="panel empty">Aucun document pour ce véhicule.</div>`}`;
}

/* anciens documents classés par « organisme » : un dossier est créé pour chaque organisme */
let migrating = false;
async function migrateIssuers() {
  if (migrating || readOnly || mode === "loading") return;
  const todo = (S.adminDocs || []).filter(d => !d.folderId && d.issuer); if (!todo.length) return;
  migrating = true;
  try {
    const byName = {};
    for (const f of S.adminFolders || []) byName[f.name.toLowerCase()] = f.id;
    for (const d of todo) {
      const k = d.issuer.trim().toLowerCase();
      if (!byName[k]) byName[k] = await save("adminFolders", null, { name: d.issuer.trim(), createdAt: today() });
      await patch("adminDocs", d.id, { folderId: byName[k] });
    }
  } finally { migrating = false; }
}
const adocCats = () => [...new Set([...ADOC_CATS, ...(S.adminDocs || []).map(d => d.category).filter(Boolean)])];

VIEWS.admin = {
  title: "Administration",
  render() {
    const tab = curTab("admin", "documents");
    const n = (S.adminDocs || []).length, nn = typeof notesAll === "function" ? notesAll().length : 0;
    return head("Administration", tab === "notes" ? "Notes personnelles et notes d'équipe, avec pièces jointes et liens vers les fiches" : "Documents et formulaires de l'entreprise, disponibles à tout moment",
        readOnly ? "" : tab === "notes" ? `<button class="btn primary" data-a="note-form">+ Nouvelle note</button>` : `<button class="btn" data-a="folder-form">Nouveau dossier</button>${assets ? `<button class="btn primary" data-a="adoc-add">Ajouter des documents</button>` : ""}`) +
      tabs("admin", [["documents", "Gestion Documents", n || ""], ["notes", "Notes", nn || ""]]) +
      (readOnly || !assets ? "" : `<input type="file" id="adoc-files" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.ods,.csv,.rtf,image/*">`) +
      ({ documents: adminDocs, notes: notesView })[tab]();
  }
};

function adocCard(d) {
  const k = fileKind(d), [kl, kc] = KIND_LABEL[k];
  return `<div class="panel adoc c-${kc}" ${readOnly ? "" : `draggable="true" data-adoc="${d.id}"`}>
    <button class="adoc-prev" data-a="adoc-view" data-id="${d.id}" title="Aperçu">
      ${k === "img" ? `<img src="${blobUrl(d.file)}" alt="" loading="lazy">` : `<span class="adoc-ic">${kl}</span>`}</button>
    <div class="adoc-body">
      <div class="row-sb"><b class="adoc-t">${d.pinned ? `<span class="pin" title="Épinglé">★</span> ` : ""}${esc(d.title)}</b></div>
      <div class="muted small">${adocF().folder && !UI.q ? "" : `<span class="fold-tag">📁 ${esc(folderName(folderOf(d)))}</span> · `}${esc(d.category || "Sans catégorie")}</div>
      ${d.description ? `<div class="small adoc-d">${esc(d.description)}</div>` : ""}
      <div class="muted small">${[d.version ? "Version " + esc(d.version) : "", fmtDate(d.updatedAt || d.uploadedAt), fmtSize(d.size)].filter(Boolean).join(" · ")}</div>
    </div>
    <div class="adoc-acts">
      <button class="btn sm" data-a="adoc-dl" data-id="${d.id}">Télécharger</button>
      <button class="btn sm" data-a="adoc-print" data-id="${d.id}" ${canPrint(d) ? "" : `title="Ouvrez le fichier dans ${kl} pour l'imprimer"`}>Imprimer</button>
      ${readOnly ? "" : `<button class="btn sm ghost adoc-edit" data-a="adoc-form" data-id="${d.id}" title="Modifier" aria-label="Modifier ${esc(d.title)}">✎</button>`}
    </div></div>`;
}

function adminDocs() {
  const all = (S.adminDocs || []).slice(), f = adocF(), q = (UI.q || "").toLowerCase().trim();
  const isVeh = String(f.folder).startsWith(VEH_F);
  if (f.folder && !isVeh && f.folder !== "_none" && f.folder !== "_dbx" && f.folder !== "_notes" && !(S.adminFolders || []).some(x => x.id === f.folder)) f.folder = "";
  if (SERVER && typeof dbxRefresh === "function" && DBX === null && !UI.dbxAsked) { UI.dbxAsked = 1; dbxRefresh().then(s => { if (s) render(true); }); }
  const inFolder = f.folder && !q;
  const scope = q ? all.concat(vehLinkedDocs(), typeof noteLinkedDocs === "function" ? noteLinkedDocs() : []) : f.folder ? docsIn(f.folder) : [];
  const drop = readOnly || !assets ? "" : `<label class="dropzone ${f.folder ? "" : "slim"}" id="adoc-drop" for="adoc-files">
    <b>Déposez vos fichiers ici</b><span class="muted small">${f.folder && f.folder !== "_none" ? `Ils seront rangés dans le dossier « ${esc(folderName(f.folder))} »` : "ou cliquez pour les choisir · PDF, Word, Excel, images"}</span></label>`;
  const search = `<input type="search" id="q" class="fsearch" placeholder="Rechercher dans tous les documents…" value="${esc(UI.q)}" aria-label="Rechercher un document">`;
  if (f.folder === "_dbx") return typeof dbxView === "function" && DBX && DBX.connected ? dbxView(search) : (f.folder = "", adminDocs());
  if (f.folder === "_notes" && !q) return typeof notesFolderView === "function" ? notesFolderView(search) : (f.folder = "", adminDocs());
  if (isVeh && !q) return f.folder === VEH_F ? vehRootView(search) : vehFolderView(f.folder.slice(VEH_F.length + 1), search);
  /* --- racine : les dossiers --- */
  if (!f.folder && !q) {
    const fs = folders(), none = docsIn("_none");
    const vdocs = vehLinkedDocs();
    const vehTile = S.vehicles.length ? `<div class="panel folder c-blue sys" data-a="folder-open" data-id="${VEH_F}" role="button" tabindex="0"><div class="folder-ic">${folderSvg}</div>
      <div class="folder-body"><b>Véhicules</b><div class="muted small">${plural(activeVehicles().length, "sous-dossier")} · ${plural(vdocs.length, "document")}</div><span class="chip info sm">Lié à la Flotte</span></div></div>` : "";
    const noteTile = typeof notesFolderTile === "function" ? notesFolderTile() : "";
    if (!fs.length && !all.length && !vehTile && !noteTile && !(typeof dbxTile === "function" && dbxTile())) return `<div class="panel empty">Aucun document pour l'instant. Créez un dossier par organisme (par exemple « Liege Airport ») puis déposez-y vos formulaires vierges : ils seront ici, prêts à télécharger ou imprimer.${readOnly ? "" : `<div class="mt"><button class="btn primary" data-a="folder-form">Créer un premier dossier</button></div>`}</div>`;
    const tile = (id, name, ds) => { const last = ds.map(d => d.updatedAt || d.uploadedAt || "").sort().pop();
      return `<div class="panel folder c-${id === "_none" ? "grey" : "yellow"}" data-a="folder-open" data-id="${id}" data-fdrop="${id}" role="button" tabindex="0">
        <div class="folder-ic">${folderSvg}</div><div class="folder-body"><b>${esc(name)}</b><div class="muted small">${plural(ds.length, "document")}${last ? " · " + fmtDate(last) : ""}</div></div>
        ${readOnly || id === "_none" ? "" : `<button class="x folder-ren" data-a="folder-form" data-id="${id}" title="Renommer" aria-label="Renommer le dossier ${esc(name)}">✎</button>`}</div>`; };
    return `<div class="panel pad vtool">${search}<span class="muted small">${plural(fs.length + (vehTile ? 1 : 0), "dossier")} · ${plural(all.length + vdocs.length, "document")}</span></div>
      <div class="folder-grid">${vehTile}${noteTile}${typeof dbxTile === "function" ? dbxTile() : ""}${fs.map(x => tile(x.id, x.name, docsIn(x.id))).join("")}${none.length ? tile("_none", "Sans dossier", none) : ""}</div>`;
  }
  /* --- dans un dossier (ou résultats de recherche) --- */
  const cats = adocCats().filter(c => scope.some(d => d.category === c));
  if (f.cat && !cats.includes(f.cat)) f.cat = "";
  const fname = d => d.vid ? "Véhicules › " + vehFolderName(veh(d.vid)) : d.nid ? "Notes › " + d.category.slice(7) : folderName(folderOf(d));
  const match = d => (!f.cat || d.category === f.cat) && (!q || [d.title, d.category, d.issuer, fname(d), d.description, d.fileName, d.version, d.number].join(" ").toLowerCase().includes(q));
  const rows = scope.filter(match).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.category || "").localeCompare(b.category || "") || a.title.localeCompare(b.title));
  const crumb = `<div class="crumb"><button class="linkbtn" data-a="folder-open" data-id="">Tous les dossiers</button><span aria-hidden="true">›</span>
    ${q ? `<b>Recherche « ${esc(UI.q)} »</b>` : `<span class="folder-ic sm c-yellow">${folderSvg}</span><b>${esc(folderName(f.folder))}</b>
    ${readOnly || f.folder === "_none" ? "" : `<button class="btn sm" data-a="folder-form" data-id="${f.folder}">Renommer</button>`}`}</div>`;
  const toolbar = `<div class="panel pad vtool">${search}
    ${cats.length > 1 ? `<div class="fpills"><button class="fpill ${!f.cat ? "on" : ""}" data-a="adoc-f" data-cat="">Toutes<span class="n">${scope.length}</span></button>${cats.map(c => `<button class="fpill ${f.cat === c ? "on" : ""}" data-a="adoc-f" data-cat="${esc(c)}">${esc(c)}<span class="n">${scope.filter(d => d.category === c).length}</span></button>`).join("")}</div>` : `<div class="fpills"></div>`}
    <div class="seg" role="group" aria-label="Affichage"><button data-a="adoc-f" data-view="cartes" class="${f.view === "cartes" ? "on" : ""}">Cartes</button><button data-a="adoc-f" data-view="liste" class="${f.view === "liste" ? "on" : ""}">Liste</button></div></div>`;
  let body;
  if (!rows.length) body = `<div class="panel empty">${q ? "Aucun document ne correspond à cette recherche." : "Ce dossier est vide. Déposez-y vos premiers fichiers."}</div>`;
  else if (f.view === "liste") body = `<div class="panel"><div class="tablewrap"><table><thead><tr><th>Document</th><th>Catégorie</th><th>Type</th><th>Mis à jour</th><th class="r"></th></tr></thead><tbody>${rows.map(d => { const [kl, kc] = KIND_LABEL[fileKind(d)]; return `<tr>
      <td><button class="linkbtn" data-a="adoc-view" data-id="${d.id}"><b>${d.pinned ? "★ " : ""}${esc(d.title)}</b></button>${d.description ? `<div class="muted small">${esc(d.description)}</div>` : ""}</td>
      <td class="small">${esc(d.category || "—")}${!inFolder ? `<div class="muted">📁 ${esc(fname(d))}</div>` : ""}</td><td><span class="chip ${({ red: "bad", blue: "info", green: "good" })[kc] || ""}">${d.file ? kl : "—"}</span></td>
      <td class="num small nowrap">${fmtDate(d.updatedAt || d.uploadedAt)}${d.version ? `<div class="muted">v. ${esc(d.version)}</div>` : ""}</td>
      <td class="r nowrap">${d.file ? `<button class="btn sm" data-a="adoc-dl" data-id="${d.id}">Télécharger</button> <button class="btn sm" data-a="adoc-print" data-id="${d.id}">Imprimer</button>` : ""}${readOnly ? "" : d.nid ? ` <button class="btn sm ghost" data-a="note-form" data-id="${d.nid}">Ouvrir la note</button>` : d.vid ? ` <button class="btn sm ghost" data-a="vdoc-form" data-veh="${d.vid}" data-id="${d.vdoc.id}">Modifier</button>` : ` <button class="btn sm ghost" data-a="adoc-form" data-id="${d.id}">Modifier</button>`}</td></tr>`; }).join("")}</tbody></table></div></div>`;
  else {
    const groups = {};
    for (const d of rows) (groups[d.pinned ? "★ Épinglés" : d.category || "Sans catégorie"] ||= []).push(d);
    const gs = Object.entries(groups);
    body = gs.map(([g, ds]) => `${gs.length > 1 ? `<h3 class="adoc-h">${esc(g)} <span class="muted">${ds.length}</span></h3>` : ""}<div class="adoc-grid">${ds.map(d => d.vid ? vdocCard(d) : d.nid ? noteFileCard(d) : adocCard(d)).join("")}</div>`).join("");
  }
  const others = folders().filter(x => x.id !== f.folder);
  const fbar = q || !others.length ? "" : `<div class="fbar"><span class="muted small">Autres dossiers${readOnly ? "" : " · glissez une carte dessus pour l'y déplacer"} :</span>${others.map(x => `<button class="fchip" data-a="folder-open" data-id="${x.id}" data-fdrop="${x.id}">📁 ${esc(x.name)} <span class="muted">${docsIn(x.id).length}</span></button>`).join("")}${f.folder !== "_none" && docsIn("_none").length ? `<button class="fchip" data-a="folder-open" data-id="_none" data-fdrop="_none">📁 Sans dossier</button>` : ""}</div>`;
  return crumb + fbar + (q ? "" : drop) + toolbar + body;
}
VIEWS.admin.after = () => {
  migrateIssuers();
  const inp = document.getElementById("adoc-files");
  if (inp) inp.onchange = () => { if (inp.files.length) adocUpload([...inp.files]); inp.value = ""; };
  const z = document.getElementById("adoc-drop"); if (!z) return;
  ["dragenter", "dragover"].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.remove("over"); }));
  z.addEventListener("drop", e => { const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) adocUpload(fs); });
};
ACTIONS["adoc-f"] = el => {
  const f = adocF(), d = el.dataset;
  if (d.view) { f.view = d.view; try { localStorage.setItem("st-adoc-view", d.view); } catch (e) {} } else f.cat = d.cat || "";
  UI.focusQ = false; render(true);
};
ACTIONS["adoc-add"] = () => document.getElementById("adoc-files")?.click();

/* envoi de plusieurs fichiers puis fiche de classement (titre, catégorie…) */
async function adocUpload(files, targetFolder) {
  if (!assets) { toast("L'ajout de fichiers n'est pas disponible dans cette vue."); return; }
  const big = files.filter(f => f.size > 25 * 1048576);
  if (big.length) toast(`${plural(big.length, "fichier")} de plus de 25 Mo ignoré${big.length > 1 ? "s" : ""}`);
  files = files.filter(f => f.size <= 25 * 1048576); if (!files.length) return;
  toast(`Envoi de ${plural(files.length, "fichier")}…`);
  const ups = [];
  for (const f of files) {
    try { const r = await assets.upload(f, f.type ? undefined : { type: "application/octet-stream" }); ups.push({ f, r }); }
    catch (e) { toast(`« ${f.name} » n'a pas pu être envoyé.`); }
  }
  if (!ups.length) return;
  const cat = adocF().cat || "";
  const curF = targetFolder ?? (adocF().folder && adocF().folder !== "_none" ? adocF().folder : "");
  const m = modal(`${mHead(ups.length > 1 ? `Classer ${ups.length} documents` : "Classer le document")}<form><div class="body">
    <div class="fields">${field("ad-folder", "Dossier", curF, { type: "select", options: [["", "Sans dossier"], ...folders().map(f => [f.id, f.name]), ["__new", "+ Nouveau dossier…"]] })}${field("ad-newf", "Nom du nouveau dossier", "", { ph: "Liege Airport…" })}${field("ad-cat", "Catégorie (pour tous)", cat, { ph: "Formulaires, procédures…" })}</div>
    <datalist id="ad-cats">${adocCats().map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    <h3>Nom de chaque document</h3><div class="stack">${ups.map(({ f }, i) => `<label class="f"><span class="muted small mono">${esc(f.name)} · ${fmtSize(f.size)}</span><input id="ad-t${i}" value="${esc(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim())}" required></label>`).join("")}</div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`);
  m.querySelector("#ad-cat").setAttribute("list", "ad-cats");
  const nf = m.querySelector("#ad-newf").closest(".f") || m.querySelector("#ad-newf");
  const syncF = () => { nf.style.display = val("ad-folder") === "__new" ? "" : "none"; if (val("ad-folder") === "__new") m.querySelector("#ad-newf").focus(); };
  m.querySelector("#ad-folder").onchange = syncF; syncF();
  let saved = false;
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    let fid = val("ad-folder");
    if (fid === "__new") {
      const nm = val("ad-newf").trim(); if (!nm) { m.querySelector("#ad-newf").focus(); toast("Indiquez le nom du nouveau dossier."); return; }
      fid = (S.adminFolders || []).find(f => f.name.toLowerCase() === nm.toLowerCase())?.id || await save("adminFolders", null, { name: nm, createdAt: today() });
    }
    saved = true;
    const now = today();
    for (const [i, { f, r }] of ups.entries()) await save("adminDocs", null, { title: val("ad-t" + i).trim() || f.name, category: val("ad-cat").trim(), folderId: fid, description: "", file: r.id, mime: r.contentType || f.type || "", fileName: f.name, size: f.size, version: "", pinned: false, uploadedAt: now, updatedAt: now, prev: [] });
    closeModal(); adocF().folder = fid || "_none"; UI.q = ""; render(true); toast(`${plural(ups.length, "document")} ajouté${ups.length > 1 ? "s" : ""} dans « ${folderName(fid || "_none")} »`);
  };
  // fenêtre fermée sans enregistrer : on retire les fichiers envoyés
  const obs = new MutationObserver(() => { if (!document.body.contains(m)) { obs.disconnect(); if (!saved) ups.forEach(({ r }) => assets.delete(r.id).catch(() => { })); } });
  obs.observe(document.body, { childList: true, subtree: true });
}

ACTIONS["adoc-form"] = el => {
  const d = (S.adminDocs || []).find(x => x.id === el.dataset.id); if (!d) return;
  const m = modal(`${mHead("Modifier le document")}<form><div class="body"><div class="fields">
    ${field("ae-title", "Nom du document", d.title, { required: true, wide: true })}${field("ae-folder", "Dossier", d.folderId || "", { type: "select", options: [["", "Sans dossier"], ...folders().map(f => [f.id, f.name])] })}${field("ae-cat", "Catégorie", d.category)}
    ${field("ae-version", "Version / édition", d.version, { ph: "2026-03, rév. 4…" })}<label class="chk"><input type="checkbox" id="ae-pin" ${d.pinned ? "checked" : ""}> Épingler en haut de la liste</label>
    ${field("ae-desc", "Description (quand l'utiliser, à qui l'envoyer…)", d.description, { type: "textarea", wide: true })}</div>
    <datalist id="ae-cats">${adocCats().map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    <div class="panel pad stack"><div class="row-sb wrap"><span class="small"><b>Fichier actuel</b> · <span class="mono">${esc(d.fileName || "")}</span> ${fmtSize(d.size)}</span>
      ${assets ? `<label class="btn sm">Remplacer par une nouvelle version<input type="file" id="ae-file" hidden></label>` : ""}</div>
      ${(d.prev || []).length ? `<div class="small muted">Versions précédentes : ${d.prev.map((p, i) => `<a href="${blobUrl(p.file)}" target="_blank" rel="noopener">${esc(p.version || fmtDate(p.date))}</a>`).join(" · ")}</div>` : ""}</div></div>
    <footer><div class="left"><button type="button" class="btn danger" data-a="adoc-del" data-id="${d.id}">Supprimer</button></div><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`);
  m.querySelector("#ae-cat").setAttribute("list", "ae-cats");
  let repl = null;
  m.querySelector("#ae-file")?.addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try { repl = { f, r: await assets.upload(f, f.type ? undefined : { type: "application/octet-stream" }) }; toast("Nouvelle version prête : enregistrez pour la publier"); }
    catch (x) { toast("Le fichier n'a pas pu être envoyé."); }
  });
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const upd = Object.assign(strip(d), { title: val("ae-title").trim(), category: val("ae-cat").trim(), folderId: val("ae-folder"), version: val("ae-version").trim(), pinned: m.querySelector("#ae-pin").checked, description: val("ae-desc") });
    if (repl) Object.assign(upd, { prev: [...(d.prev || []), { file: d.file, fileName: d.fileName, version: d.version, date: d.updatedAt || d.uploadedAt }].slice(-5), file: repl.r.id, mime: repl.r.contentType || repl.f.type || "", fileName: repl.f.name, size: repl.f.size, updatedAt: today() });
    await save("adminDocs", d.id, upd); closeModal(); toast("Document enregistré");
  };
};
ACTIONS["adoc-del"] = el => confirmBox("Supprimer ce document de la bibliothèque ?", async () => {
  const d = (S.adminDocs || []).find(x => x.id === el.dataset.id);
  await remove("adminDocs", el.dataset.id);
  if (d && assets) [d.file, ...(d.prev || []).map(p => p.file)].filter(Boolean).forEach(id => assets.delete(id).catch(() => { }));
});

ACTIONS["adoc-view"] = el => {
  const d = findAdoc(el.dataset.id); if (!d) return;
  const k = fileKind(d), url = blobUrl(d.file);
  modal(`${mHead(esc(d.title))}<div class="body adoc-view">
    ${k === "pdf" ? `<iframe src="${url}" title="${esc(d.title)}"></iframe>` : k === "img" ? `<img src="${url}" alt="${esc(d.title)}">`
      : `<div class="empty">L'aperçu n'est pas disponible pour les fichiers ${KIND_LABEL[k][0]}. Téléchargez-le pour l'ouvrir.</div>`}
    ${d.description ? `<p class="small">${esc(d.description)}</p>` : ""}</div>
    <footer>${d.vid ? `<div class="left"><button class="btn" data-a="veh-open" data-id="${d.vid}">Fiche véhicule</button></div>` : ""}<a class="btn" href="${url}" target="_blank" rel="noopener">Ouvrir dans un onglet</a><button class="btn" data-a="adoc-print" data-id="${d.id}">Imprimer</button><button class="btn primary" data-a="adoc-dl" data-id="${d.id}">Télécharger</button></footer>`, "lg");
};

ACTIONS["adoc-dl"] = async el => {
  const d = findAdoc(el.dataset.id); if (!d) return;
  try {
    const res = await fetch(blobUrl(d.file)); if (!res.ok) throw new Error(res.status);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (downloads) return offerFile(d.fileName || d.title, buf);
    throw new Error("no downloads");
  } catch (e) { window.open(blobUrl(d.file), "_blank", "noopener"); }
};

ACTIONS["adoc-print"] = el => {
  const d = findAdoc(el.dataset.id); if (!d) return;
  if (!canPrint(d)) { toast(`Les fichiers ${KIND_LABEL[fileKind(d)][0]} s'impriment depuis leur logiciel : téléchargement lancé.`); return ACTIONS["adoc-dl"](el); }
  document.getElementById("print-frame")?.remove();
  const fr = document.createElement("iframe");
  fr.id = "print-frame"; fr.className = "print-frame"; fr.setAttribute("aria-hidden", "true");
  const url = blobUrl(d.file);
  if (fileKind(d) === "img") fr.srcdoc = `<html><head><style>@page{margin:10mm}html,body{margin:0}img{max-width:100%;max-height:100vh;display:block;margin:auto}</style></head><body><img src="${location.origin}${url}" onload="setTimeout(()=>print(),150)"></body></html>`;
  else {
    fr.src = url;
    fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { window.open(url, "_blank", "noopener"); toast("Ouvert dans un onglet : imprimez depuis le lecteur PDF."); } };
  }
  document.body.appendChild(fr);
  toast("Préparation de l'impression…");
};

ACTIONS["folder-open"] = el => { const f = adocF(); f.folder = el.dataset.id || ""; f.cat = ""; UI.q = ""; render(true); window.scrollTo(0, 0); };
ACTIONS["folder-form"] = el => {
  const x = (S.adminFolders || []).find(f => f.id === el.dataset.id) || {};
  const n = x.id ? docsIn(x.id).length : 0;
  const m = modal(`${mHead(x.id ? "Renommer le dossier" : "Nouveau dossier")}<form><div class="body">
    ${field("fo-name", "Nom du dossier", x.name, { required: true, ph: "Autorité, aéroport, client…" })}
    ${x.id ? `<div class="hint">${plural(n, "document")} dans ce dossier : ${n > 1 ? "ils restent" : "il reste"} rangé${n > 1 ? "s" : ""} dedans sous le nouveau nom.</div>` : ""}<div class="err" id="fo-err"></div></div>
    <footer>${x.id ? `<div class="left"><button type="button" class="btn danger" data-a="folder-del" data-id="${x.id}">Supprimer le dossier</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary">${x.id ? "Renommer" : "Créer"}</button></footer></form>`);
  setTimeout(() => { const i = m.querySelector("#fo-name"); i.focus(); i.select(); }, 30);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const name = val("fo-name").trim().replace(/\s+/g, " ");
    if ((S.adminFolders || []).some(f => f.id !== x.id && f.name.toLowerCase() === name.toLowerCase())) { m.querySelector("#fo-err").textContent = `Un dossier « ${name} » existe déjà.`; return; }
    const id = await save("adminFolders", x.id, Object.assign(strip(x), { name }, x.id ? {} : { createdAt: today() }));
    closeModal(); toast(x.id ? "Dossier renommé" : "Dossier créé");
    if (!x.id) { adocF().folder = id; UI.q = ""; render(true); }
  };
};
ACTIONS["folder-del"] = el => {
  const n = docsIn(el.dataset.id).length;
  confirmBox(n ? `Supprimer ce dossier ? ${plural(n, "document")} ${n > 1 ? "seront déplacés" : "sera déplacé"} dans « Sans dossier » (aucun fichier n'est supprimé).` : "Supprimer ce dossier vide ?", async () => {
    for (const d of docsIn(el.dataset.id)) await patch("adminDocs", d.id, { folderId: "" });
    await remove("adminFolders", el.dataset.id);
    if (adocF().folder === el.dataset.id) adocF().folder = "";
  });
};
/* glisser une carte de document sur un dossier (vue racine) — ou un fichier du PC sur un dossier */
document.addEventListener("dragstart", e => { const c = e.target.closest && e.target.closest("[data-adoc]"); if (c) { e.dataTransfer.setData("text/x-adoc", c.dataset.adoc); e.dataTransfer.effectAllowed = "move"; } });
document.addEventListener("dragover", e => { const t = e.target.closest && e.target.closest("[data-fdrop]"); if (t && !readOnly) { e.preventDefault(); t.classList.add("dropover"); } });
document.addEventListener("dragleave", e => { const t = e.target.closest && e.target.closest("[data-fdrop]"); if (t && !t.contains(e.relatedTarget)) t.classList.remove("dropover"); });
document.addEventListener("drop", async e => {
  const t = e.target.closest && e.target.closest("[data-fdrop]"); if (!t || readOnly) return;
  e.preventDefault(); t.classList.remove("dropover");
  const fid = t.dataset.fdrop === "_none" ? "" : t.dataset.fdrop;
  const id = e.dataTransfer.getData("text/x-adoc");
  if (id) { await patch("adminDocs", id, { folderId: fid }); toast("Déplacé dans « " + folderName(fid || "_none") + " »"); return; }
  const fs = [...(e.dataTransfer.files || [])]; if (fs.length) { adocF().folder = t.dataset.fdrop; render(true); adocUpload(fs, fid); }
});
