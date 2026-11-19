"use strict";
/* ======================= Dropbox =======================
   Paramètres → Liaison Dropbox (administrateur) ; Administration → dossier « Dropbox » (bureau, administrateurs) ;
   copie automatique des documents des véhicules (file traitée par dropbox/tick). Voir api/dropbox.php. */
let DBX = null, dbxStarted = false, dbxBusy = false;
const DBX_COLORS = [["green", "Vert"], ["orange", "Orange"], ["red", "Rouge"], ["violet", "Violet"], ["teal", "Turquoise"], ["pink", "Rose"], ["grey", "Gris"]];
const dbxOffice = () => !!(SERVER && API && isOffice());
async function dbxRefresh() {
  if (!dbxOffice()) return null;
  try { DBX = await API.call("GET", "dropbox/status"); } catch { DBX = null; }
  if (typeof aiDbxNotify === "function") aiDbxNotify();   // « Nouveaux fichiers Dropbox — Analyser ? » dans Axel
  return DBX;
}
const dbxWatched = p => ((DBX && DBX.watch) || []).some(w => w.path.toLowerCase() === String(p || "").toLowerCase());
ACTIONS["dbx-watch"] = async el => {
  const p = el.dataset.p, on = !dbxWatched(p);
  try { const r = await API.call("POST", "dropbox/watch", { path: p, on }); if (DBX) DBX.watch = r.watch;
    toast(on ? `Axel suit maintenant « ${p.split("/").pop()} » : il signalera les nouveaux fichiers` : `Suivi Assistant arrêté pour « ${p.split("/").pop()} »`); render(true); }
  catch (e) { toast(tr(e.message)); }
};
async function dbxTick(force) {
  if (dbxBusy || !dbxOffice() || SBX || !DBX || !DBX.connected || (!force && !DBX.queue && !(DBX.watch || []).length)) return;
  dbxBusy = true;
  try { const r = await API.call("POST", "dropbox/tick", {}); if (r && (r.done || r.found)) { await dbxRefresh(); if (document.getElementById("dbx-box")) loadDbx(); if (r.found && document.getElementById("dbx-list")) dbxLoadList(); } if (r && r.left && r.done) setTimeout(() => dbxTick(true), 2000); }
  catch {} finally { dbxBusy = false; }
}
function dbxStart() {
  if (!SERVER || dbxStarted) return; dbxStarted = true;
  setTimeout(async () => { await dbxRefresh(); dbxTick(); }, 6000);
  setInterval(async () => { await dbxRefresh(); dbxTick(); }, 60000);
}
/* après l'ajout d'un document dans une fiche véhicule : copie aussitôt */
const dbxSoon = () => setTimeout(async () => { await dbxRefresh(); dbxTick(true); }, 1500);

