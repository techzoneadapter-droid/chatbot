import { NextResponse } from "next/server";
import { createCampaign, draftCampaignCopy, listCampaigns, previewRecipients, processCampaignQueue, setCampaignStatus } from "@/lib/campaigns/campaign-service";
import type { CampaignSegment, CampaignStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("preview") === "1") {
    const segment = parseSegment(url.searchParams.get("segment"));
    return NextResponse.json({ recipients: await previewRecipients(segment) });
  }
  return NextResponse.json(await listCampaigns());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    campaign_id?: string;
    name?: string;
    segment?: CampaignSegment;
    message_template?: string;
    recipient_ids?: string[];
    personalize?: boolean;
    status?: CampaignStatus;
    goal?: string;
    page_id?: string | null;
  };

  if (body.action === "ai_copy") return NextResponse.json(await draftCampaignCopy({ goal: body.goal, segment: body.segment ?? {}, pageId: body.page_id }));
  if (body.action === "control") {
    if (!body.campaign_id || !body.status) return NextResponse.json({ error: "campaign_id and status are required" }, { status: 400 });
    return NextResponse.json({ campaign: await setCampaignStatus(body.campaign_id, body.status) });
  }
  if (body.action === "process") {
    if (!body.campaign_id) return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
    return NextResponse.json({ campaign: await processCampaignQueue(body.campaign_id) });
  }

  if (!body.message_template?.trim()) return NextResponse.json({ error: "message_template is required" }, { status: 400 });
  const result = await createCampaign({
    name: body.name ?? "Campaign",
    segment: body.segment ?? {},
    messageTemplate: body.message_template,
    recipientIds: body.recipient_ids ?? [],
    personalize: Boolean(body.personalize)
  });
  return NextResponse.json(result);
}

function parseSegment(raw: string | null): CampaignSegment {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as CampaignSegment;
  } catch {
    return {};
  }
}
