"use strict";
/* ======================= PERSONNEL ET QUALIFICATIONS =======================
   Une fiche par personne : fonction, licences (B1, B2…), qualifications par type d'avion
   (codes du roster, cumulables : E = licence EASA, I = approbation israélienne — examen spécial, requise
   pour signer les avions 4X- en Israël —, F = licence FAA ; stockés « E+I »),
   documents avec échéance (passeport, visa, permis de travail, badges piste, examens, run-up…).
   Le serveur réduit les fiches pour le rôle terrain : la sienne en entier, celles des autres sans
   documents ni coordonnées. Rien ici ne vaut autorisation de signer : les CRS restent dans AMOS. */
const STAFF_FN = { lead: "Station Lead", admin: "Admin (assistant administratif)", foreman: "Shift Foreman", engineer: "Engineer", mechanic: "Mechanic", storekeeper: "Store Keeper", helper: "Helper", hq: "Headquarters" };
const STAFF_FN_ORDER = Object.keys(STAFF_FN);
const LIC_CATS = ["B1", "B2", "B1+B2", "A", "C", "FAA A&P", "Autre"];
const SDOC_TYPES = { passport: "Passeport", visa: "Visa", workPermit: "Permis de travail", ramp: "Badge piste / aéroport", exam: "Examen (CAAI…)", runup: "Autorisation run-up",
  training: "Formation (Human Factors, EWIS…)", medical: "Aptitude médicale", driving: "Permis de conduire / piste", other: "Autre" };
const SHIFT_LBL = { day: "Jour (08-20 LT)", night: "Nuit (20-08 LT)", custom: "Horaire libre" };
const splitList = s => String(s || "").split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
/* types suivis : la base Types d'appareils (Avions) quand elle est remplie, sinon la liste des Paramètres */
const acTypes = () => { const b = (S.actypes || []).map(t => t && t.code).filter(Boolean); return b.length ? [...new Set(b)].sort() : splitList(settings().acTypes); };
const RATING_CODES = { E: "EASA", I: "Approbation israélienne", F: "FAA" };
/* catégories de conditions pour signer (Paramètres > Avions > Types d'appareils) : code, libellé, se lit sur le Type Rating
   ou sur la licence, stations où elle s'applique (vide = toutes). Par défaut : E, I, F sur le Type Rating ; B1, B2, C, A sur la licence. */
const COND_DEF = [{ code: "E", label: "EASA", on: "rating" }, { code: "I", label: "Approbation israélienne", on: "rating" }, { code: "F", label: "FAA", on: "rating" },
  { code: "B1", label: "Licence B1", on: "licence" }, { code: "B2", label: "Licence B2", on: "licence" }, { code: "C", label: "Licence C", on: "licence" }, { code: "A", label: "Licence A", on: "licence" }];
const condCats = () => { const c = settings().condCats; return Array.isArray(c) && c.length ? c.filter(x => x && x.code) : COND_DEF; };
const condHere = c => !String(c.stations || "").trim() || splitList(c.stations).map(s => s.toUpperCase()).includes(stationIata());
const condOf = code => condCats().find(c => c.code === code);
/* catégories cochables sur un Type Rating, ici (plus celles déjà cochées) */
const rCodes = (keep = []) => condCats().filter(c => c.on === "rating" && (condHere(c) || keep.includes(c.code)));
const ratingHas = (p, t, c) => String((p.ratings || {})[t] || "").split("+").includes(c);
/* Type Ratings détaillés : typeRatings = [{ t: type, m: modèle ("" = tous), e: moteur ("" = tous), lic: "E+I", crs: autorisation compagnie }].
   ratings { type: "E+I" } en est le résumé (seulement les lignes avec autorisation compagnie), recalculé par le serveur.
   Anciennes fiches (ratings seulement) : lues comme type complet avec autorisation. */
const staffTR = p => Array.isArray(p.typeRatings) ? p.typeRatings : Object.entries(p.ratings || {}).filter(([, l]) => l).map(([t, lic]) => ({ t, m: "", e: "", lic, crs: true }));
const trLic = r => String(r.lic || "").split("+").filter(Boolean);
const trName = r => [r.t, r.m, r.e ? "(" + r.e + ")" : ""].filter(Boolean).join(" ");
/* la ligne couvre cet avion : même type, et même modèle / moteur quand les deux sont précisés */
const trFits = (r, ac) => r.t === ac.acType && (!r.m || !ac.variant || r.m === ac.variant) && (!r.e || !ac.engine || r.e === ac.engine);
/* conditions exigées pour signer un avion : arbre ET / OU imbriqué, sans limite.
   nœud = { op: "and" | "or", items: [feuille | nœud] } ; feuille = code du Type Rating (E, I, F) ou catégorie de licence (B1, B2, A, C).
   Une liste simple ["E","I"] vaut « E ET I ». */
