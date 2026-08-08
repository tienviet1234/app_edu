import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuthStore } from '@/store/authStore'
import { AuthLayout, ErrorBanner, Field, SubmitBtn, SuccessBanner } from './AuthLayout'
import { inputCls, inputStyle } from './formStyles'

const schema = z.object({
  email: z.string().email('Email không hợp lệ'),
})

type FormData = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const { forgotPassword, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const [success, setSuccess] = useState<string | null>(null)

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    clearError()
    try {
      await forgotPassword(data)
      setSuccess(`Mã OTP đã gửi đến ${data.email}. Kiểm tra hộp thư của bạn.`)
    } catch {
      // Store owns the visible error state.
    }
  }

  function goToOtp() {
    navigate('/auth/verify-otp', { state: { email: getValues('email') } })
  }

  return (
    <AuthLayout title="Quên mật khẩu" subtitle="Nhập email để nhận mã OTP đặt lại mật khẩu">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <ErrorBanner message={error} />
        <SuccessBanner message={success} />

        <Field label="Email" error={errors.email?.message}>
          <input
            {...register('email')}
            type="email"
            autoComplete="email"
            placeholder="email@trungtam.vn"
            className={inputCls}
            style={inputStyle(!!errors.email)}
          />
        </Field>

        <SubmitBtn loading={isLoading}>Gửi mã OTP</SubmitBtn>

        {success && (
          <button
            type="button"
            onClick={goToOtp}
            className="w-full rounded-xl py-3 text-sm font-bold transition active:scale-[0.98]"
            style={{ background: '#EDF0E9', color: '#12352B' }}
          >
            Nhập mã OTP
          </button>
        )}

        <div className="text-center text-sm text-gray-500">
          <Link to="/auth/login" className="font-semibold" style={{ color: '#12352B' }}>
            Quay lại đăng nhập
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
