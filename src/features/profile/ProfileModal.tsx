import { useState } from 'react'
import { C } from '@/constants/colors'
import { useAuthStore } from '@/store/authStore'
import { ROLE_LABELS } from '@/types/auth'
import { AVATARS } from '@/business/missions'

const ROLE_COLORS: Record<string, string> = {
  admin: C.red,
  teacher: C.board2,
  student: C.blue,
  parent: C.gold,
}

interface ProfileModalProps {
  onClose: () => void
}

export function ProfileModal({ onClose }: ProfileModalProps) {
  const { user, updateProfile } = useAuthStore()
  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState((user as Record<string, unknown> & { phone?: string } | null)?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pickAvatar, setPickAvatar] = useState(false)

  if (!user) return null

  const avatar = user.avatar ?? '👤'

  async function save() {
    setSaving(true)
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim() || undefined })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function chooseAvatar(a: string) {
    setPickAvatar(false)
    await updateProfile({ avatar: a })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: '#00000055' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: C.card, border: `1px solid ${C.line}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4" style={{ background: C.board, color: '#fff' }}>
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-widest opacity-60">Hồ sơ cá nhân</div>
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm opacity-60 hover:opacity-100"
              style={{ background: '#ffffff20' }}
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              className="text-4xl leading-none rounded-2xl p-1 transition"
              style={{ background: '#ffffff15' }}
              onClick={() => setPickAvatar(true)}
              title="Đổi avatar"
            >
              {avatar}
            </button>
            <div>
              <div className="text-lg font-black">{user.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="text-xs font-bold rounded-full px-2 py-0.5"
                  style={{ background: (ROLE_COLORS[user.role] ?? C.muted) + '30', color: '#fff' }}
                >
                  {ROLE_LABELS[user.role]}
                </span>
                <span className="text-xs opacity-60">{user.email}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Avatar picker */}
        {pickAvatar && (
          <div className="p-4" style={{ borderBottom: `1px solid ${C.line}`, background: C.paper }}>
            <div className="mb-2 text-xs font-bold" style={{ color: C.muted }}>Chọn avatar</div>
            <div className="grid grid-cols-8 gap-1">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  onClick={() => chooseAvatar(a)}
                  className="rounded-lg text-xl text-center py-1 transition"
                  style={{
                    background: a === avatar ? C.board2 + '30' : 'transparent',
                    border: a === avatar ? `2px solid ${C.board2}` : '2px solid transparent',
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: C.muted }}>
              Họ tên
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }}
              maxLength={100}
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: C.muted }}>
              Số điện thoại
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(tuỳ chọn)"
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }}
              maxLength={20}
            />
          </div>
          <div
            className="rounded-xl p-3 text-xs"
            style={{ background: C.paper, color: C.muted, border: `1px solid ${C.line}` }}
          >
            Để đổi email hoặc mật khẩu, dùng chức năng <strong>Quên mật khẩu</strong> tại trang đăng nhập.
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl py-2 text-sm font-semibold"
              style={{ background: C.line, color: C.muted }}
            >
              Hủy
            </button>
            <button
              onClick={save}
              disabled={saving || !name.trim()}
              className="flex-1 rounded-xl py-2 text-sm font-bold transition"
              style={{
                background: saved ? C.board2 : C.board,
                color: '#fff',
                opacity: saving || !name.trim() ? 0.6 : 1,
              }}
            >
              {saved ? '✓ Đã lưu' : saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
