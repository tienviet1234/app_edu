import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute, PublicOnlyRoute } from './ProtectedRoute'

// Auth pages
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { OtpPage } from '@/features/auth/OtpPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'

// App shell (the LMS dashboard)
import App from '@/App'

// Student join page
import { JoinClassPage } from '@/features/student/JoinClassPage'

// Admin portal
import { AdminPage } from '@/features/admin/AdminPage'

// Unauthorized
import { UnauthorizedPage } from './UnauthorizedPage'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Root → redirect to app */}
        <Route path="/" element={<Navigate to="/app" replace />} />

        {/* Public-only auth routes */}
        <Route
          path="/auth/login"
          element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>}
        />
        <Route
          path="/auth/register"
          element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>}
        />
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/verify-otp" element={<OtpPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

        {/* Student join class page */}
        <Route
          path="/app/join"
          element={
            <ProtectedRoute>
              <JoinClassPage />
            </ProtectedRoute>
          }
        />

        {/* Admin portal (admin role required) */}
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminPage />
            </ProtectedRoute>
          }
        />

        {/* Protected app routes */}
        <Route
          path="/app/*"
          element={
            <ProtectedRoute>
              <App />
            </ProtectedRoute>
          }
        />

        {/* Unauthorized */}
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* 404 → login */}
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
