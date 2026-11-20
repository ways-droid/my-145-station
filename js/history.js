/* ======================= Historique des actions & pastille Profil ======================= */
/* Le serveur note chaque création, modification, suppression, validation, envoi, rapprochement, connexion…
   (api/log.php). Ici : la page Management → Historique, l'encart « Historique » des fiches, et la pastille Profil. */
const LOG_ACT = {
  create: ["Création", "good"], update: ["Modification", "info"], delete: ["Suppression", "bad"], validate: ["Validation", "warn"],
  paid: ["Payée", "good"], cancel: ["Annulation", "bad"], link: ["Rapprochement", "good"], unlink: ["Lien retiré", ""],
  archive: ["Archivage", ""], unarchive: ["Désarchivage", ""], reply: ["Réponse Peppol", "info"], falco: ["Envoi à Falco", "warn"],
  mail: ["E-mail préparé", "warn"], pdf: ["PDF téléchargé", ""], print: ["Impression", ""], login: ["Connexion", ""]
};
const LOG_MOD = { staff: "Personnel", roster: "Roster", handovers: "Shift", shiftItems: "Shift", chargeLines: "Charge Sheet", partMoves: "Pièces", needs: "Station Needs", expiries: "Expirations", forms: "Formulaires", contacts: "Contacts", instructions: "Consignes", induction: "Formation station", situations: "Situations ouvertes", travel: "Voyages", hotels: "Voyages", aircraft: "Avions", clients: "Clients", products: "Articles et prix",
  vehicles: "Véhicules", vehEvents: "Véhicules", faults: "Véhicules", driverLogs: "Véhicules", tires: "Véhicules", vehDocs: "Véhicules",
  tools: "Outillage", labs: "Outillage", links: "Liens",
  adminDocs: "Administration", adminFolders: "Administration", notes: "Notes", settings: "Paramètres", auth: "Connexions" };
const LOG_FIELD = { status: "Statut", number: "N°", date: "Date", dueDate: "Échéance", clientId: "Client", lines: "Lignes", amount: "Montant", name: "Nom",
  email: "E-mail", phone: "Téléphone", address: "Adresse", vat: "TVA", price: "Prix", notes: "Notes", note: "Note", km: "Kilométrage", matches: "Pièces reliées",
  archived: "Archivé", paymentStatus: "Paiement", response: "Réponse", plate: "Plaque", model: "Modèle", driver: "Pris par", type: "Type", cost: "Coût",
  vehicleId: "Véhicule", ref: "Référence", label: "Libellé", qty: "Quantité", nick: "Nom personnalisé", color: "Couleur", kind: "Type de pièce" };
