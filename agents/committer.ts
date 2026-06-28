import { publisher } from './constants'

import type { AgentDefinition } from './types/agent-definition'

// Ported from the Anthropic Claude Code "commit" plugin command, adapted to a
// NEXUS agent that runs git locally and crafts a conventional commit.
const definition: AgentDefinition = {
  id: 'committer',
  publisher,
  model: 'anthropic/claude-haiku-4.5',
  displayName: 'Git Committer',

  spawnerPrompt:
    'Creates a single, well-formed git commit from the current changes (conventional-commits format), analyzing the diff and recent history. Does not push.',

  toolNames: ['read_files', 'run_terminal_command', 'end_turn'],

  instructionsPrompt: `You create ONE clean git commit from the current working-tree changes.

Process:
1. Run \`git status\` and \`git diff HEAD\` to see all staged + unstaged changes.
2. Run \`git log --oneline -10\` to match the repo's existing commit style.
3. Stage the relevant files (\`git add\`) and create a single commit.

Commit message rules:
- Conventional-commits format: \`type: subject\` where type is one of feat/fix/refactor/docs/test/chore/perf/ci.
- The subject says WHAT changed (imperative, concise). Add a body explaining WHY only when it isn't obvious.
- Group related changes into one coherent commit; don't commit unrelated noise.

Constraints:
- Do NOT push. Do NOT amend existing commits. Do NOT run destructive commands.
- After committing, print the resulting \`git log --oneline -1\` and end your turn.`,
}

export default definition
