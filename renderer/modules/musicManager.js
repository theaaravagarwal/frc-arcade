const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DEFAULT_VOLUME = 0.35;
const SUPPORTED_EXTENSIONS = new Set(['.mp3']);

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function safeParse(jsonValue, fallback) {
  try {
    return jsonValue == null ? fallback : JSON.parse(jsonValue);
  } catch (_error) {
    return fallback;
  }
}

function titleFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || base;
}

function walkMusicFiles(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) return [];
  const tracks = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach((entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        return;
      }
      if (!entry.isFile()) return;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) return;
      const album = path.basename(path.dirname(entryPath));
      tracks.push({
        path: entryPath,
        album,
        song: titleFromFilename(entry.name),
      });
    });
  }

  walk(rootDir);
  tracks.sort((a, b) => a.path.localeCompare(b.path));
  return tracks;
}

function shuffledOrder(length) {
  const out = Array.from({ length }, (_v, i) => i);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = out[i];
    out[i] = out[j];
    out[j] = temp;
  }
  return out;
}

function createMusicManager({
  musicRootDir,
  storagePrefix = 'frcArcadeMusic',
  onTrackChange = () => {},
  onStateChange = () => {},
} = {}) {
  const volumeKey = `${storagePrefix}:volume`;
  const mutedKey = `${storagePrefix}:muted`;
  const shuffleKey = `${storagePrefix}:shuffle`;
  const trackPathKey = `${storagePrefix}:trackPath`;
  const playingKey = `${storagePrefix}:playing`;
  const volumeMigrationKey = `${storagePrefix}:volumeFixApplied`;

  const audio = new Audio();
  audio.preload = 'auto';
  audio.loop = false;

  const state = {
    tracks: [],
    queue: [],
    queueIndex: -1,
    shuffle: safeParse(localStorage.getItem(shuffleKey), true),
    primed: false,
  };

  const rawVolume = localStorage.getItem(volumeKey);
  const parsedVolume = rawVolume == null ? NaN : Number(rawVolume);
  let initialVolume = clamp01(Number.isFinite(parsedVolume) ? parsedVolume : DEFAULT_VOLUME);
  if (rawVolume == null) {
    localStorage.setItem(volumeKey, String(DEFAULT_VOLUME));
    initialVolume = DEFAULT_VOLUME;
  } else if (rawVolume === '0' && localStorage.getItem(volumeMigrationKey) !== '1') {
    // One-time fix for early builds that could persist an unintended zero-volume default.
    initialVolume = DEFAULT_VOLUME;
    localStorage.setItem(volumeKey, String(DEFAULT_VOLUME));
    localStorage.setItem(volumeMigrationKey, '1');
  }
  audio.volume = initialVolume;
  audio.muted = safeParse(localStorage.getItem(mutedKey), false) === true;

  function persistState() {
    localStorage.setItem(volumeKey, String(audio.volume));
    localStorage.setItem(mutedKey, JSON.stringify(audio.muted));
    localStorage.setItem(shuffleKey, JSON.stringify(state.shuffle));
    const track = getCurrentTrack();
    localStorage.setItem(trackPathKey, track ? track.path : '');
    localStorage.setItem(playingKey, JSON.stringify(!audio.paused));
  }

  function emitState() {
    onStateChange(getState());
  }

  function emitTrack() {
    onTrackChange(getCurrentTrack(), getState());
  }

  function rebuildQueue(keepCurrent = true) {
    const current = keepCurrent ? getCurrentTrack() : null;
    if (!state.tracks.length) {
      state.queue = [];
      state.queueIndex = -1;
      return;
    }
    state.queue = state.shuffle ? shuffledOrder(state.tracks.length) : state.tracks.map((_t, i) => i);
    if (current) {
      const newIndex = state.queue.findIndex((trackIdx) => state.tracks[trackIdx].path === current.path);
      state.queueIndex = newIndex >= 0 ? newIndex : 0;
    } else if (state.queueIndex < 0 || state.queueIndex >= state.queue.length) {
      state.queueIndex = 0;
    }
  }

  function getCurrentTrack() {
    if (state.queueIndex < 0 || state.queueIndex >= state.queue.length) return null;
    const trackIndex = state.queue[state.queueIndex];
    return state.tracks[trackIndex] || null;
  }

  function loadTrack(track, autoplay = false) {
    if (!track) return;
    const nextSrc = pathToFileURL(track.path).href;
    if (audio.src !== nextSrc) {
      audio.src = nextSrc;
      audio.load();
    }
    emitTrack();
    persistState();
    if (autoplay) {
      audio.play().catch(() => {});
      emitState();
    }
  }

  function setQueueIndex(nextIndex, autoplay = false) {
    if (!state.queue.length) return;
    const length = state.queue.length;
    let normalized = nextIndex % length;
    if (normalized < 0) normalized += length;
    state.queueIndex = normalized;
    loadTrack(getCurrentTrack(), autoplay);
  }

  function nextTrack(autoplay = true) {
    if (!state.queue.length) return;
    setQueueIndex(state.queueIndex + 1, autoplay);
  }

  function previousTrack(autoplay = true) {
    if (!state.queue.length) return;
    if (audio.currentTime > 4) {
      audio.currentTime = 0;
      if (autoplay && audio.paused) {
        audio.play().catch(() => {});
      }
      emitState();
      return;
    }
    setQueueIndex(state.queueIndex - 1, autoplay);
  }

  function play() {
    if (!state.queue.length) return;
    state.primed = true;
    if (!audio.src) {
      loadTrack(getCurrentTrack(), false);
    }
    audio.play().catch(() => {});
    persistState();
    emitState();
  }

  function pause() {
    audio.pause();
    persistState();
    emitState();
  }

  function primePlayback() {
    if (state.primed) return;
    state.primed = true;
    const shouldAutoplay = safeParse(localStorage.getItem(playingKey), true) !== false;
    if (shouldAutoplay) {
      play();
    }
  }

  function togglePlayPause() {
    if (audio.paused) {
      play();
    } else {
      pause();
    }
  }

  function setMuted(nextMuted) {
    audio.muted = !!nextMuted;
    persistState();
    emitState();
  }

  function toggleMuted() {
    setMuted(!audio.muted);
  }

  function setVolume(value) {
    audio.volume = clamp01(value);
    persistState();
    emitState();
  }

  function adjustVolume(delta) {
    setVolume(audio.volume + delta);
  }

  function setShuffle(nextShuffle) {
    state.shuffle = !!nextShuffle;
    rebuildQueue(true);
    persistState();
    emitTrack();
    emitState();
  }

  function toggleShuffle() {
    setShuffle(!state.shuffle);
  }

  function getState() {
    return {
      hasTracks: state.queue.length > 0,
      paused: audio.paused,
      muted: audio.muted,
      shuffle: state.shuffle,
      volume: audio.volume,
      trackCount: state.queue.length,
      index: state.queueIndex,
    };
  }

  function initialize() {
    state.tracks = walkMusicFiles(musicRootDir);
    rebuildQueue(false);
    if (!state.queue.length) {
      emitTrack();
      emitState();
      return;
    }

    const savedTrackPath = localStorage.getItem(trackPathKey) || '';
    const savedQueueIndex = state.queue.findIndex(
      (trackIndex) => state.tracks[trackIndex].path === savedTrackPath
    );
    if (savedQueueIndex >= 0) {
      state.queueIndex = savedQueueIndex;
    } else {
      state.queueIndex = 0;
    }

    loadTrack(getCurrentTrack(), false);
    emitState();
  }

  audio.addEventListener('ended', () => {
    nextTrack(true);
  });
  audio.addEventListener('error', () => {
    nextTrack(true);
  });
  audio.addEventListener('play', () => emitState());
  audio.addEventListener('pause', () => emitState());

  return {
    initialize,
    primePlayback,
    play,
    pause,
    togglePlayPause,
    nextTrack,
    previousTrack,
    setMuted,
    toggleMuted,
    setVolume,
    adjustVolume,
    setShuffle,
    toggleShuffle,
    getCurrentTrack,
    getState,
  };
}

module.exports = createMusicManager;
