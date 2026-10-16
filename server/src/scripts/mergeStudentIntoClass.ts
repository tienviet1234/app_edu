/**
 * Hợp nhất 2 TÀI KHOẢN của cùng 1 học sinh (1 tài khoản cũ ở lớp cũ, 1 tài
 * khoản mới vô tình bị tạo trùng ở lớp mới khi giáo viên thêm tên thủ công)
 * thành 1 — dùng khi học sinh CHUYỂN LỚP giữa kỳ và đã lỡ có 2 tài khoản
 * riêng biệt thay vì chuyển đúng 1 tài khoản cũ sang.
 *
 * Giữ `oldStudentId` làm danh tính SỐNG SÓT (thường là tài khoản có lịch sử
 * dài hơn/có khoản học phí gắn vào). Toàn bộ buổi của `newStudentId` được
 * GỘP vào, xếp lại theo đúng NGÀY THẬT (`scheduledAt`) — KHÔNG dùng
 * `lessonNo` cũ (thường đã lộn xộn do chấm bù/sửa lỗi trước đó).
 *
 * Đổi `classId` cho 6 collection: ClassSession, Score, Attendance,
 * TuitionNotice, Debt, Report — CHỦ Ý KHÔNG đụng Submission/AiGradedPhoto
 * (gắn với Assignment CHUNG CẢ LỚP, đổi riêng 1 học sinh tạo tham chiếu treo).
 *
 * QUAN TRỌNG — chặn thu tiền trùng: `unbilledSessionsOf()` (frontend) chỉ
 * nhìn field `ClassSession.billed`, KHÔNG nhìn TuitionNotice. Với MỖI khoản
 * đã gửi của `oldStudentId`, đánh dấu billed=true cho TẤT CẢ buổi (sau khi
 * hợp nhất) có ngày <= ngày gửi khoản đó — không cố khớp lại đúng số buổi
 * ghi trên khoản cũ (không thể dựng lại chính xác lịch sử xóa/sửa đã qua),
 * ưu tiên an toàn (không thu trùng) hơn khớp tuyệt đối con số.
 *
 * KHÔNG tự xóa học sinh khỏi `fromClass.studentIds` (lớp cũ) — admin tự làm
 * bằng nút "Xóa học sinh" có sẵn SAU KHI đã kiểm tra lớp mới hiện đúng.
 * CÓ tự gỡ `newStudentId` khỏi `toClass.studentIds` (tài khoản trùng tên đã
 * hợp nhất xong, không xóa User document, chỉ gỡ khỏi danh sách lớp).
 *
 * Cách chạy (từ thư mục server/):
 *   npx tsx src/scripts/mergeStudentIntoClass.ts --oldStudentId=<id> --newStudentId=<id> --fromClassId=<id> --toClassId=<id> --dry-run
 *   npx tsx src/scripts/mergeStudentIntoClass.ts --oldStudentId=<id> --newStudentId=<id> --fromClassId=<id> --toClassId=<id>
 *
 * LUÔN chạy --dry-run trước, đọc kỹ bảng tổng kết, rồi mới chạy thật.
 */
import fs from 'node:fs'
import path from 'node:path'
import mongoose, { Types } from 'mongoose'
import { connectDB } from '../config/db.js'
import { ClassSession } from '../models/ClassSession.js'
import { Score } from '../models/Score.js'
import { Attendance } from '../models/Attendance.js'
import { TuitionNotice } from '../models/TuitionNotice.js'
import { Debt } from '../models/Debt.js'
import { Report } from '../models/Report.js'
import { Class } from '../models/Class.js'
import { AuditLog } from '../models/AuditLog.js'

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const oldStudentIdArg = args.find((a) => a.startsWith('--oldStudentId='))?.split('=')[1]
const newStudentIdArg = args.find((a) => a.startsWith('--newStudentId='))?.split('=')[1]
const fromClassIdArg = args.find((a) => a.startsWith('--fromClassId='))?.split('=')[1]
const toClassIdArg = args.find((a) => a.startsWith('--toClassId='))?.split('=')[1]

function fail(msg: string): never {
  console.error(`❌ ${msg}`)
  process.exit(1)
}

// Y HỆT autoLevel() ở src/constants/rubrics.ts (frontend) — không import
// được qua biên backend/frontend nên chép lại công thức, PHẢI giữ khớp 2 bên.
function autoLevel(name: string): 'primary' | 'secondary' {
  const m = String(name).match(/\d+/)
  const g = m ? Number(m[0]) : 0
  return g >= 1 && g <= 5 ? 'primary' : 'secondary'
}

const vi = (d: Date) => d.toISOString().slice(0, 10)

