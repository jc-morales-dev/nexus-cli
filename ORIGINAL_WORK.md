# What is original in this fork

NEXUS CLI is a fork of
[Codebuff](https://github.com/CodebuffAI/codebuff). Codebuff created the core
multi-agent architecture, editing tools, and much of the retained history. This
fork preserves that credit in [README.md](README.md) and [NOTICE](NOTICE).

The fork-specific work begins after Codebuff commit
[`7383f286`](https://github.com/jc-morales-dev/nexus-cli/commit/7383f28634b8ec0925159215943a53e3ef2fe221).
The auditable range is
[`7383f286..main`](https://github.com/jc-morales-dev/nexus-cli/compare/7383f28634b8ec0925159215943a53e3ef2fe221...main).
That compare link is the count: it stays accurate as the fork grows, which a
number written here would not. The current Codebuff repository no longer shares
a merge base with this checkout, so the preserved baseline is the honest
comparison point.

## Provenance map

| Area | Codebuff foundation | Work maintained by this fork |
|---|---|---|
| Agent runtime | Multi-agent orchestration and editing tools | Accountless startup, direct provider routing, reliability guards, and repair feedback for lower-cost models |
| Provider access | Original hosted product/backend integration | Local BYOK for OpenRouter, `/key`, `/model`, model tiers, and provider failure handling |
| Product surface | Codebuff CLI foundations | NEXUS terminal identity, Spanish-first CLI UX, plan/build mode, help, and model-selection flows |
| Safety and control | Existing tool permission concepts | Deterministic `.nexus/hooks.json`, `/undo`, command sandbox rules, background tasks, and validation gates |
| Developer tooling | Existing monorepo/tooling foundation | Cross-platform paths, LSP diagnostics for Python/Go/Rust, Linux+Windows CI, and removal of paid-product packages |
| Distribution | No NEXUS package | Self-contained multi-platform npm binaries and release validation, published as `@jc-morales-dev/nexus-cli` |
| Privacy | Codebuff analytics/product plumbing | Paid backend and account flows removed; analytics client disabled so the distributed CLI sends no telemetry |

## Representative commits

- [`173c4cd6`](https://github.com/jc-morales-dev/nexus-cli/commit/173c4cd677aa93945c1d1b40eef8059fd47b2085) — direct NVIDIA BYOK routing, later removed in [`6dc0779f`](https://github.com/jc-morales-dev/nexus-cli/commit/6dc0779f5dfc080c338a9870fcc13b6ab15cdf07) when the fork narrowed to a single provider. Listed because the integration work is part of the record, not because NEXUS ships it today.
- [`3e4f08bb`](https://github.com/jc-morales-dev/nexus-cli/commit/3e4f08bbec1ad5cc9805734bba2a0df206aa215e) — direct OpenRouter routing
- [`2d275aa6`](https://github.com/jc-morales-dev/nexus-cli/commit/2d275aa6573fe51b335ef35162d65269108bd33d) — accountless boot and execution
- [`cd3e9b36`](https://github.com/jc-morales-dev/nexus-cli/commit/cd3e9b366bdcb6de90dc40f956bec002abe2efdf) — anti-loop and validation guards
- [`69de513c`](https://github.com/jc-morales-dev/nexus-cli/commit/69de513c963936dc9cdbd74a996e639e294be17e) — deterministic hooks
- [`fdd555a6`](https://github.com/jc-morales-dev/nexus-cli/commit/fdd555a68853eb488ce07a540b82156c1b5f3085) — undo checkpoints
- [`6def7200`](https://github.com/jc-morales-dev/nexus-cli/commit/6def72009977b1a07234fc0ee2e4e2391d7c51ea) — command permission sandbox
- [`24d960fb`](https://github.com/jc-morales-dev/nexus-cli/commit/24d960fb5d687ba4327b5321eb6193a64492c71a) — Linux and Windows CI
- [`adec8380`](https://github.com/jc-morales-dev/nexus-cli/commit/adec838084e9ab84a8831e2116e6073304be4b61) — telemetry disablement and Codebuff attribution

This document deliberately avoids claiming that the fork wrote the inherited
agent architecture. It makes the integration, removal, hardening, UX, and
distribution work independently inspectable instead.
