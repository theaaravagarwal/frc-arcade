const os = require('os');
const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
const THREE = require('three');
global.THREE = THREE;
const { EffectComposer } = require('three/addons/postprocessing/EffectComposer.js');
const { RenderPass } = require('three/addons/postprocessing/RenderPass.js');
const { UnrealBloomPass } = require('three/addons/postprocessing/UnrealBloomPass.js');
const { SMAAPass } = require('three/addons/postprocessing/SMAAPass.js');
const { SSAOPass } = require('three/addons/postprocessing/SSAOPass.js');
const constants = require('./renderer/modules/constants');
const dom = require('./renderer/modules/dom');
const fsPromises = fs.promises;
const PANO_OBJECTS_DIR = path.join(__dirname, 'data', 'pano-objects');
const PANO_HEATMAP_DIR = path.join(__dirname, 'data', 'pano-heatmaps');
const PANO_HEATMAP_OBJECTS_DIR = path.join(PANO_HEATMAP_DIR, 'objects');
const createScreensaver = require('./renderer/modules/screensaver');
const sceneSetup = require('./renderer/modules/scene');
const flabbyBirdGame = require('./renderer/modules/flabbyBird');
let gazeModulePromise = null;
function loadGazeModule() {
  if (!gazeModulePromise) {
    gazeModulePromise = import('./lib/gazeCalibration.mjs');
  }
  return gazeModulePromise;
}

const {
  ARENA_RADIUS,
  ROBOT_SPEED,
  MOVE_ACCEL,
  MOVE_DAMPING,
  ROTATE_SPEED,
  ROTATE_ACCEL,
  ROTATE_DAMPING,
  ROBOT_COLLISION_RADIUS,
  COLLISION_DISTANCE,
  ROUND_LIMIT,
  WIN_SCORE,
  GAME2_ARENA_RADIUS,
  TURRET_LIMIT,
  DRIVER_CAMERA_HEIGHT,
  DRIVER_CAMERA_DISTANCE,
  DRIVER_FOV,
  MAIN_CAMERA_MARGIN,
  ARENA_BOUNDARY_PADDING,
  RIM_HALF_WIDTH,
  FLOOR_TEXTURE_SIZE,
  GAME2_DRIVER_SPEED,
  GAME2_ROTATE_SPEED,
  GAME2_TURRET_SPEED,
  GAME2_FIRE_RATE,
  GAME2_ENEMY_SPEED,
  GAME2_SPAWN_MIN,
  GAME2_SPAWN_MAX,
  GAME2_SPAWN_RADIUS,
  GAME2_BULLET_LIMIT,
} = constants;

const {
  hitFlash,
  centerMessage,
  p1ScoreEl,
  p2ScoreEl,
  roundInfoEl,
  menuOverlay,
  menuPanels,
  allMenuButtons,
  aiToggleLabel,
  aiDifficultyLabel,
  aiDriverLabel,
  aiTurretLabel,
  aiIndicator,
  startMenu,
  startMenuButtons,
  startMenuGuideTitle,
  startMenuGuideList,
  startMenuGuideNote,
  gazePaddleButton,
  controlBlocks,
  gazePanel,
  gazeStatus,
  gazeCoords,
  gazePointer,
  gazePaddleCanvas,
  gazeRunnerButton,
  loadGazeCalibrationButton,
  screensaverOverlay,
  screensaverCanvas,
  screensaverDebugButton,
  deviceInfoOverlay,
  panoSelector,
  panoSelectorList,
  panoHintCard,
  panoHintImage,
  panoHintName,
  panoHintDifficulty,
  panoDevPanel,
  panoDevObjectSelect,
  panoDevPolygonList,
  panoDevPointCount,
  panoDevStartPolygon,
  panoDevFinishPolygon,
  panoDevRemovePolygon,
  panoDevSave,
  panoDevReload,
  panoDevStatus,
  panoDevToggle,
  panoDevSelectorSkip,
  panoDevAddName,
  panoDevAddButton,
  panoDevOverlay,
  panoDevOverlayCanvas,
  panoFoundOverlay,
  panoFoundDescription,
  panoFoundPanel,
  panoHighlightOverlay,
  panoHighlightCanvas,
  panoHeatmapOverlay,
  panoHeatmapCanvas,
  panoHeatmapControls,
  panoHeatmapModeButton,
  panoHeatmapObjectSelect,
  panoCrosshair,
  panoResetButton,
  panoRechooseButton,
} = dom;

const panoDevOverlayCtx = panoDevOverlayCanvas ? panoDevOverlayCanvas.getContext('2d') : null;
const panoHighlightOverlayCtx = panoHighlightCanvas ? panoHighlightCanvas.getContext('2d') : null;
const panoHeatmapCtx = panoHeatmapCanvas ? panoHeatmapCanvas.getContext('2d') : null;
let effectComposer = null;
let postRenderPass = null;
let postSSAOPass = null;
let postBloomPass = null;
let postSMAPass = null;
let currentGame = null;

function ledSetMode(mode) {
  if (!ipcRenderer) return;
  ipcRenderer.send('led:set-mode', { mode });
}

function ledEmitEvent(type, data = {}) {
  if (!ipcRenderer) return;
  ipcRenderer.send('led:event', { type, data });
}

function getLedModeForState() {
  if (startMenuVisible || menuOpen) return 'idle';
  if (currentGame === 'joust') return 'joust';
  if (currentGame === 'shooter') return 'shooter';
  if (currentGame === 'pano') return 'pano';
  return 'idle';
}

function syncLedMode() {
  ledSetMode(getLedModeForState());
}

const isDebugMode = process.env.NODE_ENV === 'development';

const panoHighlightState = {
  active: false,
  item: null,
};
const PANO_HEATMAP_GRID_WIDTH = 96;
const PANO_HEATMAP_GRID_HEIGHT = 32;
const PANO_HEATMAP_GRID_SIZE = PANO_HEATMAP_GRID_WIDTH * PANO_HEATMAP_GRID_HEIGHT;
const PANO_HEATMAP_SAMPLE_INTERVAL = 0.1;
const PANO_HEATMAP_SAVE_INTERVAL = 8;
const panoHeatmapState = {
  loaded: false,
  loadingPromise: null,
  savingPromise: null,
  dirtyOverall: false,
  dirtyObjectIds: new Set(),
  sampleElapsed: 0,
  saveElapsed: 0,
  overlayMode: 'off',
  selectedObjectId: null,
  overall: new Float32Array(PANO_HEATMAP_GRID_SIZE),
  perObject: new Map(),
};
const panoTimerState = {
  active: false,
  elapsed: 0,
};

const panoDevState = {
  enabled: false,
  editing: false,
  currentPoints: [],
  selectedObjectId: null,
  status: '',
};
let panoDevPanelVisible = false;
const PANO_DEFAULT_DIFFICULTY = 'Easy';
const PANO_DEFAULT_DESCRIPTION = '';
const PANO_DEFAULT_REFERENCE = '';
const panoObjectsState = {
  items: [],
  loaded: false,
};
const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'expert'];
const DIFFICULTY_COLORS = {
  easy: '#85ffc2',
  medium: '#f7c948',
  hard: '#ff8c42',
  expert: '#ff4c7a',
};
const DEFAULT_BLOOM_THRESHOLD = 0.55;
const DEFAULT_AMBIENT_INTENSITY = 1.2;
const LIGHT_SWITCH_AMBIENT_INTENSITY = 4.5;
const LIGHT_SWITCH_ID = 'light-switch';
let isLightSwitchBright = false;

const START_MENU_GUIDES = {
  default: {
    title: 'FRC ARCADE',
    items: [
      { label: 'Selection', text: 'Use ↑/↓ or the left stick to highlight a mode.' },
      { label: 'Continue', text: 'Click or press Enter / controller A / Start once you choose.' },
    ],
    note: 'Guides update per mode when highlighted.',
  },
  joust: {
    title: 'Robot Joust',
    items: [
      {
        label: 'Controls',
        text: 'P1 uses W/A/S/D plus Q/E, P2 uses I/J/K/L plus U/O, or plug in gamepads to use analog sticks and LB/RB (or the right stick) for turning.',
      },
      {
        label: 'How to play',
        text: "Smack the opponent's bumper to score; each hit starts a new round until someone reaches the win score.",
      },
      {
        label: 'Settings',
        text: 'ESC → Settings toggles AI pilots and difficulty for either slot without leaving the arena.',
      },
      {
        label: 'Inputs',
        text: 'Best with keyboards or paired controllers; trackpads are awkward for dual inputs.',
      },
    ],
    note: 'Press Enter, click, or controller A / Start to jump in.',
  },
  shooter: {
    title: 'Driver + Gunner Shooter',
    items: [
      {
        label: 'Controls',
        text: 'Driver reuses P1 keys while the gunner turns the turret with J/L and fires with I; two controllers let each role use sticks plus LB/RB or triggers.',
      },
      {
        label: 'How to play',
        text: 'Dodge incoming spheres and shoot them before they hit your base; waves grow harder as your score increases.',
      },
      {
        label: 'Settings',
        text: 'ESC opens settings to hand either seat over to AI or adjust AI difficulty mid-run.',
      },
      {
        label: 'Inputs',
        text: 'Keyboard + second key set works, but matched gamepads make dual control much easier; trackpads are unnecessary.',
      },
    ],
    note: 'Hit Enter, click, or controller A / Start to begin the shooter.',
  },
  pano: {
    title: 'Find the Object Panorama',
    items: [
      {
        label: 'Controls',
        text: 'Click-and-drag or use P1 left stick to pan, scroll or P1 right stick up/down to zoom, and click or press A to mark the suspected object; the light switch inside the scene brightens the view.',
      },
      {
        label: 'How to play',
        text: 'Choose an object, scan the panorama, then click the matching spot to mark it before resetting or rechoosing.',
      },
      {
        label: 'Settings',
        text: 'ESC only adjusts global settings—use the on-screen reset and the light switch for fine control.',
      },
      {
        label: 'Inputs',
        text: 'Mouse/trackpad is most precise, but P1 controller works too: left stick pans, right stick up/down zooms, and A checks the center reticle.',
      },
    ],
    note: 'Click the entry or press Enter / controller A / Start to begin searching.',
  },
  flappyLion: {
    title: 'Flappy Lion',
    items: [
      {
        label: 'Controls',
        text: 'Use W for the left board and I for the right board; Enter selects menu items and R restarts a round.',
      },
      {
        label: 'How to play',
        text: 'Guide one or two birds through the pipe gaps, or let the AI variants play using the imported sprite and sound set.',
      },
      {
        label: 'Settings',
        text: 'Modes, countdowns, and leaderboards stay inside the game overlay so the Electron shell only launches and exits it.',
      },
      {
        label: 'Inputs',
        text: 'Keyboard works immediately; the embedded game also keeps its own gamepad polling once active.',
      },
    ],
    note: 'Press Enter, click, or controller A / Start after highlighting Flappy Lion.',
  },
  gaze: {
    title: 'Gaze Calibration',
    items: [
      {
        label: 'Controls',
        text: 'Look at each dot and press Space or controller A when it steadies; press R during tracking to recalibrate.',
      },
      {
        label: 'How to play',
        text: 'Grant webcam access, follow each calibration dot, and wait for tracking readiness before launching other gaze modes.',
      },
      {
        label: 'Settings',
        text: 'Use Load Saved Calibration for testing while ESC keeps AI toggles independent.',
      },
      {
        label: 'Inputs',
        text: 'Webcam plus keyboard/trackpad or controller A confirms to the dots; eye movement controls the rest.',
      },
    ],
    note: 'Press Enter, click, or controller A / Start after tracking is ready to continue.',
  },
  gazePaddle: {
    title: 'Gaze Paddle',
    items: [
      {
        label: 'Controls',
        text: 'Look left/right to steer the paddle once tracking is active; controller buttons can acknowledge prompts.',
      },
      {
        label: 'How to play',
        text: 'Keep the glowing ball bouncing with smooth gaze shifts; misses register in the HUD.',
      },
      {
        label: 'Settings',
        text: 'Finish calibration first—ESC exits, R requests recalibration, and settings persist across sessions.',
      },
      {
        label: 'Inputs',
        text: 'The gameplay is gaze-driven; controllers only help confirm popups.',
      },
    ],
    note: 'Click the highlighted mode or press Enter / controller A / Start to open Gaze Paddle once calibration is ready.',
  },
  gazeRunner: {
    title: 'Gaze Lane Runner (Legacy)',
    items: [
      {
        label: 'Controls',
        text: 'Look toward lanes to switch and avoid robots while keeping your gaze steady.',
      },
      {
        label: 'How to play',
        text: 'Glance ahead to steer the runner down the lane and dodge obstacles; calm gaze = smoother flight.',
      },
      {
        label: 'Settings',
        text: 'Gaze calibration unlocks this legacy mode—ESC pauses, R recalibrates during setup.',
      },
      {
        label: 'Inputs',
        text: 'Eyes do the movement; controllers only handle menu confirmations.',
      },
    ],
    note: 'Use Enter, click, or controller A / Start after highlighting this legacy mode.',
  },
};

flabbyBirdGame.setExitHandler(() => {
  showStartMenu();
});

function getDifficultyPriority(label) {
  const key = (label || '').trim().toLowerCase();
  const index = DIFFICULTY_ORDER.indexOf(key);
  return index === -1 ? DIFFICULTY_ORDER.length : index;
}

