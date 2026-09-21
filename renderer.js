"use strict";

const ALL_GAMES = [
  {
    id: "cellDefender",
    title: "CELL DEFENDER",
    tag: "IMMUNOLOGY",
    description: "Tag cancer cells. Build your immune response.",
    step: 0.02,
    module: "./renderer/games/cellDefender",
  },
  {
    id: "labDash",
    title: "LAB DASH",
    tag: "RESEARCH",
    description: "Clear the course. Collect breakthroughs.",
    step: 1 / 60,
    module: "./renderer/games/labDash",
  },
];
const GAMES = ALL_GAMES.filter((game) => game.id === "cellDefender");
const STORAGE_VERSION = "hosa.arcade.v4";
const DEV_KEY_CODES = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyX", "KeyP", "Escape", "KeyM", "F2",
]);
// Keep Cell Defender runs separate from the retired encounter scores. Lab Dash
// keys deliberately remain untouched so existing research progress survives.
const scoreKey = key => key.startsWith("cellDefender.") ? key.replace("cellDefender.", "cellDefender.builds.") : key;
const MOTION = Object.freeze({ fast: 120, exit: 160, view: 200, accent: 240, reduced: 100 });
const { menuArt } = require("./renderer/hosa/menuArt");
const { rewardArt } = require("./renderer/hosa/rewardArt");
const { NAME_KEYS, NAME_COLUMNS, cleanName, moveNameCursor, applyNameKey } = require("./renderer/hosa/nameEntry");
const { sandboxCatalog, sandboxState } = require("./renderer/hosa/devSandbox");
const { WEAPONS = {}, EVOLUTIONS = {} } = require("./renderer/games/cellDefender/weapons");
const weaponParent = Object.fromEntries(Object.entries(EVOLUTIONS).flatMap(([parent, children]) => children.map((id) => [id, parent])));
function weaponPath(id) {
  const parts = [], seen = new Set(); let current = id;
  while (current && !seen.has(current)) { seen.add(current); parts.unshift(WEAPONS[current]?.name || current); current = WEAPONS[current]?.parent || weaponParent[current]; }
  return parts.join(" → ");
}
let runSerial = 0;
const createRunId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  runSerial += 1;
  return `run-${Date.now().toString(36)}-${runSerial.toString(36)}`;
};
const NO_INPUT = Object.freeze({
  moveX: 0,
  moveY: 0,
  actionDown: false,
  actionPressed: false,
  specialPressed: false,
  startPressed: false,
  backPressed: false,
  yPressed: false,
  nav: 0,
  rewardNav: 0,
});
const pressed = (pad, n) =>
  Boolean(pad && pad.buttons && pad.buttons[n] && pad.buttons[n].pressed);
const axis = (pad, n) => {
  const v = pad && pad.axes ? Number(pad.axes[n]) : 0;
  return Number.isFinite(v) && Math.abs(v) >= 0.35
    ? Math.max(-1, Math.min(1, v))
    : 0;
};
const controlState = (pad) =>
  Array.from({ length: 17 }, (_, n) => pressed(pad, n));
function safeStorage(storage) {
  return {
    get(key, fallback) {
      try {
        const raw = storage && storage.getItem(`${STORAGE_VERSION}.${scoreKey(key)}`);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        storage &&
          storage.setItem(`${STORAGE_VERSION}.${scoreKey(key)}`, JSON.stringify(value));
      } catch {}
    },
  };
}
class CabinetAudio {
  constructor() {
    this.muted = false;
    this.context = null;
  }
  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }
  play(name) {
    if (this.muted || typeof AudioContext === "undefined") return;
    try {
      this.context ||= new AudioContext();
      const c = this.context;
      if (c.state === "suspended") c.resume();
      const o = c.createOscillator(),
        g = c.createGain(),
        notes = {
          countdown: 440,
          go: 880,
          shoot: 630,
          hit: 150,
          death: 80,
          wave: 440,
          jump: 520,
          pickup: 760,
          win: 880,
          portal: 690,
          "stage-clear": 830,
          special: 110,
          shield: 330,
        };
      o.type = name === "death" ? "sawtooth" : "sine";
      o.frequency.setValueAtTime(notes[name] || 400, c.currentTime);
      g.gain.setValueAtTime(0.08, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.13);
      o.connect(g).connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.14);
    } catch {}
  }
}

