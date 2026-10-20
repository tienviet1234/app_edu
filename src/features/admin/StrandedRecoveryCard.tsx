import { useMemo, useState } from 'react'
import type { AppData } from '@/types'
import { normalize } from '@/business/seed'
import {
  classifyScoreJobs, collectScoreJobs, countUnsyncedStudentsWithData, sameEntry,
  type ClassifiedJob, type JobKind, type ServerScoreLite, type ServerSessionLite,
} from '@/business/strandedScores'
import { backupService, type ClientSnapshotMeta } from '@/services/backups'
import { sessionService } from '@/services/sessions'
import { scoreService } from '@/services/scores'
import { classService } from '@/services/classes'
import { toast } from '@/store/toastStore'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'

/** Kết quả quét 1 máy (bản chụp mới nhất của máy đó). */
interface DeviceScan {
  snapshot: ClientSnapshotMeta
  items: Array<ClassifiedJob & { result?: 'done' | 'already' | 'conflict' | 'deleted' | 'error'; error?: string }>
  unsyncedStudents: Array<{ className: string; studentName: string; sessions: number }>
}

const ACTIONABLE: JobKind[] = ['create', 'fill', 'fillExisting']

const KIND_LABEL: Record<JobKind, string> = {
  create: 'Chưa có trên server → tạo buổi + điểm',
  fillExisting: 'Server có buổi ngày này nhưng chưa có điểm → điền vào',
  fill: 'Server chưa có điểm buổi này → điền vào',
  already: 'Đã có trên server',
  conflict: 'Khác với server — GIỮ bản server, không ghi đè',
  deletedOnServer: 'Buổi đã bị xóa trên server — không tự khôi phục',
  notInClass: 'Học sinh không còn trong lớp (đã gộp/chuyển) — không tạo lại',
}

const viDate = (iso: string) => iso.split('-').reverse().join('/')

/** Bản chụp chưa qua normalize (giữ đủ field rubric của lớp) nhưng bảo đảm
 *  entry đủ khóa — dùng cấu trúc của normalize cho học sinh/buổi. */
function toClasses(raw: unknown) {
  const rawClasses = ((raw as { classes?: unknown[] })?.classes ?? []) as Record<string, unknown>[]
  return normalize(raw).classes.map((nc, i) => ({ ...(rawClasses[i] as object), ...nc }) as AppData['classes'][number])
}

/** Quét bản chụp MỚI NHẤT của từng máy, đối chiếu với server, đẩy hộ lên
 *  những gì server CHƯA có — không cần chờ giáo viên mở lại đúng máy đó.
 *  Không bao giờ ghi đè điểm đã có, không hồi sinh buổi đã xóa, không đụng
 *  dữ liệu trên máy admin (chỉ gọi API). */
