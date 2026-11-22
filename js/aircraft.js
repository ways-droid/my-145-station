"use strict";
/* ======================= AVIONS =======================
   Référentiel des avions servis par la station (données de la station seulement : la maintenance, les CRS et la
   navigabilité restent dans AMOS).
   aircraft/<id> = { reg, clientId, acType, variant, msn, engines, licences: ["E","I","F"], amosRef, active, notes }
   licences = licences ou approbations exigées pour signer cet avion (E = EASA, I = approbation israélienne, F = FAA).
   Le shift s'en sert : type proposé d'après l'immatriculation, et contrôle que les CRS affectés ont ces licences. */
const AC_LIC = [["E", "EASA"], ["I", "Approbation israélienne (4X-)"], ["F", "FAA"]];
const normReg = r => String(r || "").toUpperCase().replace(/\s+/g, "");
const aircraftList = () => S.aircraft || [];
const aircraftOf = reg => { const r = normReg(reg); return r ? aircraftList().find(a => normReg(a.reg) === r) || null : null; };
/* licences exigées par défaut : EASA, plus I pour un 4X- */
const acDefaultLic = reg => /^4X/i.test(normReg(reg)) ? ["E", "I"] : ["E"];
const acLic = a => Array.isArray(a.licences) && a.licences.length ? a.licences : acDefaultLic(a.reg);
/* conditions exigées pour signer (arbre ET / OU) : licRule, sinon la liste simple des licences (toutes exigées) */
const acRule = a => a.licRule && Array.isArray(a.licRule.items) && a.licRule.items.length ? a.licRule : { op: "and", items: acLic(a) };
/* choix d'une condition : les catégories qui s'appliquent à cette station (plus la valeur déjà choisie) */
const ruleLeaves = cur => [...condCats().filter(c => condHere(c) || c.code === cur).map(c => [c.code, `${c.code} · ${tr(c.label || "")} (${tr(c.on === "licence" ? "catégorie de licence" : "approval")})`]),
  ...(cur && !condOf(cur) ? [[cur, cur]] : [])];
const ruleLeaf = (v = condCats()[0]?.code || "E") => `<div class="rule-l row-g"><select class="rule-v" aria-label="${esc(tr("Condition"))}">${atOpts(ruleLeaves(v), v)}</select><button type="button" class="x" data-a="rule-del" aria-label="${esc(tr("Retirer"))}">×</button></div>`;
const ruleGroup = (n, root) => `<div class="rule-g ${root ? "root" : ""}"><div class="row-g wrap"><select class="rule-op" aria-label="${esc(tr("Opérateur"))}">${atOpts([["and", tr("ET : toutes ces conditions")], ["or", tr("OU : au moins une de ces conditions")]], n.op === "or" ? "or" : "and")}</select>
  <button type="button" class="btn sm" data-a="rule-leaf">${esc(tr("+ Condition"))}</button><button type="button" class="btn sm" data-a="rule-grp">${esc(tr("+ Groupe ET / OU"))}</button>${root ? "" : `<button type="button" class="x" data-a="rule-del" aria-label="${esc(tr("Retirer"))}">×</button>`}</div>
  <div class="rule-items stack">${(n.items || []).map(x => typeof x === "string" ? ruleLeaf(x) : ruleGroup(x)).join("")}</div></div>`;
const ruleRead = g => ({ op: g.querySelector(":scope > .row-g .rule-op").value, items: [...g.querySelector(":scope > .rule-items").children]
  .map(c => c.classList.contains("rule-g") ? ruleRead(c) : c.querySelector(".rule-v").value).filter(x => typeof x === "string" || x.items.length) });
