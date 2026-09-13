const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

test("startup does not mutate profile state or start manual features", () => {
  const entry = read("src/entry.js");
  const lazy = read("src/lazy-startup.js");
  assert.doesNotMatch(entry, /pagebot-data\.json/);
  assert.doesNotMatch(entry, /resetManualRuntimeSwitches/);
  assert.doesNotMatch(lazy, /auto-chat-current\.js/);
  assert.match(entry, /require\("\.\/legacy-auto-guard"\)/);
});

test("Auto runtime is loaded only after the user enables Auto", () => {
  const ui = read("src/ui-v2.js");
  assert.match(ui, /AUTO_SCRIPT = "auto-chat-current\.js"/);
  assert.match(ui, /loadAutoEngine/);
  assert.match(ui, /if \(!toggle\.checked\)/);
  assert.match(ui, /document\.body\.appendChild\(script\)/);
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

test("startup entry does not load cookie, duplicate login, or old duplicate chat runtime", () => {
  const source = read("src/entry.js");
  assert.doesNotMatch(source, /cookie-tool-runtime/);
  assert.doesNotMatch(source, /profile-login-runtime/);
  assert.doesNotMatch(source, /^require\("\.\/chat-runtime"\);/m);
  assert.doesNotMatch(source, /^require\("\.\/chat-snapshot-lite"\);/m);
  assert.match(source, /chat:enable-lite-snapshot/);
});

test("DEV launcher starts Electron directly", () => {
  const source = read("run-dev.bat");
  assert.match(source, /electron\\dist\\electron\.exe/);
  assert.doesNotMatch(source, /npm start/);
});
