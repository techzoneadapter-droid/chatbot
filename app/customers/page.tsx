import { LeadsTable } from "@/components/leads/leads-table";
import { AppShell } from "@/components/ui/shell";

export default function CustomersPage() {
  return (
    <AppShell title="Khách hàng" subtitle="Hồ sơ khách, SĐT, nhu cầu, nguồn và trạng thái chăm sóc.">
      <LeadsTable />
    </AppShell>
  );
}
