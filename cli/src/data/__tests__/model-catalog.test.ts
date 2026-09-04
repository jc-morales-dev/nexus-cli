import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  CATALOG_TTL_MS,
  fetchCatalog,
  loadCatalog,
  readCache,
  type CatalogDeps,
} from '../model-catalog'

// Paso 3 del selector: los modelos se piden en vivo en vez de estar escritos a
// mano. La lista escrita a mano es lo que dejó a NEXUS apuntando a un modelo
// retirado durante días, con la versión de npm inservible al instalarla.

describe('catálogos en vivo', () => {
  let dir: string
  let deps: CatalogDeps
  let llamadas: string[]
  let ahora: number

  /** Un `fetch` de mentira que responde lo que se le diga. */
  function fakeFetch(
    responder: (url: string) => {
      ok: boolean
      status?: number
      body?: unknown
    },
  ) {
    return (async (input: any, _init?: any) => {
      const url = String(input)
      llamadas.push(url)
      const r = responder(url)
      if (!r.ok) {
        return {
          ok: false,
          status: r.status ?? 500,
          json: async () => ({}),
        } as any
      }
      return { ok: true, status: 200, json: async () => r.body } as any
    }) as unknown as typeof fetch
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cat-'))
    llamadas = []
    ahora = 1_000_000
    deps = {
      fetch: fakeFetch(() => ({
        ok: true,
        body: { data: [{ id: 'z-ai/glm-5.2', name: 'GLM 5.2' }] },
      })),
      now: () => ahora,
      cacheFile: path.join(dir, 'model-catalog.json'),
    }
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('la primera vez pide y guarda', async () => {
    const cat = await loadCatalog('openrouter', undefined, { deps })

    expect(cat.models.map((m) => m.id)).toEqual(['z-ai/glm-5.2'])
    expect(cat.stale).toBeFalsy()
    expect(llamadas).toHaveLength(1)
    expect(readCache(deps).openrouter?.models).toHaveLength(1)
  })

  // Abrir /model cinco veces en una sesión no debe provocar cinco descargas.
  test('con la caché fresca no vuelve a pedir', async () => {
    await loadCatalog('openrouter', undefined, { deps })
    ahora += CATALOG_TTL_MS - 1
    const cat = await loadCatalog('openrouter', undefined, { deps })

    expect(llamadas).toHaveLength(1)
    expect(cat.models).toHaveLength(1)
  })

  test('pasado el plazo vuelve a pedir', async () => {
    await loadCatalog('openrouter', undefined, { deps })
    ahora += CATALOG_TTL_MS + 1
    await loadCatalog('openrouter', undefined, { deps })

    expect(llamadas).toHaveLength(2)
  })

  test('force ignora una caché fresca', async () => {
    await loadCatalog('openrouter', undefined, { deps })
    await loadCatalog('openrouter', undefined, { deps, force: true })

    expect(llamadas).toHaveLength(2)
  })

  // Lo importante del diseño: quedarse sin poder elegir modelo porque no hay
  // internet sería peor que enseñar precios de anteayer.
  test('si falla la red devuelve la copia vieja, marcada', async () => {
    await loadCatalog('openrouter', undefined, { deps })
    ahora += CATALOG_TTL_MS + 1
    deps.fetch = fakeFetch(() => ({ ok: false, status: 503 }))

    const cat = await loadCatalog('openrouter', undefined, { deps })

    expect(cat.stale).toBe(true)
    expect(cat.models).toHaveLength(1)
  })

  test('si falla y no hay copia, el error nombra al proveedor', async () => {
    deps.fetch = fakeFetch(() => ({ ok: false, status: 503 }))

    await expect(
      loadCatalog('openrouter', undefined, { deps }),
    ).rejects.toThrow(/OpenRouter/)
  })

  test('una caché corrupta se trata como si no hubiera', async () => {
    fs.writeFileSync(deps.cacheFile, 'esto no es json')

    const cat = await loadCatalog('openrouter', undefined, { deps })

    expect(cat.models).toHaveLength(1)
    expect(readCache(deps).openrouter).toBeDefined()
  })

  // Un disco lleno o de solo lectura pierde la caché, no la funcionalidad.
  test('si no se puede escribir la caché, igual devuelve el catálogo', async () => {
    deps.cacheFile = path.join(dir, 'no-existe', 'sub', 'x.json')
    fs.writeFileSync(
      path.join(dir, 'no-existe'),
      'soy un fichero, no un directorio',
    )

    const cat = await loadCatalog('openrouter', undefined, { deps })

    expect(cat.models).toHaveLength(1)
  })

  test('cada proveedor se cachea por separado', async () => {
    await loadCatalog('openrouter', undefined, { deps })
    deps.fetch = fakeFetch(() => ({
      ok: true,
      body: { data: [{ id: 'meta/llama-4' }, { id: 'nvidia/nemotron-3' }] },
    }))
    await loadCatalog('nvidia', undefined, { deps })

    const cache = readCache(deps)
    expect(cache.openrouter?.models).toHaveLength(1)
    expect(cache.nvidia?.models).toHaveLength(2)
  })
})

describe('lectura de cada formato de respuesta', () => {
  const deps = (
    body: unknown,
    captura?: (url: string, init: any) => void,
  ): CatalogDeps => ({
    fetch: (async (url: any, init: any) => {
      captura?.(String(url), init)
      return { ok: true, status: 200, json: async () => body } as any
    }) as unknown as typeof fetch,
    now: () => 0,
    cacheFile: path.join(os.tmpdir(), 'nexus-cat-noop.json'),
  })

  // OpenRouter da el precio POR TOKEN; la interfaz lo enseña por millón.
  test('OpenRouter: precios convertidos a USD por millón', async () => {
    const models = await fetchCatalog(
      'openrouter',
      undefined,
      deps({
        data: [
          {
            id: 'z-ai/glm-5.3-flash',
            name: 'GLM 5.3 Flash',
            context_length: 1310720,
            pricing: { prompt: '0.00000007', completion: '0.00000025' },
          },
        ],
      }),
    )

    expect(models[0].pricing?.prompt).toBeCloseTo(0.07, 5)
    expect(models[0].pricing?.completion).toBeCloseTo(0.25, 5)
    expect(models[0].contextLength).toBe(1310720)
    expect(models[0].label).toBe('GLM 5.3 Flash')
  })

  // NVIDIA y OpenAI no publican precio ni contexto en /v1/models. Esos campos
  // quedan ausentes en vez de inventados: un cero se leería como "gratis".
  test('NVIDIA: sin precio inventado', async () => {
    const models = await fetchCatalog(
      'nvidia',
      undefined,
      deps({ data: [{ id: '01-ai/yi-large', object: 'model' }] }),
    )

    expect(models[0].id).toBe('01-ai/yi-large')
    expect(models[0].pricing).toBeUndefined()
    expect(models[0].contextLength).toBeUndefined()
  })

  // Anthropic no usa Bearer y exige la cabecera de versión; mandarlo mal da 401.
  test('Anthropic: cabeceras x-api-key y anthropic-version', async () => {
    let vistas: any = null
    await fetchCatalog(
      'anthropic',
      'sk-ant-api03-x',
      deps(
        { data: [{ id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8' }] },
        (_u, init) => {
          vistas = init?.headers
        },
      ),
    )

    expect(vistas['x-api-key']).toBe('sk-ant-api03-x')
    expect(vistas['anthropic-version']).toBeTruthy()
    expect(vistas.Authorization).toBeUndefined()
  })

  test('Anthropic: usa display_name como etiqueta', async () => {
    const models = await fetchCatalog(
      'anthropic',
      'sk-ant-api03-x',
      deps({
        data: [{ id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8' }],
      }),
    )

    expect(models[0].id).toBe('claude-opus-4-8')
    expect(models[0].label).toBe('Claude Opus 4.8')
  })

  test('los que necesitan key lo dicen antes de pedir nada', async () => {
    await expect(fetchCatalog('openai', undefined, deps({}))).rejects.toThrow(
      /necesita una key/,
    )
    await expect(
      fetchCatalog('anthropic', undefined, deps({})),
    ).rejects.toThrow(/necesita una key/)
  })

  test('una respuesta sin data no revienta', async () => {
    const models = await fetchCatalog('openrouter', undefined, deps({}))
    expect(models).toEqual([])
  })
})
