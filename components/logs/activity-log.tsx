"use client";

import { useEffect, useState } from "react";

export function ActivityLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/logs", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setLogs(data.logs ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="panel overflow-hidden rounded-lg">
      <div className="border-b border-line px-4 py-3 font-semibold">Nhật ký hoạt động</div>
      {loading ? <div className="p-6 text-sm text-muted">Đang tải nhật ký...</div> : null}
      {!loading && logs.length === 0 ? <div className="p-6 text-sm text-muted">Chưa có hoạt động nào được ghi nhận.</div> : null}
      <div className="divide-y divide-line">
        {logs.map((log) => (
          <div key={log.id} className="px-4 py-3 text-sm">
            <div className="font-medium">{log.message}</div>
            <div className="mt-1 text-muted">{log.type} · {new Date(log.created_at).toLocaleString("vi-VN")}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
