import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { classService } from '@/services/classes'
import { useAuthStore } from '@/store/authStore'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'

export function JoinClassPage() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length !== 6) {
      setError('Mã lớp gồm đúng 6 ký tự. Ví dụ: A3F9B2')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await classService.join(trimmed)
      if (result.alreadyEnrolled) {
        setSuccess(`Bạn đã tham gia lớp "${result.className}" trước đó rồi.`)
      } else {
        setSuccess(`Tham gia lớp "${result.className}" thành công! Giáo viên sẽ thấy bạn trong danh sách.`)
      }
      setCode('')
    } catch {
      setError('Mã lớp không đúng hoặc lớp không tồn tại. Hãy hỏi lại giáo viên.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: C.paper }}
    >
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <div className="text-3xl font-black" style={{ color: C.board }}>
            Tham gia lớp học
          </div>
          <div className="mt-1 text-sm" style={{ color: C.muted }}>
            Nhập mã lớp do giáo viên cung cấp
          </div>
        </div>

        <Card className="p-6 space-y-4">
          {user && (
            <div
              className="rounded-xl px-4 py-2 text-sm"
              style={{ background: C.board2 + '14', color: C.board2 }}
            >
              Đăng nhập với: <b>{user.name}</b> ({user.email})
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-semibold" style={{ color: C.muted }}>
              MÃ LỚP (6 ký tự)
            </label>
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
                setError('')
                setSuccess('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="A3F9B2"
              maxLength={6}
              className="w-full rounded-xl px-4 py-3 text-center text-2xl font-black tracking-widest"
              style={{ border: `2px solid ${error ? C.red : C.line}`, letterSpacing: '0.3em' }}
              autoFocus
            />
          </div>

          {error && (
            <div className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: '#FEE2E2', color: C.red }}>
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: '#D1FAE5', color: '#065F46' }}>
              {success}
            </div>
          )}

          <div className="flex gap-2">
            <Btn onClick={() => navigate(-1)} className="flex-none">
              ← Quay lại
            </Btn>
            <Btn
              kind="solid"
              className="flex-1"
              onClick={handleJoin}
              disabled={loading || code.length < 6}
            >
              {loading ? 'Đang tham gia...' : 'Tham gia lớp'}
            </Btn>
          </div>

          {success && (
            <Btn kind="gold" className="w-full" onClick={() => navigate('/app')}>
              Về trang chính →
            </Btn>
          )}
        </Card>

        <div className="text-center">
          <button
            onClick={() => logout()}
            className="text-xs"
            style={{ color: C.muted }}
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  )
}