function updateStartMenuGuide(button = startMenuButtons[startMenuIndex]) {
  if (!startMenuGuideTitle || !startMenuGuideList || !startMenuGuideNote) return;
  const guideKey = button?.dataset?.game;
  const guide = START_MENU_GUIDES[guideKey] || START_MENU_GUIDES.default;
  startMenuGuideTitle.textContent = guide.title;
  startMenuGuideList.innerHTML = '';
  guide.items.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="guide-label">${item.label}</span> ${item.text}`;
    startMenuGuideList.appendChild(li);
  });
  startMenuGuideNote.textContent = guide.note;
}

if (!isDebugMode) {
  if (loadGazeCalibrationButton) {
    loadGazeCalibrationButton.remove();
  }
  if (screensaverDebugButton) {
    screensaverDebugButton.remove();
  }
  if (deviceInfoOverlay) {
    deviceInfoOverlay.remove();
  }
}

if (isDebugMode) {
  panoDevState.enabled = true;
  refreshPanoDevUI().then(() => {
    updatePanoDevToggleButton();
  });
} else {
  if (panoDevPanel) {
    panoDevPanel.remove();
  }
  if (panoDevOverlay) {
    panoDevOverlay.remove();
  }
  if (panoDevToggle) {
    panoDevToggle.remove();
  }
  if (panoDevSelectorSkip) {
    panoDevSelectorSkip.remove();
  }
}

function detectWebGLDiagnostics() {
  const canvas = document.createElement('canvas');
  const gl =
    canvas.getContext('webgl2') ||
    canvas.getContext('webgl') ||
    canvas.getContext('experimental-webgl');

  if (!gl) {
    return "WebGL unavailable (no context)";
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

  const renderer = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);

  const vendor = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
    : gl.getParameter(gl.VENDOR);

  const rendererLabel = renderer || "Unknown Renderer";
  const vendorLabel = vendor || "Unknown Vendor";

  // Software indicators
  const isSoftware = /(swiftshader|llvmpipe|softpipe|software rasterizer)/i.test(
    rendererLabel
  );

  const hardwareAcceleration = !isSoftware;

  // Build a clean human readable result
  return (
    `Vendor: ${vendorLabel}\n` +
    `Renderer: ${rendererLabel}\n` +
    `Hardware Acceleration: ${hardwareAcceleration ? "YES" : "NO"}`
  );
}


function populateDeviceInfoOverlay() {
  if (!deviceInfoOverlay) return;

  // --- Host / OS Info ---
  const hostname =
    (typeof os.hostname === "function" && os.hostname()) ||
    "Unknown Host";

  const osType = (typeof os.type === "function" && os.type()) || "Unknown OS";
  const osRelease =
    (typeof os.release === "function" && os.release()) || "Unknown Release";
  const osArch = (typeof os.arch === "function" && os.arch()) || "Unknown Arch";

  const osLabel = `${osType} ${osRelease} (${osArch})`;

  // --- CPU Info ---
  const cpuList = typeof os.cpus === "function" ? os.cpus() : [];
  const cpuCount = cpuList.length;
  const cpuModel =
    cpuList?.[0]?.model?.trim() || "Unknown CPU";

  const cpuLabel =
    cpuCount > 1
      ? `${cpuCount}× ${cpuModel}`
      : cpuModel;

  // --- WebGL Info ---
  const glInfoString = detectWebGLDiagnostics(); // Already human-readable
  const glInfoLines = glInfoString.split("\n");

  // --- Build UI ---
  const lines = [
    `HOST: ${hostname}`,
    `OS: ${osLabel}`,
    `CPU: ${cpuLabel}`,
    ...glInfoLines,
  ];

  deviceInfoOverlay.innerHTML = lines
    .map((line) => `<div>${line}</div>`)
    .join("");
}


if (isDebugMode) {
  populateDeviceInfoOverlay();
}

const SCREENSAVER_TIMEOUT_MS = 120000; // 2 minutes
const {
  show: showScreensaver,
  hide: hideScreensaver,
  reset: resetScreensaverTimer,
  handleActivity: handleScreensaverActivity,
  start: initScreensaverTracking,
} = createScreensaver({
  overlay: screensaverOverlay,
  canvas: screensaverCanvas,
  debugButton: isDebugMode ? screensaverDebugButton : null,
  timeout: SCREENSAVER_TIMEOUT_MS,
  debugMode: isDebugMode,
});
const gazePaddleCtx = gazePaddleCanvas ? gazePaddleCanvas.getContext('2d') : null;

const {
  renderer,
  scene,
  camera,
  turretCamera,
  cameraBasePosition,
  ambientLight,
  arenaSurface,
  glowingRim,
  shooterRim,
  floorMaterial,
  floorPlane,
  shooterGrid,
  grid,
} = sceneSetup;

let menuButtons = Array.from(menuOverlay.querySelectorAll('.menu-panel-content.active button'));
let menuIndex = 0;
let menuMode = 'main';
let startMenuIndex = 0;
let startMenuVisible = true;
const colorHelper = new THREE.Color();
const aiDiff = new THREE.Vector2();
const aiMoveTarget = new THREE.Vector2();
const aiMoveCommand = new THREE.Vector2();
const driverCameraForward = new THREE.Vector3();
const driverCameraOffset = new THREE.Vector3();
const driverCameraLookTarget = new THREE.Vector3();
const game2ForwardVec = new THREE.Vector2();
const game2RightVec = new THREE.Vector2();
const game2DesiredVelocity = new THREE.Vector2();
const game2TargetVelocity = new THREE.Vector2();
const AI_DIFFICULTIES = [
  {
    id: 'easy',
    label: 'EASY',
    moveSpeed: 0.45,
    rotateSpeedFactor: 0.55,
    angleThreshold: 0.5,
    retreatDistance: 3.2,
    chaseBoostDistance: 9,
    jitter: 0.55,
  },
  {
    id: 'normal',
    label: 'NORMAL',
    moveSpeed: 0.7,
    rotateSpeedFactor: 0.75,
    angleThreshold: 0.36,
    retreatDistance: 2.6,
    chaseBoostDistance: 10,
    jitter: 0.45,
  },
  {
    id: 'hard',
    label: 'HARD',
    moveSpeed: 0.85,
    rotateSpeedFactor: 0.85,
    angleThreshold: 0.28,
    retreatDistance: 2.3,
    chaseBoostDistance: 10.5,
    jitter: 0.25,
  },
];

const hitRings = [];
let menuOpen = false;
let aiEnabled = false;
let aiDifficultyIndex = 1;
const game2AIState = { driver: false, turret: false };
const gazeGameState = {
  active: false,
  initializing: false,
  calibrating: false,
  listenerAttached: false,
  sessionId: 0,
  readyForPaddle: false,
  readyForRunner: false,
  targetX: 0.5,
  useSavedCalibration: false,
};
const GAZE_CALIBRATION_ENABLED = false;
const gazePaddleState = {
  active: false,
  width: 640,
  height: 360,
  paddleX: 0.5,
  targetX: 0.5,
  paddleWidth: 180,
  basePaddleWidth: 180,
  paddleGrowthPerPoint: 6,
  maxPaddleWidth: 260,
  paddleHeight: 16,
  ballRadius: 14,
  ballX: 260,
  ballY: 150,
  ballVX: 90,
  ballVY: 120,
  baseSpeed: 100,
  score: 0,
  misses: 0,
  canvasVisible: false,
};
const laneRunnerState = {
  active: false,
  robot: null,
  track: null,
  laneLines: [],
  lanePositions: [],
  laneCount: 4,
  laneSpan: 60,
  laneWidth: 8,
  laneLeftEdge: -16,
  currentLaneIndex: 1,
  targetLaneIndex: 1,
  distance: 0,
  speed: 16,
  lives: 3,
  obstacles: [],
  spawnTimer: 1.2,
  startTimestamp: 0,
  endTimeout: null,
  laneSwitchTimer: 0,
  lastLaneCandidate: 0,
};
const panoState = {
  active: false,
  mesh: null,
  texture: null,
  texturePromise: null,
  yaw: 0,
  pitch: 0,
  targetYaw: 0,
  targetPitch: 0,
  fov: 55,
  dragging: false,
  selectionVisible: false,
  selectionIndex: 0,
  clickCandidate: false,
  pointerDownX: 0,
  pointerDownY: 0,
};
const PANO_RADIUS = 46;
const PANO_MIN_FOV = 6;
const PANO_MAX_FOV = 80;
const PANO_DEFAULT_FOV = 55;
const PANO_DRAG_SPEED = 0.0026;
const PANO_GAMEPAD_LOOK_SPEED = 1.9;
const PANO_GAMEPAD_ZOOM_SPEED = 46;
const PANO_PITCH_LIMIT = Math.PI / 2 - 0.12;
const PANO_IMAGE_ASPECT = 14360 / 3628;
const PANO_ARC = Math.PI * 0.85;
const PANO_HEIGHT = (PANO_RADIUS * PANO_ARC) / PANO_IMAGE_ASPECT;
const PANO_START_ANGLE = Math.PI / 2 - PANO_ARC / 2;
const baseSceneFog = scene.fog;
const panoLookDirection = new THREE.Vector3();
const panoTextureLoader = new THREE.TextureLoader();
let panoLastPointerX = 0;
let panoLastPointerY = 0;
const raycaster = new THREE.Raycaster();
const panoPointer = new THREE.Vector2();
const PANO_CLICK_THRESHOLD = 6;
const panoDevWorldVec = new THREE.Vector3();
const panoDevProjectedVec = new THREE.Vector3();
let webGazerInitialized = false;
let gazeInitPromise = null;
let gazeSessionCounter = 0;
function createRobot(colorHex, bumperHex) {
  const group = new THREE.Group();

  const color = new THREE.Color(colorHex);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3, 1.1, 3),
    new THREE.MeshStandardMaterial({
      color,
      metalness: 0.4,
      roughness: 0.35,
      emissive: color.clone().multiplyScalar(0.35),
      emissiveIntensity: 1,
    })
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const bumper = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.4, 0.45),
    new THREE.MeshStandardMaterial({
      color: bumperHex,
      emissive: bumperHex,
      emissiveIntensity: 1,
    })
  );
  bumper.position.set(0, -0.2, 1.55);
  group.add(bumper);

  const frontArrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.8, 12),
    new THREE.MeshStandardMaterial({ color: bumperHex, emissive: bumperHex })
  );
  frontArrow.rotation.x = Math.PI / 2;
  frontArrow.position.set(0, 0.7, 1.95);
  group.add(frontArrow);
  group.userData.directionIndicator = frontArrow;

  return group;
}

const players = [
  {
    id: 'P1',
    color: 0x36f0ff,
    bumper: 0xf6ff92,
    controls: {
      up: 'w',
      down: 's',
      left: 'a',
      right: 'd',
      rotateLeft: 'q',
      rotateRight: 'e',
    },
    startPosition: new THREE.Vector3(-6, 0, 0),
    startRotation: Math.PI / 2,
    scoreEl: p1ScoreEl,
    gamepadIndex: 0,
  },
  {
    id: 'P2',
    color: 0xff5ad8,
    bumper: 0xffc0ff,
    controls: {
      up: 'i',
      down: 'k',
      left: 'j',
      right: 'l',
      rotateLeft: 'u',
      rotateRight: 'o',
    },
    startPosition: new THREE.Vector3(6, 0, 0),
    startRotation: -Math.PI / 2,
    scoreEl: p2ScoreEl,
    gamepadIndex: 1,
  },
];

players.forEach((player) => {
  const robot = createRobot(player.color, player.bumper);
  scene.add(robot);
  player.robot = robot;
  player.score = 0;
  player.velocity = new THREE.Vector2();
  player.angularVelocity = 0;
  player.isAI = false;
});

setAIEnabled(false);
updateGame2AIUI();

function clampToArena(group, radius = ARENA_RADIUS) {
  const pos = new THREE.Vector2(group.position.x, group.position.z);
  const limit = Math.max(radius - ARENA_BOUNDARY_PADDING, 0.1);
  if (pos.length() > limit) {
    pos.setLength(limit);
    group.position.x = pos.x;
    group.position.z = pos.y;
  }
}

const keys = {};

const MAX_GAMEPADS = 2;
const GAMEPAD_DEADZONE = 0.25;
const GAMEPAD_MENU_THRESHOLD = 0.6;
const GAMEPAD_BUTTONS = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  L3: 10,
  R3: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
};

function createGamepadState() {
  return {
    connected: false,
    index: null,
    axes: [0, 0, 0, 0],
    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
    buttons: [],
    justPressed: [],
    justReleased: [],
    justPressedSet: new Set(),
    navEvents: { up: false, down: false, left: false, right: false },
    analogNavState: { up: false, down: false, left: false, right: false },
  };
}

const gamepadStates = Array.from({ length: MAX_GAMEPADS }, createGamepadState);

function applyDeadzone(value, deadzone = GAMEPAD_DEADZONE) {
  return Math.abs(value) < deadzone ? 0 : value;
}

function resetGamepadState(state) {
  state.connected = false;
  state.index = null;
  state.axes.fill(0);
  state.leftStick.x = 0;
  state.leftStick.y = 0;
  state.rightStick.x = 0;
  state.rightStick.y = 0;
  state.buttons.fill(false);
  state.justPressed.length = 0;
  state.justReleased.length = 0;
  state.justPressedSet.clear();
  state.navEvents.up = false;
  state.navEvents.down = false;
  state.navEvents.left = false;
  state.navEvents.right = false;
  state.analogNavState.up = false;
  state.analogNavState.down = false;
  state.analogNavState.left = false;
  state.analogNavState.right = false;
}

function updateGamepadNavEvents(state) {
  state.navEvents.up = false;
  state.navEvents.down = false;
  state.navEvents.left = false;
  state.navEvents.right = false;

  const analogUp = state.leftStick.y < -GAMEPAD_MENU_THRESHOLD;
  const analogDown = state.leftStick.y > GAMEPAD_MENU_THRESHOLD;
  const analogLeft = state.leftStick.x < -GAMEPAD_MENU_THRESHOLD;
  const analogRight = state.leftStick.x > GAMEPAD_MENU_THRESHOLD;

  if (analogUp) {
    if (!state.analogNavState.up) state.navEvents.up = true;
    state.analogNavState.up = true;
  } else {
    state.analogNavState.up = false;
  }
  if (analogDown) {
    if (!state.analogNavState.down) state.navEvents.down = true;
    state.analogNavState.down = true;
  } else {
    state.analogNavState.down = false;
  }
  if (analogLeft) {
    if (!state.analogNavState.left) state.navEvents.left = true;
    state.analogNavState.left = true;
  } else {
    state.analogNavState.left = false;
  }
  if (analogRight) {
    if (!state.analogNavState.right) state.navEvents.right = true;
    state.analogNavState.right = true;
  } else {
    state.analogNavState.right = false;
  }

  if (state.justPressedSet.has(GAMEPAD_BUTTONS.DPAD_UP)) state.navEvents.up = true;
  if (state.justPressedSet.has(GAMEPAD_BUTTONS.DPAD_DOWN)) state.navEvents.down = true;
  if (state.justPressedSet.has(GAMEPAD_BUTTONS.DPAD_LEFT)) state.navEvents.left = true;
  if (state.justPressedSet.has(GAMEPAD_BUTTONS.DPAD_RIGHT)) state.navEvents.right = true;
}

function updateGamepadState(state, pad) {
  state.justPressed.length = 0;
  state.justReleased.length = 0;
  state.justPressedSet.clear();
  if (!pad) {
    resetGamepadState(state);
    return;
  }
  state.connected = true;
  state.index = pad.index;
  const buttonCount = pad.buttons.length;
  if (state.buttons.length < buttonCount) {
    const startLength = state.buttons.length;
    state.buttons.length = buttonCount;
    for (let i = startLength; i < buttonCount; i += 1) {
      state.buttons[i] = false;
    }
  }
  for (let i = 0; i < buttonCount; i += 1) {
    const button = pad.buttons[i];
    const pressed = !!(button && (button.pressed || button.value > 0.5));
    if (pressed && !state.buttons[i]) {
      state.justPressed.push(i);
      state.justPressedSet.add(i);
      handleScreensaverActivity();
    } else if (!pressed && state.buttons[i]) {
      state.justReleased.push(i);
    }
    state.buttons[i] = pressed;
  }
  for (let axisIndex = 0; axisIndex < state.axes.length; axisIndex += 1) {
    const previousValue = state.axes[axisIndex];
    const raw = pad.axes[axisIndex] != null ? pad.axes[axisIndex] : 0;
    const cleaned = applyDeadzone(raw);
    state.axes[axisIndex] = cleaned;
    if (cleaned !== 0 && cleaned !== previousValue) {
      handleScreensaverActivity();
    }
  }
  state.leftStick.x = state.axes[0] || 0;
  state.leftStick.y = state.axes[1] || 0;
  state.rightStick.x = state.axes[2] || 0;
  state.rightStick.y = state.axes[3] || 0;
  updateGamepadNavEvents(state);
}

function updateGamepads() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) {
    gamepadStates.forEach((state) => resetGamepadState(state));
    return;
  }
  const rawPads = navigator.getGamepads();
  const connectedPads = [];
  for (let i = 0; i < rawPads.length; i += 1) {
    if (rawPads[i]) {
      connectedPads.push(rawPads[i]);
    }
  }
  for (let i = 0; i < MAX_GAMEPADS; i += 1) {
    updateGamepadState(gamepadStates[i], connectedPads[i] || null);
  }
}

function getGamepadState(padIndex) {
  if (padIndex == null || padIndex < 0 || padIndex >= gamepadStates.length) return null;
  return gamepadStates[padIndex];
}

function isGamepadButtonDown(padIndex, buttonIndex) {
  const state = getGamepadState(padIndex);
  if (!state || !state.connected) return false;
  return !!state.buttons[buttonIndex];
}

function wasGamepadButtonPressed(padIndex, buttonIndex) {
  const state = getGamepadState(padIndex);
  if (!state || !state.connected) return false;
  return state.justPressedSet.has(buttonIndex);
}

function addGamepadMovementInputJoust(moveInput, padIndex) {
  const state = getGamepadState(padIndex);
  if (!state || !state.connected) return;
  moveInput.x += state.leftStick.x;
  moveInput.y += state.leftStick.y;
  if (state.buttons[GAMEPAD_BUTTONS.DPAD_UP]) moveInput.y -= 1;
  if (state.buttons[GAMEPAD_BUTTONS.DPAD_DOWN]) moveInput.y += 1;
  if (state.buttons[GAMEPAD_BUTTONS.DPAD_LEFT]) moveInput.x -= 1;
  if (state.buttons[GAMEPAD_BUTTONS.DPAD_RIGHT]) moveInput.x += 1;
}

function addGamepadMovementInputGame2(moveInput, padIndex) {
  const state = getGamepadState(padIndex);
  if (!state || !state.connected) return;
  moveInput.x -= state.leftStick.x;
  moveInput.y -= state.leftStick.y;
  if (state.buttons[GAMEPAD_BUTTONS.DPAD_UP]) moveInput.y += 1;
  if (state.buttons[GAMEPAD_BUTTONS.DPAD_DOWN]) moveInput.y -= 1;
  if (state.buttons[GAMEPAD_BUTTONS.DPAD_LEFT]) moveInput.x += 1;
  if (state.buttons[GAMEPAD_BUTTONS.DPAD_RIGHT]) moveInput.x -= 1;
}

function getGamepadRotateInput(padIndex, stick = 'right') {
  const state = getGamepadState(padIndex);
  if (!state || !state.connected) return 0;
  let rotate = 0;
  if (state.buttons[GAMEPAD_BUTTONS.LB]) rotate += 1;
  if (state.buttons[GAMEPAD_BUTTONS.RB]) rotate -= 1;
  const stickX = stick === 'left' ? state.leftStick.x : state.rightStick.x;
  if (stickX !== 0) {
    rotate -= stickX;
  }
  rotate = THREE.MathUtils.clamp(rotate, -1, 1);
  return rotate;
}

function refreshMenuButtons() {
  menuButtons = Array.from(menuOverlay.querySelectorAll('.menu-panel-content.active button'));
}

function clearMovementInputs() {
  Object.keys(keys).forEach((key) => {
    keys[key] = false;
  });
}

function applyMenuFocus() {
  if (!menuOpen) return;
  if (!menuButtons.length) return;
  allMenuButtons.forEach((btn) => btn.classList.remove('menu-focus'));
  const button = menuButtons[menuIndex];
  if (button && !button.disabled) {
    button.classList.add('menu-focus');
    button.focus();
  }
}

function getNextMenuIndex(startIndex, direction) {
  const total = menuButtons.length;
  if (total === 0) return -1;
  let idx = startIndex;
  for (let i = 0; i < total; i += 1) {
    idx = (idx + direction + total) % total;
    if (!menuButtons[idx].disabled) {
      return idx;
    }
  }
  return startIndex;
}

function ensureMenuIndexValid() {
  if (!menuButtons.length) return;
  if (!menuButtons[menuIndex] || menuButtons[menuIndex].disabled) {
    const next = getNextMenuIndex(menuIndex, 1);
    if (next !== -1) {
      menuIndex = next;
    }
  }
}

function moveMenuFocus(direction) {
  const next = getNextMenuIndex(menuIndex, direction);
  if (next !== -1) {
    menuIndex = next;
    applyMenuFocus();
  }
}

function handleMenuHorizontalInput(direction) {
  if (!menuButtons.length) return;
  const focusedButton = menuButtons[menuIndex];
  if (!focusedButton) return;
  const action = focusedButton.dataset.action;
  if (!action) return;
  if (
    action === 'toggle-ai' ||
    action === 'toggle-game2-ai-driver' ||
    action === 'toggle-game2-ai-turret'
  ) {
    runMenuAction(action);
  } else if (action === 'cycle-ai-difficulty') {
    runMenuAction('cycle-ai-difficulty', direction);
  }
}

function setMenuMode(mode, { resetIndex = false, focus = menuOpen } = {}) {
  menuMode = mode;
  menuPanels.forEach((panel) => {
    const isActive = panel.dataset.panel === mode;
    panel.classList.toggle('active', isActive);
  });
  refreshMenuButtons();
  if (resetIndex) {
    const firstEnabled = menuButtons.findIndex((btn) => !btn.disabled);
    menuIndex = firstEnabled === -1 ? 0 : firstEnabled;
  } else {
    ensureMenuIndexValid();
  }
  if (focus && menuOpen) {
    applyMenuFocus();
  }
}

const menuActions = {
  resume: () => closeMenu(),
  reset: () => {
    closeMenu();
    startRound({ resetScores: true });
  },
  'settings-open': () => {
    setMenuMode('settings', { resetIndex: true, focus: true });
  },
  'settings-back': () => {
    setMenuMode('main', { resetIndex: true, focus: true });
  },
  'toggle-ai': () => toggleAI(),
  'cycle-ai-difficulty': (direction = 1) => cycleAIDifficulty(direction || 1),
  'toggle-game2-ai-driver': () => toggleGame2AIDriver(),
  'toggle-game2-ai-turret': () => toggleGame2AITurret(),
  'game-select': () => showStartMenu(),
  exit: () => window.close(),
};

function runMenuAction(action, payload) {
  const handler = menuActions[action];
  if (handler) {
    handler(payload);
  }
}

function activateMenuSelection() {
  const button = menuButtons[menuIndex];
  if (button && !button.disabled) {
    runMenuAction(button.dataset.action);
  }
}

function openMenu() {
  if (menuOpen) return;
  menuOpen = true;
  setMenuMode('main', { resetIndex: true, focus: false });
  applyMenuFocus();
  menuOverlay.classList.add('visible');
  clearMovementInputs();
  refreshGazePaddleCanvas();
  panoState.dragging = false;
  syncLedMode();
}

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  menuOverlay.classList.remove('visible');
  allMenuButtons.forEach((btn) => btn.classList.remove('menu-focus'));
  setMenuMode('main', { resetIndex: true, focus: false });
  clearMovementInputs();
  refreshGazePaddleCanvas();
  panoState.dragging = false;
  if (currentGame === 'pano') {
    renderer.domElement.style.cursor = 'grab';
  }
  syncLedMode();
}

function toggleMenu() {
  if (menuOpen) {
    closeMenu();
  } else {
    openMenu();
  }
}

function handleMenuNavigation(event) {
  const key = event.key.toLowerCase();
  if (key === 'arrowup' || key === 'w') {
    moveMenuFocus(-1);
    return true;
  }
  if (key === 'arrowdown' || key === 's') {
    moveMenuFocus(1);
    return true;
  }
  const focusedButton = menuButtons[menuIndex];
  if ((key === 'arrowleft' || key === 'arrowright') && focusedButton) {
    const direction = key === 'arrowleft' ? -1 : 1;
    const action = focusedButton.dataset.action;
    if (
      action === 'toggle-ai' ||
      action === 'toggle-game2-ai-driver' ||
      action === 'toggle-game2-ai-turret'
    ) {
      runMenuAction(action);
      return true;
    }
    if (action === 'cycle-ai-difficulty') {
      runMenuAction('cycle-ai-difficulty', direction);
      return true;
    }
  }
  if (key === 'enter' || key === ' ') {
    activateMenuSelection();
    return true;
  }
  return false;
}

function handleStartMenuGamepadInput(padIndex) {
  const state = getGamepadState(padIndex);
  if (!state || !state.connected) return;
  if (state.navEvents.up) {
    moveStartMenuSelection(-1);
  } else if (state.navEvents.down) {
    moveStartMenuSelection(1);
  }
  if (
    wasGamepadButtonPressed(padIndex, GAMEPAD_BUTTONS.A) ||
    wasGamepadButtonPressed(padIndex, GAMEPAD_BUTTONS.START)
  ) {
    const button = startMenuButtons[startMenuIndex];
    if (button) {
      selectGame(button.dataset.game);
    }
  }
}

function handlePauseMenuGamepadInput(padIndex) {
  const state = getGamepadState(padIndex);
  if (!state || !state.connected) return;
  if (state.navEvents.up) moveMenuFocus(-1);
  if (state.navEvents.down) moveMenuFocus(1);
  if (state.navEvents.left) handleMenuHorizontalInput(-1);
  if (state.navEvents.right) handleMenuHorizontalInput(1);
  if (wasGamepadButtonPressed(padIndex, GAMEPAD_BUTTONS.A)) {
    activateMenuSelection();
  }
  if (wasGamepadButtonPressed(padIndex, GAMEPAD_BUTTONS.B)) {
    closeMenu();
  }
}

function handleGamepadMenus() {
  let menuToggleHandled = false;
  for (let i = 0; i < gamepadStates.length; i += 1) {
    const state = gamepadStates[i];
    if (!state || !state.connected) continue;
    if (startMenuVisible) {
      handleStartMenuGamepadInput(i);
      continue;
    }
    if (menuOpen) {
      handlePauseMenuGamepadInput(i);
      if (!menuToggleHandled && wasGamepadButtonPressed(i, GAMEPAD_BUTTONS.START)) {
        toggleMenu();
        menuToggleHandled = true;
      }
      continue;
    }
    if (!menuToggleHandled && wasGamepadButtonPressed(i, GAMEPAD_BUTTONS.START)) {
      toggleMenu();
      menuToggleHandled = true;
    }
  }
}

allMenuButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    if (button.disabled) return;
    const activeIndex = menuButtons.indexOf(button);
    if (activeIndex !== -1) {
      menuIndex = activeIndex;
      applyMenuFocus();
    }
    runMenuAction(button.dataset.action);
  });
});

startMenuButtons.forEach((button, index) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    startMenuIndex = index;
    selectGame(button.dataset.game);
  });
});

function handlePanoPointerDown(event) {
  if (currentGame !== 'pano' || menuOpen || startMenuVisible) return;
  panoState.dragging = true;
  panoLastPointerX = event.clientX;
  panoLastPointerY = event.clientY;
  renderer.domElement.style.cursor = 'grabbing';
  panoState.clickCandidate = true;
  panoState.pointerDownX = event.clientX;
  panoState.pointerDownY = event.clientY;
}

function handlePanoPointerMove(event) {
  if (!panoState.dragging || currentGame !== 'pano' || menuOpen || startMenuVisible) return;
  const dx = event.clientX - panoLastPointerX;
  const dy = event.clientY - panoLastPointerY;
  panoLastPointerX = event.clientX;
  panoLastPointerY = event.clientY;
  if (
    panoState.clickCandidate &&
    (Math.abs(event.clientX - panoState.pointerDownX) > PANO_CLICK_THRESHOLD ||
      Math.abs(event.clientY - panoState.pointerDownY) > PANO_CLICK_THRESHOLD)
  ) {
    panoState.clickCandidate = false;
  }
  const zoomFactor = panoState.fov / PANO_MAX_FOV;
  const dragSpeed = PANO_DRAG_SPEED * zoomFactor;
  panoState.targetYaw += dx * dragSpeed;
  panoState.targetPitch += dy * dragSpeed;
  panoState.targetPitch = THREE.MathUtils.clamp(
    panoState.targetPitch,
    -PANO_PITCH_LIMIT,
    PANO_PITCH_LIMIT
  );
}

function handlePanoPointerUp(event) {
  if (!panoState.dragging && !panoState.clickCandidate) return;
  const wasClick = panoState.clickCandidate;
  panoState.dragging = false;
  panoState.clickCandidate = false;
  if (currentGame === 'pano') {
    renderer.domElement.style.cursor = 'grab';
  }
  if (wasClick && event && event.type !== 'mouseleave') {
    if (panoDevState.enabled && panoDevState.editing) {
      addPanoDevPoint(event);
      return;
    }
    handlePanoClick(event);
  }
}

function handlePanoWheel(event) {
  if (currentGame !== 'pano' || menuOpen || startMenuVisible) return;
  panoState.fov = THREE.MathUtils.clamp(
    panoState.fov + event.deltaY * 0.05,
    PANO_MIN_FOV,
    PANO_MAX_FOV
  );
  camera.fov = panoState.fov;
  camera.updateProjectionMatrix();
  event.preventDefault();
}

function getPanoUVFromClientPosition(clientX, clientY) {
  if (!panoState.mesh) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  panoPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  panoPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(panoPointer, camera);
  const hits = raycaster.intersectObject(panoState.mesh, false);
  if (!hits.length) return null;
  return hits[0].uv || null;
}

function getPanoUVFromEvent(event) {
  return getPanoUVFromClientPosition(event.clientX, event.clientY);
}

renderer.domElement.addEventListener('mousedown', handlePanoPointerDown);
window.addEventListener('mousemove', handlePanoPointerMove);
window.addEventListener('mouseup', handlePanoPointerUp);
renderer.domElement.addEventListener('mouseleave', handlePanoPointerUp);
renderer.domElement.addEventListener('wheel', handlePanoWheel, { passive: false });

if (panoRechooseButton) {
  panoRechooseButton.addEventListener('click', (event) => {
    event.preventDefault();
    resetPanoSearch();
  });
}

if (panoResetButton) {
  panoResetButton.addEventListener('click', (event) => {
    event.preventDefault();
    if (currentGame === 'pano') {
      resetPanoSearch();
    }
  });
}

if (panoHeatmapModeButton) {
  panoHeatmapModeButton.addEventListener('click', (event) => {
    event.preventDefault();
    cyclePanoHeatmapMode();
  });
}

if (panoHeatmapObjectSelect) {
  panoHeatmapObjectSelect.addEventListener('change', () => {
    panoHeatmapState.selectedObjectId = panoHeatmapObjectSelect.value || null;
    updatePanoHeatmapControlsUI();
  });
}

if (panoDevToggle) {
  panoDevToggle.addEventListener('click', (event) => {
    event.preventDefault();
    togglePanoDevPanel();
  });
}

if (panoDevSelectorSkip) {
  panoDevSelectorSkip.addEventListener('click', (event) => {
    event.preventDefault();
    skipPanoSelection();
  });
}

if (panoDevObjectSelect) {
  panoDevObjectSelect.addEventListener('change', () => {
    handlePanoDevObjectChange();
  });
}
if (panoDevStartPolygon) {
  panoDevStartPolygon.addEventListener('click', (event) => {
    event.preventDefault();
    startPanoDevPolygon();
  });
}
if (panoDevFinishPolygon) {
  panoDevFinishPolygon.addEventListener('click', (event) => {
    event.preventDefault();
    finishPanoDevPolygon();
  });
}
if (panoDevRemovePolygon) {
  panoDevRemovePolygon.addEventListener('click', (event) => {
    event.preventDefault();
    removeLastPanoDevPolygon();
  });
}
if (panoDevSave) {
  panoDevSave.addEventListener('click', (event) => {
    event.preventDefault();
    savePanoDevObject();
  });
}
if (panoDevReload) {
  panoDevReload.addEventListener('click', (event) => {
    event.preventDefault();
    reloadPanoDevObjects();
  });
}

if (panoDevAddButton) {
  panoDevAddButton.addEventListener('click', async (event) => {
    event.preventDefault();
    if (!panoDevAddName) return;
    const name = panoDevAddName.value || '';
    panoDevAddButton.disabled = true;
    await createPanoDevItem(name);
    panoDevAddButton.disabled = false;
  });
}

if (isDebugMode && loadGazeCalibrationButton) {
  loadGazeCalibrationButton.addEventListener('click', (event) => {
    event.preventDefault();
    gazeGameState.useSavedCalibration = true;
    selectGame('gaze');
  });
}

window.addEventListener('keydown', (event) => {
  if (startMenuVisible) {
    if (handleStartMenuKeydown(event)) {
      return;
    }
    return;
  }

  if (currentGame === 'flappyLion' && flabbyBirdGame.handleKeyDown(event)) {
    event.preventDefault();
    return;
  }

  if (event.key === 'Escape') {
    toggleMenu();
    event.preventDefault();
    return;
  }

  if (menuOpen) {
    if (handleMenuNavigation(event)) {
      event.preventDefault();
    }
    return;
  }

  const activeElement = document.activeElement;
  if (
    activeElement &&
    (activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.isContentEditable)
  ) {
    return;
  }

  const key = event.key.toLowerCase();
  if (currentGame === 'gaze' && key === 'r') {
    requestGazeRecalibration();
    event.preventDefault();
    return;
  }
  keys[key] = true;
  const p1Keys = Object.values(players[0].controls);
  const p2Keys = Object.values(players[1].controls);
  if (p1Keys.includes(key) || p2Keys.includes(key)) {
    event.preventDefault();
  }
});

window.addEventListener('keyup', (event) => {
  if (menuOpen || startMenuVisible) return;
  if (currentGame === 'flappyLion' && flabbyBirdGame.handleKeyUp(event)) {
    event.preventDefault();
    return;
  }
  keys[event.key.toLowerCase()] = false;
});

function getCurrentAIDifficulty() {
  return AI_DIFFICULTIES[aiDifficultyIndex] || AI_DIFFICULTIES[0];
}

function updateAIUI() {
  const difficulty = getCurrentAIDifficulty();
  if (aiToggleLabel) {
    aiToggleLabel.textContent = aiEnabled ? 'ON' : 'OFF';
  }
  if (aiDifficultyLabel) {
    aiDifficultyLabel.textContent = difficulty.label;
  }
  if (aiIndicator) {
    if (currentGame === 'shooter') {
      aiIndicator.textContent = '';
      aiIndicator.classList.remove('active');
    } else if (currentGame === 'gaze') {
      let label = 'GAZE MODE — IDLE';
      if (gazeGameState.initializing) {
        label = 'GAZE MODE — INITIALIZING';
      } else if (gazeGameState.calibrating) {
        label = 'GAZE MODE — CALIBRATING';
      } else if (gazeGameState.active) {
        label = 'GAZE MODE — TRACKING';
      }
      aiIndicator.textContent = label;
      aiIndicator.classList.add('active');
    } else if (currentGame === 'gazePaddle') {
      aiIndicator.textContent = 'GAZE PADDLE TEST MODE';
      aiIndicator.classList.add('active');
    } else if (currentGame === 'gazeRunner') {
      aiIndicator.textContent = 'GAZE LANE RUNNER';
      aiIndicator.classList.add('active');
    } else if (currentGame === 'pano') {
      aiIndicator.textContent = '';
      aiIndicator.classList.add('active');
    } else if (currentGame === 'flappyLion') {
      aiIndicator.textContent = '';
      aiIndicator.classList.remove('active');
    } else {
      aiIndicator.textContent = aiEnabled
        ? `P2 MODE — AI BOT (${difficulty.label})`
        : 'P2 MODE — HUMAN';
      aiIndicator.classList.toggle('active', aiEnabled);
    }
  }
}

function setAIDifficultyIndex(index) {
  const length = AI_DIFFICULTIES.length;
  aiDifficultyIndex = ((index % length) + length) % length;
  updateAIUI();
}

function cycleAIDifficulty(direction = 1) {
  setAIDifficultyIndex(aiDifficultyIndex + direction);
}

function setAIEnabled(enabled) {
  aiEnabled = enabled;
  const aiPlayer = players[1];
  if (aiPlayer) {
    aiPlayer.isAI = enabled;
    aiPlayer.velocity.set(0, 0);
    aiPlayer.angularVelocity = 0;
  }
  updateAIUI();
}

function toggleAI() {
  setAIEnabled(!aiEnabled);
}

function updateGame2AIUI() {
  if (aiDriverLabel) {
    aiDriverLabel.textContent = game2AIState.driver ? 'ON' : 'OFF';
  }
  if (aiTurretLabel) {
    aiTurretLabel.textContent = game2AIState.turret ? 'ON' : 'OFF';
  }
}

function setGame2AIDriver(enabled) {
  game2AIState.driver = enabled;
  clearMovementInputs();
  updateGame2AIUI();
}

function setGame2AITurret(enabled) {
  game2AIState.turret = enabled;
  keys[game2GunnerControls.rotateLeft] = false;
  keys[game2GunnerControls.rotateRight] = false;
  keys[game2GunnerControls.fire] = false;
  updateGame2AIUI();
}

function toggleGame2AIDriver() {
  setGame2AIDriver(!game2AIState.driver);
}

function toggleGame2AITurret() {
  setGame2AITurret(!game2AIState.turret);
}

let currentRound = 1;
let roundActive = false;
let nextRoundTimeout = null;
let matchResetTimeout = null;
let shakeTime = 0;

function setScoreboardText(left, center, right) {
  p1ScoreEl.textContent = left;
  roundInfoEl.textContent = center;
  p2ScoreEl.textContent = right;
}

function formatElapsed(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function stopPanoTimer({ reset = true } = {}) {
  panoTimerState.active = false;
  if (reset) {
    panoTimerState.elapsed = 0;
  }
}

function updatePanoTimerScoreboard() {
  const target = panoObjectsState.targetItem;
  if (!target) return;
  setScoreboardText(
    target.name.toUpperCase(),
    `TIME ${formatElapsed(panoTimerState.elapsed)}`,
    `DIFFICULTY — ${(target.difficulty || 'UNKNOWN').toUpperCase()}`
  );
}

function startPanoTimer() {
  panoTimerState.elapsed = 0;
  panoTimerState.active = true;
  updatePanoTimerScoreboard();
}

function createEmptyHeatmap() {
  return new Float32Array(PANO_HEATMAP_GRID_SIZE);
}

function getHeatmapObjectPath(objectId) {
  return path.join(PANO_HEATMAP_OBJECTS_DIR, `${objectId}.json`);
}

function serializeHeatmapBuffer(buffer) {
  return {
    version: 1,
    width: PANO_HEATMAP_GRID_WIDTH,
    height: PANO_HEATMAP_GRID_HEIGHT,
    data: Array.from(buffer),
    updatedAt: new Date().toISOString(),
  };
}

function deserializeHeatmapBuffer(payload) {
  if (!payload || payload.width !== PANO_HEATMAP_GRID_WIDTH || payload.height !== PANO_HEATMAP_GRID_HEIGHT) {
    return createEmptyHeatmap();
  }
  const source = Array.isArray(payload.data) ? payload.data : [];
  const target = createEmptyHeatmap();
  for (let i = 0; i < target.length; i += 1) {
    const value = Number(source[i]);
    target[i] = Number.isFinite(value) && value > 0 ? value : 0;
  }
  return target;
}

async function loadPanoHeatmaps() {
  if (panoHeatmapState.loaded) return;
  if (panoHeatmapState.loadingPromise) return panoHeatmapState.loadingPromise;
  panoHeatmapState.loadingPromise = (async () => {
    try {
      await fsPromises.mkdir(PANO_HEATMAP_OBJECTS_DIR, { recursive: true });
      try {
        const rawOverall = await fsPromises.readFile(path.join(PANO_HEATMAP_DIR, 'overall.json'), 'utf-8');
        panoHeatmapState.overall = deserializeHeatmapBuffer(JSON.parse(rawOverall));
      } catch {
        panoHeatmapState.overall = createEmptyHeatmap();
      }
      panoHeatmapState.perObject.clear();
      const entries = await fsPromises.readdir(PANO_HEATMAP_OBJECTS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const objectId = path.basename(entry.name, '.json');
        try {
          const raw = await fsPromises.readFile(path.join(PANO_HEATMAP_OBJECTS_DIR, entry.name), 'utf-8');
          panoHeatmapState.perObject.set(objectId, deserializeHeatmapBuffer(JSON.parse(raw)));
        } catch (error) {
          console.warn('[PanoHeatmap]', 'Failed to read object heatmap', objectId, error);
        }
      }
    } catch (error) {
      console.error('[PanoHeatmap]', 'Load failed', error);
    } finally {
      panoHeatmapState.loaded = true;
      panoHeatmapState.loadingPromise = null;
      refreshPanoHeatmapObjectSelect();
      updatePanoHeatmapControlsUI();
    }
  })();
  return panoHeatmapState.loadingPromise;
}

function getObjectHeatmap(objectId) {
  if (!objectId) return null;
  let map = panoHeatmapState.perObject.get(objectId);
  if (!map) {
    map = createEmptyHeatmap();
    panoHeatmapState.perObject.set(objectId, map);
  }
  return map;
}

async function flushPanoHeatmaps() {
  if (!panoHeatmapState.loaded) return;
  if (!panoHeatmapState.dirtyOverall && panoHeatmapState.dirtyObjectIds.size === 0) return;
  if (panoHeatmapState.savingPromise) return panoHeatmapState.savingPromise;
  const dirtyObjectIds = Array.from(panoHeatmapState.dirtyObjectIds);
  const saveOverall = panoHeatmapState.dirtyOverall;
  panoHeatmapState.dirtyOverall = false;
  panoHeatmapState.dirtyObjectIds.clear();
  panoHeatmapState.savingPromise = (async () => {
    try {
      await fsPromises.mkdir(PANO_HEATMAP_OBJECTS_DIR, { recursive: true });
      if (saveOverall) {
        await fsPromises.writeFile(
          path.join(PANO_HEATMAP_DIR, 'overall.json'),
          JSON.stringify(serializeHeatmapBuffer(panoHeatmapState.overall)),
          'utf-8'
        );
      }
      for (const objectId of dirtyObjectIds) {
        const objectHeatmap = panoHeatmapState.perObject.get(objectId);
        if (!objectHeatmap) continue;
        await fsPromises.writeFile(
          getHeatmapObjectPath(objectId),
          JSON.stringify(serializeHeatmapBuffer(objectHeatmap)),
          'utf-8'
        );
      }
    } catch (error) {
      console.error('[PanoHeatmap]', 'Save failed', error);
      if (saveOverall) panoHeatmapState.dirtyOverall = true;
      dirtyObjectIds.forEach((id) => panoHeatmapState.dirtyObjectIds.add(id));
    } finally {
      panoHeatmapState.savingPromise = null;
      panoHeatmapState.saveElapsed = 0;
    }
  })();
  return panoHeatmapState.savingPromise;
}

function refreshPanoHeatmapObjectSelect() {
  if (!panoHeatmapObjectSelect) return;
  const previous = panoHeatmapState.selectedObjectId;
  panoHeatmapObjectSelect.innerHTML = '';
  const items = panoObjectsState.items || [];
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name.toUpperCase();
    panoHeatmapObjectSelect.appendChild(option);
  });
  const fallback = (panoObjectsState.targetItem && panoObjectsState.targetItem.id) || (items[0] && items[0].id) || null;
  panoHeatmapState.selectedObjectId = previous && items.some((item) => item.id === previous) ? previous : fallback;
  if (panoHeatmapState.selectedObjectId) {
    panoHeatmapObjectSelect.value = panoHeatmapState.selectedObjectId;
  }
}

function cyclePanoHeatmapMode() {
  if (panoHeatmapState.overlayMode === 'off') {
    panoHeatmapState.overlayMode = 'overall';
  } else if (panoHeatmapState.overlayMode === 'overall') {
    panoHeatmapState.overlayMode = 'object';
    if (!panoHeatmapState.selectedObjectId && panoObjectsState.targetItem) {
      panoHeatmapState.selectedObjectId = panoObjectsState.targetItem.id;
    }
  } else {
    panoHeatmapState.overlayMode = 'off';
  }
  updatePanoHeatmapControlsUI();
}

function updatePanoHeatmapControlsUI() {
  if (!panoHeatmapModeButton || !panoHeatmapObjectSelect) return;
  const modeLabel =
    panoHeatmapState.overlayMode === 'overall'
      ? 'HEATMAP: OVERALL'
      : panoHeatmapState.overlayMode === 'object'
        ? 'HEATMAP: OBJECT'
        : 'HEATMAP: OFF';
  panoHeatmapModeButton.textContent = modeLabel;
  const showObjectSelect =
    panoHeatmapState.overlayMode === 'object' && Boolean((panoObjectsState.items || []).length);
  panoHeatmapObjectSelect.classList.toggle('hidden', !showObjectSelect);
  if (showObjectSelect && panoHeatmapState.selectedObjectId) {
    panoHeatmapObjectSelect.value = panoHeatmapState.selectedObjectId;
  }
}

function updatePanoHeatmapControlsVisibility() {
  if (!panoHeatmapControls) return;
  panoHeatmapControls.classList.toggle('hidden', currentGame !== 'pano');
}

function setPanoHeatmapOverlayVisible(visible) {
  if (!panoHeatmapOverlay) return;
  panoHeatmapOverlay.classList.toggle('hidden', !visible);
}

function resizePanoHeatmapCanvas() {
  if (!panoHeatmapCanvas) return;
  panoHeatmapCanvas.width = window.innerWidth;
  panoHeatmapCanvas.height = Math.max(window.innerHeight, 1);
}

function updateGazePaddleButton() {
  if (!gazePaddleButton) return;
  const enabled = !!gazeGameState.readyForPaddle;
  gazePaddleButton.disabled = !enabled;
  gazePaddleButton.textContent = enabled ? 'Gaze Paddle Test' : 'Gaze Paddle Test (calibrate first)';
}

function updateGazeRunnerButton() {
  if (!gazeRunnerButton) return;
  const enabled = !!gazeGameState.readyForRunner;
  gazeRunnerButton.disabled = !enabled;
  gazeRunnerButton.textContent = enabled ? 'Gaze Lane Runner' : 'Gaze Lane Runner (calibrate first)';
}

function showGazePanel() {
  if (gazePanel) {
    gazePanel.classList.remove('hidden');
  }
}

function hideGazePanel() {
  if (gazePanel) {
    gazePanel.classList.add('hidden');
  }
}

function setGazeStatusText(text) {
  if (gazeStatus) {
    gazeStatus.textContent = text;
  }
}

function setGazeCoordsText(x, y) {
  if (!gazeCoords) return;
  if (typeof x !== 'number' || typeof y !== 'number') {
    gazeCoords.textContent = 'x: ---, y: ---';
    return;
  }
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const pctX = Math.min(100, Math.max(0, (x / width) * 100));
  const pctY = Math.min(100, Math.max(0, (y / height) * 100));
  gazeCoords.textContent = `x: ${Math.round(x)} (${pctX.toFixed(1)}%) · y: ${Math.round(y)} (${pctY.toFixed(1)}%)`;
}

function refreshGazePaddleCanvas() {
  if (!gazePaddleCanvas) return;
  const shouldShow =
    gazePaddleState.canvasVisible && gazePaddleState.active && !menuOpen && !startMenuVisible;
  gazePaddleCanvas.classList.toggle('active', shouldShow);
}

function showGazePaddleCanvas(visible) {
  gazePaddleState.canvasVisible = visible;
  refreshGazePaddleCanvas();
}

function updatePaddleWidthForScore() {
  const baseWidth = gazePaddleState.basePaddleWidth || gazePaddleState.paddleWidth;
  const growthPerPoint =
    gazePaddleState.paddleGrowthPerPoint != null ? gazePaddleState.paddleGrowthPerPoint : 0;
  const maxWidth =
    gazePaddleState.maxPaddleWidth || Math.max(baseWidth, gazePaddleState.paddleWidth);
  const score = Math.max(0, gazePaddleState.score || 0);
  const targetWidth = Math.min(maxWidth, baseWidth + score * growthPerPoint);
  gazePaddleState.paddleWidth = targetWidth;
}

function updateGazePaddleDimensions({ preserveState = false } = {}) {
  if (!gazePaddleCanvas) return;
  const previousWidth = gazePaddleState.width;
  const previousHeight = gazePaddleState.height;

  const aspect = 16 / 9;
  const maxWidth = Math.max(560, Math.min(window.innerWidth * 0.9, 1400));
  const maxHeight = Math.max(320, Math.min(window.innerHeight * 0.8, 900));
  let width = maxWidth;
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  width = Math.round(width);
  height = Math.round(height);
  const widthRatio = previousWidth ? width / previousWidth : 1;
  const heightRatio = previousHeight ? height / previousHeight : 1;

  gazePaddleState.width = width;
  gazePaddleState.height = height;
  gazePaddleCanvas.width = width;
  gazePaddleCanvas.height = height;
  gazePaddleCanvas.style.width = `${width}px`;
  gazePaddleCanvas.style.height = `${height}px`;

  const newPaddleWidth = Math.round(width * 0.28);
  const newPaddleHeight = Math.round(height * 0.05);
  const newBallRadius = Math.max(12, Math.round(height * 0.035));
  gazePaddleState.basePaddleWidth = newPaddleWidth;
  gazePaddleState.paddleGrowthPerPoint = Math.max(1, Math.round(newPaddleWidth * 0.03));
  gazePaddleState.maxPaddleWidth = Math.round(width * 0.5);
  updatePaddleWidthForScore();
  gazePaddleState.paddleHeight = newPaddleHeight;
  gazePaddleState.ballRadius = newBallRadius;
  gazePaddleState.baseSpeed = Math.round(width * 0.18);

  if (preserveState && gazePaddleState.active && previousWidth && previousHeight) {
    gazePaddleState.ballX = Math.min(
      width - newBallRadius,
      Math.max(newBallRadius, gazePaddleState.ballX * widthRatio)
    );
    gazePaddleState.ballY = Math.min(
      height - newBallRadius,
      Math.max(newBallRadius, gazePaddleState.ballY * heightRatio)
    );
    gazePaddleState.ballVX *= widthRatio;
    gazePaddleState.ballVY *= heightRatio;
  }
}

function computeLaneRunnerLanes() {
  const span = laneRunnerState.laneSpan;
  const count = laneRunnerState.laneCount;
  laneRunnerState.laneWidth = span / count;
  laneRunnerState.laneLeftEdge = -span / 2;
  laneRunnerState.lanePositions.length = 0;
  for (let i = 0; i < count; i += 1) {
    laneRunnerState.lanePositions.push(
      laneRunnerState.laneLeftEdge + laneRunnerState.laneWidth * (i + 0.5)
    );
  }
}

function resetGazePaddleBall() {
  gazePaddleState.ballX = gazePaddleState.width / 2;
  gazePaddleState.ballY = gazePaddleState.height * 0.35;
  const angle = THREE.MathUtils.randFloat(-0.85, 0.85);
  const speed = gazePaddleState.baseSpeed + gazePaddleState.score * 12;
  gazePaddleState.ballVX = Math.sin(angle) * speed;
  gazePaddleState.ballVY = Math.abs(Math.cos(angle) * speed);
}

function cleanupGazePaddle() {
  gazePaddleState.active = false;
  gazeGameState.active = false;
  showGazePaddleCanvas(false);
  if (gazePaddleCtx) {
    gazePaddleCtx.clearRect(0, 0, gazePaddleState.width, gazePaddleState.height);
  }
}

function updateGazePointerPosition(x, y) {
  if (!gazePointer) return;
  if (typeof x !== 'number' || typeof y !== 'number') {
    gazePointer.style.opacity = '0';
    return;
  }
  const clampedX = Math.max(0, Math.min(window.innerWidth, x));
  const clampedY = Math.max(0, Math.min(window.innerHeight, y));
  gazePointer.style.left = `${clampedX}px`;
  gazePointer.style.top = `${clampedY}px`;
  gazePointer.style.opacity = '1';
}

function resetGazePanel() {
  setGazeStatusText('GAZE MODE — IDLE');
  setGazeCoordsText(null, null);
  hideGazePanel();
  updateGazePointerPosition(null, null);
}

function handleGazeError(message, error) {
  if (error) {
    console.error('[Gaze Game]', error);
  }
  gazeGameState.active = false;
  gazeGameState.calibrating = false;
  setScoreboardText('GAZE CALIBRATION', 'ERROR', '');
  setGazeStatusText('GAZE MODE — ERROR');
  showCenterMessage(message, 0);
  updateGazePointerPosition(null, null);
  updateAIUI();
}

function updateScoreboard() {
  if (currentGame !== 'joust') return;
  setScoreboardText(
    `PLAYER 1 — ${players[0].score}`,
    `ROUND ${currentRound} / ${ROUND_LIMIT}`,
    `PLAYER 2 — ${players[1].score}`
  );
}

function showCenterMessage(message, duration = 1200) {
  centerMessage.textContent = message;
  if (duration > 0) {
    setTimeout(() => {
      if (centerMessage.textContent === message) {
        centerMessage.textContent = '';
      }
    }, duration);
  }
}

function pulseScore(element) {
  if (!element) return;
  element.classList.add('scored');
  setTimeout(() => {
    element.classList.remove('scored');
  }, 600);
}

function highlightStartButton() {
  if (!startMenuButtons.length) return;
  startMenuButtons.forEach((button) => button.classList.remove('menu-focus'));
  const button = startMenuButtons[startMenuIndex];
  if (button) {
    button.classList.add('menu-focus');
    button.focus();
  }
  updateStartMenuGuide(button);
}

function moveStartMenuSelection(direction) {
  if (!startMenuButtons.length) return;
  const length = startMenuButtons.length;
  startMenuIndex = (startMenuIndex + direction + length) % length;
  highlightStartButton();
}

function updateControlHints(mode) {
  if (!controlBlocks.length) return;
  if (mode === 'shooter') {
    controlBlocks[0].innerHTML = `<span>Driver</span>Move: W A S D · Rotate: Q / E`;
    controlBlocks[1].innerHTML = `<span>Gunner</span>Rotate turret: J / L · Fire: I`;
  } else if (mode === 'gaze') {
    controlBlocks[0].innerHTML = `<span>Gaze Calibration</span>Allow webcam access, follow the dots, tap Space / A`;
    controlBlocks[1].innerHTML = `<span>Prediction Output</span>Move your eyes to see live X/Y updates · Press R to recalibrate`;
  } else if (mode === 'gazePaddle') {
    controlBlocks[0].innerHTML = `<span>Gaze Paddle</span>Look left/right to move the paddle · keep the glowing ball in play`;
    controlBlocks[1].innerHTML = `<span>Tips</span>Stay relaxed · fix your head · press ESC to exit or R in calibration mode`;
  } else if (mode === 'gazeRunner') {
    controlBlocks[0].innerHTML = `<span>Gaze Lane Runner</span>Shift your gaze toward a lane to switch · avoid incoming robots`;
    controlBlocks[1].innerHTML = `<span>Tips</span>Keep your head still · use wide gaze motions · ESC to pause`;
  } else if (mode === 'pano') {
    controlBlocks[0].innerHTML = `<span>Panorama Hunt</span>Drag or P1 left stick to pan · Scroll or P1 right stick (up/down) to zoom`;
    controlBlocks[1].innerHTML = `<span>Tips</span>Click or P1 A checks center point · ESC for menu`;
  } else if (mode === 'flappyLion') {
    controlBlocks[0].innerHTML = `<span>Flappy Lion</span>W flaps the left board · I flaps the right board · Enter selects`;
    controlBlocks[1].innerHTML = `<span>Tips</span>R restarts after a crash · ESC exits back to the arcade menu`;
  } else {
    controlBlocks[0].innerHTML = `<span>P1 (Neon Cyan)</span>Move: W A S D · Rotate: Q / E`;
    controlBlocks[1].innerHTML = `<span>P2 (Neon Magenta)</span>Move: I J K L · Rotate: U / O`;
  }
}

function handleStartMenuKeydown(event) {
  const key = event.key.toLowerCase();
  if (key === 'arrowup' || key === 'w') {
    moveStartMenuSelection(-1);
    event.preventDefault();
    return true;
  }
  if (key === 'arrowdown' || key === 's') {
    moveStartMenuSelection(1);
    event.preventDefault();
    return true;
  }
  if (key === 'enter' || key === ' ') {
    const button = startMenuButtons[startMenuIndex];
    if (button) {
      selectGame(button.dataset.game);
      event.preventDefault();
      return true;
    }
  }
  return false;
}

function applyVisualMode(gameKey) {
  const isShooter = gameKey === 'shooter';
  const isPano = gameKey === 'pano';
  shooterGrid.visible = isShooter;
  if (grid) {
    grid.visible = !isPano;
  }
  floorMaterial.opacity = isShooter ? 0.25 : 0.65;
  if (floorPlane) {
    floorPlane.visible = !isPano;
  }
  arenaSurface.visible = !isShooter && !isPano;
  glowingRim.visible = !isShooter && !isPano;
  shooterRim.visible = isShooter;
}

function updatePanoDevVisibility(gameKey) {
  if (!panoDevPanel) return;
  const visible = panoDevState.enabled && gameKey === 'pano';
  if (!visible) {
    setPanoDevPanelVisible(false);
    setPanoDevOverlayVisibility(false);
  }
  updatePanoDevToggleButton();
}

function updatePanoResetButtonVisibility() {
  if (!panoResetButton) return;
  panoResetButton.classList.toggle('hidden', currentGame !== 'pano');
}

function ensureWebGazerReady({ useSavedCalibration = false } = {}) {
  if (webGazerInitialized) {
    return Promise.resolve();
  }
  if (gazeInitPromise) {
    return gazeInitPromise;
  }
  gazeGameState.initializing = true;
  updateAIUI();
  const resetModel = !useSavedCalibration;
  gazeInitPromise = loadGazeModule()
    .then(({ initWebGazer }) =>
      initWebGazer({
        regression: 'ridge',
        tracker: 'clmtrackr',
        applyKalmanFilter: true,
        saveDataAcrossSessions: true,
        showDebugDots: false,
        resetModel,
      })
    )
    .then(() => {
      webGazerInitialized = true;
    })
    .finally(() => {
      gazeGameState.initializing = false;
      gazeInitPromise = null;
    });
  return gazeInitPromise;
}

async function ensureGazeListener() {
  if (gazeGameState.listenerAttached) return;
  const { startGazeListener } = await loadGazeModule();
  startGazeListener((x, y) => {
    if (!gazeGameState.active) return;
    const width = Math.max(window.innerWidth, 1);
    const normalizedX = THREE.MathUtils.clamp(x / width, 0, 1);
    gazeGameState.targetX = normalizedX;
    if (currentGame === 'gaze') {
      setGazeCoordsText(x, y);
      updateGazePointerPosition(x, y);
    } else if (currentGame === 'gazePaddle') {
      gazePaddleState.targetX = normalizedX;
    }
  });
  gazeGameState.listenerAttached = true;
}

async function runGazeCalibrationStep({ sessionId, randomizeOffsets = false } = {}) {
  if (gazeGameState.sessionId !== sessionId) return false;
  gazeGameState.calibrating = true;
  const statusLabel = randomizeOffsets ? 'RECALIBRATING' : 'CALIBRATING';
  const centerLabel = randomizeOffsets
    ? 'Recalibration: follow shifted dots + tap Space / A'
    : 'Look at each dot + press Space / A';
  setGazeStatusText(`GAZE MODE — ${statusLabel}`);
  setScoreboardText('GAZE CALIBRATION', statusLabel, '');
  showCenterMessage(centerLabel, 0);
  setGazeCoordsText(null, null);
  updateGazePointerPosition(null, null);
  updateAIUI();
  try {
    const { runCalibration } = await loadGazeModule();
    await runCalibration({ randomizeOffsets });
  } catch (error) {
    if (gazeGameState.sessionId === sessionId && currentGame === 'gaze') {
      handleGazeError(
        randomizeOffsets ? 'Recalibration interrupted' : 'Calibration interrupted',
        error
      );
    }
    return false;
  } finally {
    gazeGameState.calibrating = false;
  }
  if (gazeGameState.sessionId !== sessionId || currentGame !== 'gaze') {
    return false;
  }
  return true;
}

function cleanupGazeGame() {
  gazeGameState.active = false;
  gazeGameState.calibrating = false;
  gazeGameState.initializing = false;
  gazeGameState.sessionId = null;
  resetGazePanel();
  updateAIUI();
}

async function initGazeGame() {
  cleanupGame1();
  cleanupGame2();
  const sessionId = ++gazeSessionCounter;
  gazeGameState.sessionId = sessionId;
  const useSavedCalibration = !!gazeGameState.useSavedCalibration;
  gazeGameState.useSavedCalibration = false;
  showGazePanel();
  const statusLabel = useSavedCalibration ? 'LOADING SAVED CALIBRATION' : 'INITIALIZING';
  setGazeStatusText(`GAZE MODE — ${statusLabel}`);
  setGazeCoordsText(null, null);
  resetMainCamera();
  setScoreboardText('GAZE CALIBRATION', statusLabel, '');
  const initMessage = useSavedCalibration
    ? 'Loading saved calibration profile for debug testing'
    : 'Allow webcam access to begin';
  showCenterMessage(initMessage, 0);
  gazeGameState.active = false;
  gazeGameState.calibrating = false;
  updateAIUI();

  try {
    await ensureWebGazerReady({ useSavedCalibration });
  } catch (error) {
    if (gazeGameState.sessionId === sessionId && currentGame === 'gaze') {
      handleGazeError('Camera access failed', error);
    }
    return;
  }

  if (gazeGameState.sessionId !== sessionId || currentGame !== 'gaze') return;

  if (GAZE_CALIBRATION_ENABLED) {
    const calibrationSuccess = await runGazeCalibrationStep({ sessionId, randomizeOffsets: false });
    if (!calibrationSuccess) return;
    if (gazeGameState.sessionId !== sessionId || currentGame !== 'gaze') return;
    gazeGameState.active = true;
    gazeGameState.readyForPaddle = true;
    gazeGameState.readyForRunner = true;
    updateGazePaddleButton();
    updateGazeRunnerButton();
    setGazeStatusText('GAZE MODE — TRACKING');
    setScoreboardText('GAZE CALIBRATION', 'TRACKING', '');
    showCenterMessage('Tracking active — press R to recalibrate', 0);
    setGazeCoordsText(null, null);
    await ensureGazeListener();
    updateAIUI();
    return;
  }

  // Calibration disabled for testing
  gazeGameState.active = true;
  gazeGameState.readyForPaddle = true;
  gazeGameState.readyForRunner = true;
  updateGazePaddleButton();
  updateGazeRunnerButton();
  setGazeStatusText('GAZE MODE — TESTING');
  setScoreboardText('GAZE CALIBRATION', 'TEST MODE', '');
  showCenterMessage('Look & Click to calibrate', 0);
  setGazeCoordsText(null, null);
  await ensureGazeListener();
  updateAIUI();
}

async function requestGazeRecalibration() {
  if (currentGame !== 'gaze') return;
  if (gazeGameState.calibrating) return;
  if (!gazeGameState.active) return;
  if (!GAZE_CALIBRATION_ENABLED) {
    showCenterMessage('Calibration is temporarily disabled for testing', 1600);
    return;
  }
  const sessionId = gazeGameState.sessionId;
  const success = await runGazeCalibrationStep({ sessionId, randomizeOffsets: true });
  if (!success || gazeGameState.sessionId !== sessionId || currentGame !== 'gaze') return;
  setGazeStatusText('GAZE MODE — TRACKING');
  setScoreboardText('GAZE CALIBRATION', 'TRACKING', '');
  showCenterMessage('Recalibration complete — tracking updated', 1600);
  setGazeCoordsText(null, null);
  updateAIUI();
}

function updateGazePaddleScoreboard() {
  setScoreboardText('GAZE PADDLE', `SCORE ${gazePaddleState.score}`, `MISSES ${gazePaddleState.misses}`);
}

function initGazePaddleGame() {
  cleanupGame1();
  cleanupGame2();
  cleanupGazeGame();
  resetMainCamera();
  gazeGameState.active = true;
  gazeGameState.readyForPaddle = true;
  updateGazePaddleButton();
  gazePaddleState.active = true;
  gazePaddleState.score = 0;
  gazePaddleState.misses = 0;
  gazePaddleState.paddleX = 0.5;
  gazePaddleState.targetX = gazeGameState.targetX || 0.5;
  updateGazePaddleDimensions();
  resetGazePaddleBall();
  showGazePaddleCanvas(true);
  updateGazePaddleScoreboard();
  showCenterMessage('Move the paddle with your gaze. Keep the ball in play!', 2800);
  ensureGazeListener();
  updateControlHints('gazePaddle');
}

function updateGazePaddle(delta) {
  if (!gazePaddleState.active || menuOpen || startMenuVisible) return;
  const width = gazePaddleState.width;
  const height = gazePaddleState.height;
  const paddleHalf = gazePaddleState.paddleWidth / 2;
  const paddleY = height - gazePaddleState.paddleHeight - 6;
  const smoothing = Math.min(1, delta * 8);
  gazePaddleState.paddleX = THREE.MathUtils.lerp(
    gazePaddleState.paddleX,
    THREE.MathUtils.clamp(gazePaddleState.targetX, 0.05, 0.95),
    smoothing
  );
  const paddleCenter = gazePaddleState.paddleX * width;

  gazePaddleState.ballX += gazePaddleState.ballVX * delta;
  gazePaddleState.ballY += gazePaddleState.ballVY * delta;

  if (gazePaddleState.ballX <= gazePaddleState.ballRadius) {
    gazePaddleState.ballX = gazePaddleState.ballRadius;
    gazePaddleState.ballVX *= -1;
  } else if (gazePaddleState.ballX >= width - gazePaddleState.ballRadius) {
    gazePaddleState.ballX = width - gazePaddleState.ballRadius;
    gazePaddleState.ballVX *= -1;
  }
  if (gazePaddleState.ballY <= gazePaddleState.ballRadius) {
    gazePaddleState.ballY = gazePaddleState.ballRadius;
    gazePaddleState.ballVY = Math.abs(gazePaddleState.ballVY);
  }

  if (gazePaddleState.ballY + gazePaddleState.ballRadius >= paddleY) {
    if (
      gazePaddleState.ballX >= paddleCenter - paddleHalf &&
      gazePaddleState.ballX <= paddleCenter + paddleHalf &&
      gazePaddleState.ballVY > 0
    ) {
      const offset = (gazePaddleState.ballX - paddleCenter) / paddleHalf;
      gazePaddleState.ballVY *= -1;
      gazePaddleState.ballVX += offset * 60;
      gazePaddleState.score += 1;
      updatePaddleWidthForScore();
      updateGazePaddleScoreboard();
    } else if (gazePaddleState.ballY >= height - gazePaddleState.ballRadius) {
      gazePaddleState.misses += 1;
      resetGazePaddleBall();
      updateGazePaddleScoreboard();
    }
  }

  drawGazePaddleCanvas();
}

function drawGazePaddleCanvas() {
  if (!gazePaddleCtx || !gazePaddleState.active) return;
  const ctx = gazePaddleCtx;
  const width = gazePaddleState.width;
  const height = gazePaddleState.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#05081d';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(83, 255, 210, 0.4)';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, width - 8, height - 8);
  const paddleCenter = gazePaddleState.paddleX * width;
  ctx.fillStyle = '#53ffd2';
  ctx.fillRect(
    paddleCenter - gazePaddleState.paddleWidth / 2,
    height - gazePaddleState.paddleHeight - 6,
    gazePaddleState.paddleWidth,
    gazePaddleState.paddleHeight
  );
  ctx.fillStyle = '#f6ff92';
  ctx.beginPath();
  ctx.arc(gazePaddleState.ballX, gazePaddleState.ballY, gazePaddleState.ballRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(246, 255, 146, 0.35)';
  ctx.fillRect(
    THREE.MathUtils.clamp(gazeGameState.targetX, 0.02, 0.98) * width - 2,
    10,
    4,
    height - 20
  );
}

function cleanupLaneRunner() {
  if (laneRunnerState.robot) {
    scene.remove(laneRunnerState.robot);
    laneRunnerState.robot = null;
  }
  if (laneRunnerState.track) {
    scene.remove(laneRunnerState.track);
    laneRunnerState.track.geometry.dispose();
    laneRunnerState.track.material.dispose();
    laneRunnerState.track = null;
  }
  laneRunnerState.laneLines.forEach((line) => {
    scene.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  });
  laneRunnerState.laneLines.length = 0;
  laneRunnerState.obstacles.forEach((obstacle) => {
    if (obstacle.mesh) {
      scene.remove(obstacle.mesh);
      obstacle.mesh.geometry.dispose();
      obstacle.mesh.material.dispose();
    }
  });
  laneRunnerState.obstacles.length = 0;
  laneRunnerState.active = false;
  laneRunnerState.endTimeout = null;
  gazeGameState.active = false;
  refreshGazePaddleCanvas();
}

function initLaneRunnerGame() {
  cleanupGame1();
  cleanupGame2();
  cleanupGazePaddle();
  cleanupGazeGame();
  cleanupLaneRunner();
  laneRunnerState.active = true;
  laneRunnerState.distance = 0;
  laneRunnerState.lives = 3;
  laneRunnerState.currentLaneIndex = 1;
  laneRunnerState.targetLaneIndex = 1;
  laneRunnerState.spawnTimer = 1;
  laneRunnerState.speed = 18;
  computeLaneRunnerLanes();
  laneRunnerState.obstacles.length = 0;
  gazeGameState.active = true;
  gazeGameState.targetX = 0.5;
  const robot = createRobot(0x53ffd2, 0xf6ff92);
  robot.position.set(laneRunnerState.lanePositions[1], 0, 4);
  robot.rotation.y = Math.PI;
  scene.add(robot);
  laneRunnerState.robot = robot;
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(laneRunnerState.laneSpan + 4, 150),
    new THREE.MeshStandardMaterial({
      color: 0x05081d,
      emissive: 0x031229,
      emissiveIntensity: 0.6,
      roughness: 0.85,
    })
  );
  track.rotation.x = -Math.PI / 2;
  track.position.set(0, -0.02, -40);
  scene.add(track);
  laneRunnerState.track = track;
  const laneLines = [];
  for (let i = 0; i <= laneRunnerState.laneCount; i += 1) {
    const isEdge = i === 0 || i === laneRunnerState.laneCount;
    const x = laneRunnerState.laneLeftEdge + laneRunnerState.laneWidth * i;
    const divider = new THREE.Mesh(
      new THREE.BoxGeometry(isEdge ? 1.2 : 0.35, 0.05, 150),
      new THREE.MeshBasicMaterial({
        color: isEdge ? 0xf6ff92 : 0x53ffd2,
        transparent: true,
        opacity: isEdge ? 0.85 : 0.65,
      })
    );
    divider.position.set(x, -0.01, -40);
    divider.rotation.x = -Math.PI / 2;
    scene.add(divider);
    laneLines.push(divider);
  }
  laneRunnerState.laneLines = laneLines;
  camera.fov = 56;
  camera.position.set(0, 30, 32);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, -40);
  camera.updateProjectionMatrix();
  setScoreboardText('GAZE LANE RUNNER', 'READY', 'LIVES 3');
  showCenterMessage('Look left/right to change lanes. Avoid the chargers!', 2800);
  updateControlHints('gazeRunner');
  updateAIUI();
  ensureGazeListener();
}

function spawnLaneRunnerObstacle() {
  const laneIndex = Math.floor(Math.random() * laneRunnerState.lanePositions.length);
  const geometry = new THREE.BoxGeometry(1.6, 1.4, 2.8);
  const material = new THREE.MeshStandardMaterial({
    color: 0xff5ad8,
    emissive: 0x330533,
    metalness: 0.1,
    roughness: 0.35,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(laneRunnerState.lanePositions[laneIndex], 0.7, -80);
  scene.add(mesh);
  laneRunnerState.obstacles.push({ mesh, laneIndex });
  laneRunnerState.spawnTimer = THREE.MathUtils.randFloat(0.65, 1.25);
}

function updateLaneRunnerHUD() {
  setScoreboardText(
    `DIST ${laneRunnerState.distance.toFixed(0)}M`,
    'GAZE LANE RUNNER',
    `LIVES ${laneRunnerState.lives}`
  );
}

function endLaneRunnerRun(message) {
  if (!laneRunnerState.active) return;
  laneRunnerState.active = false;
  showCenterMessage(message, 2200);
  setTimeout(() => {
    cleanupLaneRunner();
    showStartMenu();
  }, 2300);
}

function updateLaneRunner(delta) {
  if (!laneRunnerState.active || menuOpen || startMenuVisible) return;
  if (!laneRunnerState.robot) return;
  const laneCount = laneRunnerState.laneCount;
  const normalized = THREE.MathUtils.clamp(gazeGameState.targetX, 0, 0.9999);
  const candidateLane = Math.max(0, Math.min(laneCount - 1, Math.floor(normalized * laneCount)));
  if (candidateLane === laneRunnerState.lastLaneCandidate) {
    laneRunnerState.laneSwitchTimer += delta;
  } else {
    laneRunnerState.lastLaneCandidate = candidateLane;
    laneRunnerState.laneSwitchTimer = 0;
  }
  if (
    candidateLane !== laneRunnerState.targetLaneIndex &&
    laneRunnerState.laneSwitchTimer >= 0.18
  ) {
    laneRunnerState.targetLaneIndex = candidateLane;
  }
  laneRunnerState.currentLaneIndex = THREE.MathUtils.lerp(
    laneRunnerState.currentLaneIndex,
    laneRunnerState.targetLaneIndex,
    Math.min(1, delta * 5)
  );
  const laneCenterIndex = Math.max(
    0,
    Math.min(laneCount - 1, Math.round(laneRunnerState.currentLaneIndex))
  );
  const currentLaneCenter = laneRunnerState.lanePositions[laneCenterIndex];
  laneRunnerState.robot.position.x = THREE.MathUtils.lerp(
    laneRunnerState.robot.position.x,
    currentLaneCenter,
    Math.min(1, delta * 10)
  );
  laneRunnerState.distance += laneRunnerState.speed * delta * 1.6;
  laneRunnerState.spawnTimer -= delta;
  if (laneRunnerState.spawnTimer <= 0) {
    spawnLaneRunnerObstacle();
  }
  const targetLane = laneRunnerState.targetLaneIndex;
  for (let i = laneRunnerState.obstacles.length - 1; i >= 0; i -= 1) {
    const obstacle = laneRunnerState.obstacles[i];
    obstacle.mesh.position.z += laneRunnerState.speed * delta * 2.2;
    if (obstacle.mesh.position.z > 25) {
      scene.remove(obstacle.mesh);
      obstacle.mesh.geometry.dispose();
      obstacle.mesh.material.dispose();
      laneRunnerState.obstacles.splice(i, 1);
      continue;
    }
    const sameLane = obstacle.laneIndex === targetLane;
    if (
      sameLane &&
      obstacle.mesh.position.z > 2 &&
      obstacle.mesh.position.z < 6
    ) {
      laneRunnerState.lives -= 1;
      triggerHitFlash(0xff5ad8);
      spawnImpactRing(obstacle.mesh.position.clone(), 0xff5ad8);
      scene.remove(obstacle.mesh);
      obstacle.mesh.geometry.dispose();
      obstacle.mesh.material.dispose();
      laneRunnerState.obstacles.splice(i, 1);
      if (laneRunnerState.lives <= 0) {
        updateLaneRunnerHUD();
        endLaneRunnerRun('RUN TERMINATED');
        return;
      }
    }
  }
  updateLaneRunnerHUD();
}

const PANO_PLACEHOLDER_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAAC0lEQVR42mP8z/C/HwAFhQL/3V9F1QAAAABJRU5ErkJggg==';

async function loadPanoObjects() {
  if (panoObjectsState.loaded) {
    return panoObjectsState.items;
  }
  try {
    const entries = await fsPromises.readdir(PANO_OBJECTS_DIR);
    const items = [];
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.json')) continue;
      try {
        const content = await fsPromises.readFile(path.join(PANO_OBJECTS_DIR, entry), 'utf-8');
        const parsed = JSON.parse(content);
        if (!parsed || !parsed.name) continue;
        const polygons = Array.isArray(parsed.polygons) ? parsed.polygons : [];
        const filePath = path.join(PANO_OBJECTS_DIR, entry);
        items.push({
          ...parsed,
          polygons,
          id: path.basename(entry, '.json'),
          filePath,
        });
      } catch (error) {
        console.error('[PanoObjects]', entry, error);
      }
    }
    items.sort((a, b) => {
      const diff = getDifficultyPriority(a.difficulty) - getDifficultyPriority(b.difficulty);
      if (diff !== 0) {
        return diff;
      }
      return a.name.localeCompare(b.name);
    });
    panoObjectsState.items = items;
  } catch (error) {
    console.error('[PanoObjects]', error);
    panoObjectsState.items = [];
  } finally {
    panoObjectsState.loaded = true;
  }
  refreshPanoHeatmapObjectSelect();
  updatePanoHeatmapControlsUI();
  return panoObjectsState.items;
}

function setPanoSelectorVisible(visible) {
  if (!panoSelector) return;
  if (visible) {
    panoSelector.classList.remove('hidden');
    panoSelector.classList.add('visible');
  } else {
    panoSelector.classList.add('hidden');
    panoSelector.classList.remove('visible');
  }
  panoState.selectionVisible = visible;
  if (visible) {
    hidePanoHintCard();
    hidePanoFoundOverlay();
    setScoreboardText('FIND THE OBJECT', 'SELECT A TARGET', 'P1 A TO SELECT');
  }
  if (panoDevSelectorSkip) {
    panoDevSelectorSkip.classList.toggle('hidden', !visible || !panoDevState.enabled);
  }
  setPanoCrosshairVisible(!visible && currentGame === 'pano');
}

function setPanoCrosshairVisible(visible) {
  if (!panoCrosshair) return;
  panoCrosshair.classList.toggle('hidden', !visible);
}

function updatePanoCrosshairVisibility() {
  setPanoCrosshairVisible(
    currentGame === 'pano' &&
      panoState.active &&
      !menuOpen &&
      !startMenuVisible &&
      !panoState.selectionVisible
  );
}

function setPanoSelectorFocus(index, { scroll = true } = {}) {
  if (!panoSelectorList) return;
  const cards = Array.from(panoSelectorList.querySelectorAll('.pano-object-card'));
  if (!cards.length) {
    panoState.selectionIndex = 0;
    return;
  }
  const normalized = (index + cards.length) % cards.length;
  panoState.selectionIndex = normalized;
  cards.forEach((card, cardIndex) => {
    card.classList.toggle('controller-focus', cardIndex === normalized);
  });
  if (scroll) {
    cards[normalized].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function movePanoSelectorFocus(direction) {
  if (!panoSelectorList) return;
  const cards = panoSelectorList.querySelectorAll('.pano-object-card');
  if (!cards.length) return;
  setPanoSelectorFocus(panoState.selectionIndex + direction);
}

function selectFocusedPanoObject() {
  const items = panoObjectsState.items || [];
  if (!items.length) return;
  const clampedIndex = THREE.MathUtils.clamp(panoState.selectionIndex, 0, items.length - 1);
  const item = items[clampedIndex];
  if (item) {
    choosePanoObject(item);
  }
}

function renderPanoSelector(items) {
  if (!panoSelectorList) return;
  panoSelectorList.innerHTML = '';
  if (!items.length) {
    const message = document.createElement('div');
    message.textContent = 'No objects configured yet.';
    message.style.opacity = '0.6';
    message.style.textAlign = 'center';
    message.style.padding = '12px';
    panoSelectorList.appendChild(message);
    return;
  }
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'pano-object-card';
    card.dataset.itemId = item.id;
    const img = document.createElement('img');
    img.src = item.referenceImage || PANO_PLACEHOLDER_IMAGE;
    img.alt = item.name;
    card.appendChild(img);
    const meta = document.createElement('div');
    meta.className = 'pano-object-meta';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const difficulty = document.createElement('span');
    const difficultyLabel = (item.difficulty || 'UNKNOWN').toUpperCase();
    const difficultyKey = (item.difficulty || '').trim().toLowerCase();
    difficulty.textContent = difficultyLabel;
    difficulty.style.color = DIFFICULTY_COLORS[difficultyKey] || '#53ffd2';
    meta.appendChild(name);
    meta.appendChild(difficulty);
    card.appendChild(meta);
    const button = document.createElement('button');
    button.textContent = 'SELECT';
    button.addEventListener('click', () => {
      choosePanoObject(item);
    });
    card.appendChild(button);
    panoSelectorList.appendChild(card);
  });
  const index = THREE.MathUtils.clamp(panoState.selectionIndex, 0, items.length - 1);
  setPanoSelectorFocus(index, { scroll: false });
}

function slugifyItemId(name) {
  const base = (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `object-${Date.now()}`;
}

async function ensureUniqueItemId(baseId) {
  let candidate = baseId;
  let suffix = 0;
  let filePath = path.join(PANO_OBJECTS_DIR, `${candidate}.json`);
  while (true) {
    try {
      await fsPromises.access(filePath);
      suffix += 1;
      candidate = `${baseId}-${suffix}`;
      filePath = path.join(PANO_OBJECTS_DIR, `${candidate}.json`);
    } catch {
      return { id: candidate, filePath };
    }
  }
}

async function createPanoDevItem(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    setPanoDevStatus('Name cannot be empty.', true);
    return null;
  }
  const idBase = slugifyItemId(trimmed);
  const { id, filePath } = await ensureUniqueItemId(idBase);
  const payload = {
    name: trimmed,
    difficulty: PANO_DEFAULT_DIFFICULTY,
    description: PANO_DEFAULT_DESCRIPTION,
    referenceImage: PANO_DEFAULT_REFERENCE,
    polygons: [],
  };
  try {
    await fsPromises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    setPanoDevStatus(`Created ${trimmed}.`);
    panoObjectsState.loaded = false;
    await refreshPanoDevUI(id, { keepPanelOpen: true });
    setPanoDevPanelVisible(true);
    if (panoDevAddName) {
      panoDevAddName.value = '';
    }
    return payload;
  } catch (error) {
    console.error('[PanoDevAdd]', error);
    setPanoDevStatus('Failed to create object.', true);
    return null;
  }
}

function setPanoDevOverlayVisibility(visible) {
  if (!panoDevOverlay) return;
  panoDevOverlay.classList.toggle('hidden', !visible);
}

function setPanoDevPanelVisible(visible) {
  if (!panoDevPanel) return;
  panoDevPanelVisible = Boolean(visible);
  panoDevPanel.classList.toggle('hidden', !visible);
  updatePanoDevToggleButton();
  if (!visible) {
    panoDevState.editing = false;
    panoDevState.currentPoints.length = 0;
    updatePanoDevControls();
  }
}

function updatePanoDevToggleButton() {
  if (!panoDevToggle) return;
  const show = panoDevState.enabled && currentGame === 'pano';
  panoDevToggle.classList.toggle('hidden', !show);
  panoDevToggle.textContent = panoDevPanelVisible ? 'HIDE DEV' : 'SHOW DEV';
}

function togglePanoDevPanel() {
  if (!panoDevState.enabled) return;
  if (panoDevPanelVisible) {
    setPanoDevPanelVisible(false);
    return;
  }
  refreshPanoDevUI(panoDevState.selectedObjectId, { keepPanelOpen: true }).then(() => {
    setPanoDevPanelVisible(true);
  });
}

function resizePanoDevOverlay() {
  if (!panoDevOverlayCanvas) return;
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  panoDevOverlayCanvas.width = width;
  panoDevOverlayCanvas.height = height;
}

function resizePanoHighlightCanvas() {
  if (!panoHighlightCanvas) return;
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  panoHighlightCanvas.width = width;
  panoHighlightCanvas.height = height;
}

function projectUVToScreen(uv, width, height) {
  if (!uv) return null;
  const correctedX = 1 - uv.x;
  const theta = PANO_START_ANGLE + correctedX * PANO_ARC;
  const imageY = uv.y;
  const y = (imageY - 0.5) * PANO_HEIGHT;
  panoDevWorldVec.set(Math.sin(theta) * PANO_RADIUS, y, Math.cos(theta) * PANO_RADIUS);
  panoDevProjectedVec.copy(panoDevWorldVec).project(camera);
  return {
    x: ((panoDevProjectedVec.x + 1) / 2) * width,
    y: ((-panoDevProjectedVec.y + 1) / 2) * height,
  };
}

function drawPanoPolygonsOnOverlay(polygons, width, height) {
  if (!polygons || !polygons.length) return;
  polygons.forEach((polygon) => {
    const projected = polygon
      .map((pt) => projectUVToScreen(pt, width, height))
      .filter((pt) => pt !== null);
    if (projected.length < 2) return;
    panoDevOverlayCtx.beginPath();
    panoDevOverlayCtx.moveTo(projected[0].x, projected[0].y);
    for (let i = 1; i < projected.length; i += 1) {
      panoDevOverlayCtx.lineTo(projected[i].x, projected[i].y);
    }
    panoDevOverlayCtx.closePath();
    panoDevOverlayCtx.stroke();
  });
}

function drawPanoDevPoints(width, height) {
  const points = panoDevState.currentPoints;
  if (!points.length) return;
  const projected = points
    .map((pt) => projectUVToScreen(pt, width, height))
    .filter((pt) => pt !== null);
  if (!projected.length) return;
  panoDevOverlayCtx.beginPath();
  panoDevOverlayCtx.moveTo(projected[0].x, projected[0].y);
  for (let i = 1; i < projected.length; i += 1) {
    panoDevOverlayCtx.lineTo(projected[i].x, projected[i].y);
  }
  panoDevOverlayCtx.stroke();
  projected.forEach((pt) => {
    panoDevOverlayCtx.beginPath();
    panoDevOverlayCtx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    panoDevOverlayCtx.fill();
  });
}

function updatePanoDevOverlay() {
  if (!panoDevOverlayCtx || !panoDevOverlayCanvas) return;
  const width = panoDevOverlayCanvas.width;
  const height = panoDevOverlayCanvas.height;
  const show = panoDevState.enabled && currentGame === 'pano';
  setPanoDevOverlayVisibility(show);
  panoDevOverlayCtx.clearRect(0, 0, width, height);
  if (!show) return;
  panoDevOverlayCtx.strokeStyle = 'rgba(83, 255, 210, 0.7)';
  panoDevOverlayCtx.lineWidth = 2;
  panoDevOverlayCtx.fillStyle = 'rgba(83, 255, 210, 0.4)';
  const item = getPanoDevSelectedItem();
  if (item && item.polygons && item.polygons.length) {
    drawPanoPolygonsOnOverlay(item.polygons, width, height);
  }
  if (panoDevState.editing) {
    drawPanoDevPoints(width, height);
  }
}

function updateLightSwitchLighting() {
  if (ambientLight) {
    const targetIntensity = isLightSwitchBright
      ? LIGHT_SWITCH_AMBIENT_INTENSITY
      : DEFAULT_AMBIENT_INTENSITY;
    ambientLight.intensity = targetIntensity;
  }
}

function toggleLightSwitchLighting() {
  isLightSwitchBright = !isLightSwitchBright;
  updateLightSwitchLighting();
  const message = isLightSwitchBright ? 'Lights brightened.' : 'Lights dimmed.';
  showCenterMessage(message, 1200);
}

function initPostProcessing() {
  if (effectComposer) return;
  effectComposer = new EffectComposer(renderer);
  postRenderPass = new RenderPass(scene, camera);
  postRenderPass.renderToScreen = false;
  effectComposer.addPass(postRenderPass);
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  postSSAOPass = new SSAOPass(scene, camera, width, height);
  postSSAOPass.output = SSAOPass.OUTPUT.Default;
  postSSAOPass.kernelRadius = 0.52;
  postSSAOPass.kernelSize = 32;
  postSSAOPass.minDistance = 0.001;
  postSSAOPass.maxDistance = 0.05;
  postSSAOPass.renderToScreen = false;
  effectComposer.addPass(postSSAOPass);
  postBloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1.2,
    0.4,
    0.9
  );
  postBloomPass.threshold = DEFAULT_BLOOM_THRESHOLD;
  postBloomPass.strength = 0.55;
  postBloomPass.radius = 0.4;
  postBloomPass.renderToScreen = false;
  effectComposer.addPass(postBloomPass);
  postSMAPass = new SMAAPass(width, height);
  postSMAPass.renderToScreen = true;
  effectComposer.addPass(postSMAPass);
  updateLightSwitchLighting();
}

function resizePostProcessing() {
  if (!effectComposer) return;
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  effectComposer.setSize(width, height);
  if (postBloomPass) {
    postBloomPass.setSize(width, height);
  }
  if (postSMAPass) {
    postSMAPass.setSize(width, height);
  }
  if (postSSAOPass) {
    postSSAOPass.setSize(width, height);
  }
}

function showPanoSelectorOverlay() {
  loadPanoObjects().then((items) => {
    renderPanoSelector(items);
    setPanoSelectorVisible(true);
  });
}

function skipPanoSelection() {
  setPanoSelectorVisible(false);
  setScoreboardText('FIND THE OBJECT', '', 'DEV MODE');
  showCenterMessage('Selection skipped — choose a target later.', 1600);
}

function getPanoDevSelectedItem() {
  const selectedId =
    (panoDevObjectSelect && panoDevObjectSelect.value) || panoDevState.selectedObjectId;
  if (!selectedId) return null;
  return panoObjectsState.items.find((item) => item.id === selectedId) || null;
}

function updatePanoDevPointCount() {
  if (!panoDevPointCount) return;
  panoDevPointCount.textContent = String(panoDevState.currentPoints.length);
}

function renderPanoDevPolygonList(item) {
  if (!panoDevPolygonList) return;
  panoDevPolygonList.innerHTML = '';
  if (!item || !Array.isArray(item.polygons) || !item.polygons.length) {
    panoDevPolygonList.textContent = 'No polygons configured yet.';
    return;
  }
  item.polygons.forEach((polygon, index) => {
    const row = document.createElement('div');
    row.className = 'pano-dev-polygon';
    const label = document.createElement('span');
    label.textContent = `${polygon.length} points`;
    row.appendChild(label);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      removePanoDevPolygon(item, index);
    });
    row.appendChild(removeBtn);
    panoDevPolygonList.appendChild(row);
  });
}

function setPanoDevStatus(message, severe = false) {
  if (!panoDevStatus) return;
  panoDevStatus.textContent = message;
  panoDevStatus.style.color = severe ? '#ff5ad8' : '#53ffd2';
}

function updatePanoDevControls() {
  if (panoDevFinishPolygon) {
    panoDevFinishPolygon.disabled =
      !panoDevState.editing || panoDevState.currentPoints.length < 3;
  }
  if (panoDevStartPolygon) {
    panoDevStartPolygon.disabled = false;
  }
  updatePanoDevPointCount();
}

function startPanoDevPolygon() {
  if (!panoDevState.enabled) return;
  panoDevState.editing = true;
  panoDevState.currentPoints.length = 0;
  updatePanoDevControls();
  setPanoDevStatus('Click on the pano to place points.');
}

function finishPanoDevPolygon() {
  if (!panoDevState.editing) return;
  if (panoDevState.currentPoints.length < 3) {
    setPanoDevStatus('Need at least 3 points to finish.', true);
    return;
  }
  const item = getPanoDevSelectedItem();
  if (!item) {
    setPanoDevStatus('Select an object first.', true);
    return;
  }
  item.polygons = item.polygons || [];
  item.polygons.push([...panoDevState.currentPoints]);
  panoDevState.editing = false;
  panoDevState.currentPoints.length = 0;
  updatePanoDevControls();
  renderPanoDevPolygonList(item);
  setPanoDevStatus('Polygon added.');
}

function removePanoDevPolygon(item, index) {
  if (!item || !Array.isArray(item.polygons) || index < 0) return;
  item.polygons.splice(index, 1);
  renderPanoDevPolygonList(item);
  setPanoDevStatus('Polygon removed.');
}

function removeLastPanoDevPolygon() {
  const item = getPanoDevSelectedItem();
  if (!item || !Array.isArray(item.polygons) || !item.polygons.length) {
    setPanoDevStatus('No polygons to remove.', true);
    return;
  }
  removePanoDevPolygon(item, item.polygons.length - 1);
}

function addPanoDevPoint(event) {
  if (!panoDevState.editing) return;
  const uv = getPanoUVFromEvent(event);
  if (!uv) {
    setPanoDevStatus('Point must hit the pano surface.', true);
    return;
  }
  const point = { x: uv.x, y: 1 - uv.y };
  panoDevState.currentPoints.push(point);
  updatePanoDevControls();
  setPanoDevStatus(`Point ${panoDevState.currentPoints.length} placed.`);
}

async function savePanoDevObject() {
  const item = getPanoDevSelectedItem();
  if (!item || !item.filePath) {
    setPanoDevStatus('Cannot save: missing file path.', true);
    return;
  }
  const payload = {
    name: item.name,
    difficulty: item.difficulty,
    description: item.description,
    referenceImage: item.referenceImage,
    polygons: item.polygons || [],
  };
  try {
    await fsPromises.writeFile(item.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    setPanoDevStatus('Saved to disk.');
  } catch (error) {
    console.error('[PanoDevSave]', error);
    setPanoDevStatus('Failed to save.', true);
  }
}

function reloadPanoDevObjects() {
  panoObjectsState.loaded = false;
  setPanoDevStatus('Reloading objects...');
  loadPanoObjects().then((items) => {
    renderPanoSelector(items);
    refreshPanoDevUI(panoDevState.selectedObjectId, { keepPanelOpen: panoDevPanelVisible });
  });
}

function handlePanoDevObjectChange() {
  if (!panoDevObjectSelect) return;
  panoDevState.selectedObjectId = panoDevObjectSelect.value;
  const item = getPanoDevSelectedItem();
  renderPanoDevPolygonList(item);
  setPanoDevStatus(`Editing ${item ? item.name : 'unknown'}.`);
}

function refreshPanoDevUI(preferredId, { keepPanelOpen = false } = {}) {
  if (!keepPanelOpen) {
    setPanoDevPanelVisible(false);
  }
  return loadPanoObjects().then((items) => {
    const panel = panoDevPanel;
    const polygonList = panoDevPolygonList;
    const objectSelect = panoDevObjectSelect;
    if (!panel || !items.length) {
      if (polygonList) {
        polygonList.textContent = 'No objects configured yet.';
      }
      setPanoDevStatus('No objects found.', true);
      setPanoDevPanelVisible(false);
      return items;
    }
    if (!objectSelect) return items;
    objectSelect.innerHTML = '';
    items.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.name} (${(item.difficulty || 'UNKNOWN').toUpperCase()})`;
      objectSelect.appendChild(option);
    });
    const desired =
      preferredId ||
      panoDevState.selectedObjectId ||
      (items[0] && items[0].id) ||
      objectSelect.value;
    panoDevState.selectedObjectId = desired;
    objectSelect.value = desired;
    renderPanoDevPolygonList(getPanoDevSelectedItem());
    setPanoDevStatus('Dev objects loaded.');
    return items;
  });
}
function hidePanoHintCard() {
  if (!panoHintCard) return;
  panoHintCard.classList.add('hidden');
}

