/* =========================================================================
   Import des documents véhicules depuis un ZIP Dropbox (ou un dossier)
   Structure attendue : Vehicles/<ID> - <PLAQUE> - <MODÈLE>/[Expired/][Photo/]fichiers
   ========================================================================= */
const DBX_TYPES = [
  [/car[\s_-]?pass/i, "autre", "Car-Pass"],
  [/car[\s_-]?kit/i, "autre", "Car Kit (équipement de bord)"],
  [/conform|\bcoc\b/i, "coc", "Certificat de conformité"],
  [/registr|immatric|kenteken/i, "immat", "Certificat d'immatriculation"],
  [/inspect|contr[ôo]le[\s_-]?tech|keuring|\bct\b/i, "ct", "Contrôle technique"],
  [/insur|assuran|carte[\s_-]?verte|green[\s_-]?card/i, "assurance", "Assurance"],
  [/\blpg\b|\bgpl\b/i, "lpg", "LPG"],
  [/badge|airport|a[ée]roport/i, "badge", "Badge aéroport LGG"],
  [/tachy/i, "tachy", "Tachygraphe"],
  [/\badr\b/i, "adr", "Certificat ADR"],
  [/leas|renting|location|contrat|contract/i, "leasing", "Contrat de leasing / location"],
  [/invoice|facture|bill\b/i, "autre", "Facture"],
  [/^brn[0-9a-f]{6,}|^scan/i, "autre", "Document scanné"]
];
const DBX_MIME = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", txt: "text/plain" };
const DBX_MAX = 20 * 1024 * 1024;
const dbxNorm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\s]+/g, " ").trim();
const dbxExt = n => (String(n).match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || "";
function dbxVehicleOf(segs) {
  const plates = new Map(S.vehicles.filter(v => v.plate).map(v => [v.plate.replace(/[^A-Z0-9]/gi, "").toUpperCase(), v]));
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i], m = s.match(/^\s*([A-Za-z]?\d{1,3})\s*-/);
    if (!m) continue;
    const no = normFleetNo(m[1]), rest = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const byNo = S.vehicles.filter(v => fleetNo(v) === no);
    const byPlate = [...plates.entries()].find(([p]) => p.length >= 5 && rest.includes(p))?.[1];
    const v = byNo.length === 1 ? byNo[0] : byNo.find(x => x === byPlate) || byNo.find(x => !x.retired) || byPlate;
    return { v, folder: s };
  }
  return { v: null, folder: segs[segs.length - 2] || segs[0] || "" };
}
function dbxClassify(path, name) {
  const segs = path.split("/").filter(Boolean), dirs = segs.slice(0, -1).map(dbxNorm);
  const ext = dbxExt(name), base = name.replace(/\.[^.]+$/, "");
  if (/^(\.|~\$|thumbs\.db$|desktop\.ini$)/i.test(name)) return null;
  if (dirs.some(d => /^qr ?code/.test(d)) || /\bqr\b/i.test(base) && ["png", "jpg", "jpeg", "svg"].includes(ext)) return { skip: "QR code" };
  const old = dirs.some(d => /expir|ancien|old|archive|perime/.test(d));
  const isImg = ["jpg", "jpeg", "png", "webp", "heic", "gif"].includes(ext);
  if (dirs.some(d => /^photo|^pictures?$|^images?$/.test(d)) || (isImg && !DBX_TYPES.some(([re]) => re.test(base)))) return { photo: true, ext };
  if (!DBX_MIME[ext]) return { skip: "format non pris en charge" };
  const hit = DBX_TYPES.find(([re]) => re.test(base));
  let [, type, label] = hit || [null, "autre", base.replace(/^\d+\.\s*/, "").trim() || base];
  if (type === "assurance") { const ins = base.match(/\b(AXA|AG|Ethias|Allianz|Baloise|P&V|Vivium|Federale)\b/i); if (ins) label = "Assurance " + ins[1].toUpperCase(); }
  if (type === "lpg") label = /reserv|tank/i.test(base) ? "LPG – réservoir" : /install/i.test(base) ? "LPG – installation" : "LPG";
  const year = (base.match(/\b(20\d\d)\b/) || [])[1] || "";
  return { type, label, old, year, ext };
}
async function dbxDownscale(blob) {
  try {
    const url = URL.createObjectURL(blob), img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    return await new Promise(r => c.toBlob(b => r(b), "image/jpeg", 0.85));
  } catch (e) { return blob.size <= DBX_MAX ? blob : null; }
}
async function dbxReadInput(files) {
  const out = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      if (!window.JSZip) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
      const z = await JSZip.loadAsync(f);
      z.forEach((p, e) => { if (!e.dir) out.push({ path: p, name: p.split("/").pop(), size: e._data?.uncompressedSize || 0, get: () => e.async("blob") }); });
    } else out.push({ path: f.webkitRelativePath || f.name, name: f.name, size: f.size, get: async () => f });
  }
  return out;
}
ACTIONS["dbx-import"] = () => {
  if (!assets) { toast("L'ajout de fichiers est réservé aux éditeurs de l'application."); return; }
  const m = modal(`${mHead("Importer les documents des véhicules (Dropbox)")}<div class="body">
    <ol class="small dbx-steps"><li>Dans Dropbox, ouvrez <b>WAYS SPRL Utility</b>, survolez le dossier <b>Vehicles</b>, cliquez sur <b>⋯</b> puis <b>Télécharger</b>. Dropbox crée un fichier <b>Vehicles.zip</b>.</li>
      <li>Déposez ce ZIP ci-dessous (ou le dossier d'un seul véhicule). Chaque sous-dossier « ID - plaque - modèle » est rattaché à sa fiche.</li></ol>
    <label class="dropzone" for="dbx-file"><b>Choisir le ZIP</b><span class="muted small">ou le déposer ici · un dossier entier est aussi accepté</span></label>
    <input type="file" id="dbx-file" accept=".zip,application/zip,.pdf,image/*,.doc,.docx" multiple hidden>
    <div class="row-g"><label class="linkbtn small" for="dbx-dir">Choisir un dossier plutôt qu'un ZIP</label><input type="file" id="dbx-dir" webkitdirectory multiple hidden></div>
    <div id="dbx-step"></div></div>
    <footer><button type="button" class="btn" data-close>Fermer</button><button type="button" class="btn primary" id="dbx-go" disabled>Importer</button></footer>`, "lg");
  const z = m.querySelector(".dropzone"), step = m.querySelector("#dbx-step"), go = m.querySelector("#dbx-go");
  let plan = null, running = false;
  const take = async files => {
    if (!files?.length || running) return;
    step.innerHTML = `<div class="muted">Lecture du contenu…</div>`; go.disabled = true;
    let entries;
    try { entries = await dbxReadInput([...files]); } catch (e) { step.innerHTML = `<div class="err">Ce fichier n'a pas pu être lu. Vérifiez qu'il s'agit bien du ZIP téléchargé depuis Dropbox.</div>`; return; }
    const byV = new Map(), unmatched = new Map(), skipped = [];
    for (const en of entries) {
      const c = dbxClassify(en.path, en.name); if (!c) continue;
      if (c.skip) { skipped.push(en.name); continue; }
      const { v, folder } = dbxVehicleOf(en.path.split("/").filter(Boolean));
      if (!v) { unmatched.set(folder, (unmatched.get(folder) || 0) + 1); continue; }
      if (!byV.has(v.id)) byV.set(v.id, { v, docs: [], photos: [] });
      const g = byV.get(v.id);
      if (c.photo) g.photos.push(en); else if (en.size > DBX_MAX) skipped.push(en.name + " (> 20 Mo)"); else g.docs.push({ en, c });
    }
    plan = [...byV.values()].sort((a, b) => (fleetNo(a.v) || "zzz").localeCompare(fleetNo(b.v) || "zzz", undefined, { numeric: true }));
    const nDocs = plan.reduce((a, g) => a + g.docs.length, 0), nOld = plan.reduce((a, g) => a + g.docs.filter(d => d.c.old).length, 0);
    step.innerHTML = plan.length ? `<div class="banner info"><b>${plural(plan.length, "véhicule")} reconnu${plan.length > 1 ? "s" : ""}</b> · ${plural(nDocs, "document")} dont ${nOld} expiré${nOld > 1 ? "s" : ""}${skipped.length ? ` · ${skipped.length} ignoré${skipped.length > 1 ? "s" : ""} (QR codes, formats non pris en charge)` : ""}</div>
      <div class="row-g wrap" style="margin:8px 0"><label class="chk"><input type="checkbox" id="dbx-old" checked> Inclure les documents expirés (rangés dans « Anciens documents »)</label>
        <label class="chk"><input type="checkbox" id="dbx-photo" checked> Utiliser une photo du dossier « Photo » si la fiche n'en a pas</label></div>
      <div class="tablewrap dbx-plan"><table><thead><tr><th>Véhicule</th><th class="r">Documents</th><th class="r">Expirés</th><th class="r">Photos</th><th>État</th></tr></thead><tbody>
      ${plan.map((g, i) => `<tr><td>${noBadge(g.v, 1)} <span class="plate sm">${esc(g.v.plate)}</span> ${esc(g.v.model)}${g.v.retired ? ` <span class="chip dark">retiré</span>` : ""}</td><td class="r num">${g.docs.filter(d => !d.c.old).length}</td><td class="r num">${g.docs.filter(d => d.c.old).length}</td><td class="r num">${g.photos.length}</td><td class="small" id="dbx-s${i}">—</td></tr>`).join("")}</tbody></table></div>
      ${unmatched.size ? `<div class="small muted" style="margin-top:8px">Dossiers sans fiche correspondante (ignorés) : ${[...unmatched.keys()].map(esc).join(" · ")}</div>` : ""}
      <div class="dbx-prog hidden" id="dbx-prog"><div class="lifebar"><span id="dbx-bar" style="width:0%"></span></div><div class="small muted" id="dbx-msg"></div></div>`
      : `<div class="err">Aucun dossier de véhicule reconnu. Les dossiers doivent commencer par l'identifiant, par exemple « 15- 2FPV282 - Volvo V60 ».</div>`;
    go.disabled = !plan.length;
  };
  z.addEventListener("dragover", e => { e.preventDefault(); z.classList.add("over"); });
  z.addEventListener("dragleave", () => z.classList.remove("over"));
  z.addEventListener("drop", e => { e.preventDefault(); z.classList.remove("over"); take(e.dataTransfer.files); });
  m.querySelector("#dbx-file").onchange = e => take(e.target.files);
  m.querySelector("#dbx-dir").onchange = e => take(e.target.files);
  go.onclick = async () => {
    if (!plan || running) return; running = true; go.disabled = true;
    const withOld = m.querySelector("#dbx-old").checked, withPhoto = m.querySelector("#dbx-photo").checked;
    const total = plan.reduce((a, g) => a + g.docs.filter(d => withOld || !d.c.old).length + (withPhoto && g.photos.length ? 1 : 0), 0) || 1;
    let done = 0, added = 0, attached = 0, dup = 0, fail = 0;
    const prog = m.querySelector("#dbx-prog"), bar = m.querySelector("#dbx-bar"), msg = m.querySelector("#dbx-msg");
    prog.classList.remove("hidden");
    const tick = t => { done++; bar.style.width = Math.round(done / total * 100) + "%"; msg.textContent = t; };
    for (let i = 0; i < plan.length; i++) {
      const g = plan[i], cell = m.querySelector("#dbx-s" + i); cell.textContent = "En cours…";
      const fresh = veh(g.v.id); if (!fresh) { cell.textContent = "Fiche introuvable"; continue; }
      const docs = (fresh.docs || []).map(d => Object.assign({}, d));
      const known = new Set(docs.flatMap(d => [d.fileName, ...(d.prev || []).map(p => p.fileName)]).filter(Boolean).map(dbxNorm));
      const upd = {}; let n = 0;
      const order = g.docs.filter(d => withOld || !d.c.old).sort((a, b) => (a.c.old - b.c.old));
      for (const { en, c } of order) {
        const key = dbxNorm(en.name), label = `${fleetNo(g.v) || g.v.plate} · ${en.name}`;
        if (known.has(key)) { dup++; tick(label + " (déjà présent)"); continue; }
        try {
          const blob = await en.get(), type = DBX_MIME[c.ext] || blob.type || "application/octet-stream";
          const r = await assets.upload(new File([blob], en.name, { type }));
          const file = { file: r.id, mime: r.contentType || type, fileName: en.name, size: blob.size };
          const cur = !c.old && c.type !== "autre" ? docs.filter(d => d.type === c.type && !d.old && !d.file).sort((a, b) => (b.expires || b.issued || "").localeCompare(a.expires || a.issued || ""))[0] : null;
          if (cur) { Object.assign(cur, file); attached++; }
          else {
            docs.push(Object.assign({ id: uid(), type: c.type, name: c.label, number: "", issued: "", expires: "", note: c.old ? `Expiré (Dropbox)${c.year ? " · " + c.year : ""}` : "Importé de Dropbox", old: c.old || undefined }, file));
            added++;
          }
          known.add(key); n++; tick(label);
        } catch (e) { fail++; tick(label + " : échec"); }
      }
      if (withPhoto && g.photos.length && !fresh.photo) {
        try {
          const ph = g.photos.slice().sort((a, b) => a.size - b.size).find(p => p.size > 20000) || g.photos[0];
          const small = await dbxDownscale(await ph.get());
          if (small) { const r = await assets.upload(new File([small], "photo.jpg", { type: "image/jpeg" })); upd.photo = r.id; n++; }
          tick(`${fleetNo(g.v)} · photo`);
        } catch (e) { fail++; tick(`${fleetNo(g.v)} · photo : échec`); }
      }
      if (n) { upd.docs = docs.map(d => { const x = Object.assign({}, d); if (x.old === undefined) delete x.old; return x; }); await patch("vehicles", g.v.id, upd); }
      cell.innerHTML = n ? `<span class="chip good">${plural(n, "ajout")}</span>` : `<span class="muted">rien de nouveau</span>`;
    }
    msg.textContent = `Terminé : ${plural(attached, "fichier")} joint${attached > 1 ? "s" : ""} aux documents existants, ${plural(added, "nouveau document", "nouveaux documents")}${dup ? `, ${dup} déjà présent${dup > 1 ? "s" : ""}` : ""}${fail ? `, ${fail} échec${fail > 1 ? "s" : ""}` : ""}.`;
    bar.style.width = "100%"; running = false; toast("Import terminé"); render(true);
  };
};
