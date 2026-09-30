import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { classService } from '@/services/classes'
import { useAuthStore } from '@/store/authStore'
import { DebtTab } from '@/features/parent/DebtTab'
import { C } from '@/constants/colors'

export function StudentDebtScreen() {
  const { user } = useAuthStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: classData, isLoading } = useQuery({
    queryKey: ['student-portal', 'classes'],
    queryFn: () => classService.list({ limit: '50' }),
  })

  const classes = classData?.items ?? []
  const active = classes.find((c) => c._id === selectedId) ?? classes[0]

  if (isLoading) {
    return <div className="text-center py-12 text-sm" style={{ color: C.muted }}>Đang tải...</div>
  }

  if (!classes.length) {
    return (
      <div className="text-center py-16 space-y-3">
        <div className="text-6xl">📌</div>
        <div className="text-lg font-black" style={{ color: C.board }}>Bạn chưa tham gia lớp nào</div>
      </div>
    )
  }

  const teacherName = typeof active?.teacherId === 'object' && active.teacherId !== null
    ? (active.teacherId as unknown as { name: string }).name
    : undefined

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black" style={{ color: C.board }}>Nợ bài tập</h2>
        <p className="text-sm" style={{ color: C.muted }}>Những việc cô ghi chưa nộp/chưa làm — trả nợ bằng cách gõ nội dung vào đây</p>
      </div>

      {classes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {classes.map((cls) => (
            <button
              key={cls._id}
              onClick={() => setSelectedId(cls._id)}
              className="rounded-xl px-3 py-2 text-sm font-semibold"
              style={{
                border: `2px solid ${(active?._id ?? classes[0]._id) === cls._id ? C.board : C.line}`,
                background: (active?._id ?? classes[0]._id) === cls._id ? C.board + '08' : '#fff',
                color: (active?._id ?? classes[0]._id) === cls._id ? C.board : C.ink,
              }}
            >
              {cls.name}
            </button>
          ))}
        </div>
      )}

      {user && active && (
        <DebtTab classId={active._id} studentId={user.id} className={active.name} teacherName={teacherName} />
      )}
    </div>
  )
}
