const { app, BrowserWindow, ipcMain, powerSaveBlocker } = require('electron');

let SerialPort = null;
try {
  ({ SerialPort } = require('serialport'));
} catch (error) {
  console.warn('[LED]', 'serialport package not installed; LED UART disabled.');
}

const isDev = process.env.NODE_ENV === 'development';
let sleepBlockerId = null;
const LED_DEFAULT_BAUD = 1000000;
const LED_COUNT = 300;
const LED_DEFAULT_BRIGHTNESS_CAP = 1;
const PREAMBLE_0 = 0xaa;
const PREAMBLE_1 = 0x55;
const RSP_ERROR = 0x7f;
const CMD_SET_STRIP_BULK = 0x34;
const CMD_SET_STRIP_INTERP = 0x35;

function getDefaultLedPort() {
  return '/dev/ttyUSB0';
}

function shouldAutoDetectLedPort() {
  return process.platform !== 'darwin';
}

function normalizeMacosSerialPath(path) {
  if (typeof path !== 'string') return null;
  if (!path.startsWith('/dev/tty.')) return path;
  return `/dev/cu.${path.slice('/dev/tty.'.length)}`;
}

function getLikelyLedPortScore(path) {
  const normalized = String(path || '').toLowerCase();
  let score = 0;
  if (normalized.includes('usbmodem')) score += 5;
  if (normalized.includes('usbserial')) score += 5;
  if (normalized.includes('wchusbserial')) score += 4;
  if (normalized.includes('arduino')) score += 3;
  if (normalized.includes('usb')) score += 2;
  if (normalized.includes('debug')) score -= 8;
  if (normalized.includes('bluetooth')) score -= 8;
  return score;
}

async function detectLedPort() {
  if (!SerialPort || typeof SerialPort.list !== 'function') {
    return null;
  }

  const ports = await SerialPort.list();

  if (process.platform === 'darwin') {
    const bestPort = ports
      .map((entry) => normalizeMacosSerialPath(entry.path))
      .filter(Boolean)
      .map((path) => ({ path, score: getLikelyLedPortScore(path) }))
      .sort((a, b) => b.score - a.score)[0];

    if (bestPort && bestPort.score > 0) {
      return bestPort.path;
    }
  }

  return null;
}

