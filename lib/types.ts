export type Platform = "local" | "facebook";
export type LeadSource = "local_chat" | "facebook_messenger" | "facebook_comment" | "website" | "other";
export type SenderType = "customer" | "ai" | "staff" | "system";
export type AIProviderName = "openai" | "gemini" | "meta";
export type AIConfidenceStatus = "confident" | "uncertain" | "human_required";
export type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "CONVERTED" | "LOST";
export type CommentHideMode = "off" | "phone_only" | "hide_all" | "blocked_keywords";
export type QualificationStage =
  | "discovery"
  | "qualifying"
  | "ready_for_quote"
  | "phone_capture"
  | "handoff"
  | "closed";
export type SalesState =
  | "NEW"
  | "QUALIFYING"
  | "PRODUCT_INTEREST"
  | "COLLECTING_PHONE"
  | "COLLECTING_ADDRESS"
  | "COLLECTING_QUANTITY"
  | "CONFIRMING_ORDER"
  | "ORDER_CREATED"
  | "HANDOFF"
  | "CLOSED";

export type SalesIntent =
  | "greeting"
  | "product_question"
  | "price_inquiry"
  | "quotation_request"
  | "color_question"
  | "coverage_question"
  | "technical_question"
  | "interior_paint"
  | "exterior_paint"
  | "waterproofing"
  | "new_house"
  | "renovation"
  | "dealer_question"
  | "delivery_question"
  | "discount_question"
  | "purchase_intent"
  | "phone_provided"
  | "address_provided"
  | "quantity_provided"
  | "contractor_question"
  | "human_request"
  | "complaint"
  | "unknown";

