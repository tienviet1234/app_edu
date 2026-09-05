import { api } from '@/utils/api'

export interface PhotoItem {
  url: string
  publicId: string
}

export type SubmissionStatus = 'submitted' | 'reviewed'

export interface Submission {
  _id: string
  assignmentId: string
  classId: string
  studentId: string | { _id: string; name: string }
  submittedBy: string
  photos: PhotoItem[]
  status: SubmissionStatus
  teacherComment?: string
  teacherScore?: number
  reviewedAt?: string
  createdAt: string
}

export const submissionService = {
  list: (params: { assignmentId?: string; studentId?: string; classId?: string }): Promise<Submission[]> =>
    api.get('/submissions', { params }).then((r) => r.data.data),

  /** Upload ảnh + video qua multipart/form-data */
  submit: (data: {
    assignmentId: string
    classId: string
    studentId: string
    photos?: File[]
    video?: File
    onProgress?: (pct: number) => void
  }): Promise<Submission> => {
    const form = new FormData()
    form.append('assignmentId', data.assignmentId)
    form.append('classId', data.classId)
    form.append('studentId', data.studentId)
    data.photos?.forEach((f) => form.append('files', f))
    if (data.video) form.append('files', data.video)

    return api
      .post('/submissions', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (data.onProgress && e.total) {
            data.onProgress(Math.round((e.loaded / e.total) * 100))
          }
        },
        timeout: 5 * 60 * 1000, // 5 phút cho video lớn
      })
      .then((r) => r.data.data)
  },

  /** Lấy presigned URL xem video (hết hạn 1 giờ) */
  getVideoUrl: (submissionId: string): Promise<string> =>
    api.get(`/submissions/${submissionId}/video-url`).then((r) => r.data.data.url),

  /** Giáo viên duyệt bài */
  review: (id: string, data: { teacherComment?: string; teacherScore?: number }): Promise<Submission> =>
    api.put(`/submissions/${id}/review`, data).then((r) => r.data.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/submissions/${id}`).then(() => undefined),
}
