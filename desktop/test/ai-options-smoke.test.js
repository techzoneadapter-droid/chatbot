const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

test("advanced AI controls discover provider models instead of guessing sequentially", () => {
  const source = fs.readFileSync(path.join(root, "src", "ai-options.js"), "utf8");
  assert.match(source, /loadAvailableModels/);
  assert.match(source, /pagebot\.ai\.models/);
  assert.match(source, /pagebot\.ai\.probe/);
  assert.match(source, /PAGEBOT_STYLE/);
  assert.match(source, /ai-test-result/);
  assert.doesNotMatch(source, /for \(const model of candidates\)/);
});

test("bootstrap does not initialize all profile sessions on startup", () => {
  const source = fs.readFileSync(path.join(root, "src", "bootstrap.js"), "utf8");
  assert.match(source, /profile:prepare-network/);
  assert.match(source, /do not create or configure any browser profile here/i);
  assert.doesNotMatch(source, /Promise\.allSettled\(data\.profiles/);
});

test("DEV launcher skips verify on every normal startup", () => {
  const source = fs.readFileSync(path.join(root, "run-dev.bat"), "utf8");
  assert.match(source, /npm start/i);
  assert.doesNotMatch(source, /npm run verify/i);
  assert.equal(fs.existsSync(path.join(root, "verify-dev.bat")), true);
});
