"use strict";
/* ======================= CONSIGNES DU STATION LEAD =======================
   Le Station Lead (ou le bureau) publie une consigne pour toute l'équipe ou certaines fonctions.
   Chaque personne la retrouve dans « Mes consignes », la lit et signe « Lu et compris » : la signature (qui, quand)
   est gardée sur la consigne et dans l'historique. Le serveur n'accepte que sa propre signature, une seule fois.
   instructions/<id> = { title, body, fns [] (vide = tout le monde), important, due, at, by, archived, files [], acks { staffId: { at, name } } } */
const canPublishIns = () => !readOnly && (isOffice() || meStaff()?.function === "lead");
const insActive = () => S.instructions.filter(i => !i.archived).sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0) || String(b.at || "").localeCompare(String(a.at || "")));
const insFor = (i, p) => p && p.active !== false && p.function !== "hq" && (!(i.fns || []).length || (i.fns || []).includes(p.function));
const insAudience = i => rosterStaff().filter(p => insFor(i, p));
const insAcked = (i, pid) => !!(i.acks || {})[pid];
const insMine = () => { const me = meStaff(); return me ? insActive().filter(i => insFor(i, me)) : []; };
const insUnread = () => { const me = meStaff(); return me ? insMine().filter(i => !insAcked(i, me.id)) : []; };

