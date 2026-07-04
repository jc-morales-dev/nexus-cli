#!/usr/bin/env bun

// Tiny entry point. The ONLY job of this file is to run the pre-init steps
// before anything from the main module graph evaluates:
//
//   1. Publish the sibling tree-sitter.wasm (SDK / code-map imports eagerly
//      construct the parser, which reads what pre-init publishes).
//   2. Load the user's saved OpenRouter key + BYOK env (account-less boot).
//
// Why this shape (explicit calls + dynamic imports) instead of side-effect
// imports at the top of the main module: bun build --compile TREE-SHAKES
// side-effect-only modules out of the compiled binary — the package.json
// sideEffects list is not honored — which silently dropped both pre-inits
// from the distributed .exe. Named imports that are explicitly CALLED cannot
// be stripped, and the top-level `await import()`s guarantee evaluation
// order: wasm publish → BYOK env → main module graph.
//
// ORDER IS LOAD-BEARING. Only tree-sitter-wasm may be imported statically
// here (its subtree is just fs/path). byok-key MUST stay dynamic: its import
// chain (settings → auth → nexus-api) pulls in @nexus/sdk, whose module
// evaluation constructs the tree-sitter parser — that has to happen after
// initTreeSitterWasm() ran.
import { initTreeSitterWasm } from './pre-init/tree-sitter-wasm'

initTreeSitterWasm()

const { initByokKey } = await import('./pre-init/byok-key')
initByokKey()

await import('./cli-main')
