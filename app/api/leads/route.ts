import { NextResponse } from "next/server";
import { createChatRepository } from "@/lib/storage/chat-repository";
import type { LeadStatus } from "@/lib/types";

export async function GET() {
  const repository = createChatRepository();
  return NextResponse.json({ leads: await repository.listLeads() });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: string; status?: string };
  const allowed = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];
  if (!body.id || !body.status || !allowed.includes(body.status)) {
    return NextResponse.json({ error: "Invalid lead update" }, { status: 400 });
  }
  const repository = createChatRepository();
  return NextResponse.json({ leads: await repository.updateLeadStatus(body.id, body.status as LeadStatus) });
}
