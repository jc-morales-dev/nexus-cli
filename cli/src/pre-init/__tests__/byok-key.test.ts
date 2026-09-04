import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import {
  NEXUS_DEFAULT_MODEL,
  NEXUS_MODELS,
  isRetiredNexusModel,
} from '../../data/nexus-models'
import { DEFAULT_CHEAP_MODEL, PROVIDER_IDS } from '../../data/providers'
import { initByokKey, type ByokSettingsDeps } from '../byok-key'

import type { ProviderId } from '../../data/providers'
import type { ActiveModel } from '../../utils/settings'

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
  'NEXUS_PROVIDER',
  'OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'NVIDIA_API_KEY',
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
      loadActiveModel: () =>
        savedModel ? { provider: 'openrouter', model: savedModel } : undefined,
      loadProviderApiKey: () => undefined,
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

// Paso 2: el arranque ya no asume OpenRouter. Traduce el proveedor elegido a
// las variables donde el SDK las busca.
describe('initByokKey — varios proveedores', () => {
  const original = new Map<string, string | undefined>()

  function providerDeps(
    active: ActiveModel | undefined,
    keys: Partial<Record<ProviderId, string>> = {},
  ): ByokSettingsDeps {
    return {
      loadOpenRouterApiKey: () => keys.openrouter,
      // Espeja lo que hace settings.ts de verdad: el id pelado solo se devuelve
      // cuando el modelo es de OpenRouter, porque es lo único que el enrutado
      // por id sabe resolver.
      loadNexusModel: () =>
        active?.provider === 'openrouter' ? active.model : undefined,
      clearNexusModel: () => {},
      loadActiveModel: () => active,
      loadProviderApiKey: (id) => keys[id],
    }
  }

  beforeEach(() => {
    for (const key of TOUCHED) {
      original.set(key, process.env[key])
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  test('un modelo de Anthropic fija proveedor, modelo y nivel barato', () => {
    initByokKey(
      providerDeps(
        { provider: 'anthropic', model: 'claude-opus-4.8' },
        { anthropic: 'sk-ant-api03-x' },
      ),
    )

    expect(process.env.NEXUS_PROVIDER).toBe('anthropic')
    expect(process.env.NEXUS_MODEL_STRONG).toBe('claude-opus-4.8')
    // El nivel barato sale del MISMO proveedor: si saliera de otro, el usuario
    // recibiría una segunda factura de un sitio donde no eligió nada.
    expect(process.env.NEXUS_MODEL_CHEAP).toBe(DEFAULT_CHEAP_MODEL.anthropic)
  })

  test('con OpenRouter no se fija proveedor: es el camino de siempre', () => {
    initByokKey(
      providerDeps(
        { provider: 'openrouter', model: 'z-ai/glm-5.2' },
        { openrouter: 'sk-or-v1-x' },
      ),
    )

    expect(process.env.NEXUS_PROVIDER).toBeUndefined()
    expect(process.env.NEXUS_MODEL_STRONG).toBe('z-ai/glm-5.2')
  })

  // Cargar las keys de todos permite que cambiar de proveedor con /model a
  // mitad de sesión sea cambiar una variable, sin releer el disco.
  test('carga las keys de todos los proveedores configurados', () => {
    initByokKey(
      providerDeps(undefined, {
        anthropic: 'sk-ant-api03-x',
        openai: 'sk-proj-x',
        nvidia: 'nvapi-x',
      }),
    )

    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-api03-x')
    expect(process.env.OPENAI_API_KEY).toBe('sk-proj-x')
    expect(process.env.NVIDIA_API_KEY).toBe('nvapi-x')
  })

  test('no pisa una variable que el usuario ya exportó', () => {
    process.env.ANTHROPIC_API_KEY = 'la-del-shell'

    initByokKey(providerDeps(undefined, { anthropic: 'la-guardada' }))

    expect(process.env.ANTHROPIC_API_KEY).toBe('la-del-shell')
  })

  // NEXUS_MODEL fuerza un único modelo para todo y desactiva los tiers; no debe
  // quedar pisado por la elección guardada.
  test('un NEXUS_MODEL forzado gana sobre el proveedor guardado', () => {
    process.env.NEXUS_MODEL = 'deepseek/deepseek-v3.2'

    initByokKey(
      providerDeps({ provider: 'anthropic', model: 'claude-opus-4.8' }),
    )

    expect(process.env.NEXUS_PROVIDER).toBeUndefined()
    expect(process.env.NEXUS_MODEL_STRONG).toBeUndefined()
  })

  test('cada proveedor tiene su modelo barato', () => {
    for (const id of PROVIDER_IDS) {
      expect(DEFAULT_CHEAP_MODEL[id]).toBeTruthy()
    }
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
