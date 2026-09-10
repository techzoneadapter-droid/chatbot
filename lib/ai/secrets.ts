import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { AIProviderName } from "@/lib/types";

type SecretMap = Partial<Record<AIProviderName, { encrypted: string; iv: string; tag: string; updated_at: string }>>;
export type AIProviderStatus = Record<AIProviderName, boolean> & { encryptedStoreReady?: boolean };

const SETTINGS_KEY = "ai_provider_secrets";

function encryptionKey() {
  const source = process.env.APP_ENCRYPTION_KEY || "";
  if (!source) return null;
  return createHash("sha256").update(source).digest();
}

export function canStoreEncryptedSecrets() {
  return Boolean(encryptionKey() && createServiceSupabaseClient());
}

export async function getProviderSecretStatus() {
  return {
    openai: Boolean(await getProviderApiKey("openai")),
    gemini: Boolean(await getProviderApiKey("gemini")),
    meta: Boolean(await getProviderApiKey("meta")),
    encryptedStoreReady: canStoreEncryptedSecrets()
  };
}

export async function getProviderApiKey(provider: AIProviderName) {
  const key = encryptionKey();
  if (key) {
    const stored = (await readSecretMap())[provider];
    if (stored) {
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(stored.iv, "base64"));
        decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
        const decrypted = Buffer.concat([decipher.update(Buffer.from(stored.encrypted, "base64")), decipher.final()]);
        const storedKey = decrypted.toString("utf8").trim();
        if (storedKey) return storedKey;
      } catch {
        return null;
      }
    }
  }
  if (provider === "openai") return process.env.OPENAI_API_KEY?.trim() || null;
  if (provider === "meta") return process.env.MODEL_API_KEY?.trim() || process.env.META_MODEL_API_KEY?.trim() || null;
  return process.env.GEMINI_API_KEY?.trim() || null;
}

export async function saveProviderApiKey(provider: AIProviderName, apiKey: string) {
  const supabase = createServiceSupabaseClient();
  const key = encryptionKey();
  if (!supabase || !key) throw new Error("Encrypted secret store is not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const current = await readSecretMap();
  const next: SecretMap = {
    ...current,
    [provider]: {
      encrypted: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      updated_at: new Date().toISOString()
    }
  };
  const { error } = await supabase.from("settings").upsert({ key: SETTINGS_KEY, value: next, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function deleteProviderApiKey(provider: AIProviderName) {
  const supabase = createServiceSupabaseClient();
  const key = encryptionKey();
  if (!supabase || !key) throw new Error("Encrypted secret store is not configured");
  const current = await readSecretMap();
  const { [provider]: _deleted, ...next } = current;
  const { error } = await supabase.from("settings").upsert({ key: SETTINGS_KEY, value: next, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

async function readSecretMap(): Promise<SecretMap> {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return {};
  const { data } = await supabase.from("settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  return (data?.value && typeof data.value === "object" ? data.value : {}) as SecretMap;
}
