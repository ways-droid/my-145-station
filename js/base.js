"use strict";
/* ======================= clients (compagnies aériennes servies par la station) ======================= */
const regsOf = c => String(c.regPrefixes || "").split(/[\s,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
/* client d'une immatriculation, d'après les préfixes de sa fiche (ex. 9H- pour MT) */
const clientOfReg = reg => { const r = String(reg || "").toUpperCase().replace(/\s+/g, ""); let best = null, len = 0;
  for (const c of S.clients) for (const p of regsOf(c)) if (r.startsWith(p) && p.length > len) { best = c; len = p.length; } return best; };
VIEWS.clients = {
  render() {
    const q = UI.q.toLowerCase();
    const rows = S.clients.filter(c => !q || [c.name, c.code, c.regPrefixes, c.contact, c.email, c.city].join(" ").toLowerCase().includes(q)).sort(byName);
    const prices = id => S.products.filter(p => p.clientId === id).length;
    return head("Clients", plural(S.clients.length, "client"), `<button class="btn primary" data-a="client-form" ${dis()}>Ajouter un client</button>`) +
      `<div class="panel">${searchBar("Rechercher un nom, un code, une immatriculation…")}
      <div class="tablewrap"><table><thead><tr><th>Client</th><th>Code</th><th>Immatriculations</th><th>Contact</th><th>Langue</th><th class="r">Tarifs</th></tr></thead><tbody>
      ${rows.map(c => `<tr class="click" data-a="client-form" data-id="${c.id}"><td><b>${esc(c.name)}</b>${demoTag(c)}<div class="muted">${esc(c.city || "")}</div></td>
        <td class="mono">${esc(c.code || "—")}</td><td class="mono">${esc(regsOf(c).join(" ") || "—")}</td>
        <td>${esc(c.contact || "")}<div class="muted">${esc(c.email || "")}</div></td><td><span class="chip ${c.lang === "en" ? "info" : ""}" data-noi18n>${c.lang === "en" ? "EN" : "FR"}</span></td>
        <td class="r num">${prices(c.id) || "—"}</td></tr>`).join("")}
      </tbody></table>${rows.length ? "" : `<div class="empty">${S.clients.length ? "Aucun client ne correspond." : "Aucun client pour l'instant."}</div>`}</div></div>`;
  }
};
ACTIONS["client-form"] = el => {
  const c = client(el.dataset.id) || {};
  const isNew = !c.id;
  const m = modal(`${mHead(isNew ? "Nouveau client" : esc(c.name))}<form id="f-client"><div class="body"><div class="fields">
    ${field("c-name", "Nom de la compagnie", c.name, { required: true })}${field("c-code", "Code court (Charge Sheet)", c.code, { ph: "MT, BE, IL…", cls: "mono" })}
    ${field("c-regs", "Préfixes d'immatriculation", c.regPrefixes, { ph: "9H- OO- OE-", cls: "mono" })}${field("c-vat", "N° TVA", c.vat)}
    ${field("c-contact", "Personne de contact", c.contact)}${field("c-email", "E-mail", c.email, { type: "email" })}
    ${field("c-lang", "Langue de communication", c.lang || "en", { type: "select", options: [["fr", "Français"], ["en", "English"]] })}${field("c-phone", "Téléphone", c.phone)}${field("c-address", "Adresse", c.address)}${field("c-city", "Code postal et ville", c.city)}
  </div>${field("c-notes", "Notes", c.notes, { type: "textarea" })}</div>
  <footer>${isNew ? "" : `<div class="left"><button type="button" class="btn danger" data-a="client-del" data-id="${c.id}" ${dis()}>Supprimer</button></div>`}
  <button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    await save("clients", c.id, Object.assign({}, strip(c), { name: val("c-name"), code: val("c-code").toUpperCase(), regPrefixes: val("c-regs").toUpperCase(), vat: val("c-vat"), contact: val("c-contact"), email: val("c-email"), phone: val("c-phone"), lang: val("c-lang") || "en", address: val("c-address"), city: val("c-city"), notes: val("c-notes") }));
    closeModal(); toast("Client enregistré");
  };
};
ACTIONS["client-del"] = el => {
  const id = el.dataset.id, n = S.products.filter(p => p.clientId === id).length;
  confirmBox(n ? `Ce client a ${plural(n, "tarif")} dans Articles et prix. Supprimer quand même ?` : "Supprimer ce client ?", () => remove("clients", id));
};

/* ======================= PRODUITS & PRIX ======================= */
/* champ de prix modifiable directement dans les tableaux : enregistré à la sortie du champ */
function priceInput(col, id, fieldName, v) {
  return `<input class="price-in num" type="number" step="0.01" min="0" value="${v ?? 0}" data-price="${col}|${id}|${fieldName}" aria-label="Prix HT" ${dis()}>`;
}
document.addEventListener("change", async e => {
  const el = e.target; if (!el.dataset || el.dataset.price == null) return;
  const [col, id, f] = el.dataset.price.split("|"), v = r2(+el.value || 0);
  el.classList.add("saving");
  if (col === "settings") await saveSettings({ [f]: v });
  else await patch(col, id, { [f]: v });
  el.classList.remove("saving"); el.classList.add("saved"); setTimeout(() => el.classList.remove("saved"), 1200);
  toast("Prix enregistré : " + eur(v));
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.dataset && e.target.dataset.price != null) { e.preventDefault(); e.target.blur(); } });

/* Articles et prix : tarifs utilisés par les Charge Sheets (forfaits par type d'avion, heures CRS / non-CRS, matériel…) */
const PROD_KIND = { forfait: "Forfait", heure: "Heures", materiel: "Matériel / équipement", autre: "Autre" };
VIEWS.produits = {
  render() {
    const q = UI.q.toLowerCase();
    const rows = S.products.filter(p => (UI.filter === "tous" || (UI.filter === "general" ? !p.clientId : p.clientId === UI.filter)) && (!q || [p.ref, p.name, p.acType, clientName(p.clientId)].join(" ").toLowerCase().includes(q)))
      .sort((a, b) => (clientName(a.clientId) + a.ref).localeCompare(clientName(b.clientId) + b.ref, "fr"));
    const filt = [["tous", "Tout"], ["general", "Tarif général"], ...S.clients.slice().sort(byName).map(c => [c.id, c.code || c.name])];
    return head("Articles et prix", "Tarifs utilisés pour préparer les Charge Sheets. Modifiez un prix directement dans le tableau : il est enregistré dès que vous quittez la case.", `<button class="btn primary" data-a="prod-form" ${dis()}>Ajouter un article</button>`) +
      `<div class="panel">${searchBar("Rechercher une référence, un libellé, un type d'avion…", filt)}
      <div class="tablewrap"><table><thead><tr><th>Réf.</th><th>Article</th><th>Client</th><th>Type d'avion</th><th>Type</th><th class="r" style="width:140px">Prix</th></tr></thead><tbody>
      ${rows.map(p => `<tr class="click" data-a="prod-form" data-id="${p.id}"><td class="mono">${esc(p.ref || "")}</td><td>${esc(p.name)}${demoTag(p)}<div class="muted">par ${esc(p.unit || "unité")}</div></td>
        <td>${p.clientId ? esc(clientName(p.clientId)) : `<span class="muted">Tarif général</span>`}</td><td class="mono">${esc(p.acType || "—")}</td>
        <td><span class="chip">${esc(PROD_KIND[p.kind] || PROD_KIND.autre)}</span></td><td class="r">${priceInput("products", p.id, "price", p.price)}</td></tr>`).join("")}
      </tbody></table>${rows.length ? "" : `<div class="empty">Rien à afficher.</div>`}</div></div>`;
  }
};
ACTIONS["prod-form"] = el => {
  const p = S.products.find(x => x.id === el.dataset.id) || { kind: "forfait", unit: "EA", currency: "EUR" };
  const isNew = !p.id;
  const m = modal(`${mHead(isNew ? "Nouvel article" : esc(p.name))}<form><div class="body"><div class="fields">
    ${field("p-ref", "Référence", p.ref, { cls: "mono" })}${field("p-name", "Libellé (tel qu'il apparaît sur la Charge Sheet)", p.name, { required: true, wide: true })}
    ${field("p-kind", "Type", p.kind || "autre", { type: "select", options: Object.entries(PROD_KIND) })}
    ${field("p-client", "Client", p.clientId || "", { type: "select", options: [["", "Tarif général"], ...S.clients.slice().sort(byName).map(c => [c.id, c.name])] })}
    ${field("p-ac", "Type d'avion", p.acType, { ph: "767, 777, 747…" })}${field("p-unit", "Unité", p.unit, { ph: "EA, MHRS…" })}
    ${field("p-price", "Prix", p.price, { type: "number", step: "0.01", required: true })}${field("p-cur", "Devise", p.currency || "EUR", { type: "select", options: [["EUR", "EUR"], ["USD", "USD"], ["ILS", "ILS"]] })}
  </div>${field("p-notes", "Notes", p.notes, { type: "textarea" })}</div>
  <footer>${isNew ? "" : `<div class="left"><button type="button" class="btn danger" data-a="prod-del" data-id="${p.id}" ${dis()}>Supprimer</button></div>`}
  <button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${dis()}>Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    await save("products", p.id, Object.assign(strip(p), { ref: val("p-ref"), name: val("p-name"), kind: val("p-kind"), clientId: val("p-client"), acType: val("p-ac"), unit: val("p-unit"), price: +val("p-price") || 0, currency: val("p-cur") || "EUR", notes: val("p-notes") }));
    closeModal(); toast("Article enregistré");
  };
};
ACTIONS["prod-del"] = el => confirmBox("Supprimer cet article ?", () => remove("products", el.dataset.id));

/* ======================= paramètres ======================= */
VIEWS.parametres = {
  static: true,
  render() {
    const s = settings();
    const demo = COLS.reduce((a, c) => a + S[c].filter(x => x.demo).length, 0);
    return head("Paramètres", "Organisation, station, utilisateurs et services reliés") + sbxCardShell() + usersCardShell() + (typeof dbxCardShell === "function" ? dbxCardShell() : "") + (typeof waCardShell === "function" ? waCardShell() : "") + (typeof aiCardShell === "function" ? aiCardShell() : "") +
    `<form class="panel ${isAdmin() ? "" : "hidden"}" id="f-set" style="max-width:820px"><div class="pad stack"><h3>Organisation</h3><div class="fields">
      ${field("s-name", "Nom de l'organisation (Part 145)", s.name)}${field("s-approval", "N° d'agrément Part 145", s.approval, { ph: "XX.145.0000" })}
      ${field("s-vat", "N° d'entreprise / TVA", s.vat)}${field("s-email", "E-mail", s.email)}${field("s-phone", "Téléphone", s.phone)}
      ${field("s-address", "Adresse du siège", s.address, { wide: true })}
    </div><h3>Station</h3><div class="fields">
      ${field("s-station", "Code de la station (IATA)", s.stationCode, { ph: "TLV", cls: "mono" })}${field("s-stname", "Nom de la station", s.stationName, { ph: "Tel Aviv Ben Gurion" })}
      ${field("s-tz", "Fuseau horaire de la station", s.timeZone, { ph: "Asia/Jerusalem" })}
      ${field("s-actypes", "Types d'avion suivis (séparés par des virgules)", s.acTypes, { ph: "B747, B767, B777" })}
    </div>
    <div class="hint">Les tarifs des Charge Sheets se gèrent dans <a href="#produits">Articles et prix</a>.</div>
    <div><button class="btn primary" ${dis()}>Enregistrer les paramètres</button></div></div></form>
    <div class="panel" style="max-width:820px;margin-top:16px"><div class="pad stack"><h3>Données d'exemple</h3>
      ${typeof demoGenHtml === "function" ? demoGenHtml() : ""}
      <div>${demo ? `${plural(demo, "élément")} d'exemple sont présents pour tester l'application. Quand vous êtes prêt à saisir vos vraies données, supprimez-les en un clic.` : "Aucune donnée d'exemple : tout ce qui est ici est à vous."}</div>
      ${demo ? `<div class="row-g wrap"><button class="btn danger" data-a="purge-demo" ${dis()}>Supprimer toutes les données d'exemple</button>${S.vehicles.some(v => v.demo) ? `<button class="btn" data-a="purge-demo-fleet" ${dis()}>Supprimer seulement les véhicules d'exemple</button>` : ""}</div>` : ""}</div></div>
    ${SERVER && isAdmin() ? `<div class="panel" style="max-width:820px;margin-top:16px"><div class="pad stack"><h3>Import d'une sauvegarde</h3>
      <div>Déposez dans l'ordre les deux fichiers d'une sauvegarde de cet outil. Un import peut être relancé sans créer de doublons.</div>
      <div class="imp-grid">
        <label class="dropzone slim" for="imp-json"><b>1 · Données</b><span class="muted small">station-export-….json</span></label><input type="file" id="imp-json" accept=".json,application/json" hidden>
        <label class="dropzone slim" for="imp-zip"><b>2 · Fichiers joints</b><span class="muted small">station-fichiers-….zip</span></label><input type="file" id="imp-zip" accept=".zip,application/zip" hidden>
      </div>
      <div id="imp-log" class="small">${impMsg}</div>
      <div class="row-g wrap"><button class="btn" data-a="server-logout">Se déconnecter de ce navigateur</button></div></div></div>` : ""}
    <div class="panel" style="max-width:820px;margin-top:16px"><div class="pad stack"><h3>Sauvegarde</h3>
      <div>Télécharge toutes les données de l'outil (${plural(COLS.reduce((a, c) => a + S[c].length, 0) + 1, "élément")}) dans un fichier JSON.</div>
      <div class="row-g wrap"><button class="btn primary" data-a="export-data">Exporter les données</button><button class="btn" data-a="export-files">Exporter les fichiers joints (ZIP)</button></div>
      <div class="hint">Les fichiers joints (photos, certificats, documents) ne sont pas dans le JSON : le ZIP les contient, chacun nommé par son identifiant.</div></div></div>`;
  },
  after() {
    if (SERVER && isAdmin()) { loadUsers(); if (typeof loadDbx === "function") loadDbx(); if (typeof loadWa === "function") loadWa(); if (typeof loadAi === "function") loadAi(); }
    if (SERVER) { const j = document.getElementById("imp-json"), z = document.getElementById("imp-zip");
      if (j) j.onchange = e => e.target.files[0] && importJson(e.target.files[0]);
      if (z) z.onchange = e => e.target.files[0] && importZip(e.target.files[0]);
      document.querySelectorAll(".imp-grid .dropzone").forEach(dz => { dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); }; dz.ondragleave = () => dz.classList.remove("over");
        dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); const f = e.dataTransfer.files[0]; if (!f) return; (/\.zip$/i.test(f.name) ? importZip : importJson)(f); }; }); }
    const f = document.getElementById("f-set");
    f.onsubmit = async e => {
      e.preventDefault();
      await saveSettings({ name: val("s-name") || DEFAULT_SETTINGS.name, approval: val("s-approval"), vat: val("s-vat"), email: val("s-email"), phone: val("s-phone"), address: val("s-address"),
        stationCode: val("s-station").toUpperCase(), stationName: val("s-stname"), timeZone: val("s-tz"), acTypes: val("s-actypes") });
      toast("Paramètres enregistrés");
    };
  }
};
/* ======================= utilisateurs (version serveur, administrateur) ======================= */
const ROLE_HELP = { admin: "Tout, y compris les utilisateurs et les paramètres de l'organisation", bureau: "Tous les modules, sans les utilisateurs ni les paramètres de l'organisation", terrain: "Flotte, pannes, outillage et notes · pas d'administration, de clients, de prix ni de paramètres" };
let USERS = null;
function sbxCardShell() {
  if (!SERVER || !ME || !isOffice()) return "";
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack-s"><h3 class="np">Environnement de test</h3>
    ${SBX ? `<div class="banner bad"><b>Le test est actif depuis le ${esc(new Date(SBX.since).toLocaleString(LANG === "en" ? "en-GB" : "fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}.</b> Vos changements ne touchent pas la base principale.</div><div><button class="btn danger" data-a="sbx-stop">Quitter le test</button></div>`
      : `<div>Pour essayer l'outil (créer des fiches, des données d'exemple…) sans toucher aux vraies données. Le test ne concerne que <b>votre session</b> : les autres utilisateurs continuent normalement.</div><div><button class="btn sbx-btn" data-a="sbx-start">Activer l'environnement de test</button></div>`}</div></div>`;
}
function usersCardShell() {
  if (!SERVER || !isAdmin()) return "";
  if (ME && ME.key) return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><h3>Connexion par code</h3>
    <div>Chaque utilisateur tape son nom et reçoit un code à 8 chiffres par e-mail. Pour l'activer, configurez la boîte d'envoi, votre code maître et votre compte administrateur.</div>
    <div class="row-g wrap"><a class="btn primary" href="api/setup.php" target="_blank" rel="noopener">Configurer la connexion</a><button class="btn" data-a="users-recheck">J'ai terminé : passer à la connexion par code</button></div></div></div>`;
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><div class="row-sb"><h3 class="np">Utilisateurs</h3><span class="row-g"><a class="btn sm" href="api/setup.php" target="_blank" rel="noopener">E-mail et code maître</a><button class="btn sm primary" data-a="user-form" ${dis()}>Ajouter un utilisateur</button></span></div>
    <div class="muted small">Chaque utilisateur se connecte avec son nom et un code reçu par e-mail. Une connexion reste valable 8 heures sur l'appareil.</div><div id="users-list"><div class="muted">Chargement…</div></div></div></div>`;
}
async function loadUsers() {
  const box = document.getElementById("users-list"); if (!box || !API || (ME && ME.key)) return;
  try { USERS = (await API.call("GET", "auth/users")).users; } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  box.innerHTML = USERS.map(u => `<div class="list-row"><span><b>${esc(u.name)}</b>${u.active ? "" : ` <span class="chip">désactivé</span>`}<span class="muted small"> · ${esc(u.email)}</span></span>
    <span class="row-g">${u.tfaRequired || u.tfa ? `<span class="chip ${u.tfa ? "good" : "warn"}" title="${esc(tr(u.tfa ? "Second facteur actif" : "Second facteur pas encore activé (demandé à la prochaine connexion)"))}">${u.tfa ? "🔐 2FA" : "2FA à activer"}</span>` : ""}<span class="chip ${u.role === "admin" ? "warn" : u.role === "terrain" ? "info" : ""}">${ROLE_LBL[u.role] || u.role}</span><button class="btn sm" data-a="user-form" data-id="${esc(u.id)}" ${dis()}>Modifier</button></span></div>`).join("")
    + `<div class="row-g" style="margin-top:8px"><button class="linkbtn small" data-a="user-testmail">Envoyer un e-mail de test à mon adresse</button></div>`;
}
ACTIONS["users-recheck"] = () => { lsSet(KEY_LS, ""); location.reload(); };
ACTIONS["user-form"] = el => {
  const u = (USERS || []).find(x => x.id === el.dataset.id) || { id: "", name: "", email: "", role: "bureau", active: true };
  const isMe = ME && u.name === ME.name;
  const m = modal(`${mHead(u.id ? "Modifier l'utilisateur" : "Nouvel utilisateur")}<form><div class="body stack-s"><div class="fields">
    ${field("us-name", "Nom et prénom (tapé à la connexion)", u.name, { required: true })}${field("us-email", "E-mail (reçoit les codes)", u.email, { type: "email", required: true })}</div>
    <div class="stack-s">${Object.keys(ROLE_LBL).map(r => `<label class="chk line"><input type="radio" name="us-role" value="${r}" ${u.role === r ? "checked" : ""}> <b>${ROLE_LBL[r]}</b><span class="muted small"> · ${ROLE_HELP[r]}</span></label>`).join("")}</div>
    ${u.id && (u.tfa || u.tfaRequired) ? `<div class="small">Second facteur : ${u.tfa ? `<b>actif</b> <button type="button" class="linkbtn" data-a="user-tfa-reset" data-id="${esc(u.id)}">Réinitialiser (téléphone perdu)…</button>` : "pas encore activé (demandé à sa prochaine connexion)"}</div>` : ""}
    ${u.id ? `<label class="chk line"><input type="checkbox" id="us-active" ${u.active ? "checked" : ""}> Compte actif <span class="muted small">(décocher bloque la connexion et ferme ses sessions)</span></label>` : ""}
    <div class="err" id="us-err"></div></div>
    <footer>${u.id && !isMe ? `<div class="left"><button type="button" class="btn danger" data-a="user-del" data-id="${esc(u.id)}">Supprimer…</button></div>` : ""}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const role = m.querySelector('input[name="us-role"]:checked')?.value || "bureau", err = m.querySelector("#us-err");
    try {
      const id = u.id || "u" + uid();
      await API.call("PUT", "auth/users/" + id, { name: val("us-name"), email: val("us-email"), role, active: u.id ? m.querySelector("#us-active").checked : true });
      closeModal(); toast(u.id ? "Utilisateur modifié" : "Utilisateur ajouté"); if (isMe) { try { ME = (await API.call("GET", "auth/me")).user; } catch { } } loadUsers();
    } catch (x) { err.textContent = tr(x.message); }
  };
};
ACTIONS["user-tfa-reset"] = el => {
  const u = (USERS || []).find(x => x.id === el.dataset.id); if (!u) return;
  confirmBox(`Réinitialiser le second facteur de ${u.name} ? Ses sessions sont fermées ; il en réactivera un à sa prochaine connexion. Les administrateurs sont prévenus par e-mail.`, async () => { await API.call("POST", "auth/users/" + u.id + "/tfa-reset"); closeModal(); toast("Second facteur réinitialisé"); loadUsers(); }, "Réinitialiser");
};
ACTIONS["user-del"] = el => {
  const u = (USERS || []).find(x => x.id === el.dataset.id); if (!u) return;
  const m = modal(`${mHead("Supprimer l'utilisateur")}<div class="body stack-s"><div>Supprimer le compte de <b>${esc(u.name)}</b> ? Il ne pourra plus se connecter. Ses saisies passées sont conservées.</div>
    <div class="muted small">Pour une absence temporaire, désactivez plutôt le compte.</div>
    <label class="chk confirm-chk"><input type="checkbox" id="ud-ok"> Je confirme la suppression de <b>${esc(u.name)}</b></label><div class="err" id="ud-err"></div></div>
    <footer><button class="btn" data-close>Annuler</button><button class="btn primary danger-bg" id="ud-yes" disabled>Supprimer</button></footer>`, "sm");
  const ok = m.querySelector("#ud-ok"), yes = m.querySelector("#ud-yes");
  ok.onchange = () => yes.disabled = !ok.checked;
  yes.onclick = async () => { try { await API.call("DELETE", "auth/users/" + u.id); closeModal(); toast("Utilisateur supprimé"); loadUsers(); } catch (x) { m.querySelector("#ud-err").textContent = tr(x.message); } };
};
ACTIONS["user-testmail"] = async el => {
  el.disabled = true;
  try { await API.call("POST", "auth/test-mail", {}); toast("E-mail de test envoyé à " + (ME.email || "votre adresse")); } catch (e) { toast(tr(e.message)); }
  el.disabled = false;
};

/* véhicules d'exemple + tout ce qui y est rattaché (pannes, entretiens, prises en charge, amendes, positions, trajets, pneus en stock d'exemple) */
const FLEET_COLS = ["vehicles", "vehEvents", "faults", "driverLogs", "tires"];
function exportPayload() {
  const out = {};
  for (const c of COLS) {
    out[c] = {};
    for (const d of S[c] || []) { const x = Object.assign({}, d); delete x.id; out[c][d.id] = x; }
  }
  out.settings = { company: Object.assign({}, S.settings) };
  return out;
}
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
ACTIONS["export-data"] = async () => {
  const data = exportPayload();
  const n = Object.values(data).reduce((a, c) => a + Object.keys(c).length, 0);
  await offerFile(`station-export-${stamp()}.json`, JSON.stringify(data, null, 1), "application/json");
  toast(`Export prêt : ${plural(n, "élément")}`);
};
ACTIONS["export-files"] = async el => {
  const ids = new Set();
  JSON.stringify(exportPayload(), (k, v) => { if (typeof v === "string" && /^[0-9a-f]{32}$/.test(v)) ids.add(v); return v; });
  if (!ids.size) { toast("Aucun fichier joint à exporter."); return; }
  el.disabled = true; const label = el.textContent;
  try {
    if (!window.JSZip) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
    const zip = new JSZip(), list = [...ids], ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    let ok = 0, ko = 0;
    for (let i = 0; i < list.length; i++) {
      el.textContent = `Fichiers ${i + 1} / ${list.length}…`;
      try { const r = await fetch(blobUrl(list[i])); if (!r.ok) throw 0; const b = await r.blob(); zip.file(`files/${list[i]}.${ext[b.type] || "bin"}`, b); ok++; } catch (e) { ko++; }
    }
    const blob = await zip.generateAsync({ type: "blob" });
    await offerFile(`station-fichiers-${stamp()}.zip`, blob, "application/zip");
    toast(`${plural(ok, "fichier")} exporté${ok > 1 ? "s" : ""}${ko ? ` · ${ko} introuvable${ko > 1 ? "s" : ""}` : ""}`);
  } catch (e) { toast("Export des fichiers impossible ici."); }
  el.disabled = false; el.textContent = label;
};
/* ---- import d'une sauvegarde sur le serveur (une collection par envoi) ---- */
let impMsg = "";
const impLog = h => { impMsg = h; const el = document.getElementById("imp-log"); if (el) el.innerHTML = h; };
let importing = false;
async function importJson(file) {
  if (!API || importing) return; importing = true;
  try {
    let data; try { data = JSON.parse(await file.text()); } catch (e) { impLog(`<div class="err">${tr("Ce fichier n'est pas un export JSON de l'outil.")}</div>`); return; }
    if (!data || typeof data !== "object" || Array.isArray(data) || !(data.vehicles || data.clients || data.settings)) { impLog(`<div class="err">${tr("Ce fichier n'est pas un export JSON de l'outil.")}</div>`); return; }
    const colls = Object.keys(data).filter(c => data[c] && typeof data[c] === "object");
    let n = 0, i = 0;
    for (const c of colls) {
      i++; impLog(`${tr("Import des données…")} ${i} / ${colls.length} · ${esc(c)}`);
      const docs = data[c], ids = Object.keys(docs);
      for (let k = 0; k < ids.length; k += 300) {
        const part = {}; ids.slice(k, k + 300).forEach(id => part[id] = docs[id]);
        const r = await API.importAll({ [c]: part }); n += r.imported || 0;
      }
    }
    await API.refresh();
    impLog(`<span class="chip good">${plural(n, "élément")} ${tr("importés")}</span> ${tr("Étape suivante : le ZIP des fichiers joints.")}`);
    toast("Données importées");
  } catch (e) { impLog(`<div class="err">${tr("Import interrompu :")} ${esc(e.message || "")}. ${tr("Relancez-le : les éléments déjà importés sont simplement mis à jour.")}</div>`); }
  finally { importing = false; }
}
async function importZip(file) {
  if (!API || importing) return; importing = true;
  try {
    if (!window.JSZip) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
    const zip = await JSZip.loadAsync(file), entries = [];
    zip.forEach((p, e) => { const m = p.match(/([a-f0-9]{32})(\.[a-z0-9]+)?$/i); if (!e.dir && m) entries.push({ e, id: m[1].toLowerCase(), ext: m[2] || "" }); });
    if (!entries.length) { impLog(`<div class="err">${tr("Aucun fichier reconnu dans ce ZIP.")}</div>`); return; }
    // retrouve le nom d'origine de chaque fichier dans les données
    const names = {};
    const walk = o => { if (!o || typeof o !== "object") return; if (Array.isArray(o)) return o.forEach(walk);
      for (const k of ["file", "photo"]) if (typeof o[k] === "string" && o.fileName) names[o[k]] = o.fileName; Object.values(o).forEach(walk); };
    COLS.forEach(c => walk(S[c]));
    const MIME = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
    let ok = 0, skip = 0, ko = 0;
    for (let i = 0; i < entries.length; i++) {
      const { e, id, ext } = entries[i];
      impLog(`${tr("Envoi des fichiers…")} ${i + 1} / ${entries.length}`);
      try {
        const blob = await e.async("blob"), name = names[id] || id + ext;
        const r = await API.upload(new File([blob], name, { type: MIME[ext] || "application/octet-stream" }), { id });
        r.exists ? skip++ : ok++;
      } catch (err) { ko++; }
    }
    impLog(`<span class="chip good">${plural(ok, "fichier")} ${tr("envoyés")}</span>${skip ? ` · ${skip} ${tr("déjà présents")}` : ""}${ko ? ` · <span class="chip bad">${ko} ${tr("échecs")}</span> ${tr("(relancez l'import pour les reprendre)")}` : ""}`);
    toast("Fichiers importés"); render(true);
  } catch (e) { impLog(`<div class="err">${tr("Le ZIP n'a pas pu être lu.")}</div>`); }
  finally { importing = false; }
}
ACTIONS["purge-demo-fleet"] = () => {
  const n = S.vehicles.filter(v => v.demo).length;
  confirmBox(`Supprimer définitivement les ${n} véhicules d'exemple, avec leurs pannes et entretiens d'exemple ? Vos propres véhicules et les autres données d'exemple (clients, outils…) sont conservés.`, async () => {
    const all = FLEET_COLS.flatMap(c => (S[c] || []).filter(x => x.demo).map(x => [c, x.id]));
    try { let done = 0; for (const c of FLEET_COLS) { const ids = all.filter(a => a[0] === c).map(a => a[1]), base = done; await removeMany(c, ids, k => toast(`Suppression… ${base + k}/${all.length}`)); done += ids.length; }
      toast(`${plural(n, "véhicule")} d'exemple supprimé${n > 1 ? "s" : ""}`); }
    catch (e) { toast(`Suppression interrompue${e && e.message ? " : " + e.message : ""}. Relancez-la pour terminer.`); }
    if (API) await API.refresh(); staticDone = null; render(true);
  }, "Supprimer les véhicules d'exemple");
};
ACTIONS["purge-demo"] = () => confirmBox("Supprimer définitivement toutes les données d'exemple ? Vos propres saisies sont conservées.", async () => {
  const plan = COLS.map(c => [c, S[c].filter(x => x.demo).map(x => x.id)]).filter(([, ids]) => ids.length);
  const total = plan.reduce((a, [, ids]) => a + ids.length, 0);
  if (!total) { toast("Aucune donnée d'exemple à supprimer."); return; }
  let done = 0;
  try {
    for (const [c, ids] of plan) { const base = done; await removeMany(c, ids, k => { done = base + k; toast(`Suppression… ${done} / ${total}`); }); done = base + ids.length; }
    toast(`${plural(total, "élément")} d'exemple supprimé${total > 1 ? "s" : ""}`);
  } catch (e) { toast(`Suppression interrompue après ${done} / ${total}${e && e.message ? " : " + e.message : ""}. Relancez-la pour terminer.`); }
  if (API) await API.refresh();
  staticDone = null; render(true);
}, "Tout supprimer");

/* ======================= E-MAILS DANS LA LANGUE DU CLIENT ======================= */
const clientLang = id => client(id)?.lang === "en" ? "en" : "fr";
const MAIL = {
  rappel: {
    fr: (c, ts, s) => [`Étalonnage de vos outils arrivant à échéance`, `Bonjour${c.contact ? " " + c.contact : ""},\n\nLes outils suivants arrivent à échéance d'étalonnage :\n${ts.map(t => `- ${t.name}${t.brand ? " (" + t.brand + ")" : ""}, n° de série ${t.serial} : échéance le ${fmtDate(t.nextDue)}`).join("\n")}\n\nNous pouvons venir les collecter à votre convenance. Merci de nous indiquer vos disponibilités.\n\nBien cordialement,\n${s.name}${s.phone ? "\n" + s.phone : ""}`],
    en: (c, ts, s) => [`Calibration of your tools falling due`, `Dear ${c.contact || "Sir or Madam"},\n\nThe following tools are due for calibration:\n${ts.map(t => `- ${t.name}${t.brand ? " (" + t.brand + ")" : ""}, serial number ${t.serial}: due on ${fmtDate(t.nextDue)}`).join("\n")}\n\nWe would be happy to collect them at a time that suits you. Please let us know your availability.\n\nKind regards,\n${s.name}${s.phone ? "\n" + s.phone : ""}`]
  }
};
/* prépare un e-mail : destinataire, objet, texte modifiable, copie et ouverture dans la messagerie */
function mailBox(clientId, build) {
  const c = client(clientId) || {};
  let lang = clientLang(clientId);
  const make = () => withLang(lang, () => build(c, settings()));
  const draw = async () => {
    const [subject, body] = await make();
    const m = modal(`${mHead("E-mail à " + esc(c.name || ""))}<div class="body">
      <div class="row-sb wrap"><div class="muted small">Langue du client : <b data-noi18n>${lang === "en" ? "English" : "Français"}</b>${c.lang ? "" : " (par défaut)"}</div>
        <div class="seg" data-noi18n><button data-ml="fr" class="${lang === "fr" ? "on" : ""}">FR</button><button data-ml="en" class="${lang === "en" ? "on" : ""}">EN</button></div></div>
      <label class="f">Destinataire<input id="ml-to" value="${esc(c.email || "")}" placeholder="adresse@client.com"></label>
      <label class="f">Objet<input id="ml-subj" value="${esc(subject)}"></label>
      <label class="f">Message<textarea id="ml-body" rows="12">${esc(body)}</textarea></label>
      <div class="hint">Si le bouton « Ouvrir dans la messagerie » ne fonctionne pas sur cet appareil, utilisez « Copier ».</div></div>
      <footer><div class="left"><a class="btn" id="ml-open" target="_blank" rel="noopener">Ouvrir dans la messagerie</a></div><button class="btn" id="ml-copy">Copier l'objet et le message</button><button class="btn primary" data-close>Fermer</button></footer>`, "lg");
    const link = () => { m.querySelector("#ml-open").href = `mailto:${encodeURIComponent(val("ml-to"))}?subject=${encodeURIComponent(val("ml-subj"))}&body=${encodeURIComponent(m.querySelector("#ml-body").value)}`; };
    link(); m.addEventListener("input", link);
    m.querySelectorAll("[data-ml]").forEach(b => b.onclick = () => { lang = b.dataset.ml; draw(); });
    m.querySelector("#ml-copy").onclick = async () => {
      const txt = (lang === "en" ? "Subject: " : "Objet : ") + val("ml-subj") + "\n\n" + m.querySelector("#ml-body").value;
      try { await navigator.clipboard.writeText(txt); toast("Copié : collez-le dans votre messagerie"); } catch { m.querySelector("#ml-body").select(); toast("Sélectionnez le texte et copiez-le."); }
    };
  };
  draw();
}
document.addEventListener("click", e => { if (e.target.closest && e.target.closest("#ml-open") && UI.mailDoc && typeof logClient === "function") logClient("docs", UI.mailDoc, "mail", (document.getElementById("ml-to") || {}).value); });
