let flabbyBirdRoot = null;
let flabbyGameScreen = null;
let flabbyExitButton = null;
let flabbyLeaderboardExitButton = null;
let flabbyGameExitButton = null;
let initialized = false;
let isActive = false;
let onExitToArcade = () => {};
const HIGH_SCORE_STORAGE_KEY = 'flappyLionHighScores';

function ensureFlappyLionDom() {
    if (document.getElementById('flabbyBirdRoot')) {
        bindFlappyLionElements();
        return;
    }

    const style = document.createElement('style');
    style.id = 'flappyLionStyles';
    style.textContent = `
        #flabbyBirdRoot {
            position: fixed;
            inset: 0;
            z-index: 90;
            display: flex;
            align-items: center;
            justify-content: center;
            background:
                radial-gradient(circle at top, rgba(255, 222, 114, 0.22), transparent 34%),
                linear-gradient(180deg, rgba(12, 19, 37, 0.7), rgba(6, 8, 18, 0.92));
            backdrop-filter: blur(6px);
            color: #fff6d1;
            font-family: 'Courier New', Courier, monospace;
        }

        #flabbyBirdRoot.hidden {
            display: none !important;
        }

        #flabbyBirdRoot button {
            border: 0;
            border-radius: 10px;
            cursor: pointer;
            font: inherit;
            transition: transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease;
        }

        .flappy-lion-panel {
            width: min(1420px, calc(100vw - 48px));
            height: min(920px, calc(100vh - 48px));
            position: relative;
            overflow: hidden;
            border-radius: 28px;
            border: 2px solid rgba(255, 217, 99, 0.35);
            box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
            background: linear-gradient(180deg, rgba(46, 103, 180, 0.16), rgba(14, 21, 45, 0.9));
        }

        .flappy-lion-screen {
            position: absolute;
            inset: 0;
        }

        #title-screen {
            background: linear-gradient(45deg, #87CEEB, #4682B4, #87CEEB, #6BB6FF);
            background-size: 400% 400%;
            animation: gradientMove 8s ease infinite;
        }

        #leaderboard-screen {
            background: linear-gradient(45deg, #2C3E50, #34495E, #2C3E50, #4A6741);
            background-size: 400% 400%;
            animation: gradientMove 8s ease infinite;
        }

        #countdown-screen {
            background:
                radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.2) 0%, transparent 50%),
                radial-gradient(circle at 70% 70%, rgba(255, 255, 255, 0.15) 0%, transparent 50%),
                linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 25%, #45B7D1 50%, #96CEB4 75%, #FF6B6B 100%);
            background-size: 100% 100%, 100% 100%, 200% 200%;
            animation: countdownShift 3s ease infinite;
        }

        #title-screen,
        #leaderboard-screen,
        #countdown-screen {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .flappy-lion-shell {
            width: min(560px, calc(100% - 48px));
            padding: 32px;
            border-radius: 18px;
            background: rgba(0, 0, 0, 0.72);
            border: 3px solid rgba(255, 217, 61, 0.45);
            box-shadow: 0 0 30px rgba(255, 217, 61, 0.2);
            text-align: center;
        }

        #game-title,
        #leaderboard-title {
            margin: 0 0 12px;
            font-size: clamp(2.5rem, 6vw, 4.6rem);
            line-height: 0.95;
            letter-spacing: 0.08em;
            color: #FFD93D;
            text-shadow: 3px 3px 0 #7f441a, 6px 6px 0 rgba(0, 0, 0, 0.3);
        }

        #subtitle {
            margin: 0 0 24px;
            color: #f8d78c;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            font-size: 0.95rem;
            text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.4);
        }

        #menu-buttons {
            display: grid;
            gap: 12px;
            margin-bottom: 20px;
        }

        .menu-btn,
        .flappy-lion-exit,
        .flappy-lion-leaderboard-button {
            padding: 14px 18px;
            background: linear-gradient(145deg, #FFD93D, #FFA500);
            color: #7f441a;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            box-shadow:
                inset 2px 2px 0 rgba(255, 255, 255, 0.32),
                inset -2px -2px 0 rgba(0, 0, 0, 0.25),
                4px 4px 0 #7f441a,
                6px 6px 0 rgba(0, 0, 0, 0.2);
        }

        .menu-btn.selected,
        .menu-btn:hover,
        .flappy-lion-exit:hover,
        .flappy-lion-leaderboard-button:hover {
            transform: translate(-1px, -1px);
            filter: brightness(1.05);
        }

        #controls-info {
            display: grid;
            gap: 8px;
            color: #f6df9f;
            font-size: 0.92rem;
            text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.35);
        }

        .control-row {
            display: flex;
            justify-content: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .key {
            padding: 3px 9px;
            border-radius: 6px;
            background: linear-gradient(145deg, #f0f0f0, #d0d0d0);
            border: 1px solid rgba(0, 0, 0, 0.12);
            color: #333;
        }

        #leaderboard-list {
            display: grid;
            gap: 12px;
            margin: 24px 0;
        }

        .score-entry {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            padding: 14px 18px;
            border-radius: 10px;
            background: linear-gradient(145deg, rgba(255, 217, 61, 0.1), rgba(255, 165, 0, 0.1));
            border: 2px solid rgba(255, 217, 61, 0.25);
        }

        .mode-name {
            color: #4ECDC4;
            font-weight: 700;
        }

        .score-value {
            color: #FFD93D;
            font-weight: 700;
        }

        #countdown-content {
            text-align: center;
            color: white;
            text-shadow: 0 8px 28px rgba(0,0,0,0.28);
        }

        #countdown-mode {
            font-size: 1.6rem;
            letter-spacing: 0.12em;
        }

        #countdown-number {
            font-size: clamp(5rem, 18vw, 10rem);
            font-weight: 900;
            line-height: 1;
        }

        #countdown-text {
            font-size: 1.25rem;
            letter-spacing: 0.24em;
        }

        .flappy-lion-actions {
            display: flex;
            justify-content: center;
            gap: 12px;
            flex-wrap: wrap;
        }

        .flappy-lion-actions.spaced {
            margin-top: 20px;
        }

        .flappy-lion-screen.hidden-screen {
            display: none;
        }

        #flabbyGameScreen {
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 18px;
            padding: 24px;
        }

        .flappy-lion-header {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
        }

        .flappy-lion-brand {
            display: grid;
            gap: 4px;
        }

        .flappy-lion-brand h2 {
            margin: 0;
            color: #ffd75e;
            letter-spacing: 0.08em;
        }

        .flappy-lion-brand p {
            margin: 0;
            color: #fff1bf;
            font-size: 0.92rem;
        }

        #game-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 20px;
            width: fit-content;
            max-width: 100%;
        }

        .flappy-lion-board-wrap {
            display: grid;
            gap: 8px;
            justify-items: center;
        }

        .flappy-lion-board-label {
            font-size: 0.85rem;
            letter-spacing: 0.18em;
            color: #fff1bf;
        }

        #board1,
        #board2 {
            display: block;
            border-radius: 8px;
            border: 3px solid #7f441a;
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3);
            background: #81d5f8;
        }

        .flappy-lion-footnote {
            color: #f1dfb1;
            font-size: 0.9rem;
            text-align: center;
            letter-spacing: 0.04em;
        }

        @keyframes gradientMove {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        @keyframes countdownShift {
            0% { background-position: 0% 0%, 0% 0%, 0% 50%; }
            50% { background-position: 100% 100%, 100% 100%, 100% 50%; }
            100% { background-position: 0% 0%, 0% 0%, 0% 50%; }
        }

        @media (max-width: 1180px) {
            .flappy-lion-panel {
                width: calc(100vw - 20px);
                height: calc(100vh - 20px);
                border-radius: 20px;
            }

            #game-container {
                flex-direction: column;
            }
        }
    `;
    document.head.appendChild(style);

    const root = document.createElement('section');
    root.id = 'flabbyBirdRoot';
    root.className = 'hidden';
    root.innerHTML = `
        <div class="flappy-lion-panel">
            <div id="title-screen" class="flappy-lion-screen">
                <div class="flappy-lion-shell">
                    <h1 id="game-title">FLAPPY LION</h1>
                    <div id="menu-buttons">
                        <button id="single-player-btn" class="menu-btn">Single Player</button>
                        <button id="two-player-btn" class="menu-btn">Two Player</button>
                        <button id="ai-vs-ai-btn" class="menu-btn">AI vs AI</button>
                        <button id="player-vs-ai-btn" class="menu-btn">Player vs AI</button>
                        <button id="leaderboard-btn" class="menu-btn">Leaderboard</button>
                    </div>
                    <div id="controls-info">
                        <div class="control-row"><span class="key">W</span> Left lion flap <span class="key">I</span> Right lion flap</div>
                        <div class="control-row"><span class="key">A / RT</span> Controller flap <span class="key">Start</span> Pause</div>
                        <div class="control-row"><span class="key">Enter</span> Select <span class="key">Esc</span> Return to arcade</div>
                    </div>
                    <div class="flappy-lion-actions spaced">
                        <button id="flabbyExitButton" class="flappy-lion-exit">Exit to Arcade</button>
                    </div>
                </div>
            </div>
            <div id="leaderboard-screen" class="flappy-lion-screen hidden-screen">
                <div class="flappy-lion-shell">
                    <h2 id="leaderboard-title">FLAPPY LION SCORES</h2>
                    <div id="leaderboard-list">
                        <div class="score-entry"><span class="mode-name">Single Player</span><span class="score-value" id="score-single">0</span></div>
                        <div class="score-entry"><span class="mode-name">Two Player</span><span class="score-value" id="score-two-player">0</span></div>
                        <div class="score-entry"><span class="mode-name">AI vs AI</span><span class="score-value" id="score-ai-vs-ai">0</span></div>
                        <div class="score-entry"><span class="mode-name">Player vs AI</span><span class="score-value" id="score-player-vs-ai">0</span></div>
                    </div>
                    <div class="flappy-lion-actions">
                        <button id="back-to-menu-btn" class="flappy-lion-leaderboard-button">Back to Menu</button>
                        <button id="flabbyLeaderboardExitButton" class="flappy-lion-exit">Exit to Arcade</button>
                    </div>
                </div>
            </div>
            <div id="countdown-screen" class="flappy-lion-screen hidden-screen">
                <div id="countdown-content">
                    <div id="countdown-mode">Single Player</div>
                    <div id="countdown-number">3</div>
                    <div id="countdown-text">GET READY</div>
                </div>
            </div>
            <div id="flabbyGameScreen" class="flappy-lion-screen">
                <div class="flappy-lion-header">
                    <div class="flappy-lion-brand">
                        <h2>FLAPPY LION</h2>
                    </div>
                    <button id="flabbyGameExitButton" class="flappy-lion-exit">Exit to Arcade</button>
                </div>
                <div id="game-container">
                    <div class="flappy-lion-board-wrap">
                        <div class="flappy-lion-board-label">LEFT BOARD</div>
                        <canvas id="board1"></canvas>
                    </div>
                    <div class="flappy-lion-board-wrap">
                        <div class="flappy-lion-board-label">RIGHT BOARD</div>
                        <canvas id="board2"></canvas>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(root);
    bindFlappyLionElements();
}

function bindFlappyLionElements() {
    flabbyBirdRoot = document.getElementById('flabbyBirdRoot');
    flabbyGameScreen = document.getElementById('flabbyGameScreen');
    flabbyExitButton = document.getElementById('flabbyExitButton');
    flabbyLeaderboardExitButton = document.getElementById('flabbyLeaderboardExitButton');
    flabbyGameExitButton = document.getElementById('flabbyGameExitButton');
}

// Game state management
let gameState = 'TITLE'; // 'TITLE', 'COUNTDOWN', 'PLAYING', 'LEADERBOARD'
let gameMode = 'SINGLE'; // 'SINGLE', 'TWO_PLAYER', 'AI_VS_AI', 'PLAYER_VS_AI'

// High Score System
let highScores = {
    SINGLE: 0,
    TWO_PLAYER: 0,
    AI_VS_AI: 0,
    PLAYER_VS_AI: 0
};

// Load high scores from localStorage
function loadHighScores() {
    const saved =
        localStorage.getItem(HIGH_SCORE_STORAGE_KEY) ||
        localStorage.getItem('flappyBirdHighScores');
    if (saved) {
        highScores = { ...highScores, ...JSON.parse(saved) };
    }
}

// Save high scores to localStorage
function saveHighScores() {
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify(highScores));
}

// Update high score for current mode
function updateHighScore(score) {
    if (score > highScores[gameMode]) {
        highScores[gameMode] = score;
        saveHighScores();
        return true; // New high score!
    }
    return false;
}

function drawScrollingBackground(game) {
    if (backgroundImg && backgroundImg.complete) {
        // Update background positions
        if (!game.gameOver) {
            backgroundX1 -= backgroundSpeed;
            backgroundX2 -= backgroundSpeed;

            // Reset positions when they go off screen
            if (backgroundX1 <= -backgroundImg.width) {
                backgroundX1 = backgroundX2 + backgroundImg.width;
            }
            if (backgroundX2 <= -backgroundImg.width) {
                backgroundX2 = backgroundX1 + backgroundImg.width;
            }
        }

        // Draw both background images to create seamless loop
        game.context.drawImage(backgroundImg, backgroundX1, 0, backgroundImg.width, game.board.height);
        game.context.drawImage(backgroundImg, backgroundX2, 0, backgroundImg.width, game.board.height);
    }
}

function drawDayNightOverlay(game) {
    const duskFactor = Math.sin(dayNightCycle.t * Math.PI);
    const darkness = 0.08 + duskFactor * 0.25;

    game.context.fillStyle = `rgba(10, 10, 40, ${Math.min(Math.max(darkness, 0), 0.35)})`;
    game.context.fillRect(0, 0, game.board.width, game.board.height);

    // Warm sunrise tint near the horizon
    if (duskFactor > 0) {
        const gradient = game.context.createLinearGradient(0, game.board.height, 0, game.board.height * 0.4);
        gradient.addColorStop(0, `rgba(255, 190, 92, ${0.25 * duskFactor})`);
        gradient.addColorStop(1, `rgba(255, 190, 92, 0)`);
        game.context.fillStyle = gradient;
        game.context.fillRect(0, 0, game.board.width, game.board.height);
    }
}

// Countdown system
let countdownTimer = 0;
let countdownValue = 3;

// Frame rate limiting
let lastTime = 0;
const targetFPS = 90;
const frameInterval = 1000 / targetFPS; // 16.67ms between frames at 60fps
let frameCount = 0;

// Gamepad support
let gamepadConnected = false;
let gamepadIndex = -1;
let gamepad2Connected = false;
let gamepad2Index = -1;
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
    DPAD_UP: 12,
    DPAD_DOWN: 13,
};
const gamepadFrameStates = {};
const AXIS_DEADZONE = 0.45;

// Controller navigation
let currentMenuIndex = 0;
let menuButtons = ['single-player-btn', 'two-player-btn', 'ai-vs-ai-btn', 'player-vs-ai-btn', 'leaderboard-btn'];
let leaderboardButtons = ['back-to-menu-btn'];
let currentLeaderboardIndex = 0;

function getGamepadFrameState(index) {
    if (!gamepadFrameStates[index]) {
        gamepadFrameStates[index] = {
            axisY: 0,
            buttons: {},
        };
    }
    return gamepadFrameStates[index];
}

function syncConnectedGamepads() {
    const pads = Array.from(navigator.getGamepads?.() || []).filter(Boolean);
    gamepadConnected = pads.length > 0;
    gamepad2Connected = pads.length > 1;
    gamepadIndex = gamepadConnected ? pads[0].index : -1;
    gamepad2Index = gamepad2Connected ? pads[1].index : -1;
}

function isGamepadButtonPressed(gamepad, buttonIndex) {
    const button = gamepad?.buttons?.[buttonIndex];
    if (!button) return false;
    if (typeof button.value === 'number' && button.value > 0.5) return true;
    return !!button.pressed;
}

//board - responsive sizing (scaled up for bigger game)
let boardWidth = 480; // Increased from 360
let boardHeight = 800; // Increased from 640
let canvasScale = 1;

//bird (scaled up)
let birdWidth = 45; //scaled up from 34
let birdHeight = 32; //scaled up from 24
let birdX = boardWidth / 8;
let birdY = boardHeight / 2;
let birdImg;

//bird animation
let birdAnimFrames = [];
let animationSpeed = 4; // frames per animation frame (reduced from 8 for faster animation)
let flapAnimationDuration = 12; // frames to show flap animation (reduced from 20)

//sound effects
let sfxWing;
let sfxHit;
let sfxDie;
let sfxPoint;

//scrolling background
let backgroundImg;
let backgroundX1 = 0;
let backgroundX2 = 0;
let backgroundSpeed = 0.15;

//easter egg
let rianbaldImg;
let rianbaldTrigger = {
    game1: false,
    game2: false
};
let rianbaldAnimation = {
    game1: { active: false, timer: 0, y: 0, targetY: 0 },
    game2: { active: false, timer: 0, y: 0, targetY: 0 }
};

function createBossState() {
    return {
        bullets: [],
        totalFired: 0,
        spawnCooldown: 36,
        spritePulse: 0,
    };
}

function createRandomEventState() {
    return {
        active: false,
        type: null,
        timer: 0,
        duration: 0,
        originalValues: {},
        boss: createBossState(),
    };
}

let randomEvents = {
    game1: createRandomEventState(),
    game2: createRandomEventState(),
};

const EVENT_TYPES = {
    BONUS_ROUND: {
        name: "BONUS ROUND",
        color: "#4ECDC4",
        description: "Wider pipes for easier passage!",
        duration: 600, // 10 seconds at 60fps
        probability: 0.15
    },
    SPEED_BOOST: {
        name: "SPEED BOOST",
        color: "#FF6B6B",
        description: "Pipes move faster for extra challenge!",
        duration: 600, // 8 seconds
        probability: 0.12
    },
    GRAVITY_SHIFT: {
        name: "GRAVITY SHIFT",
        color: "#96CEB4",
        description: "Reduced gravity for easier control!",
        duration: 600, // 12 seconds
        probability: 0.18
    },
    SCORE_MULTIPLIER: {
        name: "SCORE MULTIPLIER",
        color: "#FFD93D",
        description: "Double points for a limited time!",
        duration: 600, // 10 seconds
        probability: 0.20
    },
    SHIELD_MODE: {
        name: "SHIELD MODE",
        color: "#45B7D1",
        description: "Temporary invincibility!",
        duration: 600, // 5 seconds
        probability: 0.10
    },
    BOSS_FIGHT: {
        name: "BOSS FIGHT",
        color: "#8B0000",
        description: "RIAN fires a torrent of projectiles!",
        duration: 900, // 15 seconds
        probability: 0.08
    }
};

const BOSS_BULLET_LIMIT = 12;
const BOSS_BULLET_RADIUS = 9;
const BOSS_BULLET_SPRITE_SIZE = 112;

//pipes (scaled up)
let pipeWidth = 85; //scaled up from 64
let pipeHeight = 680; //scaled up from 512
let pipeX = boardWidth;
let pipeY = 0;

let topPipeImg;
let bottomPipeImg;

//physics
const BASE_VELOCITY_X = -5; //base pipes moving left speed
const BASE_GRAVITY = 0.41;
const JUMP_STRENGTH = -6;
let baseVelocityX = BASE_VELOCITY_X;
let velocityX = BASE_VELOCITY_X; //current pipes moving left speed
let gravity = BASE_GRAVITY;
let bounceVelocity = -7; //bounce when hitting ground

//difficulty settings
let basePipeInterval = 1750; //base pipe spawn interval in ms
let baseOpeningSpace = boardHeight / 4; //base gap between pipes
let currentPipeInterval = basePipeInterval;

// Juicy feedback systems
let screenShake = {
    game1: { timer: 0, intensity: 0, duration: 0 },
    game2: { timer: 0, intensity: 0, duration: 0 }
};
let particles = {
    game1: [],
    game2: []
};

// Pause + ambience
let isPaused = false;
let dayNightCycle = {
    t: 0, // 0..1
    direction: 1
};

//AI settings
let aiEnabled = {
    game1: false,
    game2: false
};

//game instances for both players
let game1 = {
    board: null,
    context: null,
    bird: {
        x: birdX,
        y: birdY,
        width: birdWidth,
        height: birdHeight
    },
    pipeArray: [],
    velocityY: 0,
    gameOver: false,
    score: 0,
    deathAnimation: false,
    deathTimer: 0,
    hasBounced: false,
    gameOverScreenTimer: 0,
    canRestart: false,
    gameOverPanel: {
        y: boardHeight,
        targetY: boardHeight / 2 - 100,
        velocity: 0,
        settled: false
    },
    pipeInterval: null,
    lastDifficultyUpdate: 0,
    animationFrame: 0,
    animationTimer: 0,
    flapAnimation: 0,
    isFlapping: false,
    perfectStreak: 0,
    precisionTimer: 0,
    // AI properties
    aiLastDecision: 0
};

let game2 = {
    board: null,
    context: null,
    bird: {
        x: birdX,
        y: birdY,
        width: birdWidth,
        height: birdHeight
    },
    pipeArray: [],
    velocityY: 0,
    gameOver: false,
    score: 0,
    deathAnimation: false,
    deathTimer: 0,
    hasBounced: false,
    gameOverScreenTimer: 0,
    canRestart: false,
    gameOverPanel: {
        y: boardHeight,
        targetY: boardHeight / 2 - 100,
        velocity: 0,
        settled: false
    },
    pipeInterval: null,
    lastDifficultyUpdate: 0,
    animationFrame: 0,
    animationTimer: 0,
    flapAnimation: 0,
    isFlapping: false,
    perfectStreak: 0,
    precisionTimer: 0,
    // AI properties
    aiLastDecision: 0
};

function initFlabbyBird() {
    if (initialized) return;
    initialized = true;
    ensureFlappyLionDom();
    loadHighScores(); // Load saved high scores
    setupResponsiveCanvas();
    setupMenuButtons();

    //left side game
    game1.board = document.getElementById("board1");
    game1.board.height = boardHeight;
    game1.board.width = boardWidth;
    game1.context = game1.board.getContext("2d");

    //right side game
    game2.board = document.getElementById("board2");
    game2.board.height = boardHeight;
    game2.board.width = boardWidth;
    game2.context = game2.board.getContext("2d");

    //load images
    birdImg = new Image();
    birdImg.src = "./flappybird0.png";

    // Load bird animation frames
    for (let i = 0; i < 3; i++) {
        let frame = new Image();
        frame.src = `./flappybird${i}.png`;
        birdAnimFrames.push(frame);
    }

    topPipeImg = new Image();
    topPipeImg.src = "./toppipe.png";

    bottomPipeImg = new Image();
    bottomPipeImg.src = "./bottompipe.png";

    //load sound effects
    sfxWing = new Audio();
    sfxWing.src = "./sfx_wing.wav";

    sfxHit = new Audio();
    sfxHit.src = "./sfx_hit.wav";

    sfxDie = new Audio();
    sfxDie.src = "./sfx_die.wav";

    sfxPoint = new Audio();
    sfxPoint.src = "./sfx_point.wav";

    //load scrolling background image
    backgroundImg = new Image();
    backgroundImg.src = "./anotherbg.png";

    // Initialize background positions
    backgroundImg.onload = function () {
        backgroundX2 = backgroundImg.width;
    };

    //load easter egg image
    rianbaldImg = new Image();
    rianbaldImg.src = "./rianbald.png";



    // Only start the game loop, don't start pipe intervals yet
    requestAnimationFrame(update);

    window.addEventListener("resize", setupResponsiveCanvas);
    
    // Gamepad event listeners
    window.addEventListener("gamepadconnected", handleGamepadConnected);
    window.addEventListener("gamepaddisconnected", handleGamepadDisconnected);

    // Initialize menu navigation
    updateMenuHighlight();
}

function showFlabbyRoot() {
    if (flabbyBirdRoot) {
        flabbyBirdRoot.classList.remove('hidden');
    }
}

function hideFlabbyRoot() {
    if (flabbyBirdRoot) {
        flabbyBirdRoot.classList.add('hidden');
    }
}

function setupResponsiveCanvas() {
    const container = document.getElementById("game-container");
    if (!container) return;
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;

    // Calculate scale to fit both canvases side by side
    const totalWidth = boardWidth * 2 + 20; // 20px gap between canvas
    const scaleX = containerWidth / totalWidth;
    const scaleY = containerHeight / boardHeight;
    canvasScale = Math.min(scaleX, scaleY, 1.2); // Increased max scale from 1 to 1.2 for bigger display

    //scaling to the container we are in
    container.style.transform = `scale(${canvasScale})`;
    container.style.transformOrigin = 'center center';
}

function setupMenuButtons() {
    document.getElementById('single-player-btn')?.addEventListener('click', () => startCountdown('SINGLE'));
    document.getElementById('two-player-btn')?.addEventListener('click', () => startCountdown('TWO_PLAYER'));
    document.getElementById('ai-vs-ai-btn')?.addEventListener('click', () => startCountdown('AI_VS_AI'));
    document.getElementById('player-vs-ai-btn')?.addEventListener('click', () => startCountdown('PLAYER_VS_AI'));
    document.getElementById('leaderboard-btn')?.addEventListener('click', () => showLeaderboard());
    document.getElementById('back-to-menu-btn')?.addEventListener('click', () => hideLeaderboard());
    flabbyExitButton?.addEventListener('click', () => exitToArcade());
    flabbyLeaderboardExitButton?.addEventListener('click', () => exitToArcade());
    flabbyGameExitButton?.addEventListener('click', () => exitToArcade());
}

function showLeaderboard() {
    gameState = 'LEADERBOARD';
    currentLeaderboardIndex = 0;

    // Update leaderboard display with current high scores
    document.getElementById('score-single').textContent = highScores.SINGLE;
    document.getElementById('score-two-player').textContent = highScores.TWO_PLAYER;
    document.getElementById('score-ai-vs-ai').textContent = highScores.AI_VS_AI;
    document.getElementById('score-player-vs-ai').textContent = highScores.PLAYER_VS_AI;

    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('leaderboard-screen').style.display = 'flex';
    
    // Initialize leaderboard highlight
    updateLeaderboardHighlight();
}

function hideLeaderboard() {
    gameState = 'TITLE';
    document.getElementById('leaderboard-screen').style.display = 'none';
    document.getElementById('title-screen').style.display = 'flex';
}



function startCountdown(mode) {
    gameMode = mode;
    gameState = 'COUNTDOWN';
    countdownValue = 3;
    countdownTimer = 0;

    // Hide title screen and show countdown
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('countdown-screen').style.display = 'flex';

    // Set countdown mode text
    const modeNames = {
        'SINGLE': 'SINGLE PLAYER',
        'TWO_PLAYER': 'TWO PLAYER',
        'AI_VS_AI': 'AI vs AI',
        'PLAYER_VS_AI': 'PLAYER vs AI'
    };
    document.getElementById('countdown-mode').textContent = modeNames[mode];
    document.getElementById('countdown-number').textContent = countdownValue;

    // Play countdown sound
    playSound(sfxWing);
}

function startGame(mode) {
    gameState = 'PLAYING';
    isPaused = false;

    // Reset all global game variables to original values before starting
    velocityX = BASE_VELOCITY_X;
    gravity = BASE_GRAVITY;
    baseVelocityX = BASE_VELOCITY_X;
    currentPipeInterval = basePipeInterval;
    baseOpeningSpace = boardHeight / 4;
    dayNightCycle.t = 0;
    dayNightCycle.direction = 1;

    // Reset all random events
    randomEvents.game1 = createRandomEventState();
    randomEvents.game2 = createRandomEventState();

    // Hide countdown screen and show game
    document.getElementById('countdown-screen').style.display = 'none';
    if (flabbyGameScreen) {
        flabbyGameScreen.style.display = 'flex';
    }
    document.getElementById('game-container').style.display = 'flex';

    // Configure AI based on game mode
    switch (mode) {
        case 'SINGLE':
            aiEnabled.game1 = false;
            aiEnabled.game2 = false;
            // Hide second canvas for single player
            document.getElementById('board2').style.display = 'none';
            break;
        case 'TWO_PLAYER':
            aiEnabled.game1 = false;
            aiEnabled.game2 = false;
            document.getElementById('board2').style.display = 'block';
            break;
        case 'AI_VS_AI':
            aiEnabled.game1 = true;
            aiEnabled.game2 = true;
            document.getElementById('board2').style.display = 'block';
            break;
        case 'PLAYER_VS_AI':
            aiEnabled.game1 = false;
            aiEnabled.game2 = true;
            document.getElementById('board2').style.display = 'block';
            break;
    }

    // Initialize games
    initializeGames();
}

function initializeGames() {
    // Reset both games
    resetGame(game1);
    resetGame(game2);

    // Draw initial birds
    if (birdAnimFrames[0] && birdAnimFrames[0].complete) {
        const initialFrame = birdAnimFrames[0];
        game1.context.drawImage(initialFrame, game1.bird.x, game1.bird.y, game1.bird.width, game1.bird.height);
        if (gameMode !== 'SINGLE') {
            game2.context.drawImage(initialFrame, game2.bird.x, game2.bird.y, game2.bird.width, game2.bird.height);
        }
    }

    // Start pipe intervals
    game1.pipeInterval = setInterval(() => placePipes(game1), currentPipeInterval);
    if (gameMode !== 'SINGLE') {
        game2.pipeInterval = setInterval(() => placePipes(game2), currentPipeInterval);
    }
}

function calculateDifficulty(score) {
    // Square root function for progressive difficulty
    // Starts at 1.0 and increases gradually
    const difficultyMultiplier = 1 + Math.sqrt(score) * 0.1;

    // Calculate new pipe speed (faster as score increases)
    const newVelocityX = baseVelocityX * difficultyMultiplier;

    // Calculate new pipe interval (more frequent pipes, but not too crazy)
    const newPipeInterval = Math.max(basePipeInterval / (1 + Math.sqrt(score) * 0.05), 1000);

    // Calculate new opening space (smaller gap, but keep it playable)
    const newOpeningSpace = Math.max(baseOpeningSpace - Math.sqrt(score) * 2, baseOpeningSpace * 0.6);

    return {
        velocityX: Math.max(newVelocityX, baseVelocityX * 2.5), // Cap at 2.5x speed
        pipeInterval: newPipeInterval,
        openingSpace: newOpeningSpace
    };
}

function updateDifficulty(game) {
    // Update difficulty every 5 points to avoid constant changes
    const scoreThreshold = Math.floor(game.score / 5) * 5;

    if (scoreThreshold > game.lastDifficultyUpdate) {
        game.lastDifficultyUpdate = scoreThreshold;

        const difficulty = calculateDifficulty(game.score);
        velocityX = difficulty.velocityX;

        // Update pipe interval by clearing old interval and creating new one
        if (game.pipeInterval) {
            clearInterval(game.pipeInterval);
            game.pipeInterval = setInterval(() => placePipes(game), difficulty.pipeInterval);
        }
    }
}

function updateBirdAnimation(game) {
    // Handle flap animation when jumping - cycle through once
    if (game.isFlapping) {
        game.flapAnimation++;
        // Calculate which frame to show (0, 1, 2, then back to 0)
        const frameIndex = Math.floor(game.flapAnimation / 3) % 3; // 3 frames per animation frame for faster transition
        game.animationFrame = frameIndex;

        // End animation after one complete cycle (3 frames * 3 = 9 frames)
        if (game.flapAnimation >= 9) {
            game.isFlapping = false;
            game.flapAnimation = 0;
            game.animationFrame = 0; // Reset to first frame when not flapping
        }
    }
}

function drawBird(game) {
    // Always use the current animation frame (0 when idle, cycles 0->1->2->0 when flapping)
    let currentFrame = birdAnimFrames[game.animationFrame];

    // Use fallback if animation frames aren't loaded yet
    if (!currentFrame || !currentFrame.complete) {
        currentFrame = birdAnimFrames[0] || birdImg;
    }

    // Save the current context state
    game.context.save();

    // Add glow effect
    let glowColor = '#FFD93D'; // Default golden glow
    let glowBlur = 15;
    
    // Check for shield mode
    let gameKey = game === game1 ? 'game1' : 'game2';
    if (randomEvents[gameKey].active && randomEvents[gameKey].type === 'SHIELD_MODE') {
        glowColor = '#45B7D1'; // Blue glow for shield
        glowBlur = 25; // Stronger glow for shield
    }
    
    game.context.shadowColor = glowColor;
    game.context.shadowBlur = glowBlur;
    game.context.shadowOffsetX = 0;
    game.context.shadowOffsetY = 0;

    // Draw the bird with glow and tilt based on velocity for a snappier feel
    const tilt = Math.max(-0.35, Math.min(0.65, game.velocityY * 0.08));
    game.context.translate(game.bird.x + game.bird.width / 2, game.bird.y + game.bird.height / 2);
    game.context.rotate(tilt);
    game.context.drawImage(currentFrame, -game.bird.width / 2, -game.bird.height / 2, game.bird.width, game.bird.height);

    // Restore the context state to avoid affecting other drawings
    game.context.restore();
}

function applyScreenShake(game, gameKey) {
    const shake = screenShake[gameKey];
    if (shake.timer > 0) {
        shake.timer--;
        const progress = shake.timer / Math.max(shake.duration || 1, 1);
        const magnitude = shake.intensity * progress;
        const offsetX = (Math.random() - 0.5) * magnitude;
        const offsetY = (Math.random() - 0.5) * magnitude;
        game.context.translate(offsetX, offsetY);
    }
}

function triggerScreenShake(gameKey, intensity = 6, duration = 12) {
    screenShake[gameKey] = {
        timer: duration,
        duration: duration,
        intensity: intensity
    };
}

function spawnParticles(gameKey, x, y, color = "#FFD93D", count = 10, spread = 1.8, speed = 2.2) {
    const store = particles[gameKey];
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI - Math.PI / 2;
        const magnitude = speed + Math.random() * speed * 0.7;
        store.push({
            x,
            y,
            vx: Math.cos(angle) * magnitude * spread,
            vy: Math.sin(angle) * magnitude * spread,
            life: 24 + Math.random() * 12,
            maxLife: 24 + Math.random() * 12,
            size: 2 + Math.random() * 2,
            color
        });
    }
}

function drawParticles(game, gameKey, paused = false) {
    const store = particles[gameKey];
    for (let i = store.length - 1; i >= 0; i--) {
        const p = store[i];

        if (!paused) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15;
            p.life--;
        }

        if (p.life <= 0) {
            store.splice(i, 1);
            continue;
        }

        const alpha = Math.min(Math.max(p.life / p.maxLife, 0), 1);
        game.context.fillStyle = `${p.color}${alpha < 0.4 ? "66" : ""}`;
        game.context.globalAlpha = alpha;
        game.context.beginPath();
        game.context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        game.context.fill();
        game.context.globalAlpha = 1;
    }
    game.context.globalAlpha = 1;
}

function update(currentTime = 0) {
    if (!isActive) {
        requestAnimationFrame(update);
        return;
    }

    // Frame rate limiting - only update at 60fps
    if (currentTime - lastTime >= frameInterval) {
        lastTime = currentTime;
        frameCount++;
        tickDayNightCycle();
        updateControllerNavigation();
        
        if (gameState === 'COUNTDOWN') {
            updateCountdown();
        } else if (gameState === 'PLAYING') {
            updateGame(game1);
            if (gameMode !== 'SINGLE') {
                updateGame(game2);
            }
        }
    }
    
    requestAnimationFrame(update);
}

function tickDayNightCycle() {
    if (isPaused || gameState !== 'PLAYING') return;
    const delta = 0.0006 * dayNightCycle.direction;
    dayNightCycle.t += delta;
    if (dayNightCycle.t > 1) {
        dayNightCycle.t = 1;
        dayNightCycle.direction = -1;
    } else if (dayNightCycle.t < 0) {
        dayNightCycle.t = 0;
        dayNightCycle.direction = 1;
    }
}

function updateCountdown() {
    countdownTimer++;

    // Update every 60 frames (1 second at 60fps)
    if (countdownTimer % 60 === 0) {
        countdownValue--;

        if (countdownValue > 0) {
            document.getElementById('countdown-number').textContent = countdownValue;
            // Trigger animation by removing and re-adding class
            const numberEl = document.getElementById('countdown-number');
            numberEl.style.animation = 'none';
            setTimeout(() => {
                numberEl.style.animation = 'countdownPulse 1s ease-in-out';
            }, 10);
            playSound(sfxWing);
        } else {
            // Start the game!
            document.getElementById('countdown-number').textContent = 'GO!';
            document.getElementById('countdown-text').textContent = 'FLY!';
            playSound(sfxPoint);

            setTimeout(() => {
                startGame(gameMode);
            }, 500);
        }
    }
}

function updateGame(game) {
    const gameKey = game === game1 ? 'game1' : 'game2';
    const paused = isPaused && gameState === 'PLAYING' && !game.gameOver;

    game.context.save();
    applyScreenShake(game, gameKey);
    game.context.clearRect(0, 0, game.board.width, game.board.height);

    // Draw scrolling background + ambience
    drawScrollingBackground(game);
    drawDayNightOverlay(game);

    // Update random events
    if (!paused) {
        updateRandomEvent(game, gameKey);
    } else if (randomEvents[gameKey].active) {
        drawEventIndicator(game, gameKey);
    }

    // AI decision making
    if (aiEnabled[gameKey] && !game.gameOver && !paused) {
        updateAI(game);
    }
    
    // Handle death animation
    if (game.gameOver && !game.deathAnimation && !paused) {
        game.deathAnimation = true;
        game.deathTimer = 0;
    }

    if (game.deathAnimation) {
        if (!paused) {
            game.deathTimer++;
            //continue bird physics during animation
            game.velocityY += gravity;
            game.bird.y += game.velocityY;

            //bounce only once when hitting ground
            if (game.bird.y > game.board.height - 90 && !game.hasBounced) {
                game.bird.y = game.board.height - 90;
                if (game.velocityY > 0) {
                    game.velocityY = bounceVelocity;
                    game.hasBounced = true;
                }
            }
        }

        //draw bird with slight rot using first animation frame
        game.context.save();
        game.context.translate(game.bird.x + game.bird.width / 2, game.bird.y + game.bird.height / 2);
        game.context.rotate(Math.PI / 4); //45 deg rotation

        // Add glow effect for death animation too
        game.context.shadowColor = '#FF6B6B'; // Red glow for death
        game.context.shadowBlur = 20; // Slightly stronger glow for dramatic effect
        game.context.shadowOffsetX = 0;
        game.context.shadowOffsetY = 0;

        const deathFrame = birdAnimFrames[0] && birdAnimFrames[0].complete ? birdAnimFrames[0] : birdImg;
        game.context.drawImage(deathFrame, -game.bird.width / 2, -game.bird.height / 2, game.bird.width, game.bird.height);
        game.context.restore();
    } else if (!game.gameOver) {
        //bird - normal gameplay
        if (!paused) {
            game.velocityY += gravity;
            game.bird.y = Math.max(game.bird.y + game.velocityY, 0); //apply gravity to current bird.y, limit the bird.y to top of the canvas

            // Update bird animation
            updateBirdAnimation(game);
        }
        drawBird(game);

        //check for death
        if (!paused && (game.bird.y > game.board.height - 90 || game.bird.y <= 0)) {
            game.gameOver = true;
            isPaused = false;
            playSound(sfxDie);
        }
    }

    //pipes
    for (let i = 0; i < game.pipeArray.length; i++) {
        let pipe = game.pipeArray[i];
        if (!game.gameOver && !paused) {
            pipe.x += velocityX;
        }
        game.context.drawImage(pipe.img, pipe.x, pipe.y, pipe.width, pipe.height);

        if (paused) {
            continue;
        }

        if (!pipe.passed && game.bird.x > pipe.x + pipe.width && !game.gameOver) {
            // Calculate score with multiplier
            let scoreGain = 0.5; //0.5 because there are 2 pipes! so 0.5*2 = 1, 1 for each set of pipes
            
            // Apply score multiplier if active
            if (randomEvents[gameKey].active && randomEvents[gameKey].type === 'SCORE_MULTIPLIER') {
                scoreGain *= 2;
            }

            // Perfect pass reward on the bottom pipe only to avoid double counting
            if (pipe.img === bottomPipeImg) {
                scoreGain += handlePerfectPass(game, pipe);
            }
            
            game.score += scoreGain;
            pipe.passed = true;

            // Play point sound when score increases by a full point (every 2 pipes)
            if (Math.floor(game.score) > Math.floor(game.score - scoreGain)) {
                playSound(sfxPoint);
            }

            // Trigger rianbald easter egg at score 5
            if ((Math.floor(game.score) === 41 || Math.floor(game.score) === 67 || (Math.floor(game.score) % 100 === 0 && Math.floor(game.score) > 5)) && !rianbaldTrigger[gameKey]) {
                rianbaldTrigger[gameKey] = true;
                triggerRianbaldEasterEgg(game, pipe);
            }

            // Check for random events
            checkRandomEvent(game, gameKey);

            // Update difficulty when score changes
            updateDifficulty(game);
        }

        if (detectCollisionWithShield(game.bird, pipe, game, gameKey) && !game.gameOver) {
            game.gameOver = true;
            isPaused = false;
            playSound(sfxHit);
            playSound(sfxDie);
        }
    }

    if (
        randomEvents[gameKey].active &&
        randomEvents[gameKey].type === 'BOSS_FIGHT' &&
        !game.gameOver
    ) {
        for (const bullet of randomEvents[gameKey].boss.bullets) {
            if (collidesWithBossBullet(game.bird, bullet)) {
                game.gameOver = true;
                isPaused = false;
                playSound(sfxHit);
                playSound(sfxDie);
                break;
            }
        }
    }

    //clear pipes
    while (game.pipeArray.length > 0 && game.pipeArray[0].x < -pipeWidth) {
        game.pipeArray.shift(); //removes first element from the array
    }

    //score - nice styling with real-time high score display
    if (!game.gameOver || game.deathTimer <= 60) {
        const currentScore = Math.floor(game.score);
        let currentHighScore = highScores[gameMode];

        // Update high score in real time if current score is higher
        if (currentScore > currentHighScore) {
            currentHighScore = currentScore;
            highScores[gameMode] = currentScore;
            saveHighScores();
        }

        // Current Score shadow
        game.context.fillStyle = "rgba(0, 0, 0, 0.7)";
        game.context.font = "bold 36px 'Courier New', monospace";
        game.context.fillText(currentScore, 12, 52);

        // Main score text
        game.context.fillStyle = currentScore >= currentHighScore ? "#FF6B6B" : "#FFD93D";
        game.context.fillText(currentScore, 10, 50);

        // High Score display (smaller, top right)
        game.context.fillStyle = "rgba(0, 0, 0, 0.7)";
        game.context.font = "bold 18px 'Courier New', monospace";
        game.context.textAlign = "right";
        game.context.fillText(`BEST: ${currentHighScore}`, game.board.width - 8, 32);

        game.context.fillStyle = "#4ECDC4";
        game.context.fillText(`BEST: ${currentHighScore}`, game.board.width - 10, 30);

        // Reset text alignment
        game.context.textAlign = "start";
    }

    drawStreakMeter(game);

    // Enhanced game over screen
    if (game.gameOver && game.deathTimer > 60) { // Show after 1 second of death animation
        game.gameOverScreenTimer++;
        if (game.gameOverScreenTimer > 60) { // Allow restart after 1 second of game over screen
            game.canRestart = true;
        }
        drawGameOverScreen(game);
    }

    // Draw rianbald easter egg
    if (rianbaldAnimation[gameKey].active && !paused) {
        drawRianbaldEasterEgg(game, gameKey);
    }

    if (randomEvents[gameKey].active && randomEvents[gameKey].type === 'BOSS_FIGHT') {
        drawBossFight(game, gameKey);
    }

    drawParticles(game, gameKey, paused);

    if (paused) {
        drawPauseOverlay(game);
    }

    game.context.restore();
}

function placePipes(game) {
    if (game.gameOver || isPaused || gameState !== 'PLAYING') {
        return;
    }

    //(0-1) * pipeHeight/2.
    // 0 -> -128 (pipeHeight/4)
    // 1 -> -128 - 256 (pipeHeight/4 - pipeHeight/2) = -3/4 pipeHeight
    let randomPipeY = pipeY - pipeHeight / 4 - Math.random() * (pipeHeight / 2);

    // Use dynamic opening space based on current difficulty
    const difficulty = calculateDifficulty(game.score);
    let openingSpace = difficulty.openingSpace;

    let topPipe = {
        img: topPipeImg,
        x: pipeX,
        y: randomPipeY,
        width: pipeWidth,
        height: pipeHeight,
        passed: false,
        openingSpace: openingSpace
    }
    game.pipeArray.push(topPipe);

    let bottomPipe = {
        img: bottomPipeImg,
        x: pipeX,
        y: randomPipeY + pipeHeight + openingSpace,
        width: pipeWidth,
        height: pipeHeight,
        passed: false,
        openingSpace: openingSpace
    }
    game.pipeArray.push(bottomPipe);
}

function attemptJump(game) {
    if (gameState !== 'PLAYING' || isPaused || game.gameOver) return;
    const gameKey = game === game1 ? 'game1' : 'game2';
    if (aiEnabled[gameKey]) return;
    executeJump(game);
}

function togglePause() {
    if (gameState !== 'PLAYING') return;
    if (gameMode === 'SINGLE' && game1.gameOver) return;
    if (gameMode !== 'SINGLE' && game1.gameOver && game2.gameOver) return;
    isPaused = !isPaused;
}

function drawPauseOverlay(game) {
    game.context.fillStyle = "rgba(0, 0, 0, 0.65)";
    game.context.fillRect(0, 0, game.board.width, game.board.height);

    game.context.textAlign = "center";
    game.context.fillStyle = "#FFD93D";
    game.context.font = "bold 34px 'Courier New', monospace";
    game.context.fillText("PAUSED", game.board.width / 2, game.board.height / 2 - 10);

    game.context.fillStyle = "#4ECDC4";
    game.context.font = "16px 'Courier New', monospace";
    game.context.fillText("Press Start to resume", game.board.width / 2, game.board.height / 2 + 28);
    game.context.textAlign = "start";
}

// Controller navigation functions
function updateControllerNavigation() {
    if (!isActive) return;
    syncConnectedGamepads();
    const gamepads = navigator.getGamepads();
    let navIndex = -1;
    if (gamepadIndex !== -1 && gamepads[gamepadIndex]) {
        navIndex = gamepadIndex;
    } else if (gamepad2Index !== -1 && gamepads[gamepad2Index]) {
        navIndex = gamepad2Index;
    } else {
        // fallback: find first connected gamepad
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) { navIndex = i; break; }
        }
    }

    if (navIndex === -1) {
        return;
    }

    const gamepad = gamepads[navIndex];
    if (!gamepad) return;

    handleDpadNavigation(gamepad, navIndex);
    handleStickNavigation(gamepad, navIndex);
    handleButtonPresses(gamepad, navIndex);

    if (gameState === 'PLAYING' && gamepad2Index !== -1 && gamepad2Index !== navIndex) {
        const secondGamepad = gamepads[gamepad2Index];
        if (secondGamepad) {
            handleButtonPresses(secondGamepad, gamepad2Index);
        }
    }
}

function handleStickNavigation(gamepad, index) {
    const yAxis = typeof gamepad.axes[1] === 'number' ? gamepad.axes[1] : 0;
    const state = getGamepadFrameState(index);
    const lastY = state.axisY;

    const up = yAxis < -AXIS_DEADZONE;
    const down = yAxis > AXIS_DEADZONE;
    const wasUp = lastY < -AXIS_DEADZONE;
    const wasDown = lastY > AXIS_DEADZONE;

    if (up && !wasUp && !wasDown) {
        if (gameState === 'TITLE') {
            currentMenuIndex = Math.max(0, currentMenuIndex - 1);
            updateMenuHighlight();
        } else if (gameState === 'LEADERBOARD') {
            currentLeaderboardIndex = Math.max(0, currentLeaderboardIndex - 1);
            updateLeaderboardHighlight();
        }
        playSound(sfxWing);
    } else if (down && !wasDown && !wasUp) {
        if (gameState === 'TITLE') {
            currentMenuIndex = Math.min(menuButtons.length - 1, currentMenuIndex + 1);
            updateMenuHighlight();
        } else if (gameState === 'LEADERBOARD') {
            currentLeaderboardIndex = Math.min(leaderboardButtons.length - 1, currentLeaderboardIndex + 1);
            updateLeaderboardHighlight();
        }
        playSound(sfxWing);
    }

    state.axisY = yAxis;
}

function handleDpadNavigation(gamepad, index) {
    const state = getGamepadFrameState(index);
    const dpadUp = isGamepadButtonPressed(gamepad, GAMEPAD_BUTTONS.DPAD_UP);
    const dpadDown = isGamepadButtonPressed(gamepad, GAMEPAD_BUTTONS.DPAD_DOWN);
    const wasUp = !!state.buttons[GAMEPAD_BUTTONS.DPAD_UP];
    const wasDown = !!state.buttons[GAMEPAD_BUTTONS.DPAD_DOWN];

    if (dpadUp && !wasUp) {
        if (gameState === 'TITLE') {
            currentMenuIndex = Math.max(0, currentMenuIndex - 1);
            updateMenuHighlight();
        } else if (gameState === 'LEADERBOARD') {
            currentLeaderboardIndex = Math.max(0, currentLeaderboardIndex - 1);
            updateLeaderboardHighlight();
        }
        playSound(sfxWing);
    }

    if (dpadDown && !wasDown) {
        if (gameState === 'TITLE') {
            currentMenuIndex = Math.min(menuButtons.length - 1, currentMenuIndex + 1);
            updateMenuHighlight();
        } else if (gameState === 'LEADERBOARD') {
            currentLeaderboardIndex = Math.min(leaderboardButtons.length - 1, currentLeaderboardIndex + 1);
            updateLeaderboardHighlight();
        }
        playSound(sfxWing);
    }

    state.buttons[GAMEPAD_BUTTONS.DPAD_UP] = dpadUp;
    state.buttons[GAMEPAD_BUTTONS.DPAD_DOWN] = dpadDown;
}

function handleButtonPresses(gamepad, index) {
    const state = getGamepadFrameState(index);
    const previousButtons = { ...state.buttons };
    const aButton = isGamepadButtonPressed(gamepad, GAMEPAD_BUTTONS.A);
    const bButton = isGamepadButtonPressed(gamepad, GAMEPAD_BUTTONS.B);
    const xButton = isGamepadButtonPressed(gamepad, GAMEPAD_BUTTONS.X);
    const yButton = isGamepadButtonPressed(gamepad, GAMEPAD_BUTTONS.Y);
    const startButton = isGamepadButtonPressed(gamepad, GAMEPAD_BUTTONS.START);
    const rtButton = isGamepadButtonPressed(gamepad, GAMEPAD_BUTTONS.RT);

    const aPressed = aButton && !previousButtons[GAMEPAD_BUTTONS.A];
    const bPressed = bButton && !previousButtons[GAMEPAD_BUTTONS.B];
    const xPressed = xButton && !previousButtons[GAMEPAD_BUTTONS.X];
    const yPressed = yButton && !previousButtons[GAMEPAD_BUTTONS.Y];
    const startPressed = startButton && !previousButtons[GAMEPAD_BUTTONS.START];
    const rtPressed = rtButton && !previousButtons[GAMEPAD_BUTTONS.RT];

    if (aPressed || startPressed) {
        if (gameState === 'TITLE') {
            selectMenuOption();
        } else if (gameState === 'LEADERBOARD') {
            selectLeaderboardOption();
        }
    }

    if (bPressed) {
        if (gameState === 'TITLE' || gameState === 'COUNTDOWN') {
            exitToArcade();
        } else if (gameState === 'LEADERBOARD') {
            hideLeaderboard();
        } else if (gameState === 'PLAYING' && isPaused) {
            returnToMenu();
        }
    }

    if (gameState === 'PLAYING') {
        if (!isPaused) {
            if (index === gamepadIndex && (aPressed || rtPressed)) {
                attemptJump(game1);
            }
            if (index === gamepad2Index && gameMode !== 'SINGLE' && (aPressed || rtPressed)) {
                attemptJump(game2);
            }
        }

        if (xPressed) {
            returnToMenu();
        }

        if (yPressed) {
            handleGameRestart();
        }

        if (startPressed) {
            togglePause();
        }
    }

    state.buttons[GAMEPAD_BUTTONS.A] = aButton;
    state.buttons[GAMEPAD_BUTTONS.B] = bButton;
    state.buttons[GAMEPAD_BUTTONS.X] = xButton;
    state.buttons[GAMEPAD_BUTTONS.Y] = yButton;
    state.buttons[GAMEPAD_BUTTONS.START] = startButton;
    state.buttons[GAMEPAD_BUTTONS.RT] = rtButton;
}

function updateMenuHighlight() {
    // Remove highlight from all buttons
    menuButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.style.transform = 'none';
            button.style.boxShadow = '';
        }
    });
    
    // Add highlight to current button
    const currentButton = document.getElementById(menuButtons[currentMenuIndex]);
    if (currentButton) {
        currentButton.style.transform = 'translate(-2px, -2px)';
        currentButton.style.boxShadow = '6px 6px 0px #7f441a, 8px 8px 0px rgba(0, 0, 0, 0.3)';
    }
}

function selectMenuOption() {
    const selectedButton = menuButtons[currentMenuIndex];
    
    switch (selectedButton) {
        case 'single-player-btn':
            startCountdown('SINGLE');
            break;
        case 'two-player-btn':
            startCountdown('TWO_PLAYER');
            break;
        case 'ai-vs-ai-btn':
            startCountdown('AI_VS_AI');
            break;
        case 'player-vs-ai-btn':
            startCountdown('PLAYER_VS_AI');
            break;
        case 'leaderboard-btn':
            showLeaderboard();
            break;
    }
}

function selectLeaderboardOption() {
    const selectedButton = leaderboardButtons[currentLeaderboardIndex];
    
    switch (selectedButton) {
        case 'back-to-menu-btn':
            hideLeaderboard();
            break;
    }
}

function updateLeaderboardHighlight() {
    // Remove highlight from all buttons
    leaderboardButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.style.transform = 'none';
            button.style.boxShadow = '';
        }
    });
    
    // Add highlight to current button
    const currentButton = document.getElementById(leaderboardButtons[currentLeaderboardIndex]);
    if (currentButton) {
        currentButton.style.transform = 'translate(-2px, -2px)';
        currentButton.style.boxShadow = '6px 6px 0px #7f441a, 8px 8px 0px rgba(0, 0, 0, 0.3)';
    }
}

function handleGameRestart() {
    if (gameMode === 'SINGLE') {
        if (game1.gameOver && game1.canRestart) {
            resetGame(game1);
        }
        return;
    }

    if (game1.gameOver && game2.gameOver && game1.canRestart && game2.canRestart) {
        resetGame(game1);
        resetGame(game2);
    }
}

function returnToMenu() {
    gameState = 'TITLE';
    isPaused = false;

    // Clear intervals
    if (game1.pipeInterval) {
        clearInterval(game1.pipeInterval);
        game1.pipeInterval = null;
    }
    if (game2.pipeInterval) {
        clearInterval(game2.pipeInterval);
        game2.pipeInterval = null;
    }

    // Reset all global game variables to original values
    velocityX = BASE_VELOCITY_X;
    baseVelocityX = BASE_VELOCITY_X;
    gravity = BASE_GRAVITY;
    currentPipeInterval = basePipeInterval;
    baseOpeningSpace = boardHeight / 4;

    // Reset all random events
    randomEvents.game1 = createRandomEventState();
    randomEvents.game2 = createRandomEventState();

    // Show title screen and hide other screens
    document.getElementById('title-screen').style.display = 'flex';
    document.getElementById('countdown-screen').style.display = 'none';
    if (flabbyGameScreen) {
        flabbyGameScreen.style.display = 'none';
    }
    document.getElementById('leaderboard-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'none';
    document.getElementById('board2').style.display = 'block'; // Reset for menu

    // Reset games
    resetGame(game1);
    resetGame(game2);
}

function detectCollision(a, b) {
    return a.x < b.x + b.width &&   //a's top left corner doesn't reach b's top right corner
        a.x + a.width > b.x &&   //a's top right corner passes b's top left corner
        a.y < b.y + b.height &&  //a's top left corner doesn't reach b's bottom left corner
        a.y + a.height > b.y;    //a's bottom left corner passes b's top left corner
}

function drawGameOverScreen(game) {
    // Nice dark overlay
    game.context.fillStyle = "rgba(0, 0, 0, 0.6)";
    game.context.fillRect(0, 0, game.board.width, game.board.height);

    // Update panel physics
    updateGameOverPanel(game);

    // Panel dimensions
    const panelWidth = 280;
    const panelHeight = 200;
    const panelX = game.board.width / 2 - panelWidth / 2;
    const panelY = game.gameOverPanel.y;

    // Draw the flying panel with rounded corners effect
    game.context.fillStyle = "rgba(40, 40, 40, 0.95)";
    game.context.fillRect(panelX, panelY, panelWidth, panelHeight);

    // Panel border
    game.context.strokeStyle = "#FFD93D";
    game.context.lineWidth = 3;
    game.context.strokeRect(panelX, panelY, panelWidth, panelHeight);

    // Inner shadow effect
    game.context.strokeStyle = "rgba(0, 0, 0, 0.3)";
    game.context.lineWidth = 1;
    game.context.strokeRect(panelX + 2, panelY + 2, panelWidth - 4, panelHeight - 4);

    game.context.textAlign = "center";

    // Stylish "GAME OVER" text with shadow
    const textY = panelY + 50;
    game.context.fillStyle = "#000";
    game.context.font = "bold 32px 'Courier New', monospace";
    game.context.fillText("GAME OVER", game.board.width / 2 + 2, textY + 2);

    game.context.fillStyle = "#8B0000";
    game.context.fillText("GAME OVER", game.board.width / 2 + 1, textY + 1);

    game.context.fillStyle = "#FF6B6B";
    game.context.fillText("GAME OVER", game.board.width / 2, textY);

    // Score display
    const scoreY = panelY + 90;
    const currentScore = Math.floor(game.score);
    const isNewHighScore = currentScore > highScores[gameMode];

    // Check and update high score
    if (game.gameOverScreenTimer === 61) { // Only check once when screen first appears
        updateHighScore(currentScore);
    }

    game.context.fillStyle = "rgba(255, 217, 61, 0.2)";
    game.context.fillRect(game.board.width / 2 - 90, scoreY - 20, 180, 50);

    game.context.strokeStyle = "#FFD93D";
    game.context.lineWidth = 1;
    game.context.strokeRect(game.board.width / 2 - 90, scoreY - 20, 180, 50);

    // Current Score
    game.context.fillStyle = "#333";
    game.context.font = "bold 16px 'Courier New', monospace";
    game.context.fillText(`SCORE: ${currentScore}`, game.board.width / 2 + 1, scoreY + 1);

    game.context.fillStyle = isNewHighScore ? "#FF6B6B" : "#FFD93D";
    game.context.fillText(`SCORE: ${currentScore}`, game.board.width / 2, scoreY);

    // High Score
    game.context.fillStyle = "#333";
    game.context.font = "bold 14px 'Courier New', monospace";
    game.context.fillText(`BEST: ${highScores[gameMode]}`, game.board.width / 2 + 1, scoreY + 21);

    game.context.fillStyle = "#4ECDC4";
    game.context.fillText(`BEST: ${highScores[gameMode]}`, game.board.width / 2, scoreY + 20);

    // New high score indicator
    if (isNewHighScore && game.gameOverScreenTimer % 30 < 15) {
        game.context.fillStyle = "#FF6B6B";
        game.context.font = "bold 12px 'Courier New', monospace";
        game.context.fillText("NEW HIGH SCORE!", game.board.width / 2, scoreY - 30);
    }

    // Instructions
    const instructY = panelY + 160;
    const instructY2 = panelY + 180;

    if (gameMode === 'SINGLE') {
        if (game1.gameOver && game1.canRestart) {
            game.context.fillStyle = "#4ECDC4";
            game.context.font = "bold 16px 'Courier New', monospace";
            game.context.fillText("Press Y to restart", game.board.width / 2, instructY);
        }
    } else {
        const bothDead = game1.gameOver && game2.gameOver;
        const bothReady = game1.canRestart && game2.canRestart;

        if (bothDead && bothReady) {
            game.context.fillStyle = "#4ECDC4";
            game.context.font = "bold 16px 'Courier New', monospace";
            game.context.fillText("Press Y to restart both", game.board.width / 2, instructY);
        } else if (game.gameOver) {
            game.context.fillStyle = "#FFA500";
            game.context.font = "14px 'Courier New', monospace";
            game.context.fillText("Waiting for other player...", game.board.width / 2, instructY);
        }
    }

    // X to menu instruction
    game.context.fillStyle = "#888";
    game.context.font = "12px 'Courier New', monospace";
    game.context.fillText("Press X for menu", game.board.width / 2, instructY2);

    game.context.textAlign = "start";
}

function updateGameOverPanel(game) {
    if (!game.gameOverPanel.settled) {
        // Spring physics with damping
        const spring = 0.3;
        const damping = 0.7;

        // Calculate force towards target
        const force = (game.gameOverPanel.targetY - game.gameOverPanel.y) * spring;
        game.gameOverPanel.velocity += force;
        game.gameOverPanel.velocity *= damping;

        // Update position
        game.gameOverPanel.y += game.gameOverPanel.velocity;

        // Check if settled (close enough and slow enough)
        if (Math.abs(game.gameOverPanel.y - game.gameOverPanel.targetY) < 2 &&
            Math.abs(game.gameOverPanel.velocity) < 0.5) {
            game.gameOverPanel.settled = true;
            game.gameOverPanel.y = game.gameOverPanel.targetY;
            game.gameOverPanel.velocity = 0;
        }
    }
}

function resetGame(game) {
    isPaused = false;
    game.bird.y = birdY;
    game.bird.x = birdX;
    game.pipeArray = [];
    game.score = 0;
    game.gameOver = false;
    game.deathAnimation = false;
    game.deathTimer = 0;
    game.velocityY = 0;
    game.hasBounced = false;
    game.gameOverScreenTimer = 0;
    game.canRestart = false;
    game.lastDifficultyUpdate = 0;

    // Reset background positions
    backgroundX1 = 0;
    if (backgroundImg && backgroundImg.complete) {
        backgroundX2 = backgroundImg.width;
    }

    // Reset animation states
    game.animationFrame = 0;
    game.animationTimer = 0;
    game.flapAnimation = 0;
    game.isFlapping = false;
    game.perfectStreak = 0;
    game.precisionTimer = 0;
    const gameKey = game === game1 ? 'game1' : 'game2';

    // Reset AI states
    game.aiLastDecision = 0;

    // Reset difficulty settings
    velocityX = BASE_VELOCITY_X;
    baseVelocityX = BASE_VELOCITY_X;
    gravity = BASE_GRAVITY; // Reset gravity to original value
    currentPipeInterval = basePipeInterval; // Reset pipe interval
    baseOpeningSpace = boardHeight / 4; // Reset opening space

    // Reset pipe interval
    if (game.pipeInterval) {
        clearInterval(game.pipeInterval);
        game.pipeInterval = setInterval(() => placePipes(game), basePipeInterval);
    }

    // Reset panel position
    game.gameOverPanel.y = boardHeight;
    game.gameOverPanel.velocity = 0;
    game.gameOverPanel.settled = false;

    // Reset rianbald easter egg
    rianbaldTrigger[gameKey] = false;
    rianbaldAnimation[gameKey] = { active: false, timer: 0, y: 0, targetY: 0 };
    
    // Reset random events
    randomEvents[gameKey] = createRandomEventState();
    particles[gameKey] = [];
    screenShake[gameKey] = { timer: 0, intensity: 0, duration: 0 };
}

function playSound(audio) {
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }
}

// ADVANCED AI - Handles close gaps and height differences intelligently
function updateAI(game) {
    let birdCenter = game.bird.y + game.bird.height / 2;
    let nextGap = findNextPipeGap(game);

    if (nextGap) {
        let gapMiddle = nextGap.top + (nextGap.bottom - nextGap.top) / 2;

        // Simple but effective: jump if bird center is below gap middle
        if (birdCenter > gapMiddle) {
            executeJump(game);
        }
    } else {
        // No pipes visible - stay at screen center
        let screenCenter = boardHeight / 2;
        if (birdCenter > screenCenter) {
            executeJump(game);
        }
    }
}

// Helper function to find the next pipe gap
function findNextPipeGap(game) {
    let closestDistance = Infinity;
    let nextGap = null;

    // Group pipes by x position to find pairs
    let pipeGroups = {};

    for (let pipe of game.pipeArray) {
        // Only consider pipes that are ahead of the bird
        if (pipe.x + pipe.width > game.bird.x) {
            if (!pipeGroups[pipe.x]) {
                pipeGroups[pipe.x] = [];
            }
            pipeGroups[pipe.x].push(pipe);
        }
    }

    // Find the closest pipe pair
    for (let x in pipeGroups) {
        let distance = parseInt(x) - game.bird.x;
        if (distance < closestDistance && pipeGroups[x].length === 2) {
            closestDistance = distance;

            // Determine top and bottom of gap
            let pipes = pipeGroups[x];
            let topPipe = pipes[0].y < pipes[1].y ? pipes[0] : pipes[1];
            let bottomPipe = pipes[0].y > pipes[1].y ? pipes[0] : pipes[1];

            nextGap = {
                x: parseInt(x),
                top: topPipe.y + topPipe.height,
                bottom: bottomPipe.y,
                distance: distance
            };
        }
    }

    return nextGap;
}

function handlePerfectPass(game, pipe) {
    const gameKey = game === game1 ? 'game1' : 'game2';
    const matchingTop = game.pipeArray.find(p => p.img === topPipeImg && Math.abs(p.x - pipe.x) < 0.01);
    const openingSpace = pipe.openingSpace || baseOpeningSpace;

    if (!matchingTop) {
        game.perfectStreak = 0;
        return 0;
    }

    const gapCenter = matchingTop.y + pipeHeight + openingSpace / 2;
    const birdCenter = game.bird.y + game.bird.height / 2;
    const tolerance = Math.max(10, openingSpace * 0.12);
    const withinSweetSpot = Math.abs(birdCenter - gapCenter) <= tolerance;

    if (withinSweetSpot) {
        game.perfectStreak++;
        game.precisionTimer = 90;
        const bonus = 0.2 + Math.min(game.perfectStreak, 8) * 0.05;
        spawnParticles(gameKey, game.bird.x + game.bird.width, gapCenter, "#4ECDC4", 12, 1.2, 2.8);
        triggerScreenShake(gameKey, 5, 8);
        return bonus;
    } else {
        game.perfectStreak = 0;
        return 0;
    }
}

function drawStreakMeter(game) {
    if ((game.precisionTimer <= 0 && game.perfectStreak === 0) || game.gameOver) {
        return;
    }

    if (!isPaused && game.precisionTimer > 0) {
        game.precisionTimer--;
    }

    const alpha = Math.max(game.precisionTimer / 90, 0.2);
    const x = 12;
    const y = 70;
    const width = 180;
    const height = 22;
    const progress = Math.min(game.perfectStreak / 10, 1);

    game.context.globalAlpha = alpha;
    game.context.fillStyle = "rgba(0,0,0,0.55)";
    game.context.fillRect(x - 4, y - 6, width + 8, height + 12);

    game.context.fillStyle = "#2d2d2d";
    game.context.fillRect(x, y, width, height);

    game.context.fillStyle = "#4ECDC4";
    game.context.fillRect(x, y, width * progress, height);

    game.context.strokeStyle = "#FFD93D";
    game.context.lineWidth = 2;
    game.context.strokeRect(x, y, width, height);

    game.context.fillStyle = "#FFD93D";
    game.context.font = "bold 12px 'Courier New', monospace";
    game.context.fillText(`PRECISION x${Math.max(game.perfectStreak, 1)}`, x + 8, y + 15);
    game.context.globalAlpha = 1;
}



// Execute perfect jump with no delays
function executeJump(game) {
    // No cooldown needed - perfect timing
    game.velocityY = JUMP_STRENGTH;
    game.isFlapping = true;
    game.flapAnimation = 0;
    const gameKey = game === game1 ? 'game1' : 'game2';
    spawnParticles(gameKey, game.bird.x, game.bird.y + game.bird.height / 2, "#FFD93D", 10, 1.4, 2.6);
    playSound(sfxWing);
}

// Console command to toggle AI
function toggleAI(player = 'both') {
    if (player === 'both' || player === 1) {
        aiEnabled.game1 = !aiEnabled.game1;
        console.log(`AI for Player 1 (left): ${aiEnabled.game1 ? 'ENABLED' : 'DISABLED'}`);
    }

    if (player === 'both' || player === 2) {
        aiEnabled.game2 = !aiEnabled.game2;
        console.log(`AI for Player 2 (right): ${aiEnabled.game2 ? 'ENABLED' : 'DISABLED'}`);
    }

    if (player !== 1 && player !== 2 && player !== 'both') {
        console.log('Usage: toggleAI() or toggleAI(1) or toggleAI(2)');
        console.log('Current status:');
        console.log(`Player 1 AI: ${aiEnabled.game1 ? 'ENABLED' : 'DISABLED'}`);
        console.log(`Player 2 AI: ${aiEnabled.game2 ? 'ENABLED' : 'DISABLED'}`);
    }
}

// Make toggleAI available globally
window.toggleAI = toggleAI;

// Rianbald Easter Egg Functions
function triggerRianbaldEasterEgg(game, triggerPipe) {
    const gameKey = game === game1 ? 'game1' : 'game2';

    // Simple popup in center of screen
    rianbaldAnimation[gameKey].active = true;
    rianbaldAnimation[gameKey].timer = 0;
    rianbaldAnimation[gameKey].x = boardWidth * 0.75; // 75% to the right
    rianbaldAnimation[gameKey].y = boardHeight / 2; // Center vertically

}

function drawRianbaldEasterEgg(game, gameKey) {
    let anim = rianbaldAnimation[gameKey];
    anim.timer++;

    // Show for 2 seconds (120 frames at 60fps)
    if (anim.timer > 120) {
        anim.active = false;
        return;
    }

    // Draw rianbald image
    if (rianbaldImg && rianbaldImg.complete) {
        let imgWidth = 100;
        let imgHeight = 100;

        // Simple shake effect
        let shakeX = (Math.random() - 0.5) * 4;
        let shakeY = (Math.random() - 0.5) * 4;

        let x = anim.x - imgWidth / 2 + shakeX;
        let y = anim.y - imgHeight / 2 + shakeY;

        game.context.drawImage(rianbaldImg, x, y, imgWidth, imgHeight);
    }
}

// Random Events System Functions
function checkRandomEvent(game, gameKey) {
    // Don't trigger new events if one is already active
    if (randomEvents[gameKey].active) return;
    
    // Don't trigger events too early in the game
    if (game.score < 2) return;
    
    // Calculate probability based on score (higher score = higher chance)
    const baseProbability = 0.05; // 5% base chance
    const scoreBonus = Math.min(game.score * 0.01, 0.15); // Up to 15% bonus
    const totalProbability = baseProbability + scoreBonus;
    
    if (Math.random() < totalProbability) {
        triggerRandomEvent(game, gameKey);
    }
}

function triggerRandomEvent(game, gameKey) {
    // Select random event based on probabilities
    const events = Object.keys(EVENT_TYPES);
    const totalProbability = events.reduce((sum, event) => sum + EVENT_TYPES[event].probability, 0);
    
    let random = Math.random() * totalProbability;
    let selectedEvent = null;
    
    for (let event of events) {
        random -= EVENT_TYPES[event].probability;
        if (random <= 0) {
            selectedEvent = event;
            break;
        }
    }
    
    if (selectedEvent) {
        activateRandomEvent(game, gameKey, selectedEvent);
    }
}

function activateRandomEvent(game, gameKey, eventType) {
    const event = EVENT_TYPES[eventType];
    const eventData = randomEvents[gameKey];
    
    eventData.active = true;
    eventData.type = eventType;
    eventData.timer = 0;
    eventData.duration = event.duration;
    
    // Store original values for restoration
    eventData.originalValues = {
        velocityX: velocityX,
        gravity: gravity,
        pipeInterval: currentPipeInterval
    };
    
    // Apply event effects
    applyEventEffect(game, gameKey, eventType);
    
}

function applyEventEffect(game, gameKey, eventType) {
    switch (eventType) {
        case 'BONUS_ROUND':
            baseOpeningSpace = boardHeight / 3;
            break;
        case 'SPEED_BOOST':
            velocityX = baseVelocityX * 1.8;
            break;
        case 'GRAVITY_SHIFT':
            gravity = 0.35;
            break;
        case 'SCORE_MULTIPLIER':
            break;
        case 'SHIELD_MODE':
            break;
        case 'BOSS_FIGHT':
            velocityX = baseVelocityX * 1.15;
            currentPipeInterval = basePipeInterval * 0.9;
            randomEvents[gameKey].boss = createBossState();
            break;
    }
}

function spawnBossBullet(game, gameKey) {
    const eventData = randomEvents[gameKey];
    const boss = eventData.boss;
    if (boss.totalFired >= BOSS_BULLET_LIMIT) return;

    const spriteSize = BOSS_BULLET_SPRITE_SIZE;
    const bossCenterX = game.board.width - spriteSize * 0.55;
    const bossCenterY = 110 + Math.sin(eventData.timer * 0.08) * 20;
    const targetY = game.bird.y + game.bird.height / 2 + (Math.random() - 0.5) * 140;
    const speed = Math.max(Math.abs(velocityX), 4.5);
    const dx = Math.max(bossCenterX - game.bird.x, 80);
    const dy = targetY - bossCenterY;
    const norm = Math.max(Math.hypot(dx, dy), 1);

    boss.bullets.push({
        x: bossCenterX - 26,
        y: bossCenterY + (Math.random() - 0.5) * 30,
        vx: -(dx / norm) * speed,
        vy: (dy / norm) * speed * 0.55,
        radius: BOSS_BULLET_RADIUS + Math.random() * 2,
    });
    boss.totalFired += 1;
    boss.spawnCooldown = 45 + Math.random() * 18;
}

function updateBossFight(game, gameKey) {
    const eventData = randomEvents[gameKey];
    const boss = eventData.boss;
    boss.spritePulse += 0.1;

    if (!isPaused && boss.totalFired < BOSS_BULLET_LIMIT) {
        boss.spawnCooldown -= 1;
        if (boss.spawnCooldown <= 0) {
            spawnBossBullet(game, gameKey);
        }
    }

    if (isPaused) return;

    for (let i = boss.bullets.length - 1; i >= 0; i--) {
        const bullet = boss.bullets[i];
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;

        if (
            bullet.x < -40 ||
            bullet.x > game.board.width + 40 ||
            bullet.y < -40 ||
            bullet.y > game.board.height + 40
        ) {
            boss.bullets.splice(i, 1);
        }
    }
}

function drawBossFight(game, gameKey) {
    const eventData = randomEvents[gameKey];
    const boss = eventData.boss;
    const pulse = 1 + Math.sin(boss.spritePulse) * 0.04;
    const spriteWidth = BOSS_BULLET_SPRITE_SIZE * pulse;
    const spriteHeight = BOSS_BULLET_SPRITE_SIZE * pulse;
    const spriteX = game.board.width - spriteWidth - 12;
    const spriteY = 56 + Math.sin(eventData.timer * 0.08) * 20;

    if (rianbaldImg && rianbaldImg.complete) {
        game.context.save();
        game.context.globalAlpha = 0.95;
        game.context.shadowColor = 'rgba(255, 88, 88, 0.85)';
        game.context.shadowBlur = 18;
        game.context.drawImage(rianbaldImg, spriteX, spriteY, spriteWidth, spriteHeight);
        game.context.restore();
    }

    for (const bullet of boss.bullets) {
        const gradient = game.context.createRadialGradient(
            bullet.x,
            bullet.y,
            2,
            bullet.x,
            bullet.y,
            bullet.radius * 1.8
        );
        gradient.addColorStop(0, '#fff0a6');
        gradient.addColorStop(0.45, '#ff8b5c');
        gradient.addColorStop(1, 'rgba(139, 0, 0, 0.1)');
        game.context.fillStyle = gradient;
        game.context.beginPath();
        game.context.arc(bullet.x, bullet.y, bullet.radius * 1.8, 0, Math.PI * 2);
        game.context.fill();

        game.context.fillStyle = '#8b0000';
        game.context.beginPath();
        game.context.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        game.context.fill();
    }
}

function collidesWithBossBullet(bird, bullet) {
    const centerX = bird.x + bird.width / 2;
    const centerY = bird.y + bird.height / 2;
    const dx = centerX - bullet.x;
    const dy = centerY - bullet.y;
    const hitRadius = Math.max(bird.width, bird.height) * 0.34 + bullet.radius;
    return dx * dx + dy * dy <= hitRadius * hitRadius;
}

function updateRandomEvent(game, gameKey) {
    const eventData = randomEvents[gameKey];
    
    if (eventData.active) {
        eventData.timer++;
        if (eventData.type === 'BOSS_FIGHT') {
            updateBossFight(game, gameKey);
        }
        
        if (eventData.timer >= eventData.duration) {
            endRandomEvent(game, gameKey);
        }

        drawEventIndicator(game, gameKey);
    }
}

function endRandomEvent(game, gameKey) {
    const eventData = randomEvents[gameKey];
    // Restore original values
    velocityX = eventData.originalValues.velocityX;
    gravity = eventData.originalValues.gravity;
    currentPipeInterval = eventData.originalValues.pipeInterval;
    baseOpeningSpace = boardHeight / 4; // Reset to normal
    
    // Reset event data
    eventData.active = false;
    eventData.type = null;
    eventData.timer = 0;
    eventData.duration = 0;
    eventData.originalValues = {};
    eventData.boss = createBossState();
}

function drawEventIndicator(game, gameKey) {
    const eventData = randomEvents[gameKey];
    const event = EVENT_TYPES[eventData.type];
    
    if (!eventData.active) return;
    
    // Calculate remaining time
    const remainingTime = Math.ceil((eventData.duration - eventData.timer) / 60);
    
    // Draw event banner at top of screen
    const bannerHeight = 40;
    const bannerY = 0;
    
    // Banner background with event color
    game.context.fillStyle = event.color;
    game.context.fillRect(0, bannerY, game.board.width, bannerHeight);
    
    // Banner border
    game.context.strokeStyle = "#000";
    game.context.lineWidth = 2;
    game.context.strokeRect(0, bannerY, game.board.width, bannerHeight);
    
    // Event name
    game.context.fillStyle = "#FFF";
    game.context.font = "bold 16px 'Courier New', monospace";
    game.context.textAlign = "center";
    game.context.fillText(event.name, game.board.width / 2, bannerY + 20);
    
    // Timer
    game.context.font = "bold 14px 'Courier New', monospace";
    game.context.fillText(`${remainingTime}s`, game.board.width / 2, bannerY + 35);
    
    // Reset text alignment
    game.context.textAlign = "start";
}

// Enhanced collision detection for shield mode
function detectCollisionWithShield(a, b, game, gameKey) {
    const eventData = randomEvents[gameKey];
    
    // If shield mode is active, no collision
    if (eventData.active && eventData.type === 'SHIELD_MODE') {
        return false;
    }
    
    // Normal collision detection
    return detectCollision(a, b);
}

// Gamepad handling functions
function handleGamepadConnected(event) {
    syncConnectedGamepads();
}

function handleGamepadDisconnected(event) {
    syncConnectedGamepads();
}

function exitToArcade() {
    deactivate();
    onExitToArcade();
}

function activate() {
    ensureFlappyLionDom();
    initFlabbyBird();
    isActive = true;
    showFlabbyRoot();
    returnToMenu();
    setupResponsiveCanvas();
    updateMenuHighlight();
}

function deactivate() {
    isActive = false;
    if (!initialized && !document.getElementById('flabbyBirdRoot')) {
        return;
    }
    returnToMenu();
    hideFlabbyRoot();
}

function setExitHandler(handler) {
    onExitToArcade = typeof handler === 'function' ? handler : () => {};
}

function handleKeyDown(event) {
    if (!isActive) return false;
    const key = event.key.toLowerCase();

    if (gameState === 'TITLE') {
        if (key === 'arrowup' || key === 'w') {
            currentMenuIndex = Math.max(0, currentMenuIndex - 1);
            updateMenuHighlight();
            playSound(sfxWing);
            return true;
        }
        if (key === 'arrowdown' || key === 's') {
            currentMenuIndex = Math.min(menuButtons.length - 1, currentMenuIndex + 1);
            updateMenuHighlight();
            playSound(sfxWing);
            return true;
        }
        if (key === 'enter' || key === ' ') {
            selectMenuOption();
            return true;
        }
        if (key === 'escape') {
            exitToArcade();
            return true;
        }
    }

    if (gameState === 'LEADERBOARD') {
        if (key === 'enter' || key === ' ' || key === 'escape') {
            hideLeaderboard();
            return true;
        }
    }

    if (gameState === 'COUNTDOWN') {
        if (key === 'escape') {
            exitToArcade();
            return true;
        }
    }

    if (gameState === 'PLAYING') {
        if (key === 'w') {
            attemptJump(game1);
            return true;
        }
        if (key === 'i' && gameMode !== 'SINGLE') {
            attemptJump(game2);
            return true;
        }
        if (key === 'r') {
            handleGameRestart();
            return true;
        }
        if (key === 'escape') {
            exitToArcade();
            return true;
        }
    }

    return false;
}

function handleKeyUp() {
    return false;
}

module.exports = {
    activate,
    deactivate,
    handleKeyDown,
    handleKeyUp,
    isActive: () => isActive,
    setExitHandler,
};
