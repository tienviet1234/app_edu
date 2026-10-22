// Read-only health check: are teachers' saves reaching the server, is every device backing up,
// is the change history recording, did anything unsafe happen to the data?
// Run: npx tsx src/scripts/checkDataSafety.ts [hours=24]
import mongoose from 'mongoose'
import { connectDB } from '../config/db.js'

const HOURS = Number(process.argv[2] ?? 24)
const vn = (d: Date | string | number) => new Date(new Date(d).getTime() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')
const vnDay = (d: Date | string) => new Date(new Date(d).getTime() + 7 * 3600e3).toISOString().slice(0, 10)
const warnings: string[] = []
const warn = (msg: string) => { warnings.push(msg); console.log('  ⚠ ' + msg) }
const ok = (msg: string) => console.log('  ✓ ' + msg)

async function main() {
  await connectDB()
  const db = mongoose.connection.db!
  const since = new Date(Date.now() - HOURS * 3600e3)
  console.log(`KIỂM TRA AN TOÀN DỮ LIỆU — ${vn(Date.now())} (${HOURS} giờ qua, từ ${vn(since)})`)
  const users = await db.collection('users').find({}, { projection: { name: 1, role: 1 } }).toArray()
  const nameOf = (id: unknown) => users.find((u) => String(u._id) === String(id))?.name ?? String(id)

  // 1. Saves: every "Trước/Tiếp theo" (score.entry) should be followed by a server save.
  console.log('\n1) LƯU ĐIỂM LÊN SERVER')
  const logs = await db.collection('auditlogs').find({ createdAt: { $gt: since } }).toArray()
  const by = (a: string) => logs.filter((l) => l.action === a)
  const entries = by('score.entry')
  const saves = logs.filter((l) => l.action === 'score.upsert' || l.action === 'score.upsert.rejected')
  const actors = [...new Set(logs.filter((l) => l.actorId && /^score\.|^session\./.test(l.action)).map((l) => String(l.actorId)))]
  if (!actors.length) console.log('  (chưa có ai nhập điểm trong khoảng này)')
  for (const a of actors) {
    const mine = (x: { [k: string]: unknown }) => String(x.actorId) === a
    const e = entries.filter(mine)
    const unpaired = e.filter((x) => !saves.some((s) => mine(s) && Math.abs(s.createdAt.getTime() - x.createdAt.getTime()) < 120e3))
    console.log(`  ${nameOf(a)}: ${by('score.upsert').filter(mine).length} lần lưu điểm, ${by('session.create').filter(mine).length} buổi mới, ${e.length} lần bấm chuyển em/buổi` +
      (unpaired.length ? ` — ${unpaired.length} lần bấm không thấy lần lưu đi kèm (có thể chỉ xem, không sửa)` : ''))
  }
  const rejected = logs.filter((l) => /\.rejected$/.test(l.action))
  if (rejected.length) {
    warn(`${rejected.length} lần server TỪ CHỐI lưu (nội dung vẫn còn trong nhật ký):`)
    for (const r of rejected) console.log(`      ${vn(r.createdAt)} ${nameOf(r.actorId)} ${r.action} ${r.metadata?.code ?? ''} ${JSON.stringify(r.metadata?.note ?? '').slice(0, 60)}`)
  } else ok('Không có lần lưu nào bị server từ chối')

  // 2. Change history: content-changing updates must leave a before-copy.
  console.log('\n2) LỊCH SỬ THAY ĐỔI (bản cũ trước mỗi lần sửa)')
  const hist = await db.collection('changehistories').aggregate([{ $match: { createdAt: { $gt: since } } }, { $group: { _id: '$coll', n: { $sum: 1 } } }]).toArray()
  const histOf = (c: string) => hist.find((h) => h._id === c)?.n ?? 0
  const scoreUpdates = await db.collection('scores').countDocuments({ updatedAt: { $gt: since }, $expr: { $gt: [{ $subtract: ['$updatedAt', '$createdAt'] }, 5000] } })
  const sessUpdates = await db.collection('classsessions').countDocuments({ updatedAt: { $gt: since }, $expr: { $gt: [{ $subtract: ['$updatedAt', '$createdAt'] }, 5000] } })
  console.log(`  Điểm được sửa: ${scoreUpdates} (bản cũ đã cất: ${histOf('scores')}) · Buổi được sửa: ${sessUpdates} (bản cũ: ${histOf('classsessions')})`)
  console.log(`  Học phí: ${histOf('tuitionnotices')} · Công nợ: ${histOf('debts')} · Lớp: ${histOf('classes')}`)
  // Re-saves with identical content are pruned, so a few updates without history is normal; many is not.
  if (scoreUpdates >= 10 && histOf('scores') === 0) warn('Có nhiều điểm được sửa nhưng KHÔNG có bản cũ nào được cất — kiểm tra bộ ghi lịch sử')
  else ok('Bộ ghi lịch sử hoạt động bình thường (lưu lại y nguyên thì không cần cất bản cũ)')

  // 3. Teacher devices: snapshot backups + data still waiting on the device.
  console.log('\n3) MÁY GIÁO VIÊN (bản chụp sao lưu + dữ liệu còn nằm trên máy)')
  console.log('    ("chưa lên server" tính cả buổi tạm TRỐNG / chỉ có bài tập về nhà — xem chi tiết ở Sao lưu → Dữ liệu kẹt)')
  const snaps = await db.collection('clientsnapshots').aggregate([
    { $sort: { createdAt: -1 } },
    { $group: { _id: { u: '$userId', d: '$deviceId' }, last: { $first: '$createdAt' }, unsynced: { $first: '$unsyncedSessionCount' }, sessions: { $first: '$sessionCount' }, ua: { $first: '$userAgent' } } },
    { $sort: { last: -1 } },
  ]).toArray()
  for (const s of snaps) {
    const lastAct = logs.filter((l) => String(l.actorId) === String(s._id.u)).reduce((m, l) => Math.max(m, l.createdAt.getTime()), 0)
    const os = /Mac OS/.test(s.ua ?? '') ? 'Mac' : /Windows/.test(s.ua ?? '') ? 'Windows' : /Android/.test(s.ua ?? '') ? 'Android' : /iPhone|iPad/.test(s.ua ?? '') ? 'iPhone/iPad' : '?'
    const line = `${nameOf(s._id.u)} (${os}, máy ${String(s._id.d).slice(0, 8)}): chụp gần nhất ${vn(s.last)}, ${s.sessions} buổi trên máy, ${s.unsynced} buổi CHƯA lên server`
    if (s.unsynced > 0 && s.last > since) warn(line)
    else console.log('    ' + line)
    // Device active (saving) well after its last snapshot → snapshots may not be reaching the server.
    if (lastAct && lastAct - new Date(s.last).getTime() > 60 * 60e3 && snaps.filter((x) => String(x._id.u) === String(s._id.u)).every((x) => lastAct - new Date(x.last).getTime() > 60 * 60e3)) {
      warn(`${nameOf(s._id.u)} có nhập điểm lúc ${vn(lastAct)} nhưng máy không gửi bản chụp sao lưu nào sau đó hơn 1 giờ`)
    }
  }
  if (!snaps.length) warn('Không có bản chụp sao lưu máy nào')

  // 4. Integrity of what is on the server now.
  console.log('\n4) TOÀN VẸN DỮ LIỆU TRÊN SERVER')
  const live = await db.collection('classsessions').find({ deletedAt: null }, { projection: { studentId: 1, scheduledAt: 1, lessonNo: 1, createdAt: 1 } }).toArray()
  const deleted = await db.collection('classsessions').find({ deletedAt: { $ne: null } }, { projection: { deletedAt: 1 } }).toArray()
  const scores = await db.collection('scores').find({}, { projection: { sessionId: 1, updatedAt: 1 } }).toArray()
  const liveIds = new Set(live.map((s) => String(s._id)))
  const deletedAt = new Map(deleted.map((d) => [String(d._id), d.deletedAt as Date]))
  const noSession = scores.filter((x) => !liveIds.has(String(x.sessionId)) && !deletedAt.has(String(x.sessionId))).length
  const intoDeleted = scores.filter((x) => deletedAt.has(String(x.sessionId)) && x.updatedAt > deletedAt.get(String(x.sessionId))! && x.updatedAt > since).length
  const perSession = new Map<string, number>(); for (const x of scores) perSession.set(String(x.sessionId), (perSession.get(String(x.sessionId)) ?? 0) + 1)
  const twoScores = [...perSession.values()].filter((n) => n > 1).length
  const tempNo = live.filter((s) => (s.lessonNo ?? 0) >= 1000).length
  const sameDay = new Map<string, typeof live>(); for (const s of live) { const k = `${s.studentId}|${vnDay(s.scheduledAt)}`; sameDay.set(k, [...(sameDay.get(k) ?? []), s]) }
  const newDup = [...sameDay.values()].filter((g) => g.length > 1 && g.some((s) => s.createdAt > since))
  console.log(`  ${live.length} buổi, ${scores.length} bản điểm`)
  for (const [n, label] of [[noSession, 'điểm không thuộc buổi nào'], [intoDeleted, 'điểm ghi vào buổi đã xóa'], [twoScores, 'buổi có 2 bản điểm'], [tempNo, 'buổi kẹt số tạm (≥1000)'], [newDup.length, 'buổi MỚI trùng ngày với buổi khác của cùng em']] as const) {
    if (n) warn(`${n} ${label}`)
    else ok(`0 ${label}`)
  }
  for (const g of newDup) console.log(`      ${nameOf(g[0].studentId)} ${vnDay(g[0].scheduledAt)}: ${g.map((s) => '#' + s.lessonNo).join(', ')}`)

  // 5. Database backups (GitHub Actions, public API).
  console.log('\n5) SAO LƯU DATABASE TỰ ĐỘNG')
  try {
    const res = await fetch('https://api.github.com/repos/tienviet1234/app_edu/actions/workflows/database-backup.yml/runs?per_page=4', { headers: { 'User-Agent': 'app-edu-check' } })
    const runs = ((await res.json()) as { workflow_runs?: Array<{ created_at: string; conclusion: string | null; status: string }> }).workflow_runs ?? []
    for (const r of runs) console.log(`    ${vn(r.created_at)} ${r.status} ${r.conclusion ?? ''}`)
    const last = runs[0]
    if (!last) warn('Không đọc được lịch sử sao lưu')
    else if (last.conclusion && last.conclusion !== 'success') warn(`Lần sao lưu gần nhất KHÔNG thành công (${last.conclusion})`)
    else if (Date.now() - new Date(last.created_at).getTime() > 30 * 3600e3) warn('Hơn 30 giờ chưa có lần sao lưu nào')
    else ok('Lần sao lưu gần nhất thành công')
  } catch (e) { warn(`Không kiểm tra được sao lưu: ${(e as Error).message}`) }

  console.log(`\nKẾT LUẬN: ${warnings.length ? `${warnings.length} điểm cần xem (dấu ⚠ ở trên)` : 'không có vấn đề'}`)
  await mongoose.disconnect()
}
main().catch(async (e) => { console.error('LỖI KHI KIỂM TRA:', e); await mongoose.disconnect().catch(() => null); process.exit(1) })
