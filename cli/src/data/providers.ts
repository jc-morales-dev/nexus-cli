/**
 * Los proveedores de inferencia con los que NEXUS sabe hablar.
 *
 * Hasta ahora NEXUS solo hablaba con OpenRouter y la key vivía en un campo
 * suelto de settings.json (`openRouterApiKey`). Esto es el paso 1 para que el
 * usuario pueda tener varios a la vez y cambiar de uno a otro sin reiniciar.
 *
 * Nada de este fichero cambia todavía el comportamiento: es el vocabulario que
 * necesitan los ajustes, el enrutado del SDK y la pantalla de `/model`.
 *
 * Por qué el id del modelo NUNCA viaja solo: `gpt-5.2` en OpenAI y
 * `openai/gpt-5.2` en OpenRouter son el mismo modelo por dos caminos, con dos
 * facturas y dos formatos de id distintos. Guardar solo el modelo hace que la
 * elección del usuario sea ambigua en cuanto hay más de un proveedor, así que
 * el par (proveedor, modelo) va siempre junto — ver `ActiveModel` en settings.
 */

export type ProviderId =
  | 'openrouter'
  | 'anthropic'
  | 'openai'
  | 'nvidia'
  | 'codex'

/** Cómo se autentica el usuario contra un proveedor. */
export type ProviderAuthKind =
  /** Pega una API key y se guarda en su carpeta de configuración. */
  | 'apiKey'
  /** Inicia sesión en el navegador; no hay key que pegar. */
  | 'oauth'

export interface ProviderInfo {
  id: ProviderId
  /** Nombre tal y como se le muestra al usuario. */
  label: string
  auth: ProviderAuthKind
  /** Una línea explicando para qué sirve, para la pantalla de añadir. */
  blurb: string
  /**
   * Base de la API para los proveedores que hablan el dialecto de OpenAI. El
   * repo ya trae un cliente `openai-compatible` vendorizado en
   * `packages/llm-providers`, así que estos no necesitan código nuevo.
   * Indefinido = tiene su propio SDK (Anthropic) o su propio flujo (Codex).
   */
  baseUrl?: string
  /** Dónde saca el usuario su key. Se muestra al pedírsela. */
  keyUrl?: string
  /**
   * Prefijo con el que empiezan las keys de este proveedor, cuando es estable.
   * Sirve para avisar de un pegado equivocado ANTES de gastar una petición —
   * pegar la key de OpenAI en Anthropic es un error fácil y su mensaje de error
   * no ayuda nada. Es un aviso, no un bloqueo: los prefijos cambian.
   */
  keyPrefix?: string
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    auth: 'apiKey',
    blurb: 'Cientos de modelos de decenas de laboratorios, con una sola key',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    keyPrefix: 'sk-or-',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    auth: 'apiKey',
    blurb: 'Claude, directo de Anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    auth: 'apiKey',
    blurb: 'GPT con una API key de platform.openai.com',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-',
  },
  nvidia: {
    id: 'nvidia',
    label: 'NVIDIA',
    auth: 'apiKey',
    blurb: 'Nemotron y compañía, por NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    keyUrl: 'https://build.nvidia.com',
    keyPrefix: 'nvapi-',
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    auth: 'oauth',
    blurb: 'GPT entrando con tu cuenta de ChatGPT, sin API key ni tarjeta',
  },
}

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]

/**
 * El modelo que usan los agentes auxiliares (buscar ficheros, podar contexto)
 * en cada proveedor.
 *
 * Lo elige NEXUS, no el usuario, y siempre del MISMO proveedor que el modelo
 * principal. Si el nivel barato se quedara fijo en OpenRouter, alguien que
 * eligiera Claude en Anthropic acabaría pagando dos facturas sin haberlo
 * pedido: una por lo que eligió y otra por un sitio donde no eligió nada.
 *
 * El criterio es el más barato de cada catálogo que aún sepa usar herramientas;
 * un modelo que no las sabe usar no sirve para un agente por barato que sea.
 */
export const DEFAULT_CHEAP_MODEL: Record<ProviderId, string> = {
  openrouter: 'deepseek/deepseek-v4-flash',
  anthropic: 'claude-haiku-4.5',
  openai: 'gpt-5.2-mini',
  nvidia: 'nemotron-3.5-lightning',
  // Codex no factura por token: entra con la cuenta del usuario, así que no hay
  // nada que ahorrar y el nivel barato es el mismo modelo.
  codex: 'gpt-5.2',
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && value in PROVIDERS
}

/** Nombre legible de un proveedor; cae al id si es uno desconocido. */
export function providerLabel(id: string): string {
  return isProviderId(id) ? PROVIDERS[id].label : id
}

/**
 * A qué proveedor se parece una key, por su prefijo.
 *
 * Gana el prefijo más largo, y esto es lo importante: el de OpenAI es `sk-`, que
 * también encaja con `sk-or-` de OpenRouter y `sk-ant-` de Anthropic. Quedarse
 * con el primero que coincida haría pasar por buena una key de OpenRouter
 * pegada en OpenAI, que es justo la confusión más probable.
 */
export function guessProviderFromKey(apiKey: string): ProviderId | undefined {
  const trimmed = apiKey.trim()
  if (!trimmed) return undefined

  let best: ProviderId | undefined
  let bestLength = 0
  for (const id of PROVIDER_IDS) {
    const prefix = PROVIDERS[id].keyPrefix
    if (prefix && trimmed.startsWith(prefix) && prefix.length > bestLength) {
      best = id
      bestLength = prefix.length
    }
  }
  return best
}

/**
 * Si la key parece ser de OTRO proveedor distinto de aquel al que se le está
 * poniendo. Devuelve el proveedor al que sí se parece, o `undefined` si no hay
 * nada que objetar.
 *
 * Deliberadamente no se queja de las keys que no reconoce: los prefijos cambian
 * sin avisar y bloquear una key buena es peor que dejar pasar una mala, que
 * fallará igual en la primera petición con un mensaje del propio proveedor.
 */
export function keyLooksLikeAnotherProvider(
  id: ProviderId,
  apiKey: string,
): ProviderId | undefined {
  const guess = guessProviderFromKey(apiKey)
  return guess && guess !== id ? guess : undefined
}
