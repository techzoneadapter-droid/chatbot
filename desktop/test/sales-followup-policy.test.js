const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUS, isComplete, canFollowUp, recordFollowUp } = require('../src/sales-followup-policy');

test('unfinished orders remain eligible for follow-up', () => {
  assert.equal(isComplete({ status: STATUS.NEED_PHONE, hasOrderIntent: true }), false);
  assert.equal(isComplete({ status: STATUS.NEED_ADDRESS, hasPhone: true, hasName: true, hasOrderIntent: true }), false);
});

test('confirmed complete orders stop follow-up', () => {
  assert.equal(isComplete({ status: STATUS.ORDER_CONFIRMED }), true);
  assert.equal(isComplete({ hasOrderIntent: true, orderConfirmed: true, hasPhone: true, hasName: true, hasAddress: true, hasOrderDetails: true }), true);
});

test('follow-up cooldown and daily cap prevent spam', () => {
  const now = new Date('2026-09-13T12:00:00+07:00').getTime();
  assert.equal(canFollowUp({}, now), true);
  const once = recordFollowUp({}, now);
  assert.equal(canFollowUp(once, now + 10 * 60 * 1000), false);
  const later = now + 46 * 60 * 1000;
  assert.equal(canFollowUp(once, later), true);
  const twice = recordFollowUp(once, later);
  const thrice = recordFollowUp(twice, later + 46 * 60 * 1000);
  assert.equal(canFollowUp(thrice, later + 92 * 60 * 1000), false);
});
