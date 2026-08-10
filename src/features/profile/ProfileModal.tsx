import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '@/constants/colors'
import { useAuthStore } from '@/store/authStore'
import { ROLE_LABELS } from '@/types/auth'
import { AVATARS } from '@/business/missions'

const PWD_RULES = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/

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
  const { user, updateProfile, changePassword, logout } = useAuthStore()
  const navigate = useNavigate()
  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState((user as Record<string, unknown> & { phone?: string } | null)?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pickAvatar, setPickAvatar] = useState(false)

  // Password change state
  const [showPwd, setShowPwd] = useState(false)
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdSaved, setPwdSaved] = useState(false)
  const [pwdSaving, setPwdSaving] = useState(false)

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

  async function savePwd() {
    setPwdError('')
    if (!currentPwd) { setPwdError('Nhập mật khẩu hiện tại.'); return }
    if (!PWD_RULES.test(newPwd)) { setPwdError('Mật khẩu mới cần ít nhất 8 ký tự, có chữ hoa và chữ số.'); return }
    if (newPwd !== confirmPwd) { setPwdError('Mật khẩu xác nhận không khớp.'); return }
    setPwdSaving(true)
    try {
      await changePassword(currentPwd, newPwd)
      setPwdSaved(true)
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      // Revoke all refresh tokens — must log out immediately so user isn't kicked silently later
      setTimeout(async () => {
        await logout()
        navigate('/auth/login', { state: { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' } })
      }, 1500)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Đổi mật khẩu thất bại.'
        : 'Đổi mật khẩu thất bại.'
      setPwdError(msg)
    } finally {
      setPwdSaving(false)
    }
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
          {/* Password change section */}
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
            <button
              type="button"
              onClick={() => { setShowPwd(!showPwd); setPwdError('') }}
              className="flex items-center gap-1.5 text-xs font-semibold w-full"
              style={{ color: showPwd ? C.board : C.muted }}
            >
              <span style={{ display: 'inline-block', transform: showPwd ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
              Đổi mật khẩu
            </button>
            {showPwd && (
              <div className="mt-3 space-y-3">
                {['Mật khẩu hiện tại', 'Mật khẩu mới', 'Xác nhận mật khẩu mới'].map((label, i) => {
                  const vals = [currentPwd, newPwd, confirmPwd]
                  const setters = [setCurrentPwd, setNewPwd, setConfirmPwd]
                  return (
                    <div key={label}>
                      <label className="block text-xs font-bold mb-1" style={{ color: C.muted }}>{label}</label>
                      <input
                        type="password"
                        value={vals[i]}
                        onChange={(e) => { setters[i](e.target.value); setPwdError('') }}
                        autoComplete={i === 0 ? 'current-password' : 'new-password'}
                        className="w-full rounded-xl px-3 py-2 text-sm"
                        style={{ border: `1px solid ${pwdError ? '#EF4444' : C.line}`, background: C.paper, color: C.ink }}
                      />
                    </div>
                  )
                })}
                {pwdError && (
                  <p className="text-xs font-semibold" style={{ color: '#EF4444' }}>{pwdError}</p>
                )}
                <button
                  type="button"
                  onClick={savePwd}
                  disabled={pwdSaving || !currentPwd || !newPwd || !confirmPwd}
                  className="w-full rounded-xl py-2 text-sm font-bold"
                  style={{
                    background: pwdSaved ? C.board2 : C.board,
                    color: '#fff',
                    opacity: pwdSaving || !currentPwd || !newPwd || !confirmPwd ? 0.6 : 1,
                  }}
                >
                  {pwdSaved ? '✓ Đổi thành công' : pwdSaving ? 'Đang lưu...' : 'Xác nhận đổi mật khẩu'}
                </button>
              </div>
            )}
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
