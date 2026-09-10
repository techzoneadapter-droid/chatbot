import type { AIProviderName, FacebookPage } from "@/lib/types";
import { AI_MODELS, defaultAIModel, isSupportedAIModel } from "@/lib/ai/models";
export { AI_MODELS } from "@/lib/ai/models";

export interface AIConfig {
  openaiApiKey: string | null;
  geminiApiKey: string | null;
  metaApiKey: string | null;
  defaultOpenAIModel: string;
  defaultGeminiModel: string;
  defaultMetaModel: string;
}

export interface PageAIConfig {
  provider: AIProviderName;
  model: string;
  fallbackProvider: AIProviderName | null;
  fallbackEnabled: boolean;
}

export function getAIConfig(): AIConfig {
  return {
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() || null,
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || null,
    metaApiKey: process.env.MODEL_API_KEY?.trim() || process.env.META_MODEL_API_KEY?.trim() || null,
    defaultOpenAIModel: defaultAIModel("openai", process.env.OPENAI_MODEL?.trim()),
    defaultGeminiModel: defaultAIModel("gemini", process.env.GEMINI_MODEL?.trim()),
    defaultMetaModel: defaultAIModel("meta", process.env.META_MODEL?.trim())
  };
}

export function isProviderConfigured(provider: AIProviderName) {
  const config = getAIConfig();
  if (provider === "openai") return Boolean(config.openaiApiKey);
  if (provider === "meta") return Boolean(config.metaApiKey);
  return Boolean(config.geminiApiKey);
}

export function getProviderStatus() {
  return {
    openai: isProviderConfigured("openai"),
    gemini: isProviderConfigured("gemini"),
    meta: isProviderConfigured("meta")
  };
}

export async function getProviderStatusAsync() {
  const { getProviderSecretStatus } = await import("@/lib/ai/secrets");
  return getProviderSecretStatus();
}

export async function getAIProviderStatus(provider: AIProviderName) {
  const status = await getProviderStatusAsync();
  return status[provider];
}

export async function getAIProviderSecret(provider: AIProviderName) {
  const { getProviderApiKey } = await import("@/lib/ai/secrets");
  return getProviderApiKey(provider);
}

export async function isAIProviderConfigured(provider: AIProviderName) {
  return getAIProviderStatus(provider);
}

type PageAIConfigSource = Pick<FacebookPage, "ai_provider" | "ai_model" | "ai_fallback_provider" | "ai_provider_fallback_enabled">;

export function resolvePageAIConfig(page?: Partial<PageAIConfigSource> | null): PageAIConfig {
  const config = getAIConfig();
  const provider: AIProviderName = page?.ai_provider === "meta" ? "meta" : "gemini";
  const requestedModel = page?.ai_model?.trim();
  const model = provider === "meta"
    ? requestedModel || config.defaultMetaModel
    : isSupportedAIModel("gemini", requestedModel)
      ? requestedModel!
      : config.defaultGeminiModel;
  return { provider, model, fallbackProvider: null, fallbackEnabled: false };
}

export async function resolvePageAIConfigAsync(page?: Partial<PageAIConfigSource> | null): Promise<PageAIConfig> {
  return resolvePageAIConfig(page);
}
