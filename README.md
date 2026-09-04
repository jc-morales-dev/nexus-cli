# NEXUS

**A free, account-less AI coding agent for your terminal.**

NEXUS edits your codebase from natural-language instructions — like a terminal
coding assistant, but free: bring your own [OpenRouter](https://openrouter.ai)
key (free or paid models) and use any model you want. No subscription, no
credits, no sign-up. Your key stays on your machine.

[See exactly what this fork changes](./ORIGINAL_WORK.md).

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
2. Pick a model with `/model`. The default is MiniMax M3 (free tier) — strong at
   agentic work, 1M context, $0 with your own key. OpenRouter caps free-tier
   requests per day, so if you hit the limit or want more power, switch any time
   with `/model <id>` — DeepSeek V3.2 is a good, cheap alternative, and GLM 5.3
   Flash gives you 1.3M context for cents.
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

## Working on NEXUS itself

There are two separate things, and it helps to keep them straight:

| | Command | What it runs |
|---|---|---|
| **Installed** | `nexus` | The published binary from npm. This is what users get. |
| **Development** | `nexus-dev` | The live source in this repo — every edit takes effect immediately, no rebuild. |

To set up the development side:

```bash
git clone https://github.com/jc-morales-dev/nexus-cli.git
cd nexus-cli
bun install
bun dev
```

`bun dev` runs the CLI straight from source. If you want a global `nexus-dev`
command that does the same from any directory, drop a small wrapper on your
`PATH`:

```bash
#!/usr/bin/env bash
# nexus-dev — runs the live source, wherever you call it from
invoke_dir="$(pwd)"
cd "/path/to/nexus-cli/cli" || exit 1
exec bun --env-file=../.env run src/index.tsx --cwd "$invoke_dir" "$@"
```

On Windows, the equivalent `.cmd`:

```bat
@echo off
setlocal
set "NEXUS_INVOKE_DIR=%CD%"
cd /d "C:\path\to\nexus-cli\cli"
bun --env-file="..\.env" run "src\index.tsx" --cwd "%NEXUS_INVOKE_DIR%" %*
```

Releasing a new version is documented in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Custom agents

You can define your own agents under `.agents/` with full control over their
tools, prompts, and step-by-step behavior. Run `/init` inside NEXUS to scaffold
the structure.

## Credits

NEXUS is a fork of [Codebuff](https://github.com/CodebuffAI/codebuff), which did
the heavy lifting: the multi-agent architecture, the editing tools and most of
the code you'll find in the git history are theirs.

This fork exists to answer a different question — what's left of that agent once
you remove the product around it? Gone are the paid backend, the accounts, the
credit system, the billing and the web app; in their place the CLI talks
straight to OpenRouter with a key that never leaves your machine. What remains
is an agent you run, not a service you subscribe to.

There is no telemetry: the distributed binary is built with no analytics
project behind it, so the client is never created and nothing is sent anywhere.

The public GitHub identity is `jc-morales-dev`. npm currently uses the legacy
publisher scope `@victor00128`; the package name is kept explicit here so users
never confuse a GitHub rename with a separate npm package.

## License

NEXUS is released under the [Apache License 2.0](./LICENSE). See [NOTICE](./NOTICE)
for attribution.