export function StrandedRecoveryCard({ snapshots }: { snapshots: ClientSnapshotMeta[] }) {
  const [scanning, setScanning] = useState(false)
  const [applying, setApplying] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [scans, setScans] = useState<DeviceScan[] | null>(null)
  const [openKind, setOpenKind] = useState<string | null>(null)

  const latestPerDevice = useMemo(() => {
    const seen = new Set<string>()
    return snapshots.filter((s) => {
      const k = `${s.userId?._id ?? '?'}|${s.deviceId}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }, [snapshots])

  const scan = async () => {
    setScanning(true)
    setScans(null)
    try {
      const contents: Array<{ snapshot: ClientSnapshotMeta; classes: AppData['classes'] }> = []
      for (const snap of latestPerDevice) {
        const { data } = await backupService.snapshotContent(snap._id)
        contents.push({ snapshot: snap, classes: toClasses(data) })
      }
      // Tải dữ liệu server 1 lần cho mỗi lớp xuất hiện trong các bản chụp.
      const classIds = [...new Set(contents.flatMap((c) => collectScoreJobs(c.classes).map((j) => j.classId)))]
      const serverSessions: ServerSessionLite[] = []
      const serverScores: ServerScoreLite[] = []
      const roster = new Map<string, Set<string>>()
      for (const classId of classIds) {
        // Lớp đã xóa/không còn → bỏ (mọi buổi của lớp đó thành notInClass).
        const cls = await classService.get(classId).catch(() => null)
        if (!cls) continue
        roster.set(classId, new Set((cls.studentIds as Array<string | { _id: string }>).map((s) => (typeof s === 'string' ? s : s._id))))
        const [ss, sc] = await Promise.all([
          sessionService.listAll({ classId }),
          scoreService.listAll({ classId }),
        ])
        serverSessions.push(...ss.map((s) => ({ _id: s._id, studentId: s.studentId, scheduledAt: s.scheduledAt, lessonNo: s.lessonNo })))
        serverScores.push(...sc.items.map((x) => ({
          sessionId: x.sessionId, studentId: x.studentId, total: x.total, attendance: x.attendance,
          scores: x.scores, ticks: x.ticks, choice: x.choice, parts: x.parts,
        })))
      }
      setScans(contents.map(({ snapshot, classes }) => ({
        snapshot,
        items: classifyScoreJobs(collectScoreJobs(classes), serverSessions, serverScores, roster),
        unsyncedStudents: countUnsyncedStudentsWithData(classes),
      })))
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      toast.error(`Quét thất bại${msg ? `: ${msg}` : ''}`, { persist: true })
    } finally {
      setScanning(false)
    }
  }

  const actionableCount = scans?.reduce((n, s) => n + s.items.filter((i) => ACTIONABLE.includes(i.kind) && !i.result).length, 0) ?? 0

  const apply = async () => {
    if (!scans) return
    setApplying(true)
    const next = scans.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) }))
    const todo = next.flatMap((s) => s.items.filter((i) => ACTIONABLE.includes(i.kind) && !i.result).map((i) => ({ scan: s, item: i })))
    setProgress({ done: 0, total: todo.length })
    for (const { scan: s, item } of todo) {
      const owner = s.snapshot.userId
      const body = { classId: item.classId, studentId: item.studentId, ...item.entry, total: item.total, ifAbsent: true as const }
      try {
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
            // Máy khác vừa đẩy cùng buổi này lên (VD 2 máy cùng giáo viên) →
            // điền vào buổi server đã có, vẫn chỉ khi buổi đó chưa có điểm.
            const resp = (err as { response?: { status?: number; data?: { code?: string; data?: { existingId?: string } } } }).response
            if (resp?.status !== 409 || resp.data?.code !== 'SAME_DATE' || !resp.data.data?.existingId) throw err
            sessionId = resp.data.data.existingId
          }
        }
        const res = await scoreService.upsert({ ...body, sessionId: sessionId! })
        item.result = res.deleted ? 'deleted' : !res.skipped ? 'done' : sameEntry(item.entry, res) ? 'already' : 'conflict'
      } catch (err) {
        item.result = 'error'
        item.error = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'lỗi mạng'
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
    }
    setScans(next)
    setApplying(false)
    setProgress(null)
    const done = todo.filter((t) => t.item.result === 'done').length
    const failed = todo.filter((t) => t.item.result === 'error').length
    if (failed) toast.error(`Đã đưa ${done} buổi lên server, ${failed} buổi lỗi — bấm lại để thử tiếp.`, { persist: true })
    else toast.success(`Đã đưa ${done} buổi lên server.`, { persist: true })
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-bold" style={{ color: C.ink }}>Dữ liệu kẹt trên máy giáo viên</div>
          <div className="text-sm" style={{ color: C.muted }}>
            Quét bản chụp mới nhất của từng máy ({latestPerDevice.length} máy), so với server. Chỉ đưa lên những buổi server CHƯA có — không ghi đè điểm đã có, không khôi phục buổi đã xóa.
          </div>
        </div>
        <div className="flex gap-2">
          <Btn loading={scanning} disabled={applying || !latestPerDevice.length} onClick={scan}>Quét tất cả máy</Btn>
          {actionableCount > 0 && (
            <Btn kind="solid" loading={applying} onClick={apply}>
              {progress ? `Đang đưa lên ${progress.done}/${progress.total}` : `Đưa ${actionableCount} buổi lên server`}
            </Btn>
          )}
        </div>
      </div>

      {scans?.map((s) => {
        const key = `${s.snapshot.userId?._id}|${s.snapshot.deviceId}`
        const byKind = (k: JobKind) => s.items.filter((i) => i.kind === k)
        const shown: JobKind[] = ['create', 'fillExisting', 'fill', 'conflict', 'deletedOnServer', 'notInClass']
        return (
          <div key={key} className="rounded-xl p-3 space-y-2" style={{ border: `1px solid ${C.line}` }}>
            <div className="text-sm font-semibold" style={{ color: C.ink }}>
              {s.snapshot.userId?.name ?? 'Tài khoản đã xóa'}
              <span className="font-normal" style={{ color: C.muted }}> · máy {s.snapshot.deviceId.slice(-6)} · bản chụp {new Date(s.snapshot.createdAt).toLocaleString('vi-VN')}</span>
            </div>
            <div className="text-sm" style={{ color: C.muted }}>
              {s.items.length} buổi có dữ liệu · {byKind('already').length} đã có trên server
            </div>
            {shown.map((k) => {
              const list = byKind(k)
              if (!list.length) return null
              const openKey = `${key}|${k}`
              const warn = k === 'conflict' || k === 'deletedOnServer' || k === 'notInClass'
              return (
                <div key={k} className="text-sm">
                  <button
                    type="button"
                    className="font-semibold hover:underline"
                    style={{ color: warn ? C.amber : C.board }}
                    onClick={() => setOpenKind(openKind === openKey ? null : openKey)}
                  >
                    {openKind === openKey ? '▾' : '▸'} {list.length} buổi — {KIND_LABEL[k]}
                  </button>
                  {openKind === openKey && (
                    <div className="mt-1 max-h-72 overflow-y-auto divide-y" style={{ borderColor: C.line }}>
                      {list.slice(0, 300).map((i) => (
                        <div key={`${i.studentId}|${i.sessionLocalId}`} className="flex flex-wrap justify-between gap-2 py-1">
                          <span style={{ color: C.ink }}>{i.className} · {i.studentName} · {viDate(i.date)}</span>
                          <span style={{ color: C.muted }}>
                            máy: {i.entry.attendance === 'excused' ? 'vắng phép' : i.entry.attendance === 'absent' ? 'vắng' : `${i.total}đ`}
                            {i.serverTotal != null && ` · server: ${i.serverTotal}đ`}
                            {i.dirty && i.kind === 'conflict' && ' · máy có sửa chưa lên server'}
                            {i.result === 'done' && <b style={{ color: C.emerald }}> · ✓ đã lên</b>}
                            {i.result === 'already' && <b style={{ color: C.muted }}> · đã có</b>}
                            {i.result === 'conflict' && <b style={{ color: C.amber }}> · khác server, giữ bản server</b>}
                            {i.result === 'deleted' && <b style={{ color: C.amber }}> · buổi đã bị xóa</b>}
                            {i.result === 'error' && <b style={{ color: C.red }}> · lỗi: {i.error}</b>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {s.unsyncedStudents.length > 0 && (
              <div className="text-sm" style={{ color: C.amber }}>
                ⚠ Học sinh chưa có trên server (cần thêm tay): {s.unsyncedStudents.map((u) => `${u.studentName} (${u.className}, ${u.sessions} buổi)`).join(', ')}
              </div>
            )}
          </div>
        )
      })}
      {scans && actionableCount === 0 && !applying && (
        <div className="text-sm font-semibold" style={{ color: C.emerald }}>✓ Không còn buổi nào cần đưa lên server.</div>
      )}
    </Card>
  )
}
