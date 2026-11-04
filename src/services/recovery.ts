import type { AppData } from '@/types'
import { normalize } from '@/business/seed'
import { sameEntry, type ClassifiedJob } from '@/business/strandedScores'
import { sessionService } from '@/services/sessions'
import { scoreService } from '@/services/scores'

export type PushResult = 'done' | 'already' | 'conflict' | 'deleted'

/** Bản chụp chưa qua normalize (giữ đủ field rubric của lớp) nhưng bảo đảm entry
 *  đủ khóa — dùng cấu trúc của normalize cho học sinh/buổi. */
export function snapshotClasses(raw: unknown): AppData['classes'] {
  const rawClasses = ((raw as { classes?: unknown[] })?.classes ?? []) as Record<string, unknown>[]
  return normalize(raw).classes.map((nc, i) => ({ ...(rawClasses[i] as object), ...nc }) as AppData['classes'][number])
}

/** Đưa 1 buổi tìm được trong bản chụp lên server: chỉ điền chỗ server CHƯA có
 *  (`ifAbsent`), không bao giờ ghi đè. Buổi admin tạo hộ gửi `onBehalfOf` = giáo
 *  viên chủ máy (Thống kê buổi/lương tính theo `createdBy`). Lỗi mạng ném ra ngoài. */
export async function pushRecoveredJob(item: ClassifiedJob, owner: { _id: string; role: string } | null | undefined): Promise<PushResult> {
  let sessionId = item.targetSessionId
  if (item.kind === 'create') {
    try {
      const created = await sessionService.create({
        classId: item.classId, studentId: item.studentId, title: `Buổi ${item.no}`, lessonNo: item.no,
        scheduledAt: `${item.date}T00:00:00.000Z`, notes: item.homework || undefined, placeByDate: true,
        ...(item.maxes ? { maxes: item.maxes } : {}),
        ...(owner?.role === 'teacher' ? { onBehalfOf: owner._id } : {}),
      })
      sessionId = created._id
    } catch (err) {
      // Máy khác vừa đẩy cùng buổi này lên (VD 2 máy cùng giáo viên) → điền vào
      // buổi server đã có, vẫn chỉ khi buổi đó chưa có điểm.
      const resp = (err as { response?: { status?: number; data?: { code?: string; data?: { existingId?: string } } } }).response
      if (resp?.status !== 409 || resp.data?.code !== 'SAME_DATE' || !resp.data.data?.existingId) throw err
      sessionId = resp.data.data.existingId
    }
  }
  const res = await scoreService.upsert({ classId: item.classId, studentId: item.studentId, ...item.entry, total: item.total, ifAbsent: true, sessionId: sessionId! })
  return res.deleted ? 'deleted' : !res.skipped ? 'done' : sameEntry(item.entry, res) ? 'already' : 'conflict'
}
