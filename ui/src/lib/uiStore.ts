import { create } from "zustand"

interface UiState {
  readonly activeProfile: string
  readonly availableProfiles: readonly string[]
  readonly setActiveProfile: (profile: string) => void
  readonly setAvailableProfiles: (profiles: readonly string[]) => void
  readonly fetchStatus: () => Promise<void>
}

export const useUiStore = create<UiState>((set) => ({
  activeProfile: "",
  availableProfiles: [],
  setActiveProfile: (profile) => set({ activeProfile: profile }),
  setAvailableProfiles: (profiles) => set({ availableProfiles: profiles }),
  fetchStatus: async () => {
    try {
      const response = await fetch("/api/status")
      if (response.ok) {
        const data = await response.json()
        set({ activeProfile: data.activeProfile })
      }
    } catch (err) {
      console.error("Failed to fetch active status:", err)
    }
  },
}))