VIEWS.consignes = {
  render() {
    const me = meStaff(), mine = insMine(), unread = insUnread(), tab = curTab("consignes", me ? "miennes" : "toutes");
    const list = tab === "miennes" ? mine : tab === "archives" ? S.instructions.filter(i => i.archived) : insActive();
    return head("Consignes", "Les consignes du Station Lead. Chacun les lit et signe « Lu et compris » ; la signature est gardée.",
      canPublishIns() ? `<button class="btn primary" data-a="ins-form">Nouvelle consigne</button>` : "") +
      (me ? "" : `<div class="banner info">${esc(tr("Votre compte n'est relié à aucune fiche Personnel (même e-mail) : vous ne pouvez pas signer les consignes."))}</div>`) +
      tabs("consignes", [...(me ? [["miennes", "Mes consignes", unread.length, unread.length > 0]] : []), ["toutes", "Toutes", insActive().length], ...(S.instructions.some(i => i.archived) ? [["archives", "Archivées"]] : [])]) +
      `<div class="ins-list">${list.map(i => insCard(i, me)).join("") || `<div class="panel pad muted">${esc(tr("Aucune consigne ici."))}</div>`}</div>`;
  }
};
function insCard(i, me) {
  const aud = insAudience(i), done = aud.filter(p => insAcked(i, p.id)), mineToSign = me && insFor(i, me) && !insAcked(i, me.id), ack = me ? (i.acks || {})[me.id] : null;
  return `<section class="panel ins ${i.important ? "imp" : ""} ${mineToSign ? "todo" : ""}"><div class="pad">
    <div class="row-sb"><h3>${i.important ? `<span class="chip sm bad">${esc(tr("Important"))}</span> ` : ""}${esc(i.title || "")}</h3>
      <span class="small muted">${esc(i.by || "")} · ${fmtDT(i.at)}${i.due ? ` · ${esc(tr("à lire avant le"))} ${fmtDate(i.due)}` : ""}</span></div>
    <div class="pre ins-body">${esc(i.body || "")}</div>
    ${(i.files || []).length ? `<div class="row-g wrap">${i.files.map(f => `<a class="btn sm" href="${esc(blobUrl(f.id))}" target="_blank" rel="noopener">${esc(f.name || "Document")}</a>`).join("")}</div>` : ""}
    <div class="row-sb ins-foot"><span class="small">${(i.fns || []).length ? esc(i.fns.map(f => tr(STAFF_FN[f] || f)).join(", ")) : esc(tr("Toute l'équipe"))} ·
      <button class="linkbtn small" data-a="ins-who" data-id="${i.id}">${done.length} / ${aud.length} ${esc(tr("ont signé"))}</button></span>
      <span class="row-g">${mineToSign && !readOnly ? `<button class="btn primary" data-a="ins-ack" data-id="${i.id}">✔ ${esc(tr("Lu et compris"))}</button>` : ack ? `<span class="chip good">✔ ${esc(tr("Lu et compris le"))} ${fmtDT(ack.at)}</span>` : ""}
        ${canPublishIns() ? `<button class="btn sm" data-a="ins-form" data-id="${i.id}">${esc(tr("Modifier"))}</button>` : ""}</span></div></div></section>`;
}
ACTIONS["ins-ack"] = el => {
  const i = S.instructions.find(x => x.id === el.dataset.id), me = meStaff(); if (!i || !me) return;
  confirmBox(`<b>${esc(i.title)}</b><br>${esc(tr("Je confirme avoir lu et compris cette consigne."))}`, async () => {
    await patch("instructions", i.id, { acks: { [me.id]: { at: new Date().toISOString(), name: me.name } } });
  }, tr("Lu et compris"));
};
ACTIONS["ins-who"] = el => {
  const i = S.instructions.find(x => x.id === el.dataset.id); if (!i) return;
  const aud = insAudience(i), yes = aud.filter(p => insAcked(i, p.id)), no = aud.filter(p => !insAcked(i, p.id));
  modal(`${mHead(esc(i.title))}<div class="body"><h3>${esc(tr("Ont signé"))} (${yes.length})</h3>${yes.map(p => `<div class="list-row"><span>${esc(p.name)}</span><span class="small muted">${fmtDT(i.acks[p.id].at)}</span></div>`).join("") || `<div class="muted small">—</div>`}
    <h3>${esc(tr("Pas encore signé"))} (${no.length})</h3>${no.map(p => `<div class="list-row"><span>${esc(p.name)}</span><span class="small muted">${esc(tr(STAFF_FN[p.function] || ""))}</span></div>`).join("") || `<div class="muted small">${esc(tr("Tout le monde a signé."))}</div>`}</div>
    <footer><button class="btn" data-close>Fermer</button></footer>`);
};
ACTIONS["ins-form"] = el => {
  if (!canPublishIns()) return;
  const i = S.instructions.find(x => x.id === el.dataset.id) || { fns: [], important: false };
  const m = modal(`${mHead(i.id ? "Modifier la consigne" : "Nouvelle consigne")}<form><div class="body"><div class="fields">
    ${field("in-title", "Titre", i.title, { required: true, autofocus: true, wide: true })}${field("in-body", "Consigne", i.body, { type: "textarea", wide: true, required: true })}
    ${field("in-due", "À lire avant le (facultatif)", i.due, { type: "date" })}</div>
    <div class="f"><span>${esc(tr("Pour qui"))}</span><div class="row-g wrap">${Object.entries(STAFF_FN).filter(([k]) => k !== "hq").map(([k, l]) => `<label class="chk"><input type="checkbox" value="${k}" data-fn ${(i.fns || []).includes(k) ? "checked" : ""}> ${esc(tr(l))}</label>`).join("")}</div><div class="hint">${esc(tr("Rien de coché = toute l'équipe."))}</div></div>
    <label class="chk"><input type="checkbox" id="in-imp" ${i.important ? "checked" : ""}> ${esc(tr("Important (en tête, en rouge)"))}</label>
    ${assets ? `<label class="f">${esc(tr("Joindre un document (facultatif)"))}<input type="file" id="in-file" accept="application/pdf,image/*"></label>` : ""}
    ${i.id ? `<label class="chk"><input type="checkbox" id="in-arch" ${i.archived ? "checked" : ""}> ${esc(tr("Archiver (plus affichée)"))}</label>` : ""}
    ${i.id && Object.keys(i.acks || {}).length ? `<div class="hint">${esc(tr("Déjà signée par"))} ${Object.keys(i.acks).length} ${esc(tr("personne(s) : si le contenu change vraiment, publiez plutôt une nouvelle consigne."))}</div>` : ""}<div class="err" id="in-err"></div></div>
    <footer>${i.id && isOffice() ? `<div class="left"><button type="button" class="btn danger" data-a="ins-del" data-id="${i.id}">Supprimer</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary">${esc(tr(i.id ? "Enregistrer" : "Publier"))}</button></footer></form>`, "lg");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const data = Object.assign({ acks: {}, files: [], at: new Date().toISOString(), by: meName() }, strip(i), { title: val("in-title").trim(), body: val("in-body"), due: val("in-due"),
      fns: [...m.querySelectorAll("[data-fn]:checked")].map(x => x.value), important: m.querySelector("#in-imp").checked, archived: !!m.querySelector("#in-arch")?.checked });
    const f = m.querySelector("#in-file")?.files[0];
    if (f) { try { const r = await assets.upload(f, f.type ? undefined : { type: "application/pdf" }); data.files = [...(data.files || []), { id: r.id, name: f.name }]; } catch (er) { m.querySelector("#in-err").textContent = tr("Le fichier n'a pas pu être envoyé. Réessayez."); return; } }
    await save("instructions", i.id, data); closeModal(); toast(i.id ? "Consigne enregistrée" : "Consigne publiée");
  };
};
ACTIONS["ins-del"] = el => confirmBox("Supprimer cette consigne et ses signatures ? Pour la retirer en gardant la trace, archivez-la plutôt.", () => remove("instructions", el.dataset.id));

WIDGETS.instructions = { h: 6, t: "Consignes", ic: "📣", c: "red", m: "consignes", size: "m", d: "Consignes du Station Lead à lire et signer « Lu et compris ».",
  r() { const u = insUnread(), all = insActive();
    return `<div class="w-stats">${wStat(u.length, "à lire", u.length ? "bad" : "")}${wStat(all.length, "en cours")}</div>
      <div class="w-list">${(u.length ? u : all).slice(0, 4).map(i => `<div class="list-row click" data-a="ins-go"><span>${i.important ? `<span class="chip sm bad">!</span> ` : ""}<b>${esc(i.title)}</b></span><span class="small muted">${fmtDate(String(i.at || "").slice(0, 10))}</span></div>`).join("") || `<div class="muted small">${esc(tr("Aucune consigne ici."))}</div>`}</div>`; } };
ACTIONS["ins-go"] = () => { location.hash = "#consignes"; };
