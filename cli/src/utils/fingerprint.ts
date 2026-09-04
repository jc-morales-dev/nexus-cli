/**
 * Deterministic fingerprinting for CLI authentication.
 *
 * The fingerprint identifies this installation across restarts so a login flow
 * can be correlated. It is derived from the machine id plus stable OS facts,
 * and falls back to a random per-process id when that fails.
 *
 * This used to also pull manufacturer, serial number, chassis UUID, CPU brand
 * and distro out of the `systeminformation` package. That was removed:
 *
 *  - Its stated purpose ("make it harder to game the system by creating
 *    multiple accounts") belonged to the upstream paid product. NEXUS is
 *    account-less and BYOK — there is no account to multiply and no backend
 *    to game.
 *  - `systeminformation` shells out to collect that data and carries four
 *    unfixed command-injection advisories (GHSA-5vv4-hvf7-2h46,
 *    GHSA-9c88-49p5-5ggf, GHSA-hvx9-hwr7-wjj9, GHSA-5xpp-75jx-m839), all
 *    covering every published version.
 *  - Harvesting a machine's serial number is hard to justify in a tool whose
 *    pitch is that the user controls their own data.
 *
 * `node-machine-id` plus `node:os` already supply the stable identity, so the
 * fingerprint stays deterministic without any of that.
 */

import { createHash, randomBytes } from 'node:crypto'
import { arch, cpus, hostname, networkInterfaces, platform, release } from 'node:os'

import { AnalyticsEvent } from '@nexus/common/constants/analytics-events'

import { trackEvent } from './analytics'
import { detectShell } from './detect-shell'
import { logger } from './logger'

// Lazy import: node-machine-id touches the registry / filesystem, and doing
// that at module evaluation time would slow every CLI start.
let machineIdModule: typeof import('node-machine-id') | null = null

async function getMachineId(): Promise<string> {
  if (!machineIdModule) {
    machineIdModule = await import('node-machine-id')
  }
  const id = await machineIdModule.machineId()
  // Validate that we got a real machine ID, not an empty or placeholder value.
  // Throwing here triggers the legacy fallback in calculateFingerprint().
  if (!id || id === 'unknown' || id.length < 8) {
    throw new Error('Invalid machine ID returned')
  }
  return id
}

/**
 * Stable OS facts, straight from `node:os`.
 *
 * Everything here is already available to the process without spawning a
 * subprocess, which is the whole reason the heavyweight alternative went away.
 */
function getSystemInfo(): {
  os: { platform: string; release: string; arch: string; hostname: string }
  cpu: { model: string; cores: number }
} {
  const cpuList = cpus()
  return {
    os: {
      platform: platform(),
      release: release(),
      arch: arch(),
      hostname: hostname(),
    },
    cpu: {
      model: cpuList[0]?.model ?? '',
      cores: cpuList.length,
    },
  }
}

/**
 * Generates an enhanced CLI fingerprint using hardware identifiers.
 * This is deterministic - the same machine will always produce the same fingerprint.
 * Throws if machine ID cannot be obtained (to trigger legacy fallback).
 */
async function calculateEnhancedFingerprint(): Promise<string> {
  // getMachineId will throw if it can't get a valid machine ID
  const machineIdValue = await getMachineId()
  
  const sysInfo = getSystemInfo()
  const shell = detectShell()
  const networkInfo = networkInterfaces()

  // Extract MAC addresses for additional uniqueness
  const macAddresses = Object.values(networkInfo)
    .flat()
    .filter(
      (iface) =>
        iface && !iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00',
    )
    .map((iface) => iface!.mac)
    .sort()

  const fingerprintInfo = {
    cpu: sysInfo.cpu,
    os: sysInfo.os,
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      shell,
    },
    network: {
      macAddresses,
      interfaceCount: Object.keys(networkInfo).length,
    },
    machineId: machineIdValue,
    // Bumped from 2.0: the inputs changed, so fingerprints from before this
    // version hash differently. Nothing persists them across releases.
    fingerprintVersion: '3.0',
  }

  const fingerprintString = JSON.stringify(fingerprintInfo)
  const fingerprintHash = createHash('sha256')
    .update(fingerprintString)
    .digest('base64url')

  return `enhanced-${fingerprintHash}`
}

/**
 * Generates a legacy fingerprint with a random suffix.
 * Used as a fallback when enhanced fingerprinting fails.
 */
function calculateLegacyFingerprint(): string {
  const randomSuffix = randomBytes(6).toString('base64url').substring(0, 8)
  return `nexus-cli-${randomSuffix}`
}

/**
 * Cached fingerprint promise. Populated on first call and reused for the
 * process lifetime so every auth step in a session ships the same fingerprint
 * to the server.
 */
let cachedFingerprintPromise: Promise<string> | null = null

/**
 * Returns the process-wide CLI fingerprint, computing it on first call.
 * Safe to call from multiple places — the first caller wins and the rest
 * await the same promise.
 */
export function getFingerprintId(): Promise<string> {
  if (!cachedFingerprintPromise) {
    cachedFingerprintPromise = calculateFingerprint()
  }
  return cachedFingerprintPromise
}

/**
 * Main fingerprint function.
 * Tries enhanced fingerprinting first, falls back to legacy if it fails.
 */
export async function calculateFingerprint(): Promise<string> {
  try {
    const fingerprint = await calculateEnhancedFingerprint()
    logger.debug(
      {
        fingerprintType: 'enhanced_cli',
        fingerprintId: fingerprint.substring(0, 20) + '...',
      },
      'Enhanced CLI fingerprint generated successfully',
    )
    trackEvent(AnalyticsEvent.FINGERPRINT_GENERATED, {
      fingerprintType: 'enhanced_cli',
      success: true,
    })
    return fingerprint
  } catch (enhancedError) {
    logger.info(
      {
        errorMessage:
          enhancedError instanceof Error ? enhancedError.message : String(enhancedError),
        fingerprintType: 'enhanced_failed_fallback',
      },
      'Enhanced CLI fingerprinting failed, using legacy fallback',
    )

    try {
      const fingerprint = calculateLegacyFingerprint()
      logger.debug(
        {
          fingerprintType: 'legacy_fallback',
          fingerprintId: fingerprint,
        },
        'Legacy fingerprint generated successfully as fallback',
      )
      trackEvent(AnalyticsEvent.FINGERPRINT_GENERATED, {
        fingerprintType: 'legacy',
        success: true,
        fallbackReason:
          enhancedError instanceof Error ? enhancedError.message : 'unknown',
      })
      return fingerprint
    } catch (legacyError) {
      logger.error(
        {
          errorMessage:
            legacyError instanceof Error ? legacyError.message : String(legacyError),
          fingerprintType: 'failed',
        },
        'Both enhanced and legacy fingerprint generation failed',
      )
      throw new Error('Fingerprint generation failed')
    }
  }
}

/**
 * Synchronous fingerprint generation (legacy only).
 * Use this only when async is not possible (e.g., initial state).
 * @deprecated Prefer calculateFingerprint() for hardware-based fingerprinting
 */
export function generateFingerprintIdSync(): string {
  return calculateLegacyFingerprint()
}

/**
 * Detects the fingerprint type from a fingerprint ID.
 */
export function getFingerprintType(
  fingerprintId: string,
): 'enhanced_cli' | 'legacy' | 'unknown' {
  if (fingerprintId.startsWith('enhanced-')) {
    return 'enhanced_cli'
  }
  if (fingerprintId.startsWith('nexus-cli-') || fingerprintId.startsWith('legacy-')) {
    return 'legacy'
  }
  return 'unknown'
}
