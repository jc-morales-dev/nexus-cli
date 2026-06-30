import type { AgentMode } from './constants'

/**
 * Heuristic task right-sizing ("the foreman").
 *
 * NEXUS's MAX mode is expensive — it spawns multi-prompt editors and several
 * reviewers (all Opus). For a clearly-small task (write one file, rename, a
 * question) that machinery is pure waste: slow and costly with no quality gain.
 * This classifier flags those so a MAX run can execute as DEFAULT instead —
 * still a fully capable, high-quality mode, but far cheaper and faster.
 *
 * Design: CONSERVATIVE. A positive trivial signal must be present AND no
 * complexity signal AND the prompt must be short. Any doubt → NOT trivial, so
 * the user's chosen mode is preserved and quality on real work is never risked.
 * A false positive only downgrades MAX→DEFAULT (a capable mode), so the worst
 * case is "good instead of best", never "broken". A false negative just misses
 * a saving (the task stays in MAX). Both failure modes are safe.
 */

/** Above this length a prompt is likely a detailed spec — treat as non-trivial. */
const MAX_TRIVIAL_PROMPT_LENGTH = 400

/** Substantial-work signals — ANY match means the task is NOT trivial. */
const COMPLEX_SIGNALS: RegExp[] = [
  /refactor|refactoriz/i,
  /\bmigrat|\bmigra(r|ción|cion)?\b/i,
  /arquitect|architect/i,
  /\b(todo el|entire|whole|across the)\s+(proyecto|project|codebase|repo|app)/i,
  /varios?\s+archivos|m[uú]ltiples?\s+archivos|multiple\s+files|several\s+files/i,
  /\bsistema de\b|\bsubsystem\b|\bsystem\b/i,
  /\bintegrat|\bintegra(r|ción|cion)?\b/i,
  /optimiz/i,
  /deploy|despliegu/i,
  /base de datos|\bdatabase\b|\bsql\b|postgres|mysql|mongo/i,
  /autenticaci|\bauth\b|\blogin\b|oauth|\bjwt\b/i,
  /seguridad|security|vulnerab/i,
  /\bapi\b|endpoint/i,
  /\by\s+(luego|despu[eé]s)\b|\band then\b|paso a paso|step by step/i,
]

/** Small-job signals — at least one must be present for a task to be trivial. */
const TRIVIAL_SIGNALS: RegExp[] = [
  /^\s*(hola|buenas|hey|hi|hello|gracias|thanks|ok|dale|listo)\b/i,
  /\?\s*$/,
  /\b(explica|explain|qu[eé]\s+hace|qu[eé]\s+es|c[oó]mo\s+funciona|how\s+does|what\s+is)\b/i,
  /\b(cre[aá]r?|gener[ae]r?|hac[eé]r?|haz|escrib[ie]|make|create|build|write|add|agreg[ae]r?|a[ñn]ad[ei]r?)[\s\S]{0,40}?\b(archivo|file|p[aá]gina|page|html|css|componente|component|script|funci[oó]n|function|landing|web|sitio|site)\b/i,
  /\b(renombra|rename|mueve|move|borra|delete|elimina|remove)\b/i,
  /\b(cambia|change|ajusta|adjust|pon|poner|set|reemplaza|replace)\b[\s\S]{0,40}\b(color|texto|text|nombre|name|estilo|style|valor|value|t[ií]tulo|title)\b/i,
]

/** True only when we're confident the task is small enough to right-size. */
export function isTrivialTask(prompt: string): boolean {
  const p = (prompt ?? '').trim()
  if (p.length === 0 || p.length > MAX_TRIVIAL_PROMPT_LENGTH) return false
  if (COMPLEX_SIGNALS.some((re) => re.test(p))) return false
  return TRIVIAL_SIGNALS.some((re) => re.test(p))
}

/**
 * The mode a run should actually execute in. Auto-downgrades MAX→DEFAULT for a
 * clearly-trivial task. Leaves DEFAULT/LITE (already cheap) and PLAN (read-only,
 * intentional) untouched.
 */
export function getEffectiveAgentMode(
  agentMode: AgentMode,
  prompt: string,
): AgentMode {
  if (agentMode === 'MAX' && isTrivialTask(prompt)) return 'DEFAULT'
  return agentMode
}
