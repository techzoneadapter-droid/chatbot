import { CampaignManager } from "@/components/campaigns/campaign-manager";
import { AppShell } from "@/components/ui/shell";

export default function CampaignsPage() {
  return (
    <AppShell title="Campaign" subtitle="Cham soc khach hang theo bo loc, eligibility va queue gui an toan.">
      <CampaignManager />
    </AppShell>
  );
}
