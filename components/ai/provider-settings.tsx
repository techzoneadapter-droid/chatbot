"use client";

import { useEffect, useState } from "react";

type Provider = "gemini" | "meta";
type ProviderStatus = { gemini?: boolean; meta?: boolean; encryptedStoreReady?: boolean };

export function ProviderSettings() {
  const [status, setStatus] = useState<ProviderStatus>({});
  const [geminiKey, setGeminiKey] = useState("");
  const [metaKey, setMetaKey] = useState("");
  const [metaModel, setMetaModel] = useState("");
  const [working, setWorking] = useState<Provider | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/settings/ai", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    setStatus(data.providers ?? {});
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(provider: Provider, apiKey: string) {
    if (!apiKey.trim()) return;
    setWorking(provider);
    setMessage(null);
    const response = await fetch("/api/settings/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey: apiKey.trim() })
    });
    const data = await response.json().catch(() => ({}));
    setWorking(null);
    if (!response.ok) {
      setMessage(data.error ?? "Không lưu được API key.");
      return;
    }
    if (provider === "gemini") setGeminiKey("");
    else setMetaKey("");
    setStatus(data.providers ?? status);
    setMessage(`Đã lưu ${provider === "gemini" ? "Gemini" : "Meta Model API"} key.`);
  }

  async function test(provider: Provider) {
    if (provider === "meta" && !metaModel.trim()) {
      setMessage("Hãy nhập Model ID Meta trước khi kiểm tra.");
      return;
    }
    setWorking(provider);
    setMessage(null);
    const response = await fetch("/api/ai/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model: provider === "gemini" ? "gemini-3.8-flash" : metaModel.trim() })
    });
    const data = await response.json().catch(() => ({}));
    setWorking(null);
    const name = provider === "gemini" ? "Gemini" : "Meta Model API";
    setMessage(response.ok ? `${name} hoạt động bình thường (${data.latencyMs}ms).` : data.error ?? `Kiểm tra ${name} thất bại.`);
  }

  return (
    <div className="space-y-4">
      <section className="panel rounded-lg p-4">
        <h2 className="font-semibold">Gemini API</h2>
        <p className="mt-1 text-sm text-muted">Provider mặc định cho các Page hiện tại.</p>
        <Status ok={Boolean(status.gemini)} />
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">Gemini API key</span>
          <input type="password" autoComplete="off" value={geminiKey} onChange={(event) => setGeminiKey(event.target.value)} className="w-full rounded-md border border-line px-3 py-2" placeholder="AIza..." />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={working !== null || !geminiKey.trim()} onClick={() => void save("gemini", geminiKey)} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Lưu Gemini key</button>
          <button disabled={working !== null || !status.gemini} onClick={() => void test("gemini")} className="rounded-md border border-line px-4 py-2 text-sm disabled:opacity-50">Kiểm tra Gemini 3.8 Flash</button>
        </div>
      </section>

      <section className="panel rounded-lg p-4">
        <h2 className="font-semibold">Meta Model API</h2>
        <p className="mt-1 text-sm text-muted">Dùng API tại api.meta.ai/v1. Mỗi Page có thể chọn Meta thay cho Gemini.</p>
        <Status ok={Boolean(status.meta)} />
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">MODEL_API_KEY</span>
          <input type="password" autoComplete="off" value={metaKey} onChange={(event) => setMetaKey(event.target.value)} className="w-full rounded-md border border-line px-3 py-2" placeholder="Meta Model API key" />
        </label>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">Model ID để kiểm tra</span>
          <input value={metaModel} onChange={(event) => setMetaModel(event.target.value)} className="w-full rounded-md border border-line px-3 py-2" placeholder="Dán chính xác Model ID từ Meta Model API dashboard" />
        </label>
        <p className="mt-2 text-xs text-muted">Hệ thống không khóa cứng tên model. Hãy dùng đúng Model ID mà tài khoản Meta của bạn được cấp.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={working !== null || !metaKey.trim()} onClick={() => void save("meta", metaKey)} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Lưu Meta key</button>
          <button disabled={working !== null || !status.meta || !metaModel.trim()} onClick={() => void test("meta")} className="rounded-md border border-line px-4 py-2 text-sm disabled:opacity-50">Kiểm tra Meta API</button>
        </div>
      </section>

      {!status.encryptedStoreReady ? (
        <section className="panel rounded-lg p-4 text-sm text-muted">
          Để lưu key trực tiếp trên web, server cần APP_ENCRYPTION_KEY và Supabase. Nếu chưa có, có thể cấu hình GEMINI_API_KEY hoặc MODEL_API_KEY trong Environment Variables của Vercel.
        </section>
      ) : null}

      {message ? <div className="panel rounded-lg p-3 text-sm">{message}</div> : null}

      <section className="panel rounded-lg p-4 text-sm">
        <h2 className="font-semibold">Cách chọn AI cho từng Page</h2>
        <p className="mt-2 text-muted">Vào Facebook Pages → Cấu hình bot → chọn Gemini hoặc Meta Model API. Dữ liệu sản phẩm, giá và FAQ vẫn được tách riêng theo từng Page.</p>
      </section>
    </div>
  );
}

function Status({ ok }: { ok: boolean }) {
  return (
    <div className="mt-4 rounded-md border border-line bg-white p-3 text-sm">
      Trạng thái: <span className={ok ? "font-medium text-green-700" : "font-medium text-red-600"}>{ok ? "Đã cấu hình" : "Chưa cấu hình"}</span>
    </div>
  );
}
