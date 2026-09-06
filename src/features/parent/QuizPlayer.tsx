import { useState } from 'react'
import { C } from '@/constants/colors'
import { Btn } from '@/components/atoms/Btn'
import { submissionService, type Submission } from '@/services/submissions'
import type { Assignment } from '@/services/assignments'
import type { QuestionSafe } from '@/types/quiz'

interface Props {
  assignment: Assignment
  studentId: string
  onClose: () => void
  onSubmitted: () => void
}

export function QuizPlayer({ assignment, studentId, onClose, onSubmitted }: Props) {
  const questions = (assignment.questions ?? []) as QuestionSafe[]
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [matchPicks, setMatchPicks] = useState<Record<string, string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<Submission | null>(null)

  function setAnswer(id: string, val: unknown) {
    setAnswers((prev) => ({ ...prev, [id]: val }))
  }

  function toggleMcq(qid: string, idx: number, multi: boolean) {
    setAnswers((prev) => {
      const cur = (prev[qid] as number[] | undefined) ?? []
      if (!multi) return { ...prev, [qid]: [idx] }
      const next = cur.includes(idx) ? cur.filter((i) => i !== idx) : [...cur, idx]
      return { ...prev, [qid]: next }
    })
  }

  function setMatchPick(qid: string, leftLen: number, leftIdx: number, rightVal: string) {
    setMatchPicks((prev) => {
      const cur = prev[qid] ?? Array(leftLen).fill('')
      const next = [...cur]; next[leftIdx] = rightVal
      setAnswer(qid, next)
      return { ...prev, [qid]: next }
    })
  }

  const answeredCount = questions.filter((q) => {
    const v = answers[q.id]
    if (q.type === 'match') return (v as string[] | undefined)?.every((x) => x)
    return v !== undefined && v !== '' && (!Array.isArray(v) || v.length > 0)
  }).length

  async function handleSubmit() {
    setSubmitting(true); setErr('')
    try {
      const sub = await submissionService.submitQuiz({
        assignmentId: assignment._id,
        classId: assignment.classId,
        studentId,
        answers,
      })
      setResult(sub)
    } catch {
      setErr('Nộp bài thất bại, vui lòng thử lại')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Màn hình kết quả sau khi nộp ────────────────────────────────────────────
  if (result) {
    const score = result.autoScore ?? 0
    const color = score >= 80 ? '#059669' : score >= 50 ? '#D97706' : C.red
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgb(0 0 0 / 0.45)' }}>
        <div
          className="w-full max-w-lg overflow-y-auto rounded-2xl p-6"
          style={{ background: '#fff', boxShadow: '0 20px 48px -8px rgb(0 0 0 / 0.28)', maxHeight: '90vh' }}
        >
          <div className="mb-4 text-center">
            <div className="text-xs font-bold uppercase" style={{ color: C.muted }}>Kết quả bài làm</div>
            <div className="text-5xl font-black" style={{ color }}>{score}<span className="text-2xl">/100</span></div>
          </div>

          <div className="space-y-2">
            {questions.map((q, i) => {
              const a = result.answers?.find((x) => x.questionId === q.id)
              if (!a) return null
              return (
                <div
                  key={q.id}
                  className="rounded-xl p-3 text-sm"
                  style={{ background: a.correct ? '#F0FDF4' : C.red + '0d', border: `1px solid ${a.correct ? '#86EFAC' : C.red + '30'}` }}
                >
                  <div className="mb-1 flex items-center gap-1.5 font-semibold" style={{ color: C.ink }}>
                    <span>{a.correct ? '✅' : '❌'}</span>
                    <span>Câu {i + 1}{q.type !== 'match' ? `: ${q.text}` : ': Ghép cặp'}</span>
                  </div>
                  {!a.correct && a.correctText && (
                    <div className="text-xs" style={{ color: C.muted }}>Đáp án đúng: <b style={{ color: C.ink }}>{a.correctText}</b></div>
                  )}
                </div>
              )
            })}
          </div>

          <Btn kind="solid" className="mt-4 w-full" onClick={onSubmitted}>Đóng</Btn>
        </div>
      </div>
    )
  }

  // ── Màn hình làm bài ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgb(0 0 0 / 0.45)' }}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-2xl p-6"
        style={{ background: '#fff', boxShadow: '0 20px 48px -8px rgb(0 0 0 / 0.28)', maxHeight: '90vh' }}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: C.ink }}>{assignment.title}</h2>
          <button onClick={onClose} className="text-xl font-bold" style={{ color: C.muted }}>✕</button>
        </div>
        <p className="mb-4 text-xs" style={{ color: C.muted }}>
          Đã trả lời {answeredCount}/{questions.length} câu
        </p>

        {err && (
          <div className="mb-3 rounded-xl px-3 py-2 text-sm font-medium" style={{ background: C.red + '12', color: C.red }}>
            {err}
          </div>
        )}

        <div className="space-y-4">
          {questions.map((q, i) => (
            <div key={q.id} className="rounded-xl p-3" style={{ background: C.paper }}>
              <div className="mb-2 text-sm font-semibold" style={{ color: C.ink }}>
                Câu {i + 1}. {q.type !== 'match' ? q.text : 'Ghép các cặp sau'}
              </div>

              {q.type === 'mcq' && (
                <div className="space-y-1.5">
                  {q.options.map((opt, oi) => {
                    const chosen = ((answers[q.id] as number[] | undefined) ?? []).includes(oi)
                    return (
                      <button
                        key={oi}
                        onClick={() => toggleMcq(q.id, oi, false)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all"
                        style={{
                          background: chosen ? C.board : '#fff',
                          color: chosen ? '#fff' : C.ink,
                          border: `1.5px solid ${chosen ? C.board : C.line}`,
                        }}
                      >
                        <span>{String.fromCharCode(65 + oi)}.</span> {opt}
                      </button>
                    )
                  })}
                </div>
              )}

              {q.type === 'fill' && (
                <input
                  value={(answers[q.id] as string) ?? ''}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  placeholder="Điền câu trả lời..."
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: `1.5px solid ${C.line}`, background: '#fff' }}
                />
              )}

              {q.type === 'truefalse' && (
                <div className="flex gap-2">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      onClick={() => setAnswer(q.id, v)}
                      className="flex-1 rounded-lg py-2 text-sm font-bold transition-all"
                      style={{
                        background: answers[q.id] === v ? C.board : '#fff',
                        color: answers[q.id] === v ? '#fff' : C.muted,
                        border: `1.5px solid ${answers[q.id] === v ? C.board : C.line}`,
                      }}
                    >
                      {v ? 'Đúng' : 'Sai'}
                    </button>
                  ))}
                </div>
              )}

              {q.type === 'match' && (
                <div className="space-y-1.5">
                  {q.left.map((leftText, li) => (
                    <div key={li} className="flex items-center gap-2">
                      <span className="flex-1 text-sm" style={{ color: C.ink }}>{leftText}</span>
                      <select
                        value={matchPicks[q.id]?.[li] ?? ''}
                        onChange={(e) => setMatchPick(q.id, q.left.length, li, e.target.value)}
                        className="flex-1 rounded-lg px-2 py-1.5 text-sm"
                        style={{ border: `1.5px solid ${C.line}`, background: '#fff' }}
                      >
                        <option value="">-- Chọn --</option>
                        {q.rightOptions.map((r, ri) => (
                          <option key={ri} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || answeredCount === 0}
          className="mt-4 w-full rounded-xl py-2.5 text-sm font-bold transition-all disabled:opacity-60 hover:brightness-[0.93]"
          style={{ background: C.board, color: '#fff' }}
        >
          {submitting ? 'Đang chấm...' : 'Nộp bài'}
        </button>
      </div>
    </div>
  )
}
