/**
 * Model provider abstraction for routing requests to the appropriate LLM provider.
 *
 * This module handles:
 * - BYOK OpenRouter: direct requests with the user's own OpenRouter key
 * - Default: Requests through Nexus backend (which routes to OpenRouter)
 */

import path from 'path'

import { BYOK_OPENROUTER_HEADER } from '@nexus/common/constants/byok'
import {
  OpenAICompatibleChatLanguageModel,
  VERSION,
} from '@nexus/llm-providers/openai-compatible'

import { createAnthropic } from '@ai-sdk/anthropic'

import { WEBSITE_URL } from '../constants'
import {
  getActiveProviderFromEnv,
  getAnthropicApiKeyFromEnv,
  getByokOpenrouterApiKeyFromEnv,
  getCheapModelFromEnv,
  getForcedModelFromEnv,
  getNvidiaApiBaseFromEnv,
  getNvidiaApiKeyFromEnv,
  getOpenAiApiBaseFromEnv,
  getOpenAiApiKeyFromEnv,
  getOpenRouterApiKeyFromEnv,
  getStrongModelFromEnv,
  OPENROUTER_API_BASE,
} from '../env'

import type { LanguageModel } from 'ai'

/**
 * Parameters for requesting a model.
 */
export interface ModelRequestParams {
  /** Nexus API key for backend authentication */
  apiKey: string
  /** Model ID (OpenRouter format, e.g., "anthropic/claude-sonnet-4") */
  model: string
}

/** Markers in a nominal model id that signal a cheap/fast/utility-tier model. */
const CHEAP_TIER_MODEL_RE = /(flash|lite|mini|nano|haiku)/i

/**
 * Resolve which model id to actually call for a given agent's requested model:
 * 1. NEXUS_MODEL — a single forced model for everything (highest priority).
 * 2. Tiered map — classify the requested model (cheap markers -> CHEAP tier,
 *    otherwise STRONG tier) and use NEXUS_MODEL_CHEAP / NEXUS_MODEL_STRONG.
 *    If only one tier is configured, it is used for both tiers.
 * 3. Otherwise the agent's own requested model (unchanged).
 */
function resolveModelOverride(requestedModel: string): string {
  const forced = getForcedModelFromEnv()
  if (forced) return forced

  const cheap = getCheapModelFromEnv()
  const strong = getStrongModelFromEnv()
  if (!cheap && !strong) return requestedModel

  return CHEAP_TIER_MODEL_RE.test(requestedModel)
    ? (cheap ?? strong ?? requestedModel)
    : (strong ?? cheap ?? requestedModel)
}

// Usage accounting type for OpenRouter/Nexus backend responses
type OpenRouterUsageAccounting = {
  cost: number | null
  costDetails: {
    upstreamInferenceCost: number | null
  }
}

/**
 * Get the appropriate model for a request.
 *
 * Routes directly to OpenRouter when the user has their own key (BYOK), and
 * otherwise through the Nexus backend.
 */