/* ---------- Paramètres ---------- */
function dbxCardShell() {
  if (!SERVER || !isAdmin()) return "";
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><h3 class="np">Liaison Dropbox</h3><div id="dbx-box"><div class="muted">Chargement…</div></div></div></div>`;
}
async function loadDbx() {
  const box = document.getElementById("dbx-box"); if (!box) return;
  const s = await dbxRefresh();
  if (!s) { box.innerHTML = `<div class="err">${esc(tr("Le serveur ne répond pas."))}</div>`; return; }
  const redir = `<div class="row-g"><code class="mono small" style="user-select:all;word-break:break-all">${esc(s.redirectUri || "")}</code><button class="btn sm" data-a="dbx-copy" data-v="${esc(s.redirectUri || "")}">Copier</button></div>`;
  if (!s.connected) {
    box.innerHTML = `<div class="stack-s"><div>Reliez le compte Dropbox de l'entreprise : documents consultables dans Administration, documents des véhicules copiés automatiquement dans leur dossier, et Axel peut y chercher. Les identifiants restent sur le serveur ways.support.</div>
      <ol class="small stack-s" style="margin:0;padding-left:18px">
        <li>Connecté au compte Dropbox de l'entreprise, ouvrez <b>dropbox.com/developers/apps</b> → <b>Create app</b> → <b>Scoped access</b> → <b>Full Dropbox</b> → nom « WAYS ERP ».</li>
        <li>Onglet <b>Permissions</b> : cochez <span class="mono">account_info.read</span>, <span class="mono">files.metadata.read</span>, <span class="mono">files.content.read</span>, <span class="mono">files.content.write</span>, puis <b>Submit</b>.</li>
        <li>Onglet <b>Settings</b> → <b>Redirect URIs</b> : ajoutez exactement cette adresse :${redir}</li>
        <li>Toujours dans <b>Settings</b>, copiez l'<b>App key</b> et l'<b>App secret</b> (« Show ») et collez-les ici.</li>
        <li>Cliquez sur « Connecter Dropbox » et acceptez dans la fenêtre Dropbox.</li></ol>
      ${s.error ? `<div class="banner warn">${esc(s.error)}</div>` : ""}
      <div class="row-g wrap"><button class="btn ${s.appSet ? "" : "primary"}" data-a="dbx-form">${s.appSet ? "Modifier la clé et le secret" : "Saisir la clé et le secret de l'app"}</button>${s.appSet ? `<button class="btn primary" data-a="dbx-connect">Connecter Dropbox</button>` : ""}</div></div>`;
    return;
  }
  const a = s.account || {};
  dbxAfterConnect(s);
  box.innerHTML = `<div class="stack-s"><dl class="kv"><dt>Compte</dt><dd><b>${esc(a.name || "—")}</b>${a.email ? " · " + esc(a.email) : ""}${a.team ? ` · équipe ${esc(a.team)}` : ""}</dd>
      <dt>Dossiers visibles</dt><dd>${(s.folders || []).length ? `<div class="stack-s">${s.folders.map(f => `<span><span class="folder-ic sm c-${esc(s.color)}">${typeof folderSvg !== "undefined" ? folderSvg : ""}</span> <span class="mono small">${esc(f)}</span></span>`).join("")}</div>` : `<span class="chip warn">Aucun</span> <span class="small">rien n'est visible ni copié tant qu'aucun dossier n'est choisi</span>`}</dd>
      <dt>Dossier des véhicules</dt><dd>${s.vehPath ? `<span class="mono">${esc(s.vehPath)}</span>` : `<span class="muted">non défini</span> <span class="muted small">(seuls les véhicules avec un lien « Dossier Dropbox » sont copiés)</span>`}</dd>
      <dt>Copie des documents</dt><dd>${s.vehSync ? `active${s.queue ? ` · <b>${plural(s.queue, "document")} en attente</b>` : " · à jour"}` : "désactivée"}</dd>
      <dt>Couleur du dossier</dt><dd><span class="folder-ic sm c-${esc(s.color)}">${typeof folderSvg !== "undefined" ? folderSvg : ""}</span> ${esc(tr((DBX_COLORS.find(c => c[0] === s.color) || [, s.color])[1]))}</dd></dl>
    ${s.error ? `<div class="banner warn"><b>Dernière erreur :</b> ${esc(s.error)}</div>` : ""}
    <div class="muted small">Documents des véhicules : chaque fichier ajouté dans une fiche (à la main ou par Axel) est copié dans le dossier Dropbox du véhicule ; un document remplacé ou passé dans « Anciens documents » est déplacé dans le sous-dossier <span class="mono">Expired</span>. Le dossier d'un véhicule = son lien « Dossier Dropbox », sinon <span class="mono">&lt;dossier des véhicules&gt;/&lt;n°&gt; - &lt;plaque&gt; - &lt;modèle&gt;</span> (créé et lié automatiquement).</div>
    <div class="row-g wrap"><button class="btn primary" data-a="dbx-pick" title="${esc(tr("Réservé au détenteur du code maître"))}">🔒 Choisir les dossiers</button><button class="btn" data-a="dbx-opts">Réglages</button><button class="btn" data-a="dbx-resync">Copier les documents manquants</button><button class="btn" data-a="dbx-open-admin">Ouvrir dans Administration</button><button class="btn danger" data-a="dbx-off">Déconnecter</button></div></div>`;
}
/* juste après l'autorisation Dropbox : proposer le choix des dossiers */
function dbxAfterConnect(s) {
  let f = null; try { f = sessionStorage.getItem("ways-dbx-pick"); sessionStorage.removeItem("ways-dbx-pick"); } catch {}
  if (f && s && s.connected && !(s.folders || []).length) setTimeout(() => ACTIONS["dbx-pick"](), 300);
}
ACTIONS["dbx-copy"] = el => { navigator.clipboard?.writeText(el.dataset.v).then(() => toast("Adresse copiée"), () => toast("Sélectionnez l'adresse et copiez-la")); };
ACTIONS["dbx-form"] = () => {
  const m = modal(`${mHead("App Dropbox de l'ERP")}<form autocomplete="off"><div class="body stack-s"><div class="fields">
    ${field("dx-key", "App key", "", { required: !(DBX && DBX.appSet), cls: "mono", ph: DBX && DBX.appSet ? "inchangée" : "" })}${field("dx-sec", "App secret", "", { type: "password", required: !(DBX && DBX.appSet), ph: DBX && DBX.appSet ? "inchangé" : "" })}</div>
    <div class="hint">Console Dropbox → votre app → onglet Settings. Enregistrés sur le serveur uniquement.</div><div class="err" id="dx-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`, "sm");
  m.querySelector("#dx-sec").setAttribute("autocomplete", "new-password");
  m.querySelector("form").onsubmit = async e => { e.preventDefault();
    try { await API.call("POST", "dropbox/config", { appKey: val("dx-key").trim(), appSecret: m.querySelector("#dx-sec").value.trim() }); closeModal(); loadDbx(); }
    catch (x) { m.querySelector("#dx-err").textContent = tr(x.message); } };
};
ACTIONS["dbx-connect"] = async () => {
  try { const r = await API.call("POST", "dropbox/auth-url", {}); try { sessionStorage.setItem("ways-dbx-pick", "1"); } catch {} location.href = r.url; } catch (e) { toast(tr(e.message)); }
};
/* choix des dossiers visibles et synchronisés : code maître, puis arborescence complète du Dropbox */
ACTIONS["dbx-pick"] = () => {
  const m = modal(`${mHead("Dossiers Dropbox visibles et synchronisés")}<form autocomplete="off"><div class="body stack-s">
    <div>Seuls les dossiers choisis (et leurs sous-dossiers) seront visibles dans l'ERP, consultables par Axel et utilisés pour la copie des documents des véhicules. Ce choix est protégé par le <b>code maître</b>.</div>
    ${field("dp-code", "Code maître", "", { type: "password", required: true, autofocus: true })}<div class="err" id="dp-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Continuer</button></footer></form>`, "sm");
  const c = m.querySelector("#dp-code"); c.setAttribute("inputmode", "numeric"); c.setAttribute("autocomplete", "off");
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); const err = m.querySelector("#dp-err");
    try { const r = await API.call("POST", "dropbox/unlock", { master: c.value }); c.value = ""; dbxPicker(r.token); }
    catch (x) { err.textContent = tr(x.message); c.select(); } };
};
function dbxPicker(token) {
  const sel = new Map(((DBX && DBX.folders) || []).map(f => [f.toLowerCase(), f]));
  let path = "";
  const m = modal(`${mHead("Dossiers Dropbox visibles et synchronisés")}<div class="body stack-s">
    <div class="crumb" id="dp-crumb"></div><div class="panel" id="dp-list" style="max-height:46vh;overflow:auto"></div>
    <div><b class="small">Dossiers choisis</b><div id="dp-sel" class="stack-s" style="margin-top:6px"></div></div>
    <div class="muted small">Cochez un dossier pour l'autoriser avec tout son contenu ; cliquez sur son nom pour l'ouvrir. Le dossier des véhicules doit se trouver dans un dossier choisi. Session valable 15 minutes.</div>
    <div class="err" id="dp-err"></div></div>
    <footer><button class="btn" data-close>Annuler</button><button class="btn primary" id="dp-save">Enregistrer</button></footer>`, "lg");
  const under = p => [...sel.values()].find(f => p.toLowerCase().startsWith(f.toLowerCase() + "/"));
  const drawSel = () => { m.querySelector("#dp-sel").innerHTML = sel.size ? [...sel.values()].sort().map(f => `<span class="row-g"><span class="folder-ic sm c-${esc(dbxColor())}">${folderSvg}</span><span class="mono small">${esc(f)}</span><button class="linkbtn small" data-rm="${esc(f)}">Retirer</button></span>`).join("")
      : `<span class="chip warn">Aucun dossier : rien ne sera visible</span>`;
    m.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { sel.delete(b.dataset.rm.toLowerCase()); drawSel(); load(path); }); };
  const load = async p => {
    path = p; const segs = p.split("/").filter(Boolean), list = m.querySelector("#dp-list");
    m.querySelector("#dp-crumb").innerHTML = `<button class="linkbtn" data-go=""><b>Dropbox</b></button>${segs.map((s, i) => `<span aria-hidden="true">›</span><button class="linkbtn" data-go="${esc("/" + segs.slice(0, i + 1).join("/"))}">${esc(s)}</button>`).join("")}`;
    m.querySelectorAll("#dp-crumb [data-go]").forEach(b => b.onclick = () => load(b.dataset.go));
    list.innerHTML = `<div class="pad muted">Chargement…</div>`;
    let r; try { r = await API.call("POST", "dropbox/browse", { token, path: p }); } catch (x) { list.innerHTML = `<div class="pad err">${esc(tr(x.message))}</div>`; return; }
    const es = r.entries || [];
    list.innerHTML = es.length ? es.map(e => { const on = sel.has(e.path.toLowerCase()), inh = under(e.path);
      return `<div class="list-row"><label class="chk"><input type="checkbox" data-p="${esc(e.path)}" ${on || inh ? "checked" : ""} ${inh ? "disabled" : ""}></label>
        <button class="linkbtn grow" style="text-align:left" data-open="${esc(e.path)}"><span class="folder-ic sm c-${esc(dbxColor())}">${folderSvg}</span> ${esc(e.name)}</button>${inh ? `<span class="muted small">inclus</span>` : ""}<span class="muted">›</span></div>`; }).join("")
      : `<div class="pad muted">Aucun sous-dossier.</div>`;
    list.querySelectorAll("[data-open]").forEach(b => b.onclick = () => load(b.dataset.open));
    list.querySelectorAll("input[data-p]").forEach(cb => cb.onchange = () => { const p2 = cb.dataset.p;
      if (cb.checked) { sel.set(p2.toLowerCase(), p2); for (const k of [...sel.keys()]) if (k.startsWith(p2.toLowerCase() + "/")) sel.delete(k); } else sel.delete(p2.toLowerCase());
      drawSel(); load(path); });
  };
  drawSel(); load("");
  m.querySelector("#dp-save").onclick = async () => { const b = m.querySelector("#dp-save"); b.disabled = true;
    try { await API.call("POST", "dropbox/folders", { token, paths: [...sel.values()] }); closeModal(); await dbxRefresh(); loadDbx(); render(true); toast("Dossiers Dropbox enregistrés"); dbxTick(true); }
    catch (x) { m.querySelector("#dp-err").textContent = tr(x.message); b.disabled = false; } };
}
ACTIONS["dbx-opts"] = () => {
  const s = DBX || {};
  const m = modal(`${mHead("Réglages Dropbox")}<form><div class="body stack-s">
    ${field("dx-veh", "Dossier des véhicules dans Dropbox", s.vehPath || "", { ph: "/WAYS SPRL Utility/Vehicles", cls: "mono", wide: true })}
    <div class="hint">Chemin tel qu'il apparaît dans l'adresse dropbox.com/home/… (par ex. <span class="mono">/Ludovic Masuir/WAYS SPRL Utility/Vehicles</span>). Utilisé pour les véhicules sans lien « Dossier Dropbox ».</div>
    <label class="chk line"><input type="checkbox" id="dx-sync" ${s.vehSync ? "checked" : ""}> Copier automatiquement les documents des véhicules dans Dropbox</label>
    <div><div class="small" style="margin-bottom:6px">Couleur du dossier Dropbox dans Administration <span class="muted">(le jaune est réservé à vos dossiers, le bleu aux dossiers système)</span></div>
      <div class="row-g wrap">${DBX_COLORS.map(([k, l]) => `<label class="dx-sw c-${k}"><input type="radio" name="dx-col" value="${k}" ${s.color === k ? "checked" : ""}><span class="folder-ic sm">${typeof folderSvg !== "undefined" ? folderSvg : ""}</span>${esc(tr(l))}</label>`).join("")}</div></div>
    <div class="err" id="dx-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`);
  m.querySelector("form").onsubmit = async e => { e.preventDefault();
    try { await API.call("POST", "dropbox/config", { vehPath: val("dx-veh").trim(), vehSync: m.querySelector("#dx-sync").checked, color: (m.querySelector("[name=dx-col]:checked") || {}).value || s.color });
      closeModal(); loadDbx(); render(true); toast("Réglages Dropbox enregistrés"); }
    catch (x) { m.querySelector("#dx-err").textContent = tr(x.message); } };
};
ACTIONS["dbx-resync"] = async () => { try { const r = await API.call("POST", "dropbox/resync", {}); toast(r.queue ? `${plural(r.queue, "document")} à copier` : "Tous les documents sont déjà dans Dropbox"); await dbxRefresh(); loadDbx(); dbxTick(true); } catch (e) { toast(tr(e.message)); } };
ACTIONS["dbx-off"] = () => confirmBox("Déconnecter Dropbox ? L'ERP n'y aura plus accès ; rien n'est supprimé dans Dropbox ni dans l'ERP.", async () => { await API.call("POST", "dropbox/disconnect", {}); await dbxRefresh(); loadDbx(); }, "Déconnecter");
ACTIONS["dbx-open-admin"] = () => { const f = adocF(); f.folder = "_dbx"; UI.dbxPath = ""; location.hash = "#admin"; render(true); };

