import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { EventProvider } from '@/contexts/EventContext'

// User pages
import Login from '@/pages/user/Login'
import Feed from '@/pages/user/Feed'
import VideoWatch from '@/pages/user/VideoWatch'

// Admin pages
import AdminLayout from '@/pages/admin/AdminLayout'
import Dashboard from '@/pages/admin/Dashboard'
import Experiments from '@/pages/admin/Experiments'
import ExperimentDetail from '@/pages/admin/ExperimentDetail'
import UICustom from '@/pages/admin/UICustom'
import UITemplateEditor from '@/pages/admin/UITemplateEditor'

// Phase 1 verification UI — exercises every surface primitive against real data.
import { SurfaceDemoFeed, SurfaceDemoWatch } from '@/ui-runtime/__demo__/SurfaceDemo'
// Phase 4 verification UI — same UX as the YouTube preset, authored as a block tree.
import {
  BlockDemoFeed,
  BlockDemoWatch,
  BlockDemoTiktokFeed,
  BlockDemoTiktokWatch,
} from '@/ui-runtime/__demo__/BlockDemo'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
}

function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps): JSX.Element {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!requireAdmin && user.is_admin) {
    return <Navigate to="/admin" replace />
  }

  if (requireAdmin && !user.is_admin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

// Lighter wrapper used by /dev/surfaces — admin or non-admin both pass.
// Useful so an admin can exercise the surfaces without first creating a
// non-admin test user.
function AnyAuthRoute({ children }: { children: React.ReactNode }): JSX.Element {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Feed />
          </ProtectedRoute>
        }
      />
      <Route
        path="/watch/:videoId"
        element={
          <ProtectedRoute>
            <VideoWatch />
          </ProtectedRoute>
        }
      />

      {/* Phase 1 verification routes. Accessible to any authenticated user
          (admin or non-admin) so the surfaces can be exercised without
          needing to bounce between accounts. */}
      <Route
        path="/dev/surfaces"
        element={<AnyAuthRoute><SurfaceDemoFeed /></AnyAuthRoute>}
      />
      <Route
        path="/dev/surfaces/watch/:videoId"
        element={<AnyAuthRoute><SurfaceDemoWatch /></AnyAuthRoute>}
      />

      {/* Phase 4 verification: block-tree-rendered feed + watch. Should
          produce the same event set as the YouTube preset at `/` and
          `/watch/:id`. */}
      <Route
        path="/dev/blocks/feed"
        element={<AnyAuthRoute><BlockDemoFeed /></AnyAuthRoute>}
      />
      <Route
        path="/dev/blocks/watch/:videoId"
        element={<AnyAuthRoute><BlockDemoWatch /></AnyAuthRoute>}
      />
      <Route
        path="/dev/blocks/tiktok-feed"
        element={<AnyAuthRoute><BlockDemoTiktokFeed /></AnyAuthRoute>}
      />
      <Route
        path="/dev/blocks/tiktok-watch/:videoId"
        element={<AnyAuthRoute><BlockDemoTiktokWatch /></AnyAuthRoute>}
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAdmin>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="experiments" element={<Experiments />} />
        <Route path="experiments/:id" element={<ExperimentDetail />} />
        <Route path="ui-custom" element={<UICustom />} />
        <Route path="ui-custom/:templateId" element={<UITemplateEditor />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App(): JSX.Element {
  return (
    <AuthProvider>
      <EventProvider>
        <AppRoutes />
      </EventProvider>
    </AuthProvider>
  )
}

export default App
