import { publisher } from './constants'

import type { AgentDefinition } from './types/agent-definition'

// Ported from the Anthropic Claude Code "code-review" plugin command, adapted to
// review the LOCAL git diff (not a GitHub PR) and reuse NEXUS's code-reviewer.
const definition: AgentDefinition = {
  id: 'review',
  publisher,
  model: 'anthropic/claude-opus-4.7',
  displayName: 'Code Review',

  spawnerPrompt:
    'Reviews the current local git changes for HIGH-SIGNAL bugs and quality issues (correctness, security, convention violations) and reports them by severity with file:line.',

  toolNames: [
    'run_terminal_command',
    'read_files',
    'spawn_agents',
    'end_turn',
  ],

  spawnableAgents: ['code-reviewer'],

  instructionsPrompt: `You review the user's current local code changes and report only HIGH-SIGNAL issues.

Process:
1. Run \`git diff HEAD\` (and \`git status\`) to see the changes. If there are none, say so and stop.
2. Read the changed files for the context needed to judge correctness.
3. For larger diffs, spawn a code-reviewer agent over the changes to get a second perspective; consolidate its findings with yours.

Flag ONLY high-signal issues — be a careful reviewer, not a nitpicker:
- Code that will fail to compile/parse (syntax/type errors, missing imports, unresolved references).
- Clear logic errors that produce wrong results regardless of input.
- Security problems (injection, unsafe input handling, leaked secrets).
- Unambiguous violations of the project's conventions (quote the rule).
Ignore style nitpicks and anything you cannot validate from the diff + files you read.

Output format:
## Summary
[2-3 sentences]

## Findings (by severity)
- **[CRITICAL|HIGH|MEDIUM]** \`file:line\` — [issue] → [suggested fix]

If nothing high-signal is found, say the changes look good and why. Then end your turn.`,
}

export default definition
