const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('multi-chat runtime is lazy and exposes conversation navigation only after chat use', () => {
  const entry = read('src/entry.js');
  const preload = read('src/preload.js');
  assert.match(entry, /require\("\.\/multi-chat-runtime"\)/);
  assert.match(entry, /chat:enable-lite-snapshot/);
  assert.match(preload, /chat:list-conversations/);
  assert.match(preload, /chat:open-conversation/);
});

test('multi-conversation auto isolates thread state and serializes send lane', () => {
  const auto = read('src/auto-chat-current.js');
  assert.match(auto, /conversationStates = new Map\(\)/);
  assert.match(auto, /processingKeys = new Set\(\)/);
  assert.match(auto, /candidateStateKey/);
  assert.match(auto, /incomingSignature/);
  assert.match(auto, /revalidatedKey !== stateKey/);
  assert.match(auto, /await window\.pagebot\.chat\.send\(text\)/);
  assert.match(auto, /for \(const candidate of batch\)/);
  assert.doesNotMatch(auto, /Promise\.all\([^)]*chat\.send/);
});

test('multi-chat runtime uses stable candidate locators instead of blind coordinates', () => {
  const runtime = read('src/multi-chat-runtime.js');
  assert.match(runtime, /kind: 'href'/);
  assert.match(runtime, /kind: 'label'/);
  assert.match(runtime, /CONVERSATION_NOT_FOUND/);
  assert.match(runtime, /chat:list-conversations/);
  assert.match(runtime, /chat:open-conversation/);
});
