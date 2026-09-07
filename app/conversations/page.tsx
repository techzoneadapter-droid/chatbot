import { ConversationConsole } from "@/components/conversations/conversation-console";
import { AppShell } from "@/components/ui/shell";

export default function ConversationsPage() {
  return (
    <AppShell title="Inbox" subtitle="Quản lý lịch sử chat và trạng thái AI/human handoff.">
      <ConversationConsole />
    </AppShell>
  );
}
