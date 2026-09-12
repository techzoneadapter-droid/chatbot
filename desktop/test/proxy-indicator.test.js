const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('proxy status is a visual indicator and errors render below', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'proxy-panel.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'proxy.css'), 'utf8');
  assert.match(js, /indicator\.className = "proxy-indicator"/);
  assert.match(js, /setResult\(`Lỗi proxy:/);
  assert.match(css, /#proxy-status\.active/);
  assert.match(css, /proxy-live-pulse/);
  assert.match(css, /proxy-result-error/);
});
