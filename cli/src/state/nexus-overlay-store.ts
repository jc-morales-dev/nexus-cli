import { create } from 'zustand'

/**
 * Drives the two NEXUS full-screen overlays that take over the chat surface:
 *   - the /key modal (paste / view / clear your OpenRouter key)
 *   - the /model picker (choose the reasoning model)
 *
 * Only one is open at a time. Opening either closes the other so the chat never
 * tries to render both. <Chat> reads this and early-returns the matching overlay
 * while staying mounted, so the conversation is preserved underneath.
 */
interface NexusOverlayStore {
  keyModalOpen: boolean
  modelSelectorOpen: boolean
  openKeyModal: () => void
  closeKeyModal: () => void
  openModelSelector: () => void
  closeModelSelector: () => void
}

export const useNexusOverlayStore = create<NexusOverlayStore>((set) => ({
  keyModalOpen: false,
  modelSelectorOpen: false,
  openKeyModal: () => set({ keyModalOpen: true, modelSelectorOpen: false }),
  closeKeyModal: () => set({ keyModalOpen: false }),
  openModelSelector: () =>
    set({ modelSelectorOpen: true, keyModalOpen: false }),
  closeModelSelector: () => set({ modelSelectorOpen: false }),
}))
