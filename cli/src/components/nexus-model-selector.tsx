import { TextAttributes } from '@opentui/core'
import { useKeyboard, useRenderer } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import {
  NEXUS_MODELS,
  NEXUS_TIER_LABELS,
  type NexusModel,
  type NexusModelTier,
} from '../data/nexus-models'

import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'

interface NexusModelSelectorProps {
  /** The model id currently in use (gets a "(en uso)" marker). */
  currentModel: string
  /** Commit a model id. Caller persists, applies, announces, and closes. */
  onSelect: (modelId: string) => void
  /** Dismiss without changing the model. */
  onCancel: () => void
}

const TIER_ORDER: readonly NexusModelTier[] = ['balanced', 'premium', 'free']

/**
 * Full-screen, centered model picker reached via `/model`. One compact line per
 * model, grouped by tier. Arrow keys move the highlight, Enter commits, Esc
 * cancels, mouse click commits in one step. Picking sets the STRONG (reasoning)
 * model; utility agents stay on the cheap tier to save tokens.
 */
export const NexusModelSelector: React.FC<NexusModelSelectorProps> = ({
  currentModel,
  onSelect,
  onCancel,
}) => {
  const theme = useTheme()
  const renderer = useRenderer()

  const sections = useMemo(
    () =>
      TIER_ORDER.map((tier) => ({
        tier,
        label: NEXUS_TIER_LABELS[tier],
        models: NEXUS_MODELS.filter((m) => m.tier === tier),
      })).filter((s) => s.models.length > 0),
    [],
  )

  // Flat order matches the rendered order — keyboard nav indexes into this.
  const flat = useMemo<NexusModel[]>(
    () => sections.flatMap((s) => s.models),
    [sections],
  )

  const initialIndex = Math.max(
    0,
    flat.findIndex((m) => m.id === currentModel),
  )
  const [focusedIndex, setFocusedIndex] = useState(initialIndex)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Per-model line offset inside the scroll content (every row is one line;
  // each section adds a header line, and a blank margin line before all but the
  // first). Lets the auto-scroll land the focused row precisely.
  const { offsetByIndex, totalLines } = useMemo(() => {
    const offsets: number[] = []
    let line = 0
    let idx = 0
    sections.forEach((section, sIdx) => {
      if (sIdx > 0) line += 1 // margin line between sections
      line += 1 // header line
      section.models.forEach(() => {
        offsets[idx] = line
        line += 1
        idx += 1
      })
    })
    return { offsetByIndex: offsets, totalLines: line }
  }, [sections])

  const terminalHeight = renderer?.height ?? 24
  const terminalWidth = renderer?.width ?? 80
  const cardWidth = Math.max(46, Math.min(80, terminalWidth - 4))
  // Leave room for the card border, title, subtitle, and hint (~8 lines).
  const maxListHeight = Math.max(4, terminalHeight - 10)
  const needsScroll = totalLines > maxListHeight
  const viewportHeight = Math.min(totalLines, maxListHeight)

  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  useEffect(() => {
    const sb = scrollRef.current
    if (!sb || !needsScroll) return
    const top = offsetByIndex[focusedIndex]
    if (top === undefined) return
    const vh = sb.viewport.height
    if (top < sb.scrollTop) {
      sb.scrollTop = top
    } else if (top + 1 > sb.scrollTop + vh) {
      sb.scrollTop = top + 1 - vh
    }
  }, [focusedIndex, offsetByIndex, needsScroll])

  const commit = useCallback(
    (modelId: string) => {
      onSelect(modelId)
    },
    [onSelect],
  )

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        const name = key.name ?? ''
        if (name === 'escape') {
          key.preventDefault?.()
          onCancel()
          return
        }
        if (name === 'up') {
          key.preventDefault?.()
          setFocusedIndex((i) => (i > 0 ? i - 1 : flat.length - 1))
          return
        }
        if (name === 'down' || name === 'tab') {
          key.preventDefault?.()
          setFocusedIndex((i) => (i < flat.length - 1 ? i + 1 : 0))
          return
        }
        if (name === 'return' || name === 'enter' || name === 'space') {
          key.preventDefault?.()
          const model = flat[focusedIndex]
          if (model) commit(model.id)
          return
        }
      },
      [flat, focusedIndex, commit, onCancel],
    ),
  )

  let renderIndex = 0
  const sectionsContent = sections.map((section, sIdx) => (
    <box
      key={section.tier}
      style={{
        flexDirection: 'column',
        alignItems: 'flex-start',
        marginTop: sIdx === 0 ? 0 : 1,
      }}
    >
      <text style={{ wrapMode: 'none' }}>
        <span fg={theme.muted}>{section.label}</span>
      </text>
      {section.models.map((model) => {
        const idx = renderIndex++
        const isFocused = idx === focusedIndex
        const isCurrent = model.id === currentModel
        const isHovered = hoveredId === model.id
        const indicator = isFocused ? '›' : ' '
        const nameColor = isFocused ? theme.primary : theme.foreground
        return (
          <Button
            key={model.id}
            onClick={() => {
              setFocusedIndex(idx)
              commit(model.id)
            }}
            onMouseOver={() => setHoveredId(model.id)}
            onMouseOut={() =>
              setHoveredId((c) => (c === model.id ? null : c))
            }
            style={{ width: cardWidth - 4 }}
          >
            <text style={{ wrapMode: 'none' }}>
              <span fg={nameColor}>{indicator} </span>
              <span
                fg={nameColor}
                attributes={
                  isFocused || isHovered
                    ? TextAttributes.BOLD
                    : TextAttributes.NONE
                }
              >
                {model.label}
              </span>
              {isCurrent && <span fg={theme.success}> (en uso)</span>}
              <span fg={theme.muted}>  {model.tagline}</span>
            </text>
          </Button>
        )
      })}
    </box>
  ))

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: theme.surface,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 1,
      }}
    >
      <box
        style={{
          flexDirection: 'column',
          width: cardWidth,
          borderStyle: 'single',
          borderColor: theme.primary,
          padding: 1,
          gap: 1,
        }}
      >
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.primary} attributes={TextAttributes.BOLD}>
            🧠 Elegí el modelo de IA
          </span>
        </text>
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.muted}>
            Este es el modelo que razona y edita. Las tareas chicas usan uno
            barato para ahorrarte tokens.
          </span>
        </text>

        <scrollbox
          ref={scrollRef}
          scrollX={false}
          scrollbarOptions={{ visible: false }}
          verticalScrollbarOptions={{
            visible: needsScroll,
            trackOptions: { width: 1 },
          }}
          style={{
            height: viewportHeight,
            width: cardWidth - 2,
            flexShrink: 0,
            rootOptions: {
              flexDirection: 'row',
              backgroundColor: 'transparent',
            },
            wrapperOptions: {
              border: false,
              backgroundColor: 'transparent',
              flexDirection: 'column',
            },
            contentOptions: {
              flexDirection: 'column',
              alignItems: 'flex-start',
              backgroundColor: 'transparent',
            },
          }}
        >
          {sectionsContent}
        </scrollbox>

        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.muted}>
            ↑↓ moverse · Enter elegir · Esc cancelar
          </span>
        </text>
      </box>
    </box>
  )
}
