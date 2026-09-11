import { useEffect, useState, type RefObject, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Khớp với class w-80 (320px) mà các dropdown hiện dùng — chỉ dùng để TÍNH
// vị trí không bị lộ ra ngoài màn hình; nội dung thật vẫn tự giới hạn
// bằng maxWidth bên dưới nên không bao giờ tràn ra ngoài dù tính hơi lệch.
const POPUP_WIDTH = 320
const MARGIN = 8

/** Header dùng `overflow-x-auto` để vừa màn hình điện thoại — CSS buộc
 *  overflow-y cũng bị kẹp theo (auto), nên bất kỳ dropdown nào render
 *  bằng position:absolute bên trong header đều bị cắt mất, bấm vào coi
 *  như "không có phản ứng gì". Portal ra thẳng document.body + fixed theo
 *  tọa độ thật của nút bấm để tránh bị kẹp theo ancestor.
 *
 *  Định vị bằng `left` (không phải `right`) và kẹp trong khoảng
 *  [MARGIN, viewportWidth - width - MARGIN] — trên màn hình điện thoại hẹp,
 *  nút bấm thường không nằm sát mép phải, nên nếu chỉ dùng `right` offset
 *  với khung rộng cố định, mép trái của khung có thể tính ra ÂM (lộ ra
 *  ngoài bên trái, chữ bị cắt, đồng thời khiến cả trang bị kéo ngang được). */
export function PopoverPortal({
  open,
  anchorRef,
  children,
}: {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null)
      return
    }
    const update = () => {
      const r = anchorRef.current?.getBoundingClientRect()
      if (!r) return
      const maxLeft = Math.max(MARGIN, window.innerWidth - POPUP_WIDTH - MARGIN)
      const idealLeft = r.right - POPUP_WIDTH // căn mép phải khung theo mép phải nút bấm
      const left = Math.min(Math.max(MARGIN, idealLeft), maxLeft)
      setPos({ top: r.bottom + 6, left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef])

  if (!open || !pos) return null
  return createPortal(
    <div className="fixed z-50" style={{ top: pos.top, left: pos.left, maxWidth: 'calc(100vw - 16px)' }}>
      {children}
    </div>,
    document.body,
  )
}
