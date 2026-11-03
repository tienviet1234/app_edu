import { useCallback, useEffect, useState } from 'react'
import { scanMissingSessions, type MissingClassResult } from '@/services/missingSessions'
import { recentMissingDays } from '@/business/missingSessions'
import { todayISO } from '@/utils/format'
import { C } from '@/constants/colors'
import { Btn } from '@/components/atoms/Btn'

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const DISMISS_KEY = 'lms:missingDismissed'
const RESCAN_MS = 30 * 60_000

function loadDismissed(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '{}') as Record<string, string[]> } catch { return {} }
}

/** Cảnh báo admin NGAY KHI MỞ APP nếu 14 ngày qua có buổi thiếu so với lịch học.
 *  Công cụ "Kiểm tra buổi thiếu" phải tự vào mới thấy — Lớp 7 thiếu 29/10 tới
 *  03/11 mới có người biết. Chỉ đọc; quét lỗi thì im lặng (đây chỉ là việc phụ,
 *  không ảnh hưởng dữ liệu). */
export function MissingSessionsBanner() {
  const [results, setResults] = useState<MissingClassResult[]>([])
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(loadDismissed)

  const scan = useCallback(async () => {
    if (!navigator.onLine) return
    try {
      setResults(await scanMissingSessions())
    } catch (err) {
      console.warn('Không quét được buổi thiếu:', err)
    }
  }, [])

  useEffect(() => {
    // Để app tải xong dữ liệu chính trước rồi mới quét.
    const first = setTimeout(() => { void scan() }, 4000)
    const again = setInterval(() => { void scan() }, RESCAN_MS)
    return () => { clearTimeout(first); clearInterval(again) }
  }, [scan])

  const today = todayISO()
  const rows = results
    .map((r) => ({ ...r, days: recentMissingDays(r.report, today, 14, new Set(dismissed[r.classId] ?? [])) }))
    .filter((r) => r.days.length)
  if (!rows.length) return null

  const dismiss = (classId: string, date: string) => {
    const next = { ...dismissed, [classId]: [...(dismissed[classId] ?? []), date] }
    setDismissed(next)
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)) } catch { /* chỉ là tiện ích trên máy này */ }
  }

  return (
    <div className="px-4 py-2 text-sm" style={{ background: C.gold + '26', borderBottom: `1px solid ${C.gold}66`, color: C.ink }}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 font-semibold">
          ⚠ Có buổi thiếu trong 14 ngày qua: {rows.map((r) => `${r.name} (${r.days.length} ngày)`).join(', ')}
        </span>
        <Btn size="sm" onClick={() => setOpen((v) => !v)}>{open ? 'Thu gọn' : 'Xem chi tiết'}</Btn>
      </div>
      {open && (
        <div className="mx-auto mt-2 max-w-5xl space-y-2">
          {rows.map((r) => (
            <div key={r.classId} className="rounded-xl p-3" style={{ background: '#fff', border: `1px solid ${C.line}` }}>
              <div className="font-bold">{r.name}</div>
              {r.days.map((d) => (
                <div key={d.date} className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <b style={{ color: C.red }}>{dm(d.date)}</b>
                    {d.wholeClass
                      ? ' — cả lớp chưa có buổi nào (lớp nghỉ, hay chưa nhập?)'
                      : ` — thiếu ${d.studentIds.length} em: ${d.studentIds.map((id) => r.names.get(id) ?? 'Học sinh').join(', ')}`}
                  </span>
                  <Btn size="sm" onClick={() => dismiss(r.classId, d.date)} title="Lớp nghỉ ngày này — không nhắc lại trên máy này">Ẩn (lớp nghỉ)</Btn>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
