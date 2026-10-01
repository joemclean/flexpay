import { CompassIcon } from 'lucide-react'
import { lazy } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { AppShell } from '@/components/app-shell'
import { EmptyState } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/lib/auth'
import { SignInPage, SignUpPage } from '@/pages/auth'
import { OverviewPage } from '@/pages/overview'

// Secondary routes load on demand (Insights pulls in the charting library).
const ActivityPage = lazy(() => import('@/pages/activity').then((m) => ({ default: m.ActivityPage })))
const ChildPage = lazy(() => import('@/pages/child/child-page').then((m) => ({ default: m.ChildPage })))
const InsightsPage = lazy(() => import('@/pages/insights').then((m) => ({ default: m.InsightsPage })))
const SettingsPage = lazy(() => import('@/pages/settings').then((m) => ({ default: m.SettingsPage })))

function RequireAuth() {
  const { token, isLoading } = useAuth()
  const location = useLocation()
  if (!token) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center" role="status" aria-label="Loading">
        <Spinner className="size-6 text-primary" />
      </div>
    )
  }
  return <Outlet />
}

function NotFound() {
  return (
    <EmptyState
      icon={<CompassIcon />}
      title="Page not found"
      description="That page doesn’t exist — it may have moved."
      action={
        <Button asChild>
          <Link to="/">Back to overview</Link>
        </Button>
      }
    />
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sign-up" element={<SignUpPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="children/:childId" element={<ChildPage />} />
          <Route path="children/:childId/:tab" element={<ChildPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}
