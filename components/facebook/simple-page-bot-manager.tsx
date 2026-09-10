"use client";

import { useEffect, useMemo, useState } from "react";
import { Facebook, Loader2, Save, Settings2, Unplug } from "lucide-react";
import type { FacebookPage } from "@/lib/types";

type OAuthPage = { id: string; name: string };
type BotProvider = "gemini" | "meta";

const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-flash-latest"];

export function SimplePageBotManager() {
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [oauthPages, setOauthPages] = useState<OAuthPage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<FacebookPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const oauthSession = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("oauth_session");
  }, []);

  async function loadPages() {
    setLoading(true);
    const response = await fetch("/api/facebook/pages", { cache: "no-store" });
    const data = await response.json();
    setPages(data.pages ?? []);
    setLoading(false);
  }

  async function loadOAuthPages(sessionId: string) {
    const response = await fetch(`/api/facebook/oauth/pages?session=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const data = await response.json();
    const found = (data.pages ?? []) as OAuthPage[];
    setOauthPages(found);
    setSelected(found.map((page) => page.id));
  }

  useEffect(() => {
    void loadPages();
    if (oauthSession) void loadOAuthPages(oauthSession);
  }, [oauthSession]);

  async function connectSelected() {
    if (!oauthSession || !selected.length) return;
    setWorking(true);
    setMessage(null);
    const response = await fetch("/api/facebook/oauth/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: oauthSession, pageIds: selected })
    });
    const data = await response.json().catch(() => ({}));
    setWorking(false);
    if (!response.ok) {
      setMessage(data.error ?? "Không kết nối được Page. Hãy kiểm tra quyền Facebook App.");
      return;
    }
    window.history.replaceState(null, "", "/facebook-pages");
    setOauthPages([]);
    setSelected([]);
    setMessage("Đã kết nối Page thành công.");
    await loadPages();
  }

  async function savePage(page: FacebookPage) {
    const provider: BotProvider = String(page.ai_provider ?? "") === "meta" ? "meta" : "gemini";
    if (provider === "meta" && !page.ai_model?.trim()) {
      setMessage("Hãy nhập Model ID của Meta Model API cho Page này.");
      return;
    }

    setWorking(true);
    setMessage(null);
    const response = await fetch("/api/facebook/page-ai", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page_id: page.page_id,
        page_name: page.page_name,
        automation_enabled: page.automation_enabled,
        auto_reply_messenger: page.automation_enabled,
        ai_sales_mode: page.automation_enabled,
        ai_provider: provider,
        ai_model: page.ai_model || (provider === "gemini" ? "gemini-3.8-flash" : ""),
        ai_business_name: page.ai_business_name ?? page.page_name,
        ai_system_prompt: page.ai_system_prompt ?? "",
        ai_product_context: page.ai_product_context ?? "",
        ai_faq_context: page.ai_faq_context ?? ""
      })
    });
    const data = await response.json().catch(() => ({}));
    setWorking(false);
    if (!response.ok) {
      setMessage(data.error ?? "Không lưu được cấu hình Page.");
      return;
    }
    setEditing(null);
    setMessage(`Đã lưu Page với ${provider === "meta" ? "Meta Model API" : "Gemini"}.`);
    await loadPages();
  }

  async function removePage(pageId: string) {
    if (!window.confirm("Ngắt kết nối Page này?")) return;
    setWorking(true);
    const response = await fetch(`/api/facebook/pages?page_id=${encodeURIComponent(pageId)}`, { method: "DELETE" });
    setWorking(false);
    if (!response.ok) {
      setMessage("Không ngắt kết nối được Page.");
      return;
    }
    setMessage("Đã ngắt kết nối Page.");
    await loadPages();
  }

  function startEditing(page: FacebookPage) {
    const provider: BotProvider = String(page.ai_provider ?? "") === "meta" ? "meta" : "gemini";
    setEditing({
      ...page,
      ai_provider: provider as FacebookPage["ai_provider"],
      ai_model: provider === "meta" ? page.ai_model ?? "" : GEMINI_MODELS.includes(page.ai_model ?? "") ? page.ai_model : "gemini-3.8-flash"
    });
  }

  function changeProvider(provider: BotProvider) {
    if (!editing) return;
    setEditing({
      ...editing,
      ai_provider: provider as FacebookPage["ai_provider"],
      ai_model: provider === "gemini"
        ? GEMINI_MODELS.includes(editing.ai_model ?? "") ? editing.ai_model : "gemini-3.8-flash"
        : (editing.ai_model?.startsWith("gemini-") ? "" : editing.ai_model ?? "")
    });
  }

  const editingProvider: BotProvider = String(editing?.ai_provider ?? "") === "meta" ? "meta" : "gemini";

  return (
    <div className="space-y-5">
      <section className="panel rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Kết nối Facebook Page</h2>
            <p className="mt-1 text-sm text-muted">Có thể kết nối nhiều Page. Mỗi Page có dữ liệu riêng và có thể chọn Gemini hoặc Meta Model API.</p>
          </div>
          <a href="/api/facebook/oauth/start" className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">
            <Facebook className="h-4 w-4" /> Kết nối Page
          </a>
        </div>
        {message ? <div className="mt-3 rounded-md border border-line bg-white px-3 py-2 text-sm">{message}</div> : null}
      </section>

      {oauthPages.length ? (
        <section className="panel rounded-lg p-4">
          <h2 className="font-semibold">Chọn Page muốn dùng bot</h2>
          <div className="mt-3 space-y-2">
            {oauthPages.map((page) => (
              <label key={page.id} className="flex items-center gap-3 rounded-md border border-line bg-white p-3 text-sm">
                <input type="checkbox" checked={selected.includes(page.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, page.id] : current.filter((id) => id !== page.id))} />
                <span className="font-medium">{page.name}</span>
              </label>
            ))}
          </div>
          <button disabled={working || !selected.length} onClick={() => void connectSelected()} className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {working ? "Đang kết nối..." : `Kết nối ${selected.length} Page`}
          </button>
        </section>
      ) : null}

      <section className="panel rounded-lg p-4">
        <h2 className="font-semibold">Page đã kết nối</h2>
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải...</div>
        ) : pages.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Chưa có Page nào.</p>
        ) : (
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {pages.map((page) => {
              const provider = String(page.ai_provider ?? "") === "meta" ? "Meta Model API" : "Gemini";
              return (
                <div key={page.page_id} className="rounded-lg border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{page.page_name}</div>
                      <div className="mt-1 text-xs text-muted">Page ID: {page.page_id}</div>
                      <div className="mt-1 text-xs text-muted">AI: {provider}{page.ai_model ? ` · ${page.ai_model}` : ""}</div>
                    </div>
                    <span className={page.automation_enabled ? "rounded-full bg-green-50 px-2 py-1 text-xs text-green-700" : "rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"}>
                      {page.automation_enabled ? "Bot đang bật" : "Bot đang tắt"}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => startEditing(page)} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm"><Settings2 className="h-4 w-4" /> Cấu hình bot</button>
                    <button disabled={working} onClick={() => void removePage(page.page_id)} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-red-600 disabled:opacity-50"><Unplug className="h-4 w-4" /> Ngắt kết nối</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editing ? (
        <section className="panel rounded-lg p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Cấu hình: {editing.page_name}</h2>
              <p className="mt-1 text-sm text-muted">AI chỉ dùng dữ liệu bạn nhập cho Page này để trả lời khách.</p>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.automation_enabled} onChange={(event) => setEditing({ ...editing, automation_enabled: event.target.checked })} /> Bật tự động trả lời</label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Nhà cung cấp AI</span>
              <select value={editingProvider} onChange={(event) => changeProvider(event.target.value as BotProvider)} className="w-full rounded-md border border-line px-3 py-2">
                <option value="gemini">Gemini</option>
                <option value="meta">Meta Model API</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Model</span>
              {editingProvider === "meta" ? (
                <input value={editing.ai_model ?? ""} onChange={(event) => setEditing({ ...editing, ai_model: event.target.value })} className="w-full rounded-md border border-line px-3 py-2" placeholder="Model ID từ Meta Model API dashboard" />
              ) : (
                <select value={editing.ai_model ?? "gemini-3.8-flash"} onChange={(event) => setEditing({ ...editing, ai_model: event.target.value })} className="w-full rounded-md border border-line px-3 py-2">
                  {GEMINI_MODELS.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              )}
            </label>
          </div>
          {editingProvider === "meta" ? <p className="mt-2 text-xs text-muted">Dùng đúng Model ID mà tài khoản Meta Model API của bạn được phép truy cập.</p> : null}

          <label className="mt-4 block text-sm"><span className="mb-1 block font-medium">Tên cửa hàng / thương hiệu</span><input value={editing.ai_business_name ?? ""} onChange={(event) => setEditing({ ...editing, ai_business_name: event.target.value })} className="w-full rounded-md border border-line px-3 py-2" placeholder={editing.page_name} /></label>

          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium">Thông tin sản phẩm + giá bán</span>
            <textarea value={editing.ai_product_context ?? ""} onChange={(event) => setEditing({ ...editing, ai_product_context: event.target.value })} className="min-h-64 w-full rounded-md border border-line px-3 py-2" placeholder={"Ví dụ:\nSơn chống thấm TNANO CT01\n- Giá 18L: 2.500.000đ\n- Giá 5L: 850.000đ\n- Công dụng: chống thấm tường ngoài trời\n\nSơn nội thất TNANO N01\n- Giá 18L: ..."} />
          </label>

          <label className="mt-4 block text-sm"><span className="mb-1 block font-medium">FAQ / chính sách cần bot biết</span><textarea value={editing.ai_faq_context ?? ""} onChange={(event) => setEditing({ ...editing, ai_faq_context: event.target.value })} className="min-h-40 w-full rounded-md border border-line px-3 py-2" placeholder="Ví dụ: phí vận chuyển, thời gian giao hàng, bảo hành, cách thanh toán..." /></label>
          <label className="mt-4 block text-sm"><span className="mb-1 block font-medium">Cách bot nói chuyện (không bắt buộc)</span><textarea value={editing.ai_system_prompt ?? ""} onChange={(event) => setEditing({ ...editing, ai_system_prompt: event.target.value })} className="min-h-28 w-full rounded-md border border-line px-3 py-2" placeholder="Ví dụ: Xưng em, gọi khách là anh/chị. Trả lời ngắn, thân thiện, không nói lan man." /></label>

          <div className="mt-4 flex gap-2">
            <button disabled={working} onClick={() => void savePage(editing)} className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Save className="h-4 w-4" /> {working ? "Đang lưu..." : "Lưu cấu hình"}</button>
            <button onClick={() => setEditing(null)} className="rounded-md border border-line px-4 py-2 text-sm">Đóng</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
