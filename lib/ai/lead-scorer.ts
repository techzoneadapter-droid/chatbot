import type { ConversationState, SalesIntent } from "@/lib/types";

export interface LeadScoreResult {
  score: number;
  signals: string[];
}

const signalScores: Record<string, number> = {
  price_inquiry: 10,
  quotation_request: 15,
  project_info: 10,
  area: 10,
  product_recommendation: 10,
  delivery_question: 10,
  discount_question: 10,
  purchase_intent: 15,
  phone_provided: 20,
  human_request: 15,
  urgent_timing: 10,
  budget: 8
};

function detectSignals(intent: SalesIntent, state: ConversationState, message: string) {
  const signals = new Set<string>();

  if (["price_inquiry", "quotation_request", "delivery_question", "discount_question", "purchase_intent", "phone_provided", "human_request"].includes(intent)) {
    signals.add(intent);
  }

  if (/(xây|xay|sửa|sua|sơn lại|son lai|nhà mới|nha moi|nhà cũ|nha cu|chống thấm|chong tham|nội thất|noi that|ngoại thất|ngoai that|trong nhà|trong nha|bên ngoài|ben ngoai)/i.test(message)) {
    signals.add("project_info");
  }
  if (/\b\d{2,4}\s*(m2|m²|mét vuông|met vuong|mét|met)\b/i.test(message) || state.collected_area) signals.add("area");
  if (/\b\d{1,2}\s*(tầng|tang|lầu|lau)\b/i.test(message)) signals.add("project_info");
  if (/(loại nào tốt|loai nao tot|dòng nào tốt|dong nao tot|nên dùng|nen dung|tư vấn loại|tu van loai)/i.test(message)) {
    signals.add("product_recommendation");
  }
  if (/(hôm nay|hom nay|ngày mai|ngay mai|tuần này|tuan nay|gấp|gap|sớm|som|cuối tuần|cuoi tuan)/i.test(message)) signals.add("urgent_timing");
  if (/\b\d{1,3}(?:[.,]\d{1,2})?\s*(triệu|trieu|tr|k|ngàn|ngan|nghìn|nghin|vnd|đồng|dong)\b/i.test(message)) signals.add("budget");

  return [...signals];
}

export function scoreLeadDetailed(intent: SalesIntent, state: ConversationState, message: string): LeadScoreResult {
  const previousSignals = state.scored_signals ?? [];
  const nextSignals = [...new Set([...previousSignals, ...detectSignals(intent, state, message)])];
  const signalScore = nextSignals.reduce((total, signal) => total + (signalScores[signal] ?? 0), 0);
  const memoryScore =
    (state.collected_project_type ? 8 : 0) +
    (state.collected_area ? 8 : 0) +
    (state.collected_product_interest ? 8 : 0) +
    (state.collected_budget ? 5 : 0) +
    (state.collected_phone ? 20 : 0);

  return {
    score: Math.min(100, Math.max(state.lead_score ?? 0, Math.round(signalScore + memoryScore))),
    signals: nextSignals
  };
}

export function scoreLead(intent: SalesIntent, state: ConversationState, message: string) {
  return scoreLeadDetailed(intent, state, message).score;
}

export function scoreLabel(score: number) {
  if (score >= 70) return "HOT";
  if (score >= 40) return "WARM";
  return "LOW";
}
