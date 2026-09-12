const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("profile login credentials use Windows secure storage and 2FA is not persisted", () => {
  const bootstrap = read("src/bootstrap.js");
  const ui = read("src/profile-login.js");
  assert.match(bootstrap, /facebook-login:/);
  assert.match(bootstrap, /encryptSecret\(JSON\.stringify\(\{ account, password \}\)\)/);
  assert.doesNotMatch(bootstrap, /JSON\.stringify\(\{[^}]*twoFactorCode/);
  assert.match(ui, /Mã 2FA/);
  assert.match(ui, /không được lưu/i);
});

test("AI panel can collapse and resize the embedded browser area", () => {
  const preload = read("src/preload.js");
  const bootstrap = read("src/bootstrap.js");
  const panel = read("src/panel-toggle.js");
  assert.match(preload, /setAiPanelCollapsed/);
  assert.match(bootstrap, /layout:set-ai-panel-collapsed/);
  assert.match(bootstrap, /AI_PANEL_COLLAPSED_WIDTH/);
  assert.match(panel, /ai-panel-collapsed/);
});