const ruleNorm = r => Array.isArray(r) ? { op: "and", items: r } : r && Array.isArray(r.items) ? r : { op: "and", items: [] };
const ruleEval = (n, has) => typeof n === "string" ? has(n) : !n || !Array.isArray(n.items) || !n.items.length ? true : n.op === "or" ? n.items.some(x => ruleEval(x, has)) : n.items.every(x => ruleEval(x, has));
const ruleText = (n, top = true) => { if (typeof n === "string") return n; const it = (n?.items || []).map(x => ruleText(x, false)).filter(Boolean); if (!it.length) return "";
  const s = it.join(n.op === "or" ? " " + tr("OU") + " " : " " + tr("ET") + " "); return top || it.length < 2 ? s : "(" + s + ")"; };
const licCats = p => new Set((p.licences || []).flatMap(l => String(l.cat || "").split("+")).filter(Boolean));
/* retire les conditions dont la catégorie ne s'applique pas à cette station */
const ruleLocal = n => typeof n === "string" ? (condOf(n) && !condHere(condOf(n)) ? null : n) : { op: n.op, items: (n.items || []).map(ruleLocal).filter(x => x && (typeof x === "string" || x.items.length)) };
/* approvals généraux de la fiche : approvals = [{ code, label, types: [] = tous les types }] */
const genAppr = p => Array.isArray(p.approvals) ? p.approvals.filter(a => a && a.code) : [];
const apprFor = (p, t) => genAppr(p).filter(a => !(a.types || []).length || a.types.includes(t)).map(a => a.code);
/* une condition est remplie si on la trouve sur le Type Rating, dans un approval général qui couvre ce type, ou dans les licences */
const trQualif = (p, ac, rule) => { const n = ruleLocal(ruleNorm(rule)), cats = licCats(p), ga = apprFor(p, ac.acType);
  return staffTR(p).filter(r => trFits(r, ac) && ruleEval(n, c => trLic(r).includes(c) || ga.includes(c) || cats.has(c))); };
/* a le droit de signer : qualifié (type, modèle, moteur, conditions de licences) ET autorisation compagnie (CRS) cochée */
const canSign = (p, ac, rule) => trQualif(p, ac, rule).some(r => r.crs !== false);
const ratingsOf = (list, appr = []) => { const o = {}; for (const r of list) if (r.t && r.crs !== false) { const h = new Set([...(o[r.t] || "").split("+"), ...trLic(r), ...apprFor({ approvals: appr }, r.t)]); const ord = [...condCats().filter(c => c.on === "rating").map(c => c.code), ...h]; o[r.t] = [...new Set(ord)].filter(c => c && h.has(c)).join("+"); }
  return Object.fromEntries(Object.entries(o).filter(([, l]) => l)); };
const staff = id => S.staff.find(p => p.id === id);
const staffActive = () => S.staff.filter(p => p.active !== false);
/* Headquarters (training manager…) : pas dans le roster ni dans les équipes de la station */
const rosterStaff = () => staffActive().filter(p => p.function !== "hq");
const fnRank = p => { const i = STAFF_FN_ORDER.indexOf(p.function); return i < 0 ? 99 : i; };
const staffSort = (a, b) => fnRank(a) - fnRank(b) || byName(a, b);
const licText = p => (p.licences || []).map(l => l.cat).filter(Boolean).join(" · ");
/* toutes les échéances d'une personne (licences et documents en cours) */
function staffDates(p) {
  const out = [];
  for (const l of p.licences || []) if (l.expires) out.push({ p, date: l.expires, label: "Licence " + (l.cat || "") });
  for (const d of p.docs || []) if (d.expires && !d.old) out.push({ p, date: d.expires, label: (SDOC_TYPES[d.type] || d.type) + (d.name ? " · " + d.name : "") + (d.acType ? " · " + d.acType : ""), doc: d.id });
  return out;
}
const staffDue = (days = 60) => staffActive().flatMap(staffDates).filter(x => x.date <= addDays(today(), days)).sort((a, b) => a.date.localeCompare(b.date));
const nextDate = p => staffDates(p).sort((a, b) => a.date.localeCompare(b.date))[0];
const ratingChips = p => staffTR(p).filter(r => r.t && r.lic).map(r => `<span class="chip sm ${r.crs === false ? "muted" : ""}" title="${esc(r.crs === false ? tr("Qualifié, sans autorisation compagnie (CRS)") : tr("Autorisation compagnie (CRS)"))}"><b>${esc(trName(r))}</b> ${esc(r.lic)}${r.crs === false ? " · " + esc(tr("sans CRS")) : ""}</span>`).join(" ");

