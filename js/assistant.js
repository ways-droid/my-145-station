/* ======================= Assistant IA (Claude) ======================= */
/* Sindri : panneau latéral pour le bureau et les administrateurs. Il consulte et écrit avec les droits du bureau via le serveur
   (api/assistant.php) et prépare des textes. La conversation reste dans cet onglet (mémoire + sessionStorage). */
let AI = null, aiBusy = false, aiOpen = false, aiFiles = [];   /* aiFiles : fichiers joints en attente d'envoi */
/* fil de conversation de l'utilisateur, gardé sur le serveur (privé, retrouvé sur tous ses appareils) : { view, topics, pending } */
let TH = null, aiTopicsOpen = false, aiNewTopic = false;
async function aiLoadThread() { try { TH = await API.call("GET", "assistant/thread"); } catch { TH = TH || { view: [], topics: [] }; } return TH; }
const aiMark = (i, a, state, note) => API.call("POST", "assistant/mark", { i, a, state, note: note || "" }).catch(() => {});
const aiAllowed = () => SERVER && API && ME && isOffice();
async function aiRefresh() { try { AI = await API.call("GET", "assistant/status"); } catch { AI = null; } return AI; }
const AI_SUGGEST = ["Quels véhicules ont une échéance ce mois-ci ?", "Quels outils arrivent à échéance d'étalonnage ?", "Quelles pannes de véhicules sont encore ouvertes ?",
  "Liste les tarifs du client MT", "Résume mes notes de la semaine"];
