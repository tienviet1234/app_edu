// CHỈ ĐỌC — kiểm tra SAU mỗi lần chạy lệnh sửa dữ liệu thật (`--apply`): lệnh chỉ đổi đúng các trường đã
// định, trên đúng các bản ghi trong kế hoạch, không đụng gì khác (quy định admin 09/11).
//
// Dựa vào 3 thứ mọi lệnh sửa dữ liệu phải để lại (xem CLAUDE.md):
//   - thư mục sao lưu `backups/<tên>-<thời điểm ms>/` gồm `<collection>.json` (bản TRƯỚC khi sửa) + `ops.json`;
//   - nhật ký AuditLog có `metadata.backupDir = <tên thư mục>` (ghi trong cùng giao dịch);
//   - Lịch sử thay đổi (ChangeHistory) do historyPlugin cất trước MỌI lần ghi qua Mongoose model.
//
// Chạy:
//   npx tsx src/scripts/verifyDataFix.ts backups/pre-fix-billed-1794156848985 --allow classsessions=billed
//   npx tsx src/scripts/verifyDataFix.ts backups/pre-remove-fake-1794157595296 \
//     --allow classsessions=billed,deletedAt,lessonNo --deletable tuitionnotices
// Collection không nêu trong --allow/--deletable thì KHÔNG được đổi gì (VD scores).
// Mã thoát: 0 = đạt, 1 = có thay đổi ngoài kế hoạch, 2 = không đủ dữ liệu để kết luận.
import fs from 'node:fs'
import path from 'node:path'
import mongoose, { Types } from 'mongoose'
import { connectDB } from '../config/db.js'
import { reviewFixResult, type FixReviewItem } from '../utils/dataRules.js'

type Doc = Record<string, unknown>
const plain = (x: unknown) => JSON.parse(JSON.stringify(x)) as Doc

function parseArgs(argv: string[]) {
  const allowed: Record<string, { fields?: string[]; deletable?: boolean }> = {}
  let dir = ''
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--allow') {
      const [coll, fields] = (argv[++i] ?? '').split('=')
      allowed[coll] = { ...allowed[coll], fields: (fields ?? '').split(',').filter(Boolean) }
    } else if (argv[i] === '--deletable') {
      const coll = argv[++i] ?? ''
      allowed[coll] = { ...allowed[coll], deletable: true }
    } else dir = argv[i]
  }
  return { dir, allowed }
}

