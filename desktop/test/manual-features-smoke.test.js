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

test("fresh app starts profiles from configured home page", () => {
  const entry = read("src/entry.js");
  assert.match(entry, /profile\.lastUrl = profile\.startUrl/);
});

test("profile browser opens only through explicit open action", () => {
  const source = read("src/preload.js");
  assert.match(source, /profile:prepare-network/);
  assert.match(source, /profile:open/);
});

test("cookie bridge is not exposed by preload", () => {
  const source = read("src/preload.js");
  assert.doesNotMatch(source, /cookieTool|cookie:import|cookie:export|cookie:clear/);
});

test("startup entry does not load cookie or duplicate login runtimes", () => {
  const source = read("src/entry.js");
  assert.doesNotMatch(source, /cookie-tool-runtime/);
  assert.doesNotMatch(source, /profile-login-runtime/);
});

test("DEV launcher starts Electron directly", () => {
  const source = read("run-dev.bat");
  assert.match(source, /electron\\dist\\electron\.exe/);
  assert.doesNotMatch(source, /npm start/);
});
