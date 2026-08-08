import type { ReactNode } from 'react'
import { C } from '@/constants/colors'

interface AuthLayoutProps {
  title: string
  subtitle?: string
  children: ReactNode
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: C.paper }}>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black tracking-wide"
            style={{ background: C.board, color: '#fff' }}
          >
            EDU
          </div>
          <div className="text-xs uppercase tracking-widest" style={{ color: C.muted }}>
            Trung tâm Anh ngữ
          </div>
          <div className="text-2xl font-black leading-tight" style={{ color: C.ink }}>
            {title}
          </div>
          {subtitle && (
            <div className="mt-1 text-sm" style={{ color: C.muted }}>
              {subtitle}
            </div>
          )}
        </div>

        <div className="rounded-3xl p-8 shadow-lg" style={{ background: '#fff', border: `1px solid ${C.line}` }}>
          {children}
        </div>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  error?: string
  children: ReactNode
}

export function Field({ label, error, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-semibold" style={{ color: C.ink }}>
        {label}
      </label>
      {children}
      {error && (
        <div className="text-xs font-medium" style={{ color: C.red }}>
          {error}
        </div>
      )}
    </div>
  )
}

interface SubmitBtnProps {
  loading?: boolean
  children: ReactNode
}

export function SubmitBtn({ loading, children }: SubmitBtnProps) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-xl py-3 text-sm font-bold transition active:scale-[0.98] disabled:opacity-60"
      style={{ background: C.board, color: '#fff', border: 'none' }}
    >
      {loading ? 'Đang xử lý...' : children}
    </button>
  )
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      className="rounded-xl px-4 py-3 text-sm font-medium"
      style={{ background: C.red + '15', color: C.red, border: `1px solid ${C.red}30` }}
    >
      {message}
    </div>
  )
}

export function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      className="rounded-xl px-4 py-3 text-sm font-medium"
      style={{ background: C.board2 + '15', color: C.board2, border: `1px solid ${C.board2}30` }}
    >
      {message}
    </div>
  )
}