async function main() {
  const { dir, allowed } = parseArgs(process.argv.slice(2))
  if (!dir || !fs.existsSync(dir)) throw new Error(`không thấy thư mục sao lưu: ${dir || '(chưa nêu)'}`)
  const name = path.basename(path.resolve(dir))
  const startMs = Number(name.split('-').pop())
  if (!Number.isFinite(startMs)) throw new Error(`tên thư mục phải kết thúc bằng thời điểm (ms): ${name}`)
  await connectDB()
  const db = mongoose.connection.db!
  console.log(`Kiểm tra lần sửa "${name}" · đích ${mongoose.connection.host} ${db.databaseName} · CHỈ ĐỌC`)
  console.log(`Được phép đổi: ${Object.entries(allowed).map(([c, r]) => `${c}: ${[...(r.fields ?? []), ...(r.deletable ? ['(xóa hẳn)'] : [])].join(', ') || 'không gì'}`).join(' · ') || 'không gì'}; mọi thứ khác: KHÔNG được đổi`)

  // Khoảng thời gian lệnh ghi: từ lúc sao lưu tới lúc ghi nhật ký (cùng giao dịch) + 5 giây.
  const audits = await db.collection('auditlogs').find({ 'metadata.backupDir': name }).toArray()
  if (!audits.length) { console.log('KHÔNG KẾT LUẬN ĐƯỢC: không có nhật ký nào của lần sửa này (lệnh chưa ghi, hoặc giao dịch bị hủy).'); await mongoose.disconnect(); process.exit(2) }
  const endMs = Math.max(...audits.map((a) => new Date(a.createdAt).getTime())) + 5000
  const ops = JSON.parse(fs.readFileSync(path.join(dir, 'ops.json'), 'utf8')) as unknown[]
  console.log(`Lệnh ghi lúc ${new Date(startMs).toISOString()} → ${new Date(endMs).toISOString()} · kế hoạch ${ops.length} việc · nhật ký ${audits.length} dòng ${audits.length === ops.length ? '✓' : '✘ KHÔNG KHỚP'}`)

  const items: FixReviewItem[] = []
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'ops.json')) {
    const coll = file.replace(/\.json$/, '')
    const before = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Doc[]
    const ids = before.map((d) => new Types.ObjectId(String(d._id)))
    const current = new Map((await db.collection(coll).find({ _id: { $in: ids } }).toArray()).map((d) => [String(d._id), plain(d)]))
    const later = new Set((await db.collection('changehistories').find({ coll, docId: { $in: ids }, createdAt: { $gt: new Date(endMs) } }, { projection: { docId: 1 } }).toArray()).map((h) => String(h.docId)))
    for (const b of before) items.push({ coll, id: String(b._id), before: plain(b), after: current.get(String(b._id)) ?? null, editedLater: later.has(String(b._id)) })
  }
  const during = await db.collection('changehistories').find({ createdAt: { $gte: new Date(startMs), $lte: new Date(endMs) } }, { projection: { coll: 1, docId: 1, op: 1 } }).toArray()
  const r = reviewFixResult({ items, allowed, writtenDuringRun: during.map((h) => ({ coll: h.coll, id: String(h.docId) })) })

  const count = (v: string) => r.rows.filter((x) => x.verdict === v).length
  console.log(`\nĐối chiếu ${r.rows.length} bản ghi trong file sao lưu với bản hiện tại:`)
  console.log(`  ✓ đổi đúng kế hoạch: ${count('planned')} · không đổi gì: ${count('unchanged')} · đổi thêm do người dùng app sửa SAU: ${count('laterEdit')} · ✘ đổi NGOÀI kế hoạch: ${count('unexpected')}`)
  const byColl = new Map<string, Map<string, number>>()
  for (const x of r.rows.filter((y) => y.verdict === 'planned')) {
    const m = byColl.get(x.coll) ?? new Map<string, number>()
    const k = x.deleted ? '(xóa hẳn)' : x.fields.join('+')
    m.set(k, (m.get(k) ?? 0) + 1)
    byColl.set(x.coll, m)
  }
  for (const [c, m] of byColl) console.log(`    ${c}: ${[...m].map(([k, n]) => `${n} bản ghi đổi ${k}`).join(', ')}`)
  for (const x of r.rows.filter((y) => y.verdict === 'laterEdit')) console.log(`  • ${x.coll} ${x.id}: đổi ${x.fields.join(', ')} — có lịch sử sửa sau khi lệnh chạy xong (người dùng app), xem ở "Lịch sử điểm & khôi phục"`)
  for (const x of r.rows.filter((y) => y.verdict === 'unexpected')) console.log(`  ✘ ${x.coll} ${x.id}: ${x.deleted ? 'BỊ XÓA HẲN' : `đổi ${x.fields.join(', ')}`} — NGOÀI kế hoạch`)
  console.log(`\nBản ghi bị ghi trong lúc lệnh chạy mà KHÔNG nằm trong kế hoạch: ${r.outside.length ? '' : 'không có ✓'}`)
  for (const o of r.outside) console.log(`  ✘ ${o.coll} ${o.id}`)
  console.log(r.ok && audits.length === ops.length ? '\nKẾT LUẬN: ĐẠT — lệnh chỉ đổi đúng những gì trong kế hoạch, không đụng dữ liệu nào khác.' : '\nKẾT LUẬN: KHÔNG ĐẠT — xem các dòng ✘ ở trên.')
  await mongoose.disconnect()
  process.exit(r.ok && audits.length === ops.length ? 0 : 1)
}
main().catch(async (e) => { console.error('LỖI:', e?.message ?? e); await mongoose.disconnect().catch(() => null); process.exit(2) })
