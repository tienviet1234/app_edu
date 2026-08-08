import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuthStore } from '@/store/authStore'
import { AuthLayout, ErrorBanner, Field, SubmitBtn, SuccessBanner } from './AuthLayout'
import { inputCls, inputStyle } from './formStyles'

const schema = z.object({
  newPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự')
    .regex(/[A-Z]/, 'Cần ít nhất 1 chữ hoa')
    .regex(/[0-9]/, 'Cần ít nhất 1 chữ số'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Mật khẩu xác nhận không khớp',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export function ResetPasswordPage() {
  const { resetPassword, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { email?: string; otp?: string }
  const email = state?.email ?? ''
  const otp = state?.otp ?? ''
  const [showPwd, setShowPwd] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    clearError()
    try {
      await resetPassword({ email, otp, newPassword: data.newPassword })
      setSuccess('Đặt lại mật khẩu thành công! Đang chuyển đến trang đăng nhập...')
      setTimeout(() => navigate('/auth/login', { replace: true }), 2000)
    } catch {
      // Store owns the visible error state.
    }
  }

  if (!email || !otp) {
    navigate('/auth/forgot-password', { replace: true })
    return null
  }

  return (
    <AuthLayout title="Đặt lại mật khẩu" subtitle="Tạo mật khẩu mới cho tài khoản">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <ErrorBanner message={error} />
        <SuccessBanner message={success} />

        <Field label="Mật khẩu mới" error={errors.newPassword?.message}>
          <div className="relative">
            <input
              {...register('newPassword')}
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Tối thiểu 8 ký tự, có số và chữ hoa"
              className={inputCls}
              style={{ ...inputStyle(!!errors.newPassword), paddingRight: 56 }}
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold"
            >
              {showPwd ? 'Ẩn' : 'Hiện'}
            </button>
          </div>
        </Field>

        <Field label="Xác nhận mật khẩu mới" error={errors.confirmPassword?.message}>
          <input
            {...register('confirmPassword')}
            type={showPwd ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu mới"
            className={inputCls}
            style={inputStyle(!!errors.confirmPassword)}
          />
        </Field>

        <SubmitBtn loading={isLoading}>Cập nhật mật khẩu</SubmitBtn>
      </form>
    </AuthLayout>
  )
}