function xorChecksum(bytes) {
  let chk = 0;
  for (const b of bytes) {
    chk ^= b;
  }
  return chk & 0xff;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function isMissingSerialDeviceError(error) {
  if (!error) return false;
  const candidates = [error, error.cause].filter(Boolean);
  return candidates.some((entry) => {
    const code = typeof entry.code === 'string' ? entry.code.toUpperCase() : '';
    const errno = typeof entry.errno === 'number' ? entry.errno : null;
    const message = String(entry.message || '').toLowerCase();
    return (
      code === 'ENOENT' ||
      code === 'ENODEV' ||
      errno === -2 ||
      message.includes('no such file or directory') ||
      message.includes('cannot open /dev/')
    );
  });
}

function hsvToRgb(h, s, v) {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hh < 60) {
    r1 = c;
    g1 = x;
  } else if (hh < 120) {
    r1 = x;
    g1 = c;
  } else if (hh < 180) {
    g1 = c;
    b1 = x;
  } else if (hh < 240) {
    g1 = x;
    b1 = c;
  } else if (hh < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

class LedUartClient {
  constructor() {
    this.enabled = process.env.LED_ENABLED !== '0' && !!SerialPort;
    this.portPath = process.env.LED_SERIAL_PORT || getDefaultLedPort();
    this.hasResolvedPort = Boolean(process.env.LED_SERIAL_PORT) || !shouldAutoDetectLedPort();
    this.baudRate = Number(process.env.LED_BAUD || LED_DEFAULT_BAUD);
    this.brightnessCap = clamp01(
      process.env.LED_BRIGHTNESS_CAP != null
        ? Number(process.env.LED_BRIGHTNESS_CAP)
        : LED_DEFAULT_BRIGHTNESS_CAP
    );
    this.port = null;
    this.connected = false;
    this.rxBuffer = Buffer.alloc(0);
    this.pending = [];
    this.inFlight = null;
    this.effectTimeout = null;
    this.ambientMode = 'idle';
    this.reconnectTimer = null;
    this.currentFrame = Array.from({ length: LED_COUNT }, () => [0, 0, 0]); // GRB
    this.idleTimer = null;
    this.idleHue = 0;
    this.idleWavePhase = 0;
    this.joustTimer = null;
    this.joustHuePhase = 0;
    this.joustBreathePhase = 0;
    this.joustTensionUntil = 0;
    this.shooterTimer = null;
    this.shooterSweepPhase = 0;
    this.shooterPulsePhase = 0;
    this.shooterDangerUntil = 0;
    this.panoTimer = null;
    this.panoHue = 170;
    this.panoDriftPhase = 0;
    this.tempModeResetTimer = null;
    this.scheduledEvents = [];
    this.idleTickBusy = false;
    this.joustTickBusy = false;
    this.shooterTickBusy = false;
    this.panoTickBusy = false;
  }

  start() {
    if (!this.enabled) return;
    void this.connect();
  }

  stop() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.effectTimeout) {
      clearTimeout(this.effectTimeout);
      this.effectTimeout = null;
    }
    this.clearScheduledEvents();
    if (this.tempModeResetTimer) {
      clearTimeout(this.tempModeResetTimer);
      this.tempModeResetTimer = null;
    }
    this.stopIdleAnimation();
    this.stopJoustAnimation();
    this.stopShooterAnimation();
    this.stopPanoAnimation();
    if (this.port && this.port.isOpen) {
      this.port.close();
    }
    this.port = null;
    this.connected = false;
    this.pending.length = 0;
    this.inFlight = null;
  }

  disableUntilRestart(reason, error = null) {
    if (!this.enabled) return;
    const details = error && error.message ? ` (${error.message})` : '';
    console.warn('[LED]', `${reason}. LED UART disabled until app restart${details}.`);
    this.enabled = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stop();
  }

  scheduleReconnect() {
    if (this.reconnectTimer || !this.enabled) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1200);
  }

  async connect() {
    if (!this.enabled || !SerialPort) return;
    if (this.port) return;
    if (!process.env.LED_SERIAL_PORT && !this.hasResolvedPort && shouldAutoDetectLedPort()) {
      try {
        const detectedPort = await detectLedPort();
        if (detectedPort) {
          this.portPath = detectedPort;
          this.hasResolvedPort = true;
        }
      } catch (error) {
        console.warn('[LED]', 'Failed to enumerate serial ports:', error.message);
      }
    }
    if (process.platform === 'darwin' && !process.env.LED_SERIAL_PORT) {
      console.warn('[LED]', 'LED UART disabled on macOS unless LED_SERIAL_PORT is set explicitly.');
      this.enabled = false;
      return;
    }
    const port = new SerialPort({
      path: this.portPath,
      baudRate: this.baudRate,
      autoOpen: false,
    });
    this.port = port;
    port.on('data', (chunk) => this.onData(chunk));
    port.on('error', (err) => {
      console.warn('[LED]', 'UART error:', err.message);
      this.connected = false;
      this.failInFlight(new Error(`UART error: ${err.message}`));
      this.scheduleReconnect();
    });
    port.on('close', () => {
      this.connected = false;
      this.port = null;
      this.failInFlight(new Error('UART closed'));
      this.scheduleReconnect();
    });
    port.open((err) => {
      if (err) {
        console.warn('[LED]', `Failed to open ${this.portPath}@${this.baudRate}:`, err.message);
        if (isMissingSerialDeviceError(err)) {
          this.disableUntilRestart('LED controller not found', err);
          return;
        }
        this.port = null;
        this.connected = false;
        this.scheduleReconnect();
        return;
      }
      console.log('[LED]', `Connected ${this.portPath}@${this.baudRate}`);
      this.connected = true;
      this.hasResolvedPort = true;
      this.sendCommand(CMD_SET_STRIP_INTERP, Buffer.from([0x00, 0x00])).catch(() => {});
      this.applyAmbientMode();
    });
  }

  onData(chunk) {
    this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
    this.drainFrames();
  }

  drainFrames() {
    while (this.rxBuffer.length >= 5) {
      let start = -1;
      for (let i = 0; i < this.rxBuffer.length - 1; i += 1) {
        if (this.rxBuffer[i] === PREAMBLE_0 && this.rxBuffer[i + 1] === PREAMBLE_1) {
          start = i;
          break;
        }
      }
      if (start < 0) {
        this.rxBuffer = Buffer.alloc(0);
        return;
      }
      if (start > 0) {
        this.rxBuffer = this.rxBuffer.slice(start);
      }
      if (this.rxBuffer.length < 4) return;
      const length = this.rxBuffer[2];
      const fullLen = 2 + 1 + length + 1;
      if (this.rxBuffer.length < fullLen) return;
      const frame = this.rxBuffer.slice(0, fullLen);
      this.rxBuffer = this.rxBuffer.slice(fullLen);
      const chk = xorChecksum(frame.slice(2, fullLen - 1));
      if (chk !== frame[fullLen - 1]) {
        this.failInFlight(new Error('UART checksum mismatch'));
        continue;
      }
      const cmd = frame[3];
      const payload = frame.slice(4, fullLen - 1);
      this.resolveInFlight(cmd, payload);
    }
  }

  resolveInFlight(cmd, payload) {
    if (!this.inFlight) return;
    const expectedCmd = this.inFlight.cmd | 0x80;
    if (cmd === RSP_ERROR) {
      this.inFlight.reject(new Error(`Device error for cmd 0x${this.inFlight.cmd.toString(16)}`));
    } else if (cmd !== expectedCmd) {
      this.inFlight.reject(
        new Error(`Unexpected response 0x${cmd.toString(16)} for cmd 0x${this.inFlight.cmd.toString(16)}`)
      );
    } else {
      this.inFlight.resolve(payload);
    }
    clearTimeout(this.inFlight.timeout);
    this.inFlight = null;
    this.pumpQueue();
  }

  failInFlight(error) {
    if (!this.inFlight) return;
    clearTimeout(this.inFlight.timeout);
    this.inFlight.reject(error);
    this.inFlight = null;
    this.pumpQueue();
  }

  sendCommand(cmd, payload = Buffer.alloc(0), timeoutMs = 400) {
    if (!this.enabled) return Promise.resolve(Buffer.alloc(0));
    return new Promise((resolve, reject) => {
      this.pending.push({ cmd, payload, timeoutMs, resolve, reject });
      this.pumpQueue();
    });
  }

  buildFrame(cmd, payload = Buffer.alloc(0)) {
    const length = 1 + payload.length;
    const header = Buffer.from([PREAMBLE_0, PREAMBLE_1, length, cmd]);
    const chk = xorChecksum(Buffer.concat([header.slice(2), payload]));
    return Buffer.concat([header, payload, Buffer.from([chk])]);
  }

  sendCommandNoAck(cmd, payload = Buffer.alloc(0)) {
    if (!this.enabled) return false;
    if (!this.connected || !this.port || !this.port.isOpen) return false;
    // Prevent excessive buffering from increasing latency.
    if (this.port.writableLength > 8192) return false;
    const frame = this.buildFrame(cmd, payload);
    this.port.write(frame);
    return true;
  }

  pumpQueue() {
    if (!this.enabled) {
      this.pending.length = 0;
      return;
    }
    if (this.inFlight) return;
    if (!this.connected || !this.port || !this.port.isOpen) return;
    const next = this.pending.shift();
    if (!next) return;
    const frame = this.buildFrame(next.cmd, next.payload);
    this.inFlight = {
      cmd: next.cmd,
      resolve: next.resolve,
      reject: next.reject,
      timeout: setTimeout(() => {
        this.failInFlight(new Error(`Timeout waiting for response to cmd 0x${next.cmd.toString(16)}`));
      }, next.timeoutMs),
    };
    this.port.write(frame, (err) => {
      if (err) {
        this.failInFlight(err);
      }
    });
  }

  setAll(g, r, b) {
    for (let i = 0; i < LED_COUNT; i += 1) {
      this.currentFrame[i][0] = g & 0xff;
      this.currentFrame[i][1] = r & 0xff;
      this.currentFrame[i][2] = b & 0xff;
    }
  }

  setSegment(start, endInclusive, g, r, b) {
    const startClamped = Math.max(0, Math.min(LED_COUNT - 1, start | 0));
    const endClamped = Math.max(0, Math.min(LED_COUNT - 1, endInclusive | 0));
    for (let i = startClamped; i <= endClamped; i += 1) {
      this.currentFrame[i][0] = g & 0xff;
      this.currentFrame[i][1] = r & 0xff;
      this.currentFrame[i][2] = b & 0xff;
    }
  }

  async flushFrame({ awaitAck = true } = {}) {
    for (let start = 0; start < LED_COUNT; start += 80) {
      const len = Math.min(80, LED_COUNT - start);
      const payload = Buffer.alloc(3 + len * 3);
      payload.writeUInt16LE(start, 0);
      payload[2] = len;
      let idx = 3;
      for (let i = 0; i < len; i += 1) {
        const [g, r, b] = this.currentFrame[start + i];
        payload[idx] = Math.max(0, Math.min(255, Math.round(g * this.brightnessCap)));
        payload[idx + 1] = Math.max(0, Math.min(255, Math.round(r * this.brightnessCap)));
        payload[idx + 2] = Math.max(0, Math.min(255, Math.round(b * this.brightnessCap)));
        idx += 3;
      }
      if (awaitAck) {
        await this.sendCommand(CMD_SET_STRIP_BULK, payload);
      } else {
        this.sendCommandNoAck(CMD_SET_STRIP_BULK, payload);
      }
    }
  }

  async applyAmbientMode() {
    if (!this.enabled) return;
    if (this.ambientMode === 'idle') {
      this.stopJoustAnimation();
      this.stopShooterAnimation();
      this.stopPanoAnimation();
      this.startIdleAnimation();
      return;
    }
    this.stopIdleAnimation();
    if (this.ambientMode === 'joust') {
      this.stopShooterAnimation();
      this.stopPanoAnimation();
      this.startJoustAnimation();
      return;
    }
    this.stopJoustAnimation();
    if (this.ambientMode === 'shooter') {
      this.stopPanoAnimation();
      this.startShooterAnimation();
      return;
    }
    this.stopShooterAnimation();
    if (this.ambientMode === 'pano') {
      this.startPanoAnimation();
      return;
    }
    this.stopPanoAnimation();
    this.setAll(3, 7, 8);
    try {
      await this.flushFrame();
    } catch (error) {
      console.warn('[LED]', 'Ambient apply failed:', error.message);
    }
  }

  startIdleAnimation() {
    if (this.idleTimer) return;
    this.idleTimer = setInterval(() => {
      this.tickIdleAnimation();
    }, 30);
    this.tickIdleAnimation();
  }

  stopIdleAnimation() {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    this.idleTickBusy = false;
  }

  startJoustAnimation() {
    if (this.joustTimer) return;
    this.joustTimer = setInterval(() => {
      this.tickJoustAmbient();
    }, 30);
    this.tickJoustAmbient();
  }

  stopJoustAnimation() {
    if (this.joustTimer) {
      clearInterval(this.joustTimer);
      this.joustTimer = null;
    }
    this.joustTickBusy = false;
  }

  startShooterAnimation() {
    if (this.shooterTimer) return;
    this.shooterTimer = setInterval(() => {
      this.tickShooterAmbient();
    }, 20);
    this.tickShooterAmbient();
  }

  stopShooterAnimation() {
    if (this.shooterTimer) {
      clearInterval(this.shooterTimer);
      this.shooterTimer = null;
    }
    this.shooterTickBusy = false;
  }

  async tickShooterAmbient() {
    if (this.shooterTickBusy) return;
    if (!this.connected || !this.port || !this.port.isOpen) return;
    this.shooterTickBusy = true;
    const now = Date.now();
    const danger = now < this.shooterDangerUntil;
    const pulse = Math.sin(this.shooterPulsePhase) * 0.5 + 0.5;
    const bandWidth = 0.13;
    for (let i = 0; i < LED_COUNT; i += 1) {
      const pos = i / LED_COUNT;
      const center = (Math.sin(this.shooterSweepPhase) * 0.5 + 0.5);
      const d = Math.min(Math.abs(pos - center), 1 - Math.abs(pos - center));
      const band = Math.max(0, 1 - d / bandWidth);
      let r = 10 + band * 20;
      let g = 18 + band * 55;
      let b = 36 + band * 100 + pulse * 10;
      if (danger) {
        r += 35 + pulse * 22;
        g *= 0.6;
        b *= 0.8;
      }
      this.currentFrame[i][0] = Math.min(255, Math.round(g));
      this.currentFrame[i][1] = Math.min(255, Math.round(r));
      this.currentFrame[i][2] = Math.min(255, Math.round(b));
    }
    this.shooterSweepPhase += 0.035;
    this.shooterPulsePhase += danger ? 0.11 : 0.055;
    try {
      await this.flushFrame({ awaitAck: false });
    } catch (error) {
      console.warn('[LED]', 'Shooter ambient tick failed:', error.message);
    } finally {
      this.shooterTickBusy = false;
    }
  }

  startPanoAnimation() {
    if (this.panoTimer) return;
    this.panoTimer = setInterval(() => {
      this.tickPanoAmbient();
    }, 20);
    this.tickPanoAmbient();
  }

  stopPanoAnimation() {
    if (this.panoTimer) {
      clearInterval(this.panoTimer);
      this.panoTimer = null;
    }
    this.panoTickBusy = false;
  }

  async tickPanoAmbient() {
    if (this.panoTickBusy) return;
    if (!this.connected || !this.port || !this.port.isOpen) return;
    this.panoTickBusy = true;
    const drift = Math.sin(this.panoDriftPhase) * 0.5 + 0.5;
    const sat = 0.86;
    for (let i = 0; i < LED_COUNT; i += 1) {
      const hue = this.panoHue + Math.sin((i / LED_COUNT) * Math.PI * 2 + this.panoDriftPhase * 0.35) * 12;
      const sparkle = (Math.sin((i * 0.23) + this.panoDriftPhase * 1.4) * 0.5 + 0.5) * 0.08;
      const value = 0.06 + drift * 0.09 + sparkle;
      const [r, g, b] = hsvToRgb(hue, sat, value);
      this.currentFrame[i][0] = g;
      this.currentFrame[i][1] = r;
      this.currentFrame[i][2] = b;
    }
    this.panoHue = (this.panoHue + 0.03) % 360;
    this.panoDriftPhase += 0.03;
    try {
      await this.flushFrame({ awaitAck: false });
    } catch (error) {
      console.warn('[LED]', 'Pano ambient tick failed:', error.message);
    } finally {
      this.panoTickBusy = false;
    }
  }

  async tickJoustAmbient() {
    if (this.joustTickBusy) return;
    if (!this.connected || !this.port || !this.port.isOpen) return;
    this.joustTickBusy = true;
    const now = Date.now();
    const inTension = now < this.joustTensionUntil;
    const mix = Math.sin(this.joustHuePhase) * 0.5 + 0.5;
    const breathe = Math.sin(this.joustBreathePhase) * 0.5 + 0.5;
    const value = inTension ? 0.13 + breathe * 0.24 : 0.09 + breathe * 0.14;
    const c1 = [70, 235, 255]; // cyan-ish
    const c2 = [255, 85, 200]; // magenta-ish
    const r = Math.round(((1 - mix) * c1[0] + mix * c2[0]) * value);
    const g = Math.round(((1 - mix) * c1[1] + mix * c2[1]) * value);
    const b = Math.round(((1 - mix) * c1[2] + mix * c2[2]) * value);
    this.setAll(g, r, b);
    this.joustHuePhase += inTension ? 0.038 : 0.018;
    this.joustBreathePhase += inTension ? 0.07 : 0.032;
    try {
      await this.flushFrame({ awaitAck: false });
    } catch (error) {
      console.warn('[LED]', 'Joust ambient tick failed:', error.message);
    } finally {
      this.joustTickBusy = false;
    }
  }

  clearScheduledEvents() {
    for (const timer of this.scheduledEvents) {
      clearTimeout(timer);
    }
    this.scheduledEvents.length = 0;
  }

  schedule(delayMs, fn) {
    const timer = setTimeout(() => {
      const idx = this.scheduledEvents.indexOf(timer);
      if (idx >= 0) this.scheduledEvents.splice(idx, 1);
      fn();
    }, delayMs);
    this.scheduledEvents.push(timer);
  }

  async tickIdleAnimation() {
    if (this.idleTickBusy) return;
    if (!this.connected || !this.port || !this.port.isOpen) return;
    this.idleTickBusy = true;
    const saturation = 0.95;
    const waveCycles = 2.5;
    for (let i = 0; i < LED_COUNT; i += 1) {
      const hue = this.idleHue + (i / LED_COUNT) * 360;
      const wave = Math.sin(this.idleWavePhase + (i / LED_COUNT) * Math.PI * 2 * waveCycles) * 0.5 + 0.5;
      const value = 0.07 + wave * 0.32;
      const [r, g, b] = hsvToRgb(hue, saturation, value);
      this.currentFrame[i][0] = g;
      this.currentFrame[i][1] = r;
      this.currentFrame[i][2] = b;
    }
    this.idleHue = (this.idleHue + 0.18) % 360;
    this.idleWavePhase += 0.07;
    try {
      await this.flushFrame({ awaitAck: false });
    } catch (error) {
      console.warn('[LED]', 'Idle animation tick failed:', error.message);
    } finally {
      this.idleTickBusy = false;
    }
  }

  async flash({ g, r, b, durationMs = 180, segment = null }) {
    if (this.effectTimeout) {
      clearTimeout(this.effectTimeout);
      this.effectTimeout = null;
    }
    this.stopIdleAnimation();
    this.stopJoustAnimation();
    this.stopShooterAnimation();
    this.stopPanoAnimation();
    if (segment) {
      this.setSegment(segment[0], segment[1], g, r, b);
    } else {
      this.setAll(g, r, b);
    }
    try {
      await this.flushFrame();
    } catch (error) {
      console.warn('[LED]', 'Flash failed:', error.message);
    }
    this.effectTimeout = setTimeout(() => {
      this.effectTimeout = null;
      this.applyAmbientMode();
    }, durationMs);
  }

  setMode(mode) {
    this.clearScheduledEvents();
    this.ambientMode = mode || 'idle';
    this.applyAmbientMode();
  }

  handleEvent(type, data = {}) {
    if (!this.enabled) return;
    if (type === 'joust_round_start') {
      this.clearScheduledEvents();
      if (data && data.resetScores) {
        this.flash({ g: 0, r: 0, b: 0, durationMs: 340 });
      }
      const base = data && data.resetScores ? 360 : 0;
      this.schedule(base + 0, () => this.flash({ g: 22, r: 28, b: 36, durationMs: 120 }));
      this.schedule(base + 220, () => this.flash({ g: 34, r: 45, b: 58, durationMs: 120 }));
      this.schedule(base + 440, () => this.flash({ g: 48, r: 72, b: 92, durationMs: 150 }));
      return;
    }
    if (type === 'joust_hit') {
      this.clearScheduledEvents();
      this.flash({ g: 36, r: 100, b: 45, durationMs: 150 });
      this.schedule(200, () => this.flash({ g: 16, r: 42, b: 20, durationMs: 110 }));
      const p1Score = Number(data.p1Score || 0);
      const p2Score = Number(data.p2Score || 0);
      const winScore = Number(data.winScore || 0);
      if (winScore > 0 && Math.max(p1Score, p2Score) >= winScore - 1) {
        this.joustTensionUntil = Date.now() + 7000;
      }
      return;
    }
    if (type === 'joust_win') {
      this.clearScheduledEvents();
      this.joustTensionUntil = 0;
      this.flash({ g: 38, r: 150, b: 52, durationMs: 190 });
      this.schedule(260, () => this.flash({ g: 34, r: 140, b: 46, durationMs: 190 }));
      this.schedule(520, () => this.flash({ g: 42, r: 165, b: 56, durationMs: 220 }));
      for (let i = 0; i < 10; i += 1) {
        this.schedule(820 + i * 170, () => {
          const [r, g, b] = hsvToRgb((i * 36) % 360, 0.92, 0.5);
          this.flash({ g, r, b, durationMs: 135 });
        });
      }
      return;
    }
    if (type === 'shooter_start') {
      this.shooterDangerUntil = 0;
      this.applyAmbientMode();
      return;
    }
    if (type === 'shooter_enemy_kill') {
      this.flash({ g: 36, r: 75, b: 46, durationMs: 85 });
      return;
    }
    if (type === 'shooter_base_damaged') {
      this.shooterDangerUntil = Date.now() + 4200;
      this.clearScheduledEvents();
      this.flash({ g: 10, r: 130, b: 36, durationMs: 130 });
      this.schedule(220, () => this.flash({ g: 8, r: 95, b: 28, durationMs: 120 }));
      return;
    }
    if (type === 'shooter_game_over') {
      this.flash({ g: 4, r: 145, b: 40, durationMs: 700 });
      return;
    }
    if (type === 'pano_start') {
      this.flash({ g: 18, r: 28, b: 40, durationMs: 180 });
      return;
    }
    if (type === 'pano_target_selected') {
      this.flash({ g: 24, r: 40, b: 30, durationMs: 140 });
      return;
    }
    if (type === 'pano_reset') {
      this.flash({ g: 0, r: 0, b: 0, durationMs: 220 });
      this.schedule(260, () => this.flash({ g: 12, r: 20, b: 30, durationMs: 120 }));
      return;
    }
    if (type === 'pano_found') {
      this.clearScheduledEvents();
      for (let i = 0; i < 8; i += 1) {
        this.schedule(i * 120, () => {
          const [r, g, b] = hsvToRgb(170 + i * 10, 0.7, 0.52);
          this.flash({ g, r, b, durationMs: 90 });
        });
      }
      return;
    }
  }
}

const ledUartClient = new LedUartClient();

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#02030f',
    title: 'FRC Arcade',
    fullscreen: !isDev,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile('index.html');

  if (isDev) {
    win.setFullScreen(false);
    win.center();
  }
};

app.whenReady().then(() => {
  sleepBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  ledUartClient.start();
  createWindow();
});

app.on('before-quit', () => {
  ledUartClient.stop();
  if (sleepBlockerId != null && powerSaveBlocker.isStarted(sleepBlockerId)) {
    powerSaveBlocker.stop(sleepBlockerId);
  }
});

app.on('window-all-closed', () => app.quit());

ipcMain.on('led:set-mode', (_event, payload) => {
  ledUartClient.setMode(payload && payload.mode ? String(payload.mode) : 'idle');
});

ipcMain.on('led:event', (_event, payload) => {
  if (!payload || !payload.type) return;
  ledUartClient.handleEvent(String(payload.type), payload.data || {});
});