function updatePanoHintCard(item) {
  if (!panoHintCard || !item) return;
  panoHintName.textContent = item.name;
  panoHintDifficulty.textContent = (item.difficulty || 'UNKNOWN').toUpperCase();
  if (item.referenceImage) {
    panoHintImage.src = item.referenceImage;
    panoHintImage.style.opacity = '1';
  } else {
    panoHintImage.src = PANO_PLACEHOLDER_IMAGE;
    panoHintImage.style.opacity = '0.4';
  }
  panoHintCard.classList.remove('hidden');
}

function showPanoFoundOverlay(item) {
  if (!panoFoundOverlay) return;
  const description = (item && item.description) || 'You located the object!';
  panoFoundDescription.textContent = description;
  panoHighlightState.item = item || null;
  panoHighlightState.active =
    !!(
      item &&
      Array.isArray(item.polygons) &&
      item.polygons.length &&
      currentGame === 'pano'
    );
  panoFoundOverlay.classList.add('visible');
  panoFoundOverlay.classList.remove('hidden');
  positionPanoFoundPanel(null, window.innerWidth, Math.max(window.innerHeight, 1));
  if (!panoHighlightState.active) {
    setPanoHighlightVisible(false);
  }
}

function hidePanoFoundOverlay() {
  if (!panoFoundOverlay) return;
  panoFoundOverlay.classList.remove('visible');
  panoFoundOverlay.classList.add('hidden');
  panoHighlightState.active = false;
  panoHighlightState.item = null;
  setPanoHighlightVisible(false);
}

