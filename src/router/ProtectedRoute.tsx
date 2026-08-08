import { Navigate, useLocation } from 'react-router-dom'
import { C } from '@/constants/colors'
import { useAuthStore } from '@/store/authStore'
import { ROLE_RANK, type UserRole } from '@/types/auth'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: UserRole
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, isInitialized } = useAuthStore()
  const location = useLocation()

  if (!isInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: C.paper }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-10 w-10 animate-spin rounded-full border-4"
            style={{ borderColor: C.line, borderTopColor: C.board }}
          />
          <span className="text-sm font-medium" style={{ color: C.muted }}>
            Đang khởi động...
          </span>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />
  }

  if (requiredRole && ROLE_RANK[user.role] < ROLE_RANK[requiredRole]) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}

export function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, isInitialized } = useAuthStore()
  const location = useLocation()
  const to = (location.state as { from?: string })?.from ?? '/app'

  if (!isInitialized) return null
  if (user) return <Navigate to={to} replace />
  return <>{children}</>
}
