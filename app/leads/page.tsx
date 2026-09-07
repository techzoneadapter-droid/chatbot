import { LeadsTable } from "@/components/leads/leads-table";
import { AppShell } from "@/components/ui/shell";

export default function LeadsPage() {
  return (
    <AppShell title="Leads" subtitle="Qualified paint prospects and follow-up workflow.">
      <LeadsTable />
    </AppShell>
  );
}
