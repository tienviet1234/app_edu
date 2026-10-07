/**
 * Quét toàn bộ ClassSession, tìm học sinh nào đang có ≥2 buổi CÙNG SỐ
 * (lessonNo) — đúng tình trạng "nhiều buổi cùng Buổi 1" đã gặp. CHỈ ĐỌC,
 * không sửa/xóa gì — in ra danh sách để tự vào app dùng "🔧 Sửa số buổi"
 * sửa tay từng học sinh, rồi mới an toàn để thêm chặn trùng ở tầng DB.
 *
 * Cách chạy (từ thư mục server/):
 *   npx tsx src/scripts/findDuplicateSessionNos.ts
 *   npx tsx src/scripts/findDuplicateSessionNos.ts --classId=<id>   (chỉ 1 lớp)
 */
import mongoose from 'mongoose'
import { connectDB } from '../config/db.js'
import { ClassSession } from '../models/ClassSession.js'
import { Class } from '../models/Class.js'
import { User } from '../models/User.js'

const args = process.argv.slice(2)
const classIdArg = args.find((a) => a.startsWith('--classId='))?.split('=')[1]

async function main() {
  await connectDB()

  const match: Record<string, unknown> = {
    deletedAt: { $exists: false },
    migratedAt: { $exists: false },
    studentId: { $exists: true },
    lessonNo: { $exists: true },
    ...(classIdArg ? { classId: new mongoose.Types.ObjectId(classIdArg) } : {}),
  }

  const groups = await ClassSession.aggregate([
    { $match: match },
    { $group: { _id: { studentId: '$studentId', lessonNo: '$lessonNo' }, count: { $sum: 1 }, sessionIds: { $push: '$_id' }, dates: { $push: '$scheduledAt' } } },
    { $match: { count: { $gt: 1 } } },
  ])

  if (!groups.length) {
    console.log('✓ Không tìm thấy học sinh nào bị trùng số buổi.')
    await mongoose.disconnect()
    return
  }

  console.log(`⚠ Tìm thấy ${groups.length} trường hợp trùng số buổi:\n`)

  const studentIds = [...new Set(groups.map((g) => String(g._id.studentId)))]
  const classIds = [...new Set((await ClassSession.find({ _id: { $in: groups.flatMap((g) => g.sessionIds) } }, 'classId').lean()).map((s) => String(s.classId)))]
  const [students, classes] = await Promise.all([
    User.find({ _id: { $in: studentIds } }, 'name').lean(),
    Class.find({ _id: { $in: classIds } }, 'name').lean(),
  ])
  const studentName = new Map(students.map((s) => [String(s._id), s.name]))

  for (const g of groups) {
    const name = studentName.get(String(g._id.studentId)) ?? '(không rõ tên)'
    const dates = (g.dates as Date[]).map((d) => d.toISOString().slice(0, 10)).join(', ')
    console.log(`- ${name}: Buổi ${g._id.lessonNo} có ${g.count} bản ghi — ngày: ${dates}`)
  }

  console.log(`\nVào app, mục "Nhập điểm" của từng học sinh trên, bấm "🔧 Sửa số buổi" để sửa tay.`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
