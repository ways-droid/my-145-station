"use strict";
/* ======================= TABLEAU DE BORD ======================= */
const section = (title, link, body, c = "blue") => `<section class="dsec c-${c}"><div class="row-sb"><h2><i class="sq"></i>${title}</h2>${link ? `<a href="#${link}" class="small">Ouvrir le module →</a>` : ""}</div>${body}</section>`;

/* ======================= TABLEAU DE BORD À WIDGETS =======================
   Chaque utilisateur compose sa page : widgets ajoutés depuis un catalogue (par module), taille S / M / L,
   ordre par glisser-déposer. Disposition gardée dans userPrefs/p-<id utilisateur> (privée), ou dans le navigateur.
   Un widget n'est proposé que si le module correspondant est accessible au rôle. Pour ajouter un widget : WIDGETS.id = {…}. */
const WSIZE = { s: "Petit", m: "Moyen", l: "Large" };
const WIDGETS = {};
const W_DEFAULT = ["shortcuts", "fleet_state", "faults", "fleet_due", "calib", "notes"];
const prefsId = () => "p-" + ((ME && (ME.key ? "key" : ME.id)) || "local");
const myPrefs = () => (S.userPrefs || []).find(p => p.id === prefsId()) || (() => { try { return JSON.parse(localStorage.getItem("st-prefs") || "{}"); } catch { return {}; } })();
const wOk = id => WIDGETS[id] && (!WIDGETS[id].m || allowed(WIDGETS[id].m)) && (!WIDGETS[id].ok || WIDGETS[id].ok());
function dashLayout() {
  const l = myPrefs().dash;
  return (Array.isArray(l) ? l : W_DEFAULT.map(id => ({ id }))).filter(x => wOk(x.id)).map(x => ({ id: x.id, size: WSIZE[x.size] ? x.size : WIDGETS[x.id].size }));
}
async function dashSaveOld(layout) {
  const data = Object.assign({}, myPrefs(), { dash: layout.map(x => ({ id: x.id, size: x.size })) }); delete data.id;
  if (db) await save("userPrefs", prefsId(), data); else { try { localStorage.setItem("st-prefs", JSON.stringify(data)); } catch { } render(true); }
}
const wLink = (href, l) => `<a href="#${href}" class="w-more">${esc(tr(l || "Ouvrir"))} →</a>`;
const wEmpty = t => `<div class="w-empty">${esc(tr(t))}</div>`;
const wStat = (v, l, cls = "", attrs = "") => `<div class="w-stat ${cls}" ${attrs}><b>${v}</b><span>${esc(tr(l))}</span></div>`;

/* ---- widgets ---- */
WIDGETS.shortcuts = { h: 4, t: "Raccourcis", ic: "⚡", c: "blue", size: "m", d: "Les actions les plus courantes en un clic.",
  r() { const b = [["etalonnage", "tool-reception", "Réceptionner des outils", ""], ["flotte", "fault-form", "Signaler une panne", ""], ["admin", "note-form", "Nouvelle note", ""], ["flotte", "veh-form", "Ajouter un véhicule", ""]].filter(x => allowed(x[0]));
    return `<div class="w-short">${b.map(([, a, l, x]) => `<button class="btn ${a === "fault-form" ? "btn-alert" : ""}" data-a="${a}" ${x} ${dis()}>${esc(tr(l))}</button>`).join("")}</div>`; } };
WIDGETS.fleet_state = { h: 5, t: "État des véhicules", ic: "🚗", c: "orange", m: "flotte", size: "s", d: "Véhicules disponibles, en panne, immobilisés.",
  r() { const st = activeVehicles().map(vehState), c = k => st.filter(s => s[1] === k).length;
    return `<div class="w-stats">${wStat(c("good"), "disponibles", "good")}${wStat(c("warn"), "panne / atelier", c("warn") ? "warn" : "")}${wStat(c("bad"), "immobilisés", c("bad") ? "bad" : "")}</div>${wLink("flotte", "Voir les véhicules")}`; } };
