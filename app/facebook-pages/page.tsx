import { SimplePageBotManager } from "@/components/facebook/simple-page-bot-manager";
import { AppShell } from "@/components/ui/shell";

export default function FacebookPagesPage() {
  return (
    <AppShell title="Facebook Pages" subtitle="Kết nối nhiều Page và nạp dữ liệu riêng để Gemini tự trả lời khách Messenger.">
      <SimplePageBotManager />
    </AppShell>
  );
}
