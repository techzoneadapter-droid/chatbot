import { NextResponse } from "next/server";
import { runSalesEngine } from "@/lib/ai/sales-engine";
import { createDraftOrderFromState } from "@/lib/orders/order-service";
import { listProducts } from "@/lib/products/product-service";
import { createChatRepository } from "@/lib/storage/chat-repository";

export async function GET() {
  const repository = createChatRepository();
  const conversation = await repository.getOrCreateConversation();
  return NextResponse.json({
    conversation,
    messages: await repository.getMessages(conversation.id),
    state: await repository.getState(conversation.id)
  });
}

export async function DELETE() {
  const repository = createChatRepository();
  const conversation = await repository.resetConversation();
  return NextResponse.json({
    conversation,
    messages: [],
    state: await repository.getState(conversation.id)
  });
}

export async function POST(request: Request) {
  try {
    let body: { message?: string; externalUserId?: string };
    try {
      body = (await request.json()) as { message?: string; externalUserId?: string };
    } catch {
      return NextResponse.json({ error: "Malformed JSON request" }, { status: 400 });
    }
    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (message.length > 4000) {
      return NextResponse.json({ error: "Message is too long" }, { status: 413 });
    }

    const repository = createChatRepository();
    const conversation = await repository.getOrCreateConversation(body.externalUserId || "local-demo", "local");
    await repository.addMessage(conversation.id, "customer", message);

    if (!conversation.ai_enabled) {
      return NextResponse.json({
        conversation,
        messages: await repository.getMessages(conversation.id),
        state: await repository.getState(conversation.id),
        reply: null
      });
    }

    const products = await listProducts();
    const history = await repository.getMessages(conversation.id);
    const currentState = await repository.getState(conversation.id);
    const output = await runSalesEngine({
      conversation,
      history,
      state: currentState,
      products,
      customerMessage: message
    });

    await repository.addMessage(conversation.id, "ai", output.reply, { sales_output: output });
    const state = await repository.updateState(conversation.id, output);
    const lead = await repository.upsertLeadFromState(conversation.id, output);
    const order = await createDraftOrderFromState({ conversation, state, products });
    const finalConversation = output.should_handoff ? (await repository.setAiEnabled(conversation.id, false)) ?? conversation : conversation;

    return NextResponse.json({
      conversation: finalConversation,
      messages: await repository.getMessages(conversation.id),
      state,
      lead,
      order,
      output
    });
  } catch (error) {
    console.error("Chat API failed", error);
    return NextResponse.json(
      {
        error: "chat_failed",
        fallback:
          "Xin lỗi anh/chị, hệ thống tư vấn đang gặp chút vấn đề. Anh/chị để lại SĐT giúp em, bên em sẽ liên hệ lại sớm ạ."
      },
      { status: 500 }
    );
  }
}
