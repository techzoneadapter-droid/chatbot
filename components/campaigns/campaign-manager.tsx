"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, Pause, Play, Send, Square, UsersRound } from "lucide-react";
import type { Campaign, CampaignPreviewRecipient, CampaignRecipient, CampaignSegment, CampaignTemplate, FacebookPage } from "@/lib/types";

const dayOptions = [1, 3, 7, 15, 30];

export function CampaignManager() {
  const [tab, setTab] = useState<"create" | "running" | "completed" | "templates">("create");
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [segment, setSegment] = useState<CampaignSegment>({ excludeHumanTakeover: true });
  const [preview, setPreview] = useState<CampaignPreviewRecipient[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("Chăm sóc khách hàng");
  const [message, setMessage] = useState("");
  const [goal, setGoal] = useState("");
  const [personalize, setPersonalize] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const [campaignResponse, pageResponse] = await Promise.all([fetch("/api/campaigns", { cache: "no-store" }), fetch("/api/facebook/pages", { cache: "no-store" })]);
    const campaignData = await campaignResponse.json();
    const pageData = await pageResponse.json();
    setCampaigns(campaignData.campaigns ?? []);
    setRecipients(campaignData.recipients ?? []);
    setTemplates(campaignData.templates ?? []);
    setPages(pageData.pages ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function runPreview() {
    setWorking("preview");
    const response = await fetch(`/api/campaigns?preview=1&segment=${encodeURIComponent(JSON.stringify(segment))}`, { cache: "no-store" });
    const data = await response.json();
    const rows = (data.recipients ?? []) as CampaignPreviewRecipient[];
    setPreview(rows);
    setSelected(rows.filter((row) => row.selected).map((row) => row.id));
    setNotice(`Đã lọc ${rows.length} khách`);
    setWorking(null);
  }

  async function create(start: boolean) {
    setWorking(start ? "start" : "create");
    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, segment, message_template: message, recipient_ids: selected, personalize })
    });
    const data = await response.json();
    if (response.ok && start && data.campaign?.id) {
      await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "control", campaign_id: data.campaign.id, status: "running" })
      });
    }
    setNotice(response.ok ? "Đã tạo campaign" : data.error ?? "Không tạo được campaign");
    setWorking(null);
    await load();
  }

  async function aiCopy() {
    setWorking("ai");
    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ai_copy", goal, segment, page_id: segment.pageIds?.[0] ?? null })
    });
    const data = await response.json();
    setMessage(data.message ?? "");
    setNotice(data.provider ? `AI đã soạn bằng ${data.provider}${data.model ? ` / ${data.model}` : ""}` : null);
    setWorking(null);
  }

  async function control(campaign: Campaign, status: "running" | "paused" | "stopped") {
    setWorking(`${status}:${campaign.id}`);
    await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "control", campaign_id: campaign.id, status })
    });
    setWorking(null);
    await load();
  }

  const selectedCount = selected.length;
  const eligibleCount = preview.filter((row) => selected.includes(row.id) && row.eligibility === "eligible").length;

  return (
    <div className="space-y-4">
      <div className="panel rounded-lg p-2">
        <div className="flex flex-wrap gap-2">
          {[
            ["create", "Tạo chiến dịch"],
            ["running", "Đang chạy"],
            ["completed", "Đã hoàn thành"],
            ["templates", "Mẫu tin"]
          ].map(([value, label]) => (
            <button key={value} onClick={() => setTab(value as typeof tab)} className={tab === value ? "rounded-md bg-ink px-3 py-2 text-sm font-medium text-white" : "rounded-md px-3 py-2 text-sm hover:bg-slate-100"}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {notice ? <div className="rounded-md border border-line bg-white px-3 py-2 text-sm">{notice}</div> : null}

      {tab === "create" ? (
        <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
          <section className="panel rounded-lg p-4">
            <h2 className="font-semibold">Bộ lọc khách</h2>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-muted">Page</span>
              <select value={segment.pageIds?.[0] ?? "all"} onChange={(event) => setSegment({ ...segment, pageIds: event.target.value === "all" ? [] : [event.target.value] })} className="w-full rounded-md border border-line px-3 py-2">
                <option value="all">Tất cả Page</option>
                {pages.map((page) => (
                  <option key={page.page_id} value={page.page_id}>
                    {page.page_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 space-y-2">
              <FilterToggle label="Chưa có SĐT" checked={Boolean(segment.missingPhone)} onChange={(value) => setSegment({ ...segment, missingPhone: value, hasPhone: false })} />
              <FilterToggle label="Đã có SĐT" checked={Boolean(segment.hasPhone)} onChange={(value) => setSegment({ ...segment, hasPhone: value, missingPhone: false })} />
              <FilterToggle label="Chưa có địa chỉ" checked={Boolean(segment.missingAddress)} onChange={(value) => setSegment({ ...segment, missingAddress: value, hasAddress: false })} />
              <FilterToggle label="Đã có địa chỉ" checked={Boolean(segment.hasAddress)} onChange={(value) => setSegment({ ...segment, hasAddress: value, missingAddress: false })} />
              <FilterToggle label="Chưa có nhu cầu" checked={Boolean(segment.missingProductInterest)} onChange={(value) => setSegment({ ...segment, missingProductInterest: value, hasProductInterest: false })} />
              <FilterToggle label="Có sản phẩm quan tâm" checked={Boolean(segment.hasProductInterest)} onChange={(value) => setSegment({ ...segment, hasProductInterest: value, missingProductInterest: false })} />
              <FilterToggle label="AI đang xử lý" checked={Boolean(segment.aiHandling)} onChange={(value) => setSegment({ ...segment, aiHandling: value, humanHandling: false })} />
              <FilterToggle label="Nhân viên đang xử lý" checked={Boolean(segment.humanHandling)} onChange={(value) => setSegment({ ...segment, humanHandling: value, aiHandling: false })} />
              <FilterToggle label="Bỏ qua human takeover" checked={Boolean(segment.excludeHumanTakeover)} onChange={(value) => setSegment({ ...segment, excludeHumanTakeover: value })} />
            </div>
            <DaySelect label="Không tương tác" value={segment.inactiveDays ?? 0} onChange={(value) => setSegment({ ...segment, inactiveDays: value || null })} />
            <DaySelect label="Lần nhắn cuối trong" value={segment.lastMessageWithinDays ?? 0} onChange={(value) => setSegment({ ...segment, lastMessageWithinDays: value || null })} />
            <button onClick={() => void runPreview()} disabled={working === "preview"} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
              <UsersRound className="h-4 w-4" />
              Lọc khách
            </button>
          </section>

          <section className="panel rounded-lg p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Danh sách người nhận</h2>
              <div className="text-sm text-muted">Đã chọn {selectedCount}/{preview.length} khách, đủ điều kiện {eligibleCount}</div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setSelected(preview.filter((row) => row.eligibility === "eligible").map((row) => row.id))} className="rounded-md border border-line px-3 py-2 text-sm">
                Chọn tất cả
              </button>
              <button onClick={() => setSelected([])} className="rounded-md border border-line px-3 py-2 text-sm">
                Bỏ chọn tất cả
              </button>
            </div>
            <div className="mt-3 max-h-80 overflow-auto rounded-md border border-line">
              {preview.map((row) => (
                <label key={row.id} className="grid cursor-pointer grid-cols-[28px_1fr] gap-2 border-b border-line px-3 py-2 text-sm last:border-b-0">
                  <input type="checkbox" checked={selected.includes(row.id)} disabled={row.eligibility !== "eligible"} onChange={(event) => setSelected((current) => (event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)))} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{row.customer_name || row.customer_psid}</span>
                    <span className="block text-xs text-muted">{row.page_name} - {row.phone || "chưa có SĐT"} - {row.address || "chưa có địa chỉ"}</span>
                    <span className={row.eligibility === "eligible" ? "block text-xs text-leaf" : "block text-xs text-coral"}>{row.eligibility}: {row.eligibility_reason}</span>
                  </span>
                </label>
              ))}
              {!preview.length ? <div className="p-4 text-sm text-muted">Chưa lọc khách.</div> : null}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Tên campaign</span>
                <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-md border border-line px-3 py-2" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Mục tiêu</span>
                <input value={goal} onChange={(event) => setGoal(event.target.value)} className="w-full rounded-md border border-line px-3 py-2" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {templates.map((template) => (
                <button key={template.name} onClick={() => setMessage(template.body)} className="rounded-md border border-line px-2 py-1 text-xs">
                  {template.name}
                </button>
              ))}
              <button onClick={() => void aiCopy()} disabled={working === "ai"} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs disabled:opacity-60">
                <Bot className="h-3.5 w-3.5" />
                AI soạn nội dung
              </button>
            </div>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} className="mt-3 w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="Nhập nội dung. Biến: {{name}}, {{page_name}}, {{product}}, {{phone}}" />
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={personalize} onChange={(event) => setPersonalize(event.target.checked)} />
              Cá nhân hóa bằng AI
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button onClick={() => void create(false)} disabled={!message.trim() || selectedCount === 0} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-60">
                <CheckCircle2 className="h-4 w-4" />
                Lưu nháp
              </button>
              <button onClick={() => void create(true)} disabled={!message.trim() || selectedCount === 0} className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
                <Send className="h-4 w-4" />
                Xác nhận gửi
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "running" ? <CampaignList campaigns={campaigns.filter((campaign) => ["draft", "running", "paused"].includes(campaign.status))} recipients={recipients} working={working} onControl={control} /> : null}
      {tab === "completed" ? <CampaignList campaigns={campaigns.filter((campaign) => ["completed", "stopped"].includes(campaign.status))} recipients={recipients} working={working} onControl={control} /> : null}
      {tab === "templates" ? <TemplateList templates={templates} /> : null}
    </div>
  );
}

function CampaignList({ campaigns, recipients, working, onControl }: { campaigns: Campaign[]; recipients: CampaignRecipient[]; working: string | null; onControl: (campaign: Campaign, status: "running" | "paused" | "stopped") => Promise<void> }) {
  return (
    <div className="grid gap-3">
      {campaigns.map((campaign) => {
        const rows = recipients.filter((recipient) => recipient.campaign_id === campaign.id);
        return (
          <article key={campaign.id} className="panel rounded-lg p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">{campaign.name}</h2>
                <p className="text-sm text-muted">{campaign.status} - {campaign.page_scope}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => void onControl(campaign, "paused")} disabled={working === `paused:${campaign.id}`} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-60">
                  <Pause className="h-4 w-4" />
                  Tạm dừng
                </button>
                <button onClick={() => void onControl(campaign, "running")} disabled={working === `running:${campaign.id}`} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-60">
                  <Play className="h-4 w-4" />
                  Tiếp tục
                </button>
                <button onClick={() => void onControl(campaign, "stopped")} disabled={working === `stopped:${campaign.id}`} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-coral disabled:opacity-60">
                  <Square className="h-4 w-4" />
                  Dừng
                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-6">
              <Metric label="Tổng" value={campaign.total_recipients} />
              <Metric label="Eligible" value={campaign.eligible_count} />
              <Metric label="Skipped" value={campaign.skipped_count} />
              <Metric label="Đang chờ" value={rows.filter((row) => row.status === "pending").length} />
              <Metric label="Đã gửi" value={campaign.sent_count} />
              <Metric label="Thất bại" value={campaign.failed_count} />
            </div>
          </article>
        );
      })}
      {!campaigns.length ? <div className="panel rounded-lg p-4 text-sm text-muted">Chưa có campaign.</div> : null}
    </div>
  );
}

function TemplateList({ templates }: { templates: CampaignTemplate[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {templates.map((template) => (
        <article key={template.name} className="panel rounded-lg p-4">
          <h2 className="font-semibold">{template.name}</h2>
          <p className="mt-2 text-sm text-muted">{template.body}</p>
        </article>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function FilterToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function DaySelect({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="mt-3 block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded-md border border-line px-3 py-2">
        <option value={0}>Không lọc</option>
        {dayOptions.map((day) => (
          <option key={day} value={day}>
            {day} ngày
          </option>
        ))}
      </select>
    </label>
  );
}
