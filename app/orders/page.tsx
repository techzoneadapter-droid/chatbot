import { OrdersTable } from "@/components/orders/orders-table";
import { AppShell } from "@/components/ui/shell";

export default function OrdersPage() {
  return (
    <AppShell title="Đơn hàng" subtitle="Đơn nháp và đơn cần sale xác nhận trước khi xử lý.">
      <OrdersTable />
    </AppShell>
  );
}