export function getModelForRequest(params: ModelRequestParams): LanguageModel {
  const { apiKey } = params

  // Resolve the effective model: single override, or the tiered STRONG/CHEAP
  // map, or the agent's own requested model. See resolveModelOverride.
  const model = resolveModelOverride(params.model)

  // The user picked a provider that isn't OpenRouter. Dispatch on it rather
  // than guessing from the model id: the id alone is ambiguous once more than
  // one provider is configured (`anthropic/claude-sonnet-5` on OpenRouter vs
  // `claude-sonnet-5` on Anthropic are the same model by two routes).
  //
  // Deliberately placed BEFORE the OpenRouter branch and gated on an explicit
  // provider: an install that never sets NEXUS_PROVIDER — which is every
  // install that exists today — takes exactly the same path it always did.
  const provider = getActiveProviderFromEnv()
  if (provider && provider !== 'openrouter') {
    return createModelForProvider(provider, model)
  }

  // Direct BYOK provider (highest priority): route straight to the user's own
  // provider, bypassing the Nexus backend entirely — no account or credits.
  // OpenRouter hosts the same model ids the agents already use.
  const openRouterApiKey = getOpenRouterApiKeyFromEnv()
  if (openRouterApiKey) {
    return createOpenRouterDirectModel(model, openRouterApiKey)
  }

  // NEXUS is account-less: if no provider key is set yet, guide the user to add
  // one instead of silently failing against a Nexus backend that isn't there.
  if (process.env.NEXUS_MODE) {
    // The wording is load-bearing: cli-errors.ts matches on "no openrouter api
    // key" to classify this as `missing-api-key` and render the full guidance
    // (which env var, which command, where to get one). Keep the phrase if you
    // reword the rest.
    throw new Error(
      'No OpenRouter API key set. NEXUS is BYOK: add yours with "/key sk-or-..." ' +
        'or set OPENROUTER_API_KEY. Get one at https://openrouter.ai/keys — ' +
        'there are free models, and "nexus doctor" checks your setup.',
    )
  }

  // Default: use Nexus backend
  return createNexusBackendModel(apiKey, model)
}

/**
 * Build the client for a provider the user explicitly chose.
 *
 * Missing keys throw with the provider named and where to get one: the raw
 * 401 from a vendor is useless for working out which of four configured
 * providers is the one that isn't set up.
 */
function createModelForProvider(
  provider: string,
  model: string,
): LanguageModel {
  switch (provider) {
    case 'anthropic': {
      const apiKey = getAnthropicApiKeyFromEnv()
      if (!apiKey) {
        throw new Error(
          missingKeyMessage(
            'Anthropic',
            'ANTHROPIC_API_KEY',
            'https://console.anthropic.com/settings/keys',
          ),
        )
      }
      // Anthropic is the one provider here that is NOT OpenAI-compatible, so it
      // gets its own SDK instead of the shared OpenAI-compatible client.
      return createAnthropic({ apiKey })(model)
    }

    case 'openai': {
      const apiKey = getOpenAiApiKeyFromEnv()
      if (!apiKey) {
        throw new Error(
          missingKeyMessage(
            'OpenAI',
            'OPENAI_API_KEY',
            'https://platform.openai.com/api-keys',
          ),
        )
      }
      return createOpenAiCompatibleModel({
        model,
        apiKey,
        provider: 'openai',
        baseUrl: getOpenAiApiBaseFromEnv(),
      })
    }

    case 'nvidia': {
      const apiKey = getNvidiaApiKeyFromEnv()
      if (!apiKey) {
        throw new Error(
          missingKeyMessage(
            'NVIDIA',
            'NVIDIA_API_KEY',
            'https://build.nvidia.com',
          ),
        )
      }
      return createOpenAiCompatibleModel({
        model,
        apiKey,
        provider: 'nvidia',
        baseUrl: getNvidiaApiBaseFromEnv(),
      })
    }

    case 'codex':
      // Sign-in-with-ChatGPT is a different beast: an OAuth flow with tokens
      // that refresh, not a key. Named explicitly so the failure says what is
      // missing instead of "unknown provider".
      throw new Error(
        'Codex (entrar con tu cuenta de ChatGPT) todavía no está implementado. ' +
          'Elegí otro proveedor con "/model".',
      )

    default:
      throw new Error(
        `Proveedor desconocido: "${provider}". ` +
          'Elegí uno con "/model", o borrá NEXUS_PROVIDER para volver a OpenRouter.',
      )
  }
}

function missingKeyMessage(
  label: string,
  envVar: string,
  keyUrl: string,
): string {
  return (
    `Elegiste ${label} pero no hay ninguna key configurada. ` +
    `Agregala con "/model" o exportá ${envVar}. ` +
    `Se saca en ${keyUrl} — y "nexus doctor" revisa tu configuración.`
  )
}

