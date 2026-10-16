import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { C } from '@/constants/colors'
import { Btn } from '@/components/atoms/Btn'
import { classService } from '@/services/classes'
import { teacherService, type ApiTeacher } from '@/services/teachers'
import { toast } from '@/store/toastStore'

interface Props {
  classId: string
}

const CLASS_DETAIL_KEY = (classId: string) => ['class-detail-assistants', classId] as const

/** 1 lớp có thể do 2 giáo viên cùng quản lý (giáo viên chính + giáo viên
 *  phụ) — quyền ngang nhau hoàn toàn trên mọi dữ liệu của lớp (điểm, buổi
 *  học, học phí, bài tập...). Giáo viên chính tự thêm/gỡ giáo viên phụ ở
 *  đây, không cần nhờ admin. Xem server/src/utils/classAuth.ts — mọi API
 *  liên quan đã kiểm tra quyền qua đúng 2 field này (teacherId +
 *  assistantTeacherIds), không chỉ 1 mình teacherId như trước. */
export function AssistantTeachersPanel({ classId }: Props) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ApiTeacher[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: cls } = useQuery({
    queryKey: CLASS_DETAIL_KEY(classId),
    queryFn: () => classService.get(classId),
    staleTime: 30_000,
  })

  // Server populate() field này thành { _id, name, email }[] (xem
  // classController.getClass) — type ApiClass khai báo string[] cho đơn
  // giản, ép kiểu lại đúng như cách ApiClass.teacherId đã làm ở nơi khác.
  const assistants = ((cls?.assistantTeacherIds ?? []) as unknown as ApiTeacher[]).filter(
    (t) => t && typeof t === 'object',
  )
  const currentIds = assistants.map((t) => t._id)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const items = await teacherService.list(query.trim())
        setResults(items.filter((t) => !currentIds.includes(t._id)))
      } catch {
        toast.error('Lỗi khi tìm giáo viên — thử lại.')
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  async function save(nextIds: string[]) {
    setSaving(true)
    try {
      await classService.update(classId, { assistantTeacherIds: nextIds })
      await qc.invalidateQueries({ queryKey: CLASS_DETAIL_KEY(classId) })
    } catch {
      toast.error('Lỗi khi lưu — thử lại.', { persist: true })
    } finally {
      setSaving(false)
    }
  }

  async function addTeacher(t: ApiTeacher) {
    setQuery('')
    setResults([])
    setAdding(false)
    await save([...currentIds, t._id])
    toast.success(`Đã thêm ${t.name} làm giáo viên phụ lớp này.`)
  }

  async function removeTeacher(t: ApiTeacher) {
    if (!confirm(`Gỡ ${t.name} khỏi lớp này? ${t.name} sẽ không còn thấy/sửa được dữ liệu lớp nữa.`)) return
    await save(currentIds.filter((id) => id !== t._id))
  }

  return (
    <div className="text-sm">
      <div className="mb-1" style={{ color: C.muted }}>Giáo viên phụ (đồng quản lý lớp này)</div>
      <div className="flex flex-wrap items-center gap-2">
        {assistants.map((t) => (
          <span
            key={t._id}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: C.board2 + '1a', color: C.board2 }}
          >
            {t.name}
            <button
              onClick={() => void removeTeacher(t)}
              disabled={saving}
              title="Gỡ khỏi lớp"
              className="font-bold"
              style={{ color: C.red }}
            >
              ✕
            </button>
          </span>
        ))}

        {!adding ? (
          <Btn kind="ghost" size="sm" onClick={() => setAdding(true)}>+ Thêm giáo viên phụ</Btn>
        ) : (
          <div className="relative">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => setTimeout(() => setAdding(false), 150)}
              placeholder="Gõ tên giáo viên..."
              className="rounded-lg px-2 py-1 text-sm"
              style={{ border: `1px solid ${C.line}` }}
            />
            {(searching || results.length > 0) && (
              <div
                className="absolute z-10 mt-1 w-56 overflow-hidden rounded-lg"
                style={{ background: '#fff', border: `1px solid ${C.line}`, boxShadow: '0 4px 12px #00000022' }}
              >
                {searching && <div className="px-3 py-2 text-xs" style={{ color: C.muted }}>Đang tìm...</div>}
                {results.map((t) => (
                  <button
                    key={t._id}
                    onMouseDown={() => void addTeacher(t)}
                    className="block w-full px-3 py-2 text-left text-sm hover:brightness-[0.95]"
                    style={{ background: C.paper }}
                  >
                    {t.name} <span style={{ color: C.muted }}>({t.email})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
