# What is original in this fork

NEXUS CLI is a fork of
[Codebuff](https://github.com/CodebuffAI/codebuff). Codebuff created the core
multi-agent architecture, editing tools, and much of the retained history. This
fork preserves that credit in [README.md](README.md) and [NOTICE](NOTICE).

The fork-specific work begins after Codebuff commit
[`eaa8c108`](https://github.com/jc-morales-dev/nexus-cli/commit/eaa8c10892f2e8c81fdc1cc52483ee2b0782b657).
The auditable range is
[`eaa8c108..main`](https://github.com/jc-morales-dev/nexus-cli/compare/eaa8c10892f2e8c81fdc1cc52483ee2b0782b657...main).
At the time this document was added, that range contained 78 commits. The
current Codebuff repository no longer shares a merge base with this checkout,
so the preserved baseline is the honest comparison point.

## Provenance map

| Area | Codebuff foundation | Work maintained by this fork |
|---|---|---|
| Agent runtime | Multi-agent orchestration and editing tools | Accountless startup, direct provider routing, reliability guards, and repair feedback for lower-cost models |
| Provider access | Original hosted product/backend integration | Local BYOK for OpenRouter and NVIDIA, `/key`, `/model`, model tiers, and provider failure handling |
| Product surface | Codebuff CLI foundations | NEXUS terminal identity, Spanish-first CLI UX, plan/build mode, help, and model-selection flows |
| Safety and control | Existing tool permission concepts | Deterministic `.nexus/hooks.json`, `/undo`, command sandbox rules, background tasks, and validation gates |
| Developer tooling | Existing monorepo/tooling foundation | Cross-platform paths, LSP diagnostics for Python/Go/Rust, Linux+Windows CI, and removal of paid-product packages |
| Distribution | No NEXUS package | Self-contained multi-platform npm binaries and release validation under the legacy npm scope `@victor00128` |
| Privacy | Codebuff analytics/product plumbing | Paid backend and account flows removed; analytics client disabled so the distributed CLI sends no telemetry |

## Representative commits

- [`ab87a729`](https://github.com/jc-morales-dev/nexus-cli/commit/ab87a729f) — direct NVIDIA BYOK routing
- [`04f8ac0d`](https://github.com/jc-morales-dev/nexus-cli/commit/04f8ac0db) — direct OpenRouter routing
- [`4e8f886b`](https://github.com/jc-morales-dev/nexus-cli/commit/4e8f886b8) — accountless boot and execution
- [`8d65a03b`](https://github.com/jc-morales-dev/nexus-cli/commit/8d65a03b6) — anti-loop and validation guards
- [`7349cc51`](https://github.com/jc-morales-dev/nexus-cli/commit/7349cc51d) — deterministic hooks
- [`4a70cd8e`](https://github.com/jc-morales-dev/nexus-cli/commit/4a70cd8ec) — undo checkpoints
- [`f3f2a82d`](https://github.com/jc-morales-dev/nexus-cli/commit/f3f2a82d2) — command permission sandbox
- [`9b2eeafc`](https://github.com/jc-morales-dev/nexus-cli/commit/9b2eeafcc) — Linux and Windows CI
- [`68fe8ef2`](https://github.com/jc-morales-dev/nexus-cli/commit/68fe8ef21) — telemetry disablement and Codebuff attribution

This document deliberately avoids claiming that the fork wrote the inherited
agent architecture. It makes the integration, removal, hardening, UX, and
distribution work independently inspectable instead.
