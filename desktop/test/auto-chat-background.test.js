const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('legacy Auto Chat interval is suppressed before main bootstrap', () => {
  const entry = read('src/entry.js');
  const guard = read('src/legacy-auto-guard.js');
  assert.ok(entry.indexOf('require("./legacy-auto-guard")') < entry.indexOf('require("./bootstrap")'));
  assert.match(guard, /Number\(delay\) === 2500/);
  assert.match(guard, /autoTick/);
});

test('Auto Chat uses one demand-driven timeout loop without global busy overlay', () => {
  const auto = read('src/auto-chat-current.js');
  assert.match(auto, /const POLL_MS = 4200/);
  assert.match(auto, /window\.pagebot\.chat\.snapshot\(\)/);
  assert.match(auto, /window\.pagebot\.ai\.suggest\(\)/);
  assert.match(auto, /window\.pagebot\.chat\.send\(text\)/);
  assert.doesNotMatch(auto, /setBusy\(/);
  assert.doesNotMatch(auto, /setInterval\(/);
});

test('light snapshot reader scopes scanning and stays lazy', () => {
  const entry = read('src/entry.js');
  const runtime = read('src/chat-snapshot-lite.js');
  assert.match(entry, /require\("\.\/chat-snapshot-lite"\)/);
  assert.match(runtime, /createTreeWalker\(root, NodeFilter\.SHOW_TEXT\)/);
  assert.match(runtime, /scanned < 5000/);
  assert.match(runtime, /ipcMain\.removeHandler\("chat:snapshot"\)/);
  assert.match(runtime, /does no work until Inspect\/Auto explicitly requests a snapshot/);
});
