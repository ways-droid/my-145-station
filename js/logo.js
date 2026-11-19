"use strict";
/* Logo neutre de my-145-station : une piste stylisée et un avion, dans un cercle (remplaçable plus tard par le logo de l'organisation) */
function logoSvg(mark = "#1f4fbf", band = "#c9d3e6", cls = "") {
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Logo my-145-station">`
    + `<circle cx="32" cy="32" r="29" fill="none" stroke="${band}" stroke-width="5"/>`
    + `<path fill="${mark}" d="M32 9c2 0 3.2 2.2 3.2 5v11.4l17 9.6v4.6l-17-4.6v9.6l5.4 4v3.8L32 49.6l-8.6 2.8v-3.8l5.4-4V35l-17 4.6V35l17-9.6V14c0-2.8 1.2-5 3.2-5z"/></svg>`;
}
/* version PNG pour les PDF (générée une fois au chargement) */
let LOGO_PNG = null;
(function () {
  try {
    const img = new Image();
    img.onload = () => { try { const c = document.createElement("canvas"); c.width = 512; c.height = 512; c.getContext("2d").drawImage(img, 0, 0, 512, 512); LOGO_PNG = c.toDataURL("image/png"); } catch { } };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(logoSvg().replace('class=""', ""));
  } catch { }
})();