async function main() {
  if (!oldStudentIdArg || !newStudentIdArg || !fromClassIdArg || !toClassIdArg) {
    fail('Cần đủ --oldStudentId=, --newStudentId=, --fromClassId=, --toClassId=')
  }
  const oldStudentId = new Types.ObjectId(oldStudentIdArg)
  const newStudentId = new Types.ObjectId(newStudentIdArg)
  const fromClassId = new Types.ObjectId(fromClassIdArg)
  const toClassId = new Types.ObjectId(toClassIdArg)

  await connectDB()
  try {
    const [fromClass, toClass] = await Promise.all([
      Class.findById(fromClassId).lean(),
      Class.findById(toClassId).lean(),
    ])
    if (!fromClass) fail(`Không tìm thấy lớp nguồn ${fromClassIdArg}`)
    if (!toClass) fail(`Không tìm thấy lớp đích ${toClassIdArg}`)
    if (!fromClass.studentIds.some((id) => id.equals(oldStudentId))) {
      fail(`Tài khoản cũ ${oldStudentIdArg} không có trong danh sách lớp "${fromClass.name}"`)
    }
    if (!toClass.studentIds.some((id) => id.equals(newStudentId))) {
      fail(`Tài khoản mới ${newStudentIdArg} không có trong danh sách lớp "${toClass.name}"`)
    }

    console.log(`${isDryRun ? '[DRY RUN] ' : ''}Hợp nhất học sinh: "${fromClass.name}"(${oldStudentIdArg}) + "${toClass.name}"(${newStudentIdArg}) → "${toClass.name}"(${oldStudentIdArg})\n`)

    const fromLevel = fromClass.level ?? autoLevel(fromClass.name)
    const toLevel = toClass.level ?? autoLevel(toClass.name)
    if (fromLevel !== toLevel) {
      fail(
        `2 lớp đang ở 2 CẤP tiêu chí khác nhau — "${fromClass.name}" → ${fromLevel}, "${toClass.name}" → ${toLevel}. ` +
        `Điểm cũ sẽ đọc sai hoàn toàn nếu gộp. Vào màn Lớp học, ô "Phiếu đánh giá" của "${toClass.name}", chọn đúng cấp rồi chạy lại.`,
      )
    }
    console.log(`Cấp tiêu chí: cả 2 lớp đều "${fromLevel}" — khớp, an toàn để gộp điểm.\n`)

    // CHỈ buổi CÒN HIỆU LỰC — buổi đã xóa mềm giữ nguyên trạng thái xóa,
    // không hồi sinh, không tính vào dãy buổi mới.
    const [oldSessions, newSessions] = await Promise.all([
      ClassSession.find({ classId: fromClassId, studentId: oldStudentId, deletedAt: { $exists: false } }),
      ClassSession.find({ classId: toClassId, studentId: newStudentId, deletedAt: { $exists: false } }),
    ])
    if (!oldSessions.length && !newSessions.length) fail('Không có buổi nào còn hiệu lực ở cả 2 tài khoản — không có gì để gộp.')

    // Hợp nhất + xếp theo NGÀY THẬT — không dùng lessonNo cũ (đang lộn xộn).
    // Cùng ngày: giữ ổn định theo _id để dry-run chạy lại luôn ra kết quả
    // giống hệt nhau (không phụ thuộc thứ tự Mongo trả về).
    const merged = [...oldSessions, ...newSessions].sort((a, b) => {
      const byDate = a.scheduledAt.getTime() - b.scheduledAt.getTime()
      return byDate !== 0 ? byDate : String(a._id).localeCompare(String(b._id))
    })
    const renumbered = merged.map((session, i) => ({ session, newLessonNo: i + 1, source: oldSessions.includes(session) ? 'Lớp cũ' : 'Lớp mới' as const }))

    // Khoản học phí đã gửi của tài khoản CŨ — đánh dấu billed=true cho TẤT
    // CẢ buổi (sau hợp nhất) có ngày <= ngày gửi khoản đó.
    const notices = await TuitionNotice.find({ classId: fromClassId, studentId: oldStudentId }).sort({ sentAt: 1 }).lean()
    const billedIds = new Set<string>()
    for (const n of notices) {
      renumbered.forEach(({ session }) => {
        if (session.scheduledAt.getTime() <= n.sentAt.getTime()) billedIds.add(String(session._id))
      })
    }

    const [debts, reports] = await Promise.all([
      Debt.find({ classId: fromClassId, studentId: oldStudentId }).lean(),
      Report.find({ classId: fromClassId, studentId: oldStudentId }).lean(),
    ])

    console.log(`Hợp nhất ${renumbered.length} buổi (${oldSessions.length} từ "${fromClass.name}" + ${newSessions.length} từ "${toClass.name}"), xếp theo ngày:`)
    renumbered.forEach(({ session, newLessonNo, source }) => {
      const mark = billedIds.has(String(session._id)) ? '  [billed=true]' : ''
      console.log(`  Buổi ${newLessonNo}  —  ${vi(session.scheduledAt)}  (gốc: Buổi ${session.lessonNo ?? '?'}, ${source})${mark}`)
    })
    console.log('')
    console.log(`Khoản học phí sẽ chuyển nguyên trạng thái (${notices.length}):`)
    notices.forEach((n) => console.log(`  "${n.periodLabel}" — ${n.finalAmount.toLocaleString('vi-VN')}đ — ${n.paymentStatus} — gửi ${vi(n.sentAt)}`))
    console.log(`→ ${billedIds.size}/${renumbered.length} buổi được đánh dấu billed=true (buổi học trước/đúng lúc gửi khoản trên).`)
    console.log(`Nợ bài tập sẽ chuyển: ${debts.length} | Báo cáo đã gửi sẽ chuyển: ${reports.length}\n`)

    if (isDryRun) {
      console.log('[DRY RUN] Không có gì được ghi. Chạy lại không kèm --dry-run để thực thi thật.')
      return
    }

    const dir = path.resolve(process.cwd(), `backups/pre-merge-${Date.now()}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'oldSessions.json'), JSON.stringify(oldSessions, null, 2))
    fs.writeFileSync(path.join(dir, 'newSessions.json'), JSON.stringify(newSessions, null, 2))
    fs.writeFileSync(path.join(dir, 'tuitionNotices.json'), JSON.stringify(notices, null, 2))
    fs.writeFileSync(path.join(dir, 'debts.json'), JSON.stringify(debts, null, 2))
    fs.writeFileSync(path.join(dir, 'reports.json'), JSON.stringify(reports, null, 2))
    console.log(`📦 Backup: ${dir}`)

    const sessionIds = renumbered.map((r) => r.session._id)
    const hasCourse = !!toClass.courseId

    const mongoSession = await mongoose.startSession()
    try {
      await mongoSession.withTransaction(async () => {
        for (const { session, newLessonNo } of renumbered) {
          await ClassSession.updateOne(
            { _id: session._id },
            {
              $set: {
                classId: toClassId, studentId: oldStudentId, lessonNo: newLessonNo,
                billed: billedIds.has(String(session._id)),
                ...(hasCourse ? { courseId: toClass.courseId } : {}),
              },
              $unset: { lessonId: 1, ...(hasCourse ? {} : { courseId: 1 }) },
            },
            { session: mongoSession },
          )
        }

        // Điểm/điểm danh của buổi "Lớp mới" đang gắn studentId=newStudentId —
        // phải đổi sang oldStudentId để gộp đúng 1 danh tính.
        await Score.updateMany(
          { sessionId: { $in: sessionIds } },
          { $set: { classId: toClassId, studentId: oldStudentId } },
          { session: mongoSession },
        )
        await Attendance.updateMany(
          { sessionId: { $in: sessionIds } },
          { $set: { classId: toClassId, studentId: oldStudentId } },
          { session: mongoSession },
        )

        await TuitionNotice.updateMany(
          { classId: fromClassId, studentId: oldStudentId },
          { $set: { classId: toClassId } },
          { session: mongoSession },
        )
        await Debt.updateMany(
          { classId: fromClassId, studentId: oldStudentId },
          { $set: { classId: toClassId } },
          { session: mongoSession },
        )
        await Report.updateMany(
          { classId: fromClassId, studentId: oldStudentId },
          { $set: { classId: toClassId } },
          { session: mongoSession },
        )

        // MongoDB cấm $addToSet và $pull cùng tác động 1 field trong 1 lệnh
        // update (lỗi code 40 "would create a conflict") — phải tách 2 lệnh.
        await Class.updateOne(
          { _id: toClassId },
          { $addToSet: { studentIds: oldStudentId } },
          { session: mongoSession },
        )
        await Class.updateOne(
          { _id: toClassId },
          { $pull: { studentIds: newStudentId } },
          { session: mongoSession },
        )
      })
    } finally {
      await mongoSession.endSession()
    }

    await AuditLog.create({
      action: 'student.classMerge',
      resource: 'Class',
      resourceId: toClassId,
      metadata: {
        oldStudentId: oldStudentIdArg, newStudentId: newStudentIdArg,
        fromClassId: fromClassIdArg, toClassId: toClassIdArg,
        oldSessions: oldSessions.length, newSessions: newSessions.length,
        totalMerged: renumbered.length, sessionsMarkedBilled: billedIds.size,
        notices: notices.length, debts: debts.length, reports: reports.length,
      },
    })

    console.log(`✅ Đã gộp xong. "${fromClass.name}" VẪN còn giữ tài khoản cũ trong danh sách — tự kiểm tra "${toClass.name}" ổn rồi mới xóa khỏi lớp cũ.`)
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error('Lỗi:', err)
  process.exit(1)
})
