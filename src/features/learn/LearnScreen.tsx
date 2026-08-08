import { useState } from 'react'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { useAuthStore } from '@/store/authStore'
import { useCourses, useCourseLessons, useCreateLesson, useUpdateLesson } from '@/hooks'
import type { ApiCourseDetail, ApiLesson } from '@/services/learning'

// ── Level display ────────────────────────────────────────────────────────────
const LEVEL: Record<string, { label: string; color: string }> = {
  primary:   { label: 'Cấp 1',   color: C.board2 },
  secondary: { label: 'Cấp 2–3', color: '#2E5E8C' },
  high:      { label: 'THPT',    color: '#7C3AED' },
  adult:     { label: 'Người lớn', color: '#D97706' },
}

const STATUS_LABEL: Record<string, string> = {
  active:   'Hoạt động',
  draft:    'Nháp',
  archived: 'Lưu trữ',
}

// ── Lesson form ──────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  no: 1,
  title: '',
  objectivesText: '',
  materialsText: '',
  duration: 90,
  activities: '',
  notes: '',
}

type LessonForm = typeof EMPTY_FORM

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

// ── Lesson detail panel ──────────────────────────────────────────────────────
function LessonDetail({
  lesson,
  canEdit,
  onEdit,
  onBack,
}: {
  lesson: ApiLesson
  canEdit: boolean
  onEdit: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-xl px-2 py-1 text-sm font-bold" style={{ color: C.muted }}>
          ← Quay lại
        </button>
        {canEdit && (
          <Btn kind="solid" onClick={onEdit}>Sửa bài học</Btn>
        )}
      </div>

      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
              Bài {lesson.no}
            </div>
            <h2 className="mt-1 text-xl font-black leading-tight" style={{ color: C.ink }}>
              {lesson.title}
            </h2>
          </div>
          <div
            className="shrink-0 rounded-full px-3 py-1 text-xs font-bold tabular-nums"
            style={{ background: C.board + '18', color: C.board }}
          >
            {lesson.duration} phút
          </div>
        </div>
      </Card>

      {lesson.objectives.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
            Mục tiêu bài học
          </div>
          <ul className="space-y-2">
            {lesson.objectives.map((obj, k) => (
              <li key={k} className="flex items-start gap-2 text-sm" style={{ color: C.ink }}>
                <span
                  className="mt-0.5 shrink-0 rounded-full text-xs font-black"
                  style={{ color: C.board2, minWidth: 20 }}
                >
                  {k + 1}.
                </span>
                {obj}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {lesson.materials.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
            Học liệu & dụng cụ
          </div>
          <div className="flex flex-wrap gap-2">
            {lesson.materials.map((mat, k) => (
              <span
                key={k}
                className="rounded-xl px-3 py-1 text-sm"
                style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}
              >
                {mat}
              </span>
            ))}
          </div>
        </Card>
      )}

      {lesson.activities && (
        <Card className="p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
            Kế hoạch hoạt động
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: C.ink }}>
            {lesson.activities}
          </div>
        </Card>
      )}

      {lesson.notes && (
        <Card className="p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
            Ghi chú thêm
          </div>
          <div className="rounded-xl p-3 text-sm leading-relaxed" style={{ background: C.paper, color: C.muted }}>
            {lesson.notes}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Lesson form modal ────────────────────────────────────────────────────────
function LessonModal({
  course,
  editing,
  nextNo,
  onClose,
}: {
  course: ApiCourseDetail
  editing: ApiLesson | null
  nextNo: number
  onClose: () => void
}) {
  const [form, setForm] = useState<LessonForm>(() =>
    editing
      ? {
          no: editing.no,
          title: editing.title,
          objectivesText: editing.objectives.join('\n'),
          materialsText: editing.materials.join('\n'),
          duration: editing.duration,
          activities: editing.activities ?? '',
          notes: editing.notes ?? '',
        }
      : { ...EMPTY_FORM, no: nextNo },
  )
  const [error, setError] = useState('')

  const { mutate: create, isPending: creating } = useCreateLesson(course._id)
  const { mutate: update, isPending: updating } = useUpdateLesson(course._id)
  const isPending = creating || updating

  const f = (key: keyof LessonForm, val: string | number) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const submit = () => {
    if (!form.title.trim()) { setError('Cần nhập tên bài học.'); return }
    const body = {
      no: Number(form.no),
      title: form.title.trim(),
      objectives: splitLines(form.objectivesText),
      materials: splitLines(form.materialsText),
      duration: Number(form.duration),
      activities: form.activities.trim() || undefined,
      notes: form.notes.trim() || undefined,
    }
    if (editing) {
      update({ id: editing._id, body }, { onSuccess: onClose, onError: () => setError('Lưu thất bại.') })
    } else {
      create(
        { ...body, courseId: course._id, centerId: course.centerId ?? '' },
        { onSuccess: onClose, onError: () => setError('Tạo bài học thất bại. Kiểm tra kết nối.') },
      )
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: '#00000070' }}
      onClick={onClose}
    >
      <Card
        className="w-full max-w-lg overflow-y-auto p-5 space-y-4"
        style={{ maxHeight: '90vh' }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="font-bold text-base" style={{ color: C.ink }}>
          {editing ? `Sửa Bài ${editing.no}` : 'Tạo bài học mới'}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <div className="mb-1 font-medium" style={{ color: C.muted }}>Số thứ tự *</div>
            <input
              type="number"
              min={1}
              value={form.no}
              onChange={(e) => f('no', e.target.value)}
              className="w-full rounded-xl px-3 py-2"
              style={{ border: `1px solid ${C.line}` }}
            />
          </label>
          <label className="block text-sm">
            <div className="mb-1 font-medium" style={{ color: C.muted }}>Thời lượng (phút)</div>
            <input
              type="number"
              min={15}
              max={480}
              value={form.duration}
              onChange={(e) => f('duration', e.target.value)}
              className="w-full rounded-xl px-3 py-2"
              style={{ border: `1px solid ${C.line}` }}
            />
          </label>
        </div>

        <label className="block text-sm">
          <div className="mb-1 font-medium" style={{ color: C.muted }}>Tên bài học *</div>
          <input
            type="text"
            value={form.title}
            onChange={(e) => f('title', e.target.value)}
            placeholder="VD: Greetings & Introductions"
            className="w-full rounded-xl px-3 py-2"
            style={{ border: `1px solid ${C.line}` }}
          />
        </label>

        <label className="block text-sm">
          <div className="mb-1 font-medium" style={{ color: C.muted }}>Mục tiêu (mỗi dòng 1 mục)</div>
          <textarea
            rows={3}
            value={form.objectivesText}
            onChange={(e) => f('objectivesText', e.target.value)}
            placeholder={'Học sinh biết chào hỏi lịch sự\nHiểu và dùng được động từ "to be"'}
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}`, resize: 'vertical' }}
          />
        </label>

        <label className="block text-sm">
          <div className="mb-1 font-medium" style={{ color: C.muted }}>Học liệu (mỗi dòng 1 món)</div>
          <textarea
            rows={2}
            value={form.materialsText}
            onChange={(e) => f('materialsText', e.target.value)}
            placeholder={'SGK trang 12\nFlashcards từ vựng'}
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}`, resize: 'vertical' }}
          />
        </label>

        <label className="block text-sm">
          <div className="mb-1 font-medium" style={{ color: C.muted }}>Kế hoạch hoạt động</div>
          <textarea
            rows={4}
            value={form.activities}
            onChange={(e) => f('activities', e.target.value)}
            placeholder="Mô tả các hoạt động trong buổi học..."
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}`, resize: 'vertical' }}
          />
        </label>

        <label className="block text-sm">
          <div className="mb-1 font-medium" style={{ color: C.muted }}>Ghi chú thêm</div>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => f('notes', e.target.value)}
            placeholder="Dặn dò học sinh, lưu ý của giáo viên..."
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}`, resize: 'vertical' }}
          />
        </label>

        {error && <div className="text-xs" style={{ color: C.red }}>{error}</div>}

        <div className="flex gap-2 pt-1">
          <Btn kind="solid" disabled={isPending} onClick={submit}>
            {isPending ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Tạo bài học'}
          </Btn>
          <Btn onClick={onClose}>Hủy</Btn>
        </div>
      </Card>
    </div>
  )
}

