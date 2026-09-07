"use client";

import { useEffect, useState } from "react";
import type { AutomationSettings } from "@/lib/types";

export function KnowledgeSettings() {
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [providers, setProviders] = useState<{ openai: boolean; gemini: boolean }>({ openai: false, gemini: false });
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/automation", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setSettings(data.settings));
    fetch("/api/ai/providers", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setProviders(data.providers ?? { openai: false, gemini: false }));
  }, []);

  async function testProvider(provider: "openai" | "gemini") {
    setTesting(provider);
    setTestResult(null);
    const response = await fetch("/api/ai/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider })
    });
    const data = await response.json().catch(() => ({}));
    setTesting(null);
    setTestResult(response.ok ? `${provider === "openai" ? "OpenAI" : "Gemini"} hoạt động (${data.latencyMs}ms)` : data.error ?? "Không kiểm tra được provider");
  }

  async function save() {
    if (!settings) return;
    const response = await fetch("/api/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    const data = await response.json();
    setSettings(data.settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  }

  if (!settings) return <div className="panel rounded-lg p-6 text-sm text-muted">Đang tải tri thức AI...</div>;

  return (
    <div className="space-y-4">
      <section className="panel rounded-lg p-4">
        <h2 className="font-semibold">Trạng thái nhà cung cấp AI</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <ProviderCard name="OpenAI" configured={providers.openai} testing={testing === "openai"} onTest={() => void testProvider("openai")} />
          <ProviderCard name="Gemini" configured={providers.gemini} testing={testing === "gemini"} onTest={() => void testProvider("gemini")} />
        </div>
        {testResult ? <div className="mt-3 rounded-md border border-line bg-white px-3 py-2 text-sm">{testResult}</div> : null}
      </section>
      <section className="panel rounded-lg p-4">
        <h2 className="font-semibold">Knowledge bán hàng toàn hệ thống</h2>
        <Area label="Thông tin thương hiệu" value={settings.brandKnowledge} onChange={(brandKnowledge) => setSettings({ ...settings, brandKnowledge })} />
        <Area label="FAQ" value={settings.faq} onChange={(faq) => setSettings({ ...settings, faq })} />
        <Area label="Chính sách bán hàng, giao hàng, thanh toán" value={settings.salesPolicies} onChange={(salesPolicies) => setSettings({ ...settings, salesPolicies })} />
        <button onClick={save} className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">{saved ? "Đã lưu" : "Lưu tri thức AI"}</button>
      </section>
    </div>
  );
}

function ProviderCard({ name, configured, testing, onTest }: { name: string; configured: boolean; testing: boolean; onTest: () => void }) {
  return (
    <div className="rounded-md border border-line p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">{name}</div>
          <div className={configured ? "text-sm text-leaf" : "text-sm text-coral"}>{configured ? "Đã cấu hình" : "Chưa cấu hình"}</div>
        </div>
        <button disabled={!configured || testing} onClick={onTest} className="rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50">
          {testing ? "Đang kiểm tra..." : `Kiểm tra ${name}`}
        </button>
      </div>
    </div>
  );
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="mt-4 block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-32 w-full rounded-md border border-line px-3 py-2" />
    </label>
  );
}
