"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Trash2 } from "lucide-react";

type Provider = "openai" | "gemini";

interface SettingsStatus {
  providers: { openai: boolean; gemini: boolean; encryptedStoreReady?: boolean };
  facebook: Record<string, boolean | string>;
  supabase: Record<string, boolean>;
  system: Record<string, string | boolean>;
}

export function SettingsPanel({ initialStatus }: { initialStatus: SettingsStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [keys, setKeys] = useState<Record<Provider, string>>({ openai: "", gemini: "" });
  const [visible, setVisible] = useState<Record<Provider, boolean>>({ openai: false, gemini: false });
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/settings/ai", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (data.providers) setStatus((current) => ({ ...current, providers: data.providers }));
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function save(provider: Provider) {
    setWorking(`save:${provider}`);
    setNotice(null);
    const response = await fetch("/api/settings/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey: keys[provider] })
    });
    const data = await response.json().catch(() => ({}));
    setWorking(null);
    if (!response.ok) return setNotice(data.error ?? "Không lưu được API key");
    setKeys((current) => ({ ...current, [provider]: "" }));
    setStatus((current) => ({ ...current, providers: data.providers ?? current.providers }));
    setNotice(`Đã lưu ${providerLabel(provider)} API key`);
  }

  async function remove(provider: Provider) {
    setWorking(`delete:${provider}`);
    setNotice(null);
    const response = await fetch(`/api/settings/ai?provider=${provider}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setWorking(null);
    if (!response.ok) return setNotice(data.error ?? "Không xóa được API key");
    setStatus((current) => ({ ...current, providers: data.providers ?? current.providers }));
    setNotice(`Đã xóa ${providerLabel(provider)} API key đã lưu trong tool`);
  }

  async function test(provider: Provider) {
    setWorking(`test:${provider}`);
    setNotice(null);
    const response = await fetch("/api/ai/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider })
    });
    const data = await response.json().catch(() => ({}));
    setWorking(null);
    setNotice(
      response.ok
        ? `Kết nối ${providerLabel(provider)} thành công, latency ${data.latencyMs}ms, model ${data.model ?? "mặc định"}`
        : data.error ?? `Không kiểm tra được ${providerLabel(provider)}`
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <section className="panel rounded-lg p-4">
        <h2 className="font-semibold">Cấu hình AI</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ProviderSecretCard
            provider="openai"
            configured={status.providers.openai}
            encryptedStoreReady={Boolean(status.providers.encryptedStoreReady)}
            value={keys.openai}
            visible={visible.openai}
            working={working}
            onValue={(value) => setKeys((current) => ({ ...current, openai: value }))}
            onToggleVisible={() => setVisible((current) => ({ ...current, openai: !current.openai }))}
            onSave={() => void save("openai")}
            onDelete={() => void remove("openai")}
            onTest={() => void test("openai")}
          />
          <ProviderSecretCard
            provider="gemini"
            configured={status.providers.gemini}
            encryptedStoreReady={Boolean(status.providers.encryptedStoreReady)}
            value={keys.gemini}
            visible={visible.gemini}
            working={working}
            onValue={(value) => setKeys((current) => ({ ...current, gemini: value }))}
            onToggleVisible={() => setVisible((current) => ({ ...current, gemini: !current.gemini }))}
            onSave={() => void save("gemini")}
            onDelete={() => void remove("gemini")}
            onTest={() => void test("gemini")}
          />
        </div>
        {!status.providers.encryptedStoreReady ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Chưa cấu hình khóa mã hóa hệ thống</div>
        ) : null}
        {notice ? <div className="mt-3 rounded-md border border-line bg-white px-3 py-2 text-sm">{notice}</div> : null}
      </section>

      <section className="panel rounded-lg p-4 text-sm">
        <h2 className="font-semibold">Webhook URL</h2>
        <div className="mt-2 rounded-md bg-slate-50 p-3 font-mono text-xs break-all">{String(status.facebook["Webhook URL"])}</div>
        <div className="mt-4 text-muted">Secret và token không hiển thị ở browser. Page Access Token được quản lý trong Facebook Pages.</div>
      </section>

      <StatusSection title="Facebook" rows={status.facebook} />
      <StatusSection title="Supabase" rows={status.supabase} />
      <StatusSection title="Hệ thống" rows={status.system} />
    </div>
  );
}

function ProviderSecretCard({
  provider,
  configured,
  encryptedStoreReady,
  value,
  visible,
  working,
  onValue,
  onToggleVisible,
  onSave,
  onDelete,
  onTest
}: {
  provider: Provider;
  configured: boolean;
  encryptedStoreReady: boolean;
  value: string;
  visible: boolean;
  working: string | null;
  onValue: (value: string) => void;
  onToggleVisible: () => void;
  onSave: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  return (
    <div className="rounded-md border border-line p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{providerLabel(provider)}</div>
          <div className={configured ? "text-sm text-leaf" : "text-sm text-coral"}>{configured ? "Đã cấu hình" : "Chưa cấu hình"}</div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onValue(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm"
          placeholder={`Nhập ${providerLabel(provider)} API key mới`}
        />
        <button type="button" onClick={onToggleVisible} className="rounded-md border border-line px-3 py-2" aria-label={visible ? "Ẩn API key" : "Hiện API key"}>
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onSave} disabled={!encryptedStoreReady || !value.trim() || working === `save:${provider}`} className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {working === `save:${provider}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Lưu
        </button>
        <button onClick={onDelete} disabled={!encryptedStoreReady || !configured || working === `delete:${provider}`} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50">
          {working === `delete:${provider}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Xóa key
        </button>
        <button onClick={onTest} disabled={!configured || working === `test:${provider}`} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50">
          {working === `test:${provider}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Kiểm tra kết nối
        </button>
      </div>
    </div>
  );
}

function StatusSection({ title, rows }: { title: string; rows: Record<string, boolean | string> }) {
  return (
    <section className="panel overflow-hidden rounded-lg">
      <div className="border-b border-line px-4 py-3 font-semibold">{title}</div>
      <div className="divide-y divide-line">
        {Object.entries(rows).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="font-medium">{label}</span>
            <span className={value === true || value === "Đã cấu hình" || value === "Production" ? "text-leaf" : value ? "text-slate-700" : "text-coral"}>
              {typeof value === "boolean" ? (value ? "Đã cấu hình" : "Chưa cấu hình") : value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function providerLabel(provider: Provider) {
  return provider === "openai" ? "OpenAI" : "Google Gemini";
}
