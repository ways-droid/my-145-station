"use strict";
/* ======================= TYPES D'APPAREILS =======================
   Base séparée des types d'appareils, en arbre : Fabricant > Type > Modèle > Moteurs
   (ex. Boeing > B747 > -400 > RR RB211, PW 4000, GE CF6-80).
   Les Avions et les Type Ratings du Personnel choisissent dans cette base : on compare alors vraiment un avion
   (type, modèle, moteur) aux qualifications d'un technicien. La validation et les CRS restent dans AMOS.
   actypes/<id> = { maker, code, name, models: [{ name, engines: ["…"] }] } */
const AT_PRESET = [
  { maker: "Boeing", code: "B747", name: "Boeing 747", models: [{ name: "-200", engines: ["PW JT9D", "GE CF6-50", "RR RB211"] }, { name: "-400", engines: ["RR RB211", "PW 4000", "GE CF6-80"] }, { name: "-8", engines: ["GEnx"] }] },
  { maker: "Boeing", code: "B767", name: "Boeing 767", models: [{ name: "-300ER", engines: ["GE CF6-80", "PW 4000", "RR RB211"] }] },
  { maker: "Boeing", code: "B777", name: "Boeing 777", models: [{ name: "-200/-300", engines: ["GE90", "PW 4000", "RR Trent 800"] }, { name: "-300ER/-200LR/F", engines: ["GE90"] }] }];
