import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import { getModelForRequest } from '../impl/model-provider'

// Paso 2 del selector multi-proveedor: el SDK ya no asume OpenRouter. Elige el
// cliente según el proveedor que el usuario fijó, porque el id del modelo solo
// es ambiguo en cuanto hay más de uno configurado — `claude-sonnet-5` en
// Anthropic y `anthropic/claude-sonnet-5` en OpenRouter son el mismo modelo por
// dos caminos, con dos facturas.

// Todas las variables que toca el enrutado. bun test comparte un proceso entre
// ficheros, así que dejarse una puesta contamina suites ajenas.
const TOUCHED = [
  'NEXUS_PROVIDER',
  'OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'NVIDIA_API_KEY',
  'OPENAI_API_BASE',
  'NVIDIA_API_BASE',
  'NEXUS_MODEL',
  'NEXUS_MODEL_STRONG',
  'NEXUS_MODEL_CHEAP',
  'NEXUS_BYOK_OPENROUTER',
] as const

/** Lo que devuelve getModelForRequest, con los campos que nos interesan. */
type BuiltModel = { provider: string; modelId: string }

function build(model: string): BuiltModel {
  return getModelForRequest({ apiKey: 'nexus-byok-local', model }) as never
}

describe('enrutado por proveedor', () => {
  const original = new Map<string, string | undefined>()

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

  // Lo más importante del cambio: ningún usuario actual tiene NEXUS_PROVIDER,
  // así que su camino tiene que quedar exactamente igual que antes.
  test('sin proveedor fijado sigue yendo a OpenRouter', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-loquesea'

    const built = build('anthropic/claude-sonnet-5')

    expect(built.provider).toBe('openrouter')
    expect(built.modelId).toBe('anthropic/claude-sonnet-5')
  })

  test('fijar openrouter explícitamente da lo mismo', () => {
    process.env.NEXUS_PROVIDER = 'openrouter'
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-loquesea'

    expect(build('anthropic/claude-sonnet-5').provider).toBe('openrouter')
  })

  // Anthropic es el único que NO habla el dialecto de OpenAI, así que lleva su
  // propio SDK. El sufijo .messages lo pone @ai-sdk/anthropic.
  test('anthropic usa su propio SDK y el id pelado', () => {
    process.env.NEXUS_PROVIDER = 'anthropic'
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-loquesea'

    const built = build('claude-sonnet-5')

    expect(built.provider).toBe('anthropic.messages')
    expect(built.modelId).toBe('claude-sonnet-5')
  })

  test('openai y nvidia van por el cliente compatible', () => {
    process.env.NEXUS_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'sk-proj-loquesea'
    expect(build('gpt-5.2').provider).toBe('openai')

    delete process.env.OPENAI_API_KEY
    process.env.NEXUS_PROVIDER = 'nvidia'
    process.env.NVIDIA_API_KEY = 'nvapi-loquesea'
    expect(build('nemotron-3-super-120b').provider).toBe('nvidia')
  })

  // Una key de OpenRouter puesta no debe colarse cuando el usuario eligió otro
  // proveedor: sería mandar la petición (y la factura) al sitio equivocado.
  test('el proveedor elegido gana sobre una key de OpenRouter presente', () => {
    process.env.NEXUS_PROVIDER = 'anthropic'
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-loquesea'
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-loquesea'

    expect(build('claude-sonnet-5').provider).toBe('anthropic.messages')
  })
})

describe('errores del enrutado', () => {
  const original = new Map<string, string | undefined>()

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

  // El 401 crudo de un proveedor no dice cuál de los cuatro configurados es el
  // que falta, que es justo lo único que el usuario necesita saber.
  test('falta la key: dice qué proveedor, qué variable y dónde sacarla', () => {
    process.env.NEXUS_PROVIDER = 'anthropic'

    expect(() => build('claude-sonnet-5')).toThrow(/Anthropic/)
    expect(() => build('claude-sonnet-5')).toThrow(/ANTHROPIC_API_KEY/)
    expect(() => build('claude-sonnet-5')).toThrow(/console\.anthropic\.com/)
  })

  test('cada proveedor nombra su propia variable', () => {
    process.env.NEXUS_PROVIDER = 'openai'
    expect(() => build('gpt-5.2')).toThrow(/OPENAI_API_KEY/)

    process.env.NEXUS_PROVIDER = 'nvidia'
    expect(() => build('nemotron-3-super-120b')).toThrow(/NVIDIA_API_KEY/)
  })

  // Codex se nombra a propósito en vez de caer en "proveedor desconocido": es
  // un flujo de OAuth pendiente, no un id inválido.
  test('codex dice que todavía no está, no que no existe', () => {
    process.env.NEXUS_PROVIDER = 'codex'

    expect(() => build('gpt-5.2')).toThrow(/todavía no está implementado/)
  })

  test('un proveedor inventado explica cómo salir del atasco', () => {
    process.env.NEXUS_PROVIDER = 'groq'

    expect(() => build('llama-3.3-70b')).toThrow(/Proveedor desconocido/)
    expect(() => build('llama-3.3-70b')).toThrow(/NEXUS_PROVIDER/)
  })
})
