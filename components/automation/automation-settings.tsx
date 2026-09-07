"use client";

import { useEffect, useState } from "react";
import type { AutomationSettings as Settings } from "@/lib/types";

export function AutomationSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/automation", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setSettings(data.settings));
  }, []);

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
    setTimeout(() => setSaved(false), 1800);
  }

  if (!settings) return <div className="panel rounded-lg p-6 text-sm text-muted">Đang tải cấu hình...</div>;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="panel rounded-lg p-4">
        <h2 className="font-semibold">Messenger</h2>
        <Toggle label="Auto reply" checked={settings.messenger.autoReply} onChange={(value) => setSettings({ ...settings, messenger: { ...settings.messenger, autoReply: value } })} />
        <Toggle label="AI sales mode" checked={settings.messenger.aiSalesMode} onChange={(value) => setSettings({ ...settings, messenger: { ...settings.messenger, aiSalesMode: value } })} />
        <Toggle label="Auto handoff" checked={settings.messenger.autoHandoff} onChange={(value) => setSettings({ ...settings, messenger: { ...settings.messenger, autoHandoff: value } })} />
      </section>
      <section className="panel rounded-lg p-4">
        <h2 className="font-semibold">Comment</h2>
        <Toggle label="Auto like" checked={settings.comment.autoLike} onChange={(value) => setSettings({ ...settings, comment: { ...settings.comment, autoLike: value } })} />
        <Toggle label="Auto reply" checked={settings.comment.autoReply} onChange={(value) => setSettings({ ...settings, comment: { ...settings.comment, autoReply: value } })} />
        <Toggle label="Auto hide comment có SĐT" checked={settings.comment.autoHidePhone} onChange={(value) => setSettings({ ...settings, comment: { ...settings.comment, autoHidePhone: value } })} />
        <Toggle label="Auto hide blacklist" checked={settings.comment.autoHideBlacklist} onChange={(value) => setSettings({ ...settings, comment: { ...settings.comment, autoHideBlacklist: value } })} />
      </section>
      <section className="panel rounded-lg p-4 xl:col-span-2">
        <h2 className="font-semibold">Rule và nội dung</h2>
        <Area label="Blacklist keywords" value={settings.blacklistKeywords.join("\n")} onChange={(value) => setSettings({ ...settings, blacklistKeywords: lines(value) })} />
        <Field label="Greeting" value={settings.greeting} onChange={(value) => setSettings({ ...settings, greeting: value })} />
        <Field label="Fallback reply" value={settings.fallbackReply} onChange={(value) => setSettings({ ...settings, fallbackReply: value })} />
        <Field label="Comment reply style" value={settings.commentReplyStyle} onChange={(value) => setSettings({ ...settings, commentReplyStyle: value })} />
        <Field label="Business hours" value={settings.businessHours} onChange={(value) => setSettings({ ...settings, businessHours: value })} />
        <Field label="Max consecutive bot replies" value={String(settings.maxConsecutiveBotReplies)} onChange={(value) => setSettings({ ...settings, maxConsecutiveBotReplies: Number(value) || 1 })} />
        <Area label="Handoff rules" value={settings.handoffRules.join("\n")} onChange={(value) => setSettings({ ...settings, handoffRules: lines(value) })} />
        <button onClick={save} className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">{saved ? "Đã lưu" : "Lưu cấu hình"}</button>
      </section>
    </div>
  );
}

function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="mt-3 flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="mt-3 block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-line px-3 py-2" />
    </label>
  );
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="mt-3 block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-24 w-full rounded-md border border-line px-3 py-2" />
    </label>
  );
}
