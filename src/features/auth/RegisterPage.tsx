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
  role: z.enum(['teacher', 'student', 'parent'] as const),
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

const VISIBLE_ROLES: { key: Exclude<UserRole, 'admin'>; icon: string; desc: string }[] = [
  { key: 'teacher',  icon: '👩‍🏫', desc: 'Nhập điểm, quản lý lớp học' },
  { key: 'parent',   icon: '👨‍👩‍👧', desc: 'Theo dõi kết quả học tập của con' },
  { key: 'student',  icon: '🎓', desc: 'Xem điểm và xếp hạng cá nhân' },
]

export function RegisterPage() {
  const { register: registerUser, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const [showPwd, setShowPwd] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [pendingMsg, setPendingMsg] = useState('')

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'teacher' },
  })

  const role = watch('role')

  async function onSubmit(data: FormData) {
    clearError()
    setPendingMsg('')
    try {
      const { confirmPassword, inviteCode, ...rest } = data
      void confirmPassword
      await registerUser({ ...rest, inviteCode: inviteCode?.trim() || undefined })
      navigate('/app', { replace: true })
    } catch (err: unknown) {
      if (err instanceof Error && (err as Error & { isPending?: boolean }).isPending) {
        setPendingMsg(err.message)
      }
      // Store owns the visible error state for non-pending errors.
    }
  }

  // Pending approval screen
  if (pendingMsg) {
    return (
      <AuthLayout title="Đăng ký thành công" subtitle="">
        <div className="space-y-4 text-center">
          <div className="text-5xl">⏳</div>
          <div className="font-bold text-base" style={{ color: C.board }}>Tài khoản đang chờ duyệt</div>
          <p className="text-sm leading-relaxed" style={{ color: C.muted }}>{pendingMsg}</p>
          <Link
            to="/auth/login"
            className="block text-sm font-bold"
            style={{ color: C.board }}
          >
            Quay lại đăng nhập
          </Link>
        </div>
      </AuthLayout>
    )
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
          <div className="grid grid-cols-3 gap-2">
            {VISIBLE_ROLES.map(({ key: r, icon, desc }) => (
              <label
                key={r}
                className="flex cursor-pointer flex-col items-center gap-1 rounded-xl px-2 py-3 text-center"
                style={{
                  border: `1.5px solid ${role === r ? C.board : C.line}`,
                  background: role === r ? C.board + '10' : '#fff',
                }}
              >
                <input {...register('role')} type="radio" value={r} className="sr-only" />
                <span className="text-2xl">{icon}</span>
                <div className="text-xs font-semibold leading-tight" style={{ color: role === r ? C.board : C.ink }}>
                  {ROLE_LABELS[r]}
                </div>
                <div className="text-[10px] leading-tight" style={{ color: C.muted }}>{desc}</div>
              </label>
            ))}
          </div>
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

        {/* Invite code — required for teacher, optional (collapsible) for admin */}
        {role === 'teacher' ? (
          <Field label="Mã mời giáo viên *" error={errors.inviteCode?.message}>
            <input
              {...register('inviteCode')}
              type="text"
              placeholder="Nhập mã mời do quản trị viên cấp"
              className={inputCls}
              style={inputStyle(!!errors.inviteCode)}
              autoComplete="off"
              autoFocus
            />
            <p className="mt-1 text-xs" style={{ color: C.muted }}>
              Liên hệ quản trị viên trung tâm để nhận mã mời. Mỗi mã chỉ dùng được 1 lần.
            </p>
          </Field>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setShowInvite(!showInvite)}
              className="text-xs font-semibold flex items-center gap-1"
              style={{ color: C.muted }}
            >
              <span style={{ display: 'inline-block', transform: showInvite ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
              Bạn có mã mời quản trị viên?
            </button>
            {showInvite && (
              <div className="mt-2">
                <Field label="Mã mời quản trị viên" error={errors.inviteCode?.message}>
                  <input
                    {...register('inviteCode')}
                    type="text"
                    placeholder="Nhập mã mời quản trị viên"
                    className={inputCls}
                    style={inputStyle(!!errors.inviteCode)}
                    autoComplete="off"
                  />
                </Field>
              </div>
            )}
          </div>
        )}

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
