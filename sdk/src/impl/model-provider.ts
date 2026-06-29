/**
 * Model provider abstraction for routing requests to the appropriate LLM provider.
 *
 * This module handles:
 * - ChatGPT OAuth: Direct requests to OpenAI API using user's OAuth token
 * - Default: Requests through Nexus backend (which routes to OpenRouter)
 */

import path from 'path'

import { BYOK_OPENROUTER_HEADER } from '@nexus/common/constants/byok'
import { isFreeMode } from '@nexus/common/constants/free-agents'
import {
  CHATGPT_BACKEND_BASE_URL,
  CHATGPT_OAUTH_ENABLED,
  isChatGptOAuthModelAllowed,
  isOpenAIProviderModel,
  toOpenAIModelId,
} from '@nexus/common/constants/chatgpt-oauth'
import {
  OpenAICompatibleChatLanguageModel,
  VERSION,
} from '@nexus/llm-providers/openai-compatible'

import { WEBSITE_URL } from '../constants'
import { getValidChatGptOAuthCredentials } from '../credentials'
import {
  getByokOpenrouterApiKeyFromEnv,
  getCheapModelFromEnv,
  getForcedModelFromEnv,
  getOpenRouterApiKeyFromEnv,
  getStrongModelFromEnv,
  OPENROUTER_API_BASE,
} from '../env'
import {
  createChatGptBackendFetch,
  extractChatGptAccountId,
} from './chatgpt-backend-fetch'

import type { LanguageModel } from 'ai'

// ============================================================================
// ChatGPT OAuth Rate Limit Cache
// ============================================================================

/** Timestamp (ms) when ChatGPT OAuth rate limit expires, or null if not rate-limited */
let chatGptOAuthRateLimitedUntil: number | null = null

/**
 * Mark ChatGPT OAuth as rate-limited. Subsequent requests will skip direct ChatGPT OAuth
 * and use Nexus backend until the reset time.
 */
export function markChatGptOAuthRateLimited(resetAt?: Date): void {
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000
  chatGptOAuthRateLimitedUntil = resetAt
    ? resetAt.getTime()
    : fiveMinutesFromNow
}

/**
 * Check if ChatGPT OAuth is currently rate-limited.
 */
export function isChatGptOAuthRateLimited(): boolean {
  if (chatGptOAuthRateLimitedUntil === null) {
    return false
  }
  if (Date.now() >= chatGptOAuthRateLimitedUntil) {
    chatGptOAuthRateLimitedUntil = null
    return false
  }
  return true
}

/**
 * Reset the ChatGPT OAuth rate-limit cache.
 * Call this when user reconnects their ChatGPT subscription.
 */
export function resetChatGptOAuthRateLimit(): void {
  chatGptOAuthRateLimitedUntil = null
}

/**
 * Parameters for requesting a model.
 */
export interface ModelRequestParams {
  /** Nexus API key for backend authentication */
  apiKey: string
  /** Model ID (OpenRouter format, e.g., "anthropic/claude-sonnet-4") */
  model: string
  /** If true, skip ChatGPT OAuth and use Nexus backend (for fallback after rate limit) */
  skipChatGptOAuth?: boolean
  /** Cost mode (e.g. 'free') — affects fallback behavior for OAuth routes */
  costMode?: string
}

/**
 * Result from getModelForRequest.
 */
export interface ModelResult {
  /** The language model to use for requests */
  model: LanguageModel
  /** Whether this model uses ChatGPT OAuth direct (affects cost tracking) */
  isChatGptOAuth: boolean
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
 * If ChatGPT OAuth credentials are available and the model is an OpenAI model,
 * returns an OpenAI direct model. Otherwise, returns the Nexus backend model.
 *
 * This function is async because it may need to refresh the OAuth token.
 */
export async function getModelForRequest(
  params: ModelRequestParams,
): Promise<ModelResult> {
  const { apiKey, skipChatGptOAuth, costMode } = params

  // Resolve the effective model: single override, or the tiered STRONG/CHEAP
  // map, or the agent's own requested model. See resolveModelOverride.
  const model = resolveModelOverride(params.model)

  // Direct BYOK provider (highest priority): route straight to the user's own
  // provider, bypassing the Nexus backend entirely — no account or credits.
  // 1) OpenRouter (preferred): hosts the same model ids the agents already use.
  const openRouterApiKey = getOpenRouterApiKeyFromEnv()
  if (openRouterApiKey) {
    return {
      model: createOpenRouterDirectModel(model, openRouterApiKey),
      isChatGptOAuth: false,
    }
  }

  // NEXUS is account-less: if no provider key is set yet, guide the user to add
  // one instead of silently failing against a Nexus backend that isn't there.
  if (process.env.NEXUS_MODE) {
    throw new Error(
      'No OpenRouter API key set. Run "/key sk-or-..." to add yours (get a free key at https://openrouter.ai/keys).',
    )
  }

  // Check if we should use ChatGPT OAuth direct
  // Only attempt for allowlisted models; non-allowlisted models silently fall through to backend.
  if (
    CHATGPT_OAUTH_ENABLED &&
    !skipChatGptOAuth &&
    isOpenAIProviderModel(model) &&
    isChatGptOAuthModelAllowed(model)
  ) {
    // In free mode, rate-limited ChatGPT OAuth must not silently fall through to
    // the Nexus backend — freetier should only use the direct OpenAI route or fail.
    if (isChatGptOAuthRateLimited()) {
      if (isFreeMode(costMode)) {
        throw new Error(
          'ChatGPT rate limit reached. Please wait a few minutes and try again.',
        )
      }
    } else {
      const chatGptOAuthCredentials = await getValidChatGptOAuthCredentials()

      if (chatGptOAuthCredentials) {
        return {
          model: createOpenAIOAuthModel(
            model,
            chatGptOAuthCredentials.accessToken,
          ),
          isChatGptOAuth: true,
        }
      }

      // In free mode, if credentials are unavailable, don't fall through to backend.
      if (isFreeMode(costMode)) {
        throw new Error(
          'ChatGPT OAuth credentials unavailable. Please reconnect with /connect:chatgpt.',
        )
      }
    }
  }

  // Default: use Nexus backend
  return {
    model: createNexusBackendModel(apiKey, model),
    isChatGptOAuth: false,
  }
}

/**
 * Create an OpenAI model that routes through the ChatGPT backend API (Codex endpoint).
 * Uses a custom fetch that transforms between Chat Completions and Responses API formats.
 */
function createOpenAIOAuthModel(
  model: string,
  oauthToken: string,
): LanguageModel {
  const openAIModelId = toOpenAIModelId(model)
  const accountId = extractChatGptAccountId(oauthToken)

  return new OpenAICompatibleChatLanguageModel(openAIModelId, {
    provider: 'openai',
    url: () => `${CHATGPT_BACKEND_BASE_URL}/codex/responses`,
    headers: () => ({
      Authorization: `Bearer ${oauthToken}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'responses=experimental',
      originator: 'codex_cli_rs',
      accept: 'text/event-stream',
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/nexus-chatgpt-oauth`,
      ...(accountId ? { 'chatgpt-account-id': accountId } : {}),
    }),
    fetch: createChatGptBackendFetch(),
    supportsStructuredOutputs: true,
    includeUsage: undefined,
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
