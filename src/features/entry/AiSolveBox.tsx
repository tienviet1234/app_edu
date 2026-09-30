import { useState } from 'react'
import { C } from '@/constants/colors'
import { aiGradingService } from '@/services/aiGrading'
import { Btn } from '@/components/atoms/Btn'

interface AiSolveBoxProps {
  /** Gọi lại khi AI giải xong — cha tự quyết định điền vào đâu (thường là ô
   *  đáp án đúng), KHÔNG tự lưu gì ở component này. */
  onSolved: (answerKey: string) => void
}

/** Nút nhỏ: đưa lên 1 ảnh ĐỀ MẪU (không phải bài học sinh), AI tự giải ra
 *  đáp án — kết quả LUÔN LÀ BẢN NHÁP, giáo viên xem lại/sửa trước khi dùng
 *  chấm cả lớp. Không tự áp dụng gì cả, chỉ trả chữ về cho cha. */
export function AiSolveBox({ onSolved }: AiSolveBoxProps) {
  const [solving, setSolving] = useState(false)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const [lowConfidence, setLowConfidence] = useState(false)

  async function pick(file: File | undefined) {
    if (!file) return
    setSolving(true)
    setError('')
    setNotes([])
    setLowConfidence(false)
    try {
      const res = await aiGradingService.solveTest(file)
      if (res.unreadable) {
        setError('AI không đọc được đề trong ảnh này — thử chụp lại rõ hơn.')
        return
      }
      onSolved(res.answerKey)
      setNotes(res.uncertainNotes)
      setLowConfidence(res.lowConfidence)
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Lỗi khi gọi AI — thử lại.'
      setError(msg)
    } finally {
      setSolving(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="cursor-pointer">
        <input
          type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden" disabled={solving}
          onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }}
        />
        <span
          className="inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-semibold"
          style={{ background: solving ? C.paper : '#EFF4FF', color: solving ? C.muted : C.board2, border: `1px solid ${C.line}`, opacity: solving ? 0.7 : 1 }}
        >
          {solving ? 'Đang giải đề...' : '🧠 Giải đề mẫu bằng AI'}
        </span>
      </label>
      <div className="text-xs" style={{ color: C.muted }}>
        Đưa lên 1 ảnh đề gốc (chưa có bài làm học sinh) — AI đọc và tự giải, điền thẳng vào ô trên. Đây là bản
        nháp, bạn cần xem lại và sửa nếu cần trước khi dùng chấm cả lớp.
      </div>
      {error && <div className="text-xs" style={{ color: C.red }}>{error}</div>}
      {lowConfidence && (
        <div className="text-xs rounded-lg px-2 py-1 inline-block" style={{ background: C.gold + '28', color: '#7A5A05' }}>
          ⚠ AI không chắc chắn hoàn toàn với đề này — xem kỹ đáp án trước khi dùng.
        </div>
      )}
      {notes.length > 0 && (
        <div className="text-xs rounded-lg px-2 py-2" style={{ background: C.paper, color: C.ink }}>
          <b>Câu AI chưa chắc chắn:</b>
          <ul className="mt-0.5 space-y-0.5">
            {notes.map((n, i) => <li key={i}>• {n}</li>)}
          </ul>
        </div>
      )}
      <Btn kind="ghost" size="sm" onClick={() => onSolved('')}>Xóa đáp án</Btn>
    </div>
  )
}
