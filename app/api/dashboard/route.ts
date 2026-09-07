import { NextResponse } from "next/server";
import { createChatRepository } from "@/lib/storage/chat-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const repository = createChatRepository();
  const leads = await repository.listLeads();
  return NextResponse.json({
    stats: await repository.dashboardStats(),
    recentLeads: leads.slice(0, 8)
  });
}
