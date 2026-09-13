const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STATUS,
  ACTION,
  MIN_CONFIDENCE_TO_SEND,
  isComplete,
  shouldSend,
  canFollowUp,
  recordFollowUp
} = require('../src/sales-followup-policy');

test('unfinished orders remain open', () => {
  assert.equal(isComplete({ status: STATUS.NEED_PHONE, hasOrderIntent: true }), false);
  assert.equal(isComplete({ status: STATUS.NEED_ADDRESS, hasPhone: true, hasName: true, hasOrderIntent: true }), false);
});

test('confirmed complete orders and close actions stop automation', () => {
  assert.equal(isComplete({ status: STATUS.ORDER_CONFIRMED }), true);
  assert.equal(isComplete({ action: ACTION.CLOSE }), true);
  assert.equal(isComplete({ hasOrderIntent: true, orderConfirmed: true, hasPhone: true, hasName: true, hasAddress: true, hasOrderDetails: true }), true);
});

test('orchestrator only auto-sends confident reply/follow-up actions', () => {
  assert.equal(shouldSend({ action: ACTION.REPLY, confidence: MIN_CONFIDENCE_TO_SEND, reply: 'ok' }), true);
  assert.equal(shouldSend({ action: ACTION.FOLLOW_UP, confidence: 0.9, reply: 'em hỏi lại ạ' }), true);
  assert.equal(shouldSend({ action: ACTION.WAIT, confidence: 1, reply: 'không gửi' }), false);
  assert.equal(shouldSend({ action: ACTION.HANDOFF, confidence: 1, reply: 'không tự gửi' }), false);
  assert.equal(shouldSend({ action: ACTION.REPLY, confidence: 0.4, reply: 'không chắc' }), false);
});

test('one follow-up per day and waiting lock prevent spam', () => {
  const now = new Date('2026-09-13T12:00:00+07:00').getTime();
  assert.equal(canFollowUp({}, now), true);
  const once = recordFollowUp({}, now);
  assert.equal(once.waitingForCustomer, true);
  assert.equal(canFollowUp(once, now + 9 * 60 * 60 * 1000), false);
  assert.equal(canFollowUp({ ...once, waitingForCustomer: false }, now + 9 * 60 * 60 * 1000), false);
  const tomorrow = now + 25 * 60 * 60 * 1000;
  assert.equal(canFollowUp({ ...once, waitingForCustomer: false }, tomorrow), true);
});