VIEWS.personnel = {
  render() {
    const tab = curTab("personnel", "equipe"), due = staffDue(60), late = due.filter(x => x.date < today()).length;
    return head("Personnel", `${plural(staffActive().length, "personne")} · licences, qualifications et documents`,
      isOffice() ? `<button class="btn primary" data-a="staff-form" ${dis()}>Ajouter une personne</button>` : "") +
      tabs("personnel", [["equipe", "Équipe", staffActive().length], ["matrice", "Qualifications"], ["echeances", "Échéances", due.length, late > 0], ["formation", "Formation station", typeof indTodo === "function" ? indTodo().length : 0], ["approvals", "Approvals et licences"]]) +
      ({ equipe: staffTeam, matrice: staffMatrix, echeances: staffDueList, formation: () => inductionList(), approvals: () => condPanel() })[tab]();
  }
};
function staffTeam() {
  const q = UI.q.toLowerCase(), f = UI.filter;
  const rows = S.staff.filter(p => (f === "anciens" ? p.active === false : p.active !== false) && (f === "tous" || f === "anciens" || p.function === f)
    && (!q || [p.name, STAFF_FN[p.function], p.employer, licText(p), Object.keys(p.ratings || {}).join(" ")].join(" ").toLowerCase().includes(q))).sort(staffSort);
  const used = STAFF_FN_ORDER.filter(k => S.staff.some(p => p.function === k));
  const filt = [["tous", "Tous"], ...used.map(k => [k, STAFF_FN[k]]), ...(S.staff.some(p => p.active === false) ? [["anciens", "Anciens"]] : [])];
  return `<div class="panel">${searchBar("Rechercher un nom, une licence, un type d'avion…", filt)}
    <div class="tablewrap"><table><thead><tr><th>Nom</th><th>Fonction</th><th>Licences</th><th>Qualifications</th><th>Prochaine échéance</th></tr></thead><tbody>
    ${rows.map(p => { const n = nextDate(p); return `<tr class="click" data-a="staff-open" data-id="${p.id}"><td><b>${esc(p.name)}</b>${demoTag(p)}${p.sysAdmin ? ` <span class="chip sm info" title="${esc(tr("Administrateur système"))}">${esc(tr("Admin système"))}</span>` : ""}<div class="muted small">${esc(p.employer || "")}</div></td>
      <td>${esc(STAFF_FN[p.function] || p.function || "—")}</td><td class="mono">${esc(licText(p) || "—")}</td><td>${ratingChips(p) || `<span class="muted">—</span>`}</td>
      <td>${n ? dueChip(n.date, 60) + `<div class="muted small">${esc(n.label)}</div>` : `<span class="muted">—</span>`}</td></tr>`; }).join("")}
    </tbody></table>${rows.length ? "" : `<div class="empty">${S.staff.length ? "Personne ne correspond." : "Aucune personne pour l'instant."}</div>`}</div></div>`;
}
/* tableau croisé personnes × types d'avion, comme les colonnes du roster */
function staffMatrix() {
  const types = acTypes(), rows = staffActive().sort(staffSort);
  if (!types.length) return `<div class="panel pad">Aucun type d'avion défini. Ajoutez-les dans <a href="#avions">Avions</a> > Types d'appareils.</div>`;
  const cnt = t => rows.filter(p => (p.ratings || {})[t]).length;
  return `<div class="panel"><div class="tablewrap"><table class="matrix"><thead><tr><th>Nom</th><th>Fonction</th><th>Licences</th>${types.map(t => `<th class="c">${esc(t)}</th>`).join("")}</tr></thead><tbody>
    ${rows.map(p => `<tr class="click" data-a="staff-open" data-id="${p.id}"><td><b>${esc(p.name)}</b></td><td class="small">${esc(STAFF_FN[p.function] || "")}</td><td class="mono small">${esc(licText(p))}</td>
      ${types.map(t => { const l = (p.ratings || {})[t], rs = staffTR(p).filter(r => r.t === t && r.lic), det = rs.map(r => trName(r) + " " + r.lic + (r.crs === false ? " · " + tr("sans CRS") : "")).join("\n");
        return `<td class="c" title="${esc(det)}">${l ? `<span class="chip sm good">${esc(l)}</span>` : rs.length ? `<span class="chip sm muted">${esc(tr("sans CRS"))}</span>` : `<span class="muted">·</span>`}</td>`; }).join("")}</tr>`).join("")}
    <tr><td colspan="3" class="muted small">Avec autorisation compagnie (CRS)</td>${types.map(t => `<td class="c num"><b>${cnt(t)}</b></td>`).join("")}</tr>
    ${rCodes().map(({ code: c, label: l }) => `<tr><td colspan="3" class="muted small">dont ${esc(c)} · ${esc(tr(l))}</td>${types.map(t => `<td class="c num">${rows.filter(p => ratingHas(p, t, c)).length}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div><div class="pad hint">E = licence EASA · I = approbation israélienne (requise pour signer les avions 4X- en Israël) · F = licence FAA. Comptés : les Type Ratings avec autorisation compagnie (CRS) ; « sans CRS » = qualifié sans l'autorisation. Le détail (modèle, moteur) s'affiche au survol. La validation des travaux reste dans AMOS.</div></div>`;
}
function staffDueList() {
  const all = staffActive().flatMap(staffDates).sort((a, b) => a.date.localeCompare(b.date)), lim = addDays(today(), 90);
  const rows = all.filter(x => x.date <= lim);
  return `<div class="panel"><div class="pad hint">Échéances des 90 prochains jours (et dépassées) : licences et documents en cours.</div>
    <div class="tablewrap"><table><thead><tr><th>Échéance</th><th>Personne</th><th>Document</th></tr></thead><tbody>
    ${rows.map(x => `<tr class="click" data-a="${x.doc ? "sdoc-form" : "staff-open"}" data-staff="${x.p.id}" data-id="${x.doc || x.p.id}"><td>${dueChip(x.date, 60)}</td><td><b>${esc(x.p.name)}</b></td><td>${esc(x.label)}</td></tr>`).join("")}
    </tbody></table>${rows.length ? "" : `<div class="empty">Rien dans les 90 prochains jours.</div>`}</div></div>`;
}

/* ---- fiche ---- */
function openStaff(id) {
  const p = staff(id); if (!p) return;
  const ed = isOffice() && !readOnly, docs = (p.docs || []).slice().sort((a, b) => (a.old - b.old) || (a.expires || "9").localeCompare(b.expires || "9"));
  modal(`${mHead(esc(p.name))}<div class="body stack">
    <div class="row-g wrap"><span class="chip info">${esc(STAFF_FN[p.function] || p.function || "—")}</span>${typeof indChip === "function" && p.function !== "hq" ? `<button class="linkbtn" data-a="ind-open" data-id="${p.id}">${indChip(p.id)}</button>` : ""}${p.active === false ? `<span class="chip">Ne fait plus partie de la station</span>` : ""}${p.shift ? `<span class="chip">${esc(SHIFT_LBL[p.shift] || p.shift)}</span>` : ""}</div>
    <dl class="kv sm">${[["Employeur", p.employer], ["Station de base", p.base], ["E-mail", p.email], ["Téléphone", p.phone], ["Nationalité", p.nationality]].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
    <h3>Licences</h3>${(p.licences || []).length ? `<table class="small"><tbody>${p.licences.map(l => `<tr><td class="mono"><b>${esc(l.cat)}</b></td><td class="mono">${esc(l.number || "")}</td><td>${esc(l.authority || "")}</td><td>${l.expires ? dueChip(l.expires, 60) : ""}</td></tr>`).join("")}</tbody></table>` : `<div class="muted">Aucune licence enregistrée.</div>`}
    <h3>Type Ratings</h3><div>${ratingChips(p) || `<span class="muted">Aucune.</span>`}</div>
    ${genAppr(p).length ? `<h3>${esc(tr("Approvals généraux"))}</h3><div>${genAppr(p).map(a => `<span class="chip sm"><b>${esc(a.code)}</b> ${esc(a.label || "")} · ${esc((a.types || []).length ? a.types.join(", ") : tr("tous les types"))}</span>`).join(" ")}</div>` : ""}
    <div class="row-sb"><h3>Documents</h3>${ed ? `<button class="btn sm" data-a="sdoc-form" data-staff="${p.id}">Ajouter un document</button>` : ""}</div>
    ${docs.length ? `<table class="small"><tbody>${docs.map(d => `<tr class="${ed ? "click" : ""} ${d.old ? "muted" : ""}" ${ed ? `data-a="sdoc-form" data-staff="${p.id}" data-id="${d.id}"` : ""}><td><b>${esc(SDOC_TYPES[d.type] || d.type)}</b><div class="muted">${esc([d.name, d.acType, d.number ? "n° " + d.number : ""].filter(Boolean).join(" · "))}</div></td>
      <td>${d.old ? "Ancien" : d.expires ? dueChip(d.expires, 60) : ""}</td><td class="r">${d.file ? `<a class="btn sm" href="${esc(blobUrl(d.file))}" target="_blank" rel="noopener" data-stop>Fichier</a>` : ""}</td></tr>`).join("")}</tbody></table>` : `<div class="muted">${p.docs ? "Aucun document." : "Documents visibles par le bureau et par la personne elle-même."}</div>`}
    ${p.notes ? `<h3>Notes</h3><div class="pre">${esc(p.notes)}</div>` : ""}
  </div><footer><button class="btn" data-close>Fermer</button>${ed ? `<button class="btn primary" data-a="staff-form" data-id="${p.id}">Modifier</button>` : ""}</footer>`, "lg");
}
ACTIONS["staff-open"] = el => openStaff(el.dataset.staff || el.dataset.id);

/* ---- formulaire ---- */
const licRow = (l = {}) => `<div class="row-g lic-row"><select class="l-cat">${[...new Set([...LIC_CATS, ...condCats().filter(c => c.on === "licence" && condHere(c)).map(c => c.code), l.cat].filter(Boolean))].map(c => `<option ${c === l.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
  <input class="l-num mono" placeholder="${esc(tr("N° de licence"))}" value="${esc(l.number || "")}"><input class="l-auth" placeholder="${esc(tr("Autorité"))}" value="${esc(l.authority || "")}">
  <input class="l-exp" type="date" value="${esc(l.expires || "")}" aria-label="${esc(tr("Expiration"))}"><button type="button" class="x" data-a="lic-del" aria-label="Retirer">×</button></div>`;
ACTIONS["lic-add"] = el => el.closest("form").querySelector(".lic-list").insertAdjacentHTML("beforeend", licRow());
ACTIONS["lic-del"] = el => el.closest(".lic-row").remove();
ACTIONS["staff-form"] = el => {
  const p = staff(el.dataset.id) || { function: "engineer", active: true, ratings: {}, licences: [] };
  const isNew = !p.id;
  const m = modal(`${mHead(isNew ? "Nouvelle personne" : esc(p.name))}<form><div class="body stack"><div class="fields">
    ${field("st-name", "Nom et prénom", p.name, { required: true, autofocus: true })}${field("st-fn", "Fonction", p.function, { type: "select", options: Object.entries(STAFF_FN).filter(([k]) => k !== "hq" || isAdmin() || p.function === "hq") })}
    ${field("st-emp", "Employeur", p.employer, { ph: "Challenge Technic, sous-traitant…" })}${field("st-base", "Station de base", p.base, { ph: "TLV, LGG…", cls: "mono" })}
    ${field("st-email", "E-mail (le même que son compte, pour qu'il voie sa fiche)", p.email, { type: "email" })}${field("st-phone", "Téléphone", p.phone)}
    ${field("st-nat", "Nationalité", p.nationality)}${field("st-shift", "Horaire habituel", p.shift || "", { type: "select", options: [["", "—"], ...Object.entries(SHIFT_LBL)] })}
  </div>
  <div><div class="row-sb"><h3>Licences</h3><button type="button" class="btn sm" data-a="lic-add">Ajouter une licence</button></div><div class="lic-list stack">${(p.licences || []).map(licRow).join("")}</div></div>
  <div><div class="row-sb"><h3>Type Ratings</h3><button type="button" class="btn sm" data-a="tr-add">${esc(tr("Ajouter un Type Rating"))}</button></div>
    ${acTypes().length ? `<div class="hint">${esc(tr("Type, modèle et moteur viennent de la base Types d'appareils (Avions). Cochez ses approvals pour chaque Type Rating (liste dans l'onglet Approvals et licences), et CRS si la compagnie l'autorise à signer : il peut avoir le type sur sa licence sans l'autorisation."))}</div>` : `<div class="hint">Ajoutez d'abord les types dans Avions > Types d'appareils.</div>`}
    <div class="tr-list stack">${staffTR(p).map(trRow).join("")}</div></div>
  <div><div class="row-sb"><h3>${esc(tr("Approvals généraux"))}</h3><button type="button" class="btn sm" data-a="ga-add">${esc(tr("Ajouter un approval général"))}</button></div>
    <div class="hint">${esc(tr("Un approval que la personne possède pour tous ses Type Ratings, ou seulement pour les types cochés (ex. E EASA, ou un approval maison). Code au choix : il compte dès qu'une fiche avion l'exige."))}</div>
    <datalist id="ga-codes">${condCats().map(c => `<option value="${esc(c.code)}">${esc(tr(c.label || ""))}</option>`).join("")}</datalist>
    <div class="ga-list stack">${genAppr(p).map(gaRow).join("")}</div></div>
  ${field("st-notes", "Notes", p.notes, { type: "textarea" })}
  ${isAdmin() ? `<div class="hint">${esc(tr("Fonction Headquarters (training manager…) : mêmes droits qu'un administrateur, avec la double authentification activée. Pas dans le roster de la station."))}</div>` : ""}
  ${isAdmin() ? `<label class="chk sysadm"><input type="checkbox" id="st-sysadm" ${p.sysAdmin ? "checked" : ""}> <b>${esc(tr("Administrateur système"))}</b> <span class="muted small">${esc(tr("— gère tout le système, en plus de sa fonction. Son compte (même e-mail) doit avoir la double authentification activée."))}</span></label>`
    : p.sysAdmin ? `<div class="small"><span class="chip info">${esc(tr("Administrateur système"))}</span></div>` : ""}
  ${isNew ? "" : `<label class="chk"><input type="checkbox" id="st-gone" ${p.active === false ? "checked" : ""}> Ne fait plus partie de la station <span class="muted small">(fiche gardée, sortie des listes et des échéances)</span></label>`}
  </div><footer>${isNew ? "" : `<div class="left"><button type="button" class="btn danger" data-a="staff-del" data-id="${p.id}" ${dis()}>Supprimer</button></div>`}
  <button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "lg");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const typeRatings = [...m.querySelectorAll(".tr-row")].map(r => ({ t: r.querySelector(".tr-t").value, m: r.querySelector(".tr-m").value, e: r.querySelector(".tr-e").value,
      lic: [...r.querySelectorAll(".tr-c:checked")].map(i => i.value).join("+"), crs: r.querySelector(".tr-crs").checked })).filter(r => r.t);
    const approvals = [...m.querySelectorAll(".ga-row")].map(r => { const ts = [...r.querySelectorAll(".ga-t:checked")].map(i => i.value);
      return { code: r.querySelector(".ga-code").value.trim().toUpperCase().replace(/[^A-Z0-9&.\-]/g, ""), label: r.querySelector(".ga-label").value.trim(), types: r.querySelector(".ga-all").checked ? [] : ts }; }).filter(a => a.code);
    const ratings = ratingsOf(typeRatings, approvals);
    const licences = [...m.querySelectorAll(".lic-row")].map(r => ({ cat: r.querySelector(".l-cat").value, number: r.querySelector(".l-num").value.trim(), authority: r.querySelector(".l-auth").value.trim(), expires: r.querySelector(".l-exp").value }));
    const gone = m.querySelector("#st-gone")?.checked;
    const data = Object.assign(strip(p), { name: val("st-name"), function: val("st-fn"), employer: val("st-emp"), base: val("st-base").toUpperCase(), email: val("st-email").toLowerCase(), phone: val("st-phone"),
      nationality: val("st-nat"), shift: val("st-shift"), notes: val("st-notes"), typeRatings, approvals, ratings, licences, active: !gone, docs: p.docs || [] });
    if (isAdmin()) data.sysAdmin = !!m.querySelector("#st-sysadm")?.checked;
    const id = await save("staff", p.id, data);
    toast("Fiche enregistrée"); openStaff(id);
  };
  m.querySelector(".ga-list").onchange = e => {   // « Tous les types » et les types cochés s'excluent
    const r = e.target.closest(".ga-row"); if (!r) return;
    if (e.target.matches(".ga-all") && e.target.checked) r.querySelectorAll(".ga-t").forEach(i => { i.checked = false; });
    if (e.target.matches(".ga-t")) r.querySelector(".ga-all").checked = !r.querySelector(".ga-t:checked");
    const c = r.querySelector(".ga-code"), l = r.querySelector(".ga-label");
    if (e.target === c && !l.value) l.value = tr(condOf(c.value.trim().toUpperCase())?.label || "");
  };
  m.querySelector(".tr-list").onchange = e => {   // le modèle et le moteur se filtrent d'après le type (et le modèle)
    const r = e.target.closest(".tr-row"); if (!r) return;
    const t = r.querySelector(".tr-t").value, md = r.querySelector(".tr-m");
    if (e.target.matches(".tr-t")) md.innerHTML = atModelOpts(t, "");
    if (e.target.matches(".tr-t, .tr-m")) r.querySelector(".tr-e").innerHTML = atEngOpts(t, md.value, "");
  };
};
const trRow = (r = {}) => `<div class="tr-row row-g wrap"><select class="tr-t" aria-label="${esc(tr("Type"))}">${atOpts([["", "— " + tr("Type") + " —"], ...atUniq(acTypes(), r.t).map(t => [t, t])], r.t)}</select>
  <select class="tr-m" aria-label="${esc(tr("Modèle"))}">${atModelOpts(r.t, r.m)}</select><select class="tr-e" aria-label="${esc(tr("Moteur"))}">${atEngOpts(r.t, r.m, r.e)}</select>
  <span class="tr-appr"><span class="small muted">${esc(tr("Approvals"))} :</span> ${rCodes(trLic(r)).map(({ code: c, label: l }) => `<label class="chk line" title="${esc(tr(l))}"><input type="checkbox" class="tr-c" value="${esc(c)}" ${trLic(r).includes(c) ? "checked" : ""}> <b>${esc(c)}</b> <span class="small muted">${esc(tr(l))}</span></label>`).join("") || `<span class="small txt-warn">${esc(tr("aucun approval défini (Personnel > Approvals et licences)"))}</span>`}</span>
  <label class="chk line tr-crsl" title="${esc(tr("Autorisation compagnie de signer (CRS)"))}"><input type="checkbox" class="tr-crs" ${r.crs === true ? "checked" : ""}> <b>CRS</b> <span class="small muted">${esc(tr("autorisation compagnie"))}</span></label>
  <button type="button" class="x" data-a="tr-del" aria-label="${esc(tr("Retirer"))}">×</button></div>`;
