"use client";

import { useEffect, useState } from "react";

export function GeminiSettings() {
  const [configured, setConfigured] = useState(false);
  const [storeReady, setStoreReady] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/settings/ai", { cache: "no-store" });
    const data = await response.json();
    setConfigured(Boolean(data.providers?.gemini));
    setStoreReady(Boolean(data.providers?.encryptedStoreReady));
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!apiKey.trim()) return;
    setWorking(true);
    setMessage(null);
    const response = await fetch("/api/settings/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "gemini", apiKey: apiKey.trim() })
    });
    const data = await response.json().catch(() => ({}));
    setWorking(false);
    if (!response.ok) {
      setMessage(data.error ?? "Không lưu được Gemini API key.");
      return;
    }
    setApiKey("");
    setConfigured(true);
    setMessage("Đã lưu Gemini API key.");
  }

  async function test() {
    setWorking(true);
    setMessage(null);
    const response = await fetch("/api/ai/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "gemini", model: "gemini-3.8-flash" })
    });
    const data = await response.json().catch(() => ({}));
    setWorking(false);
    setMessage(response.ok ? `Gemini hoạt động bình thường (${data.latencyMs}ms).` : data.error ?? "Kiểm tra Gemini thất bại.");
  }

  return (
    <div className="space-y-4">
      <section className="panel rounded-lg p-4">
        <h2 className="font-semibold">Gemini API</h2>
        <p className="mt-1 text-sm text-muted">Bot chỉ dùng Gemini để trả lời Messenger.</p>
        <div className="mt-4 rounded-md border border-line bg-white p-3 text-sm">
          Trạng thái: <span className={configured ? "font-medium text-green-700" : "font-medium text-red-600"}>{configured ? "Đã cấu hình" : "Chưa cấu hình"}</span>
        </div>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">Gemini API key</span>
          <input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="w-full rounded-md border border-line px-3 py-2" placeholder="AIza..." />
        </label>
        {!storeReady ? <p className="mt-2 text-xs text-muted">Để lưu API key trực tiếp trên web, server cần cấu hình APP_ENCRYPTION_KEY và Supabase. Nếu chưa có, bạn vẫn có thể đặt GEMINI_API_KEY trong biến môi trường khi deploy.</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={working || !apiKey.trim()} onClick={() => void save()} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Lưu API key</button>
          <button disabled={working || !configured} onClick={() => void test()} className="rounded-md border border-line px-4 py-2 text-sm disabled:opacity-50">Kiểm tra Gemini 3.8 Flash</button>
        </div>
        {message ? <div className="mt-3 rounded-md border border-line bg-white px-3 py-2 text-sm">{message}</div> : null}
      </section>

      <section className="panel rounded-lg p-4 text-sm">
        <h2 className="font-semibold">Cách bot hoạt động</h2>
        <p className="mt-2 text-muted">Kết nối Page ở mục Facebook Pages, nhập sản phẩm, giá bán và FAQ riêng cho từng Page. Khi khách nhắn Messenger, webhook nhận tin nhắn, xác định đúng Page, gửi lịch sử hội thoại + dữ liệu của Page đó sang Gemini và gửi câu trả lời trở lại Messenger.</p>
      </section>
    </div>
  );
}
