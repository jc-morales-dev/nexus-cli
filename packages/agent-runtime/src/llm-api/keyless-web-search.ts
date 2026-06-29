/**
 * Keyless web search for NEXUS (no API key, $0).
 *
 * Two backends, tried in order:
 *   1. SearXNG (only if NEXUS_SEARXNG_URL is set) — a self-hosted metasearch
 *      engine that aggregates Google/Bing/DDG/etc. via its JSON API. Best
 *      quality, but the user has to run it (public instances block the API).
 *   2. DuckDuckGo HTML — scraped, no key, works out of the box for everyone.
 *      Lower quality and a bit fragile (depends on DDG's HTML), but free.
 *
 * The agent turns these results into a Perplexity-style answer itself: it reads
 * the top URLs with read_url and synthesizes a cited response. This module only
 * has to return good (title, url, snippet) results.
 *
 * Only the network call needs a live `fetch`; the parsers are pure and tested.
 */
import type { Logger } from '@nexus/common/types/contracts/logger'

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

const DEFAULT_LIMIT = 8
const MAX_SNIPPET = 300
const SEARCH_TIMEOUT_MS = 12_000
// A real browser UA — DDG returns an empty page to obviously-bot clients.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/** Strip HTML tags and decode the handful of entities DDG emits. */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** DDG HTML result links are redirects like //duckduckgo.com/l/?uddg=<enc>. */
export function decodeDdgUrl(href: string): string {
  try {
    const match = href.match(/[?&]uddg=([^&]+)/)
    if (match) return decodeURIComponent(match[1])
  } catch {
    /* fall through */
  }
  if (href.startsWith('//')) return 'https:' + href
  return href
}

/** Parse the result list out of a DuckDuckGo HTML search page. Pure. */
export function parseDuckDuckGoHtml(
  html: string,
  limit = DEFAULT_LIMIT,
): SearchResult[] {
  const results: SearchResult[] = []
  const linkRe =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRe =
    /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g

  const snippets: string[] = []
  let sm: RegExpExecArray | null
  while ((sm = snippetRe.exec(html)) !== null) {
    snippets.push(stripHtml(sm[1]).slice(0, MAX_SNIPPET))
  }

  let lm: RegExpExecArray | null
  let i = 0
  while ((lm = linkRe.exec(html)) !== null && results.length < limit) {
    const url = decodeDdgUrl(lm[1])
    const title = stripHtml(lm[2])
    if (!title || !/^https?:\/\//.test(url)) {
      i++
      continue
    }
    results.push({ title, url, snippet: snippets[i] ?? '' })
    i++
  }
  return results
}

/** Parse SearXNG's JSON search response. Pure. */
export function parseSearxngJson(
  json: unknown,
  limit = DEFAULT_LIMIT,
): SearchResult[] {
  if (!json || typeof json !== 'object' || !Array.isArray((json as any).results)) {
    return []
  }
  return (json as any).results
    .slice(0, limit)
    .map((r: any): SearchResult | null => {
      const url = typeof r?.url === 'string' ? r.url : ''
      const title = typeof r?.title === 'string' ? r.title.trim() : ''
      if (!title || !/^https?:\/\//.test(url)) return null
      const snippet =
        typeof r?.content === 'string' ? r.content.trim().slice(0, MAX_SNIPPET) : ''
      return { title, url, snippet }
    })
    .filter((r: SearchResult | null): r is SearchResult => r !== null)
}

/** Format results into the plain-text block the web_search tool returns. */
export function formatSearchResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `No web results found for "${query}".`
  }
  const lines = results.map(
    (r, i) =>
      `${i + 1}. ${r.title}\n   ${r.url}${r.snippet ? `\n   ${r.snippet}` : ''}`,
  )
  return (
    `Web search results for "${query}" (read the most relevant URLs with read_url for details):\n\n` +
    lines.join('\n\n')
  )
}

async function fetchText(
  fetchFn: typeof globalThis.fetch,
  url: string,
  init?: RequestInit,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)
  try {
    const res = await fetchFn(url, {
      ...init,
      signal: controller.signal,
      headers: { 'User-Agent': BROWSER_UA, ...(init?.headers ?? {}) },
    })
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

async function searchSearxng(params: {
  baseUrl: string
  query: string
  limit: number
  fetch: typeof globalThis.fetch
}): Promise<SearchResult[]> {
  const { baseUrl, query, limit, fetch } = params
  const url = `${baseUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(
    query,
  )}&format=json`
  const text = await fetchText(fetch, url)
  return parseSearxngJson(JSON.parse(text), limit)
}

async function searchDuckDuckGo(params: {
  query: string
  limit: number
  fetch: typeof globalThis.fetch
}): Promise<SearchResult[]> {
  const { query, limit, fetch } = params
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const html = await fetchText(fetch, url)
  return parseDuckDuckGoHtml(html, limit)
}

/**
 * Run a keyless web search. Tries self-hosted SearXNG first (if configured),
 * then DuckDuckGo. Returns a formatted result string or an error message.
 */
export async function keylessWebSearch(params: {
  query: string
  depth?: string
  fetch: typeof globalThis.fetch
  logger: Logger
  searxngUrl?: string
}): Promise<{ result?: string; error?: string }> {
  const { query, fetch, logger } = params
  const limit = params.depth === 'deep' ? 12 : DEFAULT_LIMIT
  const searxngUrl = params.searxngUrl || process.env.NEXUS_SEARXNG_URL

  if (searxngUrl) {
    try {
      const results = await searchSearxng({ baseUrl: searxngUrl, query, limit, fetch })
      if (results.length > 0) return { result: formatSearchResults(query, results) }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), searxngUrl },
        'SearXNG search failed; falling back to DuckDuckGo',
      )
    }
  }

  try {
    const results = await searchDuckDuckGo({ query, limit, fetch })
    return { result: formatSearchResults(query, results) }
  } catch (err) {
    return {
      error: `Keyless web search failed for "${query}": ${
        err instanceof Error ? err.message : String(err)
      }. (Tip: set NEXUS_SEARXNG_URL to a self-hosted SearXNG for more reliable search.)`,
    }
  }
}
