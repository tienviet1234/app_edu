import { useEffect, useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { viDate } from '@/utils/format'
import { emptyEntry } from '@/business/seed'
import { sessionService, type ApiSession } from '@/services/sessions'
import { scoreService } from '@/services/scores'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'

interface Props {
  cls: ClassData
  studentId: string
  edit: (fn: (c: ClassData) => void) => void
  onClose: () => void
}

/** Xem lại các buổi đã "xóa" (soft delete, xem sessionController.deleteSession)
 *  của 1 học sinh và khôi phục lại — không giới hạn thời gian, dữ liệu đã được
 *  giữ nguyên 100% trên server từ lúc xóa (Score/Attendance chưa từng bị động
 *  tới), nên khôi phục lại y hệt trước khi xóa. */
export function DeletedSessionsPanel({ cls, studentId, edit, onClose }: Props) {
  const student = cls.students.find((s) => s.id === studentId)
  const [items, setItems] = useState<ApiSession[] | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    sessionService
      .list({ classId: cls.id, studentId, onlyDeleted: 'true', limit: '200' })
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
  }, [cls.id, studentId])

  if (!student) return null

  async function handleRestore(as: ApiSession) {
    setRestoringId(as._id)
    try {
      await sessionService.restore(as._id)
      const scores = await scoreService.sessionSummary(as._id)
      const score = scores.find((s) => s.studentId === studentId) ?? scores[0]
      edit((c) => {
        const stu = c.students.find((s) => s.id === studentId)
        if (!stu || stu.sessions.some((s) => s.id === as._id)) return
        stu.sessions.push({
          id: as._id,
          no: as.lessonNo ?? stu.sessions.length + 1,
          date: as.scheduledAt.slice(0, 10),
          homework: as.notes ?? '',
          entry: score
            ? {
                attendance: score.attendance, scores: score.scores, tags: score.tags, ticks: score.ticks,
                choice: score.choice, parts: score.parts, skip: score.skip,
                ev: score.ev as never, note: score.note ?? '',
              }
            : emptyEntry(),
          createdByName: as.createdBy && typeof as.createdBy === 'object' ? as.createdBy.name : undefined,
          recordedAt: as.createdAt,
        })
        stu.sessions.sort((a, b) => a.no - b.no)
      })
      setItems((prev) => prev?.filter((x) => x._id !== as._id) ?? null)
      toast.success(`Đã khôi phục Buổi ${as.lessonNo ?? '?'} (${viDate(as.scheduledAt.slice(0, 10))}) cho ${student!.name}`)
    } catch {
      toast.error('Lỗi khôi phục buổi này — thử lại.', { persist: true })
    } finally {
      setRestoringId(null)
    }
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
          🗑️ Buổi đã xóa — {student.name}
        </div>
        <div className="text-xs" style={{ color: C.muted }}>
          Dữ liệu các buổi này vẫn được giữ nguyên — khôi phục lại bất cứ lúc nào, không mất gì.
        </div>

        {items === null && <div className="text-sm" style={{ color: C.muted }}>Đang tải...</div>}
        {items?.length === 0 && (
          <div className="rounded-lg p-3 text-sm" style={{ background: C.paper, color: C.muted }}>
            Không có buổi nào đã xóa.
          </div>
        )}
        <div className="space-y-1.5">
          {items?.map((as) => (
            <div
              key={as._id}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm"
              style={{ border: `1px solid ${C.line}`, background: C.paper }}
            >
              <span style={{ color: C.ink }}>
                Buổi {as.lessonNo ?? '?'} — {viDate(as.scheduledAt.slice(0, 10))}
              </span>
              <Btn
                kind="gold"
                loading={restoringId === as._id}
                onClick={() => handleRestore(as)}
              >
                ↩️ Khôi phục
              </Btn>
            </div>
          ))}
        </div>

        <Btn onClick={onClose}>Đóng</Btn>
      </Card>
    </div>
  )
}
