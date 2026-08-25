# NEXUS

NEXUS is a free, account-less AI coding agent for the terminal, built on a
composable agent framework. Inference is BYOK: the user brings an OpenRouter key
and nothing is billed through a backend.

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

## Checks

```bash
bun --filter='*' run typecheck
bun run test
```

Expected green: `common` 386, `agent-runtime` 486, `sdk` 512, `cli` 2387. CI
runs both on Linux and Windows.

`bun scripts/check-env-architecture.ts` reports pre-existing `process.env`
violations in the account-less boot path; it is informational, not blocking.

## Docs

There is no `docs/` directory in this fork — it stayed in the upstream repo.
Read the code instead; `CONTRIBUTING.md` covers setup and test conventions, and
`WINDOWS.md` covers the Windows specifics.
