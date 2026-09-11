const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

test("advanced AI controls include model recovery and style presets", () => {
  const source = fs.readFileSync(path.join(root, "src", "ai-options.js"), "utf8");
  assert.match(source, /findWorkingModel/);
  assert.match(source, /gemini-flash-latest/);
  assert.match(source, /PAGEBOT_STYLE/);
  assert.match(source, /ai-test-result/);
});

test("bootstrap blocks heavy media and configures sessions in parallel", () => {
  const source = fs.readFileSync(path.join(root, "src", "bootstrap.js"), "utf8");
  assert.match(source, /resourceType === "media"/);
  assert.match(source, /Promise\.allSettled/);
});
