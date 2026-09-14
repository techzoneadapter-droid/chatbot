const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Auto Sales evaluates old conversations and persists per-thread state', () => {
  const auto = read('src/auto-chat-current.js');
  assert.match(auto, /followup_old/);
  assert.match(auto, /analyzeSales\(stable, mode\)/);
  assert.match(auto, /MAX_FOLLOWUPS_PER_DAY = 1/);
  assert.match(auto, /FOLLOWUP_COOLDOWN_MS = 8 \* 60 \* 60 \* 1000/);
  assert.match(auto, /pagebot:sales-orchestrator:/);
  assert.match(auto, /waitingForCustomer/);
});

test('customer burst must settle before AI is allowed to answer', () => {
  const auto = read('src/auto-chat-current.js');
  assert.match(auto, /CUSTOMER_SETTLE_MS = 3500/);
  assert.match(auto, /REQUIRED_STABLE_PASSES = 2/);
  assert.match(auto, /waitForStableIncoming/);
  assert.match(auto, /Khách vừa nhắn thêm/);
});

test('Meta sales analyzer is available through preload and remains network-idle until invoked', () => {
  const entry = read('src/entry.js');
  const preload = read('src/preload.js');
  const runtime = read('src/meta-sales-runtime.js');
  assert.match(entry, /require\("\.\/meta-sales-runtime"\)/);
  assert.match(preload, /sales:analyze-followup/);
  assert.match(runtime, /ipcMain\.handle\("sales:analyze-followup"/);
  assert.match(runtime, /muse-spark-1\.3/);
  assert.match(runtime, /https:\/\/api\.meta\.ai\/v1\/chat\/completions/);
  assert.doesNotMatch(runtime, /^\s*fetch\(/m);
});

test('Meta sales orchestrator supports reply wait follow-up handoff and close actions', () => {
  const runtime = read('src/meta-sales-runtime.js');
  assert.match(runtime, /reply\|wait\|follow_up\|handoff\|close/);
  assert.match(runtime, /confidence/);
  assert.match(runtime, /nếu Page vừa hỏi khách/i);
  assert.match(runtime, /không xin lại/i);
  assert.match(runtime, /không lặp/i);
});

test('429 errors pause AI instead of retrying the same customer aggressively', () => {
  const entry = read('src/entry.js');
  const auto = read('src/auto-chat-current.js');
  assert.match(entry, /RETRYABLE_AI_STATUS = new Set\(\[500, 502, 503, 504\]\)/);
  assert.match(auto, /enterAiCooldown/);
  assert.match(auto, /aiCoolingDown/);
});
