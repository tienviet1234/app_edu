/**
 * Tìm các buổi của 1 lớp + 1 ngày trong MỌI bản chụp máy còn giữ. "Dữ liệu kẹt"
 * chỉ đọc bản MỚI NHẤT của từng máy, nên buổi đã biến khỏi máy (tab cũ ghi đè,
 * xóa nhầm...) dù còn nằm trong bản cũ cũng không ai thấy, phải tải từng file về
 * đọc tay (sự cố thật: tìm Lớp 7 ngày 29/10). Tách khỏi service để có test.
 */

type Rec = Record<string, unknown>

export interface SnapshotSource {
  id: string
  deviceId: string
  createdAt: Date
  user: { _id: string; name: string; role: string } | null
}

export interface DayHit {
  studentId: string
  studentName: string
  session: Rec
  /** Nằm trong kho giữ lại trên máy (`orphans`), không còn trong danh sách lớp. */
  inOrphans: boolean
}

/** Các buổi đúng lớp + ngày trong 1 bản chụp, kể cả kho giữ lại. `classMeta` là
 *  thông tin lớp lúc chụp (không kèm học sinh) để máy admin tính đúng tổng điểm. */
export function sessionsOfDayInSnapshot(data: unknown, classId: string, date: string): { classMeta: Rec | null; hits: DayHit[] } {
  const d = (data ?? {}) as { classes?: Rec[]; orphans?: Rec[] }
  const cls = (d.classes ?? []).find((c) => c?.id === classId)
  const hits: DayHit[] = []
  let classMeta: Rec | null = null
  if (cls) {
    const { students, ...meta } = cls
    classMeta = meta
    for (const st of (students as Rec[] | undefined) ?? []) {
      for (const s of (st?.sessions as Rec[] | undefined) ?? []) {
        if (s?.date === date) hits.push({ studentId: String(st.id), studentName: String(st.name ?? ''), session: s, inOrphans: false })
      }
    }
  }
  for (const o of d.orphans ?? []) {
    if (o?.classId !== classId) continue
    for (const s of (o.sessions as Rec[] | undefined) ?? []) {
      if (s?.date === date) hits.push({ studentId: String(o.studentId), studentName: String(o.studentName ?? ''), session: s, inOrphans: true })
    }
  }
  return { classMeta, hits }
}

export interface DayVersion extends DayHit {
  sources: Array<{ deviceId: string; user: SnapshotSource['user']; firstAt: Date; lastAt: Date; copies: number }>
}

export interface DaySearchResult {
  scanned: number
  failed: number
  devices: number
  classMeta: Rec | null
  versions: DayVersion[]
}

/** Nội dung để gộp bản trùng: bỏ các cờ chỉ có trên máy (dirty, synced...). */
const contentKey = (h: DayHit) => JSON.stringify([h.studentId, h.session.entry ?? null, h.session.homework ?? '', h.session.maxes ?? null])

/** Đọc lần lượt từng bản chụp, gộp bản giống hệt nhau (cùng em, cùng nội dung) và
 *  nhớ máy nào, lúc nào từng giữ. 1 bản đọc lỗi không làm hỏng cả lượt tìm — báo
 *  số lỗi để không kết luận "không có" khi chưa đọc hết. */
export async function searchSnapshotsForDay(
  snapshots: SnapshotSource[],
  read: (id: string) => Promise<unknown>,
  classId: string,
  date: string,
  concurrency = 6,
): Promise<DaySearchResult> {
  const versions = new Map<string, DayVersion>()
  let failed = 0
  let classMeta: Rec | null = null
  let classMetaAt = 0
  const queue = [...snapshots]
  const worker = async () => {
    for (let snap = queue.shift(); snap; snap = queue.shift()) {
      let data: unknown
      try {
        data = await read(snap.id)
      } catch {
        failed++
        continue
      }
      const found = sessionsOfDayInSnapshot(data, classId, date)
      const at = new Date(snap.createdAt)
      if (found.classMeta && at.getTime() > classMetaAt) { classMeta = found.classMeta; classMetaAt = at.getTime() }
      for (const hit of found.hits) {
        const key = contentKey(hit)
        const v = versions.get(key) ?? { ...hit, sources: [] }
        if (at.getTime() > Math.max(0, ...v.sources.map((s) => s.lastAt.getTime()))) { v.session = hit.session; v.inOrphans = hit.inOrphans }
        const src = v.sources.find((s) => s.deviceId === snap!.deviceId)
        if (src) {
          src.copies++
          if (at < src.firstAt) src.firstAt = at
          if (at > src.lastAt) src.lastAt = at
        } else {
          v.sources.push({ deviceId: snap.deviceId, user: snap.user, firstAt: at, lastAt: at, copies: 1 })
        }
        versions.set(key, v)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))
  return {
    scanned: snapshots.length,
    failed,
    devices: new Set(snapshots.map((s) => s.deviceId)).size,
    classMeta,
    versions: [...versions.values()],
  }
}
