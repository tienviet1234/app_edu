// Đường GỬI 1 BUỔI (điểm danh + điểm + bài tập + số câu) lên server — DUY NHẤT cho mọi màn ghi điểm
// trên máy (Chấm từng em, Điểm danh nhanh, đổi điểm danh trên lưới). Tách ra từ
// `EntryScreen.syncSession` (đợt 3, 11/11) GIỮ NGUYÊN từng bước; hàm này KHÔNG hiện thông báo — màn
// gọi tự báo theo kết quả. Mọi quy tắc an toàn ở đây (xem CLAUDE.md):
//   - đọc buổi từ kho máy NGAY LÚC GỬI (`latestSessionOf`), không dùng bản chụp lúc bấm;
//   - không gửi lại buổi đã khớp server (không dirty) — tránh bản cũ đè bản mới;
//   - khóa theo buổi (`tryLockSession`) dùng chung với tự lưu nền / đồng bộ lúc mở app;
//   - buổi mới: tạo theo NGÀY (`placeByDate`), trùng ngày đã có thì chỉ điền vào khi server trống
//     hoặc giống hệt (`ifAbsent`); máy lùi số y như server (`makeRoomForServerNo`);
//   - điểm gửi TRƯỚC kèm `baseUpdatedAt` (2 máy cùng sửa → 409 CONFLICT, giữ cả 2 bản);
//   - bài tập chỉ gửi khi máy thật sự đổi (`notesToSend`);
//   - buổi đã bị xóa trên server → tách thành buổi tạm, GIỮ điểm (`detachDeletedSession`).
import type { ClassData, RubricDef } from '@/types'
import { useAppStore } from '@/store/appStore'
import { latestSessionOf, adoptServerSession, makeRoomForServerNo, markSessionSaved, markConflict, detachDeletedSession, toSessionEntry, notesToSend, baseForSave, type ServerScoreForSync } from '@/business/sync'
import { sameEntry } from '@/business/strandedScores'
import { sessionScore, rescaleComp } from '@/business/scoring'
import { tryLockSession, unlockSession } from '@/utils/syncLocks'
import { isMongoid } from '@/utils/mongoid'
import { uid } from '@/utils/uid'
import { sessionService } from './sessions'
import { scoreService, conflictFromError, isSessionDeletedError } from './scores'
import { logActivity } from './activity'

export type PushOutcome =
  | { kind: 'saved'; wasNew: boolean; finalNo: number; date: string; studentName: string; no: number }
  | { kind: 'nothing' }
  | { kind: 'alreadySynced'; synced: boolean; studentName: string; no: number }
  | { kind: 'busy' }
  | { kind: 'deleted'; studentName: string; no: number; date: string }
  | { kind: 'conflict'; real: boolean; byName?: string; studentName: string; no: number }
  | { kind: 'error'; offline: boolean; message?: string; sameDateNo?: number; studentName: string; no: number; date: string; err: unknown }

