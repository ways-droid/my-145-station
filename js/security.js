"use strict";
/* ======================= Sécurité : second facteur, droit de paiement, paiements Ponto ======================= */

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
       <div class="row-g wrap"><button class="btn sm" data-a="tfa-rec">${esc(tr("Nouveaux codes de secours"))}</button></div>${ME.canPay ? `<div class="small">💸 ${esc(tr("Vous pouvez préparer des paiements (signés ensuite dans Ponto / la banque)."))}</div>` : ""}`
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

/* ---- Paramètres : paiements (administrateur) ---- */
function payCardShell() {
  if (!SERVER || !isAdmin()) return "";
  return `<div class="panel" style="max-width:820px;margin-bottom:16px"><div class="pad stack"><h3 class="np">💸 ${esc(tr("Paiements depuis l'ERP"))}</h3><div id="pay-box"><div class="muted">Chargement…</div></div></div></div>`;
}
async function loadPay() {
  const box = document.getElementById("pay-box"); if (!box || !API) return;
  let l; try { l = await API.call("GET", "pay/limits"); } catch (e) { box.innerHTML = `<div class="err">${esc(tr(e.message))}</div>`; return; }
  const who = (USERS || []).filter(u => u.payRight).map(u => u.name);
  box.innerHTML = `<div class="stack-s"><div>${esc(tr("L'ERP prépare le virement d'une facture d'achat (IBAN, montant et communication pris sur la facture électronique). Il ne part qu'après votre signature dans Ponto / votre banque."))}</div>
    <dl class="kv"><dt>${esc(tr("Plafonds"))}</dt><dd><b>${eur(l.one)}</b> ${esc(tr("par paiement"))} · <b>${eur(l.day)}</b> ${esc(tr("par jour"))}</dd>
      <dt>${esc(tr("Autorisés"))}</dt><dd>${who.length ? who.map(esc).join(", ") : `<span class="muted">${esc(tr("personne pour l'instant — cochez « Initier des paiements » dans la fiche d'un utilisateur (admin ou bureau, second facteur actif)"))}</span>`}</dd></dl>
    <div class="row-g wrap"><button class="btn sm" data-a="pay-limits">${esc(tr("Modifier les plafonds"))}</button></div>
    <details class="small"><summary>${esc(tr("À faire une fois dans Ponto et à la banque"))}</summary><ol class="stack-s" style="margin:6px 0 0;padding-left:18px">
      <li>${esc(tr("Ponto → Integrations → votre intégration « ERP W.A.Y.S. » : ajoutez l'initiation de paiement (périmètre AIS + PIS) pour les comptes à débiter."))}</li>
      <li>${esc(tr("Ponto → compte → activez les paiements (Ponto vous fait signer une fois auprès de la banque)."))}</li>
      <li>${esc(tr("Facultatif : ajoutez l'adresse de retour"))} <span class="mono">${esc(location.origin + location.pathname.replace(/[^/]*$/, "") + "index.html#achats")}</span> ${esc(tr("aux redirections autorisées de l'intégration, pour revenir dans l'ERP après la signature."))}</li>
      <li>${esc(tr("À la banque : fixez un plafond de virement et, si possible, une double signature au-delà d'un montant."))}</li></ol></details></div>`;
}
ACTIONS["pay-limits"] = async () => {
  const l = await API.call("GET", "pay/limits");
  const m = modal(`${mHead("Plafonds de paiement")}<form><div class="body stack-s"><div class="fields">${field("pl-one", "Par paiement (€)", l.one, { type: "number" })}${field("pl-day", "Par jour (€)", l.day, { type: "number" })}</div>
    ${field("pl-code", "Code de votre application d'authentification", "", { required: true })}<div class="hint">${esc(tr("Les administrateurs sont prévenus par e-mail de tout changement."))}</div><div class="err" id="pl-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></footer></form>`, "sm");
  m.querySelector("form").onsubmit = async e => { e.preventDefault();
    try { await API.call("POST", "pay/limits", { one: +val("pl-one"), day: +val("pl-day"), code: val("pl-code") }); closeModal(); toast("Plafonds enregistrés"); loadPay(); }
    catch (x) { m.querySelector("#pl-err").textContent = tr(x.message); } };
};

