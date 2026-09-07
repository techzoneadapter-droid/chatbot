import type { ConversationState, SalesEngineOutput } from "@/lib/types";
import { nowIso } from "@/lib/utils/time";

export function mergeState(state: ConversationState, output: SalesEngineOutput): ConversationState {
  return {
    ...state,
    current_intent: output.intent,
    lead_score: output.lead_score,
    scored_signals: output.scored_signals ?? state.scored_signals ?? [],
    collected_name: output.extracted.name ?? state.collected_name ?? null,
    collected_phone: output.extracted.normalized_phone ?? state.collected_phone ?? null,
    collected_location: output.extracted.location ?? state.collected_location ?? null,
    collected_address: output.extracted.address ?? state.collected_address ?? null,
    collected_quantity: output.extracted.quantity ?? state.collected_quantity ?? null,
    collected_floors: output.extracted.floors ?? state.collected_floors ?? null,
    collected_area: output.extracted.area ?? state.collected_area ?? null,
    collected_project_type: output.extracted.project_type ?? state.collected_project_type ?? null,
    collected_product_interest: output.extracted.product_interest ?? state.collected_product_interest ?? null,
    collected_budget: output.extracted.budget ?? state.collected_budget ?? null,
    qualification_stage: output.qualification_stage,
    sales_state: output.should_handoff
      ? "HANDOFF"
      : output.next_action === "create_order"
        ? "ORDER_CREATED"
        : output.next_action === "confirm_order"
          ? "CONFIRMING_ORDER"
          : output.next_action === "ask_address"
            ? "COLLECTING_ADDRESS"
            : output.next_action === "ask_quantity"
              ? "COLLECTING_QUANTITY"
              : output.next_action === "ask_phone"
                ? "COLLECTING_PHONE"
                : output.extracted.product_interest || state.collected_product_interest
                  ? "PRODUCT_INTEREST"
                  : output.lead_score > 0
                    ? "QUALIFYING"
                    : state.sales_state ?? "NEW",
    should_request_phone: output.should_request_phone,
    should_handoff: output.should_handoff,
    ai_confidence_status: output.confidence_status ?? state.ai_confidence_status ?? null,
    last_ai_reply_at: output.provider ? nowIso() : state.last_ai_reply_at ?? null,
    conversation_summary: state.conversation_summary ?? null,
    updated_at: nowIso()
  };
}

export function initialState(conversationId: string): ConversationState {
  return {
    conversation_id: conversationId,
    current_intent: "unknown",
    lead_score: 0,
    scored_signals: [],
    qualification_stage: "discovery",
    sales_state: "NEW",
    collected_name: null,
    collected_phone: null,
    collected_location: null,
    collected_address: null,
    collected_quantity: null,
    collected_floors: null,
    collected_area: null,
    collected_project_type: null,
    collected_product_interest: null,
    collected_budget: null,
    last_question: null,
    should_request_phone: false,
    should_handoff: false,
    conversation_summary: null,
    ai_confidence_status: null,
    last_ai_reply_at: null,
    updated_at: nowIso()
  };
}
