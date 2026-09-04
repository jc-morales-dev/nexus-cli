import { agentScenarios } from './coding'
import { offlineScenarios } from './resilience'

import type { Scenario } from '../types'

/**
 * Every scenario, offline first so a run gives fast, deterministic signal
 * before it starts spending tokens.
 */
export const allScenarios: Scenario[] = [...offlineScenarios, ...agentScenarios]

export function findScenario(id: string): Scenario | undefined {
  return allScenarios.find((s) => s.id === id)
}

export function filterScenarios(options: {
  ids?: string[]
  tags?: string[]
  kind?: Scenario['kind']
}): Scenario[] {
  return allScenarios.filter((scenario) => {
    if (options.ids?.length && !options.ids.includes(scenario.id)) return false
    if (options.kind && scenario.kind !== options.kind) return false
    if (options.tags?.length && !options.tags.some((t) => scenario.tags.includes(t))) {
      return false
    }
    return true
  })
}

export { agentScenarios, offlineScenarios }
