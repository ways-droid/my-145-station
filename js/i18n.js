"use strict";
/* ======================= Traduction FR → EN =======================
   L'application est écrite en français. En anglais, chaque texte affiché est traduit au moment où il
   apparaît (dictionnaire + règles pour les textes qui contiennent des nombres ou des dates).
   Les données saisies (noms de clients, descriptions…) ne sont jamais traduites. */
const I18N_RULES = [], I18N_LATE = [];   // [regex, remplacement] ; les règles génériques passent en dernier
const rule = (re, rep, late) => (late ? I18N_LATE : I18N_RULES).push([re, rep]);
const EN = {};           // rempli par i18n-en.js
const I18N_MISS = new Set();

function trSeg(t) {
  if (EN[t] != null) return EN[t];
  const t2 = t.replace(/\s+/g, " ");
  if (EN[t2] != null) return EN[t2];
  for (const list of [I18N_RULES, I18N_LATE]) for (const [re, rep] of list) {
    if (re.test(t2)) { const r = t2.replace(re, rep); if (r !== t2) return r; }
  }
  return null;
}
/* traduit une phrase ; null si inconnue */
function trCore(core) {
  const exact = EN[core] ?? EN[core.replace(/\s+/g, " ")]; if (exact != null) return exact;
  if (core.includes(" · ")) {
    let hit = false;
    const parts = core.split(" · ").map(p => { const x = trCore(p); if (x != null && x !== p) hit = true; return x ?? p; });
    if (hit) return parts.join(" · ");
  }
  return trSeg(core);
}
function tr(s, lang = LANG) {
  if (lang !== "en" || s == null) return s;
  s = String(s);
  const m = s.match(/^(\s*(?:· )?)([\s\S]*?)((?: ·)?\s*)$/), core = m[2];
  if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return s;
  const r = trCore(core);
  if (r == null) { if (window.__i18nAll || /[éèêàùçôîû]|\b(le|la|les|des|du|une?|et|est|pour|dans|sur|au|aux)\b/i.test(core)) I18N_MISS.add(core); return s; }
  return m[1] + r + m[3];
}
/* --- application au DOM --- */
const NO_TR = "script,style,textarea,input,.plate,.fleetno,[data-noi18n],.ogm";
function trNode(n) {
  if (UI_LANG !== "en") return;
  if (n.nodeType === 3) {
    const p = n.parentElement; if (!p || p.closest(NO_TR)) return;
    const t = tr(n.data, UI_LANG); if (t !== n.data) n.data = t;
    return;
  }
  if (n.nodeType !== 1) return;
  if (n.matches && n.matches(NO_TR) && n.tagName !== "INPUT" && n.tagName !== "TEXTAREA") return;
  for (const a of ["placeholder", "title", "aria-label"]) if (n.hasAttribute && n.hasAttribute(a)) { const v = n.getAttribute(a), t = tr(v, UI_LANG); if (t !== v) n.setAttribute(a, t); }
  if (n.tagName === "INPUT" && (n.type === "button" || n.type === "submit")) { const t = tr(n.value, UI_LANG); if (t !== n.value) n.value = t; }
  const w = document.createTreeWalker(n, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let c = w.nextNode();
  while (c) {
    if (c.nodeType === 3) trNode(c);
    else for (const a of ["placeholder", "title", "aria-label"]) if (c.hasAttribute(a)) { const v = c.getAttribute(a), t = tr(v, UI_LANG); if (t !== v) c.setAttribute(a, t); }
    c = w.nextNode();
  }
}
const i18nObserver = new MutationObserver(muts => {
  if (UI_LANG !== "en") return;
  for (const m of muts) {
    if (m.type === "characterData") trNode(m.target);
    else for (const n of m.addedNodes) trNode(n);
  }
});
i18nObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

/* exécute fn dans une autre langue (PDF ou e-mail dans la langue du client) */
async function withLang(lang, fn) {
  const prev = LANG; LANG = lang === "en" ? "en" : "fr";
  try { return await fn(); } finally { LANG = prev; }
}
function setUiLang(l) {
  UI_LANG = LANG = l === "en" ? "en" : "fr";
  try { localStorage.setItem("ways-lang", UI_LANG); } catch { }
  document.documentElement.lang = UI_LANG;
  closeModal(); staticDone = null; render(true);
}
document.documentElement.lang = UI_LANG;
