"use strict";

const FOLLOWUP_COOLDOWN_MS = 8 * 60 * 60 * 1000;
const MAX_FOLLOWUPS_PER_DAY = 1;
const CUSTOMER_SETTLE_MS = 3500;
const MIN_CONFIDENCE_TO_SEND = 0.72;

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

const ACTION = Object.freeze({
  REPLY: "reply",
  WAIT: "wait",
  FOLLOW_UP: "follow_up",
  HANDOFF: "handoff",
  CLOSE: "close"
});

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function normalizeSalesState(raw = {}) {
  const missing = Array.isArray(raw.missingFields) ? raw.missingFields.filter(Boolean) : [];
  const validAction = Object.values(ACTION).includes(raw.action) ? raw.action : ACTION.REPLY;
  return {
    status: Object.values(STATUS).includes(raw.status) ? raw.status : STATUS.CONSULTING,
    action: validAction,
    confidence: clampConfidence(raw.confidence),
    hasPhone: Boolean(raw.hasPhone),
    hasZalo: Boolean(raw.hasZalo),
    hasName: Boolean(raw.hasName),
    hasAddress: Boolean(raw.hasAddress),
    hasOrderIntent: Boolean(raw.hasOrderIntent),
    hasOrderDetails: Boolean(raw.hasOrderDetails),
    orderConfirmed: Boolean(raw.orderConfirmed),
    customerWaitingForUs: Boolean(raw.customerWaitingForUs),
    pageWaitingForCustomer: Boolean(raw.pageWaitingForCustomer),
    explicitHumanRequest: Boolean(raw.explicitHumanRequest),
    missingFields: [...new Set(missing)],
    summary: String(raw.summary || "").slice(0, 800),
    nextAction: String(raw.nextAction || "").slice(0, 500),
    handoffReason: String(raw.handoffReason || "").slice(0, 500),
    shouldFollowUp: raw.shouldFollowUp !== false,
    reply: String(raw.reply || "").trim().slice(0, 3500)
  };
}

function isComplete(state) {
  const s = normalizeSalesState(state);
  if (s.action === ACTION.CLOSE) return true;
  if (s.status === STATUS.DONE || s.status === STATUS.ORDER_CONFIRMED) return true;
  return Boolean(s.hasOrderIntent && s.orderConfirmed && s.hasPhone && s.hasName && s.hasAddress && s.hasOrderDetails);
}

function shouldSend(state) {
  const s = normalizeSalesState(state);
  if (s.action === ACTION.WAIT || s.action === ACTION.CLOSE || s.action === ACTION.HANDOFF) return false;
  if (!s.reply) return false;
  if (s.confidence < MIN_CONFIDENCE_TO_SEND) return false;
  return s.action === ACTION.REPLY || s.action === ACTION.FOLLOW_UP;
}

function canFollowUp(meta = {}, now = Date.now()) {
  if (meta.waitingForCustomer) return false;
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
    followupTimes: [...times, now].slice(-8),
    waitingForCustomer: true
  };
}

module.exports = {
  STATUS,
  ACTION,
  FOLLOWUP_COOLDOWN_MS,
  MAX_FOLLOWUPS_PER_DAY,
  CUSTOMER_SETTLE_MS,
  MIN_CONFIDENCE_TO_SEND,
  normalizeSalesState,
  isComplete,
  shouldSend,
  canFollowUp,
  recordFollowUp
};
