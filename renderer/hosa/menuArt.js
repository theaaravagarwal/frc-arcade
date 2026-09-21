"use strict";
const { svgSprite } = require("./art");
const sprite = (name, x, y) => svgSprite(name, x, y, 7);

function cellArt() {
  const specimens = [
    ["aimed",88,92,7], ["drifter",210,66,7], ["tank",364,140,8],
    ["majorboss",560,105,14], ["diver",470,260,7], ["drifter",190,245,7],
  ];
  const cells = specimens.map(([type,x,y,size], i) =>
    `<g transform="translate(${x} ${y})"><g class="${i === 2 ? "cell-target" : "cell-drift"}">${svgSprite(type,-size*4,-size*4,size)}</g></g>`).join("");
  return `<svg viewBox="0 0 700 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="700" height="500" fill="#111a35"/><g fill="#192b49" stroke="#263b58" stroke-width="3"><path d="M-30 40H100L132 90V152L65 180H-30Z"/><path d="M200-30H355L393 22V74L335 96H230L190 51Z"/><path d="M480 155H650L725 235V310L649 338H520L472 270Z"/><path d="M-25 293H103L160 343V418L115 455H-25Z"/><path d="M240 365H385L432 419V510H210V421Z"/></g><g fill="#35516b" opacity=".65"><rect x="49" y="104" width="8" height="8"/><rect x="267" y="24" width="12" height="8"/><rect x="592" y="239" width="8" height="12"/><rect x="76" y="351" width="8" height="8"/></g>${cells}<g transform="translate(364 275)"><g class="cell-emitter">${sprite("emitter",-28,-28)}</g></g><g class="cell-shot" fill="#fff7d1"><rect x="361" y="235" width="6" height="18"/><rect x="362" y="254" width="4" height="12" fill="#62eadb" opacity=".6"/></g><g transform="translate(364 140)" fill="#fff7d1"><rect class="cell-fragment cell-fragment-a" x="-7" y="-7" width="14" height="14"/><g transform="rotate(120)"><rect class="cell-fragment cell-fragment-b" x="-6" y="-6" width="12" height="12" fill="#ec5286"/></g><g transform="rotate(240)"><rect class="cell-fragment cell-fragment-c" x="-5" y="-5" width="10" height="10" fill="#ffb7c9"/></g></g></svg>`;
}
function dashArt() {
  const runner = sprite("cube", -28, -28);
  return `<svg viewBox="0 0 700 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="700" height="500" fill="#7c235d"/><path d="M0 170H700V500H0Z" fill="#ee6c54"/><g stroke="#ffcf55" stroke-width="5" opacity=".8"><path d="M0 72H700M0 150H700M0 228H700"/></g><g fill="#2e476f" stroke="#111a35" stroke-width="12"><path d="M0 424H700V500H0Z"/><path d="M360 424V318H520V424Z"/></g><g fill="#ec245f"><path d="M165 424l27-54 27 54zM226 424l27-54 27 54z"/></g><g transform="translate(235 300)"><g class="dash-trail dash-trail-far">${runner}</g><g class="dash-trail dash-trail-near">${runner}</g><g class="dash-runner">${runner}</g></g><g transform="translate(510 150)"><g class="portal-ring" fill="#111a35" stroke="#62eadb" stroke-width="10"><path d="M0-58C57-42 57 42 0 58C-57 42-57-42 0-58Z"/></g><g class="portal-core" fill="#f5c400"><rect x="-22" y="-28" width="44" height="56"/></g><path class="portal-spark" d="M0-70L10-12 52 0 10 12 0 70-10 12-52 0-10-12Z" fill="#fff7d1"/></g></svg>`;
}
function menuArt(type) { return type === "dash" ? dashArt() : cellArt(); }
module.exports = { menuArt };