function positionPanoFoundPanel(bounding, width, height) {
  if (!panoFoundPanel) return;
  const panelWidth = Math.min(320, width * 0.38);
  panoFoundPanel.style.width = `${panelWidth}px`;
  const rect = panoFoundPanel.getBoundingClientRect();
  const panelHeight = rect.height || 64;
  const gap = 12;
  let left = 16;
  if (bounding) {
    left = bounding.maxX + gap;
    if (left + panelWidth > width - 16) {
      left = bounding.minX - gap - panelWidth;
    }
  }
  left = Math.max(16, Math.min(left, width - panelWidth - 16));
  let top = height - panelHeight - 20;
  if (bounding) {
    const midY = bounding.minY + (bounding.maxY - bounding.minY) / 2;
    top = midY - panelHeight / 2;
  }
  top = Math.max(12, Math.min(top, height - panelHeight - 12));
  panoFoundPanel.style.left = `${left}px`;
  panoFoundPanel.style.top = `${top}px`;
}

function setPanoHighlightVisible(visible) {
  if (!panoHighlightOverlay) return;
  panoHighlightOverlay.classList.toggle('hidden', !visible);
}

function updatePanoHighlightOverlay() {
  if (!panoHighlightOverlayCtx || !panoHighlightCanvas) return;
  if (!panoHighlightState.active || !panoHighlightState.item || currentGame !== 'pano') {
    panoHighlightOverlayCtx.clearRect(0, 0, panoHighlightCanvas.width, panoHighlightCanvas.height);
    setPanoHighlightVisible(false);
    return;
  }
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  if (panoHighlightCanvas.width !== width || panoHighlightCanvas.height !== height) {
    panoHighlightCanvas.width = width;
    panoHighlightCanvas.height = height;
  } else {
    panoHighlightOverlayCtx.clearRect(0, 0, width, height);
  }
  panoHighlightOverlayCtx.fillStyle = 'rgba(83, 255, 210, 0.12)';
  panoHighlightOverlayCtx.strokeStyle = 'rgba(83, 255, 210, 0.95)';
  panoHighlightOverlayCtx.lineWidth = 2;
  const polygons = Array.isArray(panoHighlightState.item.polygons)
    ? panoHighlightState.item.polygons
    : [];
  let bounding = null;
  let drew = false;
  polygons.forEach((polygon) => {
    const projected = polygon
      .map((pt) => projectUVToScreen(pt, width, height))
      .filter((pt) => pt !== null);
    if (projected.length < 3) return;
    drew = true;
    panoHighlightOverlayCtx.beginPath();
    panoHighlightOverlayCtx.moveTo(projected[0].x, projected[0].y);
    for (let i = 1; i < projected.length; i += 1) {
      panoHighlightOverlayCtx.lineTo(projected[i].x, projected[i].y);
    }
    panoHighlightOverlayCtx.closePath();
    panoHighlightOverlayCtx.fill();
    panoHighlightOverlayCtx.stroke();
    projected.forEach((pt) => {
      if (!bounding) {
        bounding = { minX: pt.x, maxX: pt.x, minY: pt.y, maxY: pt.y };
      } else {
        bounding.minX = Math.min(bounding.minX, pt.x);
        bounding.maxX = Math.max(bounding.maxX, pt.x);
        bounding.minY = Math.min(bounding.minY, pt.y);
        bounding.maxY = Math.max(bounding.maxY, pt.y);
      }
    });
  });
  if (!drew) {
    setPanoHighlightVisible(false);
    positionPanoFoundPanel(null, width, height);
    return;
  }
  setPanoHighlightVisible(true);
  positionPanoFoundPanel(bounding, width, height);
}

