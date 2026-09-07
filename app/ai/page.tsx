import { KnowledgeSettings } from "@/components/ai/knowledge-settings";
import { AppShell } from "@/components/ui/shell";

export default function AIPage() {
  return (
    <AppShell title="AI" subtitle="Quản trị tri thức AI dùng để tư vấn, không cho phép tự bịa giá/chính sách.">
      <KnowledgeSettings />
    </AppShell>
  );
}
