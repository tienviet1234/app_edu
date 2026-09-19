import { Assignment } from '../models/Assignment.js'
import { Submission } from '../models/Submission.js'
import { Class } from '../models/Class.js'
import { ParentProfile } from '../models/ParentProfile.js'
import { Notification } from '../models/Notification.js'
import { sendPushToUser } from './pushService.js'

type ReminderPhase = '12h' | '5h'

const MESSAGES: Record<ReminderPhase, ((title: string) => string)[]> = {
  '12h': [
    (t) => `⏰ Bài tập "${t}" sắp hết hạn trong 12 giờ nữa rồi! Nộp bài sớm để cô giáo khen nhé 🌟`,
    (t) => `📚 Đừng quên "${t}" nha — còn khoảng 12 tiếng nữa là hết hạn đó! 🐝`,
    (t) => `🎈 Nhắc nhẹ xíu: "${t}" còn nửa ngày nữa hết hạn thôi, làm sớm cho nhẹ đầu nhé!`,
  ],
  '5h': [
    (t) => `⚡ Chỉ còn khoảng 5 tiếng nữa là hết hạn "${t}" — tranh thủ làm ngay bây giờ nào! 🚀`,
    (t) => `🔔 Sắp hết giờ rồi! "${t}" đang chờ được nộp đó ✨`,
    (t) => `🐢 Đừng để nước đến chân mới nhảy — "${t}" sắp hết hạn trong vài giờ tới!`,
  ],
}

function pickMessage(phase: ReminderPhase, title: string): string {
  const options = MESSAGES[phase]
  return options[Math.floor(Math.random() * options.length)](title)
}

/** Gửi nhắc nhở cho học sinh (+ phụ huynh liên kết) chưa nộp bài của 1 assignment */
async function sendRemindersFor(assignmentId: string, classId: string, title: string, phase: ReminderPhase): Promise<number> {
  const cls = await Class.findById(classId).select('studentIds centerId').lean()
  if (!cls || !cls.studentIds.length) return 0

  const submittedIds = await Submission.find({ assignmentId }).distinct('studentId')
  const submittedSet = new Set(submittedIds.map(String))
  const pendingStudentIds = cls.studentIds.filter((sid) => !submittedSet.has(String(sid)))
  if (!pendingStudentIds.length) return 0

  const parents = await ParentProfile.find({ studentIds: { $in: pendingStudentIds } }).select('userId').lean()

  const recipientIds = new Set<string>([
    ...pendingStudentIds.map(String),
    ...parents.map((p) => String(p.userId)),
  ])

  const body = pickMessage(phase, title)
  const notifTitle = phase === '12h' ? '⏰ Bài tập sắp hết hạn' : '⚡ Sắp hết giờ nộp bài!'

  const docs = [...recipientIds].map((uid) => ({
    centerId: cls.centerId,
    recipientId: uid,
    title: notifTitle,
    body,
    type: 'announcement' as const,
    data: { assignmentId, kind: 'homework-reminder', phase },
  }))
  await Notification.insertMany(docs)

  recipientIds.forEach((uid) =>
    void sendPushToUser(uid, { title: notifTitle, body, tag: `reminder-${assignmentId}-${phase}`, url: '/app' }),
  )

  return recipientIds.size
}

export interface ReminderRunResult {
  checked12h: number
  checked5h: number
  notificationsSent: number
}

/** Quét toàn bộ assignment sắp hết hạn, gửi nhắc 12h và 5h trước (chỉ gửi 1 lần/mốc) */
export async function runReminderCheck(): Promise<ReminderRunResult> {
  const now = new Date()
  const in12h = new Date(now.getTime() + 12 * 3600 * 1000)
  const in5h = new Date(now.getTime() + 5 * 3600 * 1000)

  let notificationsSent = 0

  const due12h = await Assignment.find({
    isActive: true,
    dueDate: { $gt: now, $lte: in12h },
    reminder12hSent: false,
  })
  for (const a of due12h) {
    notificationsSent += await sendRemindersFor(String(a._id), String(a.classId), a.title, '12h')
    a.reminder12hSent = true
    await a.save()
  }

  const due5h = await Assignment.find({
    isActive: true,
    dueDate: { $gt: now, $lte: in5h },
    reminder5hSent: false,
  })
  for (const a of due5h) {
    notificationsSent += await sendRemindersFor(String(a._id), String(a.classId), a.title, '5h')
    a.reminder5hSent = true
    await a.save()
  }

  return { checked12h: due12h.length, checked5h: due5h.length, notificationsSent }
}