const AI_DOC_LBL = { assurance: "Assurance", ct: "Contrôle technique", immat: "Certificat d'immatriculation", coc: "Certificat de conformité", badge: "Badge aéroport", leasing: "Contrat de leasing / location", autre: "Autre document" };
const AI_OPEN = { staff: "staff-open", vehicles: "veh-open", tools: "tool-open", clients: "client-form", products: "prod-form", faults: "fault-open", notes: "note-form" };
/* beaucoup d'actions (ex. 40 fiches modifiées) : un résumé repliable et « Tout annuler » plutôt que 40 cartes */
function aiActions(list, mi) {
  list = list || []; if (list.length <= 4) return list.map((a, ai) => aiActionCard(a, mi, ai)).join("");
  const live = list.map((a, ai) => [a, ai]).filter(([a]) => a.op !== "delete" && a.state !== "undone");
  const dels = list.map((a, ai) => [a, ai]).filter(([a]) => a.op === "delete");
  return `<div class="ai-act done-ok"><div class="ai-act-t">✓ ${list.length - dels.length} ${esc(tr("modifications"))}${list.length - dels.length - live.length ? ` · ${list.length - dels.length - live.length} ${esc(tr("annulées"))}` : ""}</div>
    <details><summary class="small">${esc(tr("Voir le détail"))}</summary><div class="stack-s" style="margin-top:6px">${list.map((a, ai) => a.op === "delete" ? "" : aiActionCard(a, mi, ai)).join("")}</div></details>
    ${live.length ? `<div class="row-g"><button class="btn sm" data-ai-undoall="${mi}">${esc(tr("Tout annuler"))}</button></div>` : ""}</div>${dels.map(([a, ai]) => aiActionCard(a, mi, ai)).join("")}`;
}
/* ce que Sindri a fait (créé / modifié : déjà enregistré, avec « Annuler ») ou propose (suppression : à confirmer) */
function aiActionCard(a, mi, ai) {
  const open = AI_OPEN[a.coll] && a.state !== "undone" && a.op !== "delete" && a.op !== "deleted" ? `<button class="btn sm" data-a="${AI_OPEN[a.coll]}" data-id="${esc(a.id)}">${esc(tr("Ouvrir"))}</button>` : "";
  if (a.op === "delete") {
    const st = a.state === "done" ? `<span class="chip">${esc(tr("Supprimé"))}</span>` : a.state === "skip" ? `<span class="chip">${esc(tr("Gardé"))}</span>` : "";
    return `<div class="ai-act ${a.state || ""}"><div class="ai-act-t">🗑 ${esc(tr("Supprimer"))} : ${esc(a.label)}</div>${a.summary ? `<div class="small">${esc(a.summary)}</div>` : ""}
      <div class="row-g">${st || `<button class="btn sm danger-bg" style="color:#fff" data-ai-do="${mi}:${ai}">${esc(tr("Confirmer la suppression"))}</button><button class="btn sm" data-ai-skip="${mi}:${ai}">${esc(tr("Garder"))}</button>`}</div></div>`;
  }
  if (a.op === "whatsapp") return `<div class="ai-act done-ok"><div class="ai-act-t">💬 ${esc(tr(a.label))}</div></div>`;
  const verb = a.op === "create" ? "Créé" : a.op === "deleted" ? "Supprimé" : "Modifié";
  return `<div class="ai-act done-ok ${a.state || ""}"><div class="ai-act-t">${a.state === "undone" ? "↶ " + esc(tr("Annulé")) : "✓ " + esc(tr(verb))} : ${esc(a.label)}</div>
    ${a.fields && a.fields.length && a.state !== "undone" ? `<div class="small muted">${esc(tr("Champs"))} : ${esc(a.fields.join(", "))}</div>` : ""}
    <div class="row-g">${open}${a.state === "undone" ? "" : `<button class="btn sm" data-ai-undo="${mi}:${ai}">${esc(tr("Annuler"))}</button>`}</div></div>`;
}
async function aiUndo(a) {
  if (a.op === "create") await remove(a.coll, a.id);
  else if (a.op === "update" || a.op === "deleted") await save(a.coll, a.id, a.before || {});   // suppression annulée = fiche remise
}
function aiMd(t) {
  const link = s => s.replace(/\[([^\]]+)\]\(erp:([A-Za-z]+)\/([^)\s]+)\)/g, (_, l, c, id) => {
    const a = AI_OPEN[c];
    return a ? `<button class="linkbtn mono" data-a="${a}" data-id="${esc(id)}">${l}</button>` : `<b>${l}</b>`;
  });
  const inline = s => link(esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>"));
  const lines = String(t || "").split("\n"); let out = "", list = false, tbl = [];
  const flushT = () => { if (!tbl.length) return; const rows = tbl.filter(r => !/^\s*\|?\s*:?-{2,}/.test(r)).map(r => r.replace(/^\s*\||\|\s*$/g, "").split("|").map(c => inline(c.trim())));
    out += `<div class="tablewrap"><table class="ai-t"><thead><tr>${rows[0].map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`; tbl = []; };
  for (const l of lines) {
    if (/^\s*\|.*\|\s*$/.test(l)) { if (list) { out += "</ul>"; list = false; } tbl.push(l); continue; }
    flushT();
    const m = l.match(/^\s*[-•*]\s+(.*)$/) || l.match(/^\s*\d+[.)]\s+(.*)$/);
    if (m) { if (!list) { out += "<ul>"; list = true; } out += `<li>${inline(m[1])}</li>`; continue; }
    if (list) { out += "</ul>"; list = false; }
    const h = l.match(/^#{1,4}\s+(.*)$/);
    out += h ? `<p><b>${inline(h[1])}</b></p>` : l.trim() ? `<p>${inline(l)}</p>` : "";
  }
  flushT(); if (list) out += "</ul>";
  return out;
}