WIDGETS.faults = { h: 8, t: "Pannes et défauts", ic: "⚠", c: "red", m: "flotte", size: "m", d: "Pannes en cours et signalements à valider.",
  r() { const open = S.faults.filter(f => f.status !== "reparee" && isActiveVeh(f.vehicleId)).sort((a, b) => ((b.status === "attente") - (a.status === "attente")) || (b.date || "").localeCompare(a.date || ""));
    const wait = open.filter(f => f.status === "attente").length;
    return `${wait && isOffice() ? `<div class="banner warn small">${plural(wait, "signalement")} à valider</div>` : ""}<div class="w-list">${open.slice(0, 6).map(f => `<div class="list-row click" data-a="fault-open" data-id="${f.id}"><div><div>${esc(f.description)}</div><div class="muted small">${esc(vehLabel(f.vehicleId))} · ${fmtDate(f.date)}</div></div><span class="chip ${(FAULT_ST[f.status] || FAULT_ST.ouverte)[1]}">${(FAULT_ST[f.status] || FAULT_ST.ouverte)[0]}</span></div>`).join("") || wEmpty("Aucune panne en cours.")}</div>
      ${open.length > 6 ? `<div class="muted small">… et ${open.length - 6} autres</div>` : ""}${wLink("flotte", "Toutes les pannes")}`; },
  go() { UI.tab.flotte = "pannes"; } };
WIDGETS.fleet_due = { h: 9, t: "Échéances véhicules", ic: "📅", c: "orange", m: "flotte", size: "m", d: "Contrôles techniques, assurances, entretiens à venir (45 jours).",
  r() { const t = fleetTasks(45); return `<div class="w-list">${t.slice(0, 6).map(taskRow).join("") || wEmpty("Rien dans les 45 prochains jours.")}</div>${t.length > 6 ? `<div class="muted small">… et ${t.length - 6} autres</div>` : ""}${wLink("flotte", "À faire")}`; } };
WIDGETS.calib = { h: 8, t: "Outillage", ic: "🔬", c: "green", m: "etalonnage", size: "m", d: "Outils en cours, prêts à rendre, échéances.",
  r() { const n = st => S.tools.filter(t => colOf(t) === st).length, due = toolsDue(30).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
    return `<div class="w-stats">${wStat(n("recu") + n("picked") + n("labo"), "en atelier")}${wStat(n("a_livrer"), "à rendre", n("a_livrer") ? "good" : "")}${wStat(toolsDue(0).length, "échéances dépassées", toolsDue(0).length ? "bad" : "")}</div>
      <div class="w-list">${due.slice(0, 4).map(t => `<div class="list-row click" data-a="tool-open" data-id="${t.id}"><span>${esc(t.name)} <span class="mono small muted">${esc(t.serial)}</span><div class="muted small">${esc(clientName(t.clientId))}</div></span>${dueChip(t.nextDue)}</div>`).join("") || wEmpty("Aucune échéance dans les 30 jours.")}</div>${wLink("etalonnage")}`; } };
WIDGETS.notes = { h: 7, t: "Mes notes", ic: "📝", c: "grey", m: "admin", size: "m", ok: () => typeof notesAll === "function", d: "Notes épinglées (ou les plus récentes).",
  r() { const all = notesAll().sort(noteSort), pin = all.filter(n => n.pinned), list = (pin.length ? pin : all).slice(0, 4);
    return `<div class="w-notes">${list.map(n => `<button class="w-note nc-${n.color || "def"}" data-a="note-form" data-id="${n.id}"><b>${esc(noteTitle(n))}</b><span>${esc((n.body || "").slice(0, 120))}</span></button>`).join("") || wEmpty("Aucune note.")}</div>
      ${readOnly ? "" : `<button class="btn sm" data-a="note-form">+ Nouvelle note</button>`}`; }, go() { UI.tab.admin = "notes"; } };