function resetPanoSearch() {
  const hadTarget = Boolean(panoObjectsState.targetItem);
  resetPanoViewport();
  stopPanoTimer({ reset: true });
  panoObjectsState.targetItem = null;
  hidePanoFoundOverlay();
  if (panoHeatmapState.overlayMode === 'object') {
    panoHeatmapState.selectedObjectId = null;
    updatePanoHeatmapControlsUI();
  }
  showPanoSelectorOverlay();
  if (hadTarget) {
    ledEmitEvent('pano_reset', {});
  }
}

function choosePanoObject(item) {
  if (!item) return;
  resetPanoViewport();
  panoObjectsState.targetItem = item;
  panoHeatmapState.selectedObjectId = item.id;
  updatePanoHeatmapControlsUI();
  startPanoTimer();
  setPanoSelectorVisible(false);
  updatePanoHintCard(item);
  showCenterMessage(`Looking for ${item.name}`, 2200);
  ledEmitEvent('pano_target_selected', {
    objectId: item.id,
    difficulty: item.difficulty || '',
  });
}

function isPointInPolygon(point, polygon) {
  let inside = false;
  const { x, y } = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

function tryHandleLightSwitchToggle(point) {
  if (!point || !panoObjectsState.items.length) return false;
  const lightSwitch = panoObjectsState.items.find((item) => item.id === LIGHT_SWITCH_ID);
  if (!lightSwitch || !Array.isArray(lightSwitch.polygons)) return false;
  const matched = lightSwitch.polygons.some((polygon) => isPointInPolygon(point, polygon));
  if (matched) {
    toggleLightSwitchLighting();
    return true;
  }
  return false;
}

function handlePanoSuccess(item) {
  if (!item) return;
  stopPanoTimer({ reset: false });
  setScoreboardText(
    item.name.toUpperCase(),
    `FOUND IN ${formatElapsed(panoTimerState.elapsed)}`,
    (item.difficulty || '').toUpperCase()
  );
  showPanoFoundOverlay(item);
  ledEmitEvent('pano_found', {
    objectId: item.id,
    elapsedSeconds: panoTimerState.elapsed,
    difficulty: item.difficulty || '',
  });
}

function handlePanoClickUV(uv) {
  if (
    currentGame !== 'pano' ||
    !panoState.active ||
    !panoState.mesh ||
    (panoSelector && !panoSelector.classList.contains('hidden'))
  ) {
    return;
  }
  if (panoDevState.enabled && panoDevState.editing) {
    return;
  }
  const targetItem = panoObjectsState.targetItem;
  if (!targetItem) return;
  if (!uv) return;
  const point = { x: uv.x, y: 1 - uv.y };
  tryHandleLightSwitchToggle(point);
  const polygons = targetItem.polygons || [];
  const matched = polygons.some((polygon) => isPointInPolygon(point, polygon));
  if (matched) {
    targetItem.found = true;
    handlePanoSuccess(targetItem);
  } else {
    showCenterMessage('Not quite—try another spot', 1600);
  }
}

function handlePanoClick(event) {
  const uv = getPanoUVFromEvent(event);
  handlePanoClickUV(uv);
}

function loadPanoTexture() {
  if (panoState.texturePromise) return panoState.texturePromise;
  panoState.texturePromise = new Promise((resolve, reject) => {
    panoTextureLoader.load(
      'pano.jpeg',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        panoState.texture = texture;
        resolve(texture);
      },
      undefined,
      (error) => {
        panoState.texturePromise = null;
        reject(error);
      }
    );
  });
  return panoState.texturePromise;
}

