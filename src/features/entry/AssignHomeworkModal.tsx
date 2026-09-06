import { useState } from 'react'
import { C } from '@/constants/colors'
import { Btn } from '@/components/atoms/Btn'
import { assignmentService, type AssignmentSubmitType } from '@/services/assignments'
import { QuestionBuilder } from './QuestionBuilder'
import type { Question } from '@/types/quiz'

interface Props {
  classId: string
  className?: string
  teacherName?: string
  sessionId?: string
  onClose: () => void
  onCreated: () => void
}

export function AssignHomeworkModal({ classId, className, teacherName, sessionId, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  })
  const [submitType, setSubmitType] = useState<AssignmentSubmitType>('both')
  const [scriptText, setScriptText] = useState('')
  const [maxPhotos, setMaxPhotos] = useState(3)
  const [questions, setQuestions] = useState<Question[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setErr('Vui lòng nhập tiêu đề bài tập'); return }
    if (submitType === 'quiz' && questions.length === 0) { setErr('Vui lòng thêm ít nhất 1 câu hỏi'); return }
    setSaving(true); setErr('')
    try {
      await assignmentService.create({
        classId, sessionId,
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate,
        submitType,
        scriptText: scriptText.trim() || undefined,
        maxPhotos,
        questions: submitType === 'quiz' ? questions : undefined,
      })
      onCreated()
    } catch {
      setErr('Giao bài thất bại, vui lòng thử lại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgb(0 0 0 / 0.45)' }}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-2xl p-6"
        style={{ background: '#fff', boxShadow: '0 20px 48px -8px rgb(0 0 0 / 0.28)', maxHeight: '90vh' }}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: C.ink }}>Giao bài tập</h2>
          <button onClick={onClose} className="text-xl font-bold" style={{ color: C.muted }}>✕</button>
        </div>
        {(className || teacherName) && (
          <div className="mb-4 flex flex-wrap gap-x-3 gap-y-0.5 text-sm" style={{ color: C.muted }}>
            {className && <span>🏫 Lớp: <b style={{ color: C.board }}>{className}</b></span>}
            {teacherName && <span>👩‍🏫 GV: <b style={{ color: C.ink }}>{teacherName}</b></span>}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {err && (
            <div className="rounded-xl px-4 py-2.5 text-sm font-medium" style={{ background: C.red + '12', color: C.red }}>
              {err}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-semibold" style={{ color: C.ink }}>Tiêu đề *</label>
            <input
              value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Đọc đoạn hội thoại trang 12, Unit 3"
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{ border: `1.5px solid ${C.line}` }}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold" style={{ color: C.ink }}>Mô tả</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Hướng dẫn chi tiết cho học sinh / phụ huynh"
              rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-sm resize-none"
              style={{ border: `1.5px solid ${C.line}` }}
            />
          </div>

          <div className={submitType === 'quiz' ? '' : 'grid grid-cols-2 gap-3'}>
            <div>
              <label className="mb-1 block text-sm font-semibold" style={{ color: C.ink }}>Hạn nộp</label>
              <input
                type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm"
                style={{ border: `1.5px solid ${C.line}` }}
              />
            </div>
            {submitType !== 'quiz' && (
              <div>
                <label className="mb-1 block text-sm font-semibold" style={{ color: C.ink }}>Số ảnh tối đa</label>
                <input
                  type="number" min={1} max={10} value={maxPhotos}
                  onChange={(e) => setMaxPhotos(Number(e.target.value))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm"
                  style={{ border: `1.5px solid ${C.line}` }}
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold" style={{ color: C.ink }}>Loại nộp bài</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['photo', 'video', 'both', 'quiz'] as const).map((t) => (
                <button
                  key={t} type="button"
                  onClick={() => setSubmitType(t)}
                  className="rounded-xl py-2 text-xs font-semibold transition-all"
                  style={{
                    background: submitType === t ? C.board : C.paper,
                    color: submitType === t ? '#fff' : C.muted,
                    border: `1.5px solid ${submitType === t ? C.board : C.line}`,
                  }}
                >
                  {t === 'photo' ? '📷 Ảnh' : t === 'video' ? '🎥 Video' : t === 'both' ? '📷+🎥 Cả hai' : '✅ Trắc nghiệm'}
                </button>
              ))}
            </div>
          </div>

          {submitType === 'quiz' && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold" style={{ color: C.ink }}>Câu hỏi</label>
              <QuestionBuilder questions={questions} onChange={setQuestions} />
            </div>
          )}

          {(submitType === 'video' || submitType === 'both') && (
            <div>
              <label className="mb-1 block text-sm font-semibold" style={{ color: C.ink }}>
                Script mẫu <span className="font-normal" style={{ color: C.muted }}>(học sinh cần đọc)</span>
              </label>
              <textarea
                value={scriptText} onChange={(e) => setScriptText(e.target.value)}
                placeholder="VD: My name is ... I am ... years old. I like ..."
                rows={3}
                className="w-full rounded-xl px-3 py-2.5 text-sm resize-none font-mono"
                style={{ border: `1.5px solid ${C.line}` }}
              />
              <p className="mt-1 text-xs" style={{ color: C.muted }}>
                Script này dùng để giáo viên so sánh khi nghe video.
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Btn onClick={onClose} className="flex-1">Hủy</Btn>
            <button
              type="submit" disabled={saving}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold transition-all disabled:opacity-60 hover:brightness-[0.93]"
              style={{ background: C.board, color: '#fff' }}
            >
              {saving ? 'Đang lưu...' : 'Giao bài'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
