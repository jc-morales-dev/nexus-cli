import { create } from 'zustand'

import type { FreeTierSessionResponse } from '../types/freetier-session'

/**
 * Shared state for the freetier waiting-room session.
 *
 * The hook in `use-freetier-session.ts` owns the poll loop and writes into
 * this store; React components subscribe via selectors, and non-React code
 * reads via `useFreeTierSessionStore.getState()`.
 *
 * Imperative session controls (force re-POST, mark superseded/ended) live on
 * the module exports of `use-freetier-session.ts` rather than on this store —
 * that way callers don't need to null-check a "driver" slot whose lifetime
 * is tied to the React tree.
 */
interface FreeTierSessionStore {
  session: FreeTierSessionResponse | null
  error: string | null

  setSession: (session: FreeTierSessionResponse | null) => void
  setError: (error: string | null) => void
}

export const useFreeTierSessionStore = create<FreeTierSessionStore>((set) => ({
  session: null,
  error: null,
  setSession: (session) => set({ session }),
  setError: (error) => set({ error }),
}))
