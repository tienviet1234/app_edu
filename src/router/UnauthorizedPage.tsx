import { Link } from 'react-router-dom'
import { C } from '@/constants/colors'

export function UnauthorizedPage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center"
      style={{ background: C.paper }}
    >
      <div className="text-6xl">🔒</div>
      <div className="text-2xl font-black" style={{ color: C.ink }}>
        Không có quyền truy cập
      </div>
      <div className="text-sm" style={{ color: C.muted }}>
        Tài khoản của bạn không có quyền xem trang này.
      </div>
      <Link
        to="/app"
        className="rounded-xl px-5 py-2.5 text-sm font-bold"
        style={{ background: C.board, color: '#fff' }}
      >
        Về trang chủ
      </Link>
    </div>
  )
}
