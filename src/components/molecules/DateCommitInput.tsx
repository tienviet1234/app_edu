import { useEffect, useRef, useState } from 'react'
import { C } from '@/constants/colors'
import { isCommittableDate } from '@/business/sessionDates'

/** Ô chọn ngày CHỈ LƯU KHI GÕ XONG (rời ô hoặc Enter; Esc = hủy).
 *
 *  Trước 10/11 các ô ngày gọi lưu ở MỖI lần đổi giá trị: gõ "24/10" bằng bàn phím đi qua
 *  05/02 → 04/02 → 04/01 → 04/10 → 02/10 → 24/10, mỗi bước là 1 lần lưu THẬT lên server
 *  (lịch sử thay đổi: ≥ 20 lần ở Lớp 1/2/3/4/5/9). Các lần gửi chạy song song — bản trung
 *  gian tới server sau bản cuối thì NGÀY SAI được giữ lại, màn hình vẫn hiện ngày đúng
 *  ("người nhập đúng mà hệ thống lưu sai"); ngày trung gian còn có thể trùng buổi khác.
 *
 *  `onCommit` trả `false` khi KHÔNG lưu (bị chặn trùng ngày / bấm Hủy) → ô trả về ngày cũ.
 *  Giá trị đang gõ đọc qua ref, không qua state: Esc gọi blur() NGAY trong cùng lượt xử lý,
 *  state chưa kịp đổi — đọc state là lưu luôn ngày đang gõ dở (bản đầu bị đúng lỗi này). */
export function DateCommitInput({ value, onCommit, className, style, title, ariaLabel }: {
  value: string
  onCommit: (date: string) => boolean | void
  className?: string
  style?: React.CSSProperties
  title?: string
  ariaLabel?: string
}) {
  const [draft, setDraftState] = useState(value)
  const draftRef = useRef(value)
  const setDraft = (v: string) => { draftRef.current = v; setDraftState(v) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(value) }, [value])
  const dirty = draft !== value

  function commit() {
    const d = draftRef.current
    if (d === value) return
    if (!isCommittableDate(d)) { setDraft(value); return }
    if (onCommit(d) === false) setDraft(value)
  }

  return (
    <span className="inline-flex flex-col">
      <input
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
          if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur() }
        }}
        title={title}
        aria-label={ariaLabel ?? title}
        data-dirty={dirty ? 'true' : undefined}
        className={className}
        style={{ ...style, ...(dirty ? { borderColor: C.amber, boxShadow: `0 0 0 2px ${C.amber}33` } : {}) }}
      />
      {dirty && <span className="mt-0.5 text-[11px] font-semibold" style={{ color: C.amber }}>Chưa lưu — bấm ra ngoài hoặc Enter (Esc để hủy)</span>}
    </span>
  )
}
