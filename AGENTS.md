# NEXUS

NEXUS is a BYOK AI coding agent for the terminal, built on a composable agent
framework. The user brings their own OpenRouter key; inference goes straight to
the provider and nothing is billed through a backend. There is no NEXUS
account, and there is no NEXUS subscription — but paid models still cost the
user whatever their provider charges. Don't describe the product as "free"; the
accurate framing is "no subscription, use free or paid models with your own
API key".

It is a fork of [Codebuff](https://github.com/CodebuffAI/codebuff) (Apache-2.0,
see `NOTICE`). The paid product's server side — web app, database, billing,
credits, agent store — was removed. When you find something that assumes a
backend, it is a leftover, not a feature.

## Key technologies

- TypeScript monorepo on Bun workspaces (Bun 1.3.11, pinned in `.bun-version`)
- OpenTUI + React for the terminal UI
- OpenRouter for inference, any model the user picks

## Repo map

- `cli/` — TUI client (OpenTUI + React) and local UX
- `sdk/` — agent SDK the CLI runs on: tools, file access, run state
- `packages/agent-runtime/` — agent loop and tool handling
- `common/` — shared types, constants, schemas, test mocks
- `agents/` — the agents shipped with NEXUS
- `.agents/` — agent templates scaffolded into a user's project by `/init`
- `evals/` — repeatable behavioural evaluations of the agent
- `scripts/release/` — changelog generation and the pre-publish gate
- `npm-dist/` — the published npm package and its per-platform binaries

`packages/billing`, `packages/internal` and `packages/bigquery` are upstream
leftovers for the paid product. Nothing in the CLI path imports them.

## Conventions

- Never force-push `main` unless explicitly requested.
- Run interactive git commands in tmux (anything that opens an editor or prompts).
- User-facing strings in `cli/` are Spanish (rioplatense). Documentation and
  code comments are English.
- Paths that the model reads — tool output, result-map keys — use forward
  slashes on every platform. Paths headed for `fs` or `spawn` stay native. The
  contract is documented on `ResolvedProjectPath` in
  `sdk/src/tools/path-utils.ts`.
- Conventional Commits. The version and the changelog are derived from commit
  messages — see `docs/versioning.md`.

### Secrets

This is a BYOK tool: the user's provider key is in the process, in
`process.env`, and in request headers. **Every output surface goes through
`common/src/util/redact.ts`.** If you add a log, a report, an error message or a
telemetry payload, redact it. `maskSecret` is the only masking implementation —
don't write another one.

Error messages never show a stack trace by default. `--debug` (or
`NEXUS_DEBUG=1`) turns on the detail, and even then the output is redacted.
Error classification lives in `cli/src/utils/cli-errors.ts`; add a case there
rather than formatting an error ad hoc at the call site.

## Checks

```bash
bun --filter='*' run typecheck
bun run lint
bun run test
bun run eval:offline
```

Expected green: `common` 398, `agent-runtime` 486, `sdk` 490, `cli` 2405,
`agents` 193, `scripts` 32, `llm-providers` 20, `evals` 20 — 4044 total, plus
18 conditional skips. CI runs typecheck, lint, tests (Linux and Windows) and
the offline evals.

`bun run lint` reports ~360 inherited warnings but **zero errors**; only errors
block. `bun scripts/check-env-architecture.ts` reports pre-existing
`process.env` violations in the account-less boot path; it is informational.

## Docs

- `CONTRIBUTING.md` — setup, tests, evals, conventions
- `docs/custom-agents.md` — the `AgentDefinition` contract
- `docs/versioning.md` — SemVer, supported Node/Bun, breaking changes
- `docs/releasing.md` — how a version gets published
- `evals/README.md` — the evaluation harness
- `WINDOWS.md` — Windows specifics