const logOpen = { staff: "staff-open", vehicles: "veh-open", tools: "tool-open", partMoves: "pm-open", needs: "nd-open", expiries: "ex-form", forms: "form-form", contacts: "ct-form", situations: "sit-open", clients: "client-form", products: "prod-form", faults: "fault-open", aircraft: "ac-form" };
const logVal = (k, v) => {
  if (k === "clientId" && v && v !== "—") { const c = S.clients.find(x => x.id === v); if (c) return c.name; }
  if (k === "vehicleId" && v && v !== "—") { const x = S.vehicles.find(y => y.id === v); if (x) return x.plate || x.id; }
  return v;
};
const logWhen = at => fmtLT(at, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
function logDetail(x) {
  const d = x.details || {}, out = [];
  if (d.changes) out.push(d.changes.filter(c => c[0] !== "…").slice(0, 6).map(([k, a, b]) => `<span class="lg-ch"><b>${esc(tr(LOG_FIELD[k] || k))}</b> ${a !== "—" && k !== "lines" ? `${esc(String(logVal(k, a)))} → ` : ""}${esc(String(logVal(k, b)))}</span>`).join("") + (d.changes.length > 6 ? `<span class="muted"> +${d.changes.length - 6}</span>` : ""));
  if (d.to) out.push(`à ${esc(d.to)}`);
  if (d.note) out.push(`<span class="muted">${esc(d.note)}</span>`);
  return out.join(" ");
}
const logActChip = a => { const x = LOG_ACT[a] || [a, ""]; return `<span class="chip ${x[1]}">${esc(tr(x[0]))}</span>`; };
const logWho = x => x.kind === "system" ? `<span class="muted">⚙ ${esc(x.by)}</span>` : esc(x.by);

/* ---------- encart « Historique » dans une fiche (chargé à l'ouverture) ---------- */
function histBox(coll, id, related) {
  if (!SERVER || !ME || !isOffice() || !id) return "";
  return `<details class="hist" data-hist="${coll}" data-hid="${esc(id)}" ${related ? "data-rel=\"1\"" : ""}><summary>${esc(tr("Historique"))}</summary><div class="hist-b muted small">Chargement…</div></details>`;
}
document.addEventListener("toggle", async e => {
  const el = e.target; if (!el.matches || !el.matches("details[data-hist]") || !el.open || el.dataset.done) return;
  el.dataset.done = "1"; const b = el.querySelector(".hist-b");
  try {
    const r = await API.call("GET", `log?coll=${encodeURIComponent(el.dataset.hist)}&id=${encodeURIComponent(el.dataset.hid)}${el.dataset.rel ? "&related=1" : ""}&limit=100`);
    b.classList.remove("muted", "small");
    b.innerHTML = r.items.length ? `<ol class="hist-l">${r.items.map(x => `<li><span class="hist-t">${logWhen(x.at)}</span><span>${logActChip(x.action)} <b>${logWho(x)}</b>${x.coll !== el.dataset.hist ? ` · ${esc(x.label || "")}` : ""}${logDetail(x) ? `<div class="hist-d">${logDetail(x)}</div>` : ""}</span></li>`).join("")}</ol>`
      : `<span class="muted small">${esc(tr("Aucune action notée depuis la mise en place de l'historique."))}</span>`;
  } catch (x) { b.innerHTML = `<span class="err">${esc(tr(x.message))}</span>`; }
}, true);

/* ---------- page Management → Historique ---------- */
let LOGS = null, logPeople = null;
function logFilt() { UI.lf = UI.lf || { days: "7", by: "", mod: "", act: "", src: "" }; return UI.lf; }
async function logLoad(more) {
  const f = logFilt(), p = new URLSearchParams({ limit: "150" });
  if (f.days) p.set("from", String(Date.now() - (+f.days) * 86400000));
  if (f.by) p.set("by", f.by);
  if (f.act) p.set("action", f.act); else if (f.src) p.set("action", f.src);
  if (UI.q.trim()) p.set("q", UI.q.trim());
  if (more && LOGS && LOGS.items.length) p.set("before", String(LOGS.items[LOGS.items.length - 1].at));
  const r = await API.call("GET", "log?" + p.toString());
  LOGS = more && LOGS ? { items: LOGS.items.concat(r.items), more: r.more } : r;
  if (!logPeople) { try { logPeople = (await API.call("GET", "log/people")).people; } catch { logPeople = []; } }
  if (location.hash === "#historique") render(true);
}
VIEWS.historique = { title: "Historique", render: () => {
  if (!SERVER) return head("Historique", "Qui a fait quoi, et quand") + `<div class="panel empty">L'historique des actions est tenu par le serveur.</div>`;
  const f = logFilt();
  if (!LOGS) { logLoad(); return head("Historique", "Qui a fait quoi, et quand") + `<div class="panel empty muted">Chargement…</div>`; }
  const items = LOGS.items.filter(x => !f.mod || LOG_MOD[x.coll] === f.mod);
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(tr(l))}</option>`;
  const mods = [...new Set(Object.values(LOG_MOD))];
  let lastDay = "";
  const rows = items.map(x => {
    const day = new Date(x.at).toISOString().slice(0, 10), sep = day !== lastDay ? `<tr class="lg-day"><td colspan="5">${esc(fmtDate(day))}</td></tr>` : ""; lastDay = day;
    const lbl = x.label || x.id, a = logOpen[x.coll];
    return `${sep}<tr class="hov"><td class="num nowrap muted">${fmtLT(x.at, { hour: "2-digit", minute: "2-digit" })}</td><td class="nowrap">${logWho(x)}</td><td>${logActChip(x.action)}</td>
      <td>${a && x.action !== "delete" ? `<button class="linkbtn" data-a="${a}" data-id="${esc(x.id)}">${esc(lbl)}</button>` : esc(lbl)}<div class="muted small">${esc(tr(LOG_MOD[x.coll] || x.coll))}</div></td><td class="small">${logDetail(x)}</td></tr>`;
  }).join("");
  return head("Historique", "Qui a fait quoi, et quand · créations, modifications, suppressions, validations, envois, rapprochements, connexions") +
    `<div class="panel">${searchBar("Rechercher un client, une plaque, un outil, une personne…")}
    <div class="toolbar df-bar">
      <label class="df"><span>Période</span><select data-lf="days">${opt("1", "Aujourd'hui", f.days)}${opt("7", "7 derniers jours", f.days)}${opt("30", "30 derniers jours", f.days)}${opt("365", "12 derniers mois", f.days)}${opt("", "Tout", f.days)}</select></label>
      <label class="df"><span>Personne</span><select data-lf="by">${opt("", "Tout le monde", f.by)}${(logPeople || []).map(n => opt(n, n, f.by)).join("")}</select></label>
      <label class="df"><span>Module</span><select data-lf="mod">${opt("", "Tous", f.mod)}${mods.map(m => opt(m, m, f.mod)).join("")}</select></label>
      <label class="df"><span>Action</span><select data-lf="act">${opt("", "Toutes", f.act)}${Object.entries(LOG_ACT).map(([k, v]) => opt(k, v[0], f.act)).join("")}</select></label>
      <label class="df"><span>Origine</span><select data-lf="src">${opt("", "Personnes et systèmes", f.src)}${opt("user", "Personnes seulement", f.src)}${opt("system", "Synchronisations seulement", f.src)}</select></label>
      ${f.by || f.mod || f.act || f.src || f.days !== "7" ? `<button class="linkbtn" data-a="lf-reset">Effacer les filtres</button>` : ""}</div>
    <div class="tablewrap"><table class="lg-t"><thead><tr><th>Heure</th><th>Qui</th><th>Action</th><th>Élément</th><th>Détail</th></tr></thead><tbody>${rows}</tbody></table>
    ${items.length ? "" : `<div class="empty">${esc(tr("Aucune action pour ces filtres."))}</div>`}
    ${LOGS.more ? `<div class="pad"><button class="btn" data-a="lf-more">Afficher plus</button></div>` : ""}</div></div>`;
} };
document.addEventListener("change", e => { const s = e.target.closest && e.target.closest("select[data-lf]"); if (s) { logFilt()[s.dataset.lf] = s.value; if (s.dataset.lf === "act" && s.value) logFilt().src = ""; logLoad(); } });
ACTIONS["lf-reset"] = () => { UI.lf = null; logLoad(); };
ACTIONS["lf-more"] = el => { el.disabled = true; logLoad(true); };
let logQT = null;
document.addEventListener("input", e => { if (e.target.id === "q" && location.hash === "#historique") { clearTimeout(logQT); logQT = setTimeout(() => logLoad(), 400); } });
window.addEventListener("hashchange", () => { if (location.hash === "#historique") { LOGS = null; } });

/* actions faites dans le navigateur, notées dans l'historique */
function logClient(coll, id, action, to) { if (SERVER && API && ME && id) API.call("POST", "log/event", { coll, id, action, to: to || "" }).catch(() => {}); }

/* ---------- pastille Profil (en haut à droite) ---------- */
let SESS = null;
const initials = n => String(n || "?").split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
function profilePill() {
  if (!SERVER || !ME) return "";
  return `<button class="prof" data-a="prof-open" aria-haspopup="dialog" title="${esc(tr("Profil"))}"><span class="prof-av r-${esc(ME.role)}">${esc(initials(ME.name))}</span><span class="prof-n">${esc(ME.name)}</span><span class="prof-r">${esc(tr(ROLE_LBL[ME.role] || ME.role))}</span></button>`;
}
ACTIONS["prof-open"] = async () => {
  if (!SESS && API && !ME.key) { try { SESS = (await API.call("GET", "auth/me")).session; } catch { } }
  const t = ms => fmtLT(ms, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const left = SESS ? Math.max(0, SESS.expires - Date.now()) : 0, h = Math.floor(left / 3600000), mn = Math.floor(left / 60000) % 60;
  modal(`${mHead("Profil")}<div class="body stack">
    <div class="row-g" style="align-items:center"><span class="prof-av big r-${esc(ME.role)}">${esc(initials(ME.name))}</span><div><div style="font-size:18px;font-weight:700">${esc(ME.name)}</div><div class="muted">${esc(tr(ROLE_LBL[ME.role] || ME.role))}${ME.email ? ` · ${esc(ME.email)}` : ""}</div></div></div>
    <dl class="kv">${ME.key ? `<dt>Session</dt><dd>Clé d'accès provisoire (pas de session nominative)</dd>` : SESS ? `<dt>Connecté depuis</dt><dd>${esc(t(SESS.since))}</dd>
      <dt>Session valable jusqu'à</dt><dd>${esc(t(SESS.expires))} <span class="muted small">(encore ${h} h ${String(mn).padStart(2, "0")})</span></dd>` : ""}
      <dt>Droits</dt><dd class="small">${ME.role === "admin" ? "Tout, y compris les utilisateurs et les paramètres" : ME.role === "bureau" ? "Tout sauf la gestion des utilisateurs" : ME.role === "garage" ? "Les véhicules présents dans votre garage, leurs entretiens et pannes" : ME.role === "chauffeur" ? "Véhicules, signalement de pannes, vos trajets et amendes" : "Gaz, flotte, étalonnage et signalement de pannes"}</dd></dl></div>
    <footer>${isOffice() && !ME.key ? `<div class="left"><button class="btn" data-a="prof-hist">Mon historique</button></div>` : ""}<button class="btn" data-close>Fermer</button><button class="btn danger" data-a="server-logout">Se déconnecter</button></footer>`);
};
ACTIONS["prof-hist"] = () => { closeModal(); UI.lf = { days: "30", by: ME.name, mod: "", act: "", src: "" }; LOGS = null; location.hash = "#historique"; };

/* ---- conflits après une synchronisation hors ligne ----
   Pour chaque fiche : ce que l'autre personne avait changé pendant que vous étiez hors ligne (champ par champ).
   Votre version est déjà enregistrée ; « Reprendre l'autre version » remet celle de l'autre personne (tracé dans l'historique). */
const offVal = v => v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v).slice(0, 140) : String(v).slice(0, 140);
const offName = (c, d) => d ? (d.title || d.name || d.reg || d.plate || d.toolNo || d.org || d.text || "") : "";
ACTIONS["off-conf"] = () => {
  const list = offConflicts();
  const m = modal(`${mHead("Conflits à vérifier")}<div class="body stack-s"><div class="hint">${esc(tr("Pendant que vous étiez hors ligne, quelqu'un d'autre a modifié ces fiches. Votre version est enregistrée. Comparez, puis gardez la vôtre ou reprenez l'autre."))}</div>
    ${list.map((c, i) => { const keys = Array.from(new Set([...Object.keys(c.base || {}), ...Object.keys(c.theirs || {})])).filter(k => JSON.stringify((c.base || {})[k]) !== JSON.stringify((c.theirs || {})[k]));
      return `<section class="panel pad stack-s"><div class="row-sb"><b>${esc(tr(LOG_MOD[c.coll] || c.coll))} · ${esc(offName(c.coll, c.theirs || c.base) || c.id)}</b><span class="small muted">${esc(tr("votre modification du"))} ${fmtDT(c.at)}</span></div>
        ${c.theirs == null ? `<div class="small txt-bad">${esc(tr("L'autre personne avait supprimé cette fiche."))}</div>` : keys.length ? `<table class="small"><thead><tr><th>${esc(tr("Champ"))}</th><th>${esc(tr("Avant"))}</th><th>${esc(tr("Changé par l'autre personne"))}</th></tr></thead><tbody>${keys.map(k => `<tr><td class="mono">${esc(k)}</td><td>${esc(offVal((c.base || {})[k]))}</td><td><b>${esc(offVal(c.theirs[k]))}</b></td></tr>`).join("")}</tbody></table>` : `<div class="small muted">${esc(tr("La fiche a été créée par quelqu'un d'autre en même temps."))}</div>`}
        <div class="row-g"><button class="btn sm" data-a="off-keep" data-i="${i}">${esc(tr("Garder ma version"))}</button>${c.theirs != null ? `<button class="btn sm" data-a="off-theirs" data-i="${i}">${esc(tr("Reprendre l'autre version"))}</button>` : ""}</div></section>`; }).join("") || `<div class="muted">${esc(tr("Aucun conflit."))}</div>`}</div>
    <footer><button class="btn" data-close>Fermer</button></footer>`, "lg");
};
const offDrop = i => { const a = offConflicts(); a.splice(i, 1); offConfSave(a); if (a.length) ACTIONS["off-conf"](); else { closeModal(); render(true); } };
ACTIONS["off-keep"] = el => offDrop(+el.dataset.i);
ACTIONS["off-theirs"] = async el => { const c = offConflicts()[+el.dataset.i]; if (!c || !c.theirs) return; await save(c.coll, c.id, c.theirs); toast("Version de l'autre personne reprise"); offDrop(+el.dataset.i); };
