import type { ReactNode } from 'react'
import { C } from '@/constants/colors'

interface AuthLayoutProps {
  title: string
  subtitle?: string
  children: ReactNode
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        background: `linear-gradient(145deg, ${C.board} 0%, #172d77 55%, #1a2f7a 100%)`,
      }}
    >
      {/* Subtle background texture dots */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, #ffffff08 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black tracking-wider"
            style={{
              background: C.gold,
              color: '#1C0F00',
              boxShadow: '0 4px 16px 0 rgb(245 158 11 / 0.40)',
            }}
          >
            EDU
          </div>
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: 'rgb(255 255 255 / 0.45)' }}>
            Trung tâm Anh ngữ
          </div>
          <h1 className="text-2xl font-black" style={{ color: '#fff' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm" style={{ color: 'rgb(255 255 255 / 0.60)' }}>
              {subtitle}
            </p>
          )}
        </div>

        {/* Form card */}
        <div
          className="rounded-3xl p-8"
          style={{
            background: '#fff',
            boxShadow:
              '0 24px 48px -8px rgb(0 0 0 / 0.35), 0 8px 20px -4px rgb(0 0 0 / 0.14)',
          }}
        >
          {children}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs" style={{ color: 'rgb(255 255 255 / 0.35)' }}>
          © {new Date().getFullYear()} EDU Portal — Hệ thống quản lý chất lượng
        </p>
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
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold" style={{ color: C.ink }}>
        {label}
      </label>
      {children}
      {error && (
        <div className="flex items-center gap-1 text-xs font-medium" style={{ color: C.red }}>
          <span>⚠</span> {error}
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
      className="w-full rounded-xl py-3.5 text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-60 hover:brightness-[0.92]"
      style={{
        background: C.board,
        color: '#fff',
        border: 'none',
        boxShadow: '0 2px 8px 0 rgb(30 58 138 / 0.28), 0 1px 2px 0 rgb(0 0 0 / 0.10)',
      }}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span
            className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
          />
          Đang xử lý...
        </span>
      ) : children}
    </button>
  )
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium"
      style={{ background: C.red + '10', color: C.red, border: `1px solid ${C.red}25` }}
    >
      <span className="mt-0.5 shrink-0">⚠</span>
      <span>{message}</span>
    </div>
  )
}

export function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium"
      style={{ background: '#059669' + '12', color: '#059669', border: `1px solid #05966928` }}
    >
      <span className="mt-0.5 shrink-0">✓</span>
      <span>{message}</span>
    </div>
  )
}
