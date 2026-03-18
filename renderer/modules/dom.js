const appContainer = document.getElementById('app');
const hitFlash = document.getElementById('hitFlash');
const centerMessage = document.getElementById('centerMessage');
const p1ScoreEl = document.getElementById('p1Score');
const p2ScoreEl = document.getElementById('p2Score');
const roundInfoEl = document.getElementById('roundInfo');
const menuOverlay = document.getElementById('menuOverlay');
const menuPanels = Array.from(menuOverlay.querySelectorAll('.menu-panel-content'));
const allMenuButtons = Array.from(menuOverlay.querySelectorAll('button'));
const aiToggleLabel = document.getElementById('aiToggleLabel');
const aiDifficultyLabel = document.getElementById('aiDifficultyLabel');
const aiDriverLabel = document.getElementById('aiDriverLabel');
const aiTurretLabel = document.getElementById('aiTurretLabel');
const aiIndicator = document.getElementById('aiIndicator');
const startMenu = document.getElementById('startMenu');
const startMenuButtons = Array.from(startMenu.querySelectorAll('button[data-game]'));
const gazePaddleButton = startMenu.querySelector('button[data-game="gazePaddle"]');
const startMenuGuideTitle = document.getElementById('startMenuGuideTitle');
const startMenuGuideList = document.getElementById('startMenuGuideList');
const startMenuGuideNote = document.getElementById('startMenuGuideNote');
const controlBlocks = Array.from(document.querySelectorAll('.controls > div'));
const gazePanel = document.getElementById('gazePanel');
const gazeStatus = document.getElementById('gazeStatus');
const gazeCoords = document.getElementById('gazeCoords');
const gazePointer = document.getElementById('gazePointer');
const gazePaddleCanvas = document.getElementById('gazePaddleCanvas');
const gazeRunnerButton = startMenu.querySelector('button[data-game="gazeRunner"]');
const loadGazeCalibrationButton = document.getElementById('loadGazeCalibrationButton');
const screensaverOverlay = document.getElementById('screensaverOverlay');
const screensaverCanvas = document.getElementById('screensaverCanvas');
const screensaverDebugButton = document.getElementById('screensaverDebugButton');
const deviceInfoOverlay = document.getElementById('deviceInfoOverlay');
const panoSelector = document.getElementById('panoSelector');
const panoSelectorList = document.getElementById('panoSelectorList');
const panoHintImage = document.getElementById('panoHintImage');
const panoHintName = document.getElementById('panoHintName');
const panoHintDifficulty = document.getElementById('panoHintDifficulty');
const panoFoundOverlay = document.getElementById('panoFoundOverlay');
const panoFoundDescription = document.getElementById('panoFoundDescription');
const panoFoundPanel = document.getElementById('panoFoundPanel');
const panoRechooseButton = document.getElementById('panoRechooseButton');
const panoHintCard = document.getElementById('panoHintCard');
const panoDevPanel = document.getElementById('panoDevPanel');
const panoDevObjectSelect = document.getElementById('panoDevObjectSelect');
const panoDevPolygonList = document.getElementById('panoDevPolygonList');
const panoDevPointCount = document.getElementById('panoDevPointCount');
const panoDevStartPolygon = document.getElementById('panoDevStartPolygon');
const panoDevFinishPolygon = document.getElementById('panoDevFinishPolygon');
const panoDevRemovePolygon = document.getElementById('panoDevRemovePolygon');
const panoDevSave = document.getElementById('panoDevSave');
const panoDevReload = document.getElementById('panoDevReload');
const panoDevStatus = document.getElementById('panoDevStatus');
const panoDevToggle = document.getElementById('panoDevToggle');
const panoDevSelectorSkip = document.getElementById('panoDevSelectorSkip');
const panoDevAddName = document.getElementById('panoDevAddName');
const panoDevAddButton = document.getElementById('panoDevAddButton');
const panoDevOverlay = document.getElementById('panoDevOverlay');
const panoDevOverlayCanvas = document.getElementById('panoDevOverlayCanvas');
const panoHighlightOverlay = document.getElementById('panoHighlightOverlay');
const panoHighlightCanvas = document.getElementById('panoHighlightCanvas');
const panoHeatmapOverlay = document.getElementById('panoHeatmapOverlay');
const panoHeatmapCanvas = document.getElementById('panoHeatmapCanvas');
const panoHeatmapControls = document.getElementById('panoHeatmapControls');
const panoHeatmapModeButton = document.getElementById('panoHeatmapModeButton');
const panoHeatmapObjectSelect = document.getElementById('panoHeatmapObjectSelect');
const panoCrosshair = document.getElementById('panoCrosshair');
const panoResetButton = document.getElementById('panoResetButton');
const musicNowPlaying = document.getElementById('musicNowPlaying');
const musicPanel = document.getElementById('musicPanel');
const musicPanelNowPlaying = document.getElementById('musicPanelNowPlaying');
const musicPanelPlayPause = document.getElementById('musicPanelPlayPause');
const musicPanelMute = document.getElementById('musicPanelMute');
const musicPanelPrev = document.getElementById('musicPanelPrev');
const musicPanelNext = document.getElementById('musicPanelNext');
const musicPanelShuffle = document.getElementById('musicPanelShuffle');
const musicPanelVolDown = document.getElementById('musicPanelVolDown');
const musicPanelVolUp = document.getElementById('musicPanelVolUp');
const musicPanelHide = document.getElementById('musicPanelHide');

module.exports = {
  appContainer,
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
  gazeRunnerButton,
  loadGazeCalibrationButton,
  controlBlocks,
  gazePanel,
  gazeStatus,
  gazeCoords,
  gazePointer,
  gazePaddleCanvas,
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
  panoFoundPanel,
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
  panoFoundOverlay,
  panoFoundDescription,
  panoRechooseButton,
  panoHighlightOverlay,
  panoHighlightCanvas,
  panoHeatmapOverlay,
  panoHeatmapCanvas,
  panoHeatmapControls,
  panoHeatmapModeButton,
  panoHeatmapObjectSelect,
  panoCrosshair,
  panoResetButton,
  musicNowPlaying,
  musicPanel,
  musicPanelNowPlaying,
  musicPanelPlayPause,
  musicPanelMute,
  musicPanelPrev,
  musicPanelNext,
  musicPanelShuffle,
  musicPanelVolDown,
  musicPanelVolUp,
  musicPanelHide,
  panoDevOverlay,
  panoDevOverlayCanvas,
};
