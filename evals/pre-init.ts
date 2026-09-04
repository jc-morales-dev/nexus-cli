/**
 * Environment defaults for eval runs.
 *
 * `@nexus/common/env` validates a set of `NEXT_PUBLIC_*` variables at module
 * evaluation time — a leftover from the upstream web app. The CLI binary gets
 * them baked in at compile time (see `cli/scripts/pack-npm.ts`); the eval
 * harness has to supply them itself, or importing the SDK throws before a
 * single scenario runs.
 *
 * These are inert placeholders: nothing in a BYOK eval run talks to a backend,
 * to PostHog, or to Stripe. Imported for its side effect from `index.ts`,
 * before anything that reaches `@nexus/common`.
 */

const DEFAULTS: Record<string, string> = {
  NEXT_PUBLIC_CB_ENVIRONMENT: 'test',
  NEXT_PUBLIC_NEXUS_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPPORT_EMAIL: 'support@nexus.local',
  NEXT_PUBLIC_POSTHOG_API_KEY: 'phc_disabled',
  NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://us.i.posthog.com',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_disabled',
  NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL: 'https://localhost',
  NEXT_PUBLIC_WEB_PORT: '3000',
}

export function initEvalEnv(): void {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    process.env[key] ||= value
  }
}
