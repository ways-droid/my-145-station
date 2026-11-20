"use strict";
/* ======================= EXPIRATIONS =======================
   Toutes les échéances de la station sur une seule page, avec alertes :
   - personnel : licences, formations, badges, visas, examens… (fiches Personnel, saisies par exemple par le training manager
     de Headquarters ; les mêmes données sont aussi suivies dans AMOS) ;
   - outillage : étalonnages ;
   - véhicules : contrôle technique, assurance, entretien, documents ;
   - station : agréments, autorisations aéroport, assurances, GSE, extincteurs… (collection expiries).
   expiries/<id> = { title, cat, ref, issuer, expires, owner (staffId), notes, file, fileName }
   Seuil d'alerte : Paramètres → expiryDays (60 jours par défaut). */
const EX_CAT = { approval: "Agrément / approbation", airport: "Autorisation aéroport", insurance: "Assurance", gse: "GSE / équipement de piste", safety: "Sécurité (extincteurs, premiers secours…)", contract: "Contrat", training: "Formation de la station", other: "Autre" };
const EX_SRC = { staff: ["Personnel", "info"], tools: ["Outillage", "good"], vehicles: ["Véhicules", "orange"], station: ["Station", ""] };
const exDays = () => Math.max(7, +settings().expiryDays || 60);
const exLeft = d => Math.round((new Date(d) - new Date(today())) / 86400000);
const exLevel = d => d < today() ? "bad" : exLeft(d) <= 30 ? "warn" : "info";
function expiryAll() {
  const out = [];
  if (typeof staffDates === "function") for (const x of staffActive().flatMap(staffDates)) out.push({ src: "staff", date: x.date, what: x.label, who: x.p.name, a: x.doc ? "sdoc-form" : "staff-open", attrs: `data-staff="${x.p.id}" data-id="${x.doc || x.p.id}"` });
  for (const t of S.tools) if (t.calRequired !== false && t.nextDue && !["retired", "lost"].includes(t.status)) out.push({ src: "tools", date: t.nextDue, what: tr("Étalonnage"), who: tLabel(t) + " · " + (t.name || ""), a: "tool-open", attrs: `data-id="${t.id}"` });
  if (typeof fleetTasks === "function") for (const x of fleetTasks(3650).filter(x => ["ct", "assurance", "doc", "entretien"].includes(x.kind))) { const v = S.vehicles.find(y => y.id === x.vid); out.push({ src: "vehicles", date: x.date, what: tr(x.label), who: v ? [v.fleetNo, v.plate].filter(Boolean).join(" · ") : "", a: "veh-open", attrs: `data-id="${x.vid}"` }); }
  for (const e of S.expiries) if (e.expires) out.push({ src: "station", date: e.expires, what: e.title || tr(EX_CAT[e.cat] || "Échéance"), who: [tr(EX_CAT[e.cat] || ""), e.ref].filter(Boolean).join(" · "), a: "ex-form", attrs: `data-id="${e.id}"` });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
const expirySoon = () => expiryAll().filter(x => x.date <= addDays(today(), exDays()));

VIEWS.expirations = {
  render() {
    const all = expiryAll(), lim = addDays(today(), exDays()), late = all.filter(x => x.date < today()), d30 = all.filter(x => x.date >= today() && exLeft(x.date) <= 30), soon = all.filter(x => x.date >= today() && x.date <= lim && exLeft(x.date) > 30);
    const tab = curTab("expirations", "alerte");
    return head("Expirations", `Licences, formations, badges, étalonnages, véhicules et documents de la station. Alerte à ${exDays()} jours (réglable dans Paramètres). Les données du personnel sont aussi suivies dans AMOS.`,
      readOnly || !isOffice() ? "" : `<button class="btn" data-a="ex-staffdoc">Formation / document d'une personne</button><button class="btn primary" data-a="ex-form">Échéance de la station</button>`) +
      `<div class="pipeline"><div class="panel tile c-red ${late.length ? "alert" : ""}"><div class="lbl">${esc(tr("Expirées"))}</div><div class="val">${late.length}</div></div>
        <div class="panel tile c-yellow"><div class="lbl">${esc(tr("Dans les 30 jours"))}</div><div class="val">${d30.length}</div></div>
        <div class="panel tile c-blue"><div class="lbl">${esc(tr("Dans les"))} ${exDays()} ${esc(tr("jours"))}</div><div class="val">${soon.length}</div></div></div>` +
      tabs("expirations", [["alerte", "À traiter", late.length + d30.length + soon.length, late.length > 0], ["tout", "Toutes les échéances", all.length]]) + exList(tab === "alerte" ? all.filter(x => x.date <= lim) : all);
  }
};
function exList(list) {
  const q = UI.q.toLowerCase(), f = UI.filter;
  const rows = list.filter(x => (f === "tous" || x.src === f) && (!q || [x.what, x.who].join(" ").toLowerCase().includes(q)));
  return `<div class="panel">${searchBar("Personne, licence, outil, véhicule, document…", [["tous", "Tout"], ...Object.entries(EX_SRC).map(([k, v]) => [k, v[0], list.some(x => x.src === k && x.date < today())])])}
    <div class="tablewrap"><table><thead><tr><th>Expire le</th><th>Quoi</th><th>Qui / quel objet</th><th>Module</th></tr></thead><tbody>${rows.map(x => `<tr class="click" data-a="${x.a}" ${x.attrs}>
      <td class="num"><span class="chip sm ${exLevel(x.date)}">${fmtDate(x.date)}</span><div class="small muted">${x.date < today() ? esc(tr("expiré depuis")) + " " + plural(-exLeft(x.date), "jour") : esc(tr("dans")) + " " + plural(exLeft(x.date), "jour")}</div></td>
      <td><b>${esc(x.what)}</b></td><td class="small">${esc(x.who || "—")}</td><td><span class="chip sm ${EX_SRC[x.src][1]}">${esc(tr(EX_SRC[x.src][0]))}</span></td></tr>`).join("")}</tbody></table>
      ${rows.length ? "" : `<div class="empty">${esc(tr("Aucune échéance ici."))}</div>`}</div></div>`;
}
/* ajouter une formation / un document à une personne : choisir la personne, puis la fiche document habituelle */
ACTIONS["ex-staffdoc"] = () => {
  const ppl = staffActive().slice().sort(staffSort);
  const m = modal(`${mHead("Formation ou document d'une personne")}<form><div class="body"><div class="fields">${field("exs-p", "Personne", "", { type: "select", required: true, options: [["", "Choisir…"], ...ppl.map(p => [p.id, p.name])] })}</div>
    <div class="hint">${esc(tr("Licences, formations (Human Factors, EWIS…), badges, visas, examens : ils s'enregistrent sur la fiche Personnel."))}</div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">${esc(tr("Continuer"))}</button></footer></form>`);
  m.querySelector("form").onsubmit = e => { e.preventDefault(); const id = val("exs-p"); if (id) ACTIONS["sdoc-form"]({ dataset: { staff: id } }); };
};
ACTIONS["ex-form"] = el => {
  const e0 = S.expiries.find(x => x.id === el.dataset.id) || { cat: "approval" }, ppl = staffActive().slice().sort(staffSort), ed = isOffice() && !readOnly;
  const m = modal(`${mHead(e0.id ? "Échéance de la station" : "Nouvelle échéance de la station")}<form><div class="body"><div class="fields">
    ${field("ex-title", "Intitulé", e0.title, { required: true, autofocus: true, wide: true, ph: "Ex. agrément Part-145 CAAI, badge de piste société, assurance RC, inspection extincteurs…" })}
    ${field("ex-cat", "Catégorie", e0.cat, { type: "select", options: Object.entries(EX_CAT) })}${field("ex-exp", "Date d'expiration", e0.expires, { type: "date", required: true })}
    ${field("ex-ref", "Référence / n°", e0.ref, { cls: "mono" })}${field("ex-iss", "Délivré par", e0.issuer)}
    ${field("ex-own", "Responsable du renouvellement", e0.owner || "", { type: "select", options: [["", "—"], ...ppl.map(p => [p.id, p.name])] })}
    ${field("ex-notes", "Notes", e0.notes, { type: "textarea", wide: true })}</div>
    ${assets && ed ? `<label class="f">${e0.file ? "Remplacer le fichier" : "Fichier (PDF ou photo)"}<input type="file" id="ex-file" accept="application/pdf,image/*"></label>` : ""}
    ${e0.file ? `<div><a class="btn sm" href="${esc(blobUrl(e0.file))}" target="_blank" rel="noopener">${esc(e0.fileName || tr("Ouvrir le fichier"))}</a></div>` : ""}<div class="err" id="ex-err"></div></div>
    <footer>${e0.id && ed ? `<div class="left"><button type="button" class="btn danger" data-a="ex-del" data-id="${e0.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>${ed ? "Annuler" : "Fermer"}</button>${ed ? `<button class="btn primary">Enregistrer</button>` : ""}</footer></form>`);
  if (!ed) m.querySelectorAll("input, select, textarea").forEach(x => x.disabled = true);
  m.querySelector("form").onsubmit = async ev => {
    ev.preventDefault(); if (!ed) return;
    const data = Object.assign(strip(e0), { title: val("ex-title").trim(), cat: val("ex-cat"), expires: val("ex-exp"), ref: val("ex-ref").trim(), issuer: val("ex-iss").trim(), owner: val("ex-own"), notes: val("ex-notes") });
    const f = m.querySelector("#ex-file")?.files[0];
    if (f) { try { const r = await assets.upload(f, f.type ? undefined : { type: "application/pdf" }); data.file = r.id; data.fileName = f.name; } catch (er) { m.querySelector("#ex-err").textContent = tr(er.code === "too_large" ? "Fichier trop lourd (20 Mo maximum)." : "Le fichier n'a pas pu être envoyé. Réessayez."); return; } }
    await save("expiries", e0.id, data); closeModal(); toast("Échéance enregistrée");
  };
};
ACTIONS["ex-del"] = el => confirmBox("Supprimer cette échéance ?", () => remove("expiries", el.dataset.id));

WIDGETS.expiries = { h: 7, t: "Expirations", ic: "⏳", c: "red", m: "expirations", size: "m", d: "Licences, formations, badges, étalonnages, véhicules et documents qui expirent.",
  r() { const t = expirySoon();
    return `<div class="w-stats">${wStat(t.filter(x => x.date < today()).length, "expirées", t.some(x => x.date < today()) ? "bad" : "")}${wStat(t.filter(x => x.date >= today() && exLeft(x.date) <= 30).length, "dans 30 jours", "warn")}${wStat(t.length, "à traiter")}</div>
      <div class="w-list">${t.slice(0, 5).map(x => `<div class="list-row click" data-a="${x.a}" ${x.attrs}><span><b>${esc(x.what)}</b> <span class="muted small">${esc(x.who || "")}</span></span><span class="chip sm ${exLevel(x.date)}">${fmtDate(x.date)}</span></div>`).join("") || `<div class="muted small">${esc(tr("Aucune échéance ici."))}</div>`}</div>`; } };
