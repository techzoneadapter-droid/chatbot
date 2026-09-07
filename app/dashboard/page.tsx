import { StatsGrid } from "@/components/dashboard/stats-grid";
import { AppShell } from "@/components/ui/shell";

export default function DashboardPage() {
  return (
    <AppShell title="Dashboard" subtitle="Lead conversion and Messenger performance snapshot.">
      <StatsGrid />
    </AppShell>
  );
}