ACTIONS["tr-add"] = el => el.closest("form").querySelector(".tr-list").insertAdjacentHTML("beforeend", trRow());
ACTIONS["tr-del"] = el => el.closest(".tr-row").remove();
const gaRow = (a = {}) => { const all = !(a.types || []).length, types = atUniq(acTypes(), null).concat((a.types || []).filter(t => !acTypes().includes(t)));
  return `<div class="ga-row row-g wrap"><input class="ga-code mono" list="ga-codes" value="${esc(a.code || "")}" placeholder="E" aria-label="${esc(tr("Code"))}" style="max-width:7em">
  <input class="ga-label" value="${esc(a.label || "")}" placeholder="${esc(tr("Libellé (ex. EASA)"))}" aria-label="${esc(tr("Libellé"))}">
  <span class="tr-appr"><label class="chk line"><input type="checkbox" class="ga-all" ${all ? "checked" : ""}> <b>${esc(tr("Tous les types"))}</b></label>
  ${types.map(t => `<label class="chk line"><input type="checkbox" class="ga-t" value="${esc(t)}" ${!all && a.types.includes(t) ? "checked" : ""}> ${esc(t)}</label>`).join("")}</span>
  <button type="button" class="x" data-a="ga-del" aria-label="${esc(tr("Retirer"))}">×</button></div>`; };
