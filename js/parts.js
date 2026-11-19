"use strict";
/* ======================= PIÈCES : ENVOIS ET RÉCEPTIONS =======================
   Le stock et les commandes restent dans AMOS. Ici on suit seulement les mouvements physiques de pièces de la station :
   transferts vers / depuis une autre station, réceptions fournisseur, pièces envoyées en réparation, prêts, AOG.
   partMoves/<id> = { dir: out|in, kind, status: prep|sent|received|cancel, aog, date, pn, desc, serial, qty, unit, cond: S|U|core,
                      cert, certNo, amosRef, from, to, reg, carrier, awb, sentAt, eta, receivedAt, receivedBy, certOk, files[], notes } */
const PM_KIND = { station: "Transfert entre stations", supplier: "Fournisseur", repair: "Réparation", loan: "Prêt / emprunt", customer: "Client", other: "Autre" };
const PM_STATUS = { prep: ["À envoyer", "warn"], sent: ["Expédié", "info"], received: ["Reçu", "good"], cancel: ["Annulé", ""] };
const PM_COND = { S: "Serviceable", U: "Unserviceable", core: "Core / pour réparation" };
const PM_CERT = ["EASA Form 1", "FAA 8130-3", "CAAI Form 1", "CoC", "Autre"];
const pmOpen = m => m.status !== "received" && m.status !== "cancel";
const pmLate = m => pmOpen(m) && m.eta && m.eta < today();
const pmChip = m => (([l, c]) => `<span class="chip ${c}">${l}</span>`)(PM_STATUS[m.status] || PM_STATUS.prep);
const pmHere = () => settings().stationCode || "TLV";
const pmTrack = m => m.awb && typeof CARRIERS !== "undefined" && CARRIERS[m.carrier]?.[1] ? CARRIERS[m.carrier][1](encodeURIComponent(m.awb)) : "";
const pmPlaces = () => Array.from(new Set([pmHere(), ...S.partMoves.flatMap(m => [m.from, m.to]).filter(Boolean)])).sort();
const pmSort = (a, b) => (b.aog ? 1 : 0) - (a.aog ? 1 : 0) || String(a.eta || a.date || "").localeCompare(String(b.eta || b.date || ""));

