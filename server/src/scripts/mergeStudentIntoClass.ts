/**
 * Script CLI chạy tay — gộp 2 tài khoản của cùng 1 học sinh thành 1 (xem
 * ghi chú đầy đủ ở `services/studentMergeService.ts`, nơi chứa toàn bộ
 * logic thật — script này chỉ là lớp vỏ: đọc tham số dòng lệnh, in bảng
 * tổng kết, ghi backup JSON ra đĩa máy chạy script).
 *
 * Cùng logic này cũng được expose qua API (`/api/admin/student-merges`) cho
 * admin/giáo viên thao tác trực tiếp trên app — ưu tiên dùng app khi có thể,
 * script này giữ lại cho trường hợp cần chạy tay/gỡ lỗi trực tiếp trên DB.
 *
 * Cách chạy (từ thư mục server/):
 *   npx tsx src/scripts/mergeStudentIntoClass.ts --oldStudentId=<id> --newStudentId=<id> --fromClassId=<id> --toClassId=<id> --dry-run
 *   npx tsx src/scripts/mergeStudentIntoClass.ts --oldStudentId=<id> --newStudentId=<id> --fromClassId=<id> --toClassId=<id>
 *
 * LUÔN chạy --dry-run trước, đọc kỹ bảng tổng kết, rồi mới chạy thật.
 */
import fs from 'node:fs'
import path from 'node:path'
import mongoose from 'mongoose'
import { connectDB } from '../config/db.js'
import { previewStudentMerge, runStudentMerge, MergeValidationError, type MergePlan } from '../services/studentMergeService.js'

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const oldStudentId = args.find((a) => a.startsWith('--oldStudentId='))?.split('=')[1]
const newStudentId = args.find((a) => a.startsWith('--newStudentId='))?.split('=')[1]
const fromClassId = args.find((a) => a.startsWith('--fromClassId='))?.split('=')[1]
const toClassId = args.find((a) => a.startsWith('--toClassId='))?.split('=')[1]

function fail(msg: string): never {
  console.error(`❌ ${msg}`)
  process.exit(1)
}

const vi = (iso: string) => iso.slice(0, 10)

function printPlan(plan: MergePlan, dryRun: boolean) {
  console.log(`${dryRun ? '[DRY RUN] ' : ''}Hợp nhất học sinh: "${plan.fromClassName}"(${plan.oldStudentId}) + "${plan.toClassName}"(${plan.newStudentId}) → "${plan.toClassName}"(${plan.oldStudentId})\n`)
  console.log(`Hợp nhất ${plan.rows.length} buổi, xếp theo ngày:`)
  plan.rows.forEach((r) => {
    const mark = r.billed ? '  [billed=true]' : ''
    console.log(`  Buổi ${r.newLessonNo}  —  ${vi(r.scheduledAt)}  (gốc: Buổi ${r.oldLessonNo ?? '?'}, ${r.source === 'old' ? 'Lớp cũ' : 'Lớp mới'})${mark}`)
  })
  console.log('')
  console.log(`Khoản học phí sẽ chuyển nguyên trạng thái (${plan.notices.length}):`)
  plan.notices.forEach((n) => console.log(`  "${n.periodLabel}" — ${n.finalAmount.toLocaleString('vi-VN')}đ — ${n.paymentStatus} — gửi ${vi(n.sentAt)}`))
  console.log(`→ ${plan.billedCount}/${plan.rows.length} buổi được đánh dấu billed=true (buổi học trước/đúng lúc gửi khoản trên).`)
  console.log(`Nợ bài tập sẽ chuyển: ${plan.debtsCount} | Báo cáo đã gửi sẽ chuyển: ${plan.reportsCount}\n`)
}

async function main() {
  if (!oldStudentId || !newStudentId || !fromClassId || !toClassId) {
    fail('Cần đủ --oldStudentId=, --newStudentId=, --fromClassId=, --toClassId=')
  }
  await connectDB()
  try {
    const params = { oldStudentId, newStudentId, fromClassId, toClassId }
    if (isDryRun) {
      const plan = await previewStudentMerge(params)
      printPlan(plan, true)
      console.log('[DRY RUN] Không có gì được ghi. Chạy lại không kèm --dry-run để thực thi thật.')
      return
    }

    const { plan, backup } = await runStudentMerge(params, {})
    printPlan(plan, false)

    const dir = path.resolve(process.cwd(), `backups/pre-merge-${Date.now()}`)
    fs.mkdirSync(dir, { recursive: true })
    for (const [key, value] of Object.entries(backup)) {
      fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(value, null, 2))
    }
    console.log(`📦 Backup: ${dir}`)
    console.log(`✅ Đã gộp xong. "${plan.fromClassName}" VẪN còn giữ tài khoản cũ trong danh sách — tự kiểm tra "${plan.toClassName}" ổn rồi mới xóa khỏi lớp cũ.`)
  } catch (err) {
    if (err instanceof MergeValidationError) fail(err.message)
    throw err
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error('Lỗi:', err)
  process.exit(1)
})
