const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("bootstrap keeps proxy auth and profile data reads cached", () => {
  const source = fs.readFileSync(path.join(root, "src", "bootstrap.js"), "utf8");
  assert.match(source, /proxyAuthBySession = new WeakMap/);
  assert.match(source, /installDataFileReadCache/);
  assert.match(source, /appliedProxySignatures/);
  assert.match(source, /enable-gpu-rasterization/);
});
