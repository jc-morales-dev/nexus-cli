/**
 * Curated list of OpenRouter models offered in the `/model` picker.
 *
 * Picking one sets the STRONG tier — the model NEXUS uses for reasoning and
 * editing. Utility agents (file search, context pruning) keep running on the
 * cheap tier, so this only swaps the "smart" model and your tokens still go far.
 *
 * IDs and prices were verified against the live OpenRouter catalog
 * (https://openrouter.ai/api/v1/models). Prices are USD per 1M tokens
 * (prompt / completion) and are only used to label the trade-off for the user —
 * actual billing is OpenRouter's. The user can also type any model id directly
 * with `/model <id>`, so this list is a convenience, not a hard allowlist.
 */
export type NexusModelTier = 'balanced' | 'premium' | 'free'

export interface NexusModel {
  /** OpenRouter model id, e.g. "deepseek/deepseek-v3.2". */
  id: string
  /** Short human label shown in the picker. */
  label: string
  /** One-line quality/cost note (Spanish, for Julio's audience). */
  tagline: string
  tier: NexusModelTier
}

/** The built-in default STRONG model: strong reasoning, very cheap. */
export const NEXUS_DEFAULT_MODEL = 'deepseek/deepseek-v3.2'

export const NEXUS_MODELS: readonly NexusModel[] = [
  // ---- Equilibrados: calidad alta a precio bajo (lo recomendado) ----------
  {
    id: 'deepseek/deepseek-v3.2',
    label: 'DeepSeek V3.2',
    tagline: 'Recomendado · razona muy bien, baratísimo ($0.23/$0.34)',
    tier: 'balanced',
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    tagline: 'Más nuevo, razonamiento top, barato ($0.43/$0.87)',
    tier: 'balanced',
  },
  {
    id: 'z-ai/glm-4.7',
    label: 'GLM 4.7',
    tagline: 'Muy fuerte en código, barato ($0.40/$1.75)',
    tier: 'balanced',
  },
  {
    id: 'qwen/qwen3-coder',
    label: 'Qwen3 Coder',
    tagline: 'Especialista en programar, barato ($0.22/$1.80)',
    tier: 'balanced',
  },
  // ---- Máxima calidad: lo mejor, más caro --------------------------------
  {
    id: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    tagline: 'Top para programar ($3/$15)',
    tier: 'premium',
  },
  {
    id: 'openai/gpt-5.1-codex',
    label: 'GPT-5.1 Codex',
    tagline: 'Top de OpenAI para código ($1.25/$10)',
    tier: 'premium',
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    tagline: 'Google, contexto enorme ($2/$12)',
    tier: 'premium',
  },
  {
    id: 'anthropic/claude-opus-4.8',
    label: 'Claude Opus 4.8',
    tagline: 'Máxima calidad de Anthropic ($5/$25)',
    tier: 'premium',
  },
  // ---- Gratis: con tu key, $0. SOLO los que respondieron rápido y estable en
  // pruebas reales contra OpenRouter (los populares como qwen3-coder/llama-3.3/
  // gpt-oss-120B dan 429 "saturado" casi siempre, por eso NO están acá). Aun así
  // el free tier puede saturarse; si uno tarda, NEXUS corta solo y podés cambiar.
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 3 Super (gratis)',
    tagline: 'Gratis · rápido y capaz ✓ probado',
    tier: 'free',
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    label: 'Gemma 4 26B (gratis)',
    tagline: 'Gratis · rápido y limpio ✓ probado',
    tier: 'free',
  },
  {
    id: 'google/gemma-4-31b-it:free',
    label: 'Gemma 4 31B (gratis)',
    tagline: 'Gratis · rápido ✓ probado',
    tier: 'free',
  },
  {
    id: 'openai/gpt-oss-20b:free',
    label: 'GPT-OSS 20B (gratis)',
    tagline: 'Gratis · rápido ✓ (el 120B se satura, este no)',
    tier: 'free',
  },
] as const

/** Human label for a model id (falls back to the raw id for custom models). */
export function nexusModelLabel(id: string): string {
  return NEXUS_MODELS.find((m) => m.id === id)?.label ?? id
}

export const NEXUS_TIER_LABELS: Record<NexusModelTier, string> = {
  balanced: 'EQUILIBRADOS  (calidad alta, barato)',
  premium: 'MÁXIMA CALIDAD  (lo mejor, más caro)',
  free: 'GRATIS  (con tu key, ojo el límite diario)',
}
