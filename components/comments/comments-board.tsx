"use client";

import { useEffect, useState } from "react";
import type { FacebookComment } from "@/lib/types";

export function CommentsBoard() {
  const [comments, setComments] = useState<FacebookComment[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const response = await fetch("/api/comments", { cache: "no-store" });
    const data = await response.json();
    setComments(data.comments ?? []);
    setLoading(false);
  }

  useEffect(() => void load(), []);

  async function action(comment_id: string, actionName: string) {
    await fetch("/api/comments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment_id, action: actionName })
    });
    await load();
  }

  return (
    <section className="panel overflow-hidden rounded-lg">
      <div className="border-b border-line px-4 py-3 font-semibold">Bình luận mới</div>
      {loading ? <div className="p-6 text-sm text-muted">Đang tải bình luận...</div> : null}
      {!loading && comments.length === 0 ? <div className="p-6 text-sm text-muted">Chưa có bình luận nào từ webhook.</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-left text-muted">
            <tr>
              <th className="px-4 py-3">Post</th>
              <th className="px-4 py-3">Khách</th>
              <th className="px-4 py-3">Nội dung</th>
              <th className="px-4 py-3">Ẩn</th>
              <th className="px-4 py-3">Like</th>
              <th className="px-4 py-3">Reply</th>
              <th className="px-4 py-3">Automation</th>
              <th className="px-4 py-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {comments.map((comment) => (
              <tr key={comment.id} className="border-t border-line align-top">
                <td className="px-4 py-3">{comment.post_id}</td>
                <td className="px-4 py-3">{comment.external_user_id || "-"}</td>
                <td className="max-w-md px-4 py-3">{comment.message}</td>
                <td className="px-4 py-3">{comment.hidden ? "Có" : "Không"}</td>
                <td className="px-4 py-3">{comment.liked ? "Có" : "Không"}</td>
                <td className="px-4 py-3">{comment.replied ? "Có" : "Không"}</td>
                <td className="px-4 py-3">{Object.keys(comment.automation_result ?? {}).join(", ") || "-"}</td>
                <td className="space-x-2 px-4 py-3">
                  <button onClick={() => void action(comment.comment_id, comment.hidden ? "unhide" : "hide")} className="rounded-md border border-line px-2 py-1">
                    {comment.hidden ? "Bỏ ẩn" : "Ẩn"}
                  </button>
                  <button onClick={() => void action(comment.comment_id, "reply")} className="rounded-md border border-line px-2 py-1">Reply</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
