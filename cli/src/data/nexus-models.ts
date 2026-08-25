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
export type NexusModelTier = 'frontier' | 'premium' | 'value' | 'free'

export interface NexusModel {
  /** OpenRouter model id, e.g. "deepseek/deepseek-v3.2". */
  id: string
  /** Short human label shown in the picker. */
  label: string
  /** One-line quality/cost note (Spanish, for Julio's audience). */
  tagline: string
  tier: NexusModelTier
}

/** The built-in default STRONG model: frontier-class, 1M ctx, currently $0. */
export const NEXUS_DEFAULT_MODEL = 'stealth/ox-alpha'

/**
 * Models OpenRouter ships "cloaked": the provider is anonymous and, per the
 * listing terms, prompts and completions are logged so the lab can evaluate
 * the model. That matters more than usual for a coding agent, which reads your
 * source. Also worth knowing: a stealth id is temporary — OpenRouter retires it
 * without notice once the cloak lifts, and requests then start 404ing, so
 * `/model <otro-id>` is the escape hatch.
 */
const NEXUS_STEALTH_MODEL_IDS: readonly string[] = ['stealth/ox-alpha']

export function isNexusStealthModel(id: string): boolean {
  return NEXUS_STEALTH_MODEL_IDS.includes(id)
}

/** Warning appended when a stealth model is selected. */
export const NEXUS_STEALTH_WARNING =
  '⚠ Es un modelo "stealth": el proveedor es anónimo y registra tus prompts (o sea, tu código) para evaluarlo. Además puede desaparecer sin aviso — si empieza a fallar, cambiá con /model <id>.'

export const NEXUS_MODELS: readonly NexusModel[] = [
  // ---- SUPER POTENTES: la frontera absoluta -------------------------------
  {
    id: 'stealth/ox-alpha',
    label: 'Ox Alpha',
    tagline: 'Por defecto · frontera anónima · 1M ctx · GRATIS ⚠ registra tus prompts',
    tier: 'frontier',
  },
  {
    id: 'anthropic/claude-fable-5',
    label: 'Claude Fable 5',
    tagline: 'Lo más potente que existe · 1M ctx ($10/$50)',
    tier: 'frontier',
  },
  {
    id: 'openai/gpt-5.5',
    label: 'GPT-5.5',
    tagline: 'Frontera de OpenAI · 1M ctx ($5/$30)',
    tier: 'frontier',
  },
  {
    id: 'sakana/fugu-ultra',
    label: 'Fugu Ultra',
    tagline: 'Frontera de Sakana · 1M ctx ($5/$30)',
    tier: 'frontier',
  },
  {
    id: 'anthropic/claude-opus-4.8',
    label: 'Claude Opus 4.8',
    tagline: 'Razonamiento profundo de Anthropic ($5/$25)',
    tier: 'frontier',
  },
  // ---- POTENTES: top para programar a precio medio ------------------------
  {
    id: 'anthropic/claude-sonnet-5',
    label: 'Claude Sonnet 5',
    tagline: 'Top para programar · 1M ctx ($2/$10)',
    tier: 'premium',
  },
  {
    id: 'openai/gpt-5.2-codex',
    label: 'GPT-5.2 Codex',
    tagline: 'Especialista en código de OpenAI ($1.75/$14)',
    tier: 'premium',
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    tagline: 'Google, contexto enorme ($2/$12)',
    tier: 'premium',
  },
  {
    id: 'x-ai/grok-4.20',
    label: 'Grok 4.20',
    tagline: 'xAI · 2M ctx, rápido ($1.25/$2.50)',
    tier: 'premium',
  },
  // ---- FRONTERA BARATÍSIMOS: nivel top a precio de risa -------------------
  {
    id: 'deepseek/deepseek-v3.2',
    label: 'DeepSeek V3.2',
    tagline: 'Recomendado · razona muy bien, baratísimo ($0.23/$0.34)',
    tier: 'value',
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    tagline: 'Nivel frontera · 1M ctx ($0.43/$0.87)',
    tier: 'value',
  },
  {
    id: 'z-ai/glm-5.2',
    label: 'GLM 5.2',
    tagline: 'Bestia en código · 1M ctx ($0.74/$2.33)',
    tier: 'value',
  },
  {
    id: 'moonshotai/kimi-k2.7-code',
    label: 'Kimi K2.7 Code',
    tagline: 'Especialista en código ($0.74/$3.50)',
    tier: 'value',
  },
  {
    id: 'minimax/minimax-m3',
    label: 'MiniMax M3',
    tagline: 'Agéntico fuerte · 1M ctx ($0.30/$1.20)',
    tier: 'value',
  },
  {
    id: 'qwen/qwen3.5-plus-20260420',
    label: 'Qwen 3.5 Plus',
    tagline: 'Alibaba, muy completo · 1M ctx ($0.30/$1.80)',
    tier: 'value',
  },
  {
    id: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    tagline: 'Ultra barato y rapidísimo · 1M ctx ($0.09/$0.18)',
    tier: 'value',
  },
  // ---- Gratis: con tu key, $0. SOLO los que respondieron rápido y estable en
  // pruebas reales contra OpenRouter (última medición: 4/jul/2026, 4 sondas por
  // modelo). La saturación del free tier ROTA con las semanas: hoy qwen3-coder/
  // qwen3-next/gpt-oss-120B dan 429 casi siempre, los Gemma 4 se saturaron y
  // gpt-oss-20b/poolside/cohere devuelven vacío — por eso NO están acá. Si uno
  // tarda, NEXUS corta solo y podés cambiar. Cualquier otro id se puede usar a
  // mano: `/model qwen/qwen3-coder:free`.
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 3 Super (gratis)',
    tagline: 'Gratis · rápido y capaz ✓ estable (jul 2026)',
    tier: 'free',
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'Llama 3.3 70B (gratis)',
    tagline: 'Gratis · el clásico de Meta ✓ estable (jul 2026)',
    tier: 'free',
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b:free',
    label: 'Nemotron 3 Nano (gratis)',
    tagline: 'Gratis · chico y ágil ✓ estable (jul 2026)',
    tier: 'free',
  },
] as const

/** Human label for a model id (falls back to the raw id for custom models). */
export function nexusModelLabel(id: string): string {
  return NEXUS_MODELS.find((m) => m.id === id)?.label ?? id
}

export const NEXUS_TIER_LABELS: Record<NexusModelTier, string> = {
  frontier: 'SUPER POTENTES  (frontera absoluta)',
  premium: 'POTENTES  (top para programar, precio medio)',
  value: 'FRONTERA BARATÍSIMOS  (nivel top, precio de risa)',
  free: 'GRATIS  (con tu key, ojo el límite diario)',
}
