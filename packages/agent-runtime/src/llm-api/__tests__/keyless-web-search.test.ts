import { describe, test, expect } from 'bun:test'

import {
  decodeDdgUrl,
  formatSearchResults,
  parseDuckDuckGoHtml,
  parseSearxngJson,
  stripHtml,
} from '../keyless-web-search'

describe('stripHtml', () => {
  test('removes tags and decodes entities', () => {
    expect(stripHtml('Hello <b>world</b> &amp; <i>more</i>')).toBe(
      'Hello world & more',
    )
    expect(stripHtml('a&#39;b &quot;c&quot;')).toBe('a\'b "c"')
  })
})

describe('decodeDdgUrl', () => {
  test('extracts and decodes the uddg redirect param', () => {
    const href =
      '//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage%3Fa%3D1&rut=abc'
    expect(decodeDdgUrl(href)).toBe('https://example.com/page?a=1')
  })

  test('handles protocol-relative urls without uddg', () => {
    expect(decodeDdgUrl('//example.com/x')).toBe('https://example.com/x')
  })
})

const DDG_FIXTURE = `
<div class="result results_links web-result">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fone">First <b>Result</b></a>
  <a class="result__snippet" href="x">The <b>first</b> snippet.</a>
</div>
<div class="result results_links web-result">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Ftwo">Second Result</a>
  <a class="result__snippet" href="y">Second snippet here.</a>
</div>
`

describe('parseDuckDuckGoHtml', () => {
  test('parses titles, decoded urls, and snippets', () => {
    const results = parseDuckDuckGoHtml(DDG_FIXTURE)
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      title: 'First Result',
      url: 'https://example.com/one',
      snippet: 'The first snippet.',
    })
    expect(results[1].url).toBe('https://example.org/two')
  })

  test('respects the limit', () => {
    expect(parseDuckDuckGoHtml(DDG_FIXTURE, 1)).toHaveLength(1)
  })

  test('returns nothing for a page with no results', () => {
    expect(parseDuckDuckGoHtml('<html><body>nothing</body></html>')).toEqual([])
  })
})

describe('parseSearxngJson', () => {
  test('maps results and drops malformed entries', () => {
    const json = {
      results: [
        { title: 'A', url: 'https://a.com', content: 'snippet a' },
        { title: 'no url', url: 'not-a-url', content: 'x' },
        { title: '', url: 'https://b.com', content: 'y' },
        { title: 'B', url: 'https://b.com', content: 'snippet b' },
      ],
    }
    const results = parseSearxngJson(json)
    expect(results.map((r) => r.title)).toEqual(['A', 'B'])
  })

  test('returns nothing for non-result shapes', () => {
    expect(parseSearxngJson(null)).toEqual([])
    expect(parseSearxngJson({ foo: 1 })).toEqual([])
  })
})

describe('formatSearchResults', () => {
  test('formats results with numbers, urls, and snippets', () => {
    const out = formatSearchResults('test query', [
      { title: 'A', url: 'https://a.com', snippet: 'about a' },
    ])
    expect(out).toContain('test query')
    expect(out).toContain('1. A')
    expect(out).toContain('https://a.com')
    expect(out).toContain('about a')
  })

  test('says so when there are no results', () => {
    expect(formatSearchResults('q', [])).toBe('No web results found for "q".')
  })
})
