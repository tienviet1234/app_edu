import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { C } from '@/constants/colors'
import { AuthLayout, ErrorBanner, SubmitBtn } from './AuthLayout'

const OTP_LENGTH = 6

export function OtpPage() {
  const { verifyOtp, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const email = (location.state as { email?: string })?.email ?? ''
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const refs = useRef<Array<HTMLInputElement | null>>(Array(OTP_LENGTH).fill(null))
  const [resendCountdown, setResendCountdown] = useState(60)

  useEffect(() => {
    if (resendCountdown <= 0) return
    const t = setInterval(() => setResendCountdown((n) => n - 1), 1000)
    return () => clearInterval(t)
  }, [resendCountdown])

  function handleChange(i: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = digit
    setDigits(next)
    if (digit && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus()
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus()
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    const next = Array(OTP_LENGTH).fill('')
    pasted.split('').forEach((c, i) => (next[i] = c))
    setDigits(next)
    refs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus()
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    const otp = digits.join('')
    if (otp.length < OTP_LENGTH) return
    try {
      await verifyOtp({ email, otp })
      navigate('/auth/reset-password', { state: { email, otp } })
    } catch {
      // Store owns the visible error state.
    }
  }

  const otp = digits.join('')

  return (
    <AuthLayout title="Nhập mã OTP" subtitle={`Mã 6 chữ số đã gửi đến ${email}`}>
      <form onSubmit={onSubmit} className="space-y-6">
        <ErrorBanner message={error} />

        <div className="flex justify-center gap-3">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { refs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              onFocus={(e) => e.target.select()}
              className="h-14 w-12 rounded-xl text-center text-2xl font-bold transition"
              style={{
                border: `2px solid ${d ? C.board : C.line}`,
                background: d ? C.board + '08' : '#fff',
                color: C.ink,
                outline: 'none',
              }}
            />
          ))}
        </div>

        <SubmitBtn loading={isLoading && otp.length === OTP_LENGTH}>Xác nhận OTP</SubmitBtn>

        <div className="text-center text-sm" style={{ color: C.muted }}>
          {resendCountdown > 0 ? (
            <span>Gửi lại sau {resendCountdown}s</span>
          ) : (
            <button
              type="button"
              className="font-bold"
              style={{ color: C.board }}
              onClick={() => {
                setResendCountdown(60)
                setDigits(Array(OTP_LENGTH).fill(''))
              }}
            >
              Gửi lại mã OTP
            </button>
          )}
        </div>

        <div className="text-center text-sm" style={{ color: C.muted }}>
          <Link to="/auth/forgot-password" className="font-semibold" style={{ color: C.board2 }}>
            Thay đổi email
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
