import { useEffect, useState } from 'react'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { assignmentService, type Assignment, type AssignmentStats } from '@/services/assignments'
import { submissionService, type Submission } from '@/services/submissions'

interface Props {
  classId: string
  sessionId?: string
}

function StudentName(sub: Submission) {
  if (typeof sub.studentId === 'object') return sub.studentId.name
  return String(sub.studentId)
}

export function SubmissionReviewPanel({ classId, sessionId }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [stats, setStats] = useState<AssignmentStats | null>(null)
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({})
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [score, setScore] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingVideo, setLoadingVideo] = useState<string | null>(null)

  useEffect(() => {
    assignmentService.list(classId, sessionId).then(setAssignments)
  }, [classId, sessionId])

  async function selectAssignment(id: string) {
    setSelectedId(id)
    setSubmissions([])
    setStats(null)
    setVideoUrls({})
    setReviewing(null)
    const [subs, st] = await Promise.all([
      submissionService.list({ assignmentId: id }),
      assignmentService.stats(id),
    ])
    setSubmissions(subs)
    setStats(st)
  }

  async function loadVideo(subId: string) {
    if (videoUrls[subId] || loadingVideo === subId) return
    setLoadingVideo(subId)
    try {
      const url = await submissionService.getVideoUrl(subId)
      setVideoUrls((prev) => ({ ...prev, [subId]: url }))
    } finally {
      setLoadingVideo(null)
    }
  }

  async function handleReview(subId: string) {
    setSaving(true)
    try {
      const wasReviewed = submissions.find((s) => s._id === subId)?.status === 'reviewed'
      const updated = await submissionService.review(subId, {
        teacherComment: comment.trim() || undefined,
        teacherScore: score ? Number(score) : undefined,
      })
      setSubmissions((prev) => prev.map((s) => (s._id === subId ? { ...s, ...updated } : s)))
      if (!wasReviewed) {
        setStats((prev) => prev ? { ...prev, reviewed: prev.reviewed + 1, pending: prev.pending - 1 } : prev)
      }
      setReviewing(null)
      setComment('')
      setScore('')
    } finally {
      setSaving(false)
    }
  }

  const selected = assignments.find((a) => a._id === selectedId)

  return (
    <div className="space-y-3">
      {/* Danh sách bài tập */}
      <Card className="p-3">
        <div className="mb-2 text-xs font-bold uppercase" style={{ color: C.muted }}>Chọn bài tập để xem bài nộp</div>
        {assignments.length === 0 && (
          <div className="py-4 text-center text-sm" style={{ color: C.muted }}>Chưa có bài tập nào trong lớp này.</div>
        )}
        <div className="flex flex-wrap gap-2">
          {assignments.map((a) => (
            <button
              key={a._id}
              onClick={() => selectAssignment(a._id)}
              className="rounded-xl px-3 py-1.5 text-sm font-semibold transition-all"
              style={{
                background: selectedId === a._id ? C.board : C.paper,
                color: selectedId === a._id ? '#fff' : C.ink,
                border: `1px solid ${selectedId === a._id ? C.board : C.line}`,
              }}
            >
              {a.title}
            </button>
          ))}
        </div>
      </Card>

      {/* Stats */}
      {selected && stats && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Đã nộp', value: stats.total, color: C.board },
            { label: 'Chờ duyệt', value: stats.pending, color: '#D97706' },
            { label: 'Đã duyệt', value: stats.reviewed, color: '#059669' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: '#fff', border: `1px solid ${C.line}` }}>
              <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs" style={{ color: C.muted }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Danh sách bài nộp */}
      {selected && submissions.map((sub) => {
        const isReviewing = reviewing === sub._id
        const reviewed = sub.status === 'reviewed'

        return (
          <Card key={sub._id} className="overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ background: reviewed ? '#ECFDF5' : C.paper, borderBottom: `1px solid ${C.line}` }}
            >
              <div className="font-semibold text-sm" style={{ color: C.ink }}>{StudentName(sub)}</div>
              <div className="flex items-center gap-1.5">
                {selected.submitType === 'quiz' && (
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: C.board2 + '18', color: C.board2 }}>
                    🤖 Tự động chấm
                  </span>
                )}
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{
                    background: reviewed ? '#059669' + '18' : C.gold + '22',
                    color: reviewed ? '#059669' : '#7A5A05',
                  }}
                >
                  {reviewed ? '✓ Đã duyệt' : '⏳ Chờ duyệt'}
                </span>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {/* Kết quả quiz — tự động chấm */}
              {selected.submitType === 'quiz' && (
                <div className="space-y-2">
                  <div className="text-center">
                    <div className="text-xs font-bold uppercase" style={{ color: C.muted }}>Điểm tự động</div>
                    <div className="text-4xl font-black" style={{ color: (sub.autoScore ?? 0) >= 80 ? '#059669' : (sub.autoScore ?? 0) >= 50 ? '#D97706' : C.red }}>
                      {sub.autoScore ?? 0}<span className="text-xl">/100</span>
                    </div>
                  </div>
                  {(selected.questions ?? []).map((q, qi) => {
                    const a = sub.answers?.find((x) => x.questionId === q.id)
                    if (!a) return null
                    const label = q.type === 'match'
                      ? 'Ghép cặp'
                      : 'text' in q ? q.text : ''
                    return (
                      <div
                        key={q.id}
                        className="rounded-lg px-3 py-2 text-xs"
                        style={{ background: a.correct ? '#F0FDF4' : C.red + '0d', border: `1px solid ${a.correct ? '#86EFAC' : C.red + '30'}` }}
                      >
                        <div className="font-semibold" style={{ color: C.ink }}>
                          {a.correct ? '✅' : '❌'} Câu {qi + 1}: {label}
                        </div>
                        {!a.correct && a.correctText && (
                          <div style={{ color: C.muted }}>Đáp án đúng: <b style={{ color: C.ink }}>{a.correctText}</b></div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Ảnh */}
              {sub.photos.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-bold uppercase" style={{ color: C.muted }}>Ảnh bài tập</div>
                  <div className="flex gap-2 flex-wrap">
                    {sub.photos.map((p, i) => (
                      <a key={i} href={p.url} target="_blank" rel="noreferrer">
                        <img src={p.url} alt="" className="h-24 w-24 rounded-xl object-cover border" style={{ borderColor: C.line }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Video */}
              {selected.submitType !== 'photo' && selected.submitType !== 'quiz' && (
                <div>
                  <div className="mb-1.5 text-xs font-bold uppercase" style={{ color: C.muted }}>Video bài nói</div>
                  {videoUrls[sub._id] ? (
                    <video
                      src={videoUrls[sub._id]}
                      controls
                      className="w-full rounded-xl"
                      style={{ maxHeight: 280, background: '#000' }}
                    />
                  ) : (
                    <button
                      onClick={() => loadVideo(sub._id)}
                      disabled={loadingVideo === sub._id}
                      className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                      style={{ background: C.board + '10', color: C.board, border: `1px solid ${C.board}30` }}
                    >
                      {loadingVideo === sub._id ? '⏳ Đang tải...' : '▶ Xem video'}
                    </button>
                  )}
                  {selected.scriptText && (
                    <div className="mt-2 rounded-xl px-3 py-2" style={{ background: C.paper }}>
                      <div className="text-xs font-bold mb-0.5" style={{ color: C.muted }}>Script mẫu</div>
                      <p className="text-xs font-mono leading-relaxed" style={{ color: C.ink }}>{selected.scriptText}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Nhận xét cũ */}
              {(sub.teacherComment || (selected.submitType !== 'quiz' && sub.teacherScore != null)) && (
                <div className="rounded-xl px-3 py-2.5" style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
                  {selected.submitType !== 'quiz' && sub.teacherScore != null && (
                    <div className="text-sm font-black" style={{ color: '#059669' }}>Điểm: {sub.teacherScore}/100</div>
                  )}
                  {sub.teacherComment && <p className="text-xs mt-0.5" style={{ color: '#065F46' }}>💬 {sub.teacherComment}</p>}
                </div>
              )}

              {/* Form duyệt */}
              {!isReviewing && (!reviewed || (selected.submitType === 'quiz' && !sub.teacherComment)) && (
                <Btn kind="solid" onClick={() => { setReviewing(sub._id); setComment(''); setScore('') }}>
                  {selected.submitType === 'quiz' ? 'Thêm nhận xét' : 'Duyệt bài + Ghi nhận xét'}
                </Btn>
              )}

              {isReviewing && (
                <div className="space-y-2 rounded-xl p-3" style={{ background: C.paper }}>
                  {selected.submitType !== 'quiz' && (
                    <input
                      type="number" min={0} max={100}
                      value={score} onChange={(e) => setScore(e.target.value)}
                      placeholder="Điểm (0–100, để trống nếu không chấm điểm)"
                      className="w-full rounded-xl px-3 py-2 text-sm"
                      style={{ border: `1px solid ${C.line}` }}
                    />
                  )}
                  <textarea
                    value={comment} onChange={(e) => setComment(e.target.value)}
                    placeholder="Nhận xét cho học sinh / phụ huynh..."
                    rows={3}
                    className="w-full resize-none rounded-xl px-3 py-2 text-sm"
                    style={{ border: `1px solid ${C.line}` }}
                  />
                  <div className="flex gap-2">
                    <Btn onClick={() => setReviewing(null)}>Hủy</Btn>
                    <button
                      onClick={() => handleReview(sub._id)} disabled={saving}
                      className="flex-1 rounded-xl py-2 text-sm font-bold disabled:opacity-60 hover:brightness-[0.92]"
                      style={{ background: '#059669', color: '#fff' }}
                    >
                      {saving ? 'Đang lưu...' : '✓ Xác nhận duyệt'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
