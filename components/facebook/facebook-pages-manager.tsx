"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { CheckCircle2, Facebook, HelpCircle, Loader2, Plug, RefreshCw, Settings, Unplug, XCircle } from "lucide-react";
import { AI_MODELS } from "@/lib/ai/models";
import { COMMENT_HIDE_MODE_LABELS, DEFAULT_COMMENT_HIDE_MODE, normalizeCommentHideMode } from "@/lib/facebook/comment-hide-mode";
import type { FacebookPage } from "@/lib/types";

type SetupStatus = Record<string, string> & { redirectUri?: string };
type OAuthPage = {
  id: string;
  name: string;
  tasks: string[];
  avatar_url: string | null;
  source?: "oauth_granted" | "me_accounts" | "business_owned_pages" | "business_client_pages";
  business_name?: string | null;
  has_token?: boolean;
  token_status?: "ready" | "business_permission_no_page_token";
};
type CheckResult = {
  ok: boolean;
  status?: {
    facebookPage: string;
    pageToken?: string;
    messenger: string;
    webhookSubscription?: string;
    readComments: string;
    replyComments: string;
    hideComments: string;
    missingPermissions: string[];
  };
  diagnostics?: {
    tokenValid: boolean;
    appSubscribed?: boolean;
    subscribed: boolean;
    subscribedFields: string[];
    endpointReachable: boolean;
    subscribeAttempted?: boolean;
    subscribeError?: string | null;
    subscribeResponse?: unknown;
  };
  error?: string;
};
type PageDiagnostic = {
  page_id: string;
  tokenValid: string;
  tokenPageIdMatch?: string;
  endpointReachable: string;
  appSubscription: string;
  messagesSubscribed?: string;
  liveWebhookStatus?: "waiting" | "received" | "none";
  subscribedFields: string[];
  lastWebhookAt: string | null;
  lastEventType: string | null;
  lastSenderId: string;
  lastMessageId: string;
  lastMessagePreview?: string;
  lastDbWrite: string;
  lastDbError: string | null;
  lastTime: string | null;
};
type GlobalDiagnostic = {
  received_at?: string | null;
  entry_id?: string | null;
  sender_id?: string | null;
  recipient_id?: string | null;
  message_mid?: string | null;
  message_text_preview?: string | null;
  mapped_page?: string | null;
  db_write?: string | null;
  error?: string | null;
  synthetic?: boolean;
} | null;
type ConnectResult = {
  page_id: string;
  page_name: string;
  status: "success" | "failed";
  stage: string;
  reason: string;
  missing_permissions: string[];
};

const setupLabels: Record<string, string> = {
  appId: "Facebook App ID",
  appSecret: "Facebook App Secret",
  verifyToken: "Webhook Verify Token",
  graphApiVersion: "Graph API Version",
  appUrl: "APP URL",
  supabase: "Supabase",
  facebookLogin: "Facebook Login",
  facebookPage: "Facebook Page",
  webhook: "Webhook",
  messenger: "Messenger",
  commentAutomation: "Comment Automation",
  openai: "OpenAI",
  gemini: "Gemini"
};

const toggleLabels: Array<[keyof FacebookPage, string]> = [
  ["automation_enabled", "Automation"],
  ["auto_reply_messenger", "Messenger"],
  ["auto_like_comments", "Auto Like Comment"],
  ["auto_reply_comments", "Auto Reply Comment"],
  ["auto_hide_comments", "Auto Hide Comment"],
  ["hide_phone_comments", "Ẩn bình luận có SĐT"],
  ["hide_keyword_comments", "Ẩn từ khóa chặn"]
];

const commentHideModeLabels = COMMENT_HIDE_MODE_LABELS;

