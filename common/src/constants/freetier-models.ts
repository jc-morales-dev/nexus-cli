import {
  addDaysToYmd,
  getUtcForZonedTime,
  getZonedParts,
  type ZonedDateParts,
} from '../util/zoned-time'

/**
 * Models a freetier user can pick between in the waiting-room model selector.
 *
 * Each model has its own queue (server keys queue position by `model`), so the
 * list here is effectively the set of separate waiting lines. Order is the
 * order shown in the UI.
 */
export interface FreeTierModelOption {
  /** Stable ID used in the wire protocol and DB. Matches the model id passed
   *  to the chat-completions endpoint. */
  id: string
  /** Short label for the selector UI. */
  displayName: string
  /** One-line description shown next to the label. */
  tagline: string
  /** Availability policy for the selector and server-side admission. */
  availability: 'always' | 'deployment_hours'
  /** Optional caveat shown in the picker (e.g. data-collection warning).
   *  Rendered in the warning/secondary color so users spot it before
   *  picking the model. */
  warning?: string
}

/** Server-facing fallback copy for APIs and provider errors that can't know
 *  the caller's local timezone. The CLI should render
 *  `getFreeTierDeploymentAvailabilityLabel()` instead. */
export const FREETIER_DEPLOYMENT_HOURS_LABEL = '9am ET-5pm PT every day'
export const FREETIER_GEMINI_PRO_MODEL_ID = 'google/gemini-3.1-pro-preview'
export const FREETIER_DEEPSEEK_V4_PRO_MODEL_ID = 'deepseek/deepseek-v4-pro'
export const FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID = 'deepseek/deepseek-v4-flash'
export const FREETIER_KIMI_MODEL_ID = 'moonshotai/kimi-k2.6'
export const FREETIER_MINIMAX_MODEL_ID = 'minimax/minimax-m2.7'
export const FREETIER_PREMIUM_SESSION_LIMIT = 5
export const FREETIER_LIMITED_SESSION_LIMIT = 5
export const FREETIER_PREMIUM_SESSION_RESET_TIMEZONE = 'America/Los_Angeles'
export const FREETIER_PREMIUM_SESSION_PERIOD = 'pacific_day'
export const FREETIER_LIMITED_SESSION_RESET_TIMEZONE =
  FREETIER_PREMIUM_SESSION_RESET_TIMEZONE
export const FREETIER_LIMITED_SESSION_PERIOD = FREETIER_PREMIUM_SESSION_PERIOD
/** Deprecated wire compatibility field. Premium usage now resets at midnight
 *  Pacific time rather than using a rolling hourly window. */
export const FREETIER_PREMIUM_SESSION_WINDOW_HOURS = 24
export const FREETIER_LIMITED_SESSION_WINDOW_HOURS =
  FREETIER_PREMIUM_SESSION_WINDOW_HOURS
const FREETIER_EASTERN_TIMEZONE = 'America/New_York'
const FREETIER_PACIFIC_TIMEZONE = 'America/Los_Angeles'

interface LocalTimeFormatOptions {
  locale?: string
  timeZone?: string
}

/** Smart freetier models that benefit from spawning the gemini-thinker
 *  subagent for deeper reasoning. Fast models (e.g. MiniMax) skip it because
 *  the extra round-trip would defeat the "fastest" tier. Used by the CLI to
 *  toggle the gemini-thinker spawnable + prompts based on the user's pick,
 *  and by the server to admit gemini-thinker child requests against a parent
 *  session bound to one of these models. */
export const FREETIER_GEMINI_THINKER_PARENT_MODELS = new Set<string>([
  FREETIER_KIMI_MODEL_ID,
  FREETIER_DEEPSEEK_V4_PRO_MODEL_ID,
])

export function canFreeTierModelSpawnGeminiThinker(modelId: string): boolean {
  return FREETIER_GEMINI_THINKER_PARENT_MODELS.has(modelId)
}

