"use strict";
/* ======================= CONTACTS DE LA STATION =======================
   Liste des contacts obligatoire (EASA / MOE) : urgences, aéroport, autorités, organisation 145, compagnies clientes,
   fournisseurs. La page reprend l'en-tête du formulaire approuvé (n°, révision, date, approbation) et s'imprime telle quelle.
   Tout le monde consulte (numéros cliquables sur téléphone) ; le Station Lead et le bureau modifient.
   contacts/<id> = { cat, org, role, name, phone, phone2, email, hours, notes, order }
   contacts/form = { kind: "form", no, rev, revDate, approval, title } (en-tête du formulaire) */
const CT_CAT = { emergency: "Urgences", company: "Organisation 145", airport: "Aéroport", authority: "Autorités", customers: "Compagnies clientes", suppliers: "Fournisseurs et services", other: "Autres" };
const CT_PRESET = [["emergency", "Airport fire service"], ["emergency", "Airport medical service"], ["emergency", "Airport police / security"],
  ["company", "Accountable Manager"], ["company", "Quality Manager"], ["company", "Maintenance Manager"], ["company", "Station Lead"], ["company", "Headquarters / training"],
  ["airport", "Airport operations"], ["airport", "Handling / ramp"], ["airport", "Fuel"], ["airport", "Airport badges"],
  ["authority", "Civil Aviation Authority (CAAI)"], ["customers", "MCC / AOG desk"], ["suppliers", "Tool calibration"], ["suppliers", "Parts transport (AOG)"]];
const canContacts = () => !readOnly && (isOffice() || meStaff()?.function === "lead");
const ctForm = () => S.contacts.find(c => c.id === "form") || {};
const ctList = () => S.contacts.filter(c => c.id !== "form" && c.kind !== "form").sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.org || a.role || "").localeCompare(String(b.org || b.role || "")));
const ctTel = n => n ? `<a class="mono" href="tel:${esc(String(n).replace(/[^\d+]/g, ""))}">${esc(n)}</a>` : "";