function ensurePanoMesh(texture) {
  if (panoState.mesh) {
    panoState.mesh.visible = true;
    if (texture && panoState.mesh.material.map !== texture) {
      panoState.mesh.material.map = texture;
      panoState.mesh.material.needsUpdate = true;
    }
    return;
  }
  const geometry = new THREE.CylinderGeometry(
    PANO_RADIUS,
    PANO_RADIUS,
    PANO_HEIGHT,
    128,
    1,
    true,
    Math.PI / 2 - PANO_ARC / 2,
    PANO_ARC
  );
  geometry.scale(-1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.y = 0;
  mesh.renderOrder = -5;
  panoState.mesh = mesh;
  scene.add(mesh);
}

function cleanupPanoGame() {
  panoState.active = false;
  panoState.dragging = false;
  stopPanoTimer({ reset: true });
  void flushPanoHeatmaps();
  if (panoState.mesh) {
    panoState.mesh.visible = false;
  }
  scene.fog = baseSceneFog;
  renderer.domElement.style.cursor = '';
  setPanoSelectorVisible(false);
  setPanoCrosshairVisible(false);
  setPanoHeatmapOverlayVisible(false);
  hidePanoHintCard();
  hidePanoFoundOverlay();
}

function initPanoGame() {
  cleanupGame1();
  cleanupGame2();
  cleanupGazeGame();
  cleanupGazePaddle();
  cleanupLaneRunner();
  cleanupPanoGame();
  panoState.active = true;
  panoState.yaw = 0;
  panoState.pitch = 0;
  panoState.targetYaw = 0;
  panoState.targetPitch = 0;
  panoState.fov = THREE.MathUtils.clamp(panoState.fov, PANO_MIN_FOV, PANO_MAX_FOV);
  scene.fog = null;
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  camera.fov = panoState.fov;
  camera.aspect = width / height;
  camera.position.set(0, 0, 0);
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();
  updatePanoView(0);
  setScoreboardText('FIND THE OBJECT', '', 'DRAG OR P1 STICK');
  showCenterMessage('Drag or P1 left stick to pan, scroll or P1 right stick up/down to zoom', 2600);
  ledEmitEvent('pano_start', {});
  updateControlHints('pano');
  updateAIUI();
  renderer.domElement.style.cursor = 'grab';
  setPanoCrosshairVisible(true);
  updatePanoHeatmapControlsUI();
  void loadPanoHeatmaps();
  showPanoSelectorOverlay();

  loadPanoTexture()
    .then((texture) => {
      if (!panoState.active) return;
      ensurePanoMesh(texture);
    })
    .catch((error) => {
      console.error('[Pano]', error);
      showCenterMessage('Panorama failed to load', 2400);
    });
}

function updatePanoView(delta) {
  if (!panoState.active) return;
  const smoothing = Math.min(1, delta * 8);
  panoState.yaw = THREE.MathUtils.lerp(panoState.yaw, panoState.targetYaw, smoothing);
  panoState.pitch = THREE.MathUtils.lerp(panoState.pitch, panoState.targetPitch, smoothing);
  panoLookDirection.set(
    Math.cos(panoState.pitch) * Math.sin(panoState.yaw),
    Math.sin(panoState.pitch),
    Math.cos(panoState.pitch) * Math.cos(panoState.yaw)
  );
  camera.lookAt(panoLookDirection);
}

function updatePanoTimer(delta) {
  if (
    currentGame !== 'pano' ||
    !panoState.active ||
    !panoTimerState.active ||
    panoState.selectionVisible ||
    menuOpen ||
    startMenuVisible
  ) {
    return;
  }
  panoTimerState.elapsed += delta;
  updatePanoTimerScoreboard();
}

function getPanoCenterPoint() {
  const rect = renderer.domElement.getBoundingClientRect();
  const uv = getPanoUVFromClientPosition(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5);
  if (!uv) return null;
  return { x: uv.x, y: 1 - uv.y };
}

function samplePanoHeatmap(point) {
  if (!point || !panoHeatmapState.loaded) return;
  const x = THREE.MathUtils.clamp(point.x, 0, 0.999999);
  const y = THREE.MathUtils.clamp(point.y, 0, 0.999999);
  const xBin = Math.floor(x * PANO_HEATMAP_GRID_WIDTH);
  const yBin = Math.floor(y * PANO_HEATMAP_GRID_HEIGHT);
  const index = yBin * PANO_HEATMAP_GRID_WIDTH + xBin;
  panoHeatmapState.overall[index] += 1;
  panoHeatmapState.dirtyOverall = true;
  const targetId = panoObjectsState.targetItem && panoObjectsState.targetItem.id;
  if (targetId) {
    const objectHeatmap = getObjectHeatmap(targetId);
    objectHeatmap[index] += 1;
    panoHeatmapState.dirtyObjectIds.add(targetId);
  }
}

function updatePanoHeatmapSampling(delta) {
  if (!panoHeatmapState.loaded) return;
  const canSample =
    currentGame === 'pano' &&
    panoState.active &&
    panoState.mesh &&
    !panoState.selectionVisible &&
    !menuOpen &&
    !startMenuVisible &&
    !(panoFoundOverlay && panoFoundOverlay.classList.contains('visible'));
  if (canSample) {
    panoHeatmapState.sampleElapsed += delta;
    while (panoHeatmapState.sampleElapsed >= PANO_HEATMAP_SAMPLE_INTERVAL) {
      panoHeatmapState.sampleElapsed -= PANO_HEATMAP_SAMPLE_INTERVAL;
      samplePanoHeatmap(getPanoCenterPoint());
    }
  } else {
    panoHeatmapState.sampleElapsed = 0;
  }
  if (panoHeatmapState.dirtyOverall || panoHeatmapState.dirtyObjectIds.size) {
    panoHeatmapState.saveElapsed += delta;
    if (panoHeatmapState.saveElapsed >= PANO_HEATMAP_SAVE_INTERVAL) {
      void flushPanoHeatmaps();
    }
  }
}

function getActiveHeatmapBuffer() {
  if (panoHeatmapState.overlayMode === 'overall') {
    return panoHeatmapState.overall;
  }
  if (panoHeatmapState.overlayMode === 'object') {
    const objectId =
      panoHeatmapState.selectedObjectId || (panoObjectsState.targetItem && panoObjectsState.targetItem.id);
    if (!objectId) return null;
    return panoHeatmapState.perObject.get(objectId) || null;
  }
  return null;
}

function updatePanoHeatmapOverlay() {
  if (!panoHeatmapCtx || !panoHeatmapCanvas) return;
  const canShow =
    currentGame === 'pano' &&
    panoState.active &&
    panoHeatmapState.overlayMode !== 'off' &&
    !panoState.selectionVisible;
  const heatmap = canShow ? getActiveHeatmapBuffer() : null;
  if (!heatmap) {
    panoHeatmapCtx.clearRect(0, 0, panoHeatmapCanvas.width, panoHeatmapCanvas.height);
    setPanoHeatmapOverlayVisible(false);
    return;
  }
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  if (panoHeatmapCanvas.width !== width || panoHeatmapCanvas.height !== height) {
    panoHeatmapCanvas.width = width;
    panoHeatmapCanvas.height = height;
  } else {
    panoHeatmapCtx.clearRect(0, 0, width, height);
  }
  let maxValue = 0;
  for (let i = 0; i < heatmap.length; i += 1) {
    if (heatmap[i] > maxValue) maxValue = heatmap[i];
  }
  if (maxValue <= 0) {
    setPanoHeatmapOverlayVisible(false);
    return;
  }
  for (let y = 0; y < PANO_HEATMAP_GRID_HEIGHT; y += 1) {
    for (let x = 0; x < PANO_HEATMAP_GRID_WIDTH; x += 1) {
      const value = heatmap[y * PANO_HEATMAP_GRID_WIDTH + x];
      if (value <= 0) continue;
      const intensity = value / maxValue;
      if (intensity < 0.06) continue;
      const projected = projectUVToScreen(
        { x: (x + 0.5) / PANO_HEATMAP_GRID_WIDTH, y: (y + 0.5) / PANO_HEATMAP_GRID_HEIGHT },
        width,
        height
      );
      if (!projected) continue;
      const radius = 3 + intensity * 14;
      const hue = (1 - intensity) * 230;
      panoHeatmapCtx.fillStyle = `hsla(${hue}, 94%, 56%, ${0.06 + intensity * 0.33})`;
      panoHeatmapCtx.beginPath();
      panoHeatmapCtx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
      panoHeatmapCtx.fill();
    }
  }
  setPanoHeatmapOverlayVisible(true);
}

function resetPanoViewport() {
  panoState.yaw = 0;
  panoState.pitch = 0;
  panoState.targetYaw = 0;
  panoState.targetPitch = 0;
  panoState.fov = THREE.MathUtils.clamp(PANO_DEFAULT_FOV, PANO_MIN_FOV, PANO_MAX_FOV);
  camera.fov = panoState.fov;
  camera.updateProjectionMatrix();
  updatePanoView(1);
}

function updatePanoGamepadInput(delta) {
  if (currentGame !== 'pano' || menuOpen || startMenuVisible || panoState.selectionVisible) return;
  const padIndex = players[0] ? players[0].gamepadIndex : 0;
  const state = getGamepadState(padIndex);
  if (!state || !state.connected || !panoState.active || !panoState.mesh) return;

  if (wasGamepadButtonPressed(padIndex, GAMEPAD_BUTTONS.B)) {
    resetPanoSearch();
    return;
  }

  const zoomFactor = panoState.fov / PANO_MAX_FOV;
  const panSpeed = PANO_GAMEPAD_LOOK_SPEED * zoomFactor;
  panoState.targetYaw -= state.leftStick.x * panSpeed * delta;
  panoState.targetPitch -= state.leftStick.y * panSpeed * delta;
  panoState.targetPitch = THREE.MathUtils.clamp(
    panoState.targetPitch,
    -PANO_PITCH_LIMIT,
    PANO_PITCH_LIMIT
  );

  const zoomInput = state.rightStick.y;
  if (zoomInput !== 0) {
    panoState.fov = THREE.MathUtils.clamp(
      panoState.fov + zoomInput * PANO_GAMEPAD_ZOOM_SPEED * delta,
      PANO_MIN_FOV,
      PANO_MAX_FOV
    );
    camera.fov = panoState.fov;
    camera.updateProjectionMatrix();
  }

  if (wasGamepadButtonPressed(padIndex, GAMEPAD_BUTTONS.A)) {
    if (panoFoundOverlay && panoFoundOverlay.classList.contains('visible')) {
      resetPanoSearch();
      return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    const uv = getPanoUVFromClientPosition(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5);
    handlePanoClickUV(uv);
  }
}

function handlePanoSelectorGamepadInput() {
  if (
    currentGame !== 'pano' ||
    !panoState.selectionVisible ||
    menuOpen ||
    startMenuVisible
  ) {
    return;
  }
  const padIndex = players[0] ? players[0].gamepadIndex : 0;
  const state = getGamepadState(padIndex);
  if (!state || !state.connected) return;
  if (state.navEvents.up || state.navEvents.left) {
    movePanoSelectorFocus(-1);
  }
  if (state.navEvents.down || state.navEvents.right) {
    movePanoSelectorFocus(1);
  }
  if (
    wasGamepadButtonPressed(padIndex, GAMEPAD_BUTTONS.A) ||
    wasGamepadButtonPressed(padIndex, GAMEPAD_BUTTONS.START)
  ) {
    selectFocusedPanoObject();
  }
  if (wasGamepadButtonPressed(padIndex, GAMEPAD_BUTTONS.B)) {
    resetPanoSearch();
  }
}

function computeMainCameraHeight() {
  const radius = ARENA_RADIUS + 1.5;
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const aspect = width / height;
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const tanHalfFov = Math.tan(fovRad / 2);
  if (tanHalfFov <= 0) {
    return cameraBasePosition.y;
  }
  const verticalRequirement = radius / tanHalfFov;
  const horizontalRequirement = radius / (tanHalfFov * Math.max(aspect, 0.0001));
  return Math.max(verticalRequirement, horizontalRequirement) * MAIN_CAMERA_MARGIN;
}

function showStartMenu() {
  cleanupGame1();
  cleanupGame2();
  cleanupGazeGame();
  cleanupGazePaddle();
  cleanupLaneRunner();
  cleanupPanoGame();
  flabbyBirdGame.deactivate();
  currentGame = null;
  updatePanoDevVisibility(null);
  updatePanoResetButtonVisibility();
  updatePanoHeatmapControlsVisibility();
  gazeGameState.useSavedCalibration = false;
  resetMainCamera();
  updateRobotVisibility();
  applyVisualMode(null);
  startMenuVisible = true;
  startMenu.classList.remove('hidden');
  startMenuIndex = 0;
  highlightStartButton();
  setScoreboardText('CHOOSE GAME', 'SELECT A MODE', '');
  showCenterMessage('CHOOSE GAME', 0);
  updateControlHints('joust');
  closeMenu();
  updateAIUI();
  updateGazePaddleButton();
  updateGazeRunnerButton();
  refreshGazePaddleCanvas();
  syncLedMode();
}

function hideStartMenu() {
  startMenuVisible = false;
  startMenu.classList.add('hidden');
  refreshGazePaddleCanvas();
}

function selectGame(gameKey) {
  if (!gameKey) return;
  if (gameKey === 'gazePaddle' && !gazeGameState.readyForPaddle) {
    showCenterMessage('Complete gaze calibration first', 1600);
    updateGazePaddleButton();
    return;
  }
  if (gameKey === 'gazeRunner' && !gazeGameState.readyForRunner) {
    showCenterMessage('Complete gaze calibration first', 1600);
    updateGazeRunnerButton();
    return;
  }
  hideStartMenu();
  if (currentGame === 'flappyLion' && gameKey !== 'flappyLion') {
    flabbyBirdGame.deactivate();
  }
  currentGame = gameKey;
  updatePanoDevVisibility(gameKey);
  updatePanoResetButtonVisibility();
  updatePanoHeatmapControlsVisibility();
  if (gameKey !== 'gaze') {
    cleanupGazeGame();
  }
  if (gameKey !== 'gazePaddle') {
    cleanupGazePaddle();
  }
  if (gameKey !== 'gazeRunner') {
    cleanupLaneRunner();
  }
  if (gameKey !== 'pano') {
    cleanupPanoGame();
  }
  if (gameKey !== 'flappyLion') {
    flabbyBirdGame.deactivate();
  }
  updateRobotVisibility();
  applyVisualMode(gameKey);
  updateControlHints(gameKey);
  showCenterMessage('', 0);
  updateAIUI();
  syncLedMode();
  if (gameKey === 'joust') {
    resetMainCamera();
    startRound({ resetScores: true });
  } else if (gameKey === 'shooter') {
    initGame2();
  } else if (gameKey === 'gaze') {
    initGazeGame();
  } else if (gameKey === 'gazePaddle') {
    initGazePaddleGame();
  } else if (gameKey === 'gazeRunner') {
    initLaneRunnerGame();
  } else if (gameKey === 'pano') {
    initPanoGame();
  } else if (gameKey === 'flappyLion') {
    setScoreboardText('FLAPPY LION', 'W / I TO FLAP', 'ESC TO EXIT');
    flabbyBirdGame.activate();
  }
}

function cleanupGame1() {
  roundActive = false;
  if (nextRoundTimeout) {
    clearTimeout(nextRoundTimeout);
    nextRoundTimeout = null;
  }
  if (matchResetTimeout) {
    clearTimeout(matchResetTimeout);
    matchResetTimeout = null;
  }
}

function updateRobotVisibility() {
  const showPlayers = currentGame === 'joust';
  if (players[0] && players[0].robot) {
    players[0].robot.visible = showPlayers;
  }
  if (players[1] && players[1].robot) {
    players[1].robot.visible = showPlayers;
  }
}

function resetMainCamera() {
  camera.fov = 45;
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  camera.aspect = width / height;
  const optimalHeight = computeMainCameraHeight();
  cameraBasePosition.set(0, optimalHeight, 0);
  camera.position.copy(cameraBasePosition);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, width, height);
}

function colorHexToRGBA(hex, alpha = 1) {
  colorHelper.set(hex);
  const r = Math.round(colorHelper.r * 255);
  const g = Math.round(colorHelper.g * 255);
  const b = Math.round(colorHelper.b * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function triggerHitFlash(colorHex = 0xffffff) {
  const inner = colorHexToRGBA(colorHex, 0.9);
  const mid = colorHexToRGBA(colorHex, 0.3);
  hitFlash.style.background = `radial-gradient(circle, ${inner} 0%, ${mid} 40%, rgba(2, 3, 15, 0) 70%)`;
  hitFlash.style.opacity = '1';
  setTimeout(() => {
    hitFlash.style.opacity = '0';
  }, 120);
}

function spawnImpactRing(position, colorHex) {
  const geometry = new THREE.RingGeometry(0.8, 1.1, 48);
  const material = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(position);
  mesh.position.y = 0.05;
  scene.add(mesh);
  hitRings.push({ mesh, material, geometry, age: 0, duration: 0.6 });
}

function findClosestEnemy(position) {
  let closest = null;
  let bestDist = Infinity;
  game2State.enemies.forEach((enemy) => {
    const dist = enemy.position.distanceToSquared(position);
    if (dist < bestDist) {
      bestDist = dist;
      closest = enemy;
    }
  });
  return closest;
}

function clampTurretRotation() {
  if (!game2State.turretPivot) return;
  game2State.turretPivot.rotation.y = THREE.MathUtils.clamp(
    game2State.turretPivot.rotation.y,
    -TURRET_LIMIT,
    TURRET_LIMIT
  );
}

function computeGame2DriverAI(base) {
  const move = new THREE.Vector2(0, 0);
  let rotateInput = 0;
  const enemy = findClosestEnemy(base.position);
  const target = enemy ? enemy.position : new THREE.Vector3(0, 0, 0);
  const direction = target.clone().sub(base.position).setY(0);
  const dist = Math.max(direction.length(), 0.0001);
  const desiredAngle = Math.atan2(direction.x, direction.z);
  let angleDiff = desiredAngle - base.rotation.y;
  angleDiff = THREE.MathUtils.euclideanModulo(angleDiff + Math.PI, Math.PI * 2) - Math.PI;

  if (angleDiff > 0.25) {
    rotateInput = 1;
  } else if (angleDiff < -0.25) {
    rotateInput = -1;
  }

  if (dist > 16) {
    move.y -= 1;
  } else if (dist < 9) {
    move.y += 1;
  }

  return { moveVector: move, rotateInput };
}

function updateGame2TurretAI(delta) {
  if (!game2AIState.turret || !game2State.active || !game2State.base || !game2State.turretPivot) {
    return false;
  }
  const enemy = findClosestEnemy(game2State.base.position);
  if (!enemy) return false;

  const baseRotation = game2State.base.rotation.y;
  const desiredAngle = Math.atan2(
    enemy.position.x - game2State.base.position.x,
    enemy.position.z - game2State.base.position.z
  );
  let angleDiff = desiredAngle - baseRotation - game2State.turretPivot.rotation.y;
  angleDiff = THREE.MathUtils.euclideanModulo(angleDiff + Math.PI, Math.PI * 2) - Math.PI;

  if (angleDiff > 0.02) {
    game2State.turretPivot.rotation.y += GAME2_TURRET_SPEED * delta;
  } else if (angleDiff < -0.02) {
    game2State.turretPivot.rotation.y -= GAME2_TURRET_SPEED * delta;
  }
  clampTurretRotation();

  if (Math.abs(angleDiff) < 0.25 && game2State.fireCooldown <= 0) {
    spawnPlayerBullet();
  }
  return true;
}

function updateImpactRings(delta) {
  for (let i = hitRings.length - 1; i >= 0; i -= 1) {
    const ring = hitRings[i];
    ring.age += delta;
    const t = Math.min(1, ring.age / ring.duration);
    const scale = THREE.MathUtils.lerp(1, 6.5, t);
    ring.mesh.scale.set(scale, scale, scale);
    ring.material.opacity = THREE.MathUtils.lerp(0.8, 0, t);
    if (t >= 1) {
      scene.remove(ring.mesh);
      ring.geometry.dispose();
      ring.material.dispose();
      hitRings.splice(i, 1);
    }
  }
}

function updateDriverCameraForGame2() {
  if (!game2State.base) return;
  const target = game2State.base.position;
  camera.fov = DRIVER_FOV;
  camera.updateProjectionMatrix();
  driverCameraForward.set(Math.sin(game2State.base.rotation.y), 0, Math.cos(game2State.base.rotation.y));
  driverCameraOffset.copy(driverCameraForward).multiplyScalar(-DRIVER_CAMERA_DISTANCE);
  driverCameraOffset.y = DRIVER_CAMERA_HEIGHT;
  const lookAheadDistance = 10;
  driverCameraLookTarget
    .copy(target)
    .add(driverCameraForward.clone().multiplyScalar(lookAheadDistance));
  driverCameraLookTarget.y = target.y + 0.7;
  camera.position.copy(target).add(driverCameraOffset);
  camera.up.set(0, 1, 0);
  camera.lookAt(driverCameraLookTarget);
}

function updateTurretCamera() {
  if (!game2State.base || !game2State.turretPivot) return;
  const pivotWorldPos = new THREE.Vector3();
  game2State.turretPivot.getWorldPosition(pivotWorldPos);
  const orientation = game2State.base.rotation.y + game2State.turretPivot.rotation.y;

  const forward = new THREE.Vector3(Math.sin(orientation), 0, Math.cos(orientation));
  const up = new THREE.Vector3(0, 0.5, 0);
  const cameraOffset = forward.clone().multiplyScalar(0.6).add(up);

  turretCamera.position.copy(pivotWorldPos).add(cameraOffset);
  turretCamera.lookAt(pivotWorldPos.clone().add(forward.multiplyScalar(8)).add(new THREE.Vector3(0, 0.5, 0)));
}

function renderGame2Views() {
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  const halfWidth = Math.max(Math.floor(width / 2), 1);
  const secondWidth = Math.max(width - halfWidth, 1);
  camera.aspect = halfWidth / height;
  camera.updateProjectionMatrix();
  turretCamera.aspect = secondWidth / height;
  turretCamera.updateProjectionMatrix();
  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, halfWidth, height);
  renderer.setScissor(0, 0, halfWidth, height);
  renderer.render(scene, camera);
  renderer.setViewport(halfWidth, 0, secondWidth, height);
  renderer.setScissor(halfWidth, 0, secondWidth, height);
  renderer.render(scene, turretCamera);
  renderer.setScissorTest(false);
}

function driveAI(player, opponent) {
  const difficulty = getCurrentAIDifficulty();
  aiDiff.set(
    opponent.robot.position.x - player.robot.position.x,
    opponent.robot.position.z - player.robot.position.z
  );
  const distance = aiDiff.length();
  let rotateInput = 0;

  if (distance > 0.0001) {
    const desiredAngle = Math.atan2(aiDiff.x, aiDiff.y);
    let angleDiff = desiredAngle - player.robot.rotation.y;
    angleDiff = THREE.MathUtils.euclideanModulo(angleDiff + Math.PI, Math.PI * 2) - Math.PI;
    if (angleDiff > difficulty.angleThreshold) {
      rotateInput = 1;
    } else if (angleDiff < -difficulty.angleThreshold) {
      rotateInput = -1;
    }

    aiMoveTarget.copy(aiDiff).normalize();
    if (distance < difficulty.retreatDistance) {
      aiMoveTarget.multiplyScalar(-0.6);
    } else if (distance > difficulty.chaseBoostDistance) {
      aiMoveTarget.multiplyScalar(1.25);
    }
    aiMoveCommand.copy(aiMoveTarget);
    if (difficulty.jitter > 0) {
      aiMoveCommand.x += (Math.random() - 0.5) * difficulty.jitter;
      aiMoveCommand.y += (Math.random() - 0.5) * difficulty.jitter;
    }
    const length = aiMoveCommand.length();
    if (length > 1) {
      aiMoveCommand.divideScalar(length);
    }
    aiMoveCommand.multiplyScalar(difficulty.moveSpeed);
  } else {
    aiMoveCommand.set(0, 0);
  }

  return {
    moveVector: aiMoveCommand,
    rotateInput,
    rotateSpeedFactor: difficulty.rotateSpeedFactor,
  };
}

const game2GunnerControls = { rotateLeft: 'j', rotateRight: 'l', fire: 'i' };

const game2State = {
  base: null,
  turretPivot: null,
  bullets: [],
  enemies: [],
  spawnTimer: 0,
  health: 4,
  score: 0,
  fireCooldown: 0,
  wave: 1,
  active: false,
  baseVelocity: new THREE.Vector2(),
  baseAngularVelocity: 0,
};

function cleanupGame2() {
  game2State.active = false;
  game2State.bullets.forEach((bullet) => {
    scene.remove(bullet);
  });
  game2State.enemies.forEach((enemy) => {
    scene.remove(enemy);
  });
  game2State.bullets.length = 0;
  game2State.enemies.length = 0;
  if (game2State.base) {
    scene.remove(game2State.base);
    game2State.base = null;
  }
  game2State.turretPivot = null;
  game2State.baseVelocity.set(0, 0);
  game2State.baseAngularVelocity = 0;
}

function resetGame2SpawnTimer() {
  game2State.spawnTimer = GAME2_SPAWN_MIN + Math.random() * (GAME2_SPAWN_MAX - GAME2_SPAWN_MIN);
}

function initGame2() {
  cleanupGame1();
  cleanupGame2();
  const base = createRobot(0x9cf7ff, 0xffcbff);
  base.position.set(0, 0, 0);
  base.rotation.y = Math.PI;
  const turretPivot = new THREE.Object3D();
  turretPivot.position.y = 0.8;
  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.22, 1.8),
    new THREE.MeshStandardMaterial({ color: 0xfff16f, emissive: 0xfff16f, emissiveIntensity: 1 })
  );
  barrel.position.set(0, 0.05, 0.9);
  turretPivot.add(barrel);
  base.add(turretPivot);
  scene.add(base);
  game2State.base = base;
  game2State.turretPivot = turretPivot;
  if (base.userData.directionIndicator) {
    base.userData.directionIndicator.visible = false;
  }
  game2State.health = 4;
  game2State.score = 0;
  game2State.fireCooldown = 0;
  game2State.wave = 1;
  game2State.baseVelocity.set(0, 0);
  game2State.baseAngularVelocity = 0;
  game2State.active = true;
  resetGame2SpawnTimer();
  updateGame2HUD();
  ledEmitEvent('shooter_start', {});
}

