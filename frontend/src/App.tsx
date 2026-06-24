import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import AppShell from './components/layout/AppShell'
import ProjectsPage from './pages/ProjectsPage'
import ChatPage from './pages/ChatPage'
import FilesPage from './pages/FilesPage'
import LogsPage from './pages/LogsPage'
import DownloadPage from './pages/DownloadPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const { isSignedIn, isLoaded } = useAuth()

  if (!isLoaded)
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading...
      </div>
    )
  if (!isSignedIn)
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Please sign in to continue.</p>
      </div>
    )

  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
