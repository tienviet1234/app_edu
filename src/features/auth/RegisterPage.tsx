import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuthStore } from '@/store/authStore'
import { C } from '@/constants/colors'
import { ROLE_LABELS, type UserRole } from '@/types/auth'
import { AuthLayout, ErrorBanner, Field, SubmitBtn } from './AuthLayout'
import { inputCls, inputStyle } from './formStyles'

const schema = z.object({
  name: z.string().min(2, 'Họ tên tối thiểu 2 ký tự'),
  email: z.string().email('Email không hợp lệ'),
  role: z.enum(['admin', 'teacher', 'student', 'parent'] as const),
  inviteCode: z.string().optional(),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự')
    .regex(/[A-Z]/, 'Cần ít nhất 1 chữ hoa')
    .regex(/[0-9]/, 'Cần ít nhất 1 chữ số'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Mật khẩu xác nhận không khớp',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

const PUBLIC_ROLES: UserRole[] = ['teacher', 'student', 'parent']

export function RegisterPage() {
  const { register: registerUser, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const [showPwd, setShowPwd] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'teacher' },
  })

  const role = watch('role')

  async function onSubmit(data: FormData) {
    clearError()
    try {
      const { confirmPassword, ...payload } = data
      void confirmPassword
      await registerUser(payload)
      navigate('/app', { replace: true })
    } catch {
      // Store owns the visible error state.
    }
  }

  return (
    <AuthLayout title="Đăng ký" subtitle="Tạo tài khoản mới">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <ErrorBanner message={error} />

        <Field label="Họ và tên" error={errors.name?.message}>
          <input
            {...register('name')}
            type="text"
            autoComplete="name"
            placeholder="Nguyễn Thị Oanh"
            className={inputCls}
            style={inputStyle(!!errors.name)}
          />
        </Field>

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

        <Field label="Vai trò" error={errors.role?.message}>
          <div className="grid grid-cols-2 gap-2">
            {PUBLIC_ROLES.map((r) => (
              <label
                key={r}
                className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5"
                style={{
                  border: `1.5px solid ${role === r ? C.board : C.line}`,
                  background: role === r ? C.board + '10' : '#fff',
                }}
              >
                <input {...register('role')} type="radio" value={r} className="sr-only" />
                <span className="text-sm font-semibold" style={{ color: role === r ? C.board : C.ink }}>
                  {ROLE_LABELS[r]}
                </span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Mã mời (nếu có)" error={errors.inviteCode?.message}>
          <input
            {...register('inviteCode')}
            type="text"
            placeholder="Bỏ trống nếu không có"
            className={inputCls}
            style={inputStyle(!!errors.inviteCode)}
          />
        </Field>

        <Field label="Mật khẩu" error={errors.password?.message}>
          <div className="relative">
            <input
              {...register('password')}
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Tối thiểu 8 ký tự, có số và chữ hoa"
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

        <Field label="Xác nhận mật khẩu" error={errors.confirmPassword?.message}>
          <input
            {...register('confirmPassword')}
            type={showPwd ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
            className={inputCls}
            style={inputStyle(!!errors.confirmPassword)}
          />
        </Field>

        <SubmitBtn loading={isLoading}>Tạo tài khoản</SubmitBtn>

        <div className="text-center text-sm" style={{ color: C.muted }}>
          Đã có tài khoản?{' '}
          <Link to="/auth/login" className="font-bold" style={{ color: C.board }}>
            Đăng nhập
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
