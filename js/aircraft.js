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
const acClient = a => S.clients.find(c => c.id === a.clientId) || clientOfReg(a.reg);
/* personnes actives qualifiées pour signer cet avion : qualification sur le type avec toutes les licences exigées */
const acQualified = a => a.acType ? staffActive().filter(p => rated(p, a.acType) && acLic(a).every(c => ratingHas(p, a.acType, c))) : [];

VIEWS.avions = {
  render() {
    const q = (UI.q || "").toLowerCase(), all = aircraftList().slice().sort((a, b) => (b.active !== false) - (a.active !== false) || normReg(a.reg).localeCompare(normReg(b.reg)));
    const rows = all.filter(a => !q || [a.reg, acClient(a)?.name, acClient(a)?.code, a.acType, a.variant, a.msn, a.amosRef].join(" ").toLowerCase().includes(q));
    const ed = isOffice() && !readOnly;
    return head("Avions", "Avions servis par la station : immatriculation, compagnie, type et licences exigées pour signer. La maintenance reste dans AMOS.",
      ed ? `<button class="btn primary" data-a="ac-form">Ajouter un avion</button>` : "") +
      `<div class="panel">${searchBar(tr("Immatriculation, compagnie, type, MSN…"))}<div class="pad"><h3 class="np">${plural(all.filter(a => a.active !== false).length, "avion")} en service</h3></div>
      ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Immatriculation</th><th>Compagnie</th><th>Type</th><th>MSN</th><th>Licences exigées</th><th class="r">CRS qualifiés</th></tr></thead><tbody>
        ${rows.map(a => { const c = acClient(a), n = acQualified(a).length;
          return `<tr class="click ${a.active === false ? "muted" : ""}" data-a="ac-form" data-id="${a.id}"><td><b class="mono">${esc(a.reg)}</b>${a.active === false ? ` <span class="chip">${esc(tr("Plus servi"))}</span>` : ""}</td>
            <td>${c ? esc(c.name) + (c.code ? ` <span class="muted small">${esc(c.code)}</span>` : "") : `<span class="muted">—</span>`}</td>
            <td>${esc(a.acType || "—")} <span class="muted small">${esc(a.variant || "")}</span></td><td class="mono small">${esc(a.msn || "")}</td>
            <td>${acLic(a).map(l => `<span class="chip" title="${esc(tr(AC_LIC.find(x => x[0] === l)?.[1] || l))}">${l}</span>`).join(" ")}</td>
            <td class="r"><span class="chip ${a.acType ? (n ? "good" : "bad") : ""}">${a.acType ? n : "—"}</span></td></tr>`; }).join("")}
      </tbody></table></div>` : `<div class="empty">${all.length ? "Aucun avion ne correspond." : "Aucun avion pour l'instant. Ajoutez les immatriculations servies par la station."}</div>`}
      <div class="pad hint">CRS qualifiés : personnes actives du Personnel qualifiées sur le type, avec toutes les licences exigées (ex. E+I pour un 4X-). Les autorisations de signer restent dans AMOS.</div></div>`;
  }
};

ACTIONS["ac-form"] = el => {
  const a = aircraftList().find(x => x.id === el.dataset.id) || { reg: el.dataset.reg || "", active: true };
  const ro = readOnly || !isOffice(), lic = a.id ? acLic(a) : acDefaultLic(a.reg);
  const clients = S.clients.slice().sort(byName);
  const types = acTypes(), q = a.id ? acQualified(a) : [];
  const m = modal(`${mHead(a.id ? esc(a.reg) : "Nouvel avion")}<form><div class="body stack"><fieldset ${ro ? "disabled" : ""} class="plain stack"><div class="fields">
    ${field("ac-reg", "Immatriculation", a.reg, { cls: "mono", ph: "4X-EKA", required: true, autofocus: !a.id })}
    ${field("ac-client", "Compagnie aérienne", a.clientId || clientOfReg(a.reg)?.id || "", { type: "select", options: [["", "—"], ...clients.map(c => [c.id, c.name + (c.code ? " (" + c.code + ")" : "")])] })}
    ${field("ac-type", "Type d'avion", a.acType || "", { type: "select", options: [["", "—"], ...Array.from(new Set([...types, a.acType].filter(Boolean))).map(t => [t, t])] })}
    ${field("ac-var", "Version", a.variant, { ph: "767-300ER, 777-200LRF…" })}
    ${field("ac-msn", "MSN (n° de série)", a.msn, { cls: "mono" })}${field("ac-eng", "Moteurs", a.engines, { ph: "CF6-80C2…" })}
    ${field("ac-amos", "Référence AMOS", a.amosRef, { cls: "mono" })}</div>
    <div class="f"><span>Licences exigées pour signer cet avion</span><div class="row-g wrap" id="ac-lic">${AC_LIC.map(([c, l]) => `<label class="chk line"><input type="checkbox" value="${c}" ${lic.includes(c) ? "checked" : ""}> <b>${c}</b> ${esc(tr(l))}</label>`).join("")}</div>
      <div class="hint">Par défaut : E (EASA), et I en plus pour un 4X-. Le shift vérifie que les CRS affectés ont ces licences sur le type.</div></div>
    <label class="chk line"><input type="checkbox" id="ac-active" ${a.active !== false ? "checked" : ""}> Servi par la station</label>
    ${field("ac-notes", "Notes", a.notes, { type: "textarea", wide: true })}</fieldset>
    ${a.id && a.acType ? `<div class="small"><b>${esc(tr("CRS qualifiés"))} :</b> ${q.length ? q.sort(staffSort).map(p => esc(p.name)).join(", ") : `<span class="muted">${esc(tr("aucun"))}</span>`}</div>` : ""}
    <div class="err" id="ac-err"></div></div>
    <footer>${a.id && !ro ? `<div class="left"><button type="button" class="btn danger" data-a="ac-del" data-id="${a.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>${ro ? "Fermer" : "Annuler"}</button>${ro ? "" : `<button class="btn primary">Enregistrer</button>`}</footer></form>`);
  if (ro) return;
  const reg = m.querySelector("#ac-reg"), touched = { lic: !!a.id, client: !!a.clientId };
  m.querySelector("#ac-lic").onchange = () => { touched.lic = true; };
  m.querySelector("#ac-client").onchange = () => { touched.client = true; };
  reg.oninput = () => {   // nouvel avion : compagnie et licences proposées d'après l'immatriculation
    if (!touched.client) { const c = clientOfReg(reg.value); m.querySelector("#ac-client").value = c ? c.id : ""; }
    if (!touched.lic) { const d = acDefaultLic(reg.value); m.querySelectorAll("#ac-lic input").forEach(i => { i.checked = d.includes(i.value); }); }
  };
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const r = normReg(val("ac-reg")), dup = aircraftOf(r);
    if (!/^[A-Z0-9]{1,3}-?[A-Z0-9]{1,6}$/.test(r)) { m.querySelector("#ac-err").textContent = tr("Immatriculation invalide (ex. 4X-EKA, 9H-ABC, N123AB)."); return; }
    if (dup && dup.id !== a.id) { m.querySelector("#ac-err").textContent = tr("Cet avion existe déjà."); return; }
    const licences = Array.from(m.querySelectorAll("#ac-lic input:checked")).map(i => i.value);
    await save("aircraft", a.id, Object.assign(strip(a), { reg: r, clientId: val("ac-client"), acType: val("ac-type"), variant: val("ac-var"), msn: val("ac-msn"), engines: val("ac-eng"),
      amosRef: val("ac-amos"), licences, active: m.querySelector("#ac-active").checked, notes: val("ac-notes") }));
    closeModal(); toast("Avion enregistré");
  };
};
ACTIONS["ac-del"] = el => confirmBox("Supprimer cet avion du référentiel ? Les shifts passés ne changent pas.", async () => { await remove("aircraft", el.dataset.id); closeModal(); });
