import { useEffect } from 'react'
import { Route, Switch, useLocation } from 'wouter'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AppShell } from './components/AppShell'
import { isSupabaseConfigured } from './lib/supabase'
import { AttendancePage } from './pages/AttendancePage'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { HistoryPage } from './pages/HistoryPage'
import { ProjectAliasPage } from './pages/ProjectAliasPage'
import { SetupRequiredPage } from './pages/SetupRequiredPage'
import { SiteCalendarPage } from './pages/SiteCalendarPage'
import { UpdatePasswordPage } from './pages/UpdatePasswordPage'
import { WagePage } from './pages/WagePage'
import { WorkerPage } from './pages/WorkerPage'
import { WorkerReportPage } from './pages/WorkerReportPage'

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequiredPage />
  return <AuthProvider>
    <Switch>
      <Route path="/login"><AuthPage /></Route>
      <Route path="/tetapan-kata-laluan"><UpdatePasswordPage /></Route>
      <Route><RequireAuth><AppShell><Protected /></AppShell></RequireAuth></Route>
    </Switch>
  </AuthProvider>
}

function Protected() {
  return <Switch>
    <Route path="/"><DashboardPage /></Route>
    <Route path="/attendance"><AttendancePage /></Route>
    <Route path="/projects/:projectId/calendar">{({ projectId }) => <SiteCalendarPage projectId={projectId} />}</Route>
    <Route path="/projects"><ProjectAliasPage /></Route>
    <Route path="/workers/:workerId/report">{({ workerId }) => <WorkerReportPage workerId={workerId} />}</Route>
    <Route path="/workers"><WorkerPage /></Route>
    <Route path="/wages"><WagePage /></Route>
    <Route path="/history"><HistoryPage /></Route>
    <Route><Redirect /></Route>
  </Switch>
}

function Redirect() {
  const [, navigate] = useLocation()
  useEffect(() => navigate('/', { replace: true }), [navigate])
  return null
}
