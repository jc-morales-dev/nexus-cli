import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import {
  NEXUS_DEFAULT_MODEL,
  NEXUS_MODELS,
  isRetiredNexusModel,
} from '../../data/nexus-models'
import { initByokKey, type ByokSettingsDeps } from '../byok-key'

// OpenRouter retired stealth/ox-alpha — the model NEXUS shipped as its default —
// on 2026-09-04, and every request to it started coming back as an error instead
// of a completion. Shipping a new default does not fix an install on its own:
// the id the user picked with /model is persisted in settings.json and wins over
// the default at boot, so it would keep pointing at the dead model forever. What
// follows pins the migration that drops the stale preference.

// Every variable initByokKey writes. NEXUS_MODE matters most: leaving it set
// puts the whole test process in account-less BYOK mode, and the API integration
// suite then gets the local byok-local-user back instead of talking to the
// backend it is trying to exercise. bun test shares one process across files.
const TOUCHED = [
  'NEXUS_MODE',
  'NEXUS_MODEL',
  'NEXUS_MODEL_STRONG',
  'NEXUS_MODEL_CHEAP',
  'NEXUS_API_KEY',
  'OPENROUTER_API_KEY',
] as const

describe('initByokKey — modelos retirados', () => {
  const original = new Map<string, string | undefined>()
  let clearCalls = 0

  /** Settings stub: no key saved, `savedModel` as the user's /model pick. */
  function deps(savedModel?: string): ByokSettingsDeps {
    return {
      loadOpenRouterApiKey: () => undefined,
      loadNexusModel: () => savedModel,
      clearNexusModel: () => {
        clearCalls += 1
      },
    }
  }

  beforeEach(() => {
    for (const key of TOUCHED) {
      original.set(key, process.env[key])
      delete process.env[key]
    }
    clearCalls = 0
  })

  afterEach(() => {
    for (const [key, value] of original) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  test('un modelo guardado que ya no existe se descarta y se borra de los ajustes', () => {
    initByokKey(deps('stealth/ox-alpha'))

    expect(process.env.NEXUS_MODEL_STRONG).toBe(NEXUS_DEFAULT_MODEL)
    expect(clearCalls).toBe(1)
  })

  test('un modelo guardado que sigue vivo se respeta', () => {
    initByokKey(deps('deepseek/deepseek-v3.2'))

    expect(process.env.NEXUS_MODEL_STRONG).toBe('deepseek/deepseek-v3.2')
    expect(clearCalls).toBe(0)
  })

  // Un directorio de configuración de solo lectura no puede impedir que el CLI
  // arranque: la preferencia no se borra, pero el usuario igual queda con un
  // modelo que responde.
  test('si no se puede escribir en los ajustes, igual cae al modelo por defecto', () => {
    const readOnly: ByokSettingsDeps = {
      ...deps('stealth/ox-alpha'),
      clearNexusModel: () => {
        throw new Error('config dir is read-only')
      },
    }

    expect(() => initByokKey(readOnly)).not.toThrow()
    expect(process.env.NEXUS_MODEL_STRONG).toBe(NEXUS_DEFAULT_MODEL)
  })

  // Heredado de un .env de desarrollo, no de los ajustes: mismo problema.
  test('un NEXUS_MODEL_STRONG retirado del entorno también se sustituye', () => {
    process.env.NEXUS_MODEL_STRONG = 'stealth/ox-alpha'

    initByokKey(deps())

    expect(process.env.NEXUS_MODEL_STRONG).toBe(NEXUS_DEFAULT_MODEL)
  })

  test('sin nada guardado se usa el modelo por defecto', () => {
    initByokKey(deps())

    expect(process.env.NEXUS_MODEL_STRONG).toBe(NEXUS_DEFAULT_MODEL)
    expect(process.env.NEXUS_MODEL_CHEAP).toBeTruthy()
  })

  test('la clave de OpenRouter guardada llega al entorno', () => {
    initByokKey({
      ...deps(),
      loadOpenRouterApiKey: () => 'sk-or-v1-de-prueba',
    })

    expect(process.env.OPENROUTER_API_KEY).toBe('sk-or-v1-de-prueba')
  })
})

describe('catálogo de modelos', () => {
  // Estos evitan que una futura edición deje a NEXUS apuntando a un modelo
  // muerto otra vez: cambiar el id por defecto sin actualizar la lista, o meter
  // en la lista de retirados el mismo que se usa por defecto.
  test('el modelo por defecto no está retirado', () => {
    expect(isRetiredNexusModel(NEXUS_DEFAULT_MODEL)).toBe(false)
  })

  test('el modelo por defecto aparece en el selector', () => {
    expect(NEXUS_MODELS.some((m) => m.id === NEXUS_DEFAULT_MODEL)).toBe(true)
  })

  test('ningún modelo del selector está retirado', () => {
    const retirados = NEXUS_MODELS.filter((m) => isRetiredNexusModel(m.id))
    expect(retirados.map((m) => m.id)).toEqual([])
  })
})
