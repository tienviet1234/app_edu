import { useRef, useState } from 'react'
import { C } from '@/constants/colors'
import { aiGradingService } from '@/services/aiGrading'
import { uid } from '@/utils/uid'
import { Btn } from '@/components/atoms/Btn'

interface AiSolveBoxProps {
  /** Gọi lại mỗi khi danh sách dòng đáp án thay đổi (giải xong, sửa, xác
   *  nhận, xoá dòng...) — cha tự quyết định điền vào đâu (thường là ô đáp án
   *  đúng), KHÔNG tự lưu gì ở component này. */
  onSolved: (answerKey: string) => void
}

interface Line {
  id: string
  text: string
  uncertain: boolean
  note: string
}

function joinLines(lines: Line[]): string {
  return lines.map((l) => l.text).filter((t) => t.trim()).join('\n')
}

/** Nút nhỏ: đưa lên 1 ảnh ĐỀ MẪU (không phải bài học sinh), AI tự giải ra
 *  đáp án theo TỪNG DÒNG — mỗi dòng sửa/xác nhận/xoá được riêng, vì đây là
 *  bản NHÁP AI tự giải, giáo viên phải xem lại trước khi dùng chấm cả lớp. */
export function AiSolveBox({ onSolved }: AiSolveBoxProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [solving, setSolving] = useState(false)
  const [error, setError] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [lowConfidence, setLowConfidence] = useState(false)

  function update(next: Line[]) {
    setLines(next)
    onSolved(joinLines(next))
  }

  async function pick(file: File | undefined) {
    if (!file) return
    setSolving(true)
    setError('')
    setLines([])
    setLowConfidence(false)
    try {
      const res = await aiGradingService.solveTest(file)
      if (res.unreadable) {
        setError('AI không đọc được đề trong ảnh này — thử chụp lại rõ hơn.')
        return
      }
      const next = res.lines.map((l) => ({ id: uid(), text: l.text, uncertain: l.uncertain, note: l.note }))
      setLines(next)
      onSolved(joinLines(next))
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
      <input
        ref={fileInputRef}
        type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden" disabled={solving}
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }}
      />
      <button
        type="button"
        disabled={solving}
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-semibold"
        style={{ background: solving ? C.paper : '#EFF4FF', color: solving ? C.muted : C.board2, border: `1px solid ${C.line}`, opacity: solving ? 0.7 : 1 }}
      >
        {solving ? 'Đang giải đề...' : '🧠 Giải đề mẫu bằng AI'}
      </button>
      <div className="text-xs" style={{ color: C.muted }}>
        Đưa lên 1 ảnh đề gốc (chưa có bài làm học sinh) — AI đọc và tự giải, điền thẳng vào ô trên. Đây là bản
        nháp, mỗi dòng dưới đây đều sửa/xác nhận/xoá được trước khi dùng chấm cả lớp.
      </div>
      {error && <div className="text-xs" style={{ color: C.red }}>{error}</div>}
      {lowConfidence && (
        <div className="text-xs rounded-lg px-2 py-1 inline-block" style={{ background: C.gold + '28', color: '#7A5A05' }}>
          ⚠ AI không chắc chắn hoàn toàn với đề này — xem kỹ đáp án trước khi dùng.
        </div>
      )}
      {lines.length > 0 && (
        <div className="space-y-1 rounded-lg p-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          {lines.map((line, i) => (
            <div
              key={line.id}
              className="space-y-1 rounded-lg px-2 py-1.5"
              style={line.uncertain ? { background: C.gold + '1f', border: `1px solid ${C.gold}55` } : undefined}
            >
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={line.text}
                  onChange={(e) => {
                    const next = lines.map((l, idx) => (idx === i ? { ...l, text: e.target.value } : l))
                    update(next)
                  }}
                  className="min-w-0 flex-1 rounded-lg px-2 py-1 text-xs"
                  style={{ border: `1px solid ${C.line}`, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                />
                {line.uncertain && (
                  <button
                    type="button"
                    onClick={() => update(lines.map((l, idx) => (idx === i ? { ...l, uncertain: false } : l)))}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold"
                    style={{ background: C.board2, color: '#fff' }}
                  >
                    ✓ Xác nhận
                  </button>
                )}
                <button
                  type="button"
                  title="Xoá dòng này"
                  onClick={() => update(lines.filter((_, idx) => idx !== i))}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs"
                  style={{ color: C.muted, border: `1px solid ${C.line}` }}
                >
                  ✕
                </button>
              </div>
              {line.uncertain && line.note && (
                <div className="text-xs" style={{ color: '#7A5A05' }}>⚠ {line.note}</div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => update([...lines, { id: uid(), text: '', uncertain: false, note: '' }])}
            className="text-xs font-semibold"
            style={{ color: C.board2 }}
          >
            + Thêm dòng
          </button>
        </div>
      )}
      <Btn kind="ghost" size="sm" onClick={() => update([])}>Xóa đáp án</Btn>
    </div>
  )
}