/* ---- page : grille libre (GridStack) — glisser n'importe où, redimensionner par les bords ---- */
const WSPAN = { s: 3, m: 6, l: 12 };
function dashItems() {   /* disposition : [{id, x, y, w, h}] ; anciennes dispositions (taille S/M/L) converties */
  return dashLayout().map(x => { const raw = (myPrefs().dash || []).find(y => y.id === x.id) || {}, w = WIDGETS[x.id];
    return { id: x.id, x: Number.isFinite(raw.x) ? raw.x : undefined, y: Number.isFinite(raw.y) ? raw.y : undefined, w: raw.w || WSPAN[x.size] || 6, h: raw.h || w.h || 6 }; });
}
const DASH = { bodies: {} };
function dashSig(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
VIEWS.dashboard = {
  render() {
    const t = today(), edit = !!UI.dashEdit, items = dashItems();
    DASH.bodies = {}; for (const it of items) { try { DASH.bodies[it.id] = WIDGETS[it.id].r(); } catch (e) { console.error(e); DASH.bodies[it.id] = wEmpty("Ce widget n'a pas pu s'afficher."); } }
    const sig = dashSig(JSON.stringify(items) + edit + Object.values(DASH.bodies).join(""));
    const h = new Date().getHours(), hi = h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
    return `<div class="dash-hero">${logoSvg("currentColor", "none", "ghost")}` + head(`${hi}${ME && ME.name && !ME.key ? ", " + esc(ME.name.split(" ")[0]) : ""}`, `${esc(settings().name)} · ${fmtDate(t)}`,
      edit ? `<button class="btn" data-a="dash-add">+ Ajouter des widgets</button><button class="btn" data-a="dash-reset">Rétablir par défaut</button><button class="btn primary" data-a="dash-edit">Terminer</button>`
        : `<button class="btn" data-a="dash-edit">✎ Personnaliser</button>`) + `</div>` +
      (edit ? `<div class="banner info small">Glissez un widget par son en-tête pour le placer où vous voulez ; tirez ses bords ou ses coins pour le redimensionner. Votre tableau de bord vous est propre.</div>` : "") +
      (items.length ? `<div id="wgrid" class="grid-stack wgrid2 ${edit ? "editing" : ""}" data-keep="dash" data-sig="${sig}"></div>`
        : `<div class="panel empty">Votre tableau de bord est vide. <button class="btn primary" data-a="dash-add">+ Ajouter des widgets</button></div>`);
  },
  after() { dashMount(); }
};
let gsP = null;
function loadGridstack() {
  if (window.GridStack) return Promise.resolve();
  if (!gsP) { const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "js/vendor/gridstack.min.css"; document.head.appendChild(css); gsP = loadScript("js/vendor/gridstack-all.js"); }
  return gsP;
}
const wHead = (it) => { const w = WIDGETS[it.id];
  return `<header class="w-h"><span class="w-ic" aria-hidden="true">${w.ic || "▪"}</span><h3>${esc(tr(w.t))}</h3><button class="x w-del" data-a="dash-del" data-id="${it.id}" title="Retirer" aria-label="Retirer ${esc(w.t)}">×</button></header>`; };
async function dashMount() {
  const el = document.getElementById("wgrid"); if (!el) return;
  try { await loadGridstack(); } catch (e) { el.innerHTML = `<div class="err">La grille n'a pas pu être chargée.</div>`; return; }
  const GS = window.GridStack && (window.GridStack.GridStack || window.GridStack); if (!GS || !document.body.contains(el)) return;
  const edit = !!UI.dashEdit, items = dashItems(), key = items.map(i => i.id).join(",");
  el.classList.toggle("editing", edit);
  if (el._gs && el._key === key) {   /* même widgets : on met seulement à jour leur contenu (et le mode) */
    for (const it of items) { const b = el.querySelector(`[gs-id="${it.id}"] .w-b`), html = DASH.bodies[it.id]; if (b && b._html !== html) { b.innerHTML = html; b._html = html; } }
    el._gs.enableMove(edit); el._gs.enableResize(edit); return;
  }
  if (el._gs) { el._gs.destroy(false); el._gs = null; }
  el.innerHTML = items.map(it => `<div class="grid-stack-item" gs-id="${it.id}" ${it.x != null ? `gs-x="${it.x}" gs-y="${it.y}"` : `gs-auto-position="true"`} gs-w="${it.w}" gs-h="${it.h}" gs-min-w="2" gs-min-h="3">
    <div class="grid-stack-item-content"><section class="wdg c-${WIDGETS[it.id].c || "blue"}">${wHead(it)}<div class="w-b">${DASH.bodies[it.id]}</div></section></div></div>`).join("");
  el.querySelectorAll(".w-b").forEach((b, i) => b._html = DASH.bodies[items[i].id]);
  const g = GS.init({ column: 12, cellHeight: 44, margin: 8, mode: "float", float: true, animate: true, draggable: { handle: ".w-h" },
    resizable: { handles: "e,se,s,sw,w" }, columnOpts: { breakpointForWindow: true, breakpoints: [{ w: 800, c: 1 }] } }, el);
  el._gs = g; el._key = key; g.enableMove(edit); g.enableResize(edit);
  let saveT = null;
  g.on("change", () => {
    if (!UI.dashEdit || g.getColumn() !== 12) return;   /* on n'enregistre que la mise en page « bureau » (12 colonnes) */
    clearTimeout(saveT); saveT = setTimeout(() => {
      const pos = {}; for (const n of g.engine.nodes) pos[n.id || n.el?.getAttribute("gs-id")] = { x: n.x, y: n.y, w: n.w, h: n.h };
      dashSave(dashItems().map(it => Object.assign({ id: it.id }, pos[it.id] || {})));
    }, 250);
  });
}
async function dashSave(layout) {   /* surcharge : enregistre x, y, w, h */
  const data = Object.assign({}, myPrefs(), { dash: layout.map(x => ({ id: x.id, x: x.x, y: x.y, w: x.w, h: x.h, size: x.size })) }); delete data.id;
  const el = document.getElementById("wgrid"); if (el && el._gs) el._key = layout.map(i => i.id).join(",");   /* pas de reconstruction après un simple déplacement */
  if (db) await save("userPrefs", prefsId(), data); else { try { localStorage.setItem("st-prefs", JSON.stringify(data)); } catch { } render(true); }
}
ACTIONS["dash-edit"] = () => { UI.dashEdit = !UI.dashEdit; render(true); };
ACTIONS["dash-reset"] = () => confirmBox("Rétablir le tableau de bord par défaut ?", () => { const el = document.getElementById("wgrid"); if (el) el._key = null; return dashSave(W_DEFAULT.filter(wOk).map(id => ({ id }))); }, "Rétablir");
ACTIONS["dash-del"] = el => { const g = document.getElementById("wgrid"); if (g) g._key = null; dashSave(dashItems().filter(x => x.id !== el.dataset.id)); };
ACTIONS["dash-add"] = () => {
  const have = new Set(dashLayout().map(x => x.id));
  const mods = { "": "Général", flotte: "Véhicules", etalonnage: "Outillage", admin: "Administration" };
  const groups = {}; for (const [id, w] of Object.entries(WIDGETS)) if (wOk(id)) (groups[w.m || ""] ||= []).push([id, w]);
  const m = modal(`${mHead("Ajouter des widgets")}<div class="body stack">${Object.entries(groups).map(([k, ws]) => `<div><h4 class="np">${esc(mods[k] || k)}</h4><div class="w-cat">${ws.map(([id, w]) =>
    `<button class="w-pick c-${w.c || "blue"} ${have.has(id) ? "on" : ""}" data-wadd="${id}"><span class="w-ic">${w.ic || "▪"}</span><span><b>${esc(tr(w.t))}</b><span class="muted small">${esc(tr(w.d || ""))}</span></span><span class="w-st">${have.has(id) ? "✓ Affiché" : "+ Ajouter"}</span></button>`).join("")}</div></div>`).join("")}</div>
    <footer><button class="btn primary" data-close>Terminé</button></footer>`, "lg");
  m.addEventListener("click", e => { const b = e.target.closest("[data-wadd]"); if (!b || b.classList.contains("on")) return;
    const id = b.dataset.wadd, g = document.getElementById("wgrid"); if (g) g._key = null;
    dashSave([...dashItems(), { id }]); b.classList.add("on"); b.querySelector(".w-st").textContent = "✓ Affiché"; });
};
/* lien « Ouvrir » d'un widget : ouvre le bon onglet du module */
document.addEventListener("click", e => { const a = e.target.closest(".wdg .w-more"); if (!a) return; const id = a.closest(".grid-stack-item")?.getAttribute("gs-id"); const w = WIDGETS[id]; if (w && w.go) w.go(); }, true);

init();