function spawnPlayerBullet() {
  if (!game2State.base || !game2State.turretPivot) return;
  const turretAngle = game2State.base.rotation.y + game2State.turretPivot.rotation.y;
  const direction = new THREE.Vector3(Math.sin(turretAngle), 0, Math.cos(turretAngle));
  const spawnPos = game2State.base.position
    .clone()
    .add(new THREE.Vector3(0, 0.8, 0))
    .add(direction.clone().multiplyScalar(1.8));
  const bullet = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xfffc92, emissive: 0xfffc92, emissiveIntensity: 1 })
  );
  bullet.position.copy(spawnPos);
  bullet.userData = {
    velocity: direction.multiplyScalar(38),
    life: 0,
  };
  scene.add(bullet);
  game2State.bullets.push(bullet);
  game2State.fireCooldown = GAME2_FIRE_RATE;
}

function spawnEnemy() {
  if (!game2State.active) return;
  const angle = Math.random() * Math.PI * 2;
  const radius = GAME2_SPAWN_RADIUS;
  const enemy = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xff6f91, emissive: 0xff2a6a, emissiveIntensity: 0.7 })
  );
  enemy.position.set(Math.sin(angle) * radius, 0.4, Math.cos(angle) * radius);
  const speedBoost = Math.min(2, game2State.wave * 0.35);
  enemy.userData = { speed: GAME2_ENEMY_SPEED + speedBoost };
  scene.add(enemy);
  game2State.enemies.push(enemy);
  resetGame2SpawnTimer();
}