/* ---------- Administration : dossier Dropbox ---------- */
const dbxColor = () => (DBX && DBX.color) || "green";
function dbxTile() {
  if (!DBX || !DBX.connected) return "";
  return `<div class="panel folder c-${esc(dbxColor())} sys" data-a="folder-open" data-id="_dbx" role="button" tabindex="0"><div class="folder-ic">${folderSvg}</div>
    <div class="folder-body"><b>Dropbox</b><div class="muted small">${esc((DBX.account && (DBX.account.team || DBX.account.name)) || "Compte de l'entreprise")}</div><span class="chip sm">Lié à Dropbox</span></div></div>`;
}
const dbxFmtSize = n => n == null ? "" : n < 1024 ? n + " o" : n < 1048576 ? Math.round(n / 1024) + " Ko" : (n / 1048576).toFixed(1).replace(".", ",") + " Mo";
const dbxIcon = e => e.folder ? `<span class="folder-ic sm c-${esc(dbxColor())}">${folderSvg}</span>` : `<span class="dx-ext">${esc((e.name.match(/\.([a-z0-9]{1,5})$/i) || [, "—"])[1].toUpperCase())}</span>`;
function dbxView(search) {
  const p = UI.dbxPath || "", segs = p.split("/").filter(Boolean);
  /* fil d'Ariane à partir du dossier autorisé qui contient ce chemin (les dossiers parents ne sont pas accessibles) */
  const root = ((DBX && DBX.folders) || []).filter(f => p.toLowerCase() === f.toLowerCase() || p.toLowerCase().startsWith(f.toLowerCase() + "/")).sort((a, b) => b.length - a.length)[0] || "";
  const rootN = root.split("/").filter(Boolean).length;
  const crumb = `<div class="crumb"><button class="linkbtn" data-a="folder-open" data-id="">Tous les dossiers</button><span aria-hidden="true">›</span>
    <span class="folder-ic sm c-${esc(dbxColor())}">${folderSvg}</span><button class="linkbtn" data-a="dbx-go" data-p=""><b>Dropbox</b></button>
    ${segs.map((s, i) => i < rootN - 1 ? "" : `<span aria-hidden="true">›</span><button class="linkbtn" data-a="dbx-go" data-p="${esc("/" + segs.slice(0, i + 1).join("/"))}">${esc(s)}</button>`).join("")}
    <a class="btn sm" style="margin-left:auto" href="https://www.dropbox.com/home${esc(segs.map(encodeURIComponent).join("/") ? "/" + segs.map(encodeURIComponent).join("/") : "")}" target="_blank" rel="noopener">Ouvrir dans Dropbox ↗</a></div>`;
  const tool = `<div class="panel pad vtool"><input type="search" id="dbx-q" class="fsearch" placeholder="${esc(tr("Rechercher dans Dropbox (Entrée)…"))}" value="${esc(UI.dbxQ || "")}" aria-label="Rechercher dans Dropbox">
    ${UI.dbxQ ? `<button class="btn sm" data-a="dbx-q-clear">Effacer la recherche</button>` : `<span class="muted small">${segs.length ? "dans ce dossier" : "dans tout le Dropbox"}</span>`}
    ${p && !readOnly ? `<label class="chk line dx-watch" title="${esc(tr("Axel signale les nouveaux fichiers de ce dossier et propose de les analyser"))}"><input type="checkbox" data-a="dbx-watch" data-p="${esc(p)}" ${dbxWatched(p) ? "checked" : ""}> ✦ Suivi Assistant</label>` : ""}</div>`;
  setTimeout(dbxLoadList, 0);
  return crumb + tool + `<div id="dbx-list" class="panel"><div class="pad muted">Chargement…</div></div>`;
}
let dbxReq = 0;
async function dbxLoadList() {
  const el = document.getElementById("dbx-list"); if (!el) return;
  const my = ++dbxReq, p = UI.dbxPath || "", q = (UI.dbxQ || "").trim();
  let r;
  try { r = q ? await API.call("POST", "dropbox/search", { query: q, path: p }) : await API.call("POST", "dropbox/list", { path: p }); }
  catch (e) { if (my === dbxReq && document.getElementById("dbx-list")) el.innerHTML = `<div class="pad err">${esc(tr(e.message))}</div>`; return; }
  if (my !== dbxReq || !document.body.contains(el)) return;
  const es = r.entries || [];
  el.innerHTML = !es.length ? `<div class="pad muted">${q ? "Aucun résultat." : p ? "Dossier vide." : "Aucun dossier Dropbox autorisé pour l'instant : l'administrateur les choisit dans Paramètres → Liaison Dropbox."}</div>`
    : `<div class="tablewrap"><table class="dx-tbl"><thead><tr><th>Nom</th>${q ? "<th>Dossier</th>" : ""}<th>Modifié</th><th class="r">Taille</th></tr></thead><tbody>${es.map(e => `<tr class="click" data-a="${e.folder ? "dbx-go" : "dbx-file"}" data-p="${esc(e.path)}">
      <td><span class="row-g nowrap">${dbxIcon(e)} <span>${esc(e.name)}</span>${e.root ? ` <span class="muted small mono">${esc(e.path)}</span>` : ""}${e.folder && dbxWatched(e.path) ? ` <span class="chip sm info" title="${esc(tr("Axel signale les nouveaux fichiers de ce dossier"))}">✦ Suivi Assistant</span>` : ""}</span></td>${q ? `<td class="small muted">${esc(e.path.split("/").slice(0, -1).join("/") || "/")}</td>` : ""}
      <td class="small nowrap">${e.modified ? fmtDate(e.modified.slice(0, 10)) : ""}</td><td class="r small nowrap">${e.folder ? "" : dbxFmtSize(e.size)}</td></tr>`).join("")}</tbody></table></div>
      ${es.length >= 2000 ? `<div class="pad small muted">Liste limitée à 2 000 éléments.</div>` : ""}`;
}
ACTIONS["dbx-go"] = el => { UI.dbxPath = el.dataset.p || ""; UI.dbxQ = ""; render(true); window.scrollTo(0, 0); };
ACTIONS["dbx-q-clear"] = () => { UI.dbxQ = ""; render(true); };
ACTIONS["dbx-file"] = async el => {
  const w = window.open("", "_blank");
  try { const r = await API.call("POST", "dropbox/link", { path: el.dataset.p }); if (w) w.location = r.link; else location.href = r.link; }
  catch (e) { if (w) w.close(); toast(tr(e.message)); }
};
document.addEventListener("keydown", e => {
  if (e.target && e.target.id === "dbx-q" && e.key === "Enter") { e.preventDefault(); UI.dbxQ = e.target.value.trim(); render(true); }
});
