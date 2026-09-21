"use strict";

// The renderer runs with Node integration enabled (see main.js), so this store can
// keep scores local without adding an IPC endpoint to the Electron main process.
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const FORMAT_VERSION = 1;
const NAME_PATTERN = /^[A-Z0-9 _-]{1,16}$/;
const operationQueues = new Map();

class LeaderboardError extends Error {
  constructor(message, code, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = this.constructor.name;
    this.code = code;
  }
}

class LeaderboardValidationError extends LeaderboardError {
  constructor(message) {
    super(message, "LEADERBOARD_INVALID_ENTRY");
  }
}

class LeaderboardCorruptionError extends LeaderboardError {
  constructor(filePath, cause) {
    super(
      `Leaderboard file is corrupt and was not changed: ${filePath}`,
      "LEADERBOARD_CORRUPT",
      cause,
    );
  }
}

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

function defaultDevMode() {
  return process.env.NODE_ENV === "development";
}

function defaultLeaderboardPath({ devMode = defaultDevMode() } = {}) {
  return path.join(
    os.homedir(),
    "Documents",
    "Cell Defender Scores",
    devMode ? "leaderboard-dev.json" : "leaderboard.json",
  );
}

function validateTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new LeaderboardValidationError("createdAt must be a valid timestamp string");
  }
}

function jsonClone(value, fieldName) {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new TypeError("not JSON serializable");
    }
    return JSON.parse(encoded);
  } catch (error) {
    throw new LeaderboardValidationError(`${fieldName} must be JSON serializable`);
  }
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new LeaderboardValidationError("entry must be an object");
  }
  if (typeof entry.runId !== "string" || entry.runId.length === 0) {
    throw new LeaderboardValidationError("runId must be a non-empty string");
  }
  const name = typeof entry.name === "string" ? entry.name.trim() : entry.name;
  if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
    throw new LeaderboardValidationError(
      "name must be 1 to 16 uppercase letters, digits, spaces, hyphens, or underscores",
    );
  }
  if (typeof entry.score !== "number" || !Number.isFinite(entry.score) || entry.score < 0) {
    throw new LeaderboardValidationError("score must be a finite non-negative number");
  }
  if (!Number.isInteger(entry.wave) || entry.wave <= 0) {
    throw new LeaderboardValidationError("wave must be a positive integer");
  }
  validateTimestamp(entry.createdAt);

  const normalized = {
    runId: entry.runId,
    name,
    score: entry.score,
    wave: entry.wave,
    createdAt: entry.createdAt,
  };
  if (hasOwn(entry, "build")) normalized.build = jsonClone(entry.build, "build");
  return normalized;
}

function parseDocument(source, filePath) {
  let document;
  try {
    document = JSON.parse(source);
  } catch (error) {
    throw new LeaderboardCorruptionError(filePath, error);
  }
  if (
    !document ||
    typeof document !== "object" ||
    Array.isArray(document) ||
    document.version !== FORMAT_VERSION ||
    !Array.isArray(document.entries)
  ) {
    throw new LeaderboardCorruptionError(filePath);
  }

  try {
    const entries = document.entries.map(normalizeEntry);
    const ids = new Set();
    for (const entry of entries) {
      if (ids.has(entry.runId)) throw new Error("duplicate runId");
      ids.add(entry.runId);
    }
    return entries;
  } catch (error) {
    throw new LeaderboardCorruptionError(filePath, error);
  }
}

async function readEntries(filePath) {
  let source;
  try {
    source = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
  return parseDocument(source, filePath);
}

async function writeAtomically(filePath, entries) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const contents = `${JSON.stringify({ version: FORMAT_VERSION, entries }, null, 2)}\n`;
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await fs.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporaryPath, filePath);

    // Syncing the containing directory makes the rename durable on filesystems
    // which support it. Some platforms do not allow opening a directory this way.
    try {
      const directoryHandle = await fs.open(directory, "r");
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } catch (error) {
      if (!error || !["EINVAL", "EPERM", "EISDIR", "ENOTSUP"].includes(error.code)) {
        throw error;
      }
    }
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function rankEntries(entries) {
  return entries
    .map((entry, index) => ({ entry, index, timestamp: Date.parse(entry.createdAt) }))
    .sort(
      (left, right) =>
        right.entry.score - left.entry.score ||
        left.timestamp - right.timestamp ||
        left.index - right.index,
    )
    .map(({ entry }) => jsonClone(entry, "stored entry"));
}

function createLeaderboard({ filePath } = {}) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    throw new TypeError("createLeaderboard requires a non-empty filePath");
  }
  const resolvedPath = path.resolve(filePath);

  const serialize = (operation) => {
    // This covers all handles in this renderer process. The arcade is designed
    // to have one running app, so cross-process file locking is unnecessary.
    const previous = operationQueues.get(resolvedPath) || Promise.resolve();
    const result = previous.then(operation, operation);
    operationQueues.set(resolvedPath, result.catch(() => {}));
    return result;
  };

  return Object.freeze({
    get filePath() {
      return resolvedPath;
    },
    append(entry) {
      return Promise.resolve()
        .then(() => normalizeEntry(entry))
        .then((normalized) =>
          serialize(async () => {
            const entries = await readEntries(resolvedPath);
            const existing = entries.find((stored) => stored.runId === normalized.runId);
            if (existing) return jsonClone(existing, "stored entry");
            entries.push(normalized);
            await writeAtomically(resolvedPath, entries);
            return jsonClone(normalized, "stored entry");
          }),
        );
    },
    list() {
      return serialize(async () => rankEntries(await readEntries(resolvedPath)));
    },
  });
}

function createDefaultLeaderboard({ devMode = defaultDevMode(), filePath } = {}) {
  const configuredPath = filePath || process.env.HOSA_LEADERBOARD_PATH;
  return createLeaderboard({
    filePath: configuredPath || defaultLeaderboardPath({ devMode }),
  });
}

module.exports = {
  LeaderboardCorruptionError,
  LeaderboardError,
  LeaderboardValidationError,
  createDefaultLeaderboard,
  createLeaderboard,
  defaultLeaderboardPath,
};
