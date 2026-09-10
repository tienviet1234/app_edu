import { useEffect, useState, type RefObject, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Header dùng `overflow-x-auto` để vừa màn hình điện thoại — CSS buộc
 *  overflow-y cũng bị kẹp theo (auto), nên bất kỳ dropdown nào render
 *  bằng position:absolute bên trong header đều bị cắt mất, bấm vào coi
 *  như "không có phản ứng gì". Portal ra thẳng document.body + fixed theo
 *  tọa độ thật của nút bấm để tránh bị kẹp theo ancestor. */
export function PopoverPortal({
  open,
  anchorRef,
  children,
}: {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  useEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null)
      return
    }
    const update = () => {
      const r = anchorRef.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
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
    <div className="fixed z-50" style={{ top: pos.top, right: pos.right }}>
      {children}
    </div>,
    document.body,
  )
}
