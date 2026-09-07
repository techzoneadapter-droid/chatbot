import { ActivityLog } from "@/components/logs/activity-log";
import { AppShell } from "@/components/ui/shell";

export default function LogsPage() {
  return (
    <AppShell title="Nhật ký" subtitle="Theo dõi webhook, automation, cấu hình và đơn hàng.">
      <ActivityLog />
    </AppShell>
  );
}