VIEWS.contacts = {
  render() {
    const f = ctForm(), q = UI.q.toLowerCase(), team = UI.ctTeam !== false;
    const rows = ctList().filter(c => !q || [c.org, c.role, c.name, c.phone, c.phone2, c.email, c.notes].join(" ").toLowerCase().includes(q));
    const ed = canContacts();
    const sect = (k, l) => { const r = rows.filter(c => (c.cat || "other") === k); if (!r.length) return "";
      return `<section class="panel ct-sec"><div class="pad"><h3>${esc(tr(l))}</h3></div><div class="tablewrap"><table><thead><tr><th>${esc(tr("Organisation / fonction"))}</th><th>${esc(tr("Nom"))}</th><th>${esc(tr("Téléphone"))}</th><th>E-mail</th><th>${esc(tr("Heures"))}</th></tr></thead><tbody>
        ${r.map(c => `<tr class="${ed ? "click" : ""}" ${ed ? `data-a="ct-form" data-id="${c.id}"` : ""}><td><b>${esc(c.org || "")}</b>${c.role ? `<div class="small ${c.org ? "muted" : ""}">${esc(c.role)}</div>` : ""}${c.notes ? `<div class="small muted">${esc(c.notes)}</div>` : ""}</td>
          <td>${esc(c.name || "")}</td><td data-stop>${ctTel(c.phone)}${c.phone2 ? `<div>${ctTel(c.phone2)}</div>` : ""}${!c.phone && !c.phone2 ? `<span class="txt-warn small">${esc(tr("à compléter"))}</span>` : ""}</td>
          <td class="small" data-stop>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}</td><td class="small">${esc(c.hours || "")}</td></tr>`).join("")}</tbody></table></div></section>`; };
    const ppl = team ? rosterStaff().filter(p => !q || [p.name, p.phone, STAFF_FN[p.function]].join(" ").toLowerCase().includes(q)).sort(staffSort) : [];
    return head("Contacts de la station", "La liste des contacts de la station (formulaire approuvé). Touchez un numéro pour appeler.",
      `<button class="btn" data-a="ct-print">${esc(tr("Imprimer / PDF"))}</button>${ed ? `<button class="btn" data-a="ct-head">${esc(tr("En-tête du formulaire"))}</button><button class="btn primary" data-a="ct-form">${esc(tr("Ajouter un contact"))}</button>` : ""}`) +
      `<div class="panel ct-head"><div class="pad row-sb wrap"><div><b>${esc(f.title || tr("Station contact list"))}</b> · ${esc(settings().name || "")} · ${esc(stationIata())}</div>
        <div class="small">${f.no ? `${esc(tr("Formulaire"))} <b class="mono">${esc(f.no)}</b>` : `<span class="txt-warn">${esc(tr("N° du formulaire à renseigner"))}</span>`}${f.rev ? ` · Rev <b>${esc(f.rev)}</b>` : ""}${f.revDate ? ` · ${fmtDate(f.revDate)}` : ""}${f.approval ? ` · ${esc(tr("Approuvé"))} : ${esc(f.approval)}` : ""}</div></div></div>
      <div class="panel ct-tools">${searchBar(esc(tr("Organisation, nom ou numéro…")), null)}<div class="pad row-g"><label class="chk line small"><input type="checkbox" data-a="ct-team" ${team ? "checked" : ""}> ${esc(tr("Afficher l'équipe de la station (fiches Personnel)"))}</label></div></div>
      ${!ctList().length ? `<div class="panel pad stack"><div class="muted">${esc(tr("Aucun contact pour l'instant."))}</div>${ed ? `<div><button class="btn" data-a="ct-preset">${esc(tr("Préparer les rubriques habituelles (à compléter)"))}</button></div>` : ""}</div>` : ""}
      ${Object.entries(CT_CAT).map(([k, l]) => sect(k, l)).join("")}
      ${ppl.length ? `<section class="panel ct-sec"><div class="pad"><h3>${esc(tr("Équipe de la station"))}</h3></div><div class="tablewrap"><table><thead><tr><th>${esc(tr("Nom"))}</th><th>${esc(tr("Fonction"))}</th><th>${esc(tr("Téléphone"))}</th></tr></thead><tbody>
        ${ppl.map(p => `<tr><td><b>${esc(p.name)}</b></td><td class="small">${esc(tr(STAFF_FN[p.function] || ""))}</td><td>${ctTel(p.phone) || "—"}</td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
  }
};
ACTIONS["ct-print"] = () => window.print();
ACTIONS["ct-team"] = el => { UI.ctTeam = el.checked; render(true); };
ACTIONS["ct-form"] = el => {
  if (!canContacts()) return;
  const c = S.contacts.find(x => x.id === el.dataset.id) || { cat: "emergency" };
  const m = modal(`${mHead(c.id ? "Contact" : "Nouveau contact")}<form><div class="body"><div class="fields">
    ${field("ct-cat", "Rubrique", c.cat, { type: "select", options: Object.entries(CT_CAT) })}${field("ct-org", "Organisation", c.org, { autofocus: true, ph: "Ex. Israel Airports Authority" })}
    ${field("ct-role", "Fonction / service", c.role, { ph: "Ex. Duty manager" })}${field("ct-name", "Nom (facultatif)", c.name)}
    ${field("ct-phone", "Téléphone", c.phone, { type: "tel", cls: "mono", ph: "+972 …" })}${field("ct-phone2", "Autre téléphone", c.phone2, { type: "tel", cls: "mono" })}
    ${field("ct-email", "E-mail", c.email, { type: "email" })}${field("ct-hours", "Heures", c.hours, { ph: "Ex. 24/7, 08-17" })}
    ${field("ct-order", "Ordre dans la rubrique", c.order ?? "", { type: "number" })}${field("ct-notes", "Remarque", c.notes, { wide: true })}</div><div class="err" id="ct-err"></div></div>
    <footer>${c.id ? `<div class="left"><button type="button" class="btn danger" data-a="ct-del" data-id="${c.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`, "lg");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const data = Object.assign(strip(c), { cat: val("ct-cat"), org: val("ct-org").trim(), role: val("ct-role").trim(), name: val("ct-name").trim(), phone: val("ct-phone").trim(), phone2: val("ct-phone2").trim(),
      email: val("ct-email").trim(), hours: val("ct-hours").trim(), notes: val("ct-notes").trim() });
    const o = val("ct-order"); if (o !== "") data.order = +o; else delete data.order;
    if (!data.org && !data.role && !data.name) { m.querySelector("#ct-err").textContent = tr("Indiquez au moins l'organisation, la fonction ou le nom."); return; }
    await save("contacts", c.id, data); closeModal(); toast("Contact enregistré");
  };
};
ACTIONS["ct-del"] = el => confirmBox("Supprimer ce contact de la liste ?", () => { closeModal(); return remove("contacts", el.dataset.id); });
ACTIONS["ct-head"] = () => {
  if (!canContacts()) return;
  const f = ctForm();
  const m = modal(`${mHead("En-tête du formulaire")}<form><div class="body"><div class="hint">${esc(tr("Reprenez ici les références du formulaire « contacts de la station » approuvé par l'autorité."))}</div><div class="fields">
    ${field("cf-title", "Titre du formulaire", f.title, { ph: "Station contact list", wide: true })}${field("cf-no", "N° du formulaire", f.no, { cls: "mono", ph: "Ex. CT-145-F-020", autofocus: true })}
    ${field("cf-rev", "Révision", f.rev)}${field("cf-revd", "Date de révision", f.revDate, { type: "date" })}${field("cf-appr", "Approuvé par / référence (MOE)", f.approval, { wide: true })}</div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    await save("contacts", "form", Object.assign(strip(f), { kind: "form", title: val("cf-title").trim(), no: val("cf-no").trim().toUpperCase(), rev: val("cf-rev").trim(), revDate: val("cf-revd"), approval: val("cf-appr").trim() }));
    closeModal(); toast("En-tête enregistré");
  };
};
ACTIONS["ct-preset"] = async () => {
  if (!canContacts() || ctList().length) return;
  for (const [i, [cat, role]] of CT_PRESET.entries()) await save("contacts", null, { cat, role: tr(role), order: i + 1 });
  toast("Rubriques préparées : complétez les numéros");
};
WIDGETS.contacts = { h: 6, t: "Contacts d'urgence", ic: "☎", c: "red", m: "contacts", size: "s", d: "Les numéros d'urgence de la station, à toucher pour appeler.",
  r() { const l = ctList().filter(c => c.cat === "emergency");
    return `<div class="w-list">${l.slice(0, 6).map(c => `<div class="list-row"><span><b>${esc(c.org || c.role || c.name)}</b>${c.org && c.role ? ` <span class="muted small">${esc(c.role)}</span>` : ""}</span><span data-stop>${ctTel(c.phone) || `<span class="txt-warn small">${esc(tr("à compléter"))}</span>`}</span></div>`).join("") || `<div class="muted small">${esc(tr("Aucun contact d'urgence encodé."))}</div>`}</div>`; } };
