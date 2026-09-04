/**
 * Los modelos que ofrece cada proveedor, pedidos en vivo.
 *
 * Esto existe por un incidente concreto: NEXUS traía la lista de modelos
 * escrita a mano en `nexus-models.ts`, y el 2026-09-04 se descubrió que el
 * modelo POR DEFECTO llevaba días retirado del catálogo de OpenRouter. Cada
 * petición devolvía un aviso en vez de una respuesta, y la versión publicada en
 * npm no servía para nada nada más instalarla.
 *
 * Una lista escrita a mano contra un catálogo que cambia solo puede envejecer
 * mal. La única pregunta es cuándo te enterás.
 *
 * Se cachea en disco porque pedir cuatro catálogos cada vez que se abre
 * `/model` es lento y grosero con los proveedores. Y si la red falla se
 * devuelve la copia vieja marcada como tal: quedarse sin poder elegir modelo
 * porque no hay internet sería peor que enseñar precios de ayer.
 */
import fs from 'fs'
import path from 'path'

import { getConfigDir } from '../utils/auth'
import { logger } from '../utils/logger'
import { PROVIDERS, type ProviderId } from './providers'

export interface CatalogModel {
  /** Id tal cual lo espera el proveedor en la petición. */
  id: string
  /** Nombre para mostrar. Cae al id cuando el proveedor no da uno. */
  label: string
  /** Ventana de contexto en tokens, si el proveedor la publica. */
  contextLength?: number
  /** USD por millón de tokens. Ausente cuando el proveedor no publica precios. */
  pricing?: { prompt: number; completion: number }
}

export interface Catalog {
  provider: ProviderId
  models: CatalogModel[]
  /** Cuándo se pidió de verdad, en ms desde epoch. */
  fetchedAt: number
  /**
   * True cuando esto viene de la caché tras fallar la actualización. La
   * pantalla lo dice: unos precios de hace tres días son útiles, pero el
   * usuario tiene que saber que lo son.
   */
  stale?: boolean
}

/**
 * Cuánto vale una copia antes de volver a pedirla.
 *
 * Seis horas: los catálogos cambian en días, no en minutos, y quien abra
 * `/model` cinco veces en una sesión no debería provocar cinco descargas.
 */
export const CATALOG_TTL_MS = 6 * 60 * 60 * 1000

const CACHE_FILE = 'model-catalog.json'

/** Cuánto se espera a un proveedor antes de darlo por perdido. */
const FETCH_TIMEOUT_MS = 10_000

type FetchLike = typeof fetch

export interface CatalogDeps {
  fetch: FetchLike
  now: () => number
  cacheFile: string
}

const defaultDeps = (): CatalogDeps => ({
  fetch,
  now: () => Date.now(),
  cacheFile: path.join(getConfigDir(), CACHE_FILE),
})

// ---------------------------------------------------------------------------
// Peticiones por proveedor
// ---------------------------------------------------------------------------

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

/** USD por millón, desde el precio por token que devuelve OpenRouter. */
function perMillion(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n * 1e6 : 0
}

