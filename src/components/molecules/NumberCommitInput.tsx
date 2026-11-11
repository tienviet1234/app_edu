import { useEffect, useRef, useState } from 'react'
import { C } from '@/constants/colors'

/** Ô số CHỈ LƯU KHI GÕ XONG (rời ô / Enter; Esc = hủy) — cùng lý do với `DateCommitInput`: lưu ở
 *  MỖI lần gõ thì gõ "12" gửi "1" rồi "12", 2 lần ghi thật chạy song song, bản tới sau thắng
 *  (11/11: ô "Buổi trước" ở Lớp học — giá trị này dời mốc kỳ học phí). `onCommit` trả `false`
 *  (hoặc Promise<false>: bấm Hủy / server từ chối) → ô trả về giá trị cũ. */
export function NumberCommitInput({ value, onCommit, min = 0, className, style, title, ariaLabel }: {
  value: number
  onCommit: (n: number) => boolean | void | Promise<boolean | void>
  min?: number
  className?: string
  style?: React.CSSProperties
  title?: string
  ariaLabel?: string
}) {
  const [draft, setDraftState] = useState(String(value))
  const draftRef = useRef(String(value))
  const setDraft = (v: string) => { draftRef.current = v; setDraftState(v) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(String(value)) }, [value])
  const dirty = draft !== String(value)

  async function commit() {
    const raw = draftRef.current.trim()
    const n = Number(raw)
    if (raw === '' || !Number.isInteger(n) || n < min) { setDraft(String(value)); return }
    if (n === value) { setDraft(String(value)); return }
    if ((await onCommit(n)) === false) setDraft(String(value))
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
        if (e.key === 'Escape') { setDraft(String(value)); e.currentTarget.blur() }
      }}
      title={dirty ? 'Chưa lưu — bấm ra ngoài hoặc Enter (Esc để hủy)' : title}
      aria-label={ariaLabel ?? title}
      data-dirty={dirty ? 'true' : undefined}
      className={className}
      style={{ ...style, ...(dirty ? { borderColor: C.amber, boxShadow: `0 0 0 2px ${C.amber}33` } : {}) }}
    />
  )
}
