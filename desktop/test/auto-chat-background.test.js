const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('legacy Auto Chat interval is captured and stays off unless explicitly enabled', () => {
  const entry = read('src/entry.js');
  const guard = read('src/legacy-auto-guard.js');
  assert.ok(entry.indexOf('require("./legacy-auto-guard")') < entry.indexOf('require("./bootstrap")'));
  assert.match(guard, /Number\(delay\) === 2500/);
  assert.match(guard, /legacy-auto:set-enabled/);
  assert.match(guard, /!legacyEnabled/);
});

test('lightweight Auto Chat uses one gated timeout loop without global busy overlay', () => {
  const auto = read('src/auto-chat-current.js');
  assert.match(auto, /const POLL_MS = 6500/);
  assert.match(auto, /MAX_SCAN_PER_CYCLE = 3/);
  assert.match(auto, /__pagebotChatbotEngine === "light"/);
  assert.match(auto, /window\.pagebot\.chat\.snapshot\(\)/);
  assert.match(auto, /window\.pagebot\.ai\.suggest\(\)/);
  assert.match(auto, /window\.pagebot\.chat\.send\(text\)/);
  assert.doesNotMatch(auto, /setBusy\(/);
  assert.doesNotMatch(auto, /setInterval\(/);
});

test('current Business Suite snapshot reader stays demand-driven', () => {
  const entry = read('src/entry.js');
  const preload = read('src/preload.js');
  assert.doesNotMatch(entry, /^require\("\.\/chat-snapshot-lite"\);/m);
  assert.doesNotMatch(entry, /^require\("\.\/chat-runtime"\);/m);
  assert.match(entry, /ipcMain\.handle\("chat:enable-lite-snapshot"/);
  assert.match(entry, /require\("\.\/chat-snapshot-lite"\)/);
  assert.match(entry, /require\("\.\/multi-chat-runtime"\)/);
  assert.match(preload, /ensureLiteSnapshotReader/);
  assert.match(preload, /chat:enable-lite-snapshot/);
  assert.match(preload, /snapshot: readChatSnapshot/);
});

test('Auto script itself is lazy-loaded only after user interaction', () => {
  const lazy = read('src/lazy-startup.js');
  const ui = read('src/ui-v2.js');
  assert.doesNotMatch(lazy, /auto-chat-current\.js/);
  assert.match(ui, /AUTO_SCRIPT = "auto-chat-current\.js"/);
  assert.match(ui, /loadAutoEngine/);
  assert.match(ui, /toggle\.checked/);
});
