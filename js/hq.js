"use strict";
/* ======================= FORMULAIRES ET PAGE HEADQUARTERS =======================
   Formulaires : les formulaires approuvés par l'autorité (MOE), toujours à jour, à télécharger (fichier) ou à ouvrir (lien OneDrive…).
   Tout le monde les consulte ; Headquarters, les administrateurs et le bureau les gèrent.
   forms/<id> = { no (n° du formulaire), title, rev, revDate, cat, approval (approuvé par / référence), file, fileName, url, notes, active }
   Page Headquarters : l'espace du training manager (fonction Headquarters) : personnel et licences, échéances du personnel, formulaires. */
const FORM_CAT = { moe: "MOE / procédures", maint: "Maintenance", quality: "Qualité / occurrence reporting", hr: "Personnel / formation", tools: "Outillage", stores: "Magasin / pièces", station: "Station", other: "Autre" };
const canForms = () => !readOnly && isOffice();
const formsActive = () => S.forms.filter(f => f.active !== false).sort((a, b) => String(a.no || "").localeCompare(String(b.no || ""), undefined, { numeric: true }) || String(a.title || "").localeCompare(String(b.title || "")));
const formOpenUrl = f => f.file ? blobUrl(f.file) : f.url || "";

VIEWS.formulaires = {
  render() {
    return head("Formulaires", "Les formulaires approuvés par l'autorité, toujours dans leur dernière révision. Cliquez pour ouvrir ou télécharger.",
      canForms() ? `<button class="btn primary" data-a="form-form">Ajouter un formulaire</button>` : "") + formsList();
  }
};
function formsList() {
  const q = UI.q.toLowerCase(), f = UI.filter;
  const rows = (f === "anciens" ? S.forms.filter(x => x.active === false) : formsActive()).filter(x => (f === "tous" || f === "anciens" || x.cat === f)
    && (!q || [x.no, x.title, x.rev, x.notes, FORM_CAT[x.cat]].join(" ").toLowerCase().includes(q)));
  const cats = Object.entries(FORM_CAT).filter(([k]) => S.forms.some(x => x.cat === k && x.active !== false));
  return `<div class="panel">${searchBar("N° ou titre du formulaire…", [["tous", "Tous"], ...cats, ...(S.forms.some(x => x.active === false) ? [["anciens", "Retirés"]] : [])])}
    <div class="tablewrap"><table><thead><tr><th>N°</th><th>Formulaire</th><th>Révision</th><th>Catégorie</th><th></th></tr></thead><tbody>${rows.map(x => `<tr class="${canForms() ? "click" : ""}" ${canForms() ? `data-a="form-form" data-id="${x.id}"` : ""}>
      <td class="mono"><b>${esc(x.no || "—")}</b></td><td><b>${esc(x.title || "")}</b>${x.approval ? `<div class="small muted">${esc(tr("Approuvé"))} : ${esc(x.approval)}</div>` : ""}${x.notes ? `<div class="small muted">${esc(x.notes.slice(0, 120))}</div>` : ""}</td>
      <td class="small">${esc(x.rev ? "Rev " + x.rev : "—")}${x.revDate ? `<div class="muted">${fmtDate(x.revDate)}</div>` : ""}</td><td class="small">${esc(tr(FORM_CAT[x.cat] || "—"))}</td>
      <td class="r">${formOpenUrl(x) ? `<a class="btn sm primary" href="${esc(formOpenUrl(x))}" target="_blank" rel="noopener" data-stop>${esc(tr(x.file ? "Télécharger" : "Ouvrir"))} ↗</a>` : `<span class="muted small">${esc(tr("Pas de fichier"))}</span>`}</td></tr>`).join("")}</tbody></table>
      ${rows.length ? "" : `<div class="empty">${S.forms.length ? esc(tr("Aucun formulaire ne correspond.")) : esc(tr("Aucun formulaire pour l'instant. Headquarters les ajoute ici (fichier PDF / Word, ou lien OneDrive)."))}</div>`}</div></div>`;
}
ACTIONS["form-form"] = el => {
  if (!canForms()) return;
  const f = S.forms.find(x => x.id === el.dataset.id) || { cat: "maint", active: true };
  const m = modal(`${mHead(f.id ? "Formulaire " + esc(f.no || "") : "Nouveau formulaire")}<form><div class="body"><div class="fields">
    ${field("fm-no", "N° du formulaire", f.no, { cls: "mono", required: true, autofocus: true, ph: "Ex. CT-145-F-012" })}${field("fm-title", "Titre", f.title, { required: true })}
    ${field("fm-rev", "Révision", f.rev, { ph: "Ex. 3" })}${field("fm-revd", "Date de révision", f.revDate, { type: "date" })}
    ${field("fm-cat", "Catégorie", f.cat, { type: "select", options: Object.entries(FORM_CAT) })}${field("fm-appr", "Approuvé par / référence (autorité, MOE)", f.approval, { ph: "Ex. CAAI, MOE 1.8" })}
    ${field("fm-url", "Lien (OneDrive, SharePoint…) si pas de fichier", f.url, { wide: true, ph: "https://…" })}
    ${field("fm-notes", "Quand l'utiliser", f.notes, { type: "textarea", wide: true })}</div>
    ${assets ? `<label class="f">${f.file ? "Remplacer le fichier (nouvelle révision)" : "Fichier du formulaire (PDF, Word, Excel)"}<input type="file" id="fm-file"></label>` : ""}
    ${f.file ? `<div><a class="btn sm" href="${esc(blobUrl(f.file))}" target="_blank" rel="noopener">${esc(f.fileName || tr("Ouvrir le fichier"))}</a></div>` : ""}
    ${f.id ? `<label class="chk"><input type="checkbox" id="fm-old" ${f.active === false ? "checked" : ""}> ${esc(tr("Formulaire retiré (plus utilisé)"))}</label>` : ""}<div class="err" id="fm-err"></div></div>
    <footer>${f.id ? `<div class="left"><button type="button" class="btn danger" data-a="form-del" data-id="${f.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`, "lg");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const url = val("fm-url").trim();
    if (url && !/^https:\/\//i.test(url)) { m.querySelector("#fm-err").textContent = tr("Le lien doit commencer par https://"); return; }
    const data = Object.assign(strip(f), { no: val("fm-no").trim().toUpperCase(), title: val("fm-title").trim(), rev: val("fm-rev").trim(), revDate: val("fm-revd"), cat: val("fm-cat"), approval: val("fm-appr").trim(), url, notes: val("fm-notes"),
      active: !(m.querySelector("#fm-old")?.checked) });
    const file = m.querySelector("#fm-file")?.files[0];
    if (file) { try { const r = await assets.upload(file, file.type ? undefined : { type: "application/pdf" }); data.file = r.id; data.fileName = file.name; }
      catch (er) { m.querySelector("#fm-err").textContent = tr(er.code === "too_large" ? "Fichier trop lourd (20 Mo maximum)." : er.code === "unsupported_type" ? "Format non accepté." : "Le fichier n'a pas pu être envoyé. Réessayez."); return; } }
    if (!data.file && !data.url) { m.querySelector("#fm-err").textContent = tr("Joignez le fichier ou indiquez un lien."); return; }
    await save("forms", f.id, data); closeModal(); toast("Formulaire enregistré");
  };
};
ACTIONS["form-del"] = el => confirmBox("Supprimer ce formulaire ? Pour une ancienne révision, cochez plutôt « Formulaire retiré ».", () => remove("forms", el.dataset.id));

/* ---------- page Headquarters ---------- */
VIEWS.headquarters = {
  render() {
    const tab = curTab("headquarters", "equipe"), ppl = rosterStaff(), due = expiryAll().filter(x => x.src === "staff" && x.date <= addDays(today(), exDays())), late = due.filter(x => x.date < today());
    const noLic = ppl.filter(p => ["engineer", "foreman", "lead"].includes(p.function) && !(p.licences || []).length);
    return `<div class="hq-hero"><div><div class="hq-k">${esc(tr("Headquarters"))}</div><h1>${esc(settings().name || "my-145-station")}${settings().stationCode ? ` · ${esc(settings().stationCode)}` : ""}</h1>
        <div class="hq-sub">${esc(tr("Personnel, licences et formations, échéances et formulaires approuvés de la station."))}</div></div>
        ${readOnly ? "" : `<div class="row-g wrap"><button class="btn" data-a="staff-form">${esc(tr("Ajouter une personne"))}</button><button class="btn" data-a="ex-staffdoc">${esc(tr("Formation / document"))}</button><button class="btn" data-a="form-form">${esc(tr("Ajouter un formulaire"))}</button></div>`}</div>
      <div class="pipeline"><div class="panel tile c-blue"><div class="lbl">${esc(tr("Personnel de la station"))}</div><div class="val">${ppl.length}</div></div>
        <div class="panel tile c-red ${late.length ? "alert" : ""}"><div class="lbl">${esc(tr("Échéances expirées"))}</div><div class="val">${late.length}</div><div class="note">${due.length - late.length} ${esc(tr("à venir"))} (${exDays()} ${esc(tr("jours"))})</div></div>
        <div class="panel tile c-yellow"><div class="lbl">${esc(tr("Sans licence encodée"))}</div><div class="val">${noLic.length}</div><div class="note">${esc(tr("Engineers, foremen, lead"))}</div></div>
        <div class="panel tile c-green"><div class="lbl">${esc(tr("Formulaires"))}</div><div class="val">${formsActive().length}</div></div></div>` +
      tabs("headquarters", [["equipe", "Personnel et licences", ppl.length], ["matrice", "Qualifications"], ["echeances", "Échéances du personnel", due.length, late.length > 0], ["formation", "Formation station", indTodo().length], ["formulaires", "Formulaires", formsActive().length]]) +
      ({ equipe: staffTeam, matrice: staffMatrix, echeances: () => exList(expiryAll().filter(x => x.src === "staff")), formation: inductionList, formulaires: formsList })[tab]();
  }
};
