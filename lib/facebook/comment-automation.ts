import { detectIntent } from "@/lib/ai/intent-detector";
import { detectVietnamesePhone } from "@/lib/ai/phone-detector";
import { DEFAULT_COMMENT_HIDE_MODE, normalizeCommentHideMode } from "@/lib/facebook/comment-hide-mode";
import type { AutomationSettings, FacebookPage } from "@/lib/types";

export interface CommentClassification {
  intent: string;
  hasPhone: boolean;
  hasBlacklistedKeyword: boolean;
  isSpam: boolean;
  shouldHide: boolean;
  shouldLike: boolean;
  shouldReply: boolean;
  reply: string | null;
  reasons: string[];
}

export function classifyComment(input: {
  page: FacebookPage | null;
  message: string;
  isFromPage: boolean;
  settings: AutomationSettings;
}): CommentClassification {
  const text = input.message.trim();
  const lower = text.toLowerCase();
  const phone = detectVietnamesePhone(text);
  const keyword = input.settings.blacklistKeywords.find((item) => item && lower.includes(item.toLowerCase()));
  const repeatedLinks = (text.match(/https?:\/\//gi) ?? []).length > 1;
  const isSpam = repeatedLinks || /(vay tien|casino|telegram|zalo.*vip|kiem tien)/i.test(lower);
  const pageAllows = Boolean(input.page?.automation_enabled ?? true);
  const hideMode = normalizeCommentHideMode(input.page?.comment_hide_mode) ?? (input.page?.auto_hide_comments === false ? "off" : DEFAULT_COMMENT_HIDE_MODE);
  const autoHideEnabled = Boolean(input.page?.auto_hide_comments ?? true);
  const keywordHideEnabled = Boolean(input.page?.hide_keyword_comments ?? input.settings.comment.autoHideBlacklist);
  const shouldHide =
    pageAllows &&
    autoHideEnabled &&
    !input.isFromPage &&
    hideMode !== "off" &&
    (hideMode === "hide_all" || (hideMode === "phone_only" && phone.valid) || (hideMode === "blocked_keywords" && keywordHideEnabled && Boolean(keyword)));
  const shouldLike = pageAllows && !input.isFromPage && Boolean(input.page?.auto_like_comments ?? input.settings.comment.autoLike);
  const shouldReply = pageAllows && !input.isFromPage && Boolean(input.page?.auto_reply_comments ?? input.settings.comment.autoReply);
  const intent = detectIntent(text);
  const reply =
    shouldReply && ["price_inquiry", "quotation_request", "discount_question", "phone_provided"].includes(intent)
      ? "Dạ em đã inbox thông tin chi tiết cho anh/chị rồi ạ."
      : shouldReply
        ? "Dạ em cảm ơn anh/chị đã quan tâm. Em sẽ hỗ trợ mình ngay ạ."
        : null;

  return {
    intent,
    hasPhone: phone.valid,
    hasBlacklistedKeyword: Boolean(keyword),
    isSpam,
    shouldHide,
    shouldLike,
    shouldReply,
    reply,
    reasons: [phone.valid ? "phone" : null, keyword ? `keyword:${keyword}` : null, isSpam ? "spam" : null].filter(Boolean) as string[]
  };
}