VIEWS.pieces = {
  render() {
    const tab = curTab("pieces", "cours"), open = S.partMoves.filter(pmOpen), aog = open.filter(m => m.aog);
    return head("Pièces", "Envois et réceptions de pièces de la station. Le stock et les commandes restent dans AMOS.",
      readOnly ? "" : `<button class="btn" data-a="pm-form" data-dir="in">Réception attendue</button><button class="btn primary" data-a="pm-form" data-dir="out">Nouvel envoi</button>`) +
      `<div class="pipeline"><div class="panel tile c-yellow"><div class="lbl">À envoyer</div><div class="val">${open.filter(m => m.status === "prep").length}</div></div>
        <div class="panel tile c-blue"><div class="lbl">Expédiés</div><div class="val">${open.filter(m => m.status === "sent").length}</div><div class="note">${open.filter(pmLate).length} en retard</div></div>
        <div class="panel tile c-red ${aog.length ? "alert" : ""}"><div class="lbl">AOG</div><div class="val">${aog.length}</div></div></div>` +
      tabs("pieces", [["cours", "En cours", open.length, aog.length > 0], ["fini", "Reçus et annulés"]]) + pmList(tab === "cours");
  }
};
function pmList(open) {
  const q = UI.q.toLowerCase(), f = UI.filter;
  const rows = S.partMoves.filter(m => pmOpen(m) === open && (f === "tous" || (f === "aog" ? m.aog : m.dir === f))
    && (!q || [m.pn, m.desc, m.serial, m.amosRef, m.awb, m.from, m.to, m.reg, m.certNo].join(" ").toLowerCase().includes(q)))
    .sort(open ? pmSort : (a, b) => String(b.receivedAt || b.date || "").localeCompare(String(a.receivedAt || a.date || "")));
  return `<div class="panel">${searchBar("P/N, désignation, S/N, réf. AMOS, AWB, station…", [["tous", "Tous"], ["out", "Envois"], ["in", "Réceptions"], ["aog", "AOG", S.partMoves.some(m => pmOpen(m) && m.aog)]])}
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Pièce</th><th class="r">Qté</th><th>De → vers</th><th>Réf. AMOS</th><th>Transport</th><th>Statut</th></tr></thead><tbody>${rows.map(m => `<tr class="click" data-a="pm-open" data-id="${m.id}">
      <td class="num">${fmtDate(m.date)}<div class="small muted">${esc(tr(m.dir === "in" ? "Réception" : "Envoi"))}</div></td>
      <td>${m.aog ? `<span class="chip bad sm">AOG</span> ` : ""}<b class="mono">${esc(m.pn || "")}</b>${demoTag(m)}<div class="small">${esc(m.desc || "")}</div>${m.serial ? `<div class="small muted mono">S/N ${esc(m.serial)}</div>` : ""}</td>
      <td class="r num">${esc(m.qty ?? "")} ${esc(m.unit || "")}</td><td class="mono small">${esc(m.from || "?")} → ${esc(m.to || "?")}${m.reg ? `<div class="muted">${esc(m.reg)}</div>` : ""}</td>
      <td class="mono small">${esc(m.amosRef || "—")}</td>
      <td class="small">${m.awb ? (pmTrack(m) ? `<a href="${esc(pmTrack(m))}" target="_blank" rel="noopener" data-stop class="mono">${esc(CARRIERS[m.carrier]?.[0] || "")} ${esc(m.awb)} ↗</a>` : `<span class="mono">${esc(m.awb)}</span>`) : "—"}${m.eta && pmOpen(m) ? `<div class="${pmLate(m) ? "txt-warn" : "muted"}">ETA ${fmtDate(m.eta)}</div>` : ""}</td>
      <td>${pmChip(m)}${m.status === "received" && m.certOk === false ? `<div class="small txt-warn">${esc(tr("Certificat à vérifier"))}</div>` : ""}</td></tr>`).join("")}</tbody></table>
      ${rows.length ? "" : `<div class="empty">${open ? "Aucun envoi ni réception en cours." : "Rien ici pour l'instant."}</div>`}</div></div>`;
}
ACTIONS["pm-open"] = el => openPm(el.dataset.id);
async function openPm(id) {
  const m = await waitFind("partMoves", id); if (!m) return;
  const act = readOnly ? "" : [
    m.status === "prep" && m.dir === "out" ? `<button class="btn primary" data-a="pm-sent">Marquer envoyé</button>` : "",
    pmOpen(m) ? `<button class="btn ${m.dir === "in" || m.status === "sent" ? "primary" : ""}" data-a="pm-recv">${m.dir === "in" ? "Réceptionné" : "Reçu à destination"}</button>` : "",
    pmOpen(m) ? `<button class="btn" data-a="pm-cancel">Annuler</button>` : ""].join("");
  const mo = modal(`${mHead(`${m.aog ? `<span class="chip bad">AOG</span> ` : ""}<span class="mono">${esc(m.pn || "")}</span> ${esc(m.desc || "")} ${pmChip(m)}`)}<div class="body">
    <dl class="kv"><dt>Mouvement</dt><dd>${esc(tr(m.dir === "in" ? "Réception" : "Envoi"))} · ${esc(tr(PM_KIND[m.kind] || "—"))}</dd><dt>De → vers</dt><dd class="mono">${esc(m.from || "?")} → ${esc(m.to || "?")}</dd>
    ${m.serial ? `<dt>N° de série (S/N)</dt><dd class="mono">${esc(m.serial)}</dd>` : ""}<dt>Quantité</dt><dd>${esc(m.qty ?? "")} ${esc(m.unit || "")}</dd><dt>État de la pièce</dt><dd>${esc(tr(PM_COND[m.cond] || "—"))}</dd>
    <dt>Certificat</dt><dd>${esc([m.cert, m.certNo].filter(Boolean).join(" · ") || "—")}</dd><dt>Réf. AMOS</dt><dd class="mono">${esc(m.amosRef || "—")}</dd>${m.reg ? `<dt>Avion</dt><dd class="mono">${esc(m.reg)}</dd>` : ""}
    <dt>Transport</dt><dd>${m.awb ? `${esc(CARRIERS[m.carrier]?.[0] || "")} ${pmTrack(m) ? `<a href="${esc(pmTrack(m))}" target="_blank" rel="noopener" class="mono">${esc(m.awb)} ↗</a>` : `<span class="mono">${esc(m.awb)}</span>`}` : "—"}</dd>
    ${m.sentAt ? `<dt>Envoyé le</dt><dd>${fmtDate(m.sentAt)}</dd>` : ""}${m.eta ? `<dt>Arrivée prévue</dt><dd class="${pmLate(m) ? "txt-warn" : ""}">${fmtDate(m.eta)}</dd>` : ""}
    ${m.receivedAt ? `<dt>Reçu le</dt><dd>${fmtDate(m.receivedAt)}${m.receivedBy ? " · " + esc(m.receivedBy) : ""}${m.certOk ? ` <span class="chip good sm">${esc(tr("Certificat vérifié"))}</span>` : m.certOk === false ? ` <span class="chip warn sm">${esc(tr("Certificat à vérifier"))}</span>` : ""}</dd>` : ""}</dl>
    ${m.notes ? `<div class="quote">${esc(m.notes)}</div>` : ""}
    <h3>Documents</h3><div class="row-g wrap">${(m.files || []).map(f => `<a class="btn sm" href="${esc(blobUrl(f.id))}" target="_blank" rel="noopener">${esc(f.name || "Document")}</a>`).join("") || `<span class="muted small">Aucun document (Form 1, bon de livraison…).</span>`}
      ${assets && !readOnly ? `<label class="btn sm">+ Joindre<input type="file" id="pm-file" accept="application/pdf,image/*" hidden></label>` : ""}</div></div>
    <footer><div class="left">${readOnly ? "" : `<button class="btn" data-a="pm-form" data-id="${m.id}">Modifier</button>`}</div>${act}</footer>`, "lg");
  mo.dataset.pm = m.id;
  mo.querySelector("#pm-file")?.addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return; toast("Envoi du fichier…");
    try { const r = await assets.upload(f, f.type ? undefined : { type: "application/pdf" }); await patch("partMoves", m.id, { files: [...(m.files || []), { id: r.id, name: f.name }] }); toast("Fichier ajouté"); openPm(m.id); }
    catch (x) { toast(x.code === "too_large" ? "Fichier trop lourd (20 Mo maximum)." : "Envoi impossible pour l'instant."); }
  });
}
const curPm = () => S.partMoves.find(x => x.id === document.querySelector(".modal")?.dataset.pm);
ACTIONS["pm-sent"] = async () => { const m = curPm(); if (!m) return; await patch("partMoves", m.id, { status: "sent", sentAt: m.sentAt || today() }); toast("Marqué envoyé"); openPm(m.id); };
ACTIONS["pm-cancel"] = () => { const m = curPm(); if (!m) return; confirmBox("Annuler ce mouvement de pièce ?", async () => { await patch("partMoves", m.id, { status: "cancel" }); closeModal(); }, "Annuler le mouvement"); };
ACTIONS["pm-recv"] = () => {
  const m = curPm(); if (!m) return;
  const mo = modal(`${mHead("Réception · " + esc(m.pn || ""))}<form><div class="body"><div class="fields">${field("pr-date", "Date de réception", today(), { type: "date" })}${field("pr-by", "Reçu par", (ME && ME.name) || "")}</div>
    <label class="chk"><input type="checkbox" id="pr-ok" checked> Pièce et certificat vérifiés (P/N, S/N, état, ${esc(m.cert || "Form 1")})</label>
    <div class="hint">La réception dans le stock se fait dans AMOS.</div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Confirmer la réception</button></footer></form>`);
  mo.querySelector("form").onsubmit = async e => { e.preventDefault(); await patch("partMoves", m.id, { status: "received", receivedAt: val("pr-date") || today(), receivedBy: val("pr-by"), certOk: mo.querySelector("#pr-ok").checked }); toast("Réception enregistrée"); openPm(m.id); };
};
ACTIONS["pm-form"] = el => {
  const here = pmHere(), dir = el.dataset.dir || "out";
  const m = S.partMoves.find(x => x.id === el.dataset.id) || { dir, kind: "station", status: dir === "out" ? "prep" : "sent", date: today(), qty: 1, unit: "EA", cond: "S", cert: "EASA Form 1", from: dir === "in" ? "" : here, to: dir === "in" ? here : "" };
  const places = pmPlaces();
  const mo = modal(`${mHead(m.id ? "Modifier le mouvement" : m.dir === "in" ? "Réception attendue" : "Nouvel envoi")}<form><div class="body"><div class="fields">
    ${field("pf-kind", "Type", m.kind, { type: "select", options: Object.entries(PM_KIND) })}${field("pf-date", "Date", m.date, { type: "date" })}
    ${field("pf-pn", "Part number (P/N)", m.pn, { cls: "mono", required: true, autofocus: true })}${field("pf-desc", "Désignation", m.desc)}${field("pf-sn", "N° de série / lot", m.serial, { cls: "mono" })}
    ${field("pf-qty", "Quantité", m.qty, { type: "number", step: "0.01", min: 0 })}${field("pf-unit", "Unité", m.unit, { ph: "EA" })}${field("pf-cond", "État de la pièce", m.cond, { type: "select", options: Object.entries(PM_COND) })}
    ${field("pf-cert", "Certificat", m.cert, { type: "select", options: [["", "—"], ...PM_CERT.map(c => [c, c])] })}${field("pf-certno", "N° de certificat", m.certNo, { cls: "mono" })}${field("pf-amos", "Réf. AMOS (commande, transfert…)", m.amosRef, { cls: "mono" })}
    <label class="f">De<input id="pf-from" class="mono" list="pf-pl" value="${esc(m.from || "")}"></label><label class="f">Vers<input id="pf-to" class="mono" list="pf-pl" value="${esc(m.to || "")}"></label><datalist id="pf-pl">${places.map(p => `<option value="${esc(p)}">`).join("")}</datalist>
    ${field("pf-reg", "Avion (si la pièce est pour un avion)", m.reg, { cls: "mono" })}
    ${field("pf-car", "Transporteur", m.carrier || "", { type: "select", options: [["", "—"], ...(typeof CARRIERS !== "undefined" ? Object.entries(CARRIERS).map(([k, v]) => [k, v[0]]) : [])] })}${field("pf-awb", "AWB / n° de suivi", m.awb, { cls: "mono" })}${field("pf-eta", "Arrivée prévue", m.eta, { type: "date" })}</div>
    <label class="chk"><input type="checkbox" id="pf-aog" ${m.aog ? "checked" : ""}> AOG : avion bloqué au sol en attente de cette pièce</label>
    ${field("pf-notes", "Notes", m.notes, { type: "textarea", wide: true })}</div>
    <footer>${m.id && isOffice() && !readOnly ? `<div class="left"><button type="button" class="btn danger" data-a="pm-del" data-id="${m.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`, "lg");
  mo.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const awb = val("pf-awb").trim(), data = Object.assign({ files: [] }, strip(m), { kind: val("pf-kind"), date: val("pf-date") || today(), pn: val("pf-pn").trim().toUpperCase(), desc: val("pf-desc"), serial: val("pf-sn").trim().toUpperCase(),
      qty: +val("pf-qty") || 0, unit: val("pf-unit"), cond: val("pf-cond"), cert: val("pf-cert"), certNo: val("pf-certno").trim(), amosRef: val("pf-amos").trim(), from: val("pf-from").trim().toUpperCase(), to: val("pf-to").trim().toUpperCase(),
      reg: val("pf-reg").trim().toUpperCase(), carrier: val("pf-car"), awb, eta: val("pf-eta"), aog: mo.querySelector("#pf-aog").checked, notes: val("pf-notes") });
    if (!m.id && m.dir === "out" && awb) { data.status = "sent"; data.sentAt = data.date; }
    const id = await save("partMoves", m.id, data); toast("Mouvement enregistré"); openPm(id);
  };
};
ACTIONS["pm-del"] = el => confirmBox("Supprimer ce mouvement de pièce ?", () => remove("partMoves", el.dataset.id));

WIDGETS.parts_open = { h: 7, t: "Pièces en cours", ic: "📦", c: "yellow", m: "pieces", size: "m", d: "Envois et réceptions de pièces en cours, AOG, retards.",
  r() { const open = S.partMoves.filter(pmOpen).sort(pmSort);
    return `<div class="w-stats">${wStat(open.length, "en cours")}${wStat(open.filter(m => m.aog).length, "AOG", open.some(m => m.aog) ? "bad" : "")}${wStat(open.filter(pmLate).length, "en retard", open.some(pmLate) ? "warn" : "")}</div>
      <div class="w-list">${open.slice(0, 4).map(m => `<div class="list-row click" data-a="pm-open" data-id="${m.id}"><span>${m.aog ? `<span class="chip bad sm">AOG</span> ` : ""}<b class="mono">${esc(m.pn)}</b> <span class="muted small">${esc(m.from || "?")} → ${esc(m.to || "?")}</span></span>${pmChip(m)}</div>`).join("") || wEmpty("Aucun mouvement en cours.")}</div>${wLink("pieces")}`; } };
