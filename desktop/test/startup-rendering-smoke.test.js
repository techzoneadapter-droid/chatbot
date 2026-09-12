const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

test("desktop entry shows a lightweight shell without forcing network work", () => {
  const source = fs.readFileSync(path.join(root, "src", "entry.js"), "utf8");
  assert.doesNotMatch(source, /disable-quic/);
  assert.match(source, /setBackgroundColor\("#f7f9fc"\)/);
  assert.doesNotMatch(source, /window\.hide\(\)/);
  assert.match(source, /does not perform startup network work/i);
});