const ruleCodes = n => typeof n === "string" ? [n] : (n?.items || []).flatMap(ruleCodes);
const rulePreview = el => { const f = el.closest("form"), g = f?.querySelector(".rule-g.root"), o = f?.querySelector("#ac-rule-txt"); if (g && o) o.textContent = ruleText(ruleRead(g)) || tr("aucune condition"); };
ACTIONS["rule-leaf"] = el => { const f = el.closest("form"); el.closest(".rule-g").querySelector(":scope > .rule-items").insertAdjacentHTML("beforeend", ruleLeaf()); rulePreview(f); f.dispatchEvent(new Event("rulechange")); };
ACTIONS["rule-grp"] = el => { const f = el.closest("form"); el.closest(".rule-g").querySelector(":scope > .rule-items").insertAdjacentHTML("beforeend", ruleGroup({ op: "or", items: [condCats()[0]?.code || "E"] })); rulePreview(f); f.dispatchEvent(new Event("rulechange")); };
ACTIONS["rule-del"] = el => { const f = el.closest("form"); (el.closest(".rule-l") || el.closest(".rule-g")).remove(); rulePreview(f); f.dispatchEvent(new Event("rulechange")); };
const acClient = a => S.clients.find(c => c.id === a.clientId) || clientOfReg(a.reg);
/* type, modèle et moteur de l'avion, comparés aux Type Ratings du Personnel */
const acSpec = a => ({ acType: a.acType, variant: a.variant || "", engine: a.engines || "" });
const acName = a => [a.acType, a.variant, a.engines ? "(" + a.engines + ")" : ""].filter(Boolean).join(" ");
/* personnes actives qui ont le droit de signer cet avion : Type Rating sur le type, le modèle et le moteur, avec toutes
   les licences exigées et l'autorisation compagnie (CRS) */
const acQualified = a => a.acType ? staffActive().filter(p => canSign(p, acSpec(a), acRule(a))) : [];
/* qualifiés mais sans autorisation compagnie */
const acNoCrs = a => a.acType ? staffActive().filter(p => !canSign(p, acSpec(a), acRule(a)) && trQualif(p, acSpec(a), acRule(a)).length) : [];

