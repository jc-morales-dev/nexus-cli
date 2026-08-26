/**
 * Prompt fragments that teach an orchestrator to offload deep reasoning to the
 * `thinker-with-files-gemini` subagent.
 *
 * Only orchestrators whose own model is in `GEMINI_THINKER_PARENT_MODELS`
 * (see `./lite-agents`) get these lines; see `createBase2` in `agents/base2`.
 */
export const GEMINI_THINKER_AGENT_ID = 'thinker-with-files-gemini'

export const GEMINI_THINKER_SYSTEM_INSTRUCTION =
  "Spawn the thinker-with-files-gemini agent for complex problems -- it's very smart. Skip it for routine edits and clearly-scoped changes. Pass the relevant filePaths since it has no conversation history."

export const GEMINI_THINKER_INSTRUCTIONS_PROMPT =
  '- For complex problems, spawn the thinker-with-files-gemini agent after gathering context. Skip it for routine edits and clearly-scoped changes. Pass the relevant filePaths.'

export const GEMINI_THINKER_STEP_PROMPT =
  'Spawn the thinker-with-files-gemini agent for complex problems, not routine edits. Pass the relevant filePaths.'
