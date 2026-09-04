import { describe, test, expect } from 'bun:test'

import {
  PROVIDERS,
  PROVIDER_IDS,
  guessProviderFromKey,
  isProviderId,
  keyLooksLikeAnotherProvider,
  providerLabel,
} from '../../data/providers'
import { migrateLegacyProviderSettings, type Settings } from '../settings'

// Paso 1 del selector multi-proveedor: los ajustes pasan de un campo suelto
// (`openRouterApiKey`) a un mapa de proveedores, y de un id de modelo pelado
// (`nexusModel`) al par proveedor+modelo. Lo que se fija acá es que un usuario
// que ya tenía NEXUS no pierda nada al actualizar.

describe('migración de los ajustes viejos', () => {
  test('la key suelta de OpenRouter pasa al mapa de proveedores', () => {
    const migrated = migrateLegacyProviderSettings({
      openRouterApiKey: 'sk-or-v1-loquesea',
    })

    expect(migrated.providers?.openrouter?.apiKey).toBe('sk-or-v1-loquesea')
  })

  test('el modelo suelto se atribuye a OpenRouter', () => {
    // Todo lo guardado antes de esto pasaba por OpenRouter: era el único que
    // existía, así que la atribución no es una suposición.
    const migrated = migrateLegacyProviderSettings({
      nexusModel: 'z-ai/glm-5.2',
    })

    expect(migrated.activeModel).toEqual({
      provider: 'openrouter',
      model: 'z-ai/glm-5.2',
    })
  })

  // Los campos viejos se conservan a propósito: si el usuario tiene también una
  // versión anterior de NEXUS instalada, esa solo entiende el formato viejo y
  // borrarlo la dejaría sin key.
  test('no borra los campos viejos', () => {
    const migrated = migrateLegacyProviderSettings({
      openRouterApiKey: 'sk-or-v1-loquesea',
      nexusModel: 'z-ai/glm-5.2',
    })

    expect(migrated.openRouterApiKey).toBe('sk-or-v1-loquesea')
    expect(migrated.nexusModel).toBe('z-ai/glm-5.2')
  })

  test('lo nuevo gana sobre lo viejo', () => {
    const migrated = migrateLegacyProviderSettings({
      openRouterApiKey: 'sk-or-v1-vieja',
      providers: { openrouter: { apiKey: 'sk-or-v1-nueva' } },
      nexusModel: 'modelo-viejo',
      activeModel: { provider: 'anthropic', model: 'claude-opus-4.8' },
    })

    expect(migrated.providers?.openrouter?.apiKey).toBe('sk-or-v1-nueva')
    expect(migrated.activeModel).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-4.8',
    })
  })

  test('aplicarla dos veces da lo mismo que aplicarla una', () => {
    const once = migrateLegacyProviderSettings({
      openRouterApiKey: 'sk-or-v1-loquesea',
      nexusModel: 'z-ai/glm-5.2',
    })

    expect(migrateLegacyProviderSettings(once)).toEqual(once)
  })

  test('unos ajustes vacíos no inventan proveedores', () => {
    const migrated = migrateLegacyProviderSettings({})

    expect(migrated.providers).toBeUndefined()
    expect(migrated.activeModel).toBeUndefined()
  })

  test('no muta el objeto que recibe', () => {
    const original: Settings = { openRouterApiKey: 'sk-or-v1-loquesea' }
    migrateLegacyProviderSettings(original)

    expect(original.providers).toBeUndefined()
  })

  // No convierte otros proveedores a OpenRouter: si ya hay un activeModel de
  // Anthropic, un nexusModel viejo no debe pisarlo.
  test('respeta un activeModel que no es de OpenRouter', () => {
    const migrated = migrateLegacyProviderSettings({
      nexusModel: 'z-ai/glm-5.2',
      activeModel: { provider: 'nvidia', model: 'nemotron-3-super-120b' },
    })

    expect(migrated.activeModel?.provider).toBe('nvidia')
  })
})

describe('catálogo de proveedores', () => {
  test('cada proveedor se conoce a sí mismo por su id', () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDERS[id].id).toBe(id)
    }
  })

  test('isProviderId rechaza lo que no es un proveedor', () => {
    expect(isProviderId('openrouter')).toBe(true)
    expect(isProviderId('groq')).toBe(false)
    expect(isProviderId(undefined)).toBe(false)
    expect(isProviderId(42)).toBe(false)
  })

  test('providerLabel cae al id cuando no lo conoce', () => {
    expect(providerLabel('anthropic')).toBe('Anthropic')
    expect(providerLabel('inventado')).toBe('inventado')
  })

  // Codex entra por navegador; no hay key que pegar ni URL de donde sacarla.
  test('solo Codex se autentica por OAuth', () => {
    const oauth = PROVIDER_IDS.filter((id) => PROVIDERS[id].auth === 'oauth')
    expect(oauth).toEqual(['codex'])
    expect(PROVIDERS.codex.keyPrefix).toBeUndefined()
  })

  test('todo proveedor de API key dice dónde sacarla', () => {
    for (const id of PROVIDER_IDS) {
      if (PROVIDERS[id].auth !== 'apiKey') continue
      expect(PROVIDERS[id].keyUrl).toBeTruthy()
    }
  })
})

describe('detección de key pegada en el proveedor equivocado', () => {
  // El caso que motiva todo esto: el prefijo de OpenAI es 'sk-', que también
  // encaja con 'sk-or-' y 'sk-ant-'. Quedarse con la primera coincidencia daría
  // por buena una key de OpenRouter pegada en OpenAI.
  test('gana el prefijo más largo, no el primero', () => {
    expect(guessProviderFromKey('sk-or-v1-abc')).toBe('openrouter')
    expect(guessProviderFromKey('sk-ant-api03-abc')).toBe('anthropic')
    expect(guessProviderFromKey('sk-proj-abc')).toBe('openai')
    expect(guessProviderFromKey('nvapi-abc')).toBe('nvidia')
  })

  test('avisa cuando la key es de otro proveedor', () => {
    expect(keyLooksLikeAnotherProvider('openai', 'sk-or-v1-abc')).toBe(
      'openrouter',
    )
    expect(keyLooksLikeAnotherProvider('anthropic', 'sk-or-v1-abc')).toBe(
      'openrouter',
    )
    expect(keyLooksLikeAnotherProvider('openrouter', 'sk-ant-api03-abc')).toBe(
      'anthropic',
    )
  })

  test('no se queja cuando la key encaja', () => {
    expect(
      keyLooksLikeAnotherProvider('openrouter', 'sk-or-v1-abc'),
    ).toBeUndefined()
    expect(
      keyLooksLikeAnotherProvider('anthropic', 'sk-ant-api03-abc'),
    ).toBeUndefined()
    expect(keyLooksLikeAnotherProvider('openai', 'sk-proj-abc')).toBeUndefined()
  })

  // Los prefijos cambian sin avisar. Bloquear una key buena es peor que dejar
  // pasar una mala, que va a fallar igual en la primera petición.
  test('calla ante una key que no reconoce', () => {
    expect(guessProviderFromKey('formato-nuevo-123')).toBeUndefined()
    expect(
      keyLooksLikeAnotherProvider('openai', 'formato-nuevo-123'),
    ).toBeUndefined()
    expect(keyLooksLikeAnotherProvider('openai', '   ')).toBeUndefined()
  })
})