export type RoutedIntent =
  | SalesIntent
  | "ask_price"
  | "ask_product"
  | "ask_usage"
  | "ask_shipping"
  | "ask_payment"
  | "ask_address"
  | "wants_dealer"
  | "phone_submitted"
  | "address_submitted"
  | "out_of_scope"
  | "spam"
  | "unclear";

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  description: string;
  interior_or_exterior: "interior" | "exterior" | "both" | "specialty";
  main_benefits: string[];
  suitable_surfaces: string[];
  suitable_projects: string[];
  coverage: string | null;
  coverage_value: number | null;
  coats: number | null;
  available_sizes: string[];
  price: number | null;
  price_unit: string | null;
  discount: string | null;
  warranty: string | null;
  technical_info: Record<string, string>;
  application_instructions: string | null;
  drying_time: string | null;
  color_info: string | null;
  features: string[];
  suitable_for: string[];
  faq: Record<string, string>;
  active: boolean;
  featured: boolean;
  sort_order: number;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  page_id?: string | null;
  customer_psid?: string | null;
  facebook_message_id?: string | null;
  sender_type: SenderType;
  direction?: "inbound" | "outbound" | "internal" | null;
  message: string;
  text?: string | null;
  ai_generated?: boolean | null;
  status?: "sent" | "failed" | "received" | "pending" | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Conversation {
  id: string;
  platform: Platform;
  external_user_id: string;
  page_id?: string | null;
  customer_psid?: string | null;
  customer_name?: string | null;
  customer_avatar_url?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count?: number | null;
  human_takeover?: boolean | null;
  customer_id?: string | null;
  status: "OPEN" | "HUMAN" | "CLOSED";
  ai_enabled: boolean;
  assigned_staff_id?: string | null;
  last_campaign_at?: string | null;
  last_customer_message_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationState {
  conversation_id: string;
  current_intent: SalesIntent;
  lead_score: number;
  scored_signals?: string[];
  collected_name?: string | null;
  collected_phone?: string | null;
  collected_location?: string | null;
  collected_address?: string | null;
  collected_quantity?: string | null;
  collected_floors?: string | null;
  collected_project_type?: string | null;
  collected_area?: string | null;
  collected_product_interest?: string | null;
  collected_budget?: string | null;
  last_question?: string | null;
  qualification_stage: QualificationStage;
  sales_state?: SalesState;
  conversation_summary?: string | null;
  ai_confidence_status?: AIConfidenceStatus | null;
  last_ai_reply_at?: string | null;
  should_request_phone?: boolean;
  should_handoff?: boolean;
  updated_at: string;
}

export interface Lead {
  id: string;
  conversation_id: string;
  page_id?: string | null;
  customer_psid?: string | null;
  customer_name?: string | null;
  phone?: string | null;
  normalized_phone?: string | null;
  location?: string | null;
  address?: string | null;
  project_type?: string | null;
  area?: string | null;
  floors?: string | null;
  interested_products?: string[] | null;
  budget?: string | null;
  source?: LeadSource;
  intent: SalesIntent;
  lead_score: number;
  status: LeadStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadEvent {
  id: string;
  lead_id?: string | null;
  conversation_id?: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface SalesEngineInput {
  conversation: Conversation;
  history: Message[];
  state: ConversationState;
  products: Product[];
  retrievedProducts?: Product[];
  customerMessage: string;
  pageContext?: Pick<
    FacebookPage,
    | "page_id"
    | "page_name"
    | "ai_provider"
    | "ai_model"
    | "ai_fallback_provider"
    | "ai_provider_fallback_enabled"
    | "ai_business_name"
    | "ai_system_prompt"
    | "ai_tone"
    | "ai_sales_goal"
    | "ai_product_context"
    | "ai_faq_context"
    | "ai_allowed_topics"
    | "ai_fallback_message"
    | "chat_rules"
  > | null;
}

export interface SalesEngineOutput {
  reply: string;
  intent: SalesIntent;
  lead_score: number;
  qualification_stage: QualificationStage;
  should_request_phone: boolean;
  should_handoff: boolean;
  next_action?: "reply" | "ask_phone" | "ask_address" | "ask_quantity" | "confirm_order" | "create_order" | "handoff" | "none";
  confidence?: number;
  confidence_status?: AIConfidenceStatus;
  provider?: AIProviderName | "local_fallback";
  scored_signals?: string[];
  recommendations: string[];
  extracted_customer_data?: SalesEngineOutput["extracted"];
  extracted: {
    name?: string | null;
    phone?: string | null;
    normalized_phone?: string | null;
    location?: string | null;
    address?: string | null;
    quantity?: string | null;
    area?: string | null;
    floors?: string | null;
    project_type?: string | null;
    budget?: string | null;
    product_interest?: string | null;
  };
}

export interface FacebookPage {
  id: string;
  page_id: string;
  page_name: string;
  page_avatar_url?: string | null;
  page_access_token?: string | null;
  token_mask?: string | null;
  connected: boolean;
  webhook_status?: "unknown" | "active" | "error";
  last_webhook_at?: string | null;
  last_connection_check_at?: string | null;
  granted_permissions?: string[] | null;
  missing_permissions?: string[] | null;
  automation_enabled: boolean;
  auto_reply_messenger: boolean;
  ai_sales_mode: boolean;
  auto_handoff: boolean;
  auto_like_comments: boolean;
  auto_reply_comments: boolean;
  auto_hide_comments: boolean;
  comment_hide_mode?: CommentHideMode;
  hide_phone_comments: boolean;
  hide_keyword_comments: boolean;
  ai_reply_delay_seconds?: number | null;
  ai_provider?: AIProviderName | null;
  ai_model?: string | null;
  ai_fallback_provider?: AIProviderName | null;
  ai_provider_fallback_enabled?: boolean | null;
  ai_business_name?: string | null;
  ai_system_prompt?: string | null;
  ai_tone?: string | null;
  ai_sales_goal?: string | null;
  ai_product_context?: string | null;
  ai_faq_context?: string | null;
  ai_allowed_topics?: string | null;
  ai_fallback_message?: string | null;
  chat_rules?: PageChatRules | null;
  blocked_keywords?: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface PageChatRules {
  ai_auto_reply?: boolean;
  human_takeover_default?: boolean;
  max_response_length?: number;
  allow_emoji?: boolean;
  ask_phone?: boolean;
  ask_address?: boolean;
  auto_close_order?: boolean;
  auto_send_price?: boolean;
  after_hours_reply?: boolean;
  business_hours?: string;
  after_hours_fallback?: string;
  max_ai_followups?: number;
  stop_on_not_interested?: boolean;
  stop_on_human_request?: boolean;
}

export interface FacebookComment {
  id: string;
  page_id: string;
  post_id: string;
  comment_id: string;
  parent_id?: string | null;
  external_user_id?: string | null;
  customer_id?: string | null;
  message: string;
  created_time?: string | null;
  is_from_page: boolean;
  hidden: boolean;
  liked: boolean;
  replied: boolean;
  classification: Record<string, unknown>;
  automation_result: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  customer_id?: string | null;
  conversation_id?: string | null;
  customer_name?: string | null;
  phone: string;
  address: string;
  status: "DRAFT" | "PENDING_CONFIRMATION" | "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DONE" | "CANCELLED";
  source: LeadSource;
  notes?: string | null;
  subtotal: number;
  discount_amount: number;
  shipping_fee: number;
  total: number;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
}

export interface AutomationSettings {
  facebook_auto_reply: boolean;
  auto_like_comments: boolean;
  auto_reply_comments: boolean;
  auto_hide_comments: boolean;
  hide_phone_comments: boolean;
  hide_keyword_comments: boolean;
  blocked_keywords: string[];
  default_ai_provider: AIProviderName;
}

export interface WebhookEventLog {
  id: string;
  event_key: string;
  page_id?: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  processed: boolean;
  processing_error?: string | null;
  created_at: string;
}
