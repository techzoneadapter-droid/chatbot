"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { Lead } from "@/lib/types";

interface Stats {
  totalConversations: number;
  todaysConversations: number;
  newLeads: number;
  qualifiedLeads: number;
  hotLeads: number;
  phoneNumbers: number;
  conversionRate: number;
}

export function StatsGrid() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Lead[]>([]);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((response) => response.json())
      .then((data) => {
        setStats(data.stats);
        setRecent(data.recentLeads);
      });
  }, []);

  const items = [
    ["Total conversations", stats?.totalConversations ?? 0],
    ["Today's conversations", stats?.todaysConversations ?? 0],
    ["New leads", stats?.newLeads ?? 0],
    ["Qualified leads", stats?.qualifiedLeads ?? 0],
    ["Hot leads", stats?.hotLeads ?? 0],
    ["Phones collected", stats?.phoneNumbers ?? 0],
    ["Conversion rate", `${stats?.conversionRate ?? 0}%`]
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="panel rounded-lg p-4">
            <div className="text-sm text-muted">{label}</div>
            <div className="mt-2 text-3xl font-bold text-ink">{value}</div>
          </div>
        ))}
      </div>
      <div className="panel overflow-hidden rounded-lg">
        <div className="border-b border-line px-4 py-3 font-semibold">Recent Leads</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-muted">
              <tr>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Need</th>
                <th className="px-4 py-3">Intent</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((lead) => (
                <tr key={lead.id} className="border-t border-line">
                  <td className="px-4 py-3">{lead.normalized_phone || "-"}</td>
                  <td className="px-4 py-3">{lead.project_type || lead.area || "-"}</td>
                  <td className="px-4 py-3">{lead.intent}</td>
                  <td className="px-4 py-3">{lead.lead_score}</td>
                  <td className="px-4 py-3">
                    <Badge tone={lead.status === "QUALIFIED" ? "good" : "neutral"}>{lead.status}</Badge>
                  </td>
                </tr>
              ))}
              {recent.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted" colSpan={5}>
                    No leads yet. Use the simulator to create one.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