function updateGame2HUD() {
  if (!game2State.active) return;
  const wave = Math.floor(game2State.score / 5) + 1;
  game2State.wave = wave;
  setScoreboardText(
    `SCORE — ${game2State.score}`,
    `WAVE ${wave}`,
    `HEALTH — ${Math.max(game2State.health, 0)}`
  );
}

function endGame2() {
  game2State.active = false;
  showCenterMessage('ROBOT DESTROYED', 0);
  ledEmitEvent('shooter_game_over', {});
  setTimeout(() => {
    showStartMenu();
  }, 2200);
}

function updateGame2(delta) {
  if (!game2State.active || menuOpen) return;
  const base = game2State.base;
  const turretPivot = game2State.turretPivot;
  if (!base || !turretPivot) return;

  const driverInput = new THREE.Vector2(0, 0);
  let rotateInput = 0;
  if (game2AIState.driver) {
    const aiDriver = computeGame2DriverAI(base);
    driverInput.copy(aiDriver.moveVector);
    rotateInput = aiDriver.rotateInput;
  } else {
    if (keys[players[0].controls.up]) driverInput.y += 1;
    if (keys[players[0].controls.down]) driverInput.y -= 1;
    if (keys[players[0].controls.left]) driverInput.x += 1;
    if (keys[players[0].controls.right]) driverInput.x -= 1;
    addGamepadMovementInputGame2(driverInput, players[0].gamepadIndex);
    if (keys[players[0].controls.rotateLeft]) {
      rotateInput += 1;
    }
    if (keys[players[0].controls.rotateRight]) {
      rotateInput -= 1;
    }
    rotateInput += getGamepadRotateInput(players[0].gamepadIndex);
    rotateInput = THREE.MathUtils.clamp(rotateInput, -1, 1);
  }

  const baseVelocity = game2State.baseVelocity;
  const forwardVec = game2ForwardVec.set(Math.sin(base.rotation.y), Math.cos(base.rotation.y));
  const rightVec = game2RightVec.set(
    Math.sin(base.rotation.y + Math.PI / 2),
    Math.cos(base.rotation.y + Math.PI / 2)
  );
  game2DesiredVelocity.copy(forwardVec).multiplyScalar(driverInput.y);
  game2DesiredVelocity.addScaledVector(rightVec, driverInput.x);
  const desiredLenSq = game2DesiredVelocity.lengthSq();
  if (desiredLenSq > 0) {
    const desiredLen = Math.sqrt(desiredLenSq);
    const magnitude = Math.min(1, desiredLen);
    game2TargetVelocity.copy(game2DesiredVelocity).normalize().multiplyScalar(GAME2_DRIVER_SPEED * magnitude);
    const mix = Math.min(1, MOVE_ACCEL * delta);
    baseVelocity.lerp(game2TargetVelocity, mix);
  } else {
    const damping = Math.max(0, 1 - MOVE_DAMPING * delta);
    baseVelocity.multiplyScalar(damping);
  }
  base.position.x += baseVelocity.x * delta;
  base.position.z += baseVelocity.y * delta;

  if (rotateInput !== 0) {
    const targetAngular = rotateInput * GAME2_ROTATE_SPEED;
    const mix = Math.min(1, ROTATE_ACCEL * delta);
    game2State.baseAngularVelocity = THREE.MathUtils.lerp(
      game2State.baseAngularVelocity,
      targetAngular,
      mix
    );
  } else {
    const damping = Math.max(0, 1 - ROTATE_DAMPING * delta);
    game2State.baseAngularVelocity *= damping;
  }
  base.rotation.y += game2State.baseAngularVelocity * delta;

  game2State.fireCooldown = Math.max(0, game2State.fireCooldown - delta);

  const turretAIHandled = updateGame2TurretAI(delta);
  if (!turretAIHandled) {
    let turretRotateInput = 0;
    if (keys[game2GunnerControls.rotateLeft]) turretRotateInput += 1;
    if (keys[game2GunnerControls.rotateRight]) turretRotateInput -= 1;
    const gunnerPadIndex = players[1].gamepadIndex;
    turretRotateInput += getGamepadRotateInput(gunnerPadIndex, 'left');
    turretRotateInput = THREE.MathUtils.clamp(turretRotateInput, -1, 1);
    if (turretRotateInput !== 0) {
      turretPivot.rotation.y += turretRotateInput * GAME2_TURRET_SPEED * delta;
    }
    const gunnerFiring =
      keys[game2GunnerControls.fire] ||
      isGamepadButtonDown(gunnerPadIndex, GAMEPAD_BUTTONS.A) ||
      isGamepadButtonDown(gunnerPadIndex, GAMEPAD_BUTTONS.RT);
    if (gunnerFiring && game2State.fireCooldown <= 0) {
      spawnPlayerBullet();
    }
  }
  clampTurretRotation();

  for (let i = game2State.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = game2State.bullets[i];
    bullet.position.addScaledVector(bullet.userData.velocity, delta);
    bullet.userData.life += delta;
    if (bullet.userData.life > 2 || bullet.position.length() > GAME2_BULLET_LIMIT) {
      scene.remove(bullet);
      game2State.bullets.splice(i, 1);
      continue;
    }
    for (let j = game2State.enemies.length - 1; j >= 0; j -= 1) {
      const enemy = game2State.enemies[j];
      if (!enemy) continue;
      if (bullet.position.distanceToSquared(enemy.position) < 0.9) {
        scene.remove(enemy);
        scene.remove(bullet);
        game2State.enemies.splice(j, 1);
        game2State.bullets.splice(i, 1);
        game2State.score += 1;
        spawnImpactRing(enemy.position, 0xff6f91);
        updateGame2HUD();
        ledEmitEvent('shooter_enemy_kill', { score: game2State.score });
        break;
      }
    }
  }

  const enemyToBase = new THREE.Vector3();
  for (let i = game2State.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = game2State.enemies[i];
    const toBase = enemyToBase
      .subVectors(game2State.base.position, enemy.position)
      .setY(0);
    const distanceToBaseSq = toBase.lengthSq();
    if (distanceToBaseSq > 0.0001) {
      toBase.normalize();
      enemy.position.addScaledVector(toBase, enemy.userData.speed * delta);
    }
    const collisionThreshold = 2.6;
    if (distanceToBaseSq < collisionThreshold * collisionThreshold) {
      scene.remove(enemy);
      game2State.enemies.splice(i, 1);
      game2State.health -= 1;
      triggerHitFlash(0xff4f8f);
      shakeTime = 0.25;
      showCenterMessage('ROBOT DAMAGED', 800);
      updateGame2HUD();
      ledEmitEvent('shooter_base_damaged', { health: game2State.health });
      if (game2State.health <= 0) {
        endGame2();
        return;
      }
    }
  }

  game2State.spawnTimer -= delta;
  if (game2State.spawnTimer <= 0) {
    spawnEnemy();
  }

  clampToArena(base, GAME2_ARENA_RADIUS);
  updateDriverCameraForGame2();
  updateTurretCamera();
  updateGame2HUD();
}

function resetRobots() {
  players.forEach((player) => {
    player.robot.position.copy(player.startPosition);
    player.robot.rotation.y = player.startRotation;
    player.velocity.set(0, 0);
    player.angularVelocity = 0;
  });
}

function startRound({ resetScores = false } = {}) {
  if (currentGame !== 'joust') return;
  if (nextRoundTimeout) {
    clearTimeout(nextRoundTimeout);
    nextRoundTimeout = null;
  }
  if (matchResetTimeout) {
    clearTimeout(matchResetTimeout);
    matchResetTimeout = null;
  }
  if (resetScores) {
    players.forEach((p) => (p.score = 0));
    currentRound = 1;
  }

  resetRobots();
  roundActive = false;
  updateScoreboard();
  showCenterMessage(`ROUND ${currentRound}`, 900);
  ledEmitEvent('joust_round_start', { round: currentRound, resetScores });

  nextRoundTimeout = setTimeout(() => {
    roundActive = true;
    showCenterMessage('');
  }, 900);
}

function startNextRound() {
  if (currentGame !== 'joust') return;
  if (currentRound < ROUND_LIMIT) {
    currentRound += 1;
  }
  updateScoreboard();
  startRound();
}

function endMatch(winner) {
  if (currentGame !== 'joust') return;
  roundActive = false;
  showCenterMessage(`${winner.id} WINS`, 0);
  ledEmitEvent('joust_win', { winner: winner.id });
  matchResetTimeout = setTimeout(() => {
    showCenterMessage('NEW MATCH', 1200);
    startRound({ resetScores: true });
  }, 2200);
}

function handleHit(attacker, defender) {
  roundActive = false;
  attacker.score += 1;
  pulseScore(attacker.scoreEl);
  const impactPosition = new THREE.Vector3()
    .addVectors(attacker.robot.position, defender.robot.position)
    .multiplyScalar(0.5);
  spawnImpactRing(impactPosition, attacker.bumper);
  triggerHitFlash(attacker.bumper);
  shakeTime = 0.35;
  updateScoreboard();
  showCenterMessage(`${attacker.id} HIT!`, 1000);
  ledEmitEvent('joust_hit', {
    attacker: attacker.id,
    attackerScore: attacker.score,
    defender: defender.id,
    p1Score: players[0].score,
    p2Score: players[1].score,
    winScore: WIN_SCORE,
  });

  if (attacker.score >= WIN_SCORE) {
    endMatch(attacker);
    return;
  }

  startNextRound();
}

function resolveBump(p1, p2, diff3, distance) {
  const collisionDistance = COLLISION_DISTANCE;
  let currentDistance = distance;
  const separation = diff3.clone();

  if (currentDistance <= 0) {
    separation.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    currentDistance = separation.length();
  }

  const overlap = collisionDistance - currentDistance;
  if (overlap <= 0) return;

  const pushDir = separation.setY(0).normalize();
  const pushVector = pushDir.multiplyScalar(overlap / 2);

  p1.robot.position.add(pushVector.clone().multiplyScalar(-1));
  p2.robot.position.add(pushVector);
}

function checkCollisions() {
  if (!roundActive || menuOpen) return;

  const posA = players[0].robot.position;
  const posB = players[1].robot.position;
  const diff3 = new THREE.Vector3().subVectors(posB, posA);
  const diff2 = new THREE.Vector2(diff3.x, diff3.z);
  const distance = diff2.length();
  const collisionDistance = COLLISION_DISTANCE;

  if (distance > collisionDistance) {
    return;
  }

  const dir = diff2.clone().normalize();
  const dirOpposite = dir.clone().multiplyScalar(-1);

  const p1Front = new THREE.Vector2(
    Math.sin(players[0].robot.rotation.y),
    Math.cos(players[0].robot.rotation.y)
  );
  const p2Front = new THREE.Vector2(
    Math.sin(players[1].robot.rotation.y),
    Math.cos(players[1].robot.rotation.y)
  );

  const p1Angle = p1Front.dot(dir);
  const p2Angle = p2Front.dot(dirOpposite);

  if (p1Angle > 0.6 && p2Angle < 0.35) {
    handleHit(players[0], players[1]);
  } else if (p2Angle > 0.6 && p1Angle < 0.35) {
    handleHit(players[1], players[0]);
  } else {
    resolveBump(players[0], players[1], diff3, distance);
  }
}

const clock = new THREE.Clock();

function updatePlayer(player, delta) {
  if (!roundActive || menuOpen) return;

  const moveInput = new THREE.Vector2(0, 0);
  let rotateInput = 0;
  let rotateSpeedFactor = 1;

  if (player.isAI) {
    const opponent = player === players[0] ? players[1] : players[0];
    const aiCommand = driveAI(player, opponent);
    moveInput.copy(aiCommand.moveVector);
    rotateInput = aiCommand.rotateInput;
    rotateSpeedFactor = aiCommand.rotateSpeedFactor;
  } else {
    if (keys[player.controls.up]) moveInput.y -= 1;
    if (keys[player.controls.down]) moveInput.y += 1;
    if (keys[player.controls.left]) moveInput.x -= 1;
    if (keys[player.controls.right]) moveInput.x += 1;
    addGamepadMovementInputJoust(moveInput, player.gamepadIndex);
    rotateInput =
      (keys[player.controls.rotateLeft] ? 1 : 0) - (keys[player.controls.rotateRight] ? 1 : 0);
    rotateInput += getGamepadRotateInput(player.gamepadIndex);
    rotateInput = THREE.MathUtils.clamp(rotateInput, -1, 1);
  }

  if (moveInput.lengthSq() > 0) {
    const magnitude = Math.min(1, moveInput.length());
    const targetVelocity = moveInput.normalize().multiplyScalar(ROBOT_SPEED * magnitude);
    const mix = Math.min(1, MOVE_ACCEL * delta);
    player.velocity.lerp(targetVelocity, mix);
  } else {
    const damping = Math.max(0, 1 - MOVE_DAMPING * delta);
    player.velocity.multiplyScalar(damping);
  }

  if (rotateInput !== 0) {
    const targetAngular = rotateInput * ROTATE_SPEED * rotateSpeedFactor;
    const mix = Math.min(1, ROTATE_ACCEL * delta);
    player.angularVelocity = THREE.MathUtils.lerp(player.angularVelocity, targetAngular, mix);
  } else {
    const damping = Math.max(0, 1 - ROTATE_DAMPING * delta);
    player.angularVelocity *= damping;
  }

  player.robot.position.x += player.velocity.x * delta;
  player.robot.position.z += player.velocity.y * delta;
  player.robot.rotation.y += player.angularVelocity * delta;

  clampToArena(player.robot);
}

function applyCameraShake(delta) {
  if (shakeTime <= 0) {
    if (currentGame === 'joust') {
      camera.position.copy(cameraBasePosition);
      camera.up.set(0, 0, -1);
      camera.lookAt(0, 0, 0);
    }
    return;
  }
  shakeTime -= delta;
  const intensity = Math.max(shakeTime, 0) / 0.35;
  const time = performance.now() * 0.01;
  if (currentGame === 'joust') {
    camera.position.set(
      cameraBasePosition.x + Math.sin(time * 3) * 0.6 * intensity,
      cameraBasePosition.y,
      cameraBasePosition.z + Math.cos(time * 2) * 0.6 * intensity
    );
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
  }
}

function isScreensaverVisible() {
  return !!(screensaverOverlay && screensaverOverlay.classList.contains('visible'));
}

function shouldPauseSceneWork() {
  return isScreensaverVisible() || startMenuVisible || menuOpen;
}

function animate() {
  requestAnimationFrame(animate);
  updateGamepads();
  const delta = clock.getDelta();
  handleGamepadMenus();
  updatePanoCrosshairVisibility();
  if (shouldPauseSceneWork()) {
    return;
  }
  updatePanoHeatmapSampling(delta);

  if (currentGame === 'joust') {
    players.forEach((player) => updatePlayer(player, delta));
    checkCollisions();
  }
  if (currentGame === 'shooter') {
    updateGame2(delta);
    updateDriverCameraForGame2();
    updateTurretCamera();
  }
  if (currentGame === 'gazePaddle') {
    updateGazePaddle(delta);
  }
  if (currentGame === 'gazeRunner') {
    updateLaneRunner(delta);
  }
  if (currentGame === 'pano') {
    updatePanoTimer(delta);
    handlePanoSelectorGamepadInput();
    updatePanoGamepadInput(delta);
    updatePanoView(delta);
  }
  updateImpactRings(delta);
  applyCameraShake(delta);

  if (currentGame === 'shooter') {
    renderGame2Views();
  } else {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, Math.max(window.innerHeight, 1));
    if (currentGame !== 'pano' && effectComposer) {
      if (postBloomPass) {
        const targetThreshold = DEFAULT_BLOOM_THRESHOLD;
        if (Math.abs(postBloomPass.threshold - targetThreshold) > 0.0001) {
          postBloomPass.threshold = targetThreshold;
        }
      }
      effectComposer.render();
    } else {
      renderer.render(scene, camera);
    }
  }
  updatePanoDevOverlay();
  updatePanoHeatmapOverlay();
  updatePanoHighlightOverlay();
}

function onResize() {
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  if (currentGame === 'shooter') {
    const halfWidth = Math.floor(width / 2);
    camera.aspect = halfWidth / height;
    turretCamera.aspect = (width - halfWidth) / height;
    camera.updateProjectionMatrix();
    turretCamera.updateProjectionMatrix();
  } else if (currentGame === 'pano') {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    turretCamera.aspect = width / height;
    turretCamera.updateProjectionMatrix();
  } else {
    resetMainCamera();
    turretCamera.aspect = width / height;
    turretCamera.updateProjectionMatrix();
  }
  renderer.setSize(width, height);
  resizePanoDevOverlay();
  resizePanoHighlightCanvas();
  resizePanoHeatmapCanvas();
  resizePostProcessing();
  updateGazePaddleDimensions({ preserveState: true });
}

window.addEventListener('resize', onResize);
window.addEventListener('blur', () => {
  Object.keys(keys).forEach((key) => {
    keys[key] = false;
  });
  panoState.dragging = false;
  if (currentGame === 'pano') {
    renderer.domElement.style.cursor = 'grab';
  }
});

updateGazePaddleDimensions();
resizePanoDevOverlay();
resizePanoHighlightCanvas();
resizePanoHeatmapCanvas();
initPostProcessing();
resizePostProcessing();
loadPanoTexture().catch((error) => {
  console.warn('[Pano]', 'Preload failed', error);
});
void loadPanoHeatmaps();
initScreensaverTracking();
showStartMenu();
animate();