VIEWS.avions = {
  render() {
    const q = (UI.q || "").toLowerCase(), all = aircraftList().slice().sort((a, b) => (b.active !== false) - (a.active !== false) || normReg(a.reg).localeCompare(normReg(b.reg)));
    const rows = all.filter(a => !q || [a.reg, acClient(a)?.name, acClient(a)?.code, a.acType, a.variant, a.msn, a.amosRef].join(" ").toLowerCase().includes(q));
    const ed = isOffice() && !readOnly;
    const tab = curTab("avions", "liste");
    return head("Avions", "Avions servis par la station : immatriculation, compagnie, type, modèle, moteur et licences exigées pour signer. La maintenance reste dans AMOS.",
      ed && tab === "liste" ? `<button class="btn primary" data-a="ac-form">Ajouter un avion</button>` : "") +
      tabs("avions", [["liste", "Avions", all.filter(a => a.active !== false).length], ["types", "Types d'appareils", atAll().length, !atAll().length]]) +
      (tab === "types" ? atTree() : `<div class="panel">${searchBar(tr("Immatriculation, compagnie, type, MSN…"))}<div class="pad"><h3 class="np">${plural(all.filter(a => a.active !== false).length, "avion")} en service</h3></div>
      ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Immatriculation</th><th>Compagnie</th><th>Type</th><th>MSN</th><th>Conditions pour signer</th><th class="r">CRS autorisés</th></tr></thead><tbody>
        ${rows.map(a => { const c = acClient(a), n = acQualified(a).length;
          return `<tr class="click ${a.active === false ? "muted" : ""}" data-a="ac-form" data-id="${a.id}"><td><b class="mono">${esc(a.reg)}</b>${a.active === false ? ` <span class="chip">${esc(tr("Plus servi"))}</span>` : ""}</td>
            <td>${c ? esc(c.name) + (c.code ? ` <span class="muted small">${esc(c.code)}</span>` : "") : `<span class="muted">—</span>`}</td>
            <td>${esc(a.acType || "—")} <span class="muted small">${esc([a.variant, a.engines].filter(Boolean).join(" · "))}</span></td><td class="mono small">${esc(a.msn || "")}</td>
            <td><span class="chip mono">${esc(ruleText(acRule(a)) || "—")}</span></td>
            <td class="r"><span class="chip ${a.acType ? (n ? "good" : "bad") : ""}">${a.acType ? n : "—"}</span></td></tr>`; }).join("")}
      </tbody></table></div>` : `<div class="empty">${all.length ? "Aucun avion ne correspond." : "Aucun avion pour l'instant. Ajoutez les immatriculations servies par la station."}</div>`}
      <div class="pad hint">CRS autorisés : personnes actives du Personnel avec un Type Rating sur le type, le modèle et le moteur de l'avion, toutes les licences exigées (ex. E+I pour un 4X-) et l'autorisation compagnie (CRS). La validation des travaux reste dans AMOS.</div></div>`);
  }
};

ACTIONS["ac-form"] = el => {
  const a = aircraftList().find(x => x.id === el.dataset.id) || { reg: el.dataset.reg || "", active: true };
  const ro = readOnly || !isOffice(), rule = a.id ? acRule(a) : { op: "and", items: acDefaultLic(a.reg) };
  const clients = S.clients.slice().sort(byName);
  const types = acTypes(), q = a.id ? acQualified(a) : [], nc = a.id ? acNoCrs(a) : [];
  const m = modal(`${mHead(a.id ? esc(a.reg) : "Nouvel avion")}<form><div class="body stack"><fieldset ${ro ? "disabled" : ""} class="plain stack"><div class="fields">
    ${!ro && SERVER ? `<label class="f">${esc(tr("Immatriculation"))} *<div class="ac-regrow"><input id="ac-reg" class="mono" placeholder="4X-EKA" required ${a.id ? "" : "autofocus"} value="${esc(a.reg || "")}">
      <button type="button" class="btn sm" data-a="ac-lookup" title="${esc(tr("d'après l'immatriculation (ADSBdb, Flightradar24, OpenSky) : vous vérifiez avant d'appliquer"))}">${esc(tr("Récupérer les données"))}</button></div></label>`
      : field("ac-reg", "Immatriculation", a.reg, { cls: "mono", ph: "4X-EKA", required: true, autofocus: !a.id })}
    ${field("ac-client", "Compagnie aérienne", a.clientId || clientOfReg(a.reg)?.id || "", { type: "select", options: [["", "—"], ...clients.map(c => [c.id, c.name + (c.code ? " (" + c.code + ")" : "")])] })}
    ${field("ac-type", "Type d'avion", a.acType || "", { type: "select", options: [["", "—"], ...Array.from(new Set([...types, a.acType].filter(Boolean))).map(t => [t, t])] })}
    <label class="f"><span>${esc(tr("Modèle"))}</span><select id="ac-var">${atModelOpts(a.acType, a.variant, "—")}</select></label>
    <label class="f"><span>${esc(tr("Moteur"))}</span><select id="ac-eng">${atEngOpts(a.acType, a.variant, a.engines, "—")}</select></label>
    ${field("ac-msn", "MSN (n° de série)", a.msn, { cls: "mono" })}${field("ac-modes", "Mode S (hex)", a.modeS, { cls: "mono", ph: "738A01" })}
    ${field("ac-amos", "Référence AMOS", a.amosRef, { cls: "mono" })}</div><div id="ac-look-out"></div>
    <div class="f wide"><span>${esc(tr("Conditions pour signer cet avion"))}</span>${ruleGroup(rule, true)}
      <div class="small">${esc(tr("Règle"))} : <b class="mono" id="ac-rule-txt">${esc(ruleText(rule) || tr("aucune condition"))}</b></div>
      <div class="hint">${esc(tr("Construisez l'arbre avec autant de conditions et de groupes ET / OU que nécessaire, ex. E ET (B1 OU B2). E, I, F se lisent sur le Type Rating qui correspond à l'avion (type, modèle, moteur) ; B1, B2, A, C sur les licences de la personne. Par défaut : E, et I en plus pour un 4X-. Il faut aussi l'autorisation compagnie (CRS)."))}</div></div>
    <label class="chk line"><input type="checkbox" id="ac-active" ${a.active !== false ? "checked" : ""}> Servi par la station</label>
    ${field("ac-notes", "Notes", a.notes, { type: "textarea", wide: true })}</fieldset>
    <div class="hint">${esc(tr("Type, modèle et moteur viennent de la base Avions > Types d'appareils."))}</div>
    ${a.id && a.acType ? `<div class="small"><b>${esc(tr("Peuvent signer"))} ${esc(acName(a))} :</b> ${q.length ? q.sort(staffSort).map(p => esc(p.name)).join(", ") : `<span class="txt-warn">${esc(tr("personne"))}</span>`}</div>
      ${nc.length ? `<div class="small muted"><b>${esc(tr("Qualifiés sans autorisation compagnie (CRS)"))} :</b> ${nc.sort(staffSort).map(p => esc(p.name)).join(", ")}</div>` : ""}` : ""}
    <div class="err" id="ac-err"></div></div>
    <footer>${a.id && !ro ? `<div class="left"><button type="button" class="btn danger" data-a="ac-del" data-id="${a.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>${ro ? "Fermer" : "Annuler"}</button>${ro ? "" : `<button class="btn primary">Enregistrer</button>`}</footer></form>`);
  if (ro) return;
  const reg = m.querySelector("#ac-reg"), touched = { lic: !!a.id, client: !!a.clientId };
  const form = m.querySelector("form");
  form.addEventListener("change", e => { if (e.target.closest(".rule-g")) { touched.lic = true; rulePreview(form); } });
  form.addEventListener("rulechange", () => { touched.lic = true; });
  m.querySelector("#ac-client").onchange = () => { touched.client = true; };
  const ty = m.querySelector("#ac-type"), vr = m.querySelector("#ac-var");   // modèles et moteurs filtrés d'après le type
  ty.onchange = () => { vr.innerHTML = atModelOpts(ty.value, "", "—"); m.querySelector("#ac-eng").innerHTML = atEngOpts(ty.value, "", "", "—"); };
  vr.onchange = () => { m.querySelector("#ac-eng").innerHTML = atEngOpts(ty.value, vr.value, "", "—"); };
  reg.oninput = () => {   // nouvel avion : compagnie et licences proposées d'après l'immatriculation
    if (!touched.client) { const c = clientOfReg(reg.value); m.querySelector("#ac-client").value = c ? c.id : ""; }
    if (!touched.lic) { m.querySelector(".rule-g.root").outerHTML = ruleGroup({ op: "and", items: acDefaultLic(reg.value) }, true); rulePreview(form); }
  };
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const r = normReg(val("ac-reg")), dup = aircraftOf(r);
    if (!/^[A-Z0-9]{1,3}-?[A-Z0-9]{1,6}$/.test(r)) { m.querySelector("#ac-err").textContent = tr("Immatriculation invalide (ex. 4X-EKA, 9H-ABC, N123AB)."); return; }
    if (dup && dup.id !== a.id) { m.querySelector("#ac-err").textContent = tr("Cet avion existe déjà."); return; }
    const licRule = ruleRead(m.querySelector(".rule-g.root")), licences = [...new Set(ruleCodes(licRule).filter(c => condOf(c)?.on === "rating"))];
    await save("aircraft", a.id, Object.assign(strip(a), { reg: r, clientId: val("ac-client"), acType: val("ac-type"), variant: val("ac-var"), msn: val("ac-msn"), modeS: val("ac-modes").trim().toUpperCase(), engines: val("ac-eng"),
      amosRef: val("ac-amos"), licences, licRule, active: m.querySelector("#ac-active").checked, notes: val("ac-notes") }));
    closeModal(); toast("Avion enregistré");
  };
};
/* ---- récupération des données d'après l'immatriculation ---- */
/* propose type et modèle de la base Types d'appareils : B744 / « 747 412 » → B747 et le modèle -400 (ER si indiqué) */
function acLookMap(d) {
  const ic = String(d.icaoType || "").toUpperCase(), tn = String(d.typeName || ""), fam = ic.slice(0, 3), num = (tn.match(/(\d{3})/) || [])[1] || "";
  const t = atList().find(x => fam.length === 3 && x.code.toUpperCase().startsWith(fam)) || atList().find(x => num && (x.code.includes(num) || String(x.name || "").includes(num)));
  let ser = "", suf = "";
  const mm = tn.match(/\d{3}[\s-]?(\d)([0-9A-Z]{2})?\s*([A-Z]{1,4})?/i);
  if (mm) { ser = mm[1]; suf = (mm[3] || "").toUpperCase(); }
  if (!ser) { const c = ic.slice(3); if (/^\d$/.test(c)) ser = c; else if (c === "W") { ser = "3"; suf = "ER"; } else if (c === "L") { ser = "2"; suf = "LR"; } }
  let model = "";
  if (t && ser) {
    const score = n => { const s = String(n).toUpperCase(); let v = s.includes(ser + "00") || new RegExp("-" + ser + "(?![0-9])").test(s) ? 2 : 0; if (!v) return 0;
      if (suf.includes("ER")) v += s.includes("ER") ? 1 : 0; else if (s.includes("ER")) v -= 1; if (suf.includes("F") && s.includes("F")) v += 1; return v; };
    model = (t.models || []).map(x => [x.name, score(x.name)]).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1])[0]?.[0] || "";
  }
  const op = String(d.operator || "").toLowerCase(), oc = String(d.operatorIcao || "").toUpperCase();
  /* compagnie : code OACI (Clients), puis code court, puis nom (le plus proche) */
  const byIcao = S.clients.find(c => oc && String(c.icao || "").toUpperCase() === oc) || S.clients.find(c => oc && String(c.code || "").toUpperCase() === oc);
  const words = op.split(/[^a-z0-9]+/).filter(w => w.length >= 4), sc = c => { const n = String(c.name || "").toLowerCase(); return n === op ? 99 : words.filter(w => n.includes(w)).length - (n.split(/\s+/).length - words.length) * 0.1; };
  const byName = !byIcao && words.length ? S.clients.filter(c => !c.icao || !oc).map(c => [c, sc(c)]).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1])[0]?.[0] : null;
  const cl = byIcao || byName;
  /* moteur : « GE CF6-80C2B5F » → CF6-80 de la base (le nom sans le motoriste doit s'y retrouver ; « PW 4000 » ↔ PW4056) */
  let engine = "";
  if (t && d.engines) {
    const os = String(d.engines).toLowerCase().replace(/[^a-z0-9]/g, "");
    engine = atEngines(t.code, model).find(e => { const k = String(e).toLowerCase().replace(/^(ge|pw|rr|cfm|iae)[\s-]+/, "").replace(/[^a-z0-9]/g, ""), mk = (String(e).toLowerCase().match(/^(ge|pw|rr|cfm|iae)/) || [])[1] || "";
      return k && (/^\d+$/.test(k) ? os.includes(mk + k[0]) : os.includes(k)); }) || "";
  }
  return { acType: t?.code || "", variant: model, engine, clientId: cl?.id || "", clientByIcao: !!byIcao };
}
function acLookCard(out) {
  const L = UI.acLook; if (!L || !out) return;
  const d = L.d, p = L.p = acLookMap(d), cl = S.clients.find(c => c.id === p.clientId);
  const row = (k, v) => v ? `<tr><td class="muted">${esc(tr(k))}</td><td>${v}</td></tr>` : "";
  out.innerHTML = `<div class="ac-look-card"><table class="small"><tbody>
    ${row("Fabricant", esc(d.manufacturer || ""))}${row("Type", esc([d.typeName, d.icaoType ? "(" + d.icaoType + ")" : ""].filter(Boolean).join(" ")))}
    ${row("Opérateur", esc([d.operator, d.operatorIcao ? "(" + d.operatorIcao + ")" : ""].filter(Boolean).join(" ")))}${row("Pays", esc(d.country || ""))}${row("Mode S", d.modeS ? `<span class="mono">${esc(d.modeS)}</span>` : "")}
    ${row("MSN", d.msn ? `<span class="mono">${esc(d.msn)}</span>${d.lineNumber ? ` <span class="muted">· L/N ${esc(d.lineNumber)}</span>` : ""}` : L.msnState === "wait" ? `<span class="muted">${esc(tr("recherche…"))}</span>` : L.msnState === "none" ? `<span class="muted">${esc(tr("non trouvé"))}</span>` : "")}${row("Construit", esc(String(d.built || "").slice(0, 4)))}${row("Moteurs", esc(d.engines || ""))}
    </tbody></table>
    <div class="small"><b>${esc(tr("Proposé"))} :</b> ${esc(tr("Type"))} <b>${esc(p.acType || "—")}</b> · ${esc(tr("Modèle"))} <b>${esc(p.variant || "—")}</b> · ${esc(tr("Compagnie"))} <b>${esc(cl?.name || "—")}</b> · ${p.engine ? `${esc(tr("Moteur"))} <b>${esc(p.engine)}</b>` : esc(tr("Moteur : à choisir"))}${d.msn ? ` · MSN <b class="mono">${esc(d.msn)}</b>` : ""}</div>
    ${d.operatorIcao && !p.clientByIcao ? `<div class="small txt-warn">${esc(tr("Aucun client n'a le code OACI"))} <b class="mono">${esc(d.operatorIcao)}</b>${cl ? ` : ${esc(tr("compagnie proposée d'après le nom, à vérifier"))}` : ""}. ${esc(tr("Ajoutez ce code dans Clients pour la reconnaître à coup sûr."))}</div>` : ""}
    ${!p.acType && d.icaoType ? `<div class="small txt-warn">${esc(tr("Ce type n'est pas dans la base Types d'appareils : ajoutez-le dans Avions > Types d'appareils."))}</div>` : ""}
    <div class="row-g"><button type="button" class="btn sm primary" data-a="ac-look-apply">${esc(tr("Appliquer"))}</button><span class="small muted">${esc(tr("Source"))} : ${esc(d.sources.join(", "))}</span></div></div>`;
}
ACTIONS["ac-lookup"] = async el => {
  const f = el.closest("form"), out = f.querySelector("#ac-look-out"), reg = normReg(f.querySelector("#ac-reg").value);
  if (!reg) { out.innerHTML = `<div class="err">${esc(tr("Tapez d'abord l'immatriculation."))}</div>`; return; }
  out.innerHTML = `<div class="muted small">${esc(tr("Recherche…"))}</div>`; el.disabled = true;
  let d;
  try { d = await API.call("POST", "fr24/aircraft", { reg }); }
  catch (e) { out.innerHTML = `<div class="err">${esc(tr(e.message))}</div>`; return; }
  finally { el.disabled = false; }
  if (!d.found) { out.innerHTML = `<div class="small txt-warn">${esc(tr("Aucune donnée trouvée pour cet avion."))}${(d.errors || []).length ? " " + esc(d.errors.join(" · ")) : ""}</div>`; return; }
  const L = UI.acLook = { d, msnState: d.modeS ? "wait" : "" };
  acLookCard(out);
  /* le MSN arrive à part (OpenSky) : s'il tarde ou échoue, le reste est déjà affiché */
  if (d.modeS) try {
    const x = await API.call("POST", "fr24/aircraft-msn", { modeS: d.modeS });
    if (UI.acLook !== L) return;
    if (x.found) { for (const k of ["msn", "lineNumber", "built", "engines"]) if (x[k]) d[k] = x[k]; d.sources = [...d.sources, "OpenSky"]; L.msnState = ""; } else L.msnState = "none";
    acLookCard(out);
  } catch { if (UI.acLook === L) { L.msnState = "none"; acLookCard(out); } }
};
ACTIONS["ac-look-apply"] = el => {
  const f = el.closest("form"), L = UI.acLook; if (!L) return;
  const ty = f.querySelector("#ac-type"), vr = f.querySelector("#ac-var");
  if (L.p.acType) { if (![...ty.options].some(o => o.value === L.p.acType)) ty.insertAdjacentHTML("beforeend", `<option value="${esc(L.p.acType)}">${esc(L.p.acType)}</option>`); ty.value = L.p.acType;
    vr.innerHTML = atModelOpts(L.p.acType, L.p.variant, "—"); vr.value = L.p.variant || ""; f.querySelector("#ac-eng").innerHTML = atEngOpts(L.p.acType, vr.value, L.p.engine || "", "—"); if (L.p.engine) f.querySelector("#ac-eng").value = L.p.engine; }
  if (L.d.msn && !f.querySelector("#ac-msn").value.trim()) f.querySelector("#ac-msn").value = L.d.msn;
  if (L.p.clientId) f.querySelector("#ac-client").value = L.p.clientId;
  if (L.d.modeS) f.querySelector("#ac-modes").value = L.d.modeS;
  el.closest(".ac-look-card").innerHTML = `<div class="small txt-good">✓ ${esc(tr(L.p.engine ? "Données appliquées : vérifiez, puis enregistrez." : "Données appliquées : vérifiez, choisissez le moteur, puis enregistrez."))}</div>`;
};
ACTIONS["ac-del"] = el => confirmBox("Supprimer cet avion du référentiel ? Les shifts passés ne changent pas.", async () => { await remove("aircraft", el.dataset.id); closeModal(); });
