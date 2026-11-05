// Nạp 1 file sao lưu DB vào MongoDB TRÊN MÁY NÀY để xem/đối chiếu/diễn tập khôi phục.
// Từ chối mọi đích không phải máy này. Không có mật khẩu và token trong file sao lưu.
// Chạy: MONGO_URI=mongodb://localhost:27999/lms_khoiphuc?directConnection=true npx tsx src/scripts/restoreBackupToLocal.ts <file.json>
import fs from 'node:fs'
import mongoose from 'mongoose'
import { isLocalMongoUri, reviveBackupDoc } from '../utils/backupRestore.js'

async function main() {
  const file = process.argv[2]
  const uri = process.env.MONGO_URI
  if (!file) throw new Error('Thiếu đường dẫn file sao lưu.')
  if (!isLocalMongoUri(uri)) throw new Error('MONGO_URI phải trỏ tới MongoDB trên chính máy này. Dừng, chưa ghi gì.')
  const dump = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Array<Record<string, unknown>>>
  await mongoose.connect(uri!)
  const db = mongoose.connection.db!
  console.log('Đích:', mongoose.connection.host, db.databaseName)
  for (const [name, docs] of Object.entries(dump)) {
    await db.collection(name).deleteMany({})
    if (docs.length) await db.collection(name).insertMany(docs.map(reviveBackupDoc) as never[])
    console.log(`  ${name}: ${docs.length} bản ghi`)
  }
  await mongoose.disconnect()
}
main().catch(async (e) => { console.error('LỖI:', e?.message ?? e); await mongoose.disconnect().catch(() => null); process.exit(1) })
