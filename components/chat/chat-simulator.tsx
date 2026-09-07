"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Send, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ConversationState, Lead, Message } from "@/lib/types";
import { scoreLabel } from "@/lib/ai/lead-scorer";

interface ChatPayload {
  messages: Message[];
  state: ConversationState;
  lead?: Lead;
}

export function ChatSimulator() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<ConversationState | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    const response = await fetch("/api/chat", { cache: "no-store" });
    const data = (await response.json()) as ChatPayload;
    setMessages(data.messages);
    setState(data.state);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const message = text.trim();
    if (!message || loading) return;
    setText("");
    setLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chat failed");
      setMessages(data.messages);
      setState(data.state);
      setLead(data.lead ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function reset() {
    await fetch("/api/chat", { method: "DELETE" });
    setLead(null);
    await load();
  }

  const score = state?.lead_score ?? 0;
  const label = scoreLabel(score);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="panel flex min-h-[680px] flex-col overflow-hidden rounded-lg">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="font-semibold text-ink">Local Messenger Simulator</div>
            <div className="text-sm text-muted">Test hội thoại, memory, scoring và phone capture ngay tại máy.</div>
          </div>
          <button
            onClick={reset}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-slate-700 hover:bg-slate-50"
            title="Reset conversation"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
          {messages.length === 0 ? (
            <div className="mx-auto mt-24 max-w-lg text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-brand text-white">
                <UserRound className="h-6 w-6" />
              </div>
              <p className="mt-4 font-semibold">Bắt đầu bằng một tin nhắn khách hàng.</p>
              <p className="mt-1 text-sm text-muted">Ví dụ: “Nhà tôi 2 tầng, muốn sơn lại nội thất.”</p>
            </div>
          ) : null}
          {messages.map((message) => (
            <div key={message.id} className={message.sender_type === "customer" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  message.sender_type === "customer"
                    ? "max-w-[82%] rounded-lg bg-brand px-4 py-3 text-sm leading-relaxed text-white"
                    : "max-w-[82%] rounded-lg border border-line bg-white px-4 py-3 text-sm leading-relaxed text-ink"
                }
              >
                {message.message}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-line bg-white p-3">
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void send();
              }}
              placeholder="Nhập tin nhắn khách hàng..."
              className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 outline-none focus:border-brand"
            />
            <button
              onClick={send}
              disabled={loading}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-coral text-white disabled:opacity-60"
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="panel rounded-lg p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Lead Intelligence</h2>
            <Badge tone={label === "HOT" ? "hot" : label === "WARM" ? "warm" : "neutral"}>{label}</Badge>
          </div>
          <div className="h-2 overflow-hidden rounded bg-slate-100">
            <div className="h-full bg-leaf" style={{ width: `${score}%` }} />
          </div>
          <div className="mt-2 text-sm text-muted">{score}/100</div>
        </div>
        <div className="panel rounded-lg p-4">
          <h2 className="mb-3 font-semibold">Customer Information</h2>
          <Info label="Name" value={state?.collected_name} />
          <Info label="Phone" value={state?.collected_phone} />
          <Info label="Location" value={state?.collected_location} />
          <Info label="Area" value={state?.collected_area} />
          <Info label="Project" value={state?.collected_project_type} />
          <Info label="Interest" value={state?.collected_product_interest} />
          <Info label="Budget" value={state?.collected_budget} />
        </div>
        <div className="panel rounded-lg p-4">
          <h2 className="mb-3 font-semibold">Conversation State</h2>
          <Info label="Intent" value={state?.current_intent} />
          <Info label="Stage" value={state?.qualification_stage} />
          <Info label="Phone capture" value={state?.collected_phone ? "Captured" : state?.should_request_phone ? "Triggered" : "Not yet"} />
          <Info label="Handoff" value={state?.should_handoff ? "Required" : "No"} />
          <Info label="Lead status" value={lead?.status} />
        </div>
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className="max-w-[190px] truncate font-medium text-ink">{value || "-"}</span>
    </div>
  );
}