// ── Lesson list panel ────────────────────────────────────────────────────────
function LessonList({
  course,
  canEdit,
  onSelect,
  onBack,
}: {
  course: ApiCourseDetail
  canEdit: boolean
  onSelect: (lesson: ApiLesson) => void
  onBack: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [editTarget, setEditTarget] = useState<ApiLesson | null>(null)

  const { data, isLoading } = useCourseLessons(course._id)
  const lessons = data?.items ?? []

  const lv = LEVEL[course.level ?? ''] ?? { label: course.level ?? '', color: C.muted }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={onBack}
          className="mt-1 rounded-xl px-2 py-1 text-sm font-bold"
          style={{ color: C.muted }}
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-bold"
              style={{ background: lv.color + '20', color: lv.color }}
            >
              {lv.label}
            </span>
            {course.code && (
              <span className="text-xs font-mono" style={{ color: C.muted }}>{course.code}</span>
            )}
          </div>
          <h2 className="text-lg font-black leading-tight mt-0.5" style={{ color: C.ink }}>
            {course.name}
          </h2>
          {course.description && (
            <p className="text-sm mt-1" style={{ color: C.muted }}>{course.description}</p>
          )}
        </div>
        {canEdit && (
          <Btn kind="solid" onClick={() => setCreating(true)}>+ Bài học</Btn>
        )}
      </div>

      {/* Lesson list */}
      {isLoading ? (
        <Card className="p-6 text-center text-sm" style={{ color: C.muted }}>Đang tải...</Card>
      ) : lessons.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-3xl mb-2">📖</div>
          <div className="text-sm" style={{ color: C.muted }}>
            {canEdit
              ? 'Chưa có bài học nào. Tạo bài học đầu tiên!'
              : 'Khoá học này chưa có bài học nào.'}
          </div>
          {canEdit && (
            <Btn kind="solid" className="mt-3" onClick={() => setCreating(true)}>
              + Tạo bài học đầu tiên
            </Btn>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {lessons.map((lesson) => (
            <Card
              key={lesson._id}
              className="p-3 cursor-pointer"
              style={{ transition: 'box-shadow 0.15s' }}
              onClick={() => onSelect(lesson)}
            >
              <div className="flex items-start gap-3">
                <div
                  className="shrink-0 rounded-xl w-9 h-9 flex items-center justify-center text-sm font-black"
                  style={{ background: C.board + '15', color: C.board }}
                >
                  {lesson.no}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm leading-tight" style={{ color: C.ink }}>
                    {lesson.title}
                  </div>
                  {lesson.objectives.length > 0 && (
                    <div
                      className="mt-0.5 text-xs truncate"
                      style={{ color: C.muted }}
                    >
                      {lesson.objectives[0]}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className="text-xs tabular-nums" style={{ color: C.muted }}>
                    {lesson.duration}p
                  </span>
                  {canEdit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditTarget(lesson)
                      }}
                      className="text-xs font-semibold"
                      style={{ color: C.blue }}
                    >
                      Sửa
                    </button>
                  )}
                  <span style={{ color: C.muted }}>›</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modals */}
      {(creating || editTarget) && (
        <LessonModal
          course={course}
          editing={editTarget}
          nextNo={(lessons.at(-1)?.no ?? 0) + 1}
          onClose={() => { setCreating(false); setEditTarget(null) }}
        />
      )}
    </div>
  )
}

// ── Course grid ──────────────────────────────────────────────────────────────
function CourseGrid({ onSelect }: { onSelect: (c: ApiCourseDetail) => void }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('active')
  const [page, setPage] = useState(1)

  const params: Record<string, string> = { page: String(page), limit: '20', status }
  if (q.trim()) params.q = q.trim()

  const { data, isLoading } = useCourses(params)
  const courses = data?.items ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1) }}
          placeholder="Tìm khoá học..."
          className="rounded-xl px-3 py-2 text-sm flex-1 min-w-0"
          style={{ border: `1px solid ${C.line}` }}
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="rounded-xl px-3 py-2 text-sm"
          style={{ border: `1px solid ${C.line}` }}
        >
          <option value="">Tất cả</option>
          <option value="active">Hoạt động</option>
          <option value="draft">Nháp</option>
          <option value="archived">Lưu trữ</option>
        </select>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm" style={{ color: C.muted }}>Đang tải khoá học...</div>
      ) : courses.length === 0 ? (
        <div className="p-8 text-center">
          <div className="text-4xl mb-2">📚</div>
          <div className="text-sm" style={{ color: C.muted }}>
            {q ? `Không tìm thấy khoá học phù hợp với "${q}".` : 'Chưa có khoá học nào.'}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => {
            const lv = LEVEL[c.level ?? ''] ?? { label: c.level ?? '—', color: C.muted }
            return (
              <Card
                key={c._id}
                className="p-4 cursor-pointer"
                onClick={() => onSelect(c)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                    style={{ background: lv.color + '20', color: lv.color }}
                  >
                    {lv.label}
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: STATUS_LABEL[c.status] === 'Hoạt động' ? C.board2 : C.muted }}
                  >
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </div>
                <div className="font-black text-base leading-tight" style={{ color: C.ink }}>
                  {c.name}
                </div>
                {c.code && (
                  <div className="mt-1 text-xs font-mono" style={{ color: C.muted }}>{c.code}</div>
                )}
                {c.description && (
                  <div
                    className="mt-2 text-xs leading-relaxed line-clamp-2"
                    style={{ color: C.muted }}
                  >
                    {c.description}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-3 text-xs" style={{ color: C.muted }}>
                  {c.totalSessions && (
                    <span>{c.totalSessions} buổi/tháng</span>
                  )}
                  {c.sessionDuration && (
                    <span>{c.sessionDuration} phút/buổi</span>
                  )}
                  <span className="ml-auto" style={{ color: C.board2 }}>Xem bài học →</span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Btn disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</Btn>
          <span className="px-3 py-2 text-sm" style={{ color: C.muted }}>{page} / {totalPages}</span>
          <Btn disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Sau →</Btn>
        </div>
      )}
    </div>
  )
}

// ── Root: LearnScreen ────────────────────────────────────────────────────────
export function LearnScreen() {
  const { user } = useAuthStore()
  const canEdit = user?.role === 'teacher' || user?.role === 'admin'

  const [selectedCourse, setSelectedCourse] = useState<ApiCourseDetail | null>(null)
  const [selectedLesson, setSelectedLesson] = useState<ApiLesson | null>(null)
  const [editLesson, setEditLesson] = useState<ApiLesson | null>(null)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black" style={{ color: C.ink }}>
            {selectedLesson
              ? `Bài ${selectedLesson.no} – ${selectedLesson.title}`
              : selectedCourse
                ? selectedCourse.name
                : 'Khoá học & Bài học'}
          </h1>
          {!selectedCourse && (
            <p className="mt-0.5 text-sm" style={{ color: C.muted }}>
              Chọn khoá học để xem giáo án chi tiết.
            </p>
          )}
        </div>
      </div>

      {/* Lesson detail */}
      {selectedLesson && selectedCourse ? (
        <>
          <LessonDetail
            lesson={selectedLesson}
            canEdit={canEdit}
            onBack={() => setSelectedLesson(null)}
            onEdit={() => setEditLesson(selectedLesson)}
          />
          {editLesson && (
            <LessonModal
              course={selectedCourse}
              editing={editLesson}
              nextNo={0}
              onClose={() => setEditLesson(null)}
            />
          )}
        </>
      ) : selectedCourse ? (
        /* Lesson list */
        <LessonList
          course={selectedCourse}
          canEdit={canEdit}
          onSelect={setSelectedLesson}
          onBack={() => setSelectedCourse(null)}
        />
      ) : (
        /* Course grid */
        <CourseGrid onSelect={setSelectedCourse} />
      )}
    </div>
  )
}
