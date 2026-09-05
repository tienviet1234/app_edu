import { useRef, useState } from 'react'
import { C } from '@/constants/colors'
import { Btn } from '@/components/atoms/Btn'
import { submissionService } from '@/services/submissions'
import type { Assignment } from '@/services/assignments'

interface Props {
  assignment: Assignment
  studentId: string
  onClose: () => void
  onSubmitted: () => void
}

function compressImage(file: File, maxPx = 1280, quality = 0.82): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }) : file),
        'image/webp',
        quality,
      )
    }
    img.src = url
  })
}

export function SubmitHomeworkModal({ assignment, studentId, onClose, onSubmitted }: Props) {
  const [photos, setPhotos] = useState<File[]>([])
  const [video, setVideo] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const photoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  const needPhoto = assignment.submitType === 'photo' || assignment.submitType === 'both'
  const needVideo = assignment.submitType === 'video' || assignment.submitType === 'both'

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, assignment.maxPhotos)
    const compressed = await Promise.all(files.map((f) => compressImage(f)))
    setPhotos(compressed)
    e.target.value = ''
  }

  function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    // Giới hạn 80MB
    if (f.size > 80 * 1024 * 1024) { setErr('Video quá lớn (tối đa 80MB). Vui lòng chọn video ngắn hơn.'); return }
    setVideo(f)
    setErr('')
    e.target.value = ''
  }

  async function handleSubmit() {
    if (needPhoto && photos.length === 0 && needVideo && !video) {
      setErr('Vui lòng chọn ảnh hoặc video để nộp'); return
    }
    setUploading(true); setErr(''); setProgress(0)
    try {
      await submissionService.submit({
        assignmentId: assignment._id,
        classId: assignment.classId,
        studentId,
        photos: needPhoto ? photos : [],
        video: needVideo && video ? video : undefined,
        onProgress: setProgress,
      })
      onSubmitted()
    } catch {
      setErr('Nộp bài thất bại. Vui lòng thử lại.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4" style={{ background: 'rgb(0 0 0 / 0.45)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: '#fff', boxShadow: '0 20px 48px -8px rgb(0 0 0 / 0.28)' }}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-black" style={{ color: C.ink }}>Nộp bài tập</h2>
          <button onClick={onClose} disabled={uploading} style={{ color: C.muted }}>✕</button>
        </div>
        <p className="mb-4 text-sm font-semibold" style={{ color: C.board }}>{assignment.title}</p>

        {assignment.description && (
          <p className="mb-4 text-sm rounded-xl px-3 py-2" style={{ background: C.paper, color: C.muted }}>
            {assignment.description}
          </p>
        )}

        {assignment.scriptText && (
          <div className="mb-4 rounded-xl px-3 py-2.5" style={{ background: C.board + '0e', border: `1px solid ${C.board}22` }}>
            <div className="mb-1 text-xs font-bold uppercase" style={{ color: C.board }}>Nội dung cần đọc</div>
            <p className="text-sm font-mono leading-relaxed" style={{ color: C.ink }}>{assignment.scriptText}</p>
          </div>
        )}

        {err && (
          <div className="mb-3 rounded-xl px-3 py-2 text-sm font-medium" style={{ background: C.red + '12', color: C.red }}>
            {err}
          </div>
        )}

        <div className="space-y-3">
          {needPhoto && (
            <div>
              <div className="mb-1.5 text-sm font-semibold" style={{ color: C.ink }}>
                📷 Ảnh bài tập <span style={{ color: C.muted }}>(tối đa {assignment.maxPhotos} ảnh)</span>
              </div>
              <button
                onClick={() => photoRef.current?.click()}
                disabled={uploading}
                className="w-full rounded-xl border-2 border-dashed py-4 text-sm font-semibold transition-all hover:brightness-[0.97]"
                style={{ borderColor: photos.length > 0 ? C.board2 : C.line, color: photos.length > 0 ? C.board2 : C.muted }}
              >
                {photos.length > 0 ? `✓ Đã chọn ${photos.length} ảnh` : '+ Chọn ảnh từ thư viện'}
              </button>
              <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
              {photos.length > 0 && (
                <div className="mt-2 flex gap-2 overflow-x-auto">
                  {photos.map((f, i) => (
                    <img key={i} src={URL.createObjectURL(f)} alt="" className="h-16 w-16 rounded-lg object-cover shrink-0" />
                  ))}
                </div>
              )}
            </div>
          )}

          {needVideo && (
            <div>
              <div className="mb-1.5 text-sm font-semibold" style={{ color: C.ink }}>
                🎥 Video bài nói <span style={{ color: C.muted }}>(tối đa 5 phút)</span>
              </div>
              <button
                onClick={() => videoRef.current?.click()}
                disabled={uploading}
                className="w-full rounded-xl border-2 border-dashed py-4 text-sm font-semibold transition-all hover:brightness-[0.97]"
                style={{ borderColor: video ? C.board2 : C.line, color: video ? C.board2 : C.muted }}
              >
                {video ? `✓ ${video.name} (${(video.size / 1024 / 1024).toFixed(1)} MB)` : '+ Chọn video hoặc quay mới'}
              </button>
              <input ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={handleVideoChange} />
            </div>
          )}
        </div>

        {uploading && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs" style={{ color: C.muted }}>
              <span>Đang tải lên...</span><span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: C.line }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, background: C.board2 }}
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Btn onClick={onClose} disabled={uploading} className="flex-1">Hủy</Btn>
          <button
            onClick={handleSubmit} disabled={uploading}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold transition-all disabled:opacity-60 hover:brightness-[0.93]"
            style={{ background: C.board, color: '#fff' }}
          >
            {uploading ? `Đang gửi ${progress}%` : 'Nộp bài'}
          </button>
        </div>
      </div>
    </div>
  )
}