/**
 * Client for any provider that speaks the OpenAI dialect — today OpenAI itself
 * and NVIDIA NIM. Same shape as the OpenRouter client below; only the base URL,
 * the provider label and the user-agent change.
 */
function createOpenAiCompatibleModel(opts: {
  model: string
  apiKey: string
  provider: string
  baseUrl: string
}): LanguageModel {
  const { model, apiKey, provider, baseUrl } = opts
  return new OpenAICompatibleChatLanguageModel(model, {
    provider,
    url: ({ path: endpoint }) => `${baseUrl}${endpoint}`,
    headers: () => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/nexus-${provider}`,
    }),
    fetch: undefined,
    includeUsage: undefined,
    supportsStructuredOutputs: true,
  })
}

/**
 * Create a model that routes directly to OpenRouter's OpenAI-compatible API
 * using the user's own OPENROUTER_API_KEY (BYOK). Bypasses the Nexus backend
 * entirely, so it works with no Nexus account or credits. OpenRouter hosts
 * the same model ids the agents already use (anthropic/*, deepseek/*, etc.).
 */
function createOpenRouterDirectModel(
  model: string,
  openRouterApiKey: string,
): LanguageModel {
  return new OpenAICompatibleChatLanguageModel(model, {
    provider: 'openrouter',
    url: ({ path: endpoint }) => `${OPENROUTER_API_BASE}${endpoint}`,
    headers: () => ({
      Authorization: `Bearer ${openRouterApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/NexusAI/nexus',
      'X-Title': 'Nexus CLI',
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/nexus-openrouter`,
    }),
    fetch: undefined,
    includeUsage: undefined,
    supportsStructuredOutputs: true,
  })
}

/**
 * Create a model that routes through the Nexus backend.
 * This is the existing behavior - requests go to Nexus backend which forwards to OpenRouter.
 */
function createNexusBackendModel(apiKey: string, model: string): LanguageModel {
  const openrouterUsage: OpenRouterUsageAccounting = {
    cost: null,
    costDetails: {
      upstreamInferenceCost: null,
    },
  }

  const openrouterApiKey = getByokOpenrouterApiKeyFromEnv()

  return new OpenAICompatibleChatLanguageModel(model, {
    provider: 'nexus',
    url: ({ path: endpoint }) =>
      new URL(path.join('/api/v1', endpoint), WEBSITE_URL).toString(),
    headers: () => ({
      Authorization: `Bearer ${apiKey}`,
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/nexus`,
      ...(openrouterApiKey && { [BYOK_OPENROUTER_HEADER]: openrouterApiKey }),
    }),
    metadataExtractor: {
      extractMetadata: async ({ parsedBody }: { parsedBody: any }) => {
        if (openrouterApiKey !== undefined) {
          return { nexus: { usage: openrouterUsage } }
        }

        if (typeof parsedBody?.usage?.cost === 'number') {
          openrouterUsage.cost = parsedBody.usage.cost
        }
        if (
          typeof parsedBody?.usage?.cost_details?.upstream_inference_cost ===
          'number'
        ) {
          openrouterUsage.costDetails.upstreamInferenceCost =
            parsedBody.usage.cost_details.upstream_inference_cost
        }
        return { nexus: { usage: openrouterUsage } }
      },
      createStreamExtractor: () => ({
        processChunk: (parsedChunk: any) => {
          if (openrouterApiKey !== undefined) {
            return
          }

          if (typeof parsedChunk?.usage?.cost === 'number') {
            openrouterUsage.cost = parsedChunk.usage.cost
          }
          if (
            typeof parsedChunk?.usage?.cost_details?.upstream_inference_cost ===
            'number'
          ) {
            openrouterUsage.costDetails.upstreamInferenceCost =
              parsedChunk.usage.cost_details.upstream_inference_cost
          }
        },
        buildMetadata: () => {
          return { nexus: { usage: openrouterUsage } }
        },
      }),
    },
    fetch: undefined,
    includeUsage: undefined,
    supportsStructuredOutputs: true,
  })
}
