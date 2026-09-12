const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

test("startup keeps proxy and Auto Chat off until the user enables them", () => {
  const entry = read("src/entry.js");
  assert.match(entry, /profile\.proxy\.enabled = false/);
  assert.match(entry, /profile\.autoReply = false/);
  assert.match(entry, /resetManualRuntimeSwitches/);
});

test("fresh app runs start profiles from configured home page instead of restoring old diagnostic pages", () => {
  const entry = read("src/entry.js");
  assert.match(entry, /profile\.lastUrl = profile\.startUrl/);
});

test("proxy UI is event-driven instead of polling in the background", () => {
  const source = read("src/proxy-panel.js");
  assert.doesNotMatch(source, /setInterval\s*\(/);
  assert.match(source, /active-profile/);
});

test("profile browser opens only through explicit open action", () => {
  const source = read("src/preload.js");
  assert.doesNotMatch(source, /startupOpenDeferred/);
  assert.match(source, /profile:prepare-network/);
  assert.match(source, /profile:open/);
});

test("toolbar includes official Meta Graph API Explorer shortcut", () => {
  const source = read("src/lazy-startup.js");
  assert.match(source, /developers\.facebook\.com\/tools\/explorer/);
  assert.match(source, /meta-dev-shortcut/);
});

test("DEV launcher starts Electron directly", () => {
  const source = read("run-dev.bat");
  assert.match(source, /electron\\dist\\electron\.exe/);
  assert.doesNotMatch(source, /npm start/);
});
