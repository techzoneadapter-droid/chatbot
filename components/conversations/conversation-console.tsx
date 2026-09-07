"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Bot, Copy, ExternalLink, Loader2, MoreHorizontal, PackagePlus, Phone, RefreshCw, Search, Send, Tag, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Conversation, ConversationState, FacebookPage, Message } from "@/lib/types";

interface Row extends Conversation {
  state: ConversationState;
  messages: Message[];
  page?: FacebookPage | null;
}

type Filter = "all" | "unread" | "ai" | "human" | "lead" | "purchased" | "missing_phone" | "missing_address";
type RealtimeStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

const PAGE_SIZE = 40;
const MESSAGE_PAGE_SIZE = 50;

export function ConversationConsole() {
  const [rows, setRows] = useState<Row[]>([]);
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [pageFilter, setPageFilter] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [openaiConfigured, setOpenaiConfigured] = useState(true);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [aiTypingIds, setAiTypingIds] = useState<string[]>([]);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const realtimeStatusRef = useRef<RealtimeStatus>("connecting");
  const pagesRef = useRef<FacebookPage[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const pageFilterRef = useRef("all");
  const debouncedQueryRef = useRef("");
  const selectedIdRef = useRef<string | null>(null);
  const rowsRef = useRef<Row[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const loadedMessageIdsRef = useRef<Set<string>>(new Set());

  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const selectedProvider = selected?.page?.ai_provider ?? null;
  const selectedProviderConfigured = selectedProvider === "gemini" ? geminiConfigured : selectedProvider === "openai" ? openaiConfigured : openaiConfigured || geminiConfigured;
  const providerWarning =
    selected && !selectedProviderConfigured
      ? selectedProvider
        ? `${providerLabel(selectedProvider)} chưa được cấu hình`
        : "Chưa chọn nhà cung cấp AI cho Page này"
      : null;

  const load = useCallback(async (mode: "replace" | "append" = "replace") => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    const cursor = nextCursorRef.current;
    const currentPageFilter = pageFilterRef.current;
    const currentQuery = debouncedQueryRef.current;
    if (mode === "append" && cursor) params.set("cursor", cursor);
    if (currentPageFilter !== "all") params.set("page_id", currentPageFilter);
    if (currentQuery.trim()) params.set("q", currentQuery.trim());
    const response = await fetch(`/api/conversations?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Không tải được Inbox");
    const conversations = (data.conversations ?? []) as Row[];
    setRows((current) => (mode === "append" ? mergeRows(current, conversations) : conversations));
    setPages(data.pages ?? []);
    pagesRef.current = data.pages ?? [];
    setOpenaiConfigured(Boolean(data.providerStatus?.openai));
    setGeminiConfigured(Boolean(data.providerStatus?.gemini));
    nextCursorRef.current = data.nextCursor ?? null;
    setNextCursor(nextCursorRef.current);
    setSelectedId((current) => (current && (mode === "append" || conversations.some((row) => row.id === current)) ? current : conversations[0]?.id ?? current));
  }, []);

  useEffect(() => {
    pageFilterRef.current = pageFilter;
    debouncedQueryRef.current = debouncedQuery;
    nextCursorRef.current = null;
    setNextCursor(null);
    void load("replace").catch((err) => setError(err instanceof Error ? err.message : "Không tải được Inbox"));
  }, [debouncedQuery, load, pageFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    realtimeStatusRef.current = realtimeStatus;
  }, [realtimeStatus]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setRealtimeStatus("disconnected");
      const timer = window.setInterval(() => void load("replace"), 25000);
      return () => window.clearInterval(timer);
    }

    setRealtimeStatus("connecting");
    const channel = supabase
      .channel("inbox-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) => {
        const conversation = payload.new as Conversation;
        if (conversation?.id) setRows((current) => upsertConversationRow(current, conversation, pagesRef.current));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const message = payload.new as Message;
        if (!message?.id) return;
        setRows((current) => {
          const next = current.some((row) => row.id === message.conversation_id) ? current : [placeholderRowFromMessage(message, pagesRef.current), ...current];
          return appendRealtimeMessage(next, message, selectedIdRef.current);
        });
        if (message.sender_type === "customer") setAiTypingIds((current) => (current.includes(message.conversation_id) ? current : [...current, message.conversation_id]));
        if (message.sender_type === "ai" || message.sender_type === "staff") setAiTypingIds((current) => current.filter((id) => id !== message.conversation_id));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const message = payload.new as Message;
        if (message?.id) setRows((current) => replaceRealtimeMessage(current, message));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeStatus("connected");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setRealtimeStatus("reconnecting");
        if (status === "CLOSED") setRealtimeStatus("disconnected");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (realtimeStatusRef.current === "connected") return;
      void pollLatestConversations();
      void pollSelectedMessages();
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distanceFromBottom < 120) scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [selected?.id, selected?.messages.length]);

  useEffect(() => {
    if (!selected || selected.messages.length || working?.startsWith("messages:") || loadedMessageIdsRef.current.has(selected.id)) return;
    loadedMessageIdsRef.current.add(selected.id);
    const params = new URLSearchParams({ conversation_id: selected.id, limit: String(MESSAGE_PAGE_SIZE) });
    setWorking(`messages:${selected.id}`);
    fetch(`/api/conversations?${params.toString()}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        const messages = (data.messages ?? []) as Message[];
        setHasOlderMessages(messages.length === MESSAGE_PAGE_SIZE);
        setRows((current) => current.map((row) => (row.id === selected.id ? { ...row, messages: mergeMessages(row.messages, messages) } : row)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Khong tai duoc tin nhan"))
      .finally(() => setWorking((current) => (current === `messages:${selected.id}` ? null : current)));
  }, [selected, working]);

  async function loadOlderMessages() {
    if (!selected?.messages.length) return;
    const scroller = scrollerRef.current;
    const previousHeight = scroller?.scrollHeight ?? 0;
    setWorking(`messages:${selected.id}`);
    const before = selected.messages[0]?.created_at;
    const params = new URLSearchParams({ conversation_id: selected.id, limit: String(MESSAGE_PAGE_SIZE), before });
    const response = await fetch(`/api/conversations?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    setWorking(null);
    if (!response.ok) return setError(data.error ?? "Không tải được lịch sử tin nhắn");
    const messages = (data.messages ?? []) as Message[];
    setHasOlderMessages(messages.length === MESSAGE_PAGE_SIZE);
    setRows((current) => current.map((row) => (row.id === selected.id ? { ...row, messages: mergeMessages(messages, row.messages) } : row)));
    requestAnimationFrame(() => {
      if (scroller) scroller.scrollTop = scroller.scrollHeight - previousHeight;
    });
  }

  async function pollLatestConversations() {
    const params = new URLSearchParams({ limit: "10" });
    const after = latestConversationTimestamp(rowsRef.current);
    if (after) params.set("after", after);
    if (pageFilterRef.current !== "all") params.set("page_id", pageFilterRef.current);
    if (debouncedQueryRef.current.trim()) params.set("q", debouncedQueryRef.current.trim());
    const response = await fetch(`/api/conversations?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(data.conversations)) {
      setRows((current) => mergeRows(current, data.conversations as Row[]));
      if (Array.isArray(data.pages)) {
        setPages(data.pages);
        pagesRef.current = data.pages;
      }
      setOpenaiConfigured(Boolean(data.providerStatus?.openai));
      setGeminiConfigured(Boolean(data.providerStatus?.gemini));
    }
  }

  async function pollSelectedMessages() {
    const id = selectedIdRef.current;
    if (!id) return;
    const row = rowsRef.current.find((item) => item.id === id);
    const after = row?.messages.at(-1)?.created_at;
    if (!after) return;
    const params = new URLSearchParams({ conversation_id: id, limit: String(MESSAGE_PAGE_SIZE), after });
    const response = await fetch(`/api/conversations?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(data.messages) && data.messages.length) {
      setRows((current) => current.map((item) => (item.id === id ? { ...item, unread_count: 0, messages: mergeMessages(item.messages, data.messages as Message[]) } : item)));
    }
  }

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      return (
        filter === "all" ||
        (filter === "unread" && (row.unread_count ?? 0) > 0) ||
        (filter === "ai" && row.ai_enabled && !row.human_takeover) ||
        (filter === "human" && (!row.ai_enabled || row.human_takeover)) ||
        (filter === "lead" && row.state.lead_score >= 50) ||
        (filter === "purchased" && row.state.sales_state === "ORDER_CREATED") ||
        (filter === "missing_phone" && !row.state.collected_phone) ||
        (filter === "missing_address" && !row.state.collected_address)
      );
    });
  }, [filter, rows]);

  async function setTakeover(row: Row, enabled: boolean) {
    const previous = rows;
    setWorking(`takeover:${row.id}`);
    setError(null);
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, human_takeover: enabled, ai_enabled: !enabled, status: enabled ? "HUMAN" : "OPEN" } : item)));
    const response = await fetch("/api/conversations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, human_takeover: enabled })
    });
    if (!response.ok) {
      setRows(previous);
      setError((await response.json().catch(() => ({}))).error ?? "Không cập nhật được trạng thái AI");
    }
    setWorking(null);
  }

  async function sendManual(textOverride?: string) {
    if (!selected) return;
    const text = (textOverride ?? draft).trim();
    if (!text) return;
    setSending(true);
    setError(null);
    setDraft("");
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: selected.id,
      page_id: selected.page_id,
      customer_psid: selected.customer_psid,
      sender_type: "staff",
      direction: "outbound",
      message: text,
      text,
      ai_generated: false,
      status: "pending",
      metadata: { optimistic: true },
      created_at: new Date().toISOString()
    };
    setRows((current) => appendRealtimeMessage(current, optimistic, selected.id));
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: selected.id, text })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Messenger gửi thất bại");
      setRows((current) => replaceTempMessage(current, selected.id, tempId, data.message ? (data.message as Message) : { ...optimistic, status: "failed" }));
    } else if (data.message) {
      setRows((current) => replaceTempMessage(current, selected.id, tempId, data.message as Message));
    }
    setSending(false);
  }

  async function syncConversations() {
    setWorking("sync");
    setError(null);
    setSyncResult(null);
    const response = await fetch("/api/conversations/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_id: pageFilter === "all" ? null : pageFilter })
    });
    const data = await response.json().catch(() => ({}));
    const errors = Array.isArray(data.errors) ? data.errors.join("; ") : data.error;
    if (!response.ok && errors) setError(errors);
    setSyncResult(`Đã quét ${data.scanned_conversations ?? 0} hội thoại, nhập mới ${data.imported_conversations ?? 0}, cập nhật ${data.updated_conversations ?? 0}, tin mới ${data.imported_messages ?? 0}, trùng ${data.duplicate_messages ?? 0}, lỗi ${(data.errors ?? []).length}`);
    setWorking(null);
    await load("replace");
  }

  async function syncConversationsBatched() {
    setWorking("sync");
    setError(null);
    setSyncResult(null);
    const total = { scanned: 0, found: 0, imported: 0, updated: 0, messages: 0, duplicates: 0, errors: 0 };
    const pageIds = pageFilter === "all" ? pagesRef.current.map((page) => page.page_id) : [pageFilter];
    let batch = 0;
    for (const syncPageId of pageIds.length ? pageIds : [null]) {
      let cursor: string | null = null;
      do {
        batch += 1;
        setSyncResult(`Dang quet hoi thoai... batch ${batch}. Da tim thay ${total.found}. Dang xu ly ${total.scanned}. Da nhap ${total.messages} tin nhan. Bo qua ${total.duplicates} trung. Loi ${total.errors}.`);
        const response: Response = await fetch("/api/conversations/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page_id: syncPageId, cursor, limit: 30 })
        });
        const data: {
          scanned_conversations?: number;
          found_conversations?: number;
          imported_conversations?: number;
          updated_conversations?: number;
          imported_messages?: number;
          duplicate_messages?: number;
          errors?: string[];
          error?: string;
          has_more?: boolean;
          next_cursor?: string | null;
        } = await response.json().catch(() => ({}));
        const errors = Array.isArray(data.errors) ? data.errors.join("; ") : data.error;
        if (!response.ok && errors) setError(errors);
        total.scanned += data.scanned_conversations ?? 0;
        total.found += data.found_conversations ?? data.scanned_conversations ?? 0;
        total.imported += data.imported_conversations ?? 0;
        total.updated += data.updated_conversations ?? 0;
        total.messages += data.imported_messages ?? 0;
        total.duplicates += data.duplicate_messages ?? 0;
        total.errors += (data.errors ?? []).length;
        cursor = data.has_more ? data.next_cursor ?? null : null;
      } while (cursor);
    }
    setSyncResult(`Da quet ${total.scanned} hoi thoai, nhap moi ${total.imported}, cap nhat ${total.updated}, tin moi ${total.messages}, trung ${total.duplicates}, loi ${total.errors}`);
    setWorking(null);
    await load("replace");
  }

  function selectConversation(id: string) {
    setSelectedId(id);
    setHasOlderMessages(true);
    setMobileChatOpen(true);
    setRows((current) => current.map((row) => (row.id === id ? { ...row, unread_count: 0 } : row)));
    void fetch("/api/conversations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, unread_count: 0 })
    }).catch(() => undefined);
  }

  function prefetchConversation(row: Row) {
    if (row.messages.length >= MESSAGE_PAGE_SIZE || working?.startsWith("prefetch:")) return;
    setWorking(`prefetch:${row.id}`);
    const params = new URLSearchParams({ conversation_id: row.id, limit: String(MESSAGE_PAGE_SIZE) });
    fetch(`/api/conversations?${params.toString()}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        const messages = (data.messages ?? []) as Message[];
        if (messages.length) setRows((current) => current.map((item) => (item.id === row.id ? { ...item, messages: mergeMessages(item.messages, messages) } : item)));
      })
      .catch(() => undefined)
      .finally(() => setWorking((current) => (current === `prefetch:${row.id}` ? null : current)));
  }

  const listPane = (
    <aside className={`${mobileChatOpen ? "hidden xl:block" : "block"} panel overflow-hidden rounded-lg`}>
      <div className="border-b border-line p-3">
        <div className="mb-2 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs">
          <span>Realtime</span>
          <span className={realtimeStatus === "connected" ? "text-leaf" : "text-coral"}>{realtimeLabel(realtimeStatus)}</span>
        </div>
        <button onClick={() => void syncConversationsBatched()} disabled={working === "sync"} className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-60">
          {working === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Đồng bộ lịch sử
        </button>
        {syncResult ? <div className="mb-2 rounded-md bg-green-50 px-3 py-2 text-xs text-leaf">{syncResult}</div> : null}
        <label className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm">
          <Search className="h-4 w-4 text-muted" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full outline-none" placeholder="Tìm tên, SĐT, nội dung" />
        </label>
        <select value={pageFilter} onChange={(event) => setPageFilter(event.target.value)} className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2 text-sm">
          <option value="all">Tất cả Page</option>
          {pages.map((page) => (
            <option key={page.page_id} value={page.page_id}>
              {page.page_name}
            </option>
          ))}
        </select>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            ["all", "Tất cả"],
            ["unread", "Chưa đọc"],
            ["ai", "AI"],
            ["human", "Nhân viên"],
            ["lead", "Lead"],
            ["purchased", "Đã mua"],
            ["missing_phone", "Thiếu SĐT"],
            ["missing_address", "Thiếu địa chỉ"]
          ].map(([value, label]) => (
            <button key={value} onClick={() => setFilter(value as Filter)} className={filter === value ? "rounded-md bg-ink px-2 py-1 text-xs font-medium text-white" : "rounded-md border border-line bg-white px-2 py-1 text-xs hover:bg-slate-50"}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[calc(100vh-332px)] overflow-y-auto">
        {filteredRows.map((row) => (
          <button key={row.id} onMouseEnter={() => prefetchConversation(row)} onClick={() => selectConversation(row.id)} className={selected?.id === row.id ? "block w-full border-l-4 border-brand border-b border-line bg-sky-50 px-3 py-2.5 text-left" : "block w-full border-l-4 border-transparent border-b border-line px-3 py-2.5 text-left hover:bg-slate-50"}>
            <div className="flex items-start gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">
                {displayName(row).slice(0, 2).toUpperCase()}
                <span className={leadDotClass(row)} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{displayName(row)}</span>
                  <span className="shrink-0 text-[11px] text-muted">{formatTime(row.last_message_at ?? row.updated_at)}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{row.last_message ?? row.messages.at(-1)?.message ?? "-"}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <Badge tone="neutral">{row.page?.page_name ?? row.page_id ?? "Local"}</Badge>
                  <Badge tone={row.ai_enabled && !row.human_takeover ? "good" : "warm"}>{row.ai_enabled && !row.human_takeover ? "AI" : "Nhân viên"}</Badge>
                  {row.state.collected_phone ? <Badge tone="good"><Phone className="h-3 w-3" /></Badge> : null}
                  {row.state.lead_score >= 50 ? <Badge tone="warm">Lead {row.state.lead_score}</Badge> : null}
                  {(row.unread_count ?? 0) > 0 ? <Badge tone="hot">{row.unread_count}</Badge> : null}
                </div>
              </div>
            </div>
          </button>
        ))}
        {nextCursor ? (
          <button onClick={() => void load("append")} className="w-full px-4 py-3 text-sm text-brand">Tải thêm hội thoại</button>
        ) : null}
        {filteredRows.length === 0 ? <div className="px-4 py-8 text-sm text-muted">Chưa có hội thoại.</div> : null}
      </div>
    </aside>
  );

  return (
    <div className="grid min-h-[calc(100vh-150px)] gap-4 xl:grid-cols-[340px_1fr_300px]">
      {listPane}
      <main className={`${mobileChatOpen ? "flex" : "hidden xl:flex"} panel min-h-[640px] flex-col overflow-hidden rounded-lg`}>
        {selected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <button onClick={() => setMobileChatOpen(false)} className="rounded-md border border-line p-2 xl:hidden" aria-label="Quay lại danh sách">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{displayName(selected)}</div>
                  <div className="truncate text-xs text-muted">{selected.page?.page_name ?? selected.page_id ?? "Local"} - {selected.customer_psid ?? selected.external_user_id}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button title="Nhân viên tiếp quản" onClick={() => void setTakeover(selected, true)} disabled={Boolean(selected.human_takeover) || working === `takeover:${selected.id}`} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50">
                  <UserRound className="h-4 w-4" />
                  Nhân viên tiếp quản
                </button>
                <button title="Bật lại AI" onClick={() => void setTakeover(selected, false)} disabled={!selected.human_takeover || working === `takeover:${selected.id}`} className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                  <Bot className="h-4 w-4" />
                  Bật lại AI
                </button>
                <button title="Tùy chọn thêm" className="rounded-md border border-line p-2 text-muted">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
            {providerWarning ? <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{providerWarning}</div> : null}
            {error ? <div className="border-b border-coral/30 bg-red-50 px-4 py-2 text-sm text-coral">{error}</div> : null}
            <div ref={scrollerRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
              {hasOlderMessages && selected.messages.length ? (
                <button onClick={() => void loadOlderMessages()} disabled={working === `messages:${selected.id}`} className="mx-auto flex items-center gap-2 rounded-md border border-line bg-white px-3 py-1.5 text-xs disabled:opacity-60">
                  {working === `messages:${selected.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Tải tin nhắn cũ hơn
                </button>
              ) : null}
              {selected.messages.map((message) => <MessageBubble key={message.id} message={message} onRetry={() => void sendManual(message.message)} />)}
              {aiTypingIds.includes(selected.id) && selected.ai_enabled && !selected.human_takeover ? (
                <div className="flex justify-start">
                  <div className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-muted">AI đang soạn...</div>
                </div>
              ) : null}
            </div>
            <div className="border-t border-line p-3">
              <div className="flex gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendManual();
                    }
                  }}
                  rows={1}
                  className="max-h-32 min-h-10 min-w-0 flex-1 resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                  placeholder="Nhập tin nhắn"
                />
                <button onClick={() => void sendManual()} disabled={sending || !draft.trim()} className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Gửi
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-8 text-muted">Chọn một hội thoại.</div>
        )}
      </main>

      <aside className={`${mobileChatOpen ? "block" : "hidden xl:block"} panel overflow-hidden rounded-lg p-4`}>
        {selected ? (
          <div className="space-y-4">
            <section className="space-y-3 border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold">{displayName(selected).slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{displayName(selected)}</div>
                  <div className="truncate text-xs text-muted">{selected.customer_psid ?? selected.external_user_id}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button title="Sao chép SĐT" disabled={!selected.state.collected_phone} onClick={() => selected.state.collected_phone && navigator.clipboard?.writeText(selected.state.collected_phone)} className="inline-flex items-center justify-center rounded-md border border-line p-2 disabled:opacity-40">
                  <Copy className="h-4 w-4" />
                </button>
                <a title="Mở Zalo" aria-disabled={!selected.state.collected_phone} href={selected.state.collected_phone ? `https://zalo.me/${selected.state.collected_phone.replace(/\D/g, "")}` : undefined} target="_blank" className={selected.state.collected_phone ? "inline-flex items-center justify-center rounded-md border border-line p-2" : "inline-flex pointer-events-none items-center justify-center rounded-md border border-line p-2 opacity-40"}>
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button title="Tạo đơn" disabled className="inline-flex items-center justify-center rounded-md border border-line p-2 opacity-40">
                  <PackagePlus className="h-4 w-4" />
                </button>
              </div>
            </section>
            <CrmSection title="Khách hàng">
              <Info label="Page" value={selected.page?.page_name ?? selected.page_id} />
              <Info label="SĐT" value={selected.state.collected_phone} />
              <Info label="Địa chỉ" value={selected.state.collected_address} />
            </CrmSection>
            <CrmSection title="Trạng thái">
              <Info label="Lead" value={leadStatusLabel(selected)} />
              <Info label="Điểm" value={selected.state.lead_score} />
            </CrmSection>
            <CrmSection title="Nhu cầu">
              <Info label="Sản phẩm" value={selected.state.collected_product_interest} />
              <Info label="Số lượng" value={selected.state.collected_quantity} />
              <Info label="Diện tích" value={selected.state.collected_area} />
              <Info label="Dự án" value={selected.state.collected_project_type} />
            </CrmSection>
            <CrmSection title="Thẻ">
              <button disabled className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm opacity-50">
                <Tag className="h-4 w-4" />
                Gắn thẻ
              </button>
            </CrmSection>
            <CrmSection title="Ghi chú">
              <textarea disabled rows={3} placeholder="Chưa có backend ghi chú" className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm opacity-60" />
            </CrmSection>
            <CrmSection title="AI">
              <Info label="Provider" value={selected.page?.ai_provider ?? "Chưa chọn"} />
              <Info label="Status" value={providerWarning ? "Cần cấu hình" : "Sẵn sàng"} />
              <Info label="Confidence" value={selected.state.ai_confidence_status === "human_required" ? "Cần nhân viên" : selected.state.ai_confidence_status === "uncertain" ? "Chưa chắc chắn" : selected.state.ai_confidence_status === "confident" ? "Tự tin" : "-"} />
              <Info label="Intent" value={selected.state.current_intent} />
              <Info label="Takeover" value={selected.human_takeover ? "Nhân viên" : "AI"} />
            </CrmSection>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function MessageBubble({ message, onRetry }: { message: Message; onRetry: () => void }) {
  const outbound = message.sender_type !== "customer";
  return (
    <div className={outbound ? "flex justify-end" : "flex justify-start"}>
      <div className={outbound ? "max-w-[78%] rounded-lg bg-ink px-3 py-2 text-sm text-white" : "max-w-[78%] rounded-lg border border-line bg-white px-3 py-2 text-sm"}>
        <div className={outbound ? "mb-1 flex items-center gap-1 text-xs text-white/70" : "mb-1 flex items-center gap-1 text-xs text-muted"}>
          {outbound ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
          {senderLabel(message.sender_type)} - {formatTime(message.created_at)}
        </div>
        <div>{message.message}</div>
        {message.status === "pending" ? <div className="mt-1 text-[11px] opacity-70">Đang gửi...</div> : null}
        {message.status === "sent" && outbound ? <div className="mt-1 text-[11px] opacity-70">Đã gửi</div> : null}
        {message.status === "failed" ? (
          <button onClick={onRetry} className="mt-1 text-[11px] font-medium text-coral">
            Gửi thất bại - Thử lại
          </button>
        ) : null}
      </div>
    </div>
  );
}

function displayName(row: Row) {
  return row.customer_name || row.state.collected_name || row.customer_psid || row.external_user_id;
}

function formatTime(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function senderLabel(sender: Message["sender_type"]) {
  if (sender === "customer") return "Khách";
  if (sender === "staff") return "Nhân viên";
  if (sender === "ai") return "AI";
  return "Hệ thống";
}

function providerLabel(provider: "openai" | "gemini") {
  return provider === "gemini" ? "Gemini" : "OpenAI";
}

function leadDotClass(row: Row) {
  const tone = row.state.sales_state === "ORDER_CREATED" ? "bg-leaf" : row.state.lead_score >= 70 ? "bg-coral" : row.state.lead_score >= 50 ? "bg-amber-500" : "bg-slate-300";
  return `absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${tone}`;
}

function leadStatusLabel(row: Row) {
  if (row.state.sales_state === "ORDER_CREATED") return "Đã mua";
  if (row.state.lead_score >= 70) return "Tiềm năng cao";
  if (row.state.lead_score >= 50) return "Đang chăm sóc";
  return "Mới";
}

function CrmSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-normal text-muted">{title}</div>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="max-w-[160px] truncate text-right font-medium">{value || "-"}</span>
    </div>
  );
}

function mergeRows(current: Row[], incoming: Row[]) {
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, { ...byId.get(row.id), ...row, messages: mergeMessages(byId.get(row.id)?.messages ?? [], row.messages ?? []) });
  return Array.from(byId.values()).sort(sortRows);
}

function upsertConversationRow(rows: Row[], conversation: Conversation, pages: FacebookPage[]) {
  const page = conversation.page_id ? pages.find((item) => item.page_id === conversation.page_id) ?? null : null;
  const existing = rows.find((row) => row.id === conversation.id);
  const next: Row = existing ? { ...existing, ...conversation, page } : { ...conversation, state: defaultState(conversation.id), messages: [], page };
  return [next, ...rows.filter((row) => row.id !== conversation.id)].sort(sortRows);
}

function appendRealtimeMessage(rows: Row[], message: Message, selectedId?: string | null) {
  return rows.map((row) => {
    if (row.id !== message.conversation_id) return row;
    const messages = mergeMessages(row.messages, [message]).slice(-80);
    const isOpen = selectedId === row.id;
    const unread = message.sender_type === "customer" && !isOpen ? (row.unread_count ?? 0) + 1 : message.sender_type === "customer" ? 0 : row.unread_count ?? 0;
    return {
      ...row,
      last_message: message.message,
      last_message_at: message.created_at,
      unread_count: unread,
      messages
    };
  }).sort(sortRows);
}

function replaceRealtimeMessage(rows: Row[], message: Message) {
  return rows.map((row) => (row.id === message.conversation_id ? { ...row, messages: mergeMessages(row.messages.filter((item) => item.id !== message.id), [message]) } : row));
}

function replaceTempMessage(rows: Row[], conversationId: string, tempId: string, message: Message) {
  return rows.map((row) => {
    if (row.id !== conversationId) return row;
    const withoutTemp = row.messages.filter((item) => item.id !== tempId);
    return { ...row, messages: mergeMessages(withoutTemp, [message]).slice(-80), last_message: message.message, last_message_at: message.created_at };
  }).sort(sortRows);
}

function mergeMessages(first: Message[], second: Message[]) {
  const byKey = new Map<string, Message>();
  for (const message of [...first, ...second]) {
    const key = message.facebook_message_id || message.id;
    byKey.set(key, { ...byKey.get(key), ...message });
  }
  return Array.from(byKey.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function sortRows(a: Row, b: Row) {
  return new Date(b.last_message_at ?? b.updated_at).getTime() - new Date(a.last_message_at ?? a.updated_at).getTime();
}

function latestConversationTimestamp(rows: Row[]) {
  const latest = rows.reduce((max, row) => {
    const value = new Date(row.last_message_at ?? row.updated_at).getTime();
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);
  return latest ? new Date(latest).toISOString() : null;
}

function placeholderRowFromMessage(message: Message, pages: FacebookPage[]): Row {
  const timestamp = message.created_at ?? new Date().toISOString();
  const page = message.page_id ? pages.find((item) => item.page_id === message.page_id) ?? null : null;
  return {
    id: message.conversation_id,
    platform: message.page_id ? "facebook" : "local",
    external_user_id: message.customer_psid ?? message.conversation_id,
    page_id: message.page_id ?? null,
    customer_psid: message.customer_psid ?? null,
    customer_name: null,
    customer_avatar_url: null,
    last_message: message.message,
    last_message_at: timestamp,
    unread_count: message.sender_type === "customer" ? 1 : 0,
    human_takeover: false,
    customer_id: null,
    status: "OPEN",
    ai_enabled: true,
    created_at: timestamp,
    updated_at: timestamp,
    state: defaultState(message.conversation_id),
    messages: [],
    page
  };
}

function defaultState(conversationId: string): ConversationState {
  return {
    conversation_id: conversationId,
    current_intent: "unknown",
    lead_score: 0,
    scored_signals: [],
    qualification_stage: "discovery",
    sales_state: "NEW",
    collected_name: null,
    collected_phone: null,
    collected_location: null,
    collected_address: null,
    collected_quantity: null,
    collected_floors: null,
    collected_project_type: null,
    collected_area: null,
    collected_product_interest: null,
    collected_budget: null,
    last_question: null,
    should_request_phone: false,
    should_handoff: false,
    updated_at: new Date().toISOString()
  };
}

function realtimeLabel(status: RealtimeStatus) {
  if (status === "connecting") return "Đang kết nối realtime...";
  if (status === "connected") return "Realtime đã kết nối";
  if (status === "reconnecting") return "Đang kết nối lại";
  return "Mất kết nối";
}
