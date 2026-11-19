"use strict";
/* ======================= Sécurité : second facteur ======================= */

/* ---- profil : second facteur ---- */
(() => {
  const base = ACTIONS["prof-open"];
  ACTIONS["prof-open"] = async el => {
    await base(el);
    if (!SERVER || !ME || ME.key || !API) return;
    const body = document.querySelector(".modal .body"); if (!body) return;
    const box = document.createElement("div"); box.className = "stack-s"; box.id = "prof-tfa"; body.appendChild(box);
    tfaBox(box);
  };
})();
async function tfaBox(box) {
  let t; try { t = await API.call("GET", "auth/tfa"); } catch (e) { box.innerHTML = ""; return; }
  box.innerHTML = `<h4 class="np">${esc(tr("Second facteur"))}</h4>${t.on
    ? `<div><span class="chip good">${esc(tr("actif"))}</span> <span class="muted small">${t.since ? tr("depuis le") + " " + fmtDate(new Date(t.since).toISOString().slice(0, 10)) : ""} · ${plural(t.recoveryLeft, "code")} ${esc(tr("de secours restant" + (t.recoveryLeft > 1 ? "s" : "")))}</span></div>
       <div class="row-g wrap"><button class="btn sm" data-a="tfa-rec">${esc(tr("Nouveaux codes de secours"))}</button></div>`
    : `<div><span class="chip ${t.required ? "warn" : ""}">${esc(tr("inactif"))}</span> <span class="muted small">${esc(tr(t.required ? "obligatoire pour votre rôle : il sera demandé à la prochaine connexion" : "facultatif pour votre rôle, recommandé"))}</span></div>
       ${t.required ? "" : `<div><button class="btn sm" data-a="tfa-enable">${esc(tr("Activer le second facteur"))}</button></div>`}`}`;
}
function recoveryHtml(codes) {
  return `<p class="small">${esc(tr("Chaque code ne sert qu'une fois, si vous n'avez plus votre téléphone. Les anciens codes ne marchent plus."))}</p><pre class="tfa-rec">${codes.map(esc).join("\n")}</pre>`;
}
ACTIONS["tfa-rec"] = () => {
  const m = modal(`${mHead("Nouveaux codes de secours")}<form><div class="body stack-s"><div>${esc(tr("Tapez le code de votre application d'authentification pour générer 8 nouveaux codes de secours."))}</div>
    ${field("tr-code", "Code à 6 chiffres", "", { required: true })}<div class="err" id="tr-err"></div></div><footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Générer</button></footer></form>`, "sm");
  m.querySelector("form").onsubmit = async e => { e.preventDefault();
    try { const r = await API.call("POST", "auth/tfa/recovery", { code: val("tr-code") });
      m.querySelector(".body").innerHTML = recoveryHtml(r.recovery); m.querySelector("footer").innerHTML = `<button class="btn primary" data-close>${esc(tr("C'est noté"))}</button>`; }
    catch (x) { m.querySelector("#tr-err").textContent = tr(x.message); } };
};
ACTIONS["tfa-enable"] = async () => {
  let r; try { r = await API.call("POST", "auth/tfa/enable"); } catch (x) { toast(tr(x.message)); return; }
  let qr = ""; try { if (!window.qrcode) await loadScript("js/vendor/qrcode.js"); const q = qrcode(0, "M"); q.addData(r.uri); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch { }
  const m = modal(`${mHead("Activer le second facteur")}<form><div class="body stack-s"><div class="small">${esc(tr("Scannez ce code avec votre application d'authentification, puis tapez les 6 chiffres affichés."))}</div>
    ${qr ? `<div class="tfa-qr">${qr}</div>` : ""}<div class="small">${esc(tr("Clé à saisir à la main"))} : <span class="mono tfa-key">${esc(r.secret.replace(/(.{4})/g, "$1 ").trim())}</span></div>
    ${field("te-code", "Code à 6 chiffres", "", { required: true })}<div class="err" id="te-err"></div></div><footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Activer</button></footer></form>`, "sm");
  m.querySelector("form").onsubmit = async e => { e.preventDefault();
    try { const x = await API.call("POST", "auth/tfa/confirm", { code: val("te-code") }); ME.tfa = true;
      m.querySelector(".body").innerHTML = `<b>${esc(tr("Second facteur activé."))}</b>` + recoveryHtml(x.recovery); m.querySelector("footer").innerHTML = `<button class="btn primary" data-close>${esc(tr("C'est noté"))}</button>`; }
    catch (x) { m.querySelector("#te-err").textContent = tr(x.message); } };
};