export const FREETIER_MODELS = [
  {
    id: FREETIER_DEEPSEEK_V4_PRO_MODEL_ID,
    displayName: 'DeepSeek V4 Pro',
    tagline: 'Smartest',
    availability: 'always',
    warning: 'Collects data for training',
  },
  {
    id: FREETIER_KIMI_MODEL_ID,
    displayName: 'Kimi K2.6',
    tagline: 'Balanced',
    availability: 'always',
  },
  {
    id: FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
    displayName: 'DeepSeek V4 Flash',
    tagline: 'Most efficient',
    availability: 'always',
    warning: 'Collects data for training',
  },
  {
    id: FREETIER_MINIMAX_MODEL_ID,
    displayName: 'MiniMax M2.7',
    tagline: 'Fastest',
    availability: 'always',
  },
] as const satisfies readonly FreeTierModelOption[]

export const FREETIER_PREMIUM_MODEL_IDS = [
  FREETIER_DEEPSEEK_V4_PRO_MODEL_ID,
  FREETIER_KIMI_MODEL_ID,
] as const

export const SUPPORTED_FREETIER_MODELS = FREETIER_MODELS

export type FreeTierModelId = (typeof FREETIER_MODELS)[number]['id']
export type SupportedFreeTierModelId = FreeTierModelId
export type FreeTierPremiumModelId = (typeof FREETIER_PREMIUM_MODEL_IDS)[number]

/** What new freetier users see selected in the picker. MiniMax is the
 *  fastest always-available option and backs the default base2-free agent.
 *  Callers that need a guaranteed-available id for resolution / auto-fallbacks
 *  should use FALLBACK_FREETIER_MODEL_ID instead. */
export const DEFAULT_FREETIER_MODEL_ID: FreeTierModelId =
  FREETIER_MINIMAX_MODEL_ID

/** Always-available fallback used when the requested model can't be served
 *  right now (unknown id, deployment hours closed, etc.). Kept distinct from
 *  DEFAULT_FREETIER_MODEL_ID so a new user's "preferred default" can be the
 *  smartest model without auto-flipping anyone to a closed serverless model. */
export const FALLBACK_FREETIER_MODEL_ID: FreeTierModelId =
  FREETIER_MINIMAX_MODEL_ID

export const LIMITED_FREETIER_MODEL_ID: FreeTierModelId =
  FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID
export const LIMITED_FREETIER_MODELS = FREETIER_MODELS.filter(
  (model) => model.id === LIMITED_FREETIER_MODEL_ID,
)

export type FreeTierAccessTier = 'full' | 'limited'

export function getFreeTierModelsForAccessTier(
  accessTier: FreeTierAccessTier | null | undefined,
): readonly FreeTierModelOption[] {
  if (accessTier === 'limited') return LIMITED_FREETIER_MODELS
  return FREETIER_MODELS
}

export function isFreeTierModelAllowedForAccessTier(
  model: string | null | undefined,
  accessTier: FreeTierAccessTier | null | undefined,
): boolean {
  if (!model) return false
  if (accessTier !== 'limited') return isSupportedFreeTierModelId(model)
  return model === LIMITED_FREETIER_MODEL_ID
}

export function isFreeTierModelId(
  id: string | null | undefined,
): id is FreeTierModelId {
  if (!id) return false
  return FREETIER_MODELS.some((m) => m.id === id)
}

export function resolveFreeTierModel(
  id: string | null | undefined,
): FreeTierModelId {
  return isFreeTierModelId(id) ? id : FALLBACK_FREETIER_MODEL_ID
}

export function resolveFreeTierModelForAccessTier(
  id: string | null | undefined,
  accessTier: FreeTierAccessTier | null | undefined,
): SupportedFreeTierModelId {
  if (accessTier === 'limited') return LIMITED_FREETIER_MODEL_ID
  const resolved = resolveSupportedFreeTierModel(id)
  return isFreeTierModelAllowedForAccessTier(resolved, accessTier)
    ? resolved
    : FALLBACK_FREETIER_MODEL_ID
}

