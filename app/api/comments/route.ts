import { NextResponse } from "next/server";
import { getFacebookPage, listComments, updateComment } from "@/lib/admin-data";
import { clientForPage } from "@/lib/facebook/graph-api";

export async function GET() {
  return NextResponse.json({ comments: await listComments() });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  if (!body.comment_id || !body.action) return NextResponse.json({ error: "Thiếu comment hoặc thao tác" }, { status: 400 });
  const comments = await listComments();
  const comment = comments.find((item) => item.comment_id === body.comment_id);
  const page = comment ? await getFacebookPage(comment.page_id) : null;
  const client = clientForPage(page);
  if (client && body.action === "hide") await client.hideComment(body.comment_id);
  if (client && body.action === "unhide") await client.unhideComment(body.comment_id);
  if (client && body.action === "reply" && body.message) await client.replyComment(body.comment_id, String(body.message));
  const updated = await updateComment(body.comment_id, {
    hidden: body.action === "hide" ? true : body.action === "unhide" ? false : comment?.hidden,
    replied: body.action === "reply" ? true : comment?.replied
  });
  return NextResponse.json({ comment: updated, comments: await listComments() });
}
