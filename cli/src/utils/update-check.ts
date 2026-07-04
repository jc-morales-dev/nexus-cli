import fs from 'fs'
import path from 'path'

import { cyan, dim, green, yellow } from 'picocolors'

import { getConfigDir } from './auth'
import { logger } from './logger'

// The name NEXUS is published under on npm. MUST match npm-dist/package.json's
// "name" exactly — it's the source of truth we compare the running binary's
// baked-in version against. Scoped under the publisher's npm account so the name
// stays ours (the unscoped "nexus-ai-cli" is already taken by someone else).
const PACKAGE_NAME = '@victor00128/nexus-cli'
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`
// The exact command a user runs to update. It's an npm global install, so this
// is the same regardless of platform.
const UPDATE_COMMAND = `npm i -g ${PACKAGE_NAME}@latest`

// How long a cached "latest version" is trusted before we refresh in the
// background. Matches the update-notifier default: nag at most once a day.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
// Hard cap on the registry request so a slow/offline network never delays
// startup. The check is fire-and-forget anyway, but this bounds the work.
const FETCH_TIMEOUT_MS = 2000

interface UpdateCache {
  // Epoch ms of the last successful (or attempted) registry check.
  lastCheck: number
  // Latest version string seen on the registry, or null if unknown.
  latest: string | null
}

const getCachePath = (): string =>
  path.join(getConfigDir(), 'update-check.json')

const readCache = (): UpdateCache | null => {
  try {
    const raw = fs.readFileSync(getCachePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<UpdateCache>
    if (typeof parsed.lastCheck !== 'number') return null
    return {
      lastCheck: parsed.lastCheck,
      latest: typeof parsed.latest === 'string' ? parsed.latest : null,
    }
  } catch {
    // Missing/corrupt cache is expected on first run — treat as no cache.
    return null
  }
}

const writeCache = (cache: UpdateCache): void => {
  try {
    const dir = getConfigDir()
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(getCachePath(), JSON.stringify(cache, null, 2))
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      'update-check: failed to write cache',
    )
  }
}

/**
 * Parse a semver-ish string into [major, minor, patch], ignoring any leading
 * "v" and any -prerelease/+build suffix. Non-numeric parts become 0.
 */
const parseVersion = (version: string): [number, number, number] => {
  const core = version.trim().replace(/^v/, '').split(/[-+]/)[0] ?? ''
  const parts = core.split('.').map((p) => Number.parseInt(p, 10))
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
}

/**
 * True when `latest` is a strictly newer release than `current`. A version that
 * only differs by a prerelease/build tag is not considered newer, so users on a
 * final release aren't nagged toward an equal-numbered build.
 */
export const isNewerVersion = (latest: string, current: string): boolean => {
  const [lMaj, lMin, lPat] = parseVersion(latest)
  const [cMaj, cMin, cPat] = parseVersion(current)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPat > cPat
}

/** Reasons the notifier stays completely silent — no check, no banner. */
const isNotifierDisabled = (currentVersion: string): boolean => {
  // Dev / from-source runs bake no version; never nag the developer.
  if (!currentVersion || currentVersion === 'dev') return true
  // Standard opt-outs + CI, plus a NEXUS-specific switch.
  if (
    process.env.NEXUS_NO_UPDATE_NOTIFIER ||
    process.env.NO_UPDATE_NOTIFIER ||
    process.env.CI
  ) {
    return true
  }
  return false
}

/**
 * Fire-and-forget: if the cached check is older than the TTL (or missing),
 * fetch the latest version from the npm registry and refresh the cache for the
 * NEXT launch. Never throws, never blocks the caller — mirrors how
 * update-notifier decouples "show" (sync, from cache) from "check" (async).
 */
export const scheduleUpdateCheck = (currentVersion: string): void => {
  if (isNotifierDisabled(currentVersion)) return

  const cache = readCache()
  const fresh = cache && Date.now() - cache.lastCheck < CACHE_TTL_MS
  if (fresh) return

  void (async () => {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      let latest: string | null = null
      try {
        const res = await fetch(REGISTRY_URL, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        })
        if (res.ok) {
          const data = (await res.json()) as { version?: string }
          latest =
            typeof data.version === 'string' ? data.version : null
        }
      } finally {
        clearTimeout(timer)
      }
      // Persist the attempt time even on failure so we don't hammer the
      // registry on every launch while offline; keep the previous `latest`.
      writeCache({
        lastCheck: Date.now(),
        latest: latest ?? cache?.latest ?? null,
      })
    } catch (error) {
      logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'update-check: registry fetch failed',
      )
    }
  })()
}

/**
 * Synchronous, instant, network-free: if the last cached check found a newer
 * version than the one running, print a small banner. Safe to call right before
 * entering the TUI's alternate screen — the banner lands in the primary buffer
 * and reappears in scrollback when the user exits.
 */
export const maybePrintUpdateBanner = (currentVersion: string): void => {
  if (isNotifierDisabled(currentVersion)) return
  if (!process.stdout.isTTY) return

  const cache = readCache()
  if (!cache?.latest) return
  if (!isNewerVersion(cache.latest, currentVersion)) return

  const title = yellow('Actualización disponible')
  const versions = `${dim(currentVersion)} → ${green(cache.latest)}`
  const cmd = cyan(UPDATE_COMMAND)
  process.stdout.write(
    `\n${title}: ${versions}\nEjecutá:  ${cmd}\n\n`,
  )
}
