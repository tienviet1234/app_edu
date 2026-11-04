import crypto from 'node:crypto'
import { Types } from 'mongoose'
import { ClientSnapshot } from '../models/ClientSnapshot.js'
import { uploadBufferToR2, deleteVideoFromR2, getDownloadPresignedUrl, listR2Keys, getR2ObjectText } from './storageService.js'
import { snapshotsToDelete } from '../utils/snapshotRetention.js'
import { searchSnapshotsForDay, type DaySearchResult } from '../utils/snapshotSearch.js'

const PREFIX = 'client-snapshots/'
const isMongoid = (id: string) => /^[a-f0-9]{24}$/i.test(id)

interface AppDataLike { classes?: Array<{ students?: Array<{ sessions?: Array<{ id?: string; dirty?: boolean }> }> }> }

export async function saveClientSnapshot(input: {
  userId: string; deviceId: string; userAgent?: string; appVersion?: string; raw: string
}): Promise<{ saved: boolean; id?: string }> {
  const contentHash = crypto.createHash('sha256').update(input.raw).digest('hex')
  const userId = new Types.ObjectId(input.userId)
  const last = await ClientSnapshot.findOne({ userId, deviceId: input.deviceId }, 'contentHash').sort({ createdAt: -1 }).lean()
  if (last?.contentHash === contentHash) return { saved: false } // không đổi gì — khỏi lưu trùng

  let data: AppDataLike = {}
  try { data = JSON.parse(input.raw) as AppDataLike } catch { /* vẫn lưu nguyên văn để không mất gì */ }
  const sessions = (data.classes ?? []).flatMap((c) => (c.students ?? []).flatMap((s) => s.sessions ?? []))

  const r2Key = `${PREFIX}${input.userId}/${input.deviceId}/${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const buffer = Buffer.from(input.raw, 'utf-8')
  await uploadBufferToR2(buffer, r2Key, 'application/json')
  const doc = await ClientSnapshot.create({
    userId, deviceId: input.deviceId, userAgent: input.userAgent?.slice(0, 300), appVersion: input.appVersion, r2Key,
    sizeBytes: buffer.byteLength, contentHash,
    classCount: data.classes?.length ?? 0,
    sessionCount: sessions.length,
    // Chưa lên server = id tạm, HOẶC đã sửa trên máy mà server chưa xác nhận.
    unsyncedSessionCount: sessions.filter((s) => !s.id || !isMongoid(s.id) || s.dirty === true).length,
  })

  // Giữ dày gần đây, thưa dần về quá khứ — xem snapshotsToDelete.
  const all = await ClientSnapshot.find({ userId, deviceId: input.deviceId }, 'r2Key createdAt unsyncedSessionCount').lean()
  for (const o of snapshotsToDelete(all)) {
    await deleteVideoFromR2(o.r2Key).catch(() => null)
    await ClientSnapshot.deleteOne({ _id: o._id })
  }
  return { saved: true, id: String(doc._id) }
}

export async function listBackups() {
  const [dbBackups, all] = await Promise.all([
    listR2Keys('backups/').catch(() => [] as Array<{ key: string; lastModified?: Date }>),
    ClientSnapshot.find({}, '-contentHash').sort({ createdAt: -1 }).populate('userId', 'name email role').lean(),
  ])
  // Mỗi máy luôn có mặt (kèm tối đa PER_DEVICE bản gần nhất). Trước đây lấy 300
  // bản mới nhất CHUNG mọi máy — máy gửi dày (1 phút/lần) chiếm hết chỗ, máy ít
  // mở và bản sao lưu gửi lên để khôi phục biến khỏi trang Sao lưu / "Dữ liệu kẹt".
  // Sau đó 30 bản/máy lại che mất bản cũ cần tra — đủ để liệt kê mọi bản còn giữ.
  const PER_DEVICE = 300
  const perDevice = new Map<string, number>()
  const snapshots = all.filter((s) => {
    const k = `${String((s.userId as { _id?: unknown } | null)?._id ?? s.userId)}|${s.deviceId}`
    const n = perDevice.get(k) ?? 0
    perDevice.set(k, n + 1)
    return n < PER_DEVICE
  })
  return {
    dbBackups: dbBackups.sort((a, b) => b.key.localeCompare(a.key)).map((b) => ({ key: b.key, lastModified: b.lastModified })),
    snapshots,
  }
}

/** Nội dung 1 bản chụp (AppData của máy đó) — cho công cụ "Dữ liệu kẹt"
 *  của admin quét & đẩy hộ lên server, không cần chờ giáo viên mở lại máy. */
export async function readSnapshotContent(id: string): Promise<{ meta: { userId: string; deviceId: string; createdAt: Date }; data: unknown } | null> {
  if (!Types.ObjectId.isValid(id)) return null
  const doc = await ClientSnapshot.findById(id).lean()
  if (!doc) return null
  const raw = await getR2ObjectText(doc.r2Key)
  return { meta: { userId: String(doc.userId), deviceId: doc.deviceId, createdAt: doc.createdAt }, data: JSON.parse(raw) }
}

/** Tìm buổi của 1 lớp + 1 ngày trong MỌI bản chụp còn giữ (xem snapshotSearch.ts).
 *  Bản chụp trước ngày đó không thể có buổi của ngày đó nên bỏ qua (chừa 1 ngày
 *  phòng lệch giờ máy). */
export async function searchSnapshots(classId: string, date: string): Promise<DaySearchResult> {
  const from = new Date(new Date(`${date}T00:00:00Z`).getTime() - 24 * 3600e3)
  const docs = await ClientSnapshot.find({ createdAt: { $gte: from } }, 'deviceId createdAt r2Key userId').sort({ createdAt: -1 }).populate('userId', 'name role').lean()
  const keyOf = new Map(docs.map((d) => [String(d._id), d.r2Key]))
  return searchSnapshotsForDay(
    docs.map((d) => {
      const u = d.userId as unknown as { _id: unknown; name?: string; role?: string } | null
      return { id: String(d._id), deviceId: d.deviceId, createdAt: d.createdAt, user: u ? { _id: String(u._id), name: u.name ?? '', role: u.role ?? '' } : null }
    }),
    async (id) => JSON.parse(await getR2ObjectText(keyOf.get(id)!)),
    classId,
    date,
  )
}

export async function presignBackupKey(key: string): Promise<string> {
  if (!/^(backups|client-snapshots)\/[\w./-]+\.json$/.test(key) || key.includes('..')) throw new Error('Key không hợp lệ.')
  return getDownloadPresignedUrl(key, key.split('/').slice(key.startsWith(PREFIX) ? 1 : 0).join('_'))
}