export function isSupportedFreeTierModelId(
  id: string | null | undefined,
): id is SupportedFreeTierModelId {
  if (!id) return false
  return SUPPORTED_FREETIER_MODELS.some((m) => m.id === id)
}

export function isFreeTierPremiumModelId(
  id: string | null | undefined,
): id is FreeTierPremiumModelId {
  if (!id) return false
  return FREETIER_PREMIUM_MODEL_IDS.some((modelId) => modelId === id)
}

export function resolveSupportedFreeTierModel(
  id: string | null | undefined,
): SupportedFreeTierModelId {
  return isSupportedFreeTierModelId(id) ? id : FALLBACK_FREETIER_MODEL_ID
}

export function getFreeTierModel(id: string): FreeTierModelOption {
  return (
    SUPPORTED_FREETIER_MODELS.find((m) => m.id === id) ??
    FREETIER_MODELS.find((m) => m.id === FALLBACK_FREETIER_MODEL_ID)!
  )
}

function getNextFreeTierDeploymentStart(now: Date): Date {
  const easternNow = getZonedParts(now, FREETIER_EASTERN_TIMEZONE)
  const isBeforeTodayOpen = easternNow.hour < 9

  const offset = isBeforeTodayOpen ? 0 : 1

  return getUtcForZonedTime(
    addDaysToYmd(easternNow.year, easternNow.month, easternNow.day, offset),
    FREETIER_EASTERN_TIMEZONE,
    9,
    0,
  )
}

function getCurrentFreeTierDeploymentEnd(now: Date): Date {
  const pacificNow = getZonedParts(now, FREETIER_PACIFIC_TIMEZONE)
  return getUtcForZonedTime(pacificNow, FREETIER_PACIFIC_TIMEZONE, 17, 0)
}

function isSameLocalDay(left: Date, right: Date, timeZone?: string): boolean {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(left) === formatter.format(right)
}

function formatLocalTime(
  date: Date,
  referenceNow: Date,
  options: LocalTimeFormatOptions = {},
): string {
  const shouldShowWeekday = !isSameLocalDay(
    date,
    referenceNow,
    options.timeZone,
  )
  return new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    weekday: shouldShowWeekday ? 'short' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function getFreeTierDeploymentAvailabilityLabel(
  now: Date = new Date(),
  options: LocalTimeFormatOptions = {},
): string {
  if (isFreeTierDeploymentHours(now)) {
    const closesAt = getCurrentFreeTierDeploymentEnd(now)
    return `until ${formatLocalTime(closesAt, now, options)}`
  }

  const opensAt = getNextFreeTierDeploymentStart(now)
  return `opens ${formatLocalTime(opensAt, now, options)}`
}

export function isFreeTierDeploymentHours(now: Date = new Date()): boolean {
  const eastern = getZonedParts(now, FREETIER_EASTERN_TIMEZONE)
  const pacific = getZonedParts(now, FREETIER_PACIFIC_TIMEZONE)
  return (
    eastern.hour * 60 + eastern.minute >= 9 * 60 &&
    pacific.hour * 60 + pacific.minute < 17 * 60
  )
}

export function isFreeTierModelAvailable(
  id: string,
  now: Date = new Date(),
): boolean {
  const model = SUPPORTED_FREETIER_MODELS.find((m) => m.id === id)
  if (!model) return false
  return model.availability === 'always' || isFreeTierDeploymentHours(now)
}

export function resolveAvailableFreeTierModel(
  id: string | null | undefined,
  now: Date = new Date(),
): FreeTierModelId {
  const resolved = resolveFreeTierModel(id)
  return isFreeTierModelAvailable(resolved, now)
    ? resolved
    : FALLBACK_FREETIER_MODEL_ID
}
