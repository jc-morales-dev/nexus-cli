# GitHub workflows

## What runs

One workflow, `.github/workflows/ci.yml`, on push and pull request to `main`:

- **Typecheck** (`ubuntu-latest`) — `bun --filter='*' run typecheck` across every
  workspace, then `scripts/check-env-architecture.ts` as an informational step.
- **Test** (`ubuntu-latest` and `windows-latest`) — `bun run test`.

Both platforms block. Windows is not optional: the CLI ships a Windows binary,
and the bugs this repo has actually hit were path-handling differences that a
Linux-only run cannot catch.

Concurrency is set so a new push to a branch cancels the previous run.

## Composite actions

Shared setup lives in `.github/actions/` so workflows stay short.

### `setup-project`

Installs Bun, restores the dependency cache, and runs
`bun install --frozen-lockfile`.

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: ./.github/actions/setup-project
```

Checkout has to stay outside the composite action — the action lives in the
repository being checked out.

The Bun version comes from `.bun-version` (overridable with the
`bun-version-file` input), so there is exactly one place to bump it. Keep it in
sync with the `engines.bun` field in `package.json`.

### `setup-bun-compile-runtime`

Downloads and caches a Bun runtime for a given compile target, used by
`bun build --compile` when producing the per-platform binaries. Takes a `target`
input such as `bun-windows-x64`.

## No secrets

CI needs none. NEXUS is account-less and BYOK, so there is no database, no
backend, and no API key to inject. `scripts/generate-ci-env.ts` survives from
the upstream paid product and is not used by this workflow.

## No format job

`prettier --check` currently flags roughly 510 files, nearly all inherited from
upstream. Enforcing it would mean either a permanently red job or a 510-file
reformat commit on a fork that already diverges heavily from upstream. Run
`bun run format` on the files you touch instead.
