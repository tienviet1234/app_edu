import { TuitionNotice } from '../models/TuitionNotice.js'
import { TeacherPayRecord } from '../models/TeacherPayRecord.js'
import { Notification } from '../models/Notification.js'
import { Class } from '../models/Class.js'
import { User } from '../models/User.js'
import { computeBillingReport } from './billingService.js'

// Đã gửi thông báo học phí quá bao nhiêu ngày mà vẫn "chưa đóng" thì nhắc —
// tránh nhắc ngay lập tức (phụ huynh cần thời gian xoay tiền), nhưng cũng
// không để quên quá lâu.
const UNPAID_REMIND_AFTER_DAYS = 7

function monthRange(year: number, month0: number): { from: string; to: string } {
  const mm = String(month0 + 1).padStart(2, '0')
  const lastDay = new Date(year, month0 + 1, 0).getDate()
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

/** Học phí đã gửi thông báo nhưng quá hạn vẫn chưa thu được tiền — nhắc
 *  ĐÚNG GIÁO VIÊN của lớp đó (người trực tiếp làm việc với phụ huynh). Mỗi
 *  khoản chỉ nhắc 1 LẦN DUY NHẤT (dedup qua Notification.data.noticeId) —
 *  không nhắc lặp lại mỗi ngày, tránh làm phiền; giáo viên tự thấy lại tình
 *  trạng ở tab "Báo cáo + Học phí" nếu cần theo dõi tiếp. */
async function checkUnpaidTuition(): Promise<number> {
  const threshold = new Date()
  threshold.setDate(threshold.getDate() - UNPAID_REMIND_AFTER_DAYS)
  const overdue = await TuitionNotice.find(
    { paymentStatus: 'unpaid', sentAt: { $lte: threshold } },
    { classId: 1, periodLabel: 1, finalAmount: 1 },
  ).lean()

  let count = 0
  for (const notice of overdue) {
    const already = await Notification.findOne({
      'data.kind': 'tuition-unpaid-reminder', 'data.noticeId': String(notice._id),
    }).lean()
    if (already) continue

    const cls = await Class.findById(notice.classId, 'teacherId centerId name').lean()
    if (!cls?.teacherId) continue

    await Notification.create({
      centerId: cls.centerId,
      recipientId: cls.teacherId,
      title: '💰 Học phí chưa thu',
      body: `Lớp ${cls.name} — kỳ ${notice.periodLabel} đã gửi thông báo trên ${UNPAID_REMIND_AFTER_DAYS} ngày nhưng chưa ghi nhận đóng tiền (${notice.finalAmount.toLocaleString('vi-VN')}đ). Vào "Báo cáo + Học phí" để nhắc phụ huynh hoặc xác nhận nếu đã đóng.`,
      type: 'announcement',
      data: { kind: 'tuition-unpaid-reminder', noticeId: String(notice._id) },
    }).catch((err) => console.error('Lỗi gửi nhắc học phí chưa thu:', err))
    count++
  }
  return count
}

/** Lương giáo viên của THÁNG VỪA HOÀN THÀNH (đã qua hạn trả cuối tháng) mà
 *  chưa có TeacherPayRecord — nhắc TOÀN BỘ ADMIN đang hoạt động. Chỉ nhắc
 *  giáo viên nào thực sự CÓ lương phải trả tháng đó (total > 0). Mỗi giáo
 *  viên/tháng chỉ nhắc 1 LẦN DUY NHẤT cho tới khi được đánh dấu đã trả. */
async function checkUnpaidSalary(): Promise<number> {
  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const { from, to } = monthRange(prevMonth.getFullYear(), prevMonth.getMonth())
  const report = await computeBillingReport(from, to)

  const dueTeachers = report.teachers.filter((t) => t.total > 0)
  if (!dueTeachers.length) return 0

  let count = 0
  const admins = await User.find({ role: 'admin', isActive: true }, '_id').lean()
  if (!admins.length) return 0

  for (const t of dueTeachers) {
    const paid = await TeacherPayRecord.findOne({ teacherId: t.teacherId, from, to }).lean()
    if (paid) continue

    const already = await Notification.findOne({
      'data.kind': 'teacher-salary-unpaid', 'data.teacherId': t.teacherId, 'data.from': from, 'data.to': to,
    }).lean()
    if (already) continue

    const body = `Chưa đánh dấu trả lương tháng ${from.slice(0, 7)} cho ${t.teacherName} (${t.total.toLocaleString('vi-VN')}đ). Vào "Học phí & Lương" để xác nhận khi đã chuyển khoản.`
    await Notification.insertMany(
      admins.map((a) => ({
        recipientId: a._id,
        title: '👩‍🏫 Lương giáo viên chưa trả',
        body,
        type: 'announcement' as const,
        data: { kind: 'teacher-salary-unpaid', teacherId: t.teacherId, from, to },
      })),
    ).catch((err) => console.error('Lỗi gửi nhắc lương giáo viên:', err))
    count++
  }
  return count
}

/** Chạy mỗi ngày qua POST /api/cron/check-billing-reminders (GitHub Actions)
 *  — xem server/src/controllers/cronController.ts. Cả 2 việc đều CHỈ NHẮC,
 *  không tự động làm gì khác (không tự gửi tiền, không tự đổi trạng thái) —
 *  đây là tiền thật, mọi xác nhận vẫn phải người thật bấm tay. */
export async function runBillingReminders(): Promise<{ tuitionUnpaidReminders: number; salaryUnpaidReminders: number }> {
  const tuitionUnpaidReminders = await checkUnpaidTuition()
  const salaryUnpaidReminders = await checkUnpaidSalary()
  return { tuitionUnpaidReminders, salaryUnpaidReminders }
}
