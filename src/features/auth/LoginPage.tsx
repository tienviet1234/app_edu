import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuthStore } from '@/store/authStore'
import { C } from '@/constants/colors'
import { AuthLayout, ErrorBanner, Field, SubmitBtn } from './AuthLayout'
import { inputCls, inputStyle } from './formStyles'

const schema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
})

type FormData = z.infer<typeof schema>

export function LoginPage() {
  const { login, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from ?? '/app'
  const [showPwd, setShowPwd] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    clearError()
    try {
      await login(data)
      navigate(from, { replace: true })
    } catch {
      // Store owns the visible error state.
    }
  }

  return (
    <AuthLayout title="Đăng nhập" subtitle="Chào mừng trở lại!">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <ErrorBanner message={error} />

        <Field label="Email" error={errors.email?.message}>
          <input
            {...register('email')}
            type="email"
            autoComplete="email"
            placeholder="giaovien@trungtam.vn"
            className={inputCls}
            style={inputStyle(!!errors.email)}
          />
        </Field>

        <Field label="Mật khẩu" error={errors.password?.message}>
          <div className="relative">
            <input
              {...register('password')}
              type={showPwd ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              className={inputCls}
              style={{ ...inputStyle(!!errors.password), paddingRight: 56 }}
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold"
              style={{ color: C.muted }}
            >
              {showPwd ? 'Ẩn' : 'Hiện'}
            </button>
          </div>
        </Field>

        <div className="flex justify-end">
          <Link to="/auth/forgot-password" className="text-xs font-semibold" style={{ color: C.board2 }}>
            Quên mật khẩu?
          </Link>
        </div>

        <SubmitBtn loading={isLoading}>Đăng nhập</SubmitBtn>

        <div className="text-center text-sm" style={{ color: C.muted }}>
          Chưa có tài khoản?{' '}
          <Link to="/auth/register" className="font-bold" style={{ color: C.board }}>
            Đăng ký ngay
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
