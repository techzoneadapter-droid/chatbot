"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { Lead, LeadStatus } from "@/lib/types";
import { formatShortDate } from "@/lib/utils/time";

const statuses: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];

export function LeadsTable() {
  const [leads, setLeads] = useState<Lead[]>([]);

  async function load() {
    const response = await fetch("/api/leads", { cache: "no-store" });
    const data = await response.json();
    setLeads(data.leads);
  }

  useEffect(() => {
    void load();
  }, []);

  async function updateStatus(id: string, status: LeadStatus) {
    const response = await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status })
    });
    const data = await response.json();
    setLeads(data.leads);
  }

  return (
    <div className="panel overflow-hidden rounded-lg">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-left text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Area</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Intent</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t border-line align-top">
                <td className="px-4 py-3">{lead.customer_name || "-"}</td>
                <td className="px-4 py-3 font-medium">{lead.normalized_phone || "-"}</td>
                <td className="px-4 py-3">{lead.location || "-"}</td>
                <td className="px-4 py-3">{lead.project_type || "-"}</td>
                <td className="px-4 py-3">{lead.area || "-"}</td>
                <td className="px-4 py-3">{lead.interested_products?.join(", ") || "-"}</td>
                <td className="px-4 py-3">{lead.intent}</td>
                <td className="px-4 py-3">
                  <Badge tone={lead.lead_score >= 70 ? "hot" : lead.lead_score >= 40 ? "warm" : "neutral"}>
                    {lead.lead_score}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={lead.status}
                    onChange={(event) => void updateStatus(lead.id, event.target.value as LeadStatus)}
                    className="rounded-md border border-line bg-white px-2 py-1"
                  >
                    {statuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">{lead.source || "-"}</td>
                <td className="px-4 py-3">{formatShortDate(lead.created_at)}</td>
              </tr>
            ))}
            {leads.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted" colSpan={11}>
                  No leads yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
