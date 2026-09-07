import { ConversationConsole } from "@/components/conversations/conversation-console";
import { AppShell } from "@/components/ui/shell";

export default function InboxPage() {
  return (
    <AppShell title="Inbox" subtitle="Quản lý hội thoại Messenger, tiếp quản thủ công hoặc bật lại AI.">
      <ConversationConsole />
    </AppShell>
  );
}
