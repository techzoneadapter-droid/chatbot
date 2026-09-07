import { ChatSimulator } from "@/components/chat/chat-simulator";
import { AppShell } from "@/components/ui/shell";

export default function HomePage() {
  return (
    <AppShell title="AI Paint Sales Chat" subtitle="Local simulator for Vietnamese paint sales conversations.">
      <ChatSimulator />
    </AppShell>
  );
}
