const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Auto Sales analyzes old conversations instead of treating first sight as handled', () => {
  const auto = read('src/auto-chat-current.js');
  assert.match(auto, /mode === "new_message" \? "new_message" : "followup_old"|hasNewIncoming \? "new_message" : "followup_old"/);
  assert.match(auto, /analyzeSales\(stable, mode\)/);
  assert.match(auto, /canFollowUpOld/);
  assert.match(auto, /MAX_FOLLOWUPS_PER_DAY = 3/);
  assert.match(auto, /FOLLOWUP_COOLDOWN_MS = 45 \* 60 \* 1000/);
});

test('sales analyzer is available through preload and remains network-idle until invoked', () => {
  const entry = read('src/entry.js');
  const preload = read('src/preload.js');
  const runtime = read('src/sales-followup-runtime.js');
  assert.match(entry, /require\("\.\/sales-followup-runtime"\)/);
  assert.match(preload, /sales:analyze-followup/);
  assert.match(runtime, /ipcMain\.handle\("sales:analyze-followup"/);
  assert.doesNotMatch(runtime, /^\s*fetch\(/m);
});

test('sales prompt requires confirmation and avoids falsely claiming external order creation', () => {
  const runtime = read('src/sales-followup-runtime.js');
  assert.match(runtime, /tóm tắt lại đơn và hỏi khách xác nhận/);
  assert.match(runtime, /KHÔNG nói đã lên đơn trên hệ thống/);
  assert.match(runtime, /SĐT hoặc Zalo/);
});
