# NEXUS

**A free, account-less AI coding agent for your terminal.**

NEXUS edits your codebase from natural-language instructions — like a terminal
coding assistant, but free: bring your own [OpenRouter](https://openrouter.ai)
key (free or paid models) and use any model you want. No subscription, no
credits, no sign-up. Your key stays on your machine.

## Install

```bash
npm install -g @victor00128/nexus-cli
```

It ships a self-contained binary — you don't need to install Node or Bun
separately.

## Quick start

```bash
nexus
```

1. The first time, type `/key` and paste your OpenRouter API key
   (get one free at https://openrouter.ai/keys).
2. Pick a model with `/model`. The default is Ox Alpha — frontier-class, 1M
   context, currently free. Note that it is a *stealth* model: the provider is
   anonymous and logs prompts (that is, your code) to evaluate the model, and
   OpenRouter can retire it without notice. Switch any time with
   `/model <id>` — DeepSeek V3.2 is a good, cheap, non-logging alternative.
3. Start coding — just tell NEXUS what you want.

Examples:

- "Fix the SQL injection in user registration"
- "Add rate limiting to all API endpoints"
- "Refactor the database connection code"

## How it works

Instead of using one model for everything, NEXUS coordinates specialized agents
that explore your project, plan changes, edit precisely, and review the result.
This gives better context understanding and more accurate edits.

## Commands

| Command | What it does |
|---|---|
| `/key` | Paste / view / clear your OpenRouter API key |
| `/model` | Choose the AI model |
| `/undo` | Revert the agent's edits from the last turn |
| `/bg` | List / kill background processes |
| `/help` | Help and keyboard shortcuts |

## Features

- 🆓 **Free and account-less** — your key lives only on your PC.
- 🧠 **Any OpenRouter model** — free or paid, switch anytime.
- 🔁 **Multi-agent** — explores, edits and reviews your code.
- 🪝 **Deterministic hooks** — run format/lint/typecheck automatically (`.nexus/hooks.json`).
- ⏪ **Undo** — a safety net to revert edits without git.
- 🌐 **Web search without an API key** — built-in research.
- 🛡️ **Permissions / sandbox** — blocks dangerous commands before they run.
- 🔌 **MCP support** — connect external tools.

## Configuration

Per-project settings live under a `.nexus/` directory:

- `.nexus/hooks.json` — commands to run after edits (PostToolUse) or before
  finishing (Stop).
- `.nexus/permissions.json` — allow/deny rules for terminal commands.
- `.nexusignore` — files NEXUS should ignore.

## Custom agents

You can define your own agents under `.agents/` with full control over their
tools, prompts, and step-by-step behavior. Run `/init` inside NEXUS to scaffold
the structure.

## License

NEXUS is released under the [Apache License 2.0](./LICENSE). See [NOTICE](./NOTICE)
for attribution.
