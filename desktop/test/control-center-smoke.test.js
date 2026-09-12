const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('control center separates tools into selectable sections', () => {
  const source = read('src/control-center.js');
  for (const label of ['Chatbot', 'AI Chat', 'Proxy', 'Login FB', 'Access Token']) {
    assert.match(source, new RegExp(label.replace(' ', '\\s')));
  }
  assert.match(source, /replaceChildren\(nav, content, activityCard\)/);
  assert.match(source, /Auto nhẹ/);
  assert.match(source, /Auto tương thích/);
});

test('legacy auto is opt-in and lightweight auto is engine-gated', () => {
  const guard = read('src/legacy-auto-guard.js');
  const auto = read('src/auto-chat-current.js');
  const preload = read('src/preload.js');
  assert.match(guard, /legacy-auto:set-enabled/);
  assert.match(guard, /if \(!legacyEnabled \|\| !capturedLegacy\?\.callback\) return false/);
  assert.match(auto, /__pagebotChatbotEngine === "light"/);
  assert.match(preload, /legacyAuto/);
});
