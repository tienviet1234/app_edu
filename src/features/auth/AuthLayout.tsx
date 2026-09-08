import type { ReactNode } from 'react'
import { C } from '@/constants/colors'

interface AuthLayoutProps {
  title: string
  subtitle?: string
  children: ReactNode
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      {/* Brand panel — navy gradient, logo + tagline */}
      <div
        className="relative flex items-center justify-center overflow-hidden px-6 py-10 sm:w-1/2 sm:py-12"
        style={{ background: `linear-gradient(145deg, ${C.board} 0%, #172d77 55%, #1a2f7a 100%)` }}
      >
        {/* Dot texture */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, #ffffff08 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        {/* Decorative circles — desktop only */}
        <div
          className="pointer-events-none absolute hidden rounded-full sm:block"
          style={{ width: 300, height: 300, background: 'rgb(255 255 255 / 0.05)', top: -80, right: -80 }}
        />
        <div
          className="pointer-events-none absolute hidden rounded-full sm:block"
          style={{ width: 200, height: 200, background: 'rgb(255 255 255 / 0.05)', bottom: 40, left: -60 }}
        />

        <div className="relative z-10 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black tracking-wider"
            style={{ background: C.gold, color: '#1C0F00', boxShadow: '0 4px 16px 0 rgb(245 158 11 / 0.40)' }}
          >
            EDU
          </div>
          <div className="text-xs uppercase tracking-widest" style={{ color: 'rgb(255 255 255 / 0.45)' }}>
            Trung tâm Anh ngữ
          </div>
          <div className="mt-1 text-lg font-black" style={{ color: '#fff' }}>
            Hệ thống quản lý
          </div>
          <div className="text-lg font-black" style={{ color: C.gold }}>
            chất lượng học tập
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-1 items-center justify-center p-6 sm:w-1/2 sm:bg-white sm:p-12">
        <div
          className="w-full max-w-sm rounded-3xl p-8 shadow-[0_24px_48px_-8px_rgb(0_0_0_/_0.35),0_8px_20px_-4px_rgb(0_0_0_/_0.14)] sm:rounded-none sm:p-0 sm:shadow-none"
          style={{ background: '#fff' }}
        >
          <h1 className="text-2xl font-black" style={{ color: C.ink }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm" style={{ color: C.muted }}>
              {subtitle}
            </p>
          )}
          <div className="mt-6">{children}</div>
        </div>

        <p
          className="absolute bottom-4 left-0 right-0 hidden text-center text-xs sm:block"
          style={{ color: C.muted }}
        >
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
