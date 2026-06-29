import type { FreeTierIpPrivacySignal } from '../types/freetier-session'

export const FREETIER_HARD_BLOCKED_PRIVACY_SIGNALS = [
  'vpn',
  'proxy',
  'tor',
  'res_proxy',
] as const satisfies readonly FreeTierIpPrivacySignal[]

type FreeTierHardBlockedPrivacySignal =
  (typeof FREETIER_HARD_BLOCKED_PRIVACY_SIGNALS)[number]

const FREETIER_HARD_BLOCKED_PRIVACY_SIGNAL_SET =
  new Set<FreeTierIpPrivacySignal>(FREETIER_HARD_BLOCKED_PRIVACY_SIGNALS)

const FREETIER_HARD_BLOCKED_PRIVACY_SIGNAL_LABELS: Record<
  FreeTierHardBlockedPrivacySignal,
  string
> = {
  vpn: 'VPN',
  proxy: 'proxy',
  res_proxy: 'proxy',
  tor: 'Tor',
}

export function isFreeTierHardBlockedPrivacySignal(
  signal: FreeTierIpPrivacySignal,
): signal is FreeTierHardBlockedPrivacySignal {
  return FREETIER_HARD_BLOCKED_PRIVACY_SIGNAL_SET.has(signal)
}

export function formatFreeTierHardBlockedPrivacySignals(
  signals: readonly FreeTierIpPrivacySignal[] | null | undefined,
): string {
  const labels = Array.from(
    new Set(
      (signals ?? []).flatMap((signal): string[] => {
        if (!isFreeTierHardBlockedPrivacySignal(signal)) return []
        return [FREETIER_HARD_BLOCKED_PRIVACY_SIGNAL_LABELS[signal]]
      }),
    ),
  )

  if (labels.length === 0) return 'VPN, proxy, or Tor'
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`
}

export function formatFreeTierHardBlockedMessage(
  signals: readonly FreeTierIpPrivacySignal[] | null | undefined,
): string {
  return `FreeTier cannot be used from ${formatFreeTierHardBlockedPrivacySignals(
    signals,
  )} traffic. Please disable it and try again.`
}
