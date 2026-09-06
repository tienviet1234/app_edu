import { useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { Btn } from '@/components/atoms/Btn'
import { isMongoid } from '@/utils/mongoid'
import { AssignHomeworkModal } from './AssignHomeworkModal'
import { SubmissionReviewPanel } from './SubmissionReviewPanel'

interface HomeworkScreenProps {
  cls: ClassData
}

export function HomeworkScreen({ cls }: HomeworkScreenProps) {
  const [assignModal, setAssignModal] = useState(false)

  if (!isMongoid(cls.id)) {
    return (
      <div className="rounded-2xl p-6 text-center text-sm" style={{ background: C.paper, color: C.muted }}>
        Lớp này chưa đồng bộ lên máy chủ — cần lớp đã lưu trên server để giao bài tập.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black" style={{ color: C.ink }}>🏫 {cls.name}</h1>
          {cls.teacher && (
            <div className="text-xs" style={{ color: C.muted }}>👩‍🏫 GV: {cls.teacher}</div>
          )}
        </div>
        <Btn kind="solid" onClick={() => setAssignModal(true)}>+ Giao bài tập</Btn>
      </div>

      <SubmissionReviewPanel classId={cls.id} />

      {assignModal && (
        <AssignHomeworkModal
          classId={cls.id}
          className={cls.name}
          teacherName={cls.teacher}
          onClose={() => setAssignModal(false)}
          onCreated={() => setAssignModal(false)}
        />
      )}
    </div>
  )
}
