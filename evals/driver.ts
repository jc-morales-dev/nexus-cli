/**
 * The real agent driver: runs NEXUS's own SDK against an eval workspace.
 *
 * Kept separate from the runner so the runner can be tested with a fake, and
 * so a change to the SDK's surface touches one file rather than fifteen
 * scenarios.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

import { registerSecret } from '@nexus/common/util/redact'
import { NexusClient } from '@nexus/sdk'

import { bundledAgents } from '../cli/src/agents/bundled-agents.generated'

import type { AgentDriver } from './runner'
import type { AgentDefinition } from '@nexus/sdk'

/** Agent used when a scenario doesn't name one. Matches the CLI's default. */
const DEFAULT_AGENT = 'base2'

/**
 * The key the user pasted with `/key`, read from the same settings file the
 * CLI writes.
 *
 * Duplicated here rather than imported from `cli/src/utils/settings` on
 * purpose: that module pulls in the whole CLI module graph (auth, logger,
 * analytics, OpenTUI). Reading two fields of a JSON file is cheaper and keeps
 * the eval harness independent of the TUI.
 */
function loadSavedKey(): string | undefined {
  const environment = process.env.NEXT_PUBLIC_CB_ENVIRONMENT
  const suffix = environment && environment !== 'prod' ? `-${environment}` : ''
  const settingsPath = path.join(
    os.homedir(),
    '.config',
    `nexus${suffix}`,
    'settings.json',
  )
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      openRouterApiKey?: unknown
    }
    return typeof parsed.openRouterApiKey === 'string' && parsed.openRouterApiKey.trim()
      ? parsed.openRouterApiKey.trim()
      : undefined
  } catch {
    return undefined
  }
}

/**
 * The agents NEXUS ships with, as the SDK wants them.
 *
 * Read from the generated bundle the CLI build produces, so evals measure the
 * same agent definitions users actually run. Regenerate with
 * `bun --cwd cli run prebuild:agents` if the file is stale.
 */
function loadBundledAgentDefinitions(): AgentDefinition[] {
  return Object.values(bundledAgents) as AgentDefinition[]
}

/**
 * Build a driver bound to the user's own OpenRouter key.
 *
 * Returns `undefined` when no key is configured — the runner reads that as
 * "skip the agent scenarios" rather than failing the whole run, so `bun run
 * eval` stays useful on a fresh clone and in CI.
 */
export function createAgentDriver(): AgentDriver | undefined {
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim() || loadSavedKey()
  if (!openRouterKey) return undefined

  // Same contract as the CLI: the key lives in the environment for the SDK to
  // pick up, and the redactor is told about it before anything can log it.
  process.env.OPENROUTER_API_KEY = openRouterKey
  registerSecret(openRouterKey)

  return async ({ workspace, prompt, agent, signal }) => {
    // BYOK: inference goes straight to OpenRouter with the user's key, so the
    // account-less markers the CLI sets at boot have to be set here too.
    process.env.NEXUS_MODE = '1'
    process.env.NEXUS_API_KEY ||= 'nexus-byok-local'

    const client = new NexusClient({
      apiKey: process.env.NEXUS_API_KEY,
      cwd: workspace,
      // Without these the SDK only sees agents published to the registry, and
      // the CLI's own default agent ("base2") is not one of them — the eval
      // would fail with "invalid agent id" before reaching the scenario.
      agentDefinitions: loadBundledAgentDefinitions(),
    })

    const transcript: string[] = []
    const toolCalls: string[] = []

    const runState = await client.run({
      agent: agent ?? DEFAULT_AGENT,
      prompt,
      signal,
      handleEvent: (event: any) => {
        if (event?.type === 'text' && typeof event.text === 'string') {
          transcript.push(event.text)
        }
        if (event?.type === 'tool_call' && typeof event.toolName === 'string') {
          toolCalls.push(event.toolName)
        }
        if (event?.type === 'error' && event.message) {
          transcript.push(`[error] ${event.message}`)
        }
      },
    })

    if (runState.output?.type === 'error') {
      throw new Error(runState.output.message ?? 'agent run failed')
    }

    return { transcript: transcript.join('\n'), toolCalls }
  }
}