/* ---- facture d'achat : bouton Payer et suivi ---- */
const PAY_ST_CHIP = { unsigned: "warn", pending: "info", rejected: "bad", cancelled: "", canceled: "" };
const payChip = p => `<span class="chip ${p.status && p.status.startsWith("accepted") ? (/completed|with-change/.test(p.status) ? "good" : "info") : PAY_ST_CHIP[p.status] ?? ""}">${esc(tr(p.statusLabel || p.status))}</span>`;
function purPayments(id) { return (S.payments || []).filter(x => x.purchaseId === id).sort((a, b) => (b.at || "").localeCompare(a.at || "")); }
function purPayHtml(p) {
  if (!SERVER) return "";
  const L = purPayments(p.id), live = L.find(x => x.status === "unsigned");
  const rows = L.map(x => `<div class="small">${payChip(x)} ${eur(x.amount)} → <span class="mono">${esc(ibanFmt(x.iban))}</span> · ${esc(x.by || "")} · ${fmtDate((x.at || "").slice(0, 10))}${x.status === "unsigned" && x.redirect ? ` · <a href="${esc(x.redirect)}" target="_blank" rel="noopener">${esc(tr("signer"))}</a>` : ""}</div>`).join("");
  const can = ME && !ME.key && isOffice() && p.source === "falco" && p.supplierIban && !p.credit && purSt(p) !== "paid" && !L.some(x => ["unsigned", "pending"].includes(x.status) || (x.status || "").startsWith("accepted-") && !/completed|with-change/.test(x.status));
  return `${rows}<div class="row-g wrap" style="margin-top:6px">${can ? `<button class="btn sm pay-btn" data-a="pay-open" data-id="${p.id}">💸 ${esc(tr("Payer"))}</button>` : ""}${live ? `<button class="btn sm" data-a="pay-refresh" data-id="${live.id}">${esc(tr("Actualiser le statut"))}</button><button class="btn sm danger" data-a="pay-cancel" data-id="${live.id}">${esc(tr("Annuler le paiement"))}</button>` : ""}</div>`;
}
ACTIONS["pay-open"] = async el => {
  const id = el.dataset.id;
  let c; try { c = await API.call("GET", "pay/check/" + encodeURIComponent(id)); } catch (x) { toast(tr(x.message)); return; }
  const ibSt = { known: ["good", `IBAN déjà payé ${c.ibanPaid} fois depuis vos comptes${c.ibanLast ? " (dernier : " + fmtDate(c.ibanLast) + ")" : ""}`], changed: ["bad", "IBAN DIFFÉRENT des factures précédentes de ce fournisseur"], new: ["warn", "IBAN jamais payé depuis vos comptes"] }[c.ibanStatus];
  const accs = c.accounts || [];
  const m = modal(`${mHead(`💸 ${esc(tr("Payer"))} · ${esc(c.number)}`)}<form><div class="body stack-s">
    <dl class="kv"><dt>${esc(tr("Bénéficiaire"))}</dt><dd><b>${esc(c.supplier)}</b></dd><dt>IBAN</dt><dd><span class="mono" style="font-size:15px">${esc(ibanFmt(c.iban))}</span><div><span class="chip ${ibSt[0]}">${esc(tr(ibSt[1]))}</span></div>${c.otherIbans && c.otherIbans.length ? `<div class="small muted">${esc(tr("IBAN des autres factures"))} : ${c.otherIbans.map(i => `<span class="mono">${esc(ibanFmt(i))}</span>`).join(", ")}</div>` : ""}</dd>
      <dt>${esc(tr("Montant"))}</dt><dd><b style="font-size:18px">${eur(c.due)}</b></dd><dt>${esc(tr("Communication"))}</dt><dd>${c.structured ? `<span class="ogm">+++${esc(c.remittance.replace(/^(\d{3})(\d{4})(\d{5})$/, "$1/$2/$3"))}+++</span>` : esc(c.remittance)}</dd></dl>
    ${c.block.length ? `<div class="banner warn">${c.block.map(esc).join("<br>")}</div>` : !c.canPay ? `<div class="banner warn"><b>${esc(tr("Vous n'avez pas encore le droit « Initier des paiements ».")) }</b><br>${esc(tr(!c.tfa ? "Activez d'abord votre second facteur (Profil), puis un administrateur coche la case dans Paramètres → Utilisateurs." : isAdmin() ? "Cochez « Initier des paiements » dans Paramètres → Utilisateurs → votre fiche." : "Demandez à un administrateur de cocher « Initier des paiements » dans votre fiche utilisateur."))}${isAdmin() ? ` <a href="#parametres" data-close>${esc(tr("Ouvrir les paramètres"))}</a>` : ""}</div>` : `
    ${field("py-acc", "Compte à débiter", accs[0] ? accs[0].id : "", { type: "select", options: accs.map(a => [a.id, `${a.bank ? a.bank + " · " : ""}${ibanFmt(a.iban)}${a.balance != null ? " · " + eur(a.balance) : ""}`]) })}
    ${c.ibanStatus !== "known" ? `<label class="chk line confirm-chk"><input type="checkbox" id="py-ack"> <span>${esc(tr("J'ai vérifié cet IBAN auprès du fournisseur par un autre moyen que l'e-mail (téléphone à un numéro connu)."))}</span></label>` : ""}
    ${field("py-code", "Code de votre application d'authentification", "", { required: true })}
    <div class="hint">${esc(tr("L'ERP prépare le virement ; il ne part qu'après votre signature dans Ponto / la banque. Relisez l'IBAN et le montant sur l'écran de la banque avant de signer. Les administrateurs sont prévenus par e-mail."))}</div>`}
    <div class="err" id="py-err"></div></div>
    <footer><button type="button" class="btn" data-close>Annuler</button>${!c.block.length && c.canPay ? `<button class="btn primary" id="py-go" ${c.ibanStatus !== "known" ? "disabled" : ""}>${esc(tr("Préparer le paiement"))}</button>` : ""}</footer></form>`);
  const ack = m.querySelector("#py-ack"), go = m.querySelector("#py-go");
  if (ack && go) ack.onchange = () => go.disabled = !ack.checked;
  setTimeout(() => m.querySelector("#py-code")?.focus(), 50);
  m.querySelector("form").onsubmit = async e => { e.preventDefault(); if (!go) return; go.disabled = true; const err = m.querySelector("#py-err"); err.textContent = "";
    try {
      const r = await API.call("POST", "pay/create", { id, accountId: val("py-acc"), code: val("py-code"), ibanAck: !!(ack && ack.checked) });
      m.querySelector(".body").innerHTML = `<div class="banner good"><b>${esc(tr("Paiement préparé"))}</b> : ${eur(c.due)} → ${esc(c.supplier)}</div>
        ${r.redirect ? `<div>${esc(tr("Il reste à le signer :"))}</div><a class="btn primary" href="${esc(r.redirect)}" target="_blank" rel="noopener">${esc(tr("Signer dans Ponto"))} ↗</a>`
        : `<div>${esc(tr("Il reste à le signer dans Ponto (menu Paiements), avec l'authentification de votre banque."))}</div><a class="btn primary" href="https://dashboard.myponto.com/" target="_blank" rel="noopener">${esc(tr("Ouvrir Ponto"))} ↗</a>`}
        <div class="hint">${esc(tr("Le statut se met à jour ici ; le virement sera relié à la facture quand il apparaîtra sur le compte."))}</div>`;
      m.querySelector("footer").innerHTML = `<button class="btn" data-close>${esc(tr("Fermer"))}</button>`;
    } catch (x) { err.textContent = tr(x.message); go.disabled = false; } };
};
ACTIONS["pay-refresh"] = async el => { try { const r = await API.call("POST", "pay/status", { id: el.dataset.id }); toast(`${tr("Statut du paiement")} : ${tr(r.label)}`); } catch (x) { toast(tr(x.message)); } };
ACTIONS["pay-cancel"] = el => confirmBox("Annuler ce paiement non signé ? Il est retiré de Ponto.", async () => { try { await API.call("POST", "pay/cancel", { id: el.dataset.id }); toast("Paiement annulé"); } catch (x) { toast(tr(x.message)); } }, "Annuler le paiement");
