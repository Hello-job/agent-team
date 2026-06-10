import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/Common/Layout'
import HomePage from './pages/HomePage'
import AgentsPage from './pages/AgentsPage'
import TeamsPage from './pages/TeamsPage'
import ExecutionPage from './pages/ExecutionPage'
import SettingsPage from './pages/SettingsPage'
import { useAppStore, applyTheme } from './stores/appStore'

function App() {
  const theme = useAppStore((state) => state.theme)

  useEffect(() => {
    // Apply the selected theme
    applyTheme(theme)

    // Setup listener for OS theme updates if theme is set to system
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
      const handleSystemThemeChange = () => {
        applyTheme('system')
      }

      // Add listener support for modern browsers
      mediaQuery.addEventListener('change', handleSystemThemeChange)
      return () => {
        mediaQuery.removeEventListener('change', handleSystemThemeChange)
      }
    }
  }, [theme])

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="execution" element={<ExecutionPage />} />
        <Route path="execution/:id" element={<ExecutionPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="models" element={<Navigate to="/settings" replace />} />
      </Route>
    </Routes>
  )
}

export default App