class HosaShell {
  constructor(options = {}) {
    this.doc =
      options.document || (typeof document !== "undefined" ? document : null);
    this.win =
      options.window || (typeof window !== "undefined" ? window : null);
    this.devMode =
      options.devMode != null
        ? Boolean(options.devMode)
        : typeof process !== "undefined" &&
          process.env.NODE_ENV === "development";
    this.nav =
      options.navigator ||
      (typeof navigator !== "undefined" ? navigator : null);
    this.canvas =
      options.canvas || (this.doc && this.doc.getElementById("gameCanvas"));
    this.screen =
      options.screen || (this.doc && this.doc.getElementById("screen"));
    this.status =
      options.status || (this.doc && this.doc.getElementById("status"));
    this.sandboxBadge =
      options.sandboxBadge || (this.doc && this.doc.getElementById("sandboxBadge"));
    this.raf = options.requestAnimationFrame
      ? options.requestAnimationFrame.bind(options.window || globalThis)
      : this.win && this.win.requestAnimationFrame
        ? this.win.requestAnimationFrame.bind(this.win)
        : null;
    this.caf = options.cancelAnimationFrame
      ? options.cancelAnimationFrame.bind(options.window || globalThis)
      : this.win && this.win.cancelAnimationFrame
        ? this.win.cancelAnimationFrame.bind(this.win)
        : null;
    this.now = options.now || (() => performance.now());
    this.factories = options.factories || null;
    this.presentationRuntime = options.presentationRuntime || null;
    this.audio = options.audio || new CabinetAudio();
    this.store = safeStorage(
      options.storage ||
        (typeof localStorage !== "undefined" ? localStorage : null),
    );
    this.leaderboard = options.leaderboard !== undefined
      ? options.leaderboard
      : this.doc
        ? require("./renderer/hosa/leaderboard").createDefaultLeaderboard({ devMode: this.devMode })
        : null;
    this.countdown = null;
    this.gameOverRemaining = 0;
    this.resumePhase = "playing";
    this.goRemaining = 0;
    this.phase = "menu";
    this.games = options.games || GAMES;
    this.selected = 0;
    this.game = null;
    this.gameInfo = null;
    this.accumulator = 0;
    this.lastTime = null;
    this.frame = null;
    this.previousButtons = controlState(null);
    this.awaitRelease = true;
    this.controllerMissing = false;
    this.pending = { actionPressed: false, specialPressed: false };
    this.reward = null;
    this.rewardSelected = 0;
    this.rewardRequested = false;
    this.rewardRenderSignature = null;
    this.sessionKind = "scored";
    this.confirmFrom = null;
    this._lastUp = false;
    this._lastDown = false;
    this._lastLeft = false;
    this._lastRight = false;
    this.keys = new Set();
    this.keyEdges = new Set();
    this.lastResult = null;
    this.runId = null;
    this.runUnscored = false;
    this.leaderboardRows = [];
    this.ownRank = null;
    this.nameEntry = null;
    this.sandbox = null;
    this.sandboxFrom = null;
    this.inputSource = "gamepad";
    this.firstMenuShown = false;
    this.viewAnimations = new Set();
    this.leavingView = null;
    this.motionPreview = this.devMode && typeof process !== "undefined" && process.env.HOSA_MOTION_PREVIEW === "full";
    if (this.motionPreview && this.doc?.documentElement) this.doc.documentElement.dataset.motionPreview = "full";
    this.reduceMotion = false;
    this.motionQuery = null;
    this._setupMotionPreference(options.matchMedia);
    this._bindInput();
    this._ledIdle();
    this.showMenu();
  }
  _ledIdle() {
    try {
      require("electron").ipcRenderer.send("led:set-mode", { mode: "idle" });
    } catch {}
  }
  _bindInput() {
    if (!this.doc || !this.doc.addEventListener) return;
    if (this.devMode) {
      this.doc.addEventListener("keydown", (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || !DEV_KEY_CODES.has(e.code)) return;
        if (e.code === "F2") {
          e.preventDefault?.();
          if (!e.repeat) this.toggleSandbox();
          return;
        }
        const target = e.target;
        const formControl = target?.closest?.(".sandbox-panel");
        if (formControl) return;
        e.preventDefault?.();
        this._setInputSource("keyboard");
        if (!this.keys.has(e.code)) this.keyEdges.add(e.code);
        this.keys.add(e.code);
      });
      this.doc.addEventListener("keyup", (e) => {
        if (DEV_KEY_CODES.has(e.code)) this.keys.delete(e.code);
      });
    }
    this.doc.addEventListener("visibilitychange", () => {
      if (this.doc.hidden) this._focusLost();
    });
    this.doc.addEventListener("blur", () => this._focusLost());
    if (this.win && this.win.addEventListener)
      this.win.addEventListener("blur", () => this._focusLost());
  }
  _setInputSource(source) {
    if (this.inputSource === source) return;
    this.inputSource = source;
    // Development keys emulate cabinet buttons, including their visual feedback.
  }
  _setupMotionPreference(matchMedia) {
    const query =
      matchMedia ||
      (this.win && this.win.matchMedia
        ? this.win.matchMedia.bind(this.win)
        : typeof window !== "undefined" && window.matchMedia
          ? window.matchMedia.bind(window)
          : null);
    if (!query) return;
    this.motionQuery = query("(prefers-reduced-motion: reduce)");
    this.reduceMotion = Boolean(this.motionQuery.matches) && !this.motionPreview;
    const change = (event) => {
      this.reduceMotion = Boolean(event.matches) && !this.motionPreview;
      this._cancelViewAnimations();
    };
    if (this.motionQuery.addEventListener) this.motionQuery.addEventListener("change", change);
    else if (this.motionQuery.addListener) this.motionQuery.addListener(change);
  }
  _focusLost() {
    this.accumulator = 0;
    this.lastTime = null;
    this.keys.clear();
    this.keyEdges.clear();
    if (["playing", "tutorial", "countdown"].includes(this.phase)) this.pause();
  }
  _pad0() {
    const pads =
      this.nav && typeof this.nav.getGamepads === "function"
        ? this.nav.getGamepads()
        : [];
    return (pads && pads[0]) || null;
  }
  _keyboardInput() {
    if (this.keys.size || this.keyEdges.size) this._setInputSource("keyboard");
    const hit = (c) => this.keyEdges.delete(c);
    const nav =
      hit("ArrowUp") || hit("KeyW")
        ? -1
        : hit("ArrowDown") || hit("KeyS")
          ? 1
          : 0;
    const rewardNav =
      hit("ArrowLeft") || hit("KeyA")
        ? -1
        : hit("ArrowRight") || hit("KeyD")
          ? 1
          : 0;
    return {
      moveX:
        (this.keys.has("ArrowLeft") || this.keys.has("KeyA") ? -1 : 0) +
        (this.keys.has("ArrowRight") || this.keys.has("KeyD") ? 1 : 0),
      moveY:
        (this.keys.has("ArrowUp") || this.keys.has("KeyW") ? -1 : 0) +
        (this.keys.has("ArrowDown") || this.keys.has("KeyS") ? 1 : 0),
      actionDown: this.keys.has("Space"),
      actionPressed: hit("Space"),
      specialPressed: hit("KeyX"),
      startPressed: hit("KeyP"),
      backPressed: hit("Escape"),
      yPressed: hit("KeyM"),
      nav,
      rewardNav,
    };
  }
  _mergeInput(a, b) {
    return {
      ...a,
      moveX: b.moveX || a.moveX,
      moveY: b.moveY || a.moveY,
      actionDown: a.actionDown || b.actionDown,
      actionPressed: a.actionPressed || b.actionPressed,
      specialPressed: a.specialPressed || b.specialPressed,
      startPressed: a.startPressed || b.startPressed,
      backPressed: a.backPressed || b.backPressed,
      yPressed: a.yPressed || b.yPressed,
      nav: b.nav || a.nav,
      rewardNav: b.rewardNav || a.rewardNav,
    };
  }
  _readInput() {
    const pad = this._pad0(),
      current = controlState(pad),
      was = this.previousButtons;
    this.previousButtons = current;
    if (!pad) {
      this.controllerMissing = !this.devMode;
      this.awaitRelease = true;
      this._lastUp = this._lastDown = this._lastLeft = this._lastRight = false;
      if (!this.devMode && ["playing", "tutorial", "countdown", "upgrade"].includes(this.phase)) this.pause();
      if (!this.devMode || this.phase === "playing") this.notice(
        this.devMode
          ? "DEV MODE · KEYBOARD TESTING"
          : "CONTROLLER 1 NOT CONNECTED",
      );
      return this.devMode ? this._keyboardInput() : NO_INPUT;
    }
    if (!this.keys.size && !this.keyEdges.size) this._setInputSource("gamepad");
    if (this.doc && this.doc.body)
      this.doc.body.classList.add("controller-active");
    if (this.controllerMissing) {
      this.controllerMissing = false;
      this.awaitRelease = true;
      this.notice("CONTROLLER 1 RECONNECTED — RELEASE BUTTONS");
    }
    const anyHeld =
      current.some(Boolean) ||
      Math.abs(axis(pad, 0)) > 0 ||
      Math.abs(axis(pad, 1)) > 0;
    if (this.awaitRelease) {
      this._lastUp = this._lastDown = this._lastLeft = this._lastRight = false;
      if (!anyHeld) {
        this.awaitRelease = false;
        if (this.phase === "paused") this.notice("PRESS A TO RESUME");
      }
      return this.devMode ? this._keyboardInput() : NO_INPUT;
    }
    const edge = (n) => current[n] && !was[n],
      y = axis(pad, 1),
      x = axis(pad, 0);
    const nav =
      edge(12) || edge(14) || (y < -0.7 && !this._lastUp)
        ? -1
        : edge(13) || edge(15) || (y > 0.7 && !this._lastDown)
          ? 1
          : 0;
    this._lastUp = y < -0.7;
    this._lastDown = y > 0.7;
    const rewardNav =
      edge(14) || (x < -0.7 && !this._lastLeft)
        ? -1
        : edge(15) || (x > 0.7 && !this._lastRight)
          ? 1
          : 0;
    this._lastLeft = x < -0.7;
    this._lastRight = x > 0.7;
    const input = {
      moveX: axis(pad, 0) || (current[14] ? -1 : current[15] ? 1 : 0),
      moveY: y || (current[12] ? -1 : current[13] ? 1 : 0),
      actionDown: current[0],
      actionPressed: edge(0),
      specialPressed: edge(2),
      startPressed: edge(9),
      backPressed: edge(1),
      yPressed: edge(3),
      nav,
      rewardNav,
    };
    return this.devMode
      ? this._mergeInput(input, this._keyboardInput())
      : input;
  }
  notice(m) {
    if (this.status) {
      if (this.status.dataset) {
        this.status.dataset.inputSource = this.inputSource;
        this.status.dataset.kind = m.startsWith("DEV MODE") ? "dev" : "notice";
      }
      this.status.textContent = m;
      this.status.classList.add("show");
    }
  }
  clearNotice() {
    if (this.status) this.status.classList.remove("show");
  }
  _syncSandboxBadge() {
    if (!this.sandboxBadge) return;
    const visible = this.devMode && this.runUnscored && ["playing", "countdown", "paused", "upgrade", "sandbox"].includes(this.phase);
    this.sandboxBadge.textContent = visible ? "SANDBOX · UNSCORED" : "";
    this.sandboxBadge.classList.toggle("show", visible);
  }
  toggleSandbox() {
    if (!this.devMode) return false;
    if (this.phase === "sandbox") {
      this.cancelSandbox();
      return true;
    }
    if (this.sessionKind === "tutorial") {
      this.notice("SANDBOX UNAVAILABLE IN PRACTICE");
      return false;
    }
    if (!["playing", "paused", "upgrade"].includes(this.phase) || !this.game) return false;
    this.sandboxFrom = this.phase;
    this.sandbox = sandboxState(this.game.getSnapshot?.() || {});
    this.game.pause?.();
    this.phase = "sandbox";
    this.awaitRelease = true;
    this.pending.actionPressed = this.pending.specialPressed = false;
    this.keys.clear();
    this.keyEdges.clear();
    if (this.doc?.body) this.doc.body.classList.remove("playing");
    this.clearNotice();
    this._renderSandbox();
    this._syncSandboxBadge();
    return true;
  }
  _renderSandbox(error = "") {
    if (!this.sandbox) return;
    const catalog = sandboxCatalog();
    const weaponOptions = (tier) => catalog.weapons
      .filter((weapon) => weapon.tier === tier)
      .map((weapon) => `<option value="${this._escape(weapon.id)}"${weapon.id === this.sandbox.weaponId ? " selected" : ""}>${this._escape(weapon.path || weapon.name)}</option>`)
      .join("");
    const abilityOptions = catalog.abilities
      .map((ability) => `<option value="${this._escape(ability.id)}"${ability.id === this.sandbox.abilityId ? " selected" : ""}>${this._escape(ability.name)}</option>`)
      .join("");
    const perkFields = catalog.perks.map((perk) => {
      const rank = Math.max(0, Math.min(perk.maxRank, Number(this.sandbox.perks[perk.id]) || 0));
      const ranks = Array.from({ length: perk.maxRank + 1 }, (_, value) => `<option value="${value}"${value === rank ? " selected" : ""}>${value}</option>`).join("");
      return `<label class="sandbox-field"><span>${this._escape(perk.name)}</span><select name="perk.${this._escape(perk.id)}">${ranks}</select></label>`;
    }).join("");
    const bossPhaseOptions = [{ id: "", name: "Current boss state" }, ...catalog.bossPhases]
      .map((phase) => `<option value="${this._escape(phase.id)}"${phase.id === this.sandbox.bossPhase ? " selected" : ""}>${this._escape(phase.name)}</option>`)
      .join("");
    const bossPatternOptions = [{ id: "", name: "Natural pattern order" }, ...catalog.bossPatterns]
      .map((pattern) => `<option value="${this._escape(pattern.id)}"${pattern.id === this.sandbox.bossPattern ? " selected" : ""}>${this._escape(pattern.name)}</option>`)
      .join("");
    const currentWave = Number(this.game?.getSnapshot?.()?.wave) || 1;
    this._replaceView(
      `<div class="mania sandbox-view"><form class="sandbox-panel" id="sandboxForm" aria-labelledby="sandboxTitle"><header><p>DEVELOPMENT TOOL · CURRENT RUN</p><h1 id="sandboxTitle">RUN SANDBOX</h1><strong>Boss state selections reset the encounter. Applying permanently marks this run unscored.</strong></header><div class="sandbox-groups"><fieldset><legend>Loadout</legend><label class="sandbox-field"><span>Weapon path or evolution</span><select name="weaponId"><optgroup label="STARTER WEAPONS">${weaponOptions(0)}</optgroup><optgroup label="EVOLVED WEAPONS">${weaponOptions(2)}</optgroup><optgroup label="ADVANCED WEAPONS">${weaponOptions(3)}</optgroup></select></label><label class="sandbox-field"><span>Ability</span><select name="abilityId">${abilityOptions}</select></label></fieldset><fieldset><legend>Perk ranks</legend><div class="sandbox-perks">${perkFields}</div></fieldset><fieldset><legend>Encounter</legend><p class="sandbox-hint">5, 15… MINIBOSS · 10, 20… MAJOR BOSS</p><label class="sandbox-field"><span>Start at wave (leave blank to keep encounter)</span><input name="wave" type="number" min="1" max="1000" inputmode="numeric" value="${this._escape(this.sandbox.wave)}" placeholder="Current ${currentWave}" /></label><label class="sandbox-field"><span>Boss phase (boss waves only)</span><select name="bossPhase">${bossPhaseOptions}</select></label><label class="sandbox-field"><span>Boss pattern (boss waves only)</span><select name="bossPattern">${bossPatternOptions}</select></label><label class="sandbox-check"><input name="restartWave" type="checkbox"${this.sandbox.restartWave ? " checked" : ""} /><span>Restart current wave</span></label><label class="sandbox-check"><input name="invincible" type="checkbox"${this.sandbox.invincible ? " checked" : ""} /><span>Invincible</span></label></fieldset></div><p class="sandbox-error" role="alert">${this._escape(error)}</p><footer><button type="submit">APPLY TO RUN</button><button type="button" data-sandbox-cancel>CANCEL</button><span>F2 CANCELS</span></footer></form></div>`,
      { panel: true },
    );
    const form = this.screen?.querySelector?.("#sandboxForm");
    form?.addEventListener?.("submit", (event) => {
      event.preventDefault();
      const elements = form.elements;
      const perks = {};
      catalog.perks.forEach((perk) => { perks[perk.id] = Number(elements.namedItem(`perk.${perk.id}`)?.value) || 0; });
      this.applySandbox({
        weaponId: elements.namedItem("weaponId")?.value,
        abilityId: elements.namedItem("abilityId")?.value,
        perks,
        wave: elements.namedItem("wave")?.value,
        restartWave: Boolean(elements.namedItem("restartWave")?.checked),
        invincible: Boolean(elements.namedItem("invincible")?.checked),
        bossPhase: elements.namedItem("bossPhase")?.value,
        bossPattern: elements.namedItem("bossPattern")?.value,
      });
    });
    form?.querySelector?.("[data-sandbox-cancel]")?.addEventListener?.("click", () => this.cancelSandbox());
    form?.querySelector?.("select, input, button")?.focus?.();
  }
  applySandbox(values = {}) {
    if (!this.devMode || this.phase !== "sandbox" || !this.game?.applySandbox) return false;
    const catalog = sandboxCatalog();
    const weaponId = catalog.weapons.some((weapon) => weapon.id === values.weaponId) ? values.weaponId : this.sandbox.weaponId;
    const abilityId = catalog.abilities.some((ability) => ability.id === values.abilityId) ? values.abilityId : this.sandbox.abilityId;
    const perks = {};
    catalog.perks.forEach((perk) => {
      perks[perk.id] = Math.max(0, Math.min(perk.maxRank, Math.floor(Number(values.perks?.[perk.id]) || 0)));
    });
    const enteredWave = String(values.wave == null ? "" : values.wave).trim();
    const currentWave = Number(this.game.getSnapshot?.()?.wave) || 1;
    const wave = enteredWave ? Math.max(1, Math.min(1000, Math.floor(Number(enteredWave) || currentWave))) : values.restartWave ? currentWave : undefined;
    const change = { weaponId, abilityId, perks, invincible: Boolean(values.invincible) };
    if (wave != null) change.wave = wave;
    if (catalog.bossPhases.some((phase) => phase.id === values.bossPhase)) change.bossPhase = values.bossPhase;
    if (catalog.bossPatterns.some((pattern) => pattern.id === values.bossPattern)) change.bossPattern = values.bossPattern;
    if (!this.game.applySandbox(change)) {
      this._renderSandbox("The game could not apply those sandbox settings. Review the fields and retry.");
      return false;
    }
    this.runUnscored = true;
    this.reward = null;
    this.rewardRequested = false;
    this.sandbox = null;
    this.sandboxFrom = null;
    this.keys.clear();
    this.keyEdges.clear();
    this.awaitRelease = true;
    this.beginCountdown("playing");
    this._syncSandboxBadge();
    return true;
  }
  cancelSandbox() {
    if (this.phase !== "sandbox") return false;
    const destination = this.sandboxFrom || "paused";
    this.sandbox = null;
    this.sandboxFrom = null;
    this.phase = destination;
    this.keys.clear();
    this.keyEdges.clear();
    this.awaitRelease = true;
    this.pending.actionPressed = this.pending.specialPressed = false;
    if (destination === "playing") {
      if (this.doc?.body) this.doc.body.classList.add("playing");
      this._cancelViewAnimations();
      this._html("");
      this.game?.resume?.();
    } else if (destination === "upgrade") this._renderReward();
    else this._renderPaused();
    this._syncSandboxBadge();
    return true;
  }
  _html(s) {
    if (this.screen) this.screen.innerHTML = s;
  }
  _motionAllowed() {
    return !this.reduceMotion;
  }
  _cancelViewAnimations() {
    for (const animation of this.viewAnimations) animation.cancel();
    this.viewAnimations.clear();
    if (this.leavingView && this.leavingView.remove) this.leavingView.remove();
    this.leavingView = null;
  }
  _animate(element, keyframes, duration, delay = 0) {
    if (!element || !element.animate || !duration) return null;
    const animation = element.animate(keyframes, {
      duration,
      delay,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      fill: "backwards",
    });
    this.viewAnimations.add(animation);
    animation.finished.catch(() => {}).then(() => {
      this.viewAnimations.delete(animation);
      animation.cancel();
    });
    return animation;
  }
  _stripIds(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  }
  _replaceView(html, { entrance = false, boot = false, breakthrough = false, panel = false, results = false, reward = false } = {}) {
    if (!this.screen || !this.screen.querySelector) return this._html(html);
    this._cancelViewAnimations();
    const old = this.screen.querySelector(".mania");
    let leaving = null;
    if (old && old.cloneNode && this._motionAllowed() && !reward) {
      leaving = old.cloneNode(true);
      this._stripIds(leaving);
      leaving.setAttribute("aria-hidden", "true");
      leaving.style.pointerEvents = "none";
    }
    this._html(html);
    if (leaving) {
      this.screen.appendChild(leaving);
      this.leavingView = leaving;
      const exit = this._animate(
        leaving,
        [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(8px)" }],
        MOTION.exit,
      );
      if (exit) exit.finished.catch(() => {}).then(() => {
        if (this.leavingView === leaving) this.leavingView = null;
        leaving.remove();
      });
    }
    const view = this.screen.querySelector(".mania");
    if (!view) return;
    view.dataset.inputSource = this.inputSource;
    if (this.reduceMotion) {
      this._animate(view, [{ opacity: 0 }, { opacity: 1 }], MOTION.reduced);
      return;
    }
    if (!this._motionAllowed()) return;
    if (results) {
      view.querySelectorAll(".result-row").forEach((row, index) => {
        this._animate(
          row,
          [{ opacity: 0, transform: "scale(.95)" }, { opacity: 1, transform: "scale(1)" }],
          MOTION.view,
          index * (MOTION.fast / 3),
        );
      });
      return;
    }
    if (panel) {
      this._animate(
        view,
        [{ opacity: 0, transform: "scale(.95)" }, { opacity: 1, transform: "scale(1)" }],
        MOTION.view,
      );
      return;
    }
    if (reward) {
      view.querySelectorAll(".reward-card-content").forEach((card, index) => {
        this._animate(
          card,
          [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }],
          MOTION.view,
          index * (MOTION.fast / 3),
        );
      });
      return;
    }
    if (entrance && !boot)
      this._animate(view, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], MOTION.view);
    const scene = view.querySelector(".scene-stack, .scene");
    const title = view.querySelector(".title-ribbon");
    const content = view.querySelector(".mission-strip, .menu-copy");
    const strips = view.querySelector(".menu-strips");
    if (boot) {
      this._animate(scene, [{ opacity: 0, transform: "translateX(-64px)" }, { opacity: 1, transform: "translateX(0)" }], MOTION.view, 0);
      this._animate(title, [{ opacity: 0, transform: "translateX(-50%) translateY(-36px) skewX(-17deg)" }, { opacity: 1, transform: "translateX(-50%) skewX(-17deg)" }], MOTION.view, 40);
      this._animate(content, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }], MOTION.view, 80);
      this._animate(strips, [{ opacity: 0, transform: "translateX(48px)" }, { opacity: 1, transform: "translateX(0)" }], MOTION.view, 80);
    }
    if (breakthrough) {
      const accent = view.querySelector(".breakthrough-accent");
      this._animate(accent, [{ opacity: 0, transform: "translateX(18px) skewX(-17deg)" }, { opacity: 1, transform: "translateX(0) skewX(-17deg)" }], MOTION.accent);
    }
  }
  _scene(type) {
    return `<div class="scene ${type}">${menuArt(type)}</div>`;
  }
  _controls(s) {
    const prompts = s
      .replace(/<b>A<\/b>/g, '<img class="control-prompt" src="assets/hosa/prompts/a.png" alt="A" />')
      .replace(/<b>X<\/b>/g, '<img class="control-prompt" src="assets/hosa/prompts/x.png" alt="X" />');
    return `<p class="strip-controls">${prompts} &nbsp; <b>Y</b> SOUND</p>${this.devMode ? '<p class="dev-note">DEV · WASD/ARROWS MOVE · SPACE A · X PULSE · P PAUSE · ESC BACK</p>' : ""}`;
  }
  showMenu() {
    this.presentationRuntime?.reset();
    this.countdown = null;
    this.goRemaining = 0;
    this.gameOverRemaining = 0;
    this.reward = null;
    this.rewardRequested = false;
    this.phase = "menu";
    this.nameEntry = null;
    this.sandbox = null;
    this.sandboxFrom = null;
    this.gameInfo = null;
    if (this.doc && this.doc.body) this.doc.body.classList.remove("playing");
    this.accumulator = 0;
    this.pending.actionPressed = this.pending.specialPressed = false;
    this.awaitRelease = true;
    this.clearNotice();
    this._syncSandboxBadge();
    this._renderMenu();
  }
  _renderMenu() {
    const current = this.games[this.selected];
    const existing =
      this.screen && this.screen.querySelector
        ? this.screen.querySelector(".menu-view")
        : null;
    if (existing) return this._updateMenu(existing, current);
    const strips = this.games.map(
      (g, i) =>
        `<div class="menu-strip ${i === this.selected ? "selected" : ""}" data-game="${g.id}"><span>0${i + 1}</span><strong><small>${g.tag}</small>${g.title}</strong><em>${i === this.selected ? "A LEARN" : ""}</em></div>`,
    ).join("");
    this._replaceView(
      `<div class="mania menu-view menu-single"><div class="title-ribbon"><small>HOSA PRESENTS</small><strong>ARCADE</strong><em>SCIENCE IN MOTION</em></div><div class="scene-stack"><div class="scene cell" aria-hidden="false">${menuArt("cell")}</div>${this.games.some((game) => game.id === "labDash") ? '<div class="scene dash" aria-hidden="true">' + menuArt("dash") + "</div>" : ""}</div><div class="menu-copy"><p class="eyebrow">CABINET SELECT</p><h1>${current.title}</h1><p>${current.description}</p></div><div class="menu-strips">${strips}</div>${this._controls("<b>A</b> LEARN &nbsp; <b>X</b> PLAY")}</div>`,
      { entrance: true, boot: !this.firstMenuShown },
    );
    this.firstMenuShown = true;
  }
  _updateMenu(view, current) {
    view.dataset.inputSource = this.inputSource;
    view.querySelectorAll(".scene").forEach((scene) => {
      const active = scene.classList.contains(current.id === "cellDefender" ? "cell" : "dash");
      scene.setAttribute("aria-hidden", String(!active));
    });
    const copy = view.querySelector(".menu-copy");
    if (copy) {
      copy.querySelector("h1").textContent = current.title;
      copy.querySelector("p:not(.eyebrow)").textContent = current.description;
    }
    view.querySelectorAll(".menu-strip").forEach((strip, index) => {
      const selected = index === this.selected;
      strip.classList.toggle("selected", selected);
      strip.querySelector("em").textContent = selected ? "A LEARN" : "";
    });
  }
  _mission(content, title, kicker, controls, options = {}) {
    this._replaceView(
      `<div class="mania mission-view">${this._scene(this.gameInfo && this.gameInfo.id === "cellDefender" ? "cell" : "dash")}<div class="title-ribbon compact"><small>${kicker}</small><strong>${title}</strong></div><div class="mission-strip">${content}</div>${this._controls(controls)}</div>`,
      { entrance: !options.panel && !options.results, breakthrough: /RESEARCH BREAKTHROUGH/.test(content), ...options },
    );
  }
  _escape(value) {
    return String(value == null ? "" : value).replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }
  _pendingReward() {
    const state = this.game && this.game.getSnapshot ? this.game.getSnapshot() : null;
    return state && state.pendingReward && Array.isArray(state.pendingReward.offers)
      ? state.pendingReward
      : null;
  }
  _showReward(reward = this._pendingReward()) {
    if (!reward) return false;
    const offers = reward.offers.filter(Boolean);
    if (!offers.length) return false;
    this.reward = { ...reward, offers };
    this.rewardSelected = Math.max(0, Math.min(this.rewardSelected, offers.length - 1));
    this.rewardRequested = false;
    this.phase = "upgrade";
    this.accumulator = 0;
    this.pending.actionPressed = this.pending.specialPressed = false;
    this.awaitRelease = true;
    this.game?.pause?.();
    if (this.doc && this.doc.body) this.doc.body.classList.remove("playing");
    this._renderReward();
    return true;
  }
  _updateRewardSelection() {
    const view = this.screen?.querySelector?.(".reward-view");
    const cards = view?.querySelectorAll?.(".reward-card");
    if (
      !cards ||
      cards.length !== this.reward?.offers?.length ||
      this.rewardRenderSignature !== this._rewardSignature(this.reward)
    ) return false;
    cards.forEach((card, index) => {
      const selected = index === this.rewardSelected;
      card.classList?.toggle("selected", selected);
      card.setAttribute?.("aria-current", selected ? "true" : "false");
      card.setAttribute?.("aria-selected", selected ? "true" : "false");
      const label = card.querySelector?.("[data-reward-selection]");
      if (label) label.textContent = selected ? "SELECTED" : "";
    });
    return true;
  }
  _rewardSignature(reward) {
    return JSON.stringify((reward?.offers || []).map((offer) => [
      offer.id,
      offer.title,
      offer.description,
      offer.category,
      offer.detail,
      offer.preview,
    ]));
  }
  _renderReward({ replaceCards = false } = {}) {
    const reward = this.reward;
    if (!reward) return;
    if (!replaceCards && this._updateRewardSelection()) return;
    const offers = reward.offers;
    const category = (offer) => this._escape(String(offer.category || "perk").toUpperCase());
    const cards = offers.map((offer, index) => {
      const selected = index === this.rewardSelected;
      const comparison = offer.detail || offer.preview || "BUILD IMPROVEMENT";
      const weapon = WEAPONS[offer.preview] || WEAPONS[offer.id];
      const advanced = weapon && Number(weapon.tier) >= 3;
      const path = advanced ? weaponPath(weapon.id) : "";
      const tradeoff = offer.tradeoff || offer.detail || (weapon?.role ? weapon.role : comparison);
      return `<article class="reward-card ${selected ? "selected" : ""}" role="option" aria-label="${this._escape(offer.title || offer.id || "Upgrade")}" aria-current="${selected ? "true" : "false"}" aria-selected="${selected ? "true" : "false"}"><div class="reward-card-content"><div class="reward-card-head"><span>${category(offer)}</span><b data-reward-selection>${selected ? "SELECTED" : ""}</b></div>${advanced ? `<div class="advanced-kicker">ADVANCED EVOLUTION</div><small class="weapon-path">${this._escape(path)}</small>` : ""}${rewardArt(offer)}<h2>${this._escape(offer.title || offer.id || "UPGRADE")}</h2><p>${this._escape(offer.description || "Strengthen your immune response.")}</p><small>${this._escape(tradeoff)}</small></div></article>`;
    }).join("");
    const current = this.game && this.game.getSnapshot ? this.game.getSnapshot() : {};
    const weapon = current?.weaponName || current?.weapon || current?.hud?.weapon || "STANDARD EMITTER";
    const ability = current?.abilityName || current?.ability || "PULSE";
    const perks = current?.perks || current?.build?.perks || [];
    const perkText = Array.isArray(perks) && perks.length
      ? perks.map((perk) => typeof perk === "string" ? perk : `${perk.title || perk.id || "PERK"}${Number(perk.rank) > 1 ? ` ×${perk.rank}` : ""}`).join(" · ")
      : perks && typeof perks === "object"
        ? Object.entries(perks).filter(([, value]) => Number(value) > 0).map(([name, value]) => `${String(name).toUpperCase()}${Number(value) > 1 ? ` ×${value}` : ""}`).join(" · ") || "NO PERKS YET"
        : "NO PERKS YET";
    const rerolls = Math.max(0, Number(reward.rerollsRemaining) || 0);
    const nav = offers.length > 1 ? "D-PAD / STICK SELECT" : "SELECT UPGRADE";
    const rerollControl = rerolls ? ` &nbsp; <b>X</b> REROLL (${rerolls} FREE)` : "";
    const skipLabel = reward.canSkip ? "KEEP BUILD" : "EXIT";
    const devControls = `DEV · ARROWS SELECT · SPACE CONFIRM${rerolls ? " · X REROLL" : ""} · ESC ${skipLabel}`;
    this._replaceView(
      `<div class="mania reward-view"><div class="reward-grid-bg" aria-hidden="true"></div><header class="reward-header"><p>WAVE ${this._escape(reward.wave || 1)} · BUILD DECISION</p><h1>CHOOSE AN UPGRADE</h1><span>${this._escape(reward.context === "tutorial" ? "PRACTICE LOADOUT" : "NO TIMER")}</span></header><section class="reward-cards" role="listbox" aria-label="Upgrade offers">${cards}</section><aside class="reward-build"><strong>CURRENT BUILD</strong><span>WEAPON ${this._escape(weapon)}</span><span>X ABILITY ${this._escape(ability)}</span><span>PERKS ${this._escape(perkText)}</span></aside><p class="reward-controls">${nav} &nbsp; <b>A</b> CONFIRM${rerollControl} &nbsp; <b>B</b> ${skipLabel} &nbsp; <b>START</b> PAUSE</p>${this.devMode ? `<p class="dev-note">${devControls}</p>` : ""}</div>`,
      { entrance: true, reward: true },
    );
    this.rewardRenderSignature = this._rewardSignature(reward);
  }
  _resolveReward(method, cardId) {
    if (!this.game || !this.reward) return false;
    const accepted = method === "choose"
      ? this.game.chooseUpgrade?.(cardId)
      : method === "reroll"
        ? this.game.rerollUpgrade?.()
        : this.game.skipUpgrade?.();
    if (!accepted) {
      const pending = this._pendingReward();
      if (pending) { this.reward = pending; this._renderReward(); }
      return false;
    }
    const pending = this._pendingReward();
    if (pending) {
      this.reward = pending;
      this.rewardSelected = Math.min(this.rewardSelected, pending.offers.length - 1);
      this.awaitRelease = true;
      this._renderReward({ replaceCards: method === "reroll" });
      return true;
    }
    const context = this.reward.context;
    this.reward = null;
    this.rewardSelected = 0;
    this.awaitRelease = true;
    this.pending.actionPressed = this.pending.specialPressed = false;
    if (context === "tutorial" || this.sessionKind === "tutorial") {
      this._cancelViewAnimations();
      this._html("");
      this.phase = "tutorial";
      if (this.doc && this.doc.body) this.doc.body.classList.add("playing");
      this.game.resume?.();
      this.notice("PRACTICE · START OPTIONS · B MENU");
    } else {
      this.beginCountdown("playing");
    }
    return true;
  }
  _checkReward() {
    const reward = this._pendingReward();
    if (!reward) {
      this.rewardRequested = false;
      return false;
    }
    if (["gameover", "ended", "confirm"].includes(this.phase)) return false;
    if (this.phase === "upgrade") {
      this.reward = reward;
      return false;
    }
    return this._showReward(reward);
  }
  showInstructions() {
    const g = this.games[this.selected];
    this.gameInfo = g;
    this.phase = "instructions";
    this.pending.actionPressed = false;
    this.awaitRelease = true;
    const directions =
      g.id === "cellDefender"
        ? "Move with <b>XY</b>. The emitter auto-fires. Tap <b>X</b> for a pulse; hold <b>A</b> to focus and move slower."
        : "Tap <b>A</b> to jump. Hold <b>A</b> to rise in ship/wave mode; release to descend. Three shared attempts. Clear three stages to bank a breakthrough and begin a faster circuit. Retry the current stage; attempts never refill. Collect samples to boost your score.";
    this._mission(
      `<p class="eyebrow">${g.tag} MISSION</p><h1>${g.title}</h1><p>${directions}</p>`,
      "READY?",
      "MISSION BRIEF",
      "<b>A</b> START &nbsp; <b>B</b> MENU",
    );
  }
  _loadGame(info) {
    return this.factories && this.factories[info.id]
      ? this.factories[info.id]
      : require(info.module).createGame;
  }
  startSession(sessionKind = "scored") {
    if (this.game) this.game.dispose();
    this.gameInfo = this.games[this.selected];
    this.presentationRuntime?.reset();
    this.lastResult = null;
    this.sessionKind = sessionKind;
    this.runUnscored = false;
    this.runId = sessionKind === "scored" ? createRunId() : null;
    this.leaderboardRows = [];
    this.ownRank = null;
    this.nameEntry = null;
    this.sandbox = null;
    this.sandboxFrom = null;
    this.reward = null;
    this.rewardSelected = 0;
    this.rewardRequested = false;
    this.pending.actionPressed = this.pending.specialPressed = false;
    this.game = this._loadGame(this.gameInfo)({
      canvas: this.canvas,
      presentation: this.presentationRuntime ? (state) => this.presentationRuntime.present(this.gameInfo.id, state) : undefined,
      audio: this.audio,
      random: Math.random,
      sessionKind,
      devMode: this.devMode,
      reducedMotion: () => this.reduceMotion,
      onEvent: (e) => this._event(e),
    });
    this.game.startSession();
    this.phase = sessionKind === "tutorial" ? "tutorial" : "playing";
    if (this.doc && this.doc.body) this.doc.body.classList.add("playing");
    this.accumulator = 0;
    this.awaitRelease = true;
    this.devMode
      ? this.notice("DEV MODE · KEYBOARD TESTING")
      : this.clearNotice();
    this._cancelViewAnimations();
    this._html("");
    this._syncSandboxBadge();
    if (sessionKind === "scored") this.beginCountdown("playing");
    else this.notice("PRACTICE · START OPTIONS · B MENU");
  }
  beginCountdown(target = "playing") {
    if (!this.game) return;
    if (this.doc && this.doc.body) this.doc.body.classList.add("playing");
    this.game.pause();
    this.countdown = { remaining: 3, target, released: false, shown: null };
    this.phase = "countdown";
    this.accumulator = 0;
    this.pending.actionPressed = this.pending.specialPressed = false;
    this.clearNotice();
    this._cancelViewAnimations();
    this._renderBeat("RELEASE BUTTONS", "GET READY");
    this.game.render();
  }
  _renderBeat(value, hint = "GET READY") {
    this._html(`<div class="arcade-beat"><p>${hint}</p><strong>${value}</strong></div>`);
    const el = this.screen?.querySelector?.(".arcade-beat strong");
    this._animate(el, this.reduceMotion ? [{opacity:0},{opacity:1}] : [{opacity:0,transform:"scale(.92) translateY(12px)"},{opacity:1,transform:"scale(1) translateY(0)"}], 200);
  }
  _event(e) {
    if (!e) return;
    if (e.type === "sandboxApplied") {
      this.runUnscored = true;
      this._syncSandboxBadge();
      return;
    }
    // The model asks for the reward; the snapshot is the source of truth after
    // its step has returned, so stale events cannot replace a newer offer.
    if (e.type === "upgradeRequested") {
      this.rewardRequested = true;
      return;
    }
    if (e.type === "tutorialComplete" && this.phase === "tutorial") { this.startSession(); return; }
    if (e.type === "ready" && this.phase === "playing") { this.beginCountdown(); return; }
    if (e.type !== "sessionEnd" || ["gameover", "nameEntry", "ended"].includes(this.phase) || this.sessionKind === "tutorial") return;
    const finishedGame = this.game?.getSnapshot?.() || {};
    if (finishedGame.sandbox) this.runUnscored = true;
    this.lastResult = { ...(e.result || {}) };
    if (!this.lastResult.build && finishedGame.build) this.lastResult.build = finishedGame.build;
    const id = this.gameInfo.id;
    if (!this.runUnscored) {
      this.store.set(
        `${id}.best`,
        Math.max(
          Number(this.store.get(`${id}.best`, 0)) || 0,
          Number(this.lastResult.score) || 0,
        ),
      );
      if (id === "labDash")
        this.store.set(
          "labDash.bestProgress",
          Math.max(
            Number(this.store.get("labDash.bestProgress", 0)) || 0,
            Number(this.lastResult.bestProgress) || 0,
          ),
        );
    }
    this.phase = "gameover";
    this.countdown = null;
    this.goRemaining = 0;
    this.gameOverRemaining = 1.5;
    this.clearNotice();
    if (this.doc && this.doc.body) this.doc.body.classList.remove("playing");
    if (this.game) this.game.dispose();
    this.game = null;
    this._cancelViewAnimations();
    this._renderBeat("GAME OVER", `${this.runUnscored ? "UNSCORED · " : ""}FINAL SCORE ${this.lastResult.score || 0}`);
    this._syncSandboxBadge();
  }
  showNameEntry() {
    this.phase = "nameEntry";
    this.nameEntry = { name: "", cursor: 0, saving: false, error: "" };
    this.awaitRelease = true;
    this.keys.clear();
    this.keyEdges.clear();
    this._renderNameEntry();
    this._syncSandboxBadge();
  }
  _renderNameEntry() {
    const state = this.nameEntry;
    if (!state) return;
    const existing = this.screen?.querySelector?.(".name-entry-view");
    if (existing) {
      const output = existing.querySelector?.(".entered-name");
      if (output) output.textContent = state.name || "_";
      const status = existing.querySelector?.(".name-entry-status");
      if (status) {
        status.textContent = state.saving ? "SAVING SCORE…" : state.error ? state.error : `${state.name.length}/16 CHARACTERS`;
        status.classList?.toggle("error", Boolean(state.error));
      }
      existing.querySelectorAll?.("[data-name-key]")?.forEach((button, index) => {
        const selected = index === state.cursor;
        const disabled = NAME_KEYS[index] === "DONE" && !state.name.trim();
        button.classList?.toggle("selected", selected);
        button.classList?.toggle("disabled", disabled);
        button.setAttribute?.("aria-current", selected ? "true" : "false");
        button.setAttribute?.("aria-disabled", disabled ? "true" : "false");
        if (selected && this.devMode) button.focus?.();
      });
      return;
    }
    const keys = NAME_KEYS.map((key, index) => {
      const label = key;
      return `<button type="button" class="name-key ${index === state.cursor ? "selected" : ""} ${key === "DONE" && !state.name.trim() ? "disabled" : ""}" data-name-key="${this._escape(key)}" aria-current="${index === state.cursor ? "true" : "false"}"${key === "DONE" && !state.name.trim() ? " aria-disabled=\"true\"" : ""}${this.devMode ? "" : ' tabindex="-1"'}>${this._escape(label)}</button>`;
    }).join("");
    const status = state.saving ? "SAVING SCORE…" : state.error ? state.error : `${state.name.length}/16 CHARACTERS`;
    this._replaceView(
      `<div class="mania name-entry-view"><section class="name-entry-panel" aria-labelledby="nameEntryTitle"><header><p>FINAL SCORE ${this._escape(this.lastResult?.score || 0)}</p><h1 id="nameEntryTitle">ENTER YOUR NAME</h1></header><output class="entered-name" aria-live="polite">${state.name ? this._escape(state.name) : "_"}</output><div class="name-keyboard" role="group" aria-label="On-screen name keyboard" style="--name-columns:${NAME_COLUMNS}">${keys}</div><p class="name-entry-status ${state.error ? "error" : ""}" role="status">${this._escape(status)}</p><footer>D-PAD / STICK MOVE &nbsp; <b>A</b> SELECT &nbsp; <b>B</b> DELETE</footer></section></div>`,
      { panel: true },
    );
    if (this.devMode) this.screen?.querySelectorAll?.("[data-name-key]")?.forEach((button, index) => {
      button.addEventListener?.("click", () => {
        if (state.saving) return;
        state.cursor = index;
        this._activateNameKey();
      });
    });
    if (this.devMode) this.screen?.querySelector?.(".name-key.selected")?.focus?.();
  }
  _moveNameEntry(dx, dy) {
    if (!this.nameEntry || this.nameEntry.saving) return;
    this.nameEntry.cursor = moveNameCursor(this.nameEntry.cursor, dx, dy);
    this.nameEntry.error = "";
    this._renderNameEntry();
  }
  _activateNameKey() {
    const state = this.nameEntry;
    if (!state || state.saving) return;
    const key = NAME_KEYS[state.cursor];
    if (key === "DONE") {
      if (state.name.trim()) this.saveNameEntry();
      return;
    }
    state.name = applyNameKey(state.name, key);
    state.error = "";
    this._renderNameEntry();
  }
  _deleteNameCharacter() {
    if (!this.nameEntry || this.nameEntry.saving) return;
    this.nameEntry.name = applyNameKey(this.nameEntry.name, "BACK");
    this.nameEntry.error = "";
    this._renderNameEntry();
  }
  async saveNameEntry() {
    const state = this.nameEntry;
    const name = cleanName(state?.name).trim();
    if (!state || state.saving || !name) return false;
    state.name = name;
    state.saving = true;
    state.error = "";
    this._renderNameEntry();
    try {
      if (!this.leaderboard?.append || !this.leaderboard?.list) throw new Error("Leaderboard storage is unavailable");
      await this.leaderboard.append({
        runId: this.runId,
        name,
        score: Number(this.lastResult?.score) || 0,
        wave: Number(this.lastResult?.wave) || 1,
        createdAt: new Date().toISOString(),
        ...(this.lastResult?.build ? { build: this.lastResult.build } : {}),
      });
      this.leaderboardRows = await this.leaderboard.list();
      const index = this.leaderboardRows.findIndex((entry) => entry.runId === this.runId);
      this.ownRank = index >= 0 ? index + 1 : null;
      this.nameEntry = null;
      this.showResults();
      return true;
    } catch {
      if (this.nameEntry !== state) return false;
      state.saving = false;
      state.error = "SCORE COULD NOT BE SAVED · SELECT DONE TO RETRY";
      this._renderNameEntry();
      return false;
    }
  }
  showResults() {
    this.phase = "ended";
    this._syncSandboxBadge();
    const r = this.lastResult || {},
      best = this.store.get(`${this.gameInfo.id}.best`, 0),
      lab = this.gameInfo.id === "labDash";
    const bestProgress = Number(this.store.get("labDash.bestProgress", 0)) || 0;
    const bestProgressLabel = lab && r.bankedScore != null
      ? `BEST ${Math.floor(bestProgress)} CIRCUIT${Math.floor(bestProgress) === 1 ? "" : "S"} + ${Math.round((bestProgress % 1) * 100)}%`
      : `BEST PROGRESS ${Math.round(bestProgress * 100)}%`;
    const detail = lab && r.bankedScore != null
      ? `CIRCUITS CLEARED ${r.circuitsCleared || 0} · STAGES ${r.levelsCleared || 0}<br>BANKED ${r.bankedScore || 0} + CURRENT ${r.currentCircuitScore || 0}<br>ATTEMPTS LEFT ${r.attemptsRemaining ?? "—"}`
      : lab
      ? `PROGRESS ${r.progressScore || 0} · PICKUPS ${r.pickupScore || 0} ×${Number(r.multiplier || 1).toFixed(2)} = ${Math.round((r.pickupScore || 0) * Number(r.multiplier || 1))}<br>COMPLETION ${r.completionBonus || 0} · RETRIES ${r.attemptBonus || 0}<br>ATTEMPTS LEFT ${r.attemptsRemaining ?? "—"}`
      : `WAVE ${r.wave || 1} · SCORE ${r.score || 0}`;
    const top = this.leaderboardRows.slice(0, 10);
    const own = this.ownRank && this.ownRank > 10 ? this.leaderboardRows[this.ownRank - 1] : null;
    const rows = top.map((entry, index) => `<li${entry.runId === this.runId ? ' class="current"' : ""}><span>${index + 1}</span><strong>${this._escape(entry.name)}</strong><b>${this._escape(entry.score)}</b></li>`).join("");
    const ownRow = own ? `<li class="current own-rank"><span>${this.ownRank}</span><strong>${this._escape(own.name)}</strong><b>${this._escape(own.score)}</b></li>` : "";
    const leaderboard = rows ? `<section class="results-leaderboard" aria-label="Leaderboard"><h2>LEADERBOARD</h2><ol>${rows}${ownRow}</ol></section>` : "";
    this.awaitRelease = true;
    this._mission(
      `<div class="results-summary"><p class="eyebrow result-row">${this.runUnscored ? "SANDBOX · UNSCORED" : r.completed ? "RESEARCH BREAKTHROUGH" : "RUN COMPLETE"}</p><h1 class="result-row">${this.gameInfo.title}</h1><p class="result-score">${r.score || 0}</p><p class="result-detail result-row">${detail}<br>${this.runUnscored ? "THIS RUN IS EXCLUDED FROM RECORDS" : `BEST ${best}${lab ? ` · ${bestProgressLabel}` : ""}`}</p></div>${leaderboard}`,
      "RESULTS",
      "SESSION REPORT",
      "<b>A</b> RETURN TO SELECT",
      { results: true },
    );
  }
  pause() {
    if (!["playing", "tutorial", "countdown", "upgrade"].includes(this.phase)) return;
    this.resumePhase = this.phase === "countdown" ? this.countdown.target : this.phase;
    this.game.pause();
    this.countdown = null;
    this.phase = "paused";
    this._html("");
    this.pending.actionPressed = this.pending.specialPressed = false;
    this.awaitRelease = true;
    this._renderPaused();
    this._syncSandboxBadge();
  }
  _renderPaused() {
    if (this.resumePhase === "tutorial") {
      this._replaceView('<div class="arcade-beat practice-pause mania"><p>PRACTICE OPTIONS</p><strong>TAKE YOUR TIME</strong><p>A RESUME &nbsp; X SKIP TO GAME &nbsp; B MENU</p></div>', { panel: true });
      this.clearNotice();
    } else if (this.resumePhase === "upgrade") {
      this._replaceView('<div class="arcade-beat practice-pause mania"><p>UPGRADE PAUSED</p><strong>BUILD ON HOLD</strong><p>A RESUME &nbsp; B EXIT</p></div>', { panel: true });
      this.clearNotice();
    } else {
      this._replaceView('<div class="arcade-beat practice-pause mania"><p>GAME PAUSED</p><strong>PAUSED</strong><p>A RESUME &nbsp; B EXIT</p></div>', { panel: true });
      this.clearNotice();
    }
  }
  resume() {
    if (this.phase !== "paused" || this.controllerMissing) return;
    if (this.resumePhase === "upgrade") {
      this.phase = "upgrade";
      this.awaitRelease = true;
      this.pending.actionPressed = this.pending.specialPressed = false;
      this._renderReward();
      return;
    }
    this.beginCountdown(this.resumePhase);
  }
  confirmExit() {
    if (!["playing", "paused", "upgrade"].includes(this.phase)) return;
    this.confirmFrom = this.phase;
    if (this.phase === "playing") this.game.pause();
    this.phase = "confirm";
    this.pending.actionPressed = this.pending.specialPressed = false;
    this.awaitRelease = true;
    this._mission(
      '<p class="eyebrow">ABORT MISSION?</p><h1>END THIS RUN?</h1><p>Current score and attempt will be lost.</p>',
      "HOLD UP",
      "CONFIRM EXIT",
      "<b>A</b> END RUN &nbsp; <b>B</b> KEEP PLAYING",
      { panel: true },
    );
  }
  cancelExit() {
    if (this.phase !== "confirm") return;
    this.phase = this.confirmFrom || "playing";
    this.confirmFrom = null;
    this.pending.actionPressed = false;
    this.awaitRelease = true;
    this._cancelViewAnimations();
    this._html("");
    if (this.phase === "playing") this.game.resume();
    else if (this.phase === "upgrade") this._renderReward();
    else this.notice("PAUSED — PRESS A TO RESUME");
  }
  endRun() {
    if (this.game) {
      this.game.dispose();
      this.game = null;
    }
    this.showMenu();
  }
  _handle(i) {
    if (this.phase === "sandbox") return;
    if (i.yPressed)
      this.notice(this.audio.toggleMute() ? "SOUND OFF" : "SOUND ON");
    if (this.phase === "menu") {
      const strip = this.screen?.querySelector?.(".menu-strip.selected");
      strip?.classList.toggle("pressed", Boolean(i.actionDown || i.specialPressed));
      if (i.nav) {
        if (this.games.length > 1) {
          this.selected = (this.selected + i.nav + this.games.length) % this.games.length;
          this._renderMenu();
        }
      }
      if (i.specialPressed) this.startSession();
      else if (i.actionPressed) this.startSession("tutorial");
      return;
    }
    if (this.phase === "tutorial") {
      if (i.backPressed) return this.endRun();
      if (i.startPressed) return this.pause();
      this.notice("PRACTICE · START OPTIONS · B MENU");
      this.pending.actionPressed ||= i.actionPressed;
      this.pending.specialPressed ||= i.specialPressed;
      return;
    }
    if (this.phase === "upgrade") {
      if (i.startPressed) return this.pause();
      if (i.rewardNav && this.reward?.offers?.length > 1) {
        const count = this.reward.offers.length;
        this.rewardSelected = (this.rewardSelected + i.rewardNav + count) % count;
        this._renderReward();
      }
      if (i.actionPressed) return this._resolveReward("choose", this.reward?.offers?.[this.rewardSelected]?.id);
      if (i.specialPressed && Number(this.reward?.rerollsRemaining) > 0) return this._resolveReward("reroll");
      if (i.backPressed) {
        if (this.reward?.canSkip) return this._resolveReward("skip");
        return this.confirmExit();
      }
      return;
    }
    if (this.phase === "countdown") {
      if (i.backPressed) return this.endRun();
      if (i.startPressed) return this.pause();
      return;
    }
    if (this.phase === "instructions") {
      if (i.backPressed) this.showMenu();
      else if (i.actionPressed) this.startSession();
      return;
    }
    if (this.phase === "ended") {
      if (i.actionPressed) this.showMenu();
      return;
    }
    if (this.phase === "nameEntry") {
      if (this.nameEntry?.saving) return;
      if (i.rewardNav) this._moveNameEntry(i.rewardNav, 0);
      else if (i.nav) this._moveNameEntry(0, i.nav);
      if (i.backPressed) this._deleteNameCharacter();
      else if (i.actionPressed) this._activateNameKey();
      return;
    }
    if (this.phase === "confirm") {
      if (i.backPressed) this.cancelExit();
      else if (i.actionPressed) this.endRun();
      return;
    }
    if (this.phase === "paused") {
      if (this.resumePhase === "tutorial") {
        if (i.backPressed) this.endRun();
        else if (i.specialPressed && !this.controllerMissing) this.startSession();
        else if (i.actionPressed || i.startPressed) this.resume();
        return;
      }
      if (i.backPressed) this.confirmExit();
      else if (i.actionPressed || i.startPressed) this.resume();
      return;
    }
    if (this.phase === "playing") {
      if (i.startPressed) return this.pause();
      if (i.backPressed) return this.confirmExit();
      this.pending.actionPressed ||= i.actionPressed;
      this.pending.specialPressed ||= i.specialPressed;
    }
  }
  tick(time = this.now()) {
    const input = this._readInput();
    this._handle(input);
    let delta =
      this.lastTime == null
        ? 0
        : Math.min(0.25, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    if (this.rewardRequested) this._checkReward();
    if (this.phase === "countdown" && this.countdown && !this.controllerMissing) {
      const timer = this.countdown;
      if (!input.actionDown && !input.specialPressed && !input.startPressed && !this.previousButtons.some(Boolean) && !this.keys.size) timer.released = true;
      if (timer.released) {
        timer.remaining -= delta;
        const beat = Math.max(1, Math.ceil(timer.remaining));
        if (timer.shown !== beat) { timer.shown = beat; this._renderBeat(beat); this.audio.play("countdown"); }
        if (timer.remaining <= 0) {
          this.phase = timer.target;
          this.countdown = null;
          this.accumulator = 0;
          this.pending.actionPressed = this.pending.specialPressed = false;
          this.game.resume();
          delta = 0;
          this._renderBeat("GO!", "");
          this.goRemaining = .3;
          this.audio.play("go");
        }
      }
    } else if (this.phase === "gameover") {
      this.gameOverRemaining -= delta;
      if (this.gameOverRemaining <= 0) {
        if (this.sessionKind === "scored" && !this.runUnscored) this.showNameEntry();
        else this.showResults();
      }
    }
    if (this.goRemaining > 0 && ["playing", "tutorial"].includes(this.phase)) {
      this.goRemaining -= delta;
      if (this.goRemaining <= 0) this._html("");
    }
    if (["playing", "tutorial"].includes(this.phase) && this.game) {
      this.accumulator += delta;
      const step = this.gameInfo.step;
      while (
        ["playing", "tutorial"].includes(this.phase) &&
        this.game &&
        this.accumulator >= step
      ) {
        this.game.step(step, {
          moveX: input.moveX,
          moveY: input.moveY,
          actionDown: input.actionDown,
          actionPressed: this.pending.actionPressed,
          specialPressed: this.pending.specialPressed,
        });
        this.pending.actionPressed = this.pending.specialPressed = false;
        this.accumulator -= step;
        if (this._checkReward()) {
          this.accumulator = 0;
          break;
        }
      }
      if (["playing", "tutorial"].includes(this.phase) && this.game) this.game.render(this.accumulator / step);
    }
    this.presentationRuntime?.frame(["playing", "tutorial"].includes(this.phase) ? delta : 0);
    this.keyEdges.clear();
    if (this.raf) this.frame = this.raf((next) => this.tick(next));
  }
  start() {
    if (!this.frame && this.raf) this.frame = this.raf((t) => this.tick(t));
    return this;
  }
  stop() {
    if (this.frame && this.caf) this.caf(this.frame);
    this.frame = null;
    this._cancelViewAnimations();
  }
  getSnapshot() {
    const game =
      this.game && this.game.getSnapshot ? this.game.getSnapshot() : null;
    return Object.freeze({
      phase: this.phase,
      countdown: this.countdown?.remaining ?? null,
      selectedGame: this.games[this.selected].id,
      activeGame: this.gameInfo && this.gameInfo.id,
      controller: this._pad0() ? "slot-0" : "missing",
      awaitingRelease: this.awaitRelease,
      devMode: this.devMode,
      runId: this.runId,
      runUnscored: this.runUnscored,
      nameEntry: this.nameEntry && {
        name: this.nameEntry.name,
        cursor: this.nameEntry.cursor,
        selectedKey: NAME_KEYS[this.nameEntry.cursor],
        saving: this.nameEntry.saving,
        error: this.nameEntry.error,
      },
      sandbox: this.sandbox,
      lastResult: this.lastResult,
      game,
    });
  }
}
function createHosaShell(options) {
  return new HosaShell(options);
}
let shell = null;
if (typeof document !== "undefined") {
  shell = createHosaShell();
  const { createPhaserRuntime } = require("./renderer/hosa/phaserRuntime");
  createPhaserRuntime({document, parent: document.getElementById("cabinet")})
    .then((runtime) => {
      shell.presentationRuntime = runtime;
      document.body.classList.add("engine-ready");
      shell.start();
      window.addEventListener("beforeunload", () => runtime.destroy(), {once:true});
    })
    .catch((error) => {
      console.error("Phaser could not start", error);
      shell.notice("DISPLAY ENGINE FAILED — RESTART THE CABINET");
    });
}
module.exports = { createHosaShell, HosaShell, GAMES, ALL_GAMES, shell };