ACTIONS["ga-add"] = el => el.closest("form").querySelector(".ga-list").insertAdjacentHTML("beforeend", gaRow());
ACTIONS["ga-del"] = el => el.closest(".ga-row").remove();
ACTIONS["staff-del"] = el => confirmBox("Supprimer cette fiche et ses documents ? Pour quelqu'un qui quitte la station, cochez plutôt « Ne fait plus partie de la station ».", () => remove("staff", el.dataset.id));

/* ---- documents d'une personne (même principe que les documents des véhicules) ---- */
ACTIONS["sdoc-form"] = el => {
  const p = staff(el.dataset.staff); if (!p) return;
  const d = (p.docs || []).find(x => x.id === el.dataset.id) || { type: "visa", issued: today() };
  const isNew = !d.id;
  const m = modal(`${mHead((isNew ? "Nouveau document · " : "Document · ") + esc(p.name))}<form><div class="body"><div class="fields">
    ${field("sd-type", "Type de document", d.type, { type: "select", options: Object.entries(SDOC_TYPES) })}
    ${field("sd-name", "Intitulé / pays / aéroport", d.name, { ph: "Israël B1, TLV, Human Factors…" })}${field("sd-ac", "Type d'avion (si applicable)", d.acType || "", { type: "select", options: [["", "—"], ...acTypes().map(t => [t, t])] })}
    ${field("sd-num", "N° du document", d.number, { cls: "mono" })}${field("sd-iss", "Date d'émission", d.issued, { type: "date" })}${field("sd-exp", "Date d'expiration", d.expires, { type: "date" })}</div>
    ${assets && !readOnly ? `<label class="f">${d.file ? "Remplacer le fichier" : "Fichier (PDF ou photo)"}<input type="file" id="sd-file" accept="application/pdf,image/*"></label>` : ""}
    ${d.file ? `<div><a class="btn sm" href="${esc(blobUrl(d.file))}" target="_blank" rel="noopener">Ouvrir le fichier actuel</a></div>` : ""}
    ${field("sd-note", "Remarque", d.note, { type: "textarea", wide: true })}
    ${isNew ? "" : `<label class="chk"><input type="checkbox" id="sd-old" ${d.old ? "checked" : ""}> Classer dans les anciens documents <span class="muted small">(plus pris en compte pour les échéances)</span></label>`}
    <div class="err" id="sd-err"></div></div>
    <footer>${isNew ? "" : `<div class="left"><button type="button" class="btn danger" data-a="sdoc-del" data-staff="${p.id}" data-id="${d.id}">Supprimer</button></div>`}<button type="button" class="btn" data-a="staff-open" data-id="${p.id}">Retour</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const btn = m.querySelector("button.primary"); btn.disabled = true;
    const doc = Object.assign({}, d, { id: d.id || uid(), type: val("sd-type"), name: val("sd-name"), acType: val("sd-ac"), number: val("sd-num"), issued: val("sd-iss"), expires: val("sd-exp"), note: val("sd-note") });
    const oldBox = m.querySelector("#sd-old"); if (oldBox) { if (oldBox.checked) doc.old = true; else delete doc.old; }
    const f = m.querySelector("#sd-file")?.files[0];
    if (f) {
      try { const r = await assets.upload(f, f.type ? undefined : { type: "application/pdf" }); doc.file = r.id; doc.mime = r.contentType; doc.fileName = f.name; }
      catch (er) { m.querySelector("#sd-err").textContent = er.code === "too_large" ? "Fichier trop lourd (20 Mo maximum)." : er.code === "unsupported_type" ? "Format non accepté : utilisez un PDF ou une photo." : "Le fichier n'a pas pu être envoyé. Réessayez."; btn.disabled = false; return; }
    }
    const fresh = staff(p.id);
    await patch("staff", p.id, { docs: (fresh.docs || []).filter(x => x.id !== doc.id).concat(doc) });
    toast("Document enregistré"); openStaff(p.id);
  };
};
ACTIONS["sdoc-del"] = el => {
  const p = staff(el.dataset.staff);
  confirmBox("Supprimer ce document de la fiche ?", async () => { await patch("staff", p.id, { docs: (p.docs || []).filter(x => x.id !== el.dataset.id) }); setTimeout(() => openStaff(p.id), 50); });
};

/* ---- tableau de bord ---- */
WIDGETS.staff_due = { h: 8, t: "Échéances du personnel", ic: "👤", c: "blue", m: "personnel", size: "m", d: "Licences, visas, permis, badges et examens qui expirent (60 jours).",
  r() { const t = staffDue(60);
    return `<div class="w-list">${t.slice(0, 6).map(x => `<div class="list-row click" data-a="staff-open" data-id="${x.p.id}"><span>${esc(x.p.name)}<div class="muted small">${esc(x.label)}</div></span>${dueChip(x.date, 60)}</div>`).join("") || wEmpty("Rien dans les 60 prochains jours.")}</div>
      ${t.length > 6 ? `<div class="muted small">… et ${t.length - 6} autres</div>` : ""}${wLink("personnel", "Voir le personnel")}`; },
  go() { UI.tab.personnel = "echeances"; } };
