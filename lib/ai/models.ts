import type { AIProviderName } from "@/lib/types";

export const AI_MODELS: Record<AIProviderName, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
  gemini: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-flash-latest"],
  meta: []
};

export function isSupportedAIModel(provider: AIProviderName, model?: string | null) {
  if (provider === "meta") return Boolean(model?.trim());
  return Boolean(model && AI_MODELS[provider].includes(model));
}

export function defaultAIModel(provider: AIProviderName, envModel?: string | null) {
  if (provider === "meta") return envModel?.trim() || "";
  return isSupportedAIModel(provider, envModel) ? envModel!.trim() : AI_MODELS[provider][0];
}
