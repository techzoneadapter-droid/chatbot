import { FacebookPagesManager } from "@/components/facebook/facebook-pages-manager";
import { AppShell } from "@/components/ui/shell";

export default function FacebookPagesPage() {
  return (
    <AppShell title="Facebook Pages" subtitle="Kết nối OAuth, quản lý Page và automation theo từng Page.">
      <FacebookPagesManager />
    </AppShell>
  );
}
