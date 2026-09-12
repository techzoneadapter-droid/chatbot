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
  assert.match(auto, /const POLL_MS = 6000/);
  assert.match(auto, /__pagebotChatbotEngine === "light"/);
  assert.match(auto, /window\.pagebot\.chat\.snapshot\(\)/);
  assert.match(auto, /window\.pagebot\.ai\.suggest\(\)/);
  assert.match(auto, /window\.pagebot\.chat\.send\(text\)/);
  assert.doesNotMatch(auto, /setBusy\(/);
  assert.doesNotMatch(auto, /setInterval\(/);
});

test('light snapshot reader scopes scanning aggressively and stays lazy', () => {
  const entry = read('src/entry.js');
  const runtime = read('src/chat-snapshot-lite.js');
  assert.match(entry, /require\("\.\/chat-snapshot-lite"\)/);
  assert.match(runtime, /createTreeWalker\(root, NodeFilter\.SHOW_TEXT\)/);
  assert.match(runtime, /scanned < 2200/);
  assert.match(runtime, /fastVisible/);
  assert.match(runtime, /ipcMain\.removeHandler\("chat:snapshot"\)/);
  assert.match(runtime, /does no work until Inspect\/Auto explicitly requests a snapshot/);
});
