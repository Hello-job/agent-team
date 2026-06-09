import { create } from 'zustand'
import type { Agent, Team, Execution } from '@/types'

export type Theme = 'dark' | 'light' | 'system'

export function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return
  const root = window.document.documentElement
  root.classList.remove('light', 'dark')
  
  let actualTheme: 'light' | 'dark' = 'dark'
  if (theme === 'system') {
    actualTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } else {
    actualTheme = theme
  }
  
  root.classList.add(actualTheme)
  root.style.colorScheme = actualTheme
}

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'system'
  const saved = localStorage.getItem('app-theme')
  if (saved === 'dark' || saved === 'light' || saved === 'system') {
    return saved
  }
  return 'system'
}

interface AppState {
  // UI state
  sidebarOpen: boolean
  toggleSidebar: () => void
  theme: Theme
  setTheme: (theme: Theme) => void

  // Selected items
  selectedAgent: Agent | null
  selectedTeam: Team | null
  selectedExecution: Execution | null
  setSelectedAgent: (agent: Agent | null) => void
  setSelectedTeam: (team: Team | null) => void
  setSelectedExecution: (execution: Execution | null) => void

  // Modals
  agentModalOpen: boolean
  teamModalOpen: boolean
  executionModalOpen: boolean
  openAgentModal: (agent?: Agent) => void
  openTeamModal: (team?: Team) => void
  openExecutionModal: (team?: Team) => void
  closeModals: () => void

  // Execution state
  activeExecutionId: string | null
  setActiveExecution: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  theme: getInitialTheme(),
  setTheme: (theme) => {
    localStorage.setItem('app-theme', theme)
    set({ theme })
    applyTheme(theme)
  },

  selectedAgent: null,
  selectedTeam: null,
  selectedExecution: null,
  setSelectedAgent: (agent) => set({ selectedAgent: agent }),
  setSelectedTeam: (team) => set({ selectedTeam: team }),
  setSelectedExecution: (execution) => set({ selectedExecution: execution }),

  agentModalOpen: false,
  teamModalOpen: false,
  executionModalOpen: false,
  openAgentModal: (agent) => set({ agentModalOpen: true, selectedAgent: agent || null }),
  openTeamModal: (team) => set({ teamModalOpen: true, selectedTeam: team || null }),
  openExecutionModal: (team) => set({ executionModalOpen: true, selectedTeam: team || null }),
  closeModals: () => set({ agentModalOpen: false, teamModalOpen: false, executionModalOpen: false }),

  activeExecutionId: null,
  setActiveExecution: (id) => set({ activeExecutionId: id }),
}))
