/**
 * Test preload for the eval harness.
 *
 * Shares the runtime pre-init so the tests and `bun run eval` populate the
 * environment identically — a test that passes because its preload differs
 * from production is a test that proves nothing.
 */

import { initEvalEnv } from '../pre-init'

initEvalEnv()

// Marks this as a test runtime for the code that branches on it (analytics is
// suppressed, log files are not written).
process.env.NODE_ENV ||= 'test'
process.env.CI ||= 'true'
