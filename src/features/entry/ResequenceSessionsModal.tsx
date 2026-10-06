import { useMemo, useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { viDate } from '@/utils/format'
import { isMongoid } from '@/utils/mongoid'
import { sessionService } from '@/services/sessions'
import { logActivity } from '@/services/activity'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'

interface Props {
  cls: ClassData
  studentId: string
  update: (fn: (c: ClassData) => void) => void
  onClose: () => void
}

interface Change {
  sessionId: string
  oldNo: number
  newNo: number
  date: string
}

/** Đánh số lại TOÀN BỘ buổi của 1 học sinh theo đúng thứ tự ngày học (ngày
 *  sớm nhất = Buổi 1, tiếp theo = Buổi 2...) — dùng khi số buổi bị lệch so
 *  với ngày thật (VD do nhập Excel sai trước đây). Chỉ đổi NHÃN SỐ, không
 *  đụng tới điểm/bài tập/ghi chú/điểm danh của bất kỳ buổi nào — mỗi buổi
 *  vẫn giữ nguyên dữ liệu, chỉ gắn lại đúng số thứ tự. */
export function ResequenceSessionsModal({ cls, studentId, update, onClose }: Props) {
  const student = cls.students.find((s) => s.id === studentId)
  const [applying, setApplying] = useState(false)

  const changes = useMemo<Change[]>(() => {
    if (!student) return []
    const sorted = [...student.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no)
    return sorted
      .map((s, i) => ({ sessionId: s.id, oldNo: s.no, newNo: i + 1, date: s.date }))
      .filter((c) => c.oldNo !== c.newNo)
  }, [student])

  if (!student) return null

  async function confirmResequence() {
    setApplying(true)
    let okCount = 0
    let failCount = 0
    for (const c of changes) {
      if (isMongoid(c.sessionId)) {
        try {
          await sessionService.update(c.sessionId, { lessonNo: c.newNo })
          okCount += 1
        } catch {
          failCount += 1
          continue
        }
      } else {
        okCount += 1
      }
      update((cData) => {
        const stu = cData.students.find((s) => s.id === studentId)
        const ss = stu?.sessions.find((s) => s.id === c.sessionId)
        if (ss) ss.no = c.newNo
      })
    }
    update((cData) => {
      const stu = cData.students.find((s) => s.id === studentId)
      stu?.sessions.sort((a, b) => a.no - b.no)
    })
    setApplying(false)
    logActivity('session.resequence', { className: cls.name, studentName: student!.name, count: okCount }, 'ClassSession')
    if (failCount) toast.error(`Đổi được ${okCount} buổi, lỗi ${failCount} buổi — thử lại các buổi lỗi sau.`, { persist: true })
    else toast.success(`Đã đánh số lại ${okCount} buổi cho ${student!.name} theo đúng thứ tự ngày học.`)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: '#00000060' }}
      onClick={onClose}
    >
      <Card
        className="max-h-[85vh] w-full max-w-lg space-y-3 overflow-y-auto p-5"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="font-bold text-base" style={{ color: C.ink }}>
          🔧 Đánh số lại buổi theo ngày — {student.name}
        </div>
        <div className="text-xs" style={{ color: C.muted }}>
          Sắp xếp lại SỐ BUỔI đúng theo thứ tự ngày học (ngày sớm nhất = Buổi 1). Chỉ đổi nhãn số —
          điểm, bài tập, ghi chú, điểm danh của từng buổi giữ nguyên, không mất gì.
        </div>

        {changes.length === 0 ? (
          <div className="rounded-lg p-3 text-sm" style={{ background: C.paper, color: C.muted }}>
            ✓ Không có buổi nào bị lệch số — thứ tự hiện tại đã đúng với ngày học.
          </div>
        ) : (
          <div className="space-y-1">
            {changes.map((c) => (
              <div
                key={c.sessionId}
                className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm"
                style={{ border: `1px solid ${C.line}`, background: C.paper }}
              >
                <span style={{ color: C.ink }}>
                  Buổi <s style={{ color: C.muted }}>{c.oldNo}</s> → <b>Buổi {c.newNo}</b>
                </span>
                <span style={{ color: C.muted }}>{viDate(c.date)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Btn onClick={onClose}>{changes.length === 0 ? 'Đóng' : 'Hủy'}</Btn>
          {changes.length > 0 && (
            <Btn kind="gold" loading={applying} onClick={confirmResequence} className="flex-1">
              ✅ Xác nhận đổi {changes.length} buổi
            </Btn>
          )}
        </div>
      </Card>
    </div>
  )
}
