import { GeminiSettings } from "@/components/ai/gemini-settings";
import { AppShell } from "@/components/ui/shell";

export default function AIPage() {
  return (
    <AppShell title="Gemini API" subtitle="Cấu hình API Gemini dùng chung cho toàn bộ Page.">
      <GeminiSettings />
    </AppShell>
  );
}
