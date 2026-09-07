import { SettingsPanel } from "@/components/settings/settings-panel";
import { AppShell } from "@/components/ui/shell";
import { getProviderStatusAsync } from "@/lib/ai/config";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function appUrl() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://chatbot-one-jet-76.vercel.app").replace(/\/$/, "");
}

export default async function SettingsPage() {
  const providers = await getProviderStatusAsync();
  const baseUrl = appUrl();

  return (
    <AppShell title="Cài đặt" subtitle="Cấu hình AI, Facebook, Supabase và trạng thái hệ thống.">
      <SettingsPanel
        initialStatus={{
          providers,
          facebook: {
            "App ID": Boolean(process.env.FACEBOOK_APP_ID),
            "App Secret": Boolean(process.env.FACEBOOK_APP_SECRET),
            "Verify Token": Boolean(process.env.FACEBOOK_VERIFY_TOKEN),
            "Graph API Version": process.env.FACEBOOK_GRAPH_API_VERSION || process.env.FACEBOOK_GRAPH_VERSION || "v26.0",
            "Webhook URL": `${baseUrl}/api/facebook/webhook`
          },
          supabase: {
            URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
            "anon key": Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
            "service role": Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
            "Supabase configured": isSupabaseConfigured()
          },
          system: {
            "APP URL": baseUrl,
            Realtime: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
            Environment: process.env.VERCEL_ENV === "production" ? "Production" : process.env.NODE_ENV ?? "development",
            "Encryption status": providers.encryptedStoreReady ? "Đã cấu hình" : "Chưa cấu hình"
          }
        }}
      />
    </AppShell>
  );
}
