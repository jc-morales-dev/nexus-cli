import { describe, expect, test } from 'bun:test'

import {
  freetierModelNavigationDirectionForKey,
  nextFreeTierModelId,
} from '../freetier-model-navigation'

describe('nextFreeTierModelId', () => {
  test('moves to the next model when moving forward', () => {
    const modelIds = ['glm', 'minimax']

    expect(
      nextFreeTierModelId({
        modelIds,
        focusedId: 'minimax',
        direction: 'forward',
      }),
    ).toBe('glm')
  })

  test('moves to the previous model when moving backward', () => {
    const modelIds = ['glm', 'minimax']

    expect(
      nextFreeTierModelId({
        modelIds,
        focusedId: 'minimax',
        direction: 'backward',
      }),
    ).toBe('glm')
  })

  test('wraps through every model regardless of selectability', () => {
    const modelIds = ['glm', 'minimax', 'other']

    expect(
      nextFreeTierModelId({
        modelIds,
        focusedId: 'minimax',
        direction: 'forward',
      }),
    ).toBe('other')
  })

  test('returns null when no model exists', () => {
    expect(
      nextFreeTierModelId({
        modelIds: [],
        focusedId: 'glm',
        direction: 'forward',
      }),
    ).toBeNull()
  })
})

describe('freetierModelNavigationDirectionForKey', () => {
  test('maps arrow keys to model navigation directions', () => {
    expect(freetierModelNavigationDirectionForKey({ name: 'down' })).toBe(
      'forward',
    )
    expect(freetierModelNavigationDirectionForKey({ name: 'right' })).toBe(
      'forward',
    )
    expect(freetierModelNavigationDirectionForKey({ name: 'up' })).toBe(
      'backward',
    )
    expect(freetierModelNavigationDirectionForKey({ name: 'left' })).toBe(
      'backward',
    )
  })

  test('maps tab and shift-tab to model navigation directions', () => {
    expect(freetierModelNavigationDirectionForKey({ name: 'tab' })).toBe(
      'forward',
    )
    expect(
      freetierModelNavigationDirectionForKey({ name: 'tab', shift: true }),
    ).toBe('backward')
  })

  test('maps terminal tab sequences to model navigation directions', () => {
    expect(freetierModelNavigationDirectionForKey({ sequence: '\t' })).toBe(
      'forward',
    )
    expect(
      freetierModelNavigationDirectionForKey({ sequence: '\x1b[9u' }),
    ).toBe('forward')
    expect(
      freetierModelNavigationDirectionForKey({ sequence: '\x1b[Z' }),
    ).toBe('backward')
    expect(
      freetierModelNavigationDirectionForKey({ sequence: '\x1b[9;2u' }),
    ).toBe('backward')
    expect(
      freetierModelNavigationDirectionForKey({ sequence: '\x1b[27;2;9~' }),
    ).toBe('backward')
  })

  test('ignores non-navigation keys', () => {
    expect(freetierModelNavigationDirectionForKey({ name: 'enter' })).toBeNull()
  })
})
