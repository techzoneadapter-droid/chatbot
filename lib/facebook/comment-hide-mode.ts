import type { CommentHideMode } from "@/lib/types";

export const COMMENT_HIDE_MODE_VALUES = ["off", "phone_only", "hide_all", "blocked_keywords"] as const satisfies readonly CommentHideMode[];
export const DEFAULT_COMMENT_HIDE_MODE: CommentHideMode = "phone_only";

export const COMMENT_HIDE_MODE_LABELS: Record<CommentHideMode, string> = {
  off: "Không tự động ẩn",
  phone_only: "Chỉ ẩn bình luận có số điện thoại",
  hide_all: "Ẩn tất cả bình luận",
  blocked_keywords: "Ẩn bình luận chứa từ khóa chặn"
};

const LEGACY_COMMENT_HIDE_MODE_MAP: Record<string, CommentHideMode> = {
  off: "off",
  phone: "phone_only",
  phone_only: "phone_only",
  all: "hide_all",
  hide_all: "hide_all",
  keywords: "blocked_keywords",
  blocked_keywords: "blocked_keywords"
};

export function normalizeCommentHideMode(value: unknown): CommentHideMode | undefined {
  return typeof value === "string" ? LEGACY_COMMENT_HIDE_MODE_MAP[value] : undefined;
}
