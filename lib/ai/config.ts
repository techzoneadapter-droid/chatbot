import type { AIProviderName, FacebookPage } from "@/lib/types";
import { AI_MODELS, defaultAIModel, isSupportedAIModel } from "@/lib/ai/models";
export { AI_MODELS } from "@/lib/ai/models";

export interface AIConfig {
  openaiApiKey: string | null;
  geminiApiKey: string | null;
  defaultOpenAIModel: string;
  defaultGeminiModel: string;
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
    defaultOpenAIModel: defaultAIModel("openai", process.env.OPENAI_MODEL?.trim()),
    defaultGeminiModel: defaultAIModel("gemini", process.env.GEMINI_MODEL?.trim())
  };
}

export function isProviderConfigured(provider: AIProviderName) {
  const config = getAIConfig();
  return provider === "openai" ? Boolean(config.openaiApiKey) : Boolean(config.geminiApiKey);
}

export function getProviderStatus() {
  return {
    openai: isProviderConfigured("openai"),
    gemini: isProviderConfigured("gemini")
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
  const provider: AIProviderName = "gemini";
  const requestedModel = page?.ai_model?.trim();
  const model = isSupportedAIModel(provider, requestedModel) ? requestedModel! : config.defaultGeminiModel;
  return { provider, model, fallbackProvider: null, fallbackEnabled: false };
}

export async function resolvePageAIConfigAsync(page?: Partial<PageAIConfigSource> | null): Promise<PageAIConfig> {
  return resolvePageAIConfig(page);
}
