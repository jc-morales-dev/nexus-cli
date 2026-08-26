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

import { WEBSITE_URL } from '../constants'
import {
  getByokOpenrouterApiKeyFromEnv,
  getCheapModelFromEnv,
  getForcedModelFromEnv,
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
    throw new Error(
      'No OpenRouter API key set. Run "/key sk-or-..." to add yours (get a free key at https://openrouter.ai/keys).',
    )
  }

  // Default: use Nexus backend
  return createNexusBackendModel(apiKey, model)
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
function createNexusBackendModel(
  apiKey: string,
  model: string,
): LanguageModel {
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
