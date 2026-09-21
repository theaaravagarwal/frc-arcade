"use strict";

const NAME_MAX = 16;
const NAME_KEYS = Object.freeze([
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."0123456789",
  "SPACE",
  "BACK",
  "DONE",
]);
const NAME_COLUMNS = 8;

function cleanName(value) {
  return String(value == null ? "" : value)
    .toUpperCase()
    .replace(/[^A-Z0-9 _-]/g, "")
    .slice(0, NAME_MAX);
}

function moveNameCursor(cursor, dx, dy) {
  const index = Math.max(0, Math.min(NAME_KEYS.length - 1, Number(cursor) || 0));
  const row = Math.floor(index / NAME_COLUMNS);
  const rowStart = row * NAME_COLUMNS;
  const rowLength = Math.min(NAME_COLUMNS, NAME_KEYS.length - rowStart);
  if (dx) return rowStart + (index - rowStart + Math.sign(dx) + rowLength) % rowLength;
  if (!dy) return index;
  const nextRow = Math.max(0, Math.min(Math.ceil(NAME_KEYS.length / NAME_COLUMNS) - 1, row + Math.sign(dy)));
  return Math.min(nextRow * NAME_COLUMNS + (index % NAME_COLUMNS), NAME_KEYS.length - 1);
}

function applyNameKey(name, key) {
  const current = cleanName(name);
  if (key === "BACK") return current.slice(0, -1);
  if (key === "SPACE") return cleanName(`${current} `);
  if (/^[A-Z0-9]$/.test(key || "")) return cleanName(`${current}${key}`);
  return current;
}

module.exports = { NAME_MAX, NAME_KEYS, NAME_COLUMNS, cleanName, moveNameCursor, applyNameKey };