function aiMount() {
  if (document.getElementById("ai-fab") || !aiAllowed()) return;
  const fab = document.createElement("button");
  fab.id = "ai-fab"; fab.className = "ai-fab"; fab.type = "button"; fab.title = "Sindri"; fab.setAttribute("aria-label", tr("Ouvrir Sindri, l'assistant"));
  fab.innerHTML = `<span aria-hidden="true">✦</span><span class="ai-fab-l">Sindri</span>`;
  fab.onclick = () => aiToggle(true);
  const panel = document.createElement("aside");
  panel.id = "ai-panel"; panel.className = "ai-panel"; panel.setAttribute("aria-label", "Sindri"); panel.hidden = true;
  document.body.append(fab, panel);
  /* glisser-déposer un fichier sur le panneau (ou sur le bouton Assistant, qui ouvre le panneau) */
  const over = e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); panel.classList.add("drop"); } };
  panel.addEventListener("dragover", over); panel.addEventListener("dragenter", over);
  panel.addEventListener("dragleave", e => { if (!panel.contains(e.relatedTarget)) panel.classList.remove("drop"); });
  panel.addEventListener("drop", e => { e.preventDefault(); panel.classList.remove("drop"); if (AI && AI.configured && e.dataTransfer.files.length) aiAddFiles([...e.dataTransfer.files]); });
  fab.addEventListener("dragover", e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); aiToggle(true); } });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && aiOpen && !document.querySelector(".modal")) aiToggle(false); });
}
/* nouveaux fichiers dans les dossiers Dropbox suivis : « Analyser ? Oui / Non » */
let AI_DBX = null;
async function aiDbxNotify() {
  const n = (typeof DBX !== "undefined" && DBX && DBX.newCount) || 0, fab = document.getElementById("ai-fab");
  if (fab) { fab.classList.toggle("ai-ping", n > 0); let bd = fab.querySelector(".ai-badge"); if (n && !bd) { bd = document.createElement("span"); bd.className = "ai-badge"; fab.append(bd); } if (bd) { if (n) bd.textContent = n; else bd.remove(); } }
  if (!n) { if (AI_DBX) { AI_DBX = null; aiRender(); } return; }
  if (!aiOpen || (AI_DBX && AI_DBX.total === n)) return;
  try { AI_DBX = await API.call("GET", "dropbox/new"); } catch { AI_DBX = null; }
  aiRender();
}
function aiDbxCard() {
  const ev = (AI_DBX && AI_DBX.events) || []; if (!ev.length || aiBusy) return "";
  const folders = [...new Set(ev.map(e => e.folder.split("/").pop()))];
  return `<div class="ai-dbx"><div><b>📂 ${plural(AI_DBX.total, "nouveau fichier Dropbox", "nouveaux fichiers Dropbox")}</b> <span class="muted small">· ${esc(folders.join(", "))}</span></div>
    <div class="small">${ev.slice(-5).map(e => `<div class="dx-n">${esc(e.name)}</div>`).join("")}${ev.length > 5 ? `<div class="muted">+ ${ev.length - 5} autre${ev.length - 5 > 1 ? "s" : ""}</div>` : ""}</div>
    <div class="row-g"><span class="small">${esc(tr("Analyser ?"))}</span><button class="btn sm primary" data-ai-dbx="1">${esc(tr("Oui"))}</button><button class="btn sm" data-ai-dbx="0">${esc(tr("Non"))}</button></div></div>`;
}
async function aiDbxAnswer(yes) {
  const ev = (AI_DBX && AI_DBX.events) || []; if (!ev.length) return;
  const upTo = Math.max(...ev.map(e => e.seq)); AI_DBX = null;
  if (typeof DBX !== "undefined" && DBX) DBX.newCount = 0;
  aiDbxNotify();
  API.call("POST", "dropbox/new-ack", { upTo, analyze: yes }).catch(() => {});
  if (yes) aiAsk(`Nouveaux fichiers dans Dropbox, à analyser :\n${ev.map(e => "- " + e.path).join("\n")}\nLis-les, dis-moi ce que c'est et propose quoi en faire.`);
  else aiRender();
}
async function aiToggle(open) {
  aiOpen = open;
  const p = document.getElementById("ai-panel"), fab = document.getElementById("ai-fab"); if (!p) return;
  p.hidden = !open; fab.hidden = open; document.body.classList.toggle("ai-on", open);
  if (open) { if (!AI) await aiRefresh(); aiRender(); if (AI && AI.configured) { await aiLoadThread(); if (TH && TH.pending && !aiBusy) aiAsk_resume(); AI_DBX = null; aiDbxNotify(); } aiRender(); setTimeout(() => { const q = document.getElementById("ai-q"); q && q.focus(); }, 50); }
}
function aiRender() {
  const p = document.getElementById("ai-panel"); if (!p || !aiOpen) return;
  const ready = AI && AI.configured, view = (TH && TH.view) || [], topics = (TH && TH.topics) || [];
  const tAt = ms => fmtLT(ms, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const topicAt = {}; topics.forEach(t => topicAt[t.i] = t);
  const msg = (m, mi) => (topicAt[mi] ? `<div class="ai-topic" id="ai-t-${mi}"><span>${esc(topicAt[mi].title)}</span><span class="muted">${esc(tAt(topicAt[mi].at))}</span></div>` : "") +
    (m.role === "user" ? `<div class="ai-m me" id="ai-m-${mi}">${m.via === "whatsapp" ? `<div class="ai-via">WhatsApp</div>` : ""}${(m.files || []).map(f => `<div class="ai-file">📎 ${esc(f.name)}</div>`).join("")}${esc(m.text)}</div>`
      : `<div class="ai-m bot ${m.err ? "err" : ""}" id="ai-m-${mi}">${m.via === "whatsapp" ? `<div class="ai-via">WhatsApp</div>` : ""}${m.err ? esc(m.text) : aiMd(m.text)}${aiActions(m.actions, mi)}</div>`);
  const body = !AI || !TH ? `<div class="muted pad">Chargement…</div>`
    : !ready ? `<div class="pad stack-s"><div>Sindri n'est pas encore configuré.</div>${isAdmin() ? `<div><a class="btn sm primary" href="#parametres" data-ai-close>Configurer dans Paramètres</a></div>` : `<div class="muted">Un administrateur doit saisir la clé API dans Paramètres.</div>`}</div>`
    : view.length ? view.map(msg).join("") + (aiNewTopic ? `<div class="ai-topic new"><span>${esc(tr("Nouveau sujet"))}</span><span class="muted">${esc(tr("posez votre question"))}</span></div>` : "")
        + (aiBusy ? `<div class="ai-m bot muted"><span class="ai-dots"><i></i><i></i><i></i></span> ${esc(tr("Sindri consulte l'outil…"))}</div>` : "")
    : `<div class="ai-hello"><p><b>Bonjour, je suis Sindri</b>, votre collègue dans l'outil de la station. Demandez-moi une liste, un résumé, un e-mail, ou de créer et mettre à jour des fiches (véhicules, outillage, clients, tarifs, notes…).</p><p>Vous pouvez aussi <b>déposer un fichier</b> (contrôle technique, carte verte…) : je le range au bon endroit.</p><p class="muted small">Nos échanges restent entre vous et moi, et vous les retrouvez sur tous vos appareils. J'ai les droits d'un employé du bureau ; tout ce que je fais est noté dans l'historique et peut être annulé ; je ne supprime rien sans votre confirmation et je n'envoie rien hors de l'outil.</p>
      <div class="ai-sugg">${AI_SUGGEST.map(s => `<button type="button" class="chip-btn" data-ai-s="${esc(s)}">${esc(tr(s))}</button>`).join("")}</div></div>`;
  p.innerHTML = `<header class="ai-h"><b>✦ Sindri</b><span class="muted small nowrap">${ready ? esc(((AI.models || {})[AI.model] || "").replace(/\s*\(.*\)$/, "")) : ""}</span>
      <span style="margin-left:auto" class="row-g">${topics.length ? `<button class="linkbtn small nowrap" id="ai-topics" aria-expanded="${aiTopicsOpen}">${esc(tr("Sujets"))} (${topics.length}) ${aiTopicsOpen ? "▴" : "▾"}</button>` : ""}${view.length ? `<button class="linkbtn small nowrap" id="ai-new">${esc(tr("Nouveau sujet"))}</button>` : ""}<button class="iconbtn" id="ai-x" aria-label="${esc(tr("Fermer"))}">×</button></span></header>
    ${aiTopicsOpen ? `<div class="ai-tlist" role="list">${topics.slice().reverse().map(t => `<button class="ai-tl" role="listitem" data-ai-go="${t.i}"><span>${esc(t.title || tr("(sans titre)"))}</span><span class="muted small nowrap">${esc(tAt(t.at))}</span></button>`).join("")}</div>` : ""}
    <div class="ai-body" id="ai-body">${body}</div>
    ${ready ? `${aiFiles.length ? `<div class="ai-pend">${aiFiles.map((f, k) => `<span class="ai-file">📎 ${esc(f.name)}${f.up ? " …" : ""}<button type="button" class="linkbtn" data-ai-rm="${k}" aria-label="${esc(tr("Retirer"))}">×</button></span>`).join("")}</div>` : ""}
      ${aiDbxCard()}<form class="ai-f" id="ai-f"><button type="button" class="iconbtn ai-clip" id="ai-clip" title="${esc(tr("Joindre un fichier (PDF ou photo)"))}" aria-label="${esc(tr("Joindre un fichier"))}" ${aiBusy ? "disabled" : ""}>📎</button><input type="file" id="ai-file" accept="application/pdf,image/*" multiple hidden>
      <textarea id="ai-q" rows="2" placeholder="${esc(tr(aiFiles.length ? "Consigne facultative… (Entrée pour envoyer)" : "Votre question… ou déposez un fichier ici"))}" ${aiBusy ? "disabled" : ""}></textarea><button class="btn primary" ${aiBusy ? "disabled" : ""}>${esc(tr("Envoyer"))}</button></form>
      <div class="ai-foot muted small">${esc(tr("Conversation privée · retrouvée sur tous vos appareils · actions notées dans l'historique"))}</div>` : ""}`;
  const b = p.querySelector("#ai-body"); b.scrollTop = b.scrollHeight;
  p.querySelector("#ai-x").onclick = () => aiToggle(false);
  const tp = p.querySelector("#ai-topics"); if (tp) tp.onclick = () => { aiTopicsOpen = !aiTopicsOpen; aiRender(); };
  p.querySelectorAll("[data-ai-go]").forEach(x => x.onclick = () => { const i = x.dataset.aiGo; aiTopicsOpen = false; aiRender();
    const el = document.getElementById("ai-t-" + i) || document.getElementById("ai-m-" + i); if (el) { el.scrollIntoView({ block: "start" }); const m = document.getElementById("ai-m-" + i); m && m.classList.add("flash"); setTimeout(() => m && m.classList.remove("flash"), 2000); } });
  const nw = p.querySelector("#ai-new"); if (nw) nw.onclick = async () => { nw.disabled = true; try { await API.call("POST", "assistant/topic", {}); aiNewTopic = true; } catch (e) { toast(tr(e.message)); } aiRender(); const q = document.getElementById("ai-q"); q && q.focus(); };
  p.querySelectorAll("[data-ai-s]").forEach(x => x.onclick = () => aiAsk(x.dataset.aiS));
  p.querySelectorAll("[data-ai-dbx]").forEach(x => x.onclick = () => aiDbxAnswer(x.dataset.aiDbx === "1"));
  p.querySelectorAll("[data-ai-rm]").forEach(x => x.onclick = () => { aiFiles.splice(+x.dataset.aiRm, 1); aiRender(); });
  p.querySelectorAll("[data-ai-do]").forEach(x => x.onclick = async () => { const [mi, ai] = x.dataset.aiDo.split(":").map(Number), a = TH.view[mi].actions[ai]; x.disabled = true;
    try { await remove(a.coll, a.id); a.state = "done"; toast(tr("Supprimé : ") + a.label); } catch (e) { toast(tr(e.message || "Erreur")); x.disabled = false; return; }
    aiMark(mi, ai, "done", `(J'ai confirmé la suppression de ${a.label}.)`); aiRender(); });
  p.querySelectorAll("[data-ai-undo]").forEach(x => x.onclick = async () => { const [mi, ai] = x.dataset.aiUndo.split(":").map(Number), a = TH.view[mi].actions[ai]; x.disabled = true;
    try { await aiUndo(a); a.state = "undone"; toast(tr("Annulé : ") + a.label); } catch (e) { toast(tr(e.message || "Erreur")); x.disabled = false; return; }
    aiMark(mi, ai, "undone", `(J'ai annulé ce que tu avais fait sur ${a.label}.)`); aiRender(); });
  p.querySelectorAll("[data-ai-undoall]").forEach(x => x.onclick = () => confirmBox(tr("Annuler toutes les modifications faites par Sindri dans cette réponse ?"), async () => {
    const mi = +x.dataset.aiUndoall, acts = TH.view[mi].actions; let n = 0;
    for (let ai = acts.length - 1; ai >= 0; ai--) { const a = acts[ai]; if (a.op === "delete" || a.state === "undone") continue;
      try { await aiUndo(a); a.state = "undone"; n++; await aiMark(mi, ai, "undone", ""); } catch (e) { toast(tr(e.message || "Erreur")); break; } }
    API.call("POST", "assistant/mark", { i: mi, a: -1, state: "note", note: `(J'ai annulé ${n} de tes modifications.)` }).catch(() => {});
    toast(`${n} ${tr("modifications annulées")}`); aiRender(); }, tr("Tout annuler")));
  p.querySelectorAll("[data-ai-skip]").forEach(x => x.onclick = () => { const [mi, ai] = x.dataset.aiSkip.split(":").map(Number); TH.view[mi].actions[ai].state = "skip"; aiMark(mi, ai, "skip", `(J'ai gardé ${TH.view[mi].actions[ai].label} : pas de suppression.)`); aiRender(); });
  p.querySelectorAll("[data-ai-close]").forEach(x => x.addEventListener("click", () => aiToggle(false)));
  const f = p.querySelector("#ai-f");
  if (f) {
    const q = f.querySelector("#ai-q");
    q.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); f.requestSubmit(); } };
    f.onsubmit = e => { e.preventDefault(); const v = q.value.trim(); if (v || aiFiles.some(x => x.id)) aiAsk(v); };
    const fi = f.querySelector("#ai-file"); f.querySelector("#ai-clip").onclick = () => fi.click(); fi.onchange = () => { aiAddFiles([...fi.files]); fi.value = ""; };
  }
}
async function aiAsk_resume() {   /* une réponse longue interrompue (autre appareil, onglet fermé) : on la termine */
  aiBusy = true; aiRender();
  try { let r = { more: true }; for (let i = 0; r.more && i < 5; i++) r = await API.call("POST", "assistant/say", { resume: true }); if (r.view) TH = r; else await aiLoadThread(); } catch { await aiLoadThread(); }
  aiBusy = false; aiRender();
}
async function aiAsk(text) {
  if (aiBusy) return;
  if (aiFiles.some(f => f.up)) { toast(tr("Patientez : le fichier est en cours d'envoi.")); return; }
  const files = aiFiles.filter(f => f.id).map(f => ({ id: f.id, name: f.name, mime: f.mime })); aiFiles = [];
  aiBusy = true; aiNewTopic = false;
  TH = TH || { view: [], topics: [] };
  TH.view.push({ role: "user", text, files, at: Date.now() }); aiRender();
  try {
    let r = await API.call("POST", "assistant/say", { text, files });
    for (let i = 0; r.more && i < 5; i++) r = await API.call("POST", "assistant/say", { resume: true });
    if (r.view) TH = r; else await aiLoadThread();
  } catch (e) {
    await aiLoadThread();
    if (!TH.view.length || !TH.view[TH.view.length - 1].err) TH.view.push({ role: "bot", err: true, text: tr(e.message || "Erreur") });
  }
  aiBusy = false; await aiRefresh(); aiRender();
}
/* fichiers : envoyés au serveur dès qu'ils sont choisis ou déposés, joints à la prochaine question */
async function aiAddFiles(list) {
  for (const f of list.slice(0, 5)) {
    if (!/^application\/pdf$|^image\//.test(f.type || "")) { toast(tr("Format non accepté : PDF ou photo.")); continue; }
    if (f.size > 15 * 1048576) { toast(tr("Fichier trop lourd pour Sindri (15 Mo maximum).")); continue; }
    const e = { name: f.name, mime: f.type, up: true }; aiFiles.push(e); aiRender();
    try { const r = await assets.upload(f); e.id = r.id; e.mime = r.contentType || f.type; } catch { toast(tr("Le fichier n'a pas pu être envoyé.")); aiFiles = aiFiles.filter(x => x !== e); }
    e.up = false; aiRender();
  }
  const q = document.getElementById("ai-q"); q && q.focus();
}
function aiStart() { if (!aiAllowed()) return; aiMount(); aiRefresh(); }

/* ---------- Paramètres (administrateurs) ---------- */
function aiCardShell() {
  if (!SERVER || !isAdmin()) return "";
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><h3 class="np">Sindri, l'assistant IA (Claude)</h3><div id="ai-box"><div class="muted">Chargement…</div></div></div></div>`;
}
async function loadAi() {
  const box = document.getElementById("ai-box"); if (!box) return;
  const s = await aiRefresh();
  if (!s) { box.innerHTML = `<div class="err">${esc(tr("Le serveur ne répond pas."))}</div>`; return; }
  if (!s.configured) {
    box.innerHTML = `<div class="stack-s"><div><b>Sindri</b>, un collègue IA pour le <b>bureau et les administrateurs</b> : il répond aux questions sur les données de l'outil, prépare e-mails et résumés, et crée ou met à jour des fiches avec les droits d'un employé du bureau (suppressions sur confirmation, rien d'envoyé hors de l'outil).</div>
      <ol class="small stack-s" style="margin:0;padding-left:18px"><li>Créez un compte sur <b>console.anthropic.com</b> (Anthropic, l'éditeur de Claude) et ajoutez un moyen de paiement : facturation à l'usage.</li>
      <li>Menu <b>API keys</b> → <b>Create key</b>, nom « my-145-station ». Copiez la clé (elle commence par <span class="mono">sk-ant-</span>).</li>
      <li>Collez-la ici et fixez un plafond mensuel. La clé reste sur le serveur.</li></ol>
      <div><button class="btn primary" data-a="ai-form">Connecter l'assistant</button></div></div>`;
    return;
  }
  const pct = Math.min(100, Math.round((s.usage.usd / s.cap) * 100));
  box.innerHTML = `<div class="stack-s"><dl class="kv"><dt>Clé API</dt><dd class="mono">${esc(s.keyHint || "")}</dd><dt>Modèle</dt><dd>${esc((s.models || {})[s.model] || s.model)}</dd>
      <dt>Ce mois-ci</dt><dd>${plural(s.usage.questions, "question")} · environ <b>${s.usage.usd.toFixed(2).replace(".", ",")} $</b> sur un plafond de ${s.cap} $ <span class="muted small">(${pct} %)</span></dd></dl>
    <div class="hint">Estimation d'après les tarifs publics d'Anthropic ; la facture réelle est visible sur console.anthropic.com. Une fois le plafond atteint, l'assistant s'arrête jusqu'au mois suivant.</div>
    <div class="row-g wrap"><button class="btn" data-a="ai-test">Tester la connexion</button><button class="btn" data-a="ai-form">Modifier</button><button class="btn danger" data-a="ai-off">Déconnecter</button></div>
    <h4 class="np" style="margin-top:10px">Ce que Sindri a appris</h4>
    <div class="hint">Règles de travail retenues au fil des conversations (« retiens que… »), partagées avec toute l'équipe. Les conversations elles-mêmes restent privées.</div>
    <div id="ai-mem" class="stack-s"><div class="muted small">Chargement…</div></div></div>`;
  aiMemLoad();
}
async function aiMemLoad() {
  const el = document.getElementById("ai-mem"); if (!el) return;
  let notes = []; try { notes = (await API.call("GET", "assistant/memory")).notes || []; } catch { el.innerHTML = `<div class="err small">${esc(tr("Lecture impossible."))}</div>`; return; }
  el.innerHTML = notes.length ? `<ul class="ai-mem">${notes.slice().reverse().map(n => `<li><span>${esc(n.text)}<span class="muted small"> · ${esc(n.by || "")} · ${esc(fmtDate(n.at))}</span></span><button class="linkbtn small" style="color:var(--bad)" data-ai-forget="${esc(n.id)}">${esc(tr("Oublier"))}</button></li>`).join("")}</ul>`
    : `<div class="muted small">${esc(tr("Rien pour l'instant. Dites par exemple à Sindri : « Retiens que les outils partent en étalonnage chez notre laboratoire habituel ».")) }</div>`;
  el.querySelectorAll("[data-ai-forget]").forEach(b => b.onclick = async () => { if (!confirm(tr("Sindri oubliera cette règle pour toute l'équipe. Continuer ?"))) return;
    b.disabled = true; try { await API.call("POST", "assistant/memory", { delete: b.dataset.aiForget }); toast(tr("Règle oubliée")); } catch (e) { toast(tr(e.message)); } aiMemLoad(); });
}
ACTIONS["ai-form"] = () => {
  const has = !!(AI && AI.configured), models = (AI && AI.models) || { "claude-sonnet-5-5": "Claude Sonnet 5.5 (recommandé)" };
  const m = modal(`${mHead("Sindri, l'assistant IA")}<form autocomplete="off"><div class="body stack-s"><div class="fields">
    ${field("ai-key", "Clé API Anthropic", "", { type: "password", required: !has, ph: has ? "inchangée" : "sk-ant-…", wide: true })}
    ${field("ai-model", "Modèle", (AI && AI.model) || "claude-sonnet-5-5", { type: "select", options: Object.entries(models) })}
    ${field("ai-cap", "Plafond mensuel (USD)", (AI && AI.cap) || 30, { type: "number", min: 1, step: 1 })}</div>
    <div class="hint">Sonnet 5.5 : bon équilibre qualité / prix. Haiku 5.5 : beaucoup moins cher, réponses plus simples. Opus 5.5 : le plus capable, deux fois le prix de Sonnet.</div>
    <div class="err" id="ai-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" id="ai-go">Enregistrer et tester</button></footer></form>`);
  m.querySelector("#ai-key").setAttribute("autocomplete", "new-password");
  m.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const err = m.querySelector("#ai-err"), go = m.querySelector("#ai-go"); go.disabled = true; err.textContent = "";
    try { await API.call("POST", "assistant/config", { key: m.querySelector("#ai-key").value.trim(), model: val("ai-model"), cap: +val("ai-cap") });
      closeModal(); await loadAi(); ACTIONS["ai-test"](); aiMount(); }
    catch (x) { err.textContent = tr(x.message); go.disabled = false; }
  };
};
ACTIONS["ai-test"] = async () => { try { await API.call("POST", "assistant/test", {}); toast("Sindri est connecté ✓"); } catch (e) { toast(tr(e.message)); } };
ACTIONS["ai-off"] = async () => { if (!confirm(tr("Déconnecter l'assistant ? La clé API sera effacée du serveur."))) return; await API.call("POST", "assistant/config", { disconnect: true }); await loadAi(); toast("Assistant déconnecté"); };
