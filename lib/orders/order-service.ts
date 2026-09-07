import { createOrder } from "@/lib/admin-data";
import type { Conversation, ConversationState, OrderItem, Product } from "@/lib/types";

export function canCreateDraftOrder(state: ConversationState) {
  return Boolean(state.collected_phone && state.collected_address && state.collected_quantity && state.collected_product_interest);
}

export async function createDraftOrderFromState(input: { conversation: Conversation; state: ConversationState; products: Product[] }) {
  if (!canCreateDraftOrder(input.state)) return null;
  const product = input.products.find((item) => input.state.collected_product_interest && item.name.toLowerCase().includes(input.state.collected_product_interest.toLowerCase()));
  const quantity = parseQuantity(input.state.collected_quantity);
  const item: Omit<OrderItem, "id" | "order_id" | "created_at"> = {
    product_id: product?.id ?? null,
    product_name: product?.name ?? input.state.collected_product_interest ?? "Sản phẩm cần tư vấn",
    variant: null,
    quantity,
    unit_price: product?.price ?? null,
    amount: product?.price ? product.price * quantity : null
  };
  return createOrder(
    {
      customer_id: input.conversation.customer_id ?? null,
      conversation_id: input.conversation.id,
      customer_name: input.state.collected_name ?? null,
      phone: input.state.collected_phone ?? "",
      address: input.state.collected_address ?? "",
      status: "PENDING_CONFIRMATION",
      source: input.conversation.platform === "facebook" ? "facebook_messenger" : "local_chat",
      total_amount: item.amount ?? null,
      notes: "Đơn nháp được tạo từ hội thoại AI, cần nhân viên xác nhận giá/chính sách."
    },
    [item]
  );
}

function parseQuantity(value?: string | null) {
  const parsed = Number(value?.match(/\d+/)?.[0] ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
