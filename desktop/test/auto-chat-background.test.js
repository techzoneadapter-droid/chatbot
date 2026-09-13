const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('legacy Auto Chat interval is captured and stays off unless explicitly enabled', () => {
  const entry = read('src/entry.js');
  const guard = read('src/legacy-auto-guard.js');
  assert.ok(entry.includes('require("./legacy-auto-guard")'));
  assert.ok(guard.includes('legacy-auto:set-enabled'));
});

test('Auto Sales stays timeout-driven and only runs when explicitly enabled', () => {
  const auto = read('src/auto-chat-current.js');
  assert.ok(auto.includes('const POLL_MS = 6500'));
  assert.ok(auto.includes('MAX_SCAN_PER_CYCLE = 3'));
  assert.ok(auto.includes('window.pagebot.sales.analyzeFollowup'));
  assert.ok(auto.includes('followup_old'));
  assert.ok(auto.includes('window.pagebot.chat.send(text)'));
  assert.equal(auto.includes('setInterval('), false);
});

test('current Business Suite readers remain demand-driven', () => {
  const entry = read('src/entry.js');
  const preload = read('src/preload.js');
  assert.ok(entry.includes('chat:enable-lite-snapshot'));
  assert.ok(entry.includes('require("./chat-snapshot-lite")'));
  assert.ok(entry.includes('require("./multi-chat-runtime")'));
  assert.ok(preload.includes('ensureLiteSnapshotReader'));
  assert.ok(preload.includes('chat:enable-lite-snapshot'));
});

test('Auto script itself is lazy-loaded only after user interaction', () => {
  const lazy = read('src/lazy-startup.js');
  const ui = read('src/ui-v2.js');
  assert.equal(lazy.includes('auto-chat-current.js'), false);
  assert.ok(ui.includes('AUTO_SCRIPT = "auto-chat-current.js"'));
  assert.ok(ui.includes('loadAutoEngine'));
});
