import { useEffect, useState } from 'react'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { assignmentService, type Assignment } from '@/services/assignments'
import { submissionService, type Submission } from '@/services/submissions'
import { SubmitHomeworkModal } from './SubmitHomeworkModal'
import { QuizPlayer } from './QuizPlayer'
import { viDateTime } from '@/utils/format'

interface Props {
  classId: string
  studentId: string
  className?: string
  teacherName?: string
}

function dueDateLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffH = Math.round(diffMs / 3600000)
  if (diffMs < 0) return { text: 'Đã hết hạn', color: C.red }
  if (diffH < 1) return { text: 'Sắp hết hạn (dưới 1 giờ)', color: C.red }
  if (diffH < 24) return { text: `Còn ${diffH} giờ`, color: '#D97706' }
  const diffDays = Math.ceil(diffH / 24)
  if (diffDays <= 2) return { text: `Còn ${diffDays} ngày`, color: '#D97706' }
  return { text: `Còn ${diffDays} ngày`, color: C.muted }
}

export function HomeworkTab({ classId, studentId, className, teacherName }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<Assignment | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [asgns, subs] = await Promise.all([
        assignmentService.list(classId),
        submissionService.list({ studentId, classId }),
      ])
      setAssignments(asgns)
      setSubmissions(subs)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [classId, studentId])

  const subMap = Object.fromEntries(submissions.map((s) => [s.assignmentId, s]))

  if (loading) return <div className="py-8 text-center text-sm" style={{ color: C.muted }}>Đang tải...</div>

  const classInfo = (className || teacherName) && (
    <div className="flex flex-wrap gap-x-3 text-xs" style={{ color: C.muted }}>
      {className && <span>🏫 Lớp: <b>{className}</b></span>}
      {teacherName && <span>👩‍🏫 GV: <b>{teacherName}</b></span>}
    </div>
  )

  if (assignments.length === 0)
    return (
      <div className="space-y-2">
        {classInfo}
        <div className="py-8 text-center text-sm" style={{ color: C.muted }}>Chưa có bài tập nào.</div>
      </div>
    )

  return (
    <div className="space-y-3">
      {classInfo}
      {assignments.map((a) => {
        const sub = subMap[a._id]
        const due = dueDateLabel(a.dueDate)
        const reviewed = sub?.status === 'reviewed'

        return (
          <Card key={a._id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm leading-snug" style={{ color: C.ink }}>{a.title}</div>
                {a.description && (
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: C.muted }}>{a.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span style={{ color: due.color }}>⏰ {due.text}</span>
                  <span style={{ color: C.muted }}>({viDateTime(a.dueDate)})</span>
                  <span style={{ color: C.muted }}>
                    {a.submitType === 'photo' ? '📷 Ảnh' : a.submitType === 'video' ? '🎥 Video' : a.submitType === 'quiz' ? '✅ Trắc nghiệm' : '📷+🎥 Cả hai'}
                  </span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                {!sub ? (
                  <button
                    onClick={() => setActive(a)}
                    className="rounded-xl px-3 py-1.5 text-xs font-bold transition-all hover:brightness-[0.92]"
                    style={{ background: C.board, color: '#fff' }}
                  >
                    {a.submitType === 'quiz' ? 'Làm bài' : 'Nộp bài'}
                  </button>
                ) : reviewed ? (
                  <span className="rounded-xl px-3 py-1.5 text-xs font-semibold" style={{ background: '#ECFDF5', color: '#059669' }}>
                    ✓ {a.submitType === 'quiz' ? `${sub.autoScore ?? 0}/100` : 'Đã chấm'}
                  </span>
                ) : (
                  <span className="rounded-xl px-3 py-1.5 text-xs font-semibold" style={{ background: C.gold + '22', color: '#7A5A05' }}>
                    ⏳ Chờ duyệt
                  </span>
                )}
              </div>
            </div>

            {/* Nhận xét giáo viên (chỉ áp dụng bài ảnh/video được duyệt tay) */}
            {reviewed && a.submitType !== 'quiz' && (sub.teacherComment || sub.teacherScore != null) && (
              <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
                {sub.teacherScore != null && (
                  <div className="mb-1 text-sm font-black" style={{ color: '#059669' }}>
                    Điểm: {sub.teacherScore}/100
                  </div>
                )}
                {sub.teacherComment && (
                  <p className="text-xs leading-relaxed" style={{ color: '#065F46' }}>
                    💬 {sub.teacherComment}
                  </p>
                )}
              </div>
            )}

            {/* Ảnh đã nộp */}
            {sub && sub.photos.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {sub.photos.map((p, i) => (
                  <a key={i} href={p.url} target="_blank" rel="noreferrer">
                    <img src={p.url} alt="" className="h-16 w-16 rounded-lg object-cover shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </Card>
        )
      })}

      {active && active.submitType === 'quiz' && (
        <QuizPlayer
          assignment={active}
          studentId={studentId}
          onClose={() => setActive(null)}
          onSubmitted={() => { setActive(null); load() }}
        />
      )}
      {active && active.submitType !== 'quiz' && (
        <SubmitHomeworkModal
          assignment={active}
          studentId={studentId}
          onClose={() => setActive(null)}
          onSubmitted={() => { setActive(null); load() }}
        />
      )}
    </div>
  )
}
