"use strict";

const FOLLOWUP_COOLDOWN_MS = 45 * 60 * 1000;
const MAX_FOLLOWUPS_PER_DAY = 3;

const STATUS = Object.freeze({
  NEW: "new",
  CONSULTING: "consulting",
  NEED_PHONE: "need_phone",
  NEED_NAME: "need_name",
  NEED_ADDRESS: "need_address",
  NEED_ORDER_DETAILS: "need_order_details",
  NEED_CONFIRMATION: "need_confirmation",
  CONTACT_PROMISED: "contact_promised",
  ORDER_CONFIRMED: "order_confirmed",
  DONE: "done"
});

function normalizeSalesState(raw = {}) {
  const missing = Array.isArray(raw.missingFields) ? raw.missingFields.filter(Boolean) : [];
  return {
    status: Object.values(STATUS).includes(raw.status) ? raw.status : STATUS.CONSULTING,
    hasPhone: Boolean(raw.hasPhone),
    hasZalo: Boolean(raw.hasZalo),
    hasName: Boolean(raw.hasName),
    hasAddress: Boolean(raw.hasAddress),
    hasOrderIntent: Boolean(raw.hasOrderIntent),
    hasOrderDetails: Boolean(raw.hasOrderDetails),
    orderConfirmed: Boolean(raw.orderConfirmed),
    missingFields: [...new Set(missing)],
    summary: String(raw.summary || "").slice(0, 800),
    nextAction: String(raw.nextAction || "").slice(0, 500),
    shouldFollowUp: raw.shouldFollowUp !== false
  };
}

function isComplete(state) {
  const s = normalizeSalesState(state);
  if (s.status === STATUS.DONE || s.status === STATUS.ORDER_CONFIRMED) return true;
  if (s.hasOrderIntent && s.orderConfirmed && s.hasPhone && s.hasName && s.hasAddress && s.hasOrderDetails) return true;
  return false;
}

function canFollowUp(meta = {}, now = Date.now()) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const sentToday = Array.isArray(meta.followupTimes)
    ? meta.followupTimes.filter((ts) => Number(ts) >= dayStart.getTime() && Number(ts) <= now)
    : [];
  const last = sentToday.length ? Math.max(...sentToday) : Number(meta.lastFollowupAt || 0);
  if (sentToday.length >= MAX_FOLLOWUPS_PER_DAY) return false;
  if (last && now - last < FOLLOWUP_COOLDOWN_MS) return false;
  return true;
}

function recordFollowUp(meta = {}, now = Date.now()) {
  const times = Array.isArray(meta.followupTimes) ? meta.followupTimes.filter(Number.isFinite) : [];
  return {
    ...meta,
    lastFollowupAt: now,
    followupTimes: [...times, now].slice(-12)
  };
}

module.exports = {
  STATUS,
  FOLLOWUP_COOLDOWN_MS,
  MAX_FOLLOWUPS_PER_DAY,
  normalizeSalesState,
  isComplete,
  canFollowUp,
  recordFollowUp
};