const atAll = () => (S.actypes || []).filter(x => x && x.code);
const atList = () => atAll().slice().sort((a, b) => String(a.maker || "").localeCompare(String(b.maker || "")) || String(a.code).localeCompare(String(b.code)));
const atOf = code => atAll().find(x => x.code === code) || null;
const atModels = code => (atOf(code)?.models || []).map(m => m.name).filter(Boolean);
const atEngines = (code, model) => { const ms = (atOf(code)?.models || []).filter(m => !model || m.name === model); return [...new Set(ms.flatMap(m => m.engines || []).filter(Boolean))]; };
const canAT = () => isOffice() && !readOnly;
const atOpts = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === (cur || "") ? "selected" : ""}>${esc(l)}</option>`).join("");
const atUniq = (list, cur) => [...new Set([...list, cur].filter(Boolean))];
/* listes filtrées : modèles d'un type, moteurs d'un type (et d'un modèle) ; "" = tous */
const atModelOpts = (t, cur, all = "Tous les modèles") => atOpts([["", tr(t && atOf(t) ? all : "—")], ...atUniq(atModels(t), cur).map(x => [x, x])], cur);
const atEngOpts = (t, m, cur, all = "Tous les moteurs") => atOpts([["", tr(t && atOf(t) ? all : "—")], ...atUniq(atEngines(t, m), cur).map(x => [x, x])], cur);

function atTree() {
  const l = atList(), ed = canAT(), makers = [...new Set(l.map(t => t.maker || tr("Autre")))];
  return `<div class="panel"><div class="pad row-sb wrap"><div class="hint">${esc(tr("Fabricant > Type > Modèle > Moteurs. Les Avions et les Type Ratings du Personnel choisissent dans cette liste."))}</div>
    ${ed ? `<button class="btn primary" data-a="at-form">${esc(tr("Ajouter un type"))}</button>` : ""}</div>
    ${!l.length ? `<div class="pad stack"><div class="muted">${esc(tr("Aucun type d'appareil pour l'instant."))}</div>${ed ? `<div><button class="btn" data-a="at-preset">${esc(tr("Préparer B747, B767, B777 (à adapter)"))}</button></div>` : ""}</div>` : ""}
    ${makers.map(mk => `<div class="pad at-maker"><h3>${esc(mk)}</h3>${l.filter(t => (t.maker || tr("Autre")) === mk).map(t => `<div class="at-type ${ed ? "click" : ""}" ${ed ? `data-a="at-form" data-id="${t.id}"` : ""}>
      <div><b class="mono">${esc(t.code)}</b> ${t.name ? `<span class="muted">${esc(t.name)}</span>` : ""} <span class="muted small">· ${plural(aircraftList().filter(a => a.acType === t.code && a.active !== false).length, "avion")}</span></div>
      <ul class="at-models">${(t.models || []).map(m => `<li><b>${esc(m.name)}</b> ${(m.engines || []).map(e => `<span class="chip sm">${esc(e)}</span>`).join(" ") || `<span class="muted small">${esc(tr("moteurs à compléter"))}</span>`}</li>`).join("") || `<li class="muted small">${esc(tr("Aucun modèle"))}</li>`}</ul></div>`).join("")}</div>`).join("")}</div>`;
}
/* catégories de conditions pour signer : modifiables, avec les stations où elles s'appliquent */
function condPanel() {
  const ed = canAT(), l = condCats();
  return `<div class="panel"><div class="pad row-sb wrap"><div><h3 class="np">${esc(tr("Approvals et catégories de licence"))}</h3>
    <div class="hint">${esc(tr("Ce que l'on peut exiger dans les conditions pour signer un avion. « Approval sur le Type Rating » : se coche à côté de chaque Type Rating du technicien (ex. E EASA, I israélienne, F FAA). « Catégorie de licence » : se choisit dans ses licences (ex. B1, B2). Une ligne limitée à certaines stations n'est proposée et vérifiée que là."))}</div></div>
    ${ed ? `<button class="btn" data-a="cond-form">${esc(tr("Modifier la liste"))}</button>` : ""}</div>
    <div class="tablewrap"><table><thead><tr><th>${esc(tr("Code"))}</th><th>${esc(tr("Libellé"))}</th><th>${esc(tr("Se lit sur"))}</th><th>${esc(tr("Stations"))}</th></tr></thead><tbody>
    ${l.map(c => `<tr class="${condHere(c) ? "" : "muted"}"><td><b class="mono">${esc(c.code)}</b></td><td>${esc(tr(c.label || ""))}</td><td>${esc(tr(c.on === "licence" ? "Catégorie de licence" : "Approval sur le Type Rating"))}</td>
      <td class="small">${String(c.stations || "").trim() ? esc(c.stations) + (condHere(c) ? "" : ` · ${esc(tr("pas cette station"))}`) : esc(tr("Toutes"))}</td></tr>`).join("")}</tbody></table></div></div>`;
}
const condRow = (c = {}) => `<div class="cond-row row-g wrap"><input class="cd-code mono" value="${esc(c.code || "")}" placeholder="B1" aria-label="${esc(tr("Code"))}" style="max-width:7em">
  <input class="cd-label" value="${esc(c.label ? tr(c.label) : "")}" placeholder="${esc(tr("Libellé"))}" aria-label="${esc(tr("Libellé"))}">
  <select class="cd-on" aria-label="${esc(tr("Se lit sur"))}">${atOpts([["rating", tr("Approval sur le Type Rating")], ["licence", tr("Catégorie de licence")]], c.on === "licence" ? "licence" : "rating")}</select>
  <input class="cd-st mono" value="${esc(c.stations || "")}" placeholder="${esc(tr("Toutes les stations"))}" aria-label="${esc(tr("Stations"))}" style="max-width:12em">
  <button type="button" class="x" data-a="cond-del" aria-label="${esc(tr("Retirer"))}">×</button></div>`;
ACTIONS["cond-add"] = el => el.closest("form").querySelector(".cond-list").insertAdjacentHTML("beforeend", condRow());
ACTIONS["cond-del"] = el => el.closest(".cond-row").remove();
ACTIONS["cond-form"] = () => {
  if (!canAT()) return;
  const m = modal(`${mHead("Approvals et catégories de licence")}<form><div class="body stack"><div class="hint">${esc(tr("Code, libellé, où il se lit (approval à côté du Type Rating, ou catégorie de licence) et stations où il s'applique, séparées par des virgules (ex. TLV). Vide = toutes les stations."))}</div>
    <div class="cond-list stack">${condCats().map(condRow).join("")}</div><div><button type="button" class="btn sm" data-a="cond-add">${esc(tr("Ajouter une ligne"))}</button></div><div class="err" id="cd-err"></div></div>
    <footer><div class="left"><button type="button" class="btn" data-a="cond-reset">${esc(tr("Valeurs par défaut"))}</button></div><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`, "lg");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const l = [...m.querySelectorAll(".cond-row")].map(r => ({ code: r.querySelector(".cd-code").value.trim().toUpperCase().replace(/\s+/g, ""), label: r.querySelector(".cd-label").value.trim(),
      on: r.querySelector(".cd-on").value, stations: splitList(r.querySelector(".cd-st").value).map(s => s.toUpperCase()).join(", ") })).filter(c => c.code);
    const bad = l.find(c => !/^[A-Z0-9&.\-]{1,16}$/.test(c.code)), dup = l.find((c, i) => l.findIndex(x => x.code === c.code) !== i);
    if (bad || dup) { m.querySelector("#cd-err").textContent = bad ? tr("Code invalide : lettres, chiffres, & . - (sans espace ni +).") + " " + bad.code : tr("Code en double :") + " " + dup.code; return; }
    if (!l.length) { m.querySelector("#cd-err").textContent = tr("Gardez au moins une catégorie."); return; }
    await saveSettings({ condCats: l }); closeModal(); toast("Catégories enregistrées");
  };
};
ACTIONS["cond-reset"] = el => { el.closest("form").querySelector(".cond-list").innerHTML = COND_DEF.map(condRow).join(""); };
const atModelRow = (m = {}) => `<div class="at-mrow row-g"><input class="at-mn mono" value="${esc(m.name || "")}" placeholder="-400" aria-label="${esc(tr("Modèle"))}" style="max-width:9em">
  <input class="at-me" value="${esc((m.engines || []).join(", "))}" placeholder="RR RB211, PW 4000, GE CF6-80" aria-label="${esc(tr("Moteurs"))}"><button type="button" class="x" data-a="at-mdel" aria-label="${esc(tr("Retirer"))}">×</button></div>`;
ACTIONS["at-madd"] = el => el.closest("form").querySelector(".at-mlist").insertAdjacentHTML("beforeend", atModelRow());
ACTIONS["at-mdel"] = el => el.closest(".at-mrow").remove();
ACTIONS["at-form"] = el => {
  if (!canAT()) return;
  const t = atAll().find(x => x.id === el.dataset.id) || { models: [] };
  const m = modal(`${mHead(t.id ? esc(t.code) : "Nouveau type d'appareil")}<form><div class="body stack"><div class="fields">
    ${field("at-maker", "Fabricant", t.maker, { ph: "Boeing, Airbus…", autofocus: !t.id, required: true })}${field("at-code", "Type (code)", t.code, { cls: "mono", ph: "B747", required: true })}
    ${field("at-name", "Nom complet", t.name, { ph: "Boeing 747", wide: true })}</div>
    <div><div class="row-sb"><h3>${esc(tr("Modèles et moteurs"))}</h3><button type="button" class="btn sm" data-a="at-madd">${esc(tr("Ajouter un modèle"))}</button></div>
    <div class="hint">${esc(tr("Une ligne par modèle (ex. -400), avec ses moteurs possibles séparés par des virgules."))}</div><div class="at-mlist stack">${(t.models || []).map(atModelRow).join("") || atModelRow()}</div></div>
    <div class="err" id="at-err"></div></div>
    <footer>${t.id ? `<div class="left"><button type="button" class="btn danger" data-a="at-del" data-id="${t.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`, "lg");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const code = val("at-code").trim().toUpperCase(), dup = atOf(code);
    if (dup && dup.id !== t.id) { m.querySelector("#at-err").textContent = tr("Ce type existe déjà."); return; }
    const models = [...m.querySelectorAll(".at-mrow")].map(r => ({ name: r.querySelector(".at-mn").value.trim(), engines: splitList(r.querySelector(".at-me").value) })).filter(x => x.name);
    await save("actypes", t.id, Object.assign(strip(t), { maker: val("at-maker").trim(), code, name: val("at-name").trim(), models }));
    closeModal(); toast("Type d'appareil enregistré");
  };
};
ACTIONS["at-del"] = el => confirmBox("Supprimer ce type de la base ? Les avions et les qualifications déjà encodés gardent leur texte.", async () => { await remove("actypes", el.dataset.id); closeModal(); });
ACTIONS["at-preset"] = async () => {
  if (!canAT() || atAll().length) return;
  for (const t of AT_PRESET) await save("actypes", null, JSON.parse(JSON.stringify(t)));
  toast("Types préparés : adaptez les modèles et moteurs");
};