export function FacebookPagesManager() {
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [setup, setSetup] = useState<SetupStatus>({});
  const [oauthPages, setOauthPages] = useState<OAuthPage[]>([]);
  const [oauthWarnings, setOauthWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState({ page_id: "", page_name: "", page_access_token: "" });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [checks, setChecks] = useState<Record<string, CheckResult>>({});
  const [diagnostics, setDiagnostics] = useState<Record<string, PageDiagnostic>>({});
  const [globalDiagnostic, setGlobalDiagnostic] = useState<GlobalDiagnostic>(null);
  const [connectResults, setConnectResults] = useState<ConnectResult[]>([]);
  const [settingsPage, setSettingsPage] = useState<FacebookPage | null>(null);
  const selectedCount = selected.length;
  const totalOauthPages = oauthPages.length;

  const oauthSession = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("oauth_session");
  }, []);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/facebook/pages", { cache: "no-store" });
    const data = await response.json();
    setPages(data.pages ?? []);
    setSetup(data.setup ?? {});
    setDiagnostics(Object.fromEntries(((data.diagnostics ?? []) as PageDiagnostic[]).map((item) => [item.page_id, item])));
    setGlobalDiagnostic(data.globalDiagnostic ?? null);
    setLoading(false);
  }

  async function loadOAuthPages(sessionId: string) {
    const response = await fetch(`/api/facebook/oauth/pages?session=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const data = await response.json();
    setOauthPages(data.pages ?? []);
    setOauthWarnings(data.warnings ?? []);
    setSelected((data.pages ?? []).map((page: OAuthPage) => page.id));
  }

  useEffect(() => {
    void load();
    if (oauthSession) void loadOAuthPages(oauthSession);
  }, [oauthSession]);

  async function saveManual() {
    if (!form.page_id.trim() || !form.page_name.trim()) return setMessage({ type: "error", text: "Vui lòng nhập Page ID và tên Page." });
    setWorking("manual");
    const response = await fetch("/api/facebook/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    setWorking(null);
    if (!response.ok) return setMessage({ type: "error", text: "Không lưu được Page." });
    setForm({ page_id: "", page_name: "", page_access_token: "" });
    setMessage({ type: "success", text: "Đã lưu Page." });
    await load();
  }

  async function connectSelected() {
    if (!oauthSession || selected.length === 0) return;
    setWorking("oauth");
    setConnectResults([]);
    const response = await fetch("/api/facebook/oauth/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: oauthSession, pageIds: selected })
    });
    const data = await response.json().catch(() => ({}));
    setWorking(null);
    setConnectResults(data.results ?? []);
    if (Array.isArray(data.pages)) setPages(data.pages);
    if (!response.ok) {
      const noTokenCount = Array.isArray(data.rejected) ? data.rejected.filter((item: { missing_permissions?: string[] }) => item.missing_permissions?.includes("page_access_token")).length : 0;
      return setMessage({
        type: "error",
        text: noTokenCount ? "Một số Page có quyền Business nhưng chưa lấy được Page token. Vui lòng cấp thêm quyền hoặc kết nối Page có token hợp lệ." : "Không kết nối được Page đã chọn."
      });
    }
    setOauthPages([]);
    setSelected([]);
    setMessage({ type: "success", text: "Đã kết nối Page đã chọn." });
    window.history.replaceState(null, "", "/facebook-pages");
    await load();
  }

  function selectAllOAuthPages() {
    setSelected(oauthPages.map((page) => page.id));
  }

  function clearSelectedOAuthPages() {
    setSelected([]);
  }

  async function remove(pageId: string) {
    if (!window.confirm("Ngắt kết nối Page này? Lịch sử hội thoại và tin nhắn sẽ được giữ lại.")) return;
    setWorking(pageId);
    const response = await fetch(`/api/facebook/pages?page_id=${encodeURIComponent(pageId)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setMessage({ type: "error", text: data.error ?? "Không ngắt kết nối được Page." });
    else setMessage({ type: data.unsubscribeError ? "error" : "success", text: data.unsubscribeError ? `Đã ngắt kết nối nhưng unsubscribe webhook lỗi: ${data.unsubscribeError}` : "Đã ngắt kết nối Page." });
    setWorking(null);
    await load();
  }

  async function check(page: FacebookPage, action: "check" | "subscribe" | "wait_live" = "check") {
    setWorking(`${action}:${page.page_id}`);
    const response = await fetch("/api/facebook/pages", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_id: page.page_id, action })
    });
    const data = await response.json().catch(() => ({}));
    setChecks((current) => ({ ...current, [page.page_id]: data }));
    if (action === "wait_live") setMessage({ type: "success", text: "Dang cho tin nhan that..." });
    setWorking(null);
    await load();
  }

  async function sync(page: FacebookPage) {
    setWorking(`sync:${page.page_id}`);
    const response = await fetch("/api/facebook/pages", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_id: page.page_id })
    });
    const data = await response.json().catch(() => ({}));
    setChecks((current) => ({ ...current, [page.page_id]: data }));
    setMessage(response.ok ? { type: "success", text: "Đã đồng bộ Page." } : { type: "error", text: data.error ?? "Không đồng bộ được Page." });
    setWorking(null);
    await load();
  }

  async function toggle(page: FacebookPage, key: keyof FacebookPage, value: boolean) {
    setPages((current) => current.map((item) => (item.page_id === page.page_id ? { ...item, [key]: value } : item)));
    const response = await fetch("/api/facebook/pages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_id: page.page_id, page_name: page.page_name, [key]: value })
    });
    if (!response.ok) setMessage({ type: "error", text: "Không lưu được cấu hình Page." });
    await load();
  }

  async function updateCommentHideMode(page: FacebookPage, commentHideMode: NonNullable<FacebookPage["comment_hide_mode"]>) {
    setPages((current) => current.map((item) => (item.page_id === page.page_id ? { ...item, comment_hide_mode: commentHideMode } : item)));
    const response = await fetch("/api/facebook/pages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_id: page.page_id, page_name: page.page_name, comment_hide_mode: commentHideMode })
    });
    if (!response.ok) setMessage({ type: "error", text: "Không lưu được chế độ ẩn bình luận. Hãy chạy migration Supabase mới rồi thử lại." });
    await load();
  }

  async function saveSettings(page: FacebookPage) {
    setWorking(`settings:${page.page_id}`);
    const response = await fetch("/api/facebook/pages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page_id: page.page_id,
        page_name: page.page_name,
        automation_enabled: page.automation_enabled,
        auto_reply_messenger: page.auto_reply_messenger,
        ai_sales_mode: page.ai_sales_mode,
        auto_handoff: page.auto_handoff,
        auto_like_comments: page.auto_like_comments,
        auto_reply_comments: page.auto_reply_comments,
        auto_hide_comments: page.auto_hide_comments,
        comment_hide_mode: page.comment_hide_mode,
        hide_phone_comments: page.hide_phone_comments,
        hide_keyword_comments: page.hide_keyword_comments,
        ai_reply_delay_seconds: page.ai_reply_delay_seconds ?? 3,
        ai_provider: page.ai_provider ?? undefined,
        ai_model: page.ai_model ?? "",
        ai_fallback_provider: page.ai_fallback_provider ?? undefined,
        ai_provider_fallback_enabled: page.ai_provider_fallback_enabled ?? false,
        ai_business_name: page.ai_business_name ?? "",
        ai_system_prompt: page.ai_system_prompt ?? "",
        ai_tone: page.ai_tone ?? "",
        ai_sales_goal: page.ai_sales_goal ?? "",
        ai_product_context: page.ai_product_context ?? "",
        ai_faq_context: page.ai_faq_context ?? "",
        ai_allowed_topics: page.ai_allowed_topics ?? "",
        ai_fallback_message: page.ai_fallback_message ?? "",
        chat_rules: page.chat_rules ?? {},
        blocked_keywords: page.blocked_keywords ?? []
      })
    });
    const data = await response.json().catch(() => ({}));
    setWorking(null);
    if (!response.ok) return setMessage({ type: "error", text: data.error ?? "Không lưu được cài đặt Page." });
    setSettingsPage(null);
    setMessage({ type: "success", text: "Đã lưu cài đặt Page." });
    await load();
  }

  return (
    <div className="space-y-5">
      <section className="panel rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Kết nối Facebook</h2>
            <p className="mt-1 text-sm text-muted">Đăng nhập Facebook để chọn một hoặc nhiều Page bạn quản lý.</p>
          </div>
          <a href="/api/facebook/oauth/start" className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white">
            <Facebook className="h-4 w-4" />
            Kết nối với Facebook
          </a>
        </div>
        {message ? (
          <div className={message.type === "success" ? "mt-4 rounded-md border border-leaf/30 bg-green-50 px-3 py-2 text-sm text-leaf" : "mt-4 rounded-md border border-coral/30 bg-red-50 px-3 py-2 text-sm text-coral"}>
            {message.text}
          </div>
        ) : null}
      </section>

      {oauthPages.length ? (
        <section className="panel rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Chọn Page để kết nối</h2>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <span className="mr-1 text-sm text-muted">Đã chọn {selectedCount}/{totalOauthPages} Page</span>
              <button
                type="button"
                onClick={selectAllOAuthPages}
                disabled={selectedCount === totalOauthPages}
                className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                Chọn tất cả
              </button>
              <button
                type="button"
                onClick={clearSelectedOAuthPages}
                disabled={selectedCount === 0}
                className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" />
                Bỏ chọn tất cả
              </button>
            <button onClick={() => void connectSelected()} disabled={working === "oauth" || selectedCount === 0} className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
              {working === "oauth" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              Kết nối Page đã chọn
            </button>
            </div>
          </div>
          {oauthWarnings.length ? <div className="mt-3 rounded-md border border-coral/30 bg-red-50 px-3 py-2 text-sm text-coral">{oauthWarnings.join(" ")}</div> : null}
          {connectResults.length ? (
            <div className="mt-3 grid gap-2">
              {connectResults.map((result) => (
                <div
                  key={`${result.page_id}-${result.stage}`}
                  className={result.status === "success" ? "rounded-md border border-leaf/30 bg-green-50 px-3 py-2 text-sm text-leaf" : "rounded-md border border-coral/30 bg-red-50 px-3 py-2 text-sm text-coral"}
                >
                  <span className="font-medium">{result.page_name}</span>: {result.status === "success" ? "Kết nối thành công" : result.reason}
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {oauthPages.map((page) => (
              <label key={page.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-3">
                <input type="checkbox" checked={selected.includes(page.id)} onChange={(event) => setSelected((current) => (event.target.checked ? [...current, page.id] : current.filter((id) => id !== page.id)))} />
                <Avatar url={page.avatar_url} name={page.name} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{page.name}</span>
                  <span className="block text-xs text-muted">ID {page.id}</span>
                  <span className="block text-xs text-muted">{sourceLabel(page)}</span>
                  <span className={page.has_token ? "block text-xs text-leaf" : "block text-xs text-coral"}>{tokenStatusLabel(page)}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel rounded-lg p-4">
        <h2 className="font-semibold">Trạng thái thiết lập Facebook</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(setupLabels).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm">
              <span>{label}</span>
              <StatusText value={setup[key]} />
            </div>
          ))}
        </div>
      </section>

      <section className="panel rounded-lg p-4">
        <h2 className="font-semibold">Webhook request cuoi toan he thong</h2>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Received" value={formatDiagnosticTime(globalDiagnostic?.received_at)} />
          <Info label="entry.id" value={globalDiagnostic?.entry_id ?? "-"} />
          <Info label="sender.id" value={globalDiagnostic?.sender_id ?? "-"} />
          <Info label="recipient.id" value={globalDiagnostic?.recipient_id ?? "-"} />
          <Info label="message.mid" value={globalDiagnostic?.message_mid ?? "-"} />
          <Info label="Text preview" value={globalDiagnostic?.message_text_preview ?? "-"} />
          <Info label="Mapped Page" value={globalDiagnostic?.mapped_page ?? "-"} />
          <Info label="DB write" value={globalDiagnostic?.db_write ?? "-"} />
          <Info label="Error" value={globalDiagnostic?.error ?? "-"} />
          <Info label="Synthetic/manual" value={globalDiagnostic?.synthetic ? "YES" : "NO"} />
        </div>
      </section>

      <section className="panel rounded-lg p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Page đã kết nối</h2>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
            <RefreshCw className="h-4 w-4" />
            Đồng bộ
          </button>
        </div>
        {loading ? <div className="py-8 text-sm text-muted">Đang tải dữ liệu...</div> : null}
        {!loading && pages.length === 0 ? <div className="py-8 text-sm text-muted">Chưa có Page nào được kết nối.</div> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {pages.map((page) => (
            <article key={page.page_id} className="rounded-lg border border-line p-4">
              <div className="flex items-start gap-3">
                <Avatar url={page.page_avatar_url ?? null} name={page.page_name} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{page.page_name}</h3>
                  <p className="text-sm text-muted">ID {page.page_id}</p>
                  <p className="text-sm text-muted">Token {page.token_mask || "chưa nhập"}</p>
                </div>
                <StatusText value={page.connected ? "Đã kết nối" : "Chưa cấu hình"} />
              </div>

              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <Info label="Webhook" value={webhookStatusLabel(page)} />
                <Info label="Lần nhận webhook" value={page.last_webhook_at ? new Date(page.last_webhook_at).toLocaleString("vi-VN") : "Chưa nhận webhook"} />
                <label className="rounded-md bg-slate-50 px-3 py-2 sm:col-span-2">
                  <span className="text-xs text-muted">Chế độ ẩn bình luận</span>
                  <select
                    value={normalizeCommentHideMode(page.comment_hide_mode) ?? DEFAULT_COMMENT_HIDE_MODE}
                    onChange={(event) => void updateCommentHideMode(page, event.target.value as NonNullable<FacebookPage["comment_hide_mode"]>)}
                    className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2"
                  >
                    {Object.entries(commentHideModeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {missingCommentPermissions(page).length ? (
                    <span className="mt-1 block text-xs text-coral">Thiếu quyền: {missingCommentPermissions(page).join(", ")}</span>
                  ) : null}
                </label>
                {toggleLabels.map(([key, label]) => (
                  <label key={String(key)} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                    <span>{label}</span>
                    <input type="checkbox" checked={Boolean(page[key])} onChange={(event) => void toggle(page, key, event.target.checked)} />
                  </label>
                ))}
              </div>

              {checks[page.page_id]?.status ? <ConnectionCheck result={checks[page.page_id]} /> : null}
              <FacebookDiagnosticPanel page={page} diagnostic={diagnostics[page.page_id]} check={checks[page.page_id]} />

              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => void check(page)} disabled={working === `check:${page.page_id}`} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-60">
                  {working === `check:${page.page_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Kiểm tra kết nối
                </button>
                <button onClick={() => void check(page)} disabled={working === `check:${page.page_id}`} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-60">
                  {working === `check:${page.page_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Kiểm tra Page subscription
                </button>
                <button onClick={() => void check(page, "subscribe")} disabled={working === `subscribe:${page.page_id}`} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-60">
                  {working === `subscribe:${page.page_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Subscribe lại messages
                </button>
                <button onClick={() => void check(page, "wait_live")} disabled={working === `wait_live:${page.page_id}`} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-60">
                  {working === `wait_live:${page.page_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Kiem tra live webhook
                </button>
                <button onClick={() => void sync(page)} disabled={working === `sync:${page.page_id}`} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-60">
                  {working === `sync:${page.page_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Đồng bộ
                </button>
                <button onClick={() => setSettingsPage(page)} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
                  <Settings className="h-4 w-4" />
                  Cài đặt
                </button>
                <button onClick={() => void remove(page.page_id)} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-coral">
                  {working === page.page_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                  Ngắt kết nối
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <details className="panel rounded-lg p-4">
        <summary className="cursor-pointer font-semibold">Kết nối thủ công / Nâng cao</summary>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Field label="Page ID" value={form.page_id} onChange={(page_id) => setForm({ ...form, page_id })} />
          <Field label="Tên Page" value={form.page_name} onChange={(page_name) => setForm({ ...form, page_name })} />
          <Field label="Page Access Token" type="password" value={form.page_access_token} onChange={(page_access_token) => setForm({ ...form, page_access_token })} />
        </div>
        <button onClick={() => void saveManual()} disabled={working === "manual"} className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
          {working === "manual" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
          Lưu Page
        </button>
      </details>
      {settingsPage ? (
        <PageSettingsModal
          page={settingsPage}
          working={working === `settings:${settingsPage.page_id}`}
          onClose={() => setSettingsPage(null)}
          onChange={setSettingsPage}
          onSave={() => void saveSettings(settingsPage)}
        />
      ) : null}
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  return url ? (
    <Image src={url} alt="" width={48} height={48} unoptimized className="h-12 w-12 rounded-full object-cover" />
  ) : (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold">{name.slice(0, 2).toUpperCase()}</div>
  );
}

function StatusText({ value }: { value?: string }) {
  const ok = value === "Đã cấu hình" || value === "Đã kết nối" || value === "Sẵn sàng";
  const statusOk = ok || value === "Configured" || value === "Connected" || value === "Ready";
  const Icon = statusOk ? CheckCircle2 : XCircle;
  return (
    <span className={statusOk ? "inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-leaf" : "inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-coral"}>
      <Icon className="h-3.5 w-3.5" />
      {value || "Chưa cấu hình"}
    </span>
  );
}

function sourceLabel(page: OAuthPage) {
  if (page.source === "oauth_granted") return "OAuth granted Page";
  if (page.source === "business_owned_pages") return `Business owned_pages${page.business_name ? `: ${page.business_name}` : ""}`;
  if (page.source === "business_client_pages") return `Business client_pages${page.business_name ? `: ${page.business_name}` : ""}`;
  return "/me/accounts";
}

function tokenStatusLabel(page: OAuthPage) {
  if (page.has_token) return "Page token ready";
  return "Có quyền Business nhưng chưa lấy được Page token";
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

function ConnectionCheck({ result }: { result: CheckResult }) {
  const status = result.status;
  if (!status) return null;
  return (
    <div className="mt-4 rounded-md border border-line p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <Info label="Facebook Page" value={status.facebookPage} />
        <Info label="Page Token" value={status.pageToken ?? "-"} />
        <Info label="Messenger" value={status.messenger} />
        <Info label="Webhook" value={status.webhookSubscription ?? "-"} />
        <Info label="Đọc bình luận" value={status.readComments} />
        <Info label="Trả lời bình luận" value={status.replyComments} />
        <Info label="Ẩn bình luận" value={status.hideComments} />
      </div>
      {status.missingPermissions.length ? <p className="mt-3 text-coral">Thiếu quyền: {status.missingPermissions.join(", ")}</p> : null}
    </div>
  );
}

function FacebookDiagnosticPanel({ page, diagnostic, check }: { page: FacebookPage; diagnostic?: PageDiagnostic; check?: CheckResult }) {
  const subscribedFields = check?.diagnostics?.subscribedFields ?? diagnostic?.subscribedFields ?? [];
  return (
    <div className="mt-4 rounded-md border border-line p-3 text-sm">
      <div className="mb-2 font-medium">Chẩn đoán Facebook</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Info label="Page ID" value={page.page_id} />
        <Info label="Token valid" value={check?.diagnostics ? yesNo(check.diagnostics.tokenValid) : diagnostic?.tokenValid ?? "-"} />
        <Info label="Token Page match" value={diagnostic?.tokenPageIdMatch ?? (check?.diagnostics ? yesNo(check.diagnostics.tokenValid) : "-")} />
        <Info label="Webhook endpoint" value={check?.diagnostics ? yesNo(check.diagnostics.endpointReachable) : diagnostic?.endpointReachable ?? "-"} />
        <Info label="App subscription" value={check?.diagnostics ? yesNo(subscribedFields.length > 0) : diagnostic?.appSubscription ?? "-"} />
        <Info label="Messages webhook" value={check?.diagnostics ? yesNo(check.diagnostics.subscribed) : diagnostic?.messagesSubscribed ?? "-"} />
        <Info label="Subscribed fields" value={subscribedFields.length ? subscribedFields.join(", ") : "-"} />
        <Info label="Live webhook" value={diagnostic?.liveWebhookStatus === "waiting" ? "Dang cho tin nhan that" : diagnostic?.liveWebhookStatus === "received" ? "Da nhan webhook that" : "-"} />
        <Info label="Lần webhook cuối" value={formatDiagnosticTime(diagnostic?.lastWebhookAt)} />
        <Info label="Event cuối" value={diagnostic?.lastEventType ?? "-"} />
        <Info label="Sender ID cuối" value={diagnostic?.lastSenderId || "-"} />
        <Info label="Message ID cuối" value={diagnostic?.lastMessageId || "-"} />
        <Info label="Text preview" value={diagnostic?.lastMessagePreview || "-"} />
        <Info label="DB write cuối" value={diagnostic?.lastDbWrite ?? "-"} />
        <Info label="Thời gian cuối" value={formatDiagnosticTime(diagnostic?.lastTime)} />
        <Info label="DB error" value={diagnostic?.lastDbError ?? "-"} />
        <Info label="Subscribe error" value={check?.diagnostics?.subscribeError ?? "-"} />
        <Info label="Meta subscribe response" value={check?.diagnostics?.subscribeResponse ? JSON.stringify(check.diagnostics.subscribeResponse).slice(0, 120) : "-"} />
      </div>
    </div>
  );
}

function yesNo(value: boolean) {
  return value ? "Có" : "Không";
}

function formatDiagnosticTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("vi-VN") : "-";
}

function PageSettingsModal({
  page,
  working,
  onClose,
  onChange,
  onSave
}: {
  page: FacebookPage;
  working: boolean;
  onClose: () => void;
  onChange: (page: FacebookPage) => void;
  onSave: () => void;
}) {
  const update = <K extends keyof FacebookPage>(key: K, value: FacebookPage[K]) => onChange({ ...page, [key]: value });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
          <div>
            <h2 className="font-semibold">Cài đặt Page</h2>
            <p className="mt-1 text-sm text-muted">
              {page.page_name} - {page.page_id}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md border border-line px-3 py-2 text-sm">
            Đóng
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <SettingsGroup title="Messenger">
            <Toggle label="Messenger bật" checked={page.auto_reply_messenger} onChange={(value) => update("auto_reply_messenger", value)} />
            <Toggle label="AI tự trả lời" checked={page.ai_sales_mode} onChange={(value) => update("ai_sales_mode", value)} />
            <label className="block text-sm">
              <HelpLabel label="AI reply delay" help="Gom nhiều tin khách gửi liên tục trong khoảng delay để AI chỉ trả lời một lần." />
              <select value={page.ai_reply_delay_seconds ?? 3} onChange={(event) => update("ai_reply_delay_seconds", Number(event.target.value))} className="w-full rounded-md border border-line px-3 py-2">
                {[0, 3, 5, 10].map((value) => (
                  <option key={value} value={value}>
                    {value}s
                  </option>
                ))}
              </select>
            </label>
            <TextArea label="Fallback message" value={page.ai_fallback_message ?? ""} onChange={(value) => update("ai_fallback_message", value)} />
          </SettingsGroup>

          <SettingsGroup title="AI">
            <label className="block text-sm">
              <HelpLabel label="Nhà cung cấp AI" help="Page này sẽ chỉ dùng provider đã chọn, trừ khi bật fallback provider." />
              <select value={page.ai_provider ?? ""} onChange={(event) => update("ai_provider", (event.target.value || null) as FacebookPage["ai_provider"])} className="w-full rounded-md border border-line px-3 py-2">
                <option value="">Chọn provider cho Page</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
            </label>
            <label className="block text-sm">
              <HelpLabel label="Model" help="Model được lưu riêng cho Page này." />
              <select value={page.ai_model ?? ""} onChange={(event) => update("ai_model", event.target.value)} className="w-full rounded-md border border-line px-3 py-2">
                <option value="">Mặc định theo hệ thống</option>
                {AI_MODELS[page.ai_provider ?? "openai"].map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <Toggle label="Bật provider fallback" checked={Boolean(page.ai_provider_fallback_enabled)} onChange={(value) => update("ai_provider_fallback_enabled", value)} />
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Provider fallback</span>
              <select value={page.ai_fallback_provider ?? ((page.ai_provider ?? "openai") === "gemini" ? "openai" : "gemini")} onChange={(event) => update("ai_fallback_provider", event.target.value as FacebookPage["ai_fallback_provider"])} className="w-full rounded-md border border-line px-3 py-2">
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
            </label>
            <Field label="Tên doanh nghiệp" value={page.ai_business_name ?? ""} onChange={(value) => update("ai_business_name", value)} />
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Phong cách trả lời</span>
              <select value={page.ai_tone ?? ""} onChange={(event) => update("ai_tone", event.target.value)} className="w-full rounded-md border border-line px-3 py-2">
                {["thân thiện", "chuyên nghiệp", "ngắn gọn", "tư vấn bán hàng", "kỹ thuật", "custom"].map((tone) => (
                  <option key={tone} value={tone}>
                    {tone}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Vai trò AI" value={page.ai_system_prompt?.split("\n")[0] ?? ""} onChange={(value) => update("ai_system_prompt", value)} />
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Mục tiêu</span>
              <select value={page.ai_sales_goal ?? ""} onChange={(event) => update("ai_sales_goal", event.target.value)} className="w-full rounded-md border border-line px-3 py-2">
                {["tư vấn", "lấy SĐT", "lấy địa chỉ", "chốt đơn", "tuyển đại lý", "chăm sóc lại", "custom"].map((goal) => (
                  <option key={goal} value={goal}>
                    {goal}
                  </option>
                ))}
              </select>
            </label>
            <TextArea label="System prompt" value={page.ai_system_prompt ?? ""} onChange={(value) => update("ai_system_prompt", value)} />
            <TextArea label="Kiến thức Page / sản phẩm / bảng giá / chính sách" value={page.ai_product_context ?? ""} onChange={(value) => update("ai_product_context", value)} />
            <TextArea label="FAQ / thông tin không được phép bịa" value={page.ai_faq_context ?? ""} onChange={(value) => update("ai_faq_context", value)} />
            <TextArea label="Chủ đề được phép trả lời" value={page.ai_allowed_topics ?? ""} onChange={(value) => update("ai_allowed_topics", value)} />
          </SettingsGroup>

          <SettingsGroup title="Chat Rules">
            <Toggle label="AI Auto Reply" checked={page.chat_rules?.ai_auto_reply ?? true} onChange={(value) => update("chat_rules", { ...(page.chat_rules ?? {}), ai_auto_reply: value })} />
            <Toggle label="Human takeover mặc định" checked={page.chat_rules?.human_takeover_default ?? false} onChange={(value) => update("chat_rules", { ...(page.chat_rules ?? {}), human_takeover_default: value })} />
            <Field label="Giới hạn độ dài trả lời" type="number" value={String(page.chat_rules?.max_response_length ?? 900)} onChange={(value) => update("chat_rules", { ...(page.chat_rules ?? {}), max_response_length: Number(value) })} />
            <Toggle label="Cho phép emoji" checked={page.chat_rules?.allow_emoji ?? true} onChange={(value) => update("chat_rules", { ...(page.chat_rules ?? {}), allow_emoji: value })} />
            <Toggle label="Có hỏi SĐT" checked={page.chat_rules?.ask_phone ?? true} onChange={(value) => update("chat_rules", { ...(page.chat_rules ?? {}), ask_phone: value })} />
            <Toggle label="Có hỏi địa chỉ" checked={page.chat_rules?.ask_address ?? true} onChange={(value) => update("chat_rules", { ...(page.chat_rules ?? {}), ask_address: value })} />
            <Toggle label="Có chốt đơn tự động" checked={page.chat_rules?.auto_close_order ?? false} onChange={(value) => update("chat_rules", { ...(page.chat_rules ?? {}), auto_close_order: value })} />
            <Toggle label="Có gửi giá tự động" checked={page.chat_rules?.auto_send_price ?? false} onChange={(value) => update("chat_rules", { ...(page.chat_rules ?? {}), auto_send_price: value })} />
            <Toggle label="Trả lời ngoài giờ" checked={page.chat_rules?.after_hours_reply ?? true} onChange={(value) => update("chat_rules", { ...(page.chat_rules ?? {}), after_hours_reply: value })} />
            <Field label="Giờ hoạt động" value={page.chat_rules?.business_hours ?? "08:00-21:00"} onChange={(value) => update("chat_rules", { ...(page.chat_rules ?? {}), business_hours: value })} />
            <TextArea label="Fallback ngoài giờ" value={page.chat_rules?.after_hours_fallback ?? ""} onChange={(value) => update("chat_rules", { ...(page.chat_rules ?? {}), after_hours_fallback: value })} />
            <Field label="Max số lần AI follow-up" type="number" value={String(page.chat_rules?.max_ai_followups ?? 4)} onChange={(value) => update("chat_rules", { ...(page.chat_rules ?? {}), max_ai_followups: Number(value) })} />
            <Toggle label="Dừng AI nếu khách nói không quan tâm" checked={page.chat_rules?.stop_on_not_interested ?? true} onChange={(value) => update("chat_rules", { ...(page.chat_rules ?? {}), stop_on_not_interested: value })} />
            <Toggle label="Dừng AI nếu khách yêu cầu gặp nhân viên" checked={page.chat_rules?.stop_on_human_request ?? true} onChange={(value) => update("chat_rules", { ...(page.chat_rules ?? {}), stop_on_human_request: value })} />
          </SettingsGroup>

          <SettingsGroup title="Comment">
            <Toggle label="Automation bật" checked={page.automation_enabled} onChange={(value) => update("automation_enabled", value)} />
            <Toggle label="Auto like comment" checked={page.auto_like_comments} onChange={(value) => update("auto_like_comments", value)} />
            <Toggle label="Auto reply comment" checked={page.auto_reply_comments} onChange={(value) => update("auto_reply_comments", value)} />
            <Toggle label="Auto hide comment" checked={page.auto_hide_comments} onChange={(value) => update("auto_hide_comments", value)} />
            <label className="block text-sm">
              <HelpLabel label="Chế độ ẩn bình luận" help="hide_all ẩn tất cả, phone_only chỉ ẩn bình luận có SĐT, blocked_keywords ẩn theo từ khóa." />
              <select value={normalizeCommentHideMode(page.comment_hide_mode) ?? DEFAULT_COMMENT_HIDE_MODE} onChange={(event) => update("comment_hide_mode", event.target.value as FacebookPage["comment_hide_mode"])} className="w-full rounded-md border border-line px-3 py-2">
                {Object.entries(commentHideModeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <TextArea label="Từ khóa chặn" value={(page.blocked_keywords ?? []).join("\n")} onChange={(value) => update("blocked_keywords", value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean))} />
          </SettingsGroup>
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-line pt-3">
          <button onClick={onClose} className="rounded-md border border-line px-3 py-2 text-sm">
            Hủy
          </button>
          <button onClick={onSave} disabled={working} className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
            Lưu cài đặt
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-md border border-line p-3">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  );
}

function HelpLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="mb-1 flex items-center gap-1 text-muted">
      {label}
      <HelpCircle className="h-3.5 w-3.5" aria-label={help}>
        <title>{help}</title>
      </HelpCircle>
    </span>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="w-full rounded-md border border-line px-3 py-2" />
    </label>
  );
}

function missingCommentPermissions(page: FacebookPage) {
  const missing = page.missing_permissions ?? [];
  return missing.filter((permission) => permission === "pages_manage_engagement" || permission === "pages_read_user_content");
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-line px-3 py-2" />
    </label>
  );
}

function webhookStatusLabel(page: FacebookPage) {
  if (page.last_webhook_at) return "Da nhan event";
  if (page.webhook_status === "active") return "Endpoint/subscription da cau hinh";
  if (page.webhook_status === "error") return "Can kiem tra subscription";
  return "Chua tung nhan webhook";
}

function webhookLabel(page: FacebookPage) {
  if (page.webhook_status === "active") return "Webhook hoạt động";
  if (page.webhook_status === "error") return "Webhook lỗi";
  return "Chưa nhận webhook";
}
