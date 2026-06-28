import { TextAttributes } from '@opentui/core'
import { useRenderer } from '@opentui/react'
import React, { useCallback, useRef, useState } from 'react'

import { Button } from './button'
import { MultilineInput } from './multiline-input'
import { useTheme } from '../hooks/use-theme'

import type { InputValue } from '../types/store'
import type { KeyEvent } from '@opentui/core'

interface NexusKeyModalProps {
  /** The currently-saved key (shown masked), or undefined if none is set. */
  currentKey?: string
  /** Persist a new key. Caller masks/announces and closes the modal. */
  onSave: (key: string) => void
  /** Remove the saved key. */
  onClear: () => void
  /** Dismiss without changes. */
  onCancel: () => void
}

/** sk-or-v1-abcd…wxyz — show enough to recognize it, hide the secret middle. */
function maskKey(key: string): string {
  return key.length > 14 ? `${key.slice(0, 10)}…${key.slice(-4)}` : key
}

/**
 * Full-screen, centered modal for pasting / viewing / clearing the OpenRouter
 * API key. Reached via `/key`. Built to be paste-first: focus lands on the
 * field, paste your key, Enter saves. Mirrors the LoginModal's centered layout.
 */
export const NexusKeyModal: React.FC<NexusKeyModalProps> = ({
  currentKey,
  onSave,
  onClear,
  onCancel,
}) => {
  const theme = useTheme()
  const renderer = useRenderer()

  const [text, setText] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  // Refs mirror state so the paste handler inserts at the live cursor without
  // tripping over a stale closure.
  const textRef = useRef('')
  const cursorRef = useRef(0)
  textRef.current = text
  cursorRef.current = cursorPosition

  const terminalWidth = renderer?.width ?? 80
  const cardWidth = Math.max(40, Math.min(72, terminalWidth - 4))

  const handleChange = useCallback((value: InputValue) => {
    setText(value.text)
    setCursorPosition(value.cursorPosition)
  }, [])

  const handlePaste = useCallback((pasted?: string) => {
    if (!pasted) return
    // Keys never contain newlines; flatten any stray whitespace from the paste.
    const clean = pasted.replace(/\s+/g, '')
    const cur = cursorRef.current
    const next =
      textRef.current.slice(0, cur) + clean + textRef.current.slice(cur)
    setText(next)
    setCursorPosition(cur + clean.length)
  }, [])

  const handleSave = useCallback(() => {
    const trimmed = text.trim()
    if (trimmed.length === 0) return
    onSave(trimmed)
  }, [text, onSave])

  // Escape cancels; everything else flows to the input's own handlers.
  const handleKeyIntercept = useCallback(
    (key: KeyEvent): boolean => {
      if (key.name === 'escape') {
        onCancel()
        return true
      }
      return false
    },
    [onCancel],
  )

  const hasText = text.trim().length > 0

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
        {/* Title */}
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.primary} attributes={TextAttributes.BOLD}>
            🔑 Tu API key de OpenRouter
          </span>
        </text>

        {/* Current key status */}
        {currentKey ? (
          <text style={{ wrapMode: 'none' }}>
            <span fg={theme.secondary}>Actual: </span>
            <span fg={theme.success}>{maskKey(currentKey)}</span>
            <span fg={theme.muted}> (guardada)</span>
          </text>
        ) : (
          <text style={{ wrapMode: 'word' }}>
            <span fg={theme.muted}>
              Todavía no hay ninguna key. Conseguí una gratis en
              openrouter.ai/keys
            </span>
          </text>
        )}

        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.foreground}>
            {currentKey
              ? 'Pegá una nueva key abajo para reemplazarla, o borrá la actual:'
              : 'Pegá tu key abajo (empieza con sk-or-...):'}
          </span>
        </text>

        {/* The paste bar */}
        <box
          style={{
            width: '100%',
            borderStyle: 'single',
            borderColor: hasText ? theme.success : theme.border,
          }}
        >
          <MultilineInput
            value={text}
            cursorPosition={cursorPosition}
            onChange={handleChange}
            onSubmit={handleSave}
            onPaste={handlePaste}
            onKeyIntercept={handleKeyIntercept}
            placeholder="sk-or-..."
            focused={true}
            maxHeight={3}
            minHeight={1}
          />
        </box>

        {/* Buttons */}
        <box style={{ flexDirection: 'row', gap: 2 }}>
          <Button
            onClick={handleSave}
            style={{
              borderStyle: 'single',
              borderColor: hasText ? theme.success : theme.border,
              paddingLeft: 1,
              paddingRight: 1,
            }}
            border={['top', 'bottom', 'left', 'right']}
          >
            <text>
              <span fg={hasText ? theme.success : theme.muted}>
                Guardar (Enter)
              </span>
            </text>
          </Button>

          {currentKey && (
            <Button
              onClick={onClear}
              style={{
                borderStyle: 'single',
                borderColor: theme.border,
                paddingLeft: 1,
                paddingRight: 1,
              }}
              border={['top', 'bottom', 'left', 'right']}
            >
              <text>
                <span fg={theme.secondary}>Borrar key</span>
              </text>
            </Button>
          )}

          <Button
            onClick={onCancel}
            style={{
              borderStyle: 'single',
              borderColor: theme.border,
              paddingLeft: 1,
              paddingRight: 1,
            }}
            border={['top', 'bottom', 'left', 'right']}
          >
            <text>
              <span fg={theme.muted}>Cancelar (Esc)</span>
            </text>
          </Button>
        </box>

        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.muted}>
            Enter = guardar · Esc = cancelar · tu key queda solo en tu PC
          </span>
        </text>
      </box>
    </box>
  )
}
