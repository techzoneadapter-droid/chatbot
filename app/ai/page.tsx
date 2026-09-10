import { ProviderSettings } from "@/components/ai/provider-settings";
import { AppShell } from "@/components/ui/shell";

export default function AIPage() {
  return (
    <AppShell title="AI API" subtitle="Cấu hình Gemini và Meta Model API dùng cho các Facebook Page.">
      <ProviderSettings />
    </AppShell>
  );
}