async function fetchOpenRouter(deps: CatalogDeps): Promise<CatalogModel[]> {
  // Público: no hace falta key, así que el catálogo se puede mostrar antes
  // incluso de que el usuario haya pegado la suya.
  const res = await withTimeout((signal) =>
    deps.fetch('https://openrouter.ai/api/v1/models', { signal }),
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as { data?: unknown[] }
  return (json.data ?? []).map((raw) => {
    const m = raw as Record<string, any>
    return {
      id: String(m.id),
      label: typeof m.name === 'string' ? m.name : String(m.id),
      contextLength:
        typeof m.context_length === 'number' ? m.context_length : undefined,
      pricing: {
        prompt: perMillion(m.pricing?.prompt),
        completion: perMillion(m.pricing?.completion),
      },
    }
  })
}

/** Forma `{ object: 'list', data: [{ id }] }`, común a OpenAI y NVIDIA NIM. */
async function fetchOpenAiShaped(
  deps: CatalogDeps,
  url: string,
  apiKey: string | undefined,
): Promise<CatalogModel[]> {
  const res = await withTimeout((signal) =>
    deps.fetch(url, {
      signal,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    }),
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as { data?: unknown[] }
  // Ni OpenAI ni NVIDIA publican precio ni contexto en este endpoint, así que
  // esos campos quedan ausentes en vez de inventados.
  return (json.data ?? []).map((raw) => {
    const m = raw as Record<string, any>
    return { id: String(m.id), label: String(m.id) }
  })
}

async function fetchAnthropic(
  deps: CatalogDeps,
  apiKey: string,
): Promise<CatalogModel[]> {
  // Anthropic no usa Bearer: quiere x-api-key, y exige la cabecera de versión.
  const res = await withTimeout((signal) =>
    deps.fetch('https://api.anthropic.com/v1/models?limit=1000', {
      signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }),
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as { data?: unknown[] }
  return (json.data ?? []).map((raw) => {
    const m = raw as Record<string, any>
    return {
      id: String(m.id),
      label: typeof m.display_name === 'string' ? m.display_name : String(m.id),
    }
  })
}

/**
 * Pide el catálogo de un proveedor. Sin caché ni recuperación: eso lo pone
 * `loadCatalog`.
 */
export async function fetchCatalog(
  provider: ProviderId,
  apiKey: string | undefined,
  deps: CatalogDeps = defaultDeps(),
): Promise<CatalogModel[]> {
  switch (provider) {
    case 'openrouter':
      return fetchOpenRouter(deps)

    case 'nvidia':
      // También público, igual que OpenRouter.
      return fetchOpenAiShaped(
        deps,
        'https://integrate.api.nvidia.com/v1/models',
        apiKey,
      )

    case 'openai':
      if (!apiKey)
        throw new Error('OpenAI necesita una key para listar modelos')
      return fetchOpenAiShaped(deps, 'https://api.openai.com/v1/models', apiKey)

    case 'anthropic':
      if (!apiKey) {
        throw new Error('Anthropic necesita una key para listar modelos')
      }
      return fetchAnthropic(deps, apiKey)

    case 'codex':
      throw new Error('Codex todavía no está implementado')
  }
}

// ---------------------------------------------------------------------------
// Caché en disco
// ---------------------------------------------------------------------------

type CacheShape = Partial<Record<ProviderId, Catalog>>

export function readCache(deps: CatalogDeps = defaultDeps()): CacheShape {
  try {
    const raw = fs.readFileSync(deps.cacheFile, 'utf8')
    const parsed = JSON.parse(raw) as CacheShape
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed
  } catch {
    // Sin caché, o corrupta. Ninguna de las dos es un error: se vuelve a pedir.
    return {}
  }
}

export function writeCache(
  cache: CacheShape,
  deps: CatalogDeps = defaultDeps(),
): void {
  try {
    fs.mkdirSync(path.dirname(deps.cacheFile), { recursive: true })
    fs.writeFileSync(deps.cacheFile, JSON.stringify(cache, null, 2))
  } catch (error) {
    // Un disco lleno o de solo lectura no puede impedir elegir un modelo: se
    // pierde la caché, no la funcionalidad.
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      'No se pudo guardar la caché de catálogos',
    )
  }
}

/**
 * El catálogo de un proveedor, de la caché si está fresca y de la red si no.
 *
 * Si la red falla y hay copia vieja, se devuelve marcada `stale` en vez de
 * fallar: precios de ayer sirven para elegir; una lista vacía, no.
 */
export async function loadCatalog(
  provider: ProviderId,
  apiKey: string | undefined,
  opts: { force?: boolean; deps?: CatalogDeps } = {},
): Promise<Catalog> {
  const deps = opts.deps ?? defaultDeps()
  const cache = readCache(deps)
  const cached = cache[provider]
  const now = deps.now()

  if (!opts.force && cached && now - cached.fetchedAt < CATALOG_TTL_MS) {
    return { ...cached, stale: false }
  }

  try {
    const models = await fetchCatalog(provider, apiKey, deps)
    const fresh: Catalog = { provider, models, fetchedAt: now }
    writeCache({ ...cache, [provider]: fresh }, deps)
    return fresh
  } catch (error) {
    logger.debug(
      {
        provider,
        error: error instanceof Error ? error.message : String(error),
      },
      'No se pudo actualizar el catálogo',
    )
    if (cached) {
      return { ...cached, stale: true }
    }
    throw new Error(
      `No se pudo obtener el catálogo de ${PROVIDERS[provider].label}: ` +
        (error instanceof Error ? error.message : String(error)),
    )
  }
}
