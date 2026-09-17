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

test("Electron entry disables WebAuthn OS prompts before bootstrap", () => {
  const source = fs.readFileSync(path.join(root, "src", "entry.js"), "utf8");
  assert.match(source, /disable-features/);
  assert.match(source, /WebAuthentication/);
  assert.match(source, /WebAuthenticationConditionalUI/);
  assert.match(source, /require\("\.\/bootstrap"\)/);
});

test("Electron entry retries transient Gemini and Meta API failures", () => {
  const source = fs.readFileSync(path.join(root, "src", "entry.js"), "utf8");
  assert.match(source, /RETRYABLE_AI_STATUS/);
  assert.match(source, /429/);
  assert.match(source, /503/);
  assert.match(source, /MAX_AI_ATTEMPTS = 3/);
  assert.match(source, /generativelanguage\.googleapis\.com/);
  assert.match(source, /api\.meta\.ai/);
});

test("slow Facebook loads are never force-reloaded by the performance guard", () => {
  const source = fs.readFileSync(path.join(root, "src", "profile-performance.js"), "utf8");
  assert.match(source, /setFrameRate\?\.\(30\)/);
  assert.equal(source.includes("reloadIgnoringCache"), false);
  assert.equal(source.includes("contents.reload("), false);
});

test("profile open stops blocking the shell after a short UI timeout", () => {
  const source = fs.readFileSync(path.join(root, "src", "preload.js"), "utf8");
  assert.match(source, /PROFILE_OPEN_UI_TIMEOUT_MS = 1200/);
  assert.match(source, /Promise\.race\(\[opening, quickFallback\]\)/);
  assert.match(source, /profiles:list/);
});
