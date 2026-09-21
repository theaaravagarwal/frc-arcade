"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  LeaderboardCorruptionError,
  LeaderboardValidationError,
  createDefaultLeaderboard,
  createLeaderboard,
  defaultLeaderboardPath,
} = require("../renderer/hosa/leaderboard");

async function temporaryLeaderboard(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frc-arcade-leaderboard-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return path.join(directory, "scores", "leaderboard.json");
}

function entry(overrides = {}) {
  return {
    runId: "run-1",
    name: "PLAYER 1",
    score: 400,
    wave: 3,
    createdAt: "2026-09-13T12:00:00.000Z",
    ...overrides,
  };
}

test("appends human-readable durable JSON and ranks score then timestamp", async (t) => {
  const filePath = await temporaryLeaderboard(t);
  const leaderboard = createLeaderboard({ filePath });
  await leaderboard.append(entry({ runId: "first", score: 50, createdAt: "2026-01-02T00:00:00.000Z" }));
  await leaderboard.append(entry({ runId: "top-new", score: 100, createdAt: "2026-01-03T00:00:00.000Z" }));
  await leaderboard.append(entry({ runId: "top-old", score: 100, createdAt: "2026-01-01T00:00:00.000Z", build: { weapon: "PULSE" } }));

  assert.deepEqual(
    (await leaderboard.list()).map((item) => item.runId),
    ["top-old", "top-new", "first"],
  );
  const saved = await fs.readFile(filePath, "utf8");
  assert.match(saved, /\n  "entries": \[/);
  assert.equal(JSON.parse(saved).entries[2].build.weapon, "PULSE");
  assert.equal(leaderboard.filePath, path.resolve(filePath));
});

test("serializes concurrent appends and deduplicates retry run IDs", async (t) => {
  const filePath = await temporaryLeaderboard(t);
  const leaderboard = createLeaderboard({ filePath });
  const secondHandle = createLeaderboard({ filePath });
  const duplicate = entry({ runId: "retry", score: 20 });
  await Promise.all([
    leaderboard.append(duplicate),
    secondHandle.append({ ...duplicate, score: 999, name: "RETRY TWO" }),
    leaderboard.append(entry({ runId: "other", score: 30 })),
  ]);

  const entries = await leaderboard.list();
  assert.equal(entries.length, 2);
  assert.equal(entries.find((item) => item.runId === "retry").score, 20);
});

test("keeps insertion order when both score and timestamp tie", async (t) => {
  const filePath = await temporaryLeaderboard(t);
  const leaderboard = createLeaderboard({ filePath });
  await leaderboard.append(entry({ runId: "one", score: 12 }));
  await leaderboard.append(entry({ runId: "two", score: 12 }));
  assert.deepEqual((await leaderboard.list()).map((item) => item.runId), ["one", "two"]);
});

test("rejects invalid entries before writing", async (t) => {
  const filePath = await temporaryLeaderboard(t);
  const leaderboard = createLeaderboard({ filePath });
  await assert.rejects(
    leaderboard.append(entry({ name: "not upper" })),
    LeaderboardValidationError,
  );
  await assert.rejects(leaderboard.append(entry({ score: Infinity })), LeaderboardValidationError);
  await assert.rejects(leaderboard.append(entry({ wave: 1.5 })), LeaderboardValidationError);
  await assert.rejects(leaderboard.append(entry({ createdAt: "nope" })), LeaderboardValidationError);
  await assert.rejects(leaderboard.append(entry({ runId: "" })), LeaderboardValidationError);
  await assert.rejects(leaderboard.append(entry({ name: "    " })), LeaderboardValidationError);
  await assert.rejects(fs.access(filePath));
});

test("trims player names before saving", async (t) => {
  const leaderboard = createLeaderboard({ filePath: await temporaryLeaderboard(t) });
  await leaderboard.append(entry({ name: "  PLAYER 1  " }));
  assert.equal((await leaderboard.list())[0].name, "PLAYER 1");
});

test("does not overwrite corrupt data", async (t) => {
  const filePath = await temporaryLeaderboard(t);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const corrupt = "{ definitely not json\n";
  await fs.writeFile(filePath, corrupt);
  const leaderboard = createLeaderboard({ filePath });
  await assert.rejects(leaderboard.append(entry()), LeaderboardCorruptionError);
  await assert.rejects(leaderboard.list(), (error) => error.code === "LEADERBOARD_CORRUPT");
  assert.equal(await fs.readFile(filePath, "utf8"), corrupt);
});

test("default path separates development data and accepts the environment override", () => {
  const production = defaultLeaderboardPath({ devMode: false });
  const development = defaultLeaderboardPath({ devMode: true });
  assert.equal(path.basename(production), "leaderboard.json");
  assert.equal(path.basename(development), "leaderboard-dev.json");
  assert.match(production, /Documents[\\/]Cell Defender Scores/);

  const previous = process.env.HOSA_LEADERBOARD_PATH;
  process.env.HOSA_LEADERBOARD_PATH = path.join(os.tmpdir(), "custom-hosa-scores.json");
  try {
    assert.equal(createDefaultLeaderboard({ devMode: false }).filePath, path.resolve(process.env.HOSA_LEADERBOARD_PATH));
  } finally {
    if (previous === undefined) delete process.env.HOSA_LEADERBOARD_PATH;
    else process.env.HOSA_LEADERBOARD_PATH = previous;
  }
});