export async function pushSession(args: {
  cls: Pick<ClassData, 'id' | 'name'>
  rubric: RubricDef
  studentId: string
  sessionLocalId: string
  /** Sửa ĐÚNG lớp này trong kho máy (gắn cứng id lớp — xem gotcha updateClassById). */
  update: (fn: (c: ClassData) => void) => void
  /** Gọi đúng lúc bắt đầu gửi thật (đã giữ khóa buổi) — màn gọi hiện "Đang lưu...". */
  onSending?: () => void
}): Promise<PushOutcome> {
  const { cls, rubric: r, studentId, sessionLocalId, update } = args
  if (!isMongoid(cls.id) || !isMongoid(studentId)) return { kind: 'nothing' }
  const latest = latestSessionOf(useAppStore.getState().data?.classes, cls.id, studentId, sessionLocalId)
  if (!latest) return { kind: 'nothing' }
  const { student, session: target } = latest
  if (isMongoid(target.id) && !target.dirty) return { kind: 'alreadySynced', synced: !!target.synced, studentName: student.name, no: target.no }
  if (!tryLockSession(target.id)) return { kind: 'busy' }
  args.onSending?.()
  const maxes = target.maxes ?? {}
  const comps = r.comps.map((c) => (maxes[c.key] != null ? rescaleComp(c, maxes[c.key]) : c))
  const total = sessionScore(target.entry, { ...r, comps }) ?? 0
  const wasNew = !isMongoid(target.id)
  const sent = { entry: target.entry, homework: target.homework, maxes: target.maxes }
  try {
    let sessionId = target.id
    let scoreAlreadySaved = false
    let finalNo = target.no
    if (wasNew) {
      try {
        const apiSession = await sessionService.create({
          classId: cls.id, studentId, title: `Buổi ${target.no}`, lessonNo: target.no,
          scheduledAt: `${target.date}T00:00:00.000Z`, notes: target.homework || undefined,
          ...(target.maxes ? { maxes: target.maxes } : {}),
          placeByDate: true,
        })
        sessionId = apiSession._id
        finalNo = apiSession.lessonNo ?? target.no
      } catch (err) {
        const resp = (err as { response?: { status?: number; data?: { code?: string; data?: { existingId?: string; lessonNo?: number } } } }).response
        const existingId = resp?.status === 409 && resp.data?.code === 'SAME_DATE' ? resp.data.data?.existingId : undefined
        if (!existingId) throw err
        const res = await scoreService.upsert({ classId: cls.id, sessionId: existingId, studentId, ...target.entry, total, ifAbsent: true })
        if (res.deleted || (res.skipped && !sameEntry(target.entry, res))) throw err
        sessionId = existingId
        finalNo = resp?.data?.data?.lessonNo ?? target.no
        scoreAlreadySaved = true
      }
      const localId = target.id
      const newId = sessionId
      const no = finalNo
      update((c) => {
        const stu = c.students.find((s) => s.id === studentId)
        if (!stu) return
        adoptServerSession(stu, localId, newId, no)
        makeRoomForServerNo(stu, newId, no)
      })
      logActivity('session.create', { className: cls.name, sessionNo: target.no, studentName: student.name }, 'ClassSession')
    }
    let savedUpdatedAt: string | undefined
    if (!scoreAlreadySaved) {
      const saved = await scoreService.upsert({ classId: cls.id, sessionId, studentId, ...target.entry, total, ...(wasNew ? {} : { baseUpdatedAt: baseForSave(target) }) })
      savedUpdatedAt = saved.updatedAt
    }
    if (!wasNew) {
      const notes = notesToSend(target)
      if (notes !== undefined || target.maxes) {
        await sessionService.update(sessionId, { ...(notes !== undefined ? { notes } : {}), ...(target.maxes ? { maxes: target.maxes } : {}) })
      }
    }
    const savedId = sessionId
    update((c) => {
      const stu = c.students.find((s) => s.id === studentId)
      if (stu) markSessionSaved(stu, savedId, sent, savedUpdatedAt)
    })
    return { kind: 'saved', wasNew, finalNo, date: target.date, studentName: student.name, no: target.no }
  } catch (err) {
    if (isSessionDeletedError(err)) {
      const localId = target.id
      update((c) => {
        const stu = c.students.find((s) => s.id === studentId)
        if (stu) detachDeletedSession(stu, localId, uid())
      })
      return { kind: 'deleted', studentName: student.name, no: target.no, date: target.date }
    }
    const conflict = conflictFromError(err)
    if (conflict) {
      const sc = conflict.score
      const byName = typeof sc.recordedBy === 'object' ? sc.recordedBy?.name : undefined
      const localId = target.id
      const result = { real: false }
      update((c) => {
        const stu = c.students.find((s) => s.id === studentId)
        if (stu) result.real = markConflict(stu, localId, { entry: toSessionEntry(sc as unknown as ServerScoreForSync), total: sc.total, updatedAt: sc.updatedAt, byName })
      })
      return { kind: 'conflict', real: result.real, byName, studentName: student.name, no: target.no }
    }
    const resp = (err as { response?: { status?: number; data?: { message?: string; code?: string; data?: { lessonNo?: number } } } })?.response
    return {
      kind: 'error', offline: !resp, message: resp?.data?.message,
      sameDateNo: resp?.data?.code === 'SAME_DATE' ? (resp.data.data?.lessonNo ?? -1) : undefined,
      studentName: student.name, no: target.no, date: target.date, err,
    }
  } finally {
    unlockSession(target.id)
  }
}
