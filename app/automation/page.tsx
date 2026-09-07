import { AutomationSettings } from "@/components/automation/automation-settings";
import { AppShell } from "@/components/ui/shell";

export default function AutomationPage() {
  return (
    <AppShell title="Automation" subtitle="Bật tắt auto reply, auto like, auto hide và rule bàn giao cho sale.">
      <AutomationSettings />
    </AppShell>
  );
}
