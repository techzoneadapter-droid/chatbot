const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('cookie extension stays demand-driven', () => {
  const main = read('src/main.js');
  const runtime = read('src/cookie-tool-runtime.js');
  assert.doesNotMatch(main, /ensureCookieExtension\(profileId\)/);
  assert.match(runtime, /presses the Cookie button/);
  assert.match(runtime, /ipcMain\.handle\("cookie-tool:open"/);
});

test('chat runtime overrides snapshot and suggestion lazily', () => {
  const runtime = read('src/chat-runtime.js');
  assert.match(runtime, /ipcMain\.removeHandler\("chat:snapshot"\)/);
  assert.match(runtime, /ipcMain\.removeHandler\("ai:suggest"\)/);
  assert.match(runtime, /createTreeWalker\(document\.body, NodeFilter\.SHOW_TEXT\)/);
  assert.match(runtime, /No DOM scan and no AI network request happens at startup/);
});

test('native cookie import/export handlers are registered', () => {
  const runtime = read('src/cookie-tool-runtime.js');
  assert.match(runtime, /ipcMain\.handle\("cookie:import"/);
  assert.match(runtime, /ipcMain\.handle\("cookie:export"/);
  assert.match(runtime, /ipcMain\.handle\("cookie:clear"/);
  assert.match(runtime, /ses\.cookies\.set/);
  assert.match(runtime, /clearFacebookCookies/);
});
