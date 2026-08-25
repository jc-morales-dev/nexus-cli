# Contributing to NEXUS

Thanks for taking a look. NEXUS is a small, account-less CLI: there is no
backend, no database, and no credentials to provision. If you can run Bun, you
can run the whole project.

## Setup

```bash
git clone https://github.com/Victor00128/nexus-cli.git
cd nexus-cli
bun install
```

You need [Bun](https://bun.sh) 1.3.11 (the version is pinned in `.bun-version`
and in the `engines` field of `package.json`).

To use the CLI while developing you need an
[OpenRouter](https://openrouter.ai/keys) API key. You never have to put it in a
file — run the CLI and type `/key`. If you prefer an env var, set
`OPENROUTER_API_KEY`.

## Running it

```bash
bun dev          # run the CLI against the repo itself
```

## Checks

Run both before opening a pull request:

```bash
bun --filter='*' run typecheck
bun run test
```

CI runs the same two commands on Linux and Windows. Everything should be green:
`common` 386, `agent-runtime` 486, `sdk` 512, `cli` 2387.

There is also `bun scripts/check-env-architecture.ts`, which enforces that
`process.env` reads live inside each package's env helper. It currently reports
a handful of pre-existing violations in the account-less boot path, so CI runs
it for information only — don't be surprised when it is red.

Formatting is Prettier (`bun run format`). Note that most of the tree is
inherited from upstream and is *not* currently Prettier-clean, so format the
files you touch rather than the whole repo.

## Repo map

- `cli/` — the terminal UI (OpenTUI + React) and everything the user sees
- `sdk/` — the agent SDK the CLI runs on: tools, file access, run state
- `packages/agent-runtime/` — agent loop and tool handling
- `common/` — shared types, constants, test mocks
- `agents/` — the agents shipped with NEXUS
- `.agents/` — templates scaffolded into a user's project by `/init`
- `npm-dist/` — the published npm package and its per-platform binaries

`packages/billing`, `packages/internal` and `packages/bigquery` are leftovers
from the upstream paid product. Nothing in the CLI path imports them.

## Tests

Tests run with `bun test`. Two conventions worth knowing:

- Prefer dependency injection over module mocking. Most functions take `fs` and
  `logger` as parameters precisely so tests can pass fakes.
- File paths in tests go through the canonical helper in
  `common/src/testing/mocks/filesystem.ts` (`mockFsPath`). Fixtures are written
  with POSIX roots like `/repo`, which on Windows resolve to `E:\repo` — if you
  compare against a raw literal, your test will pass on Linux and fail on
  Windows.

## Pull requests

Keep changes focused, explain what you verified, and include the output of the
checks above. If a change touches path handling, say explicitly whether you ran
the suite on Windows.

## License

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](./LICENSE).
