import { useCallback, useRef, useState } from 'react'
import { createActionLock } from '@/business/actionLock'

/** Khóa nút ghi dữ liệu: `run(key, fn)` bỏ qua cú bấm thứ 2 khi lần trước chưa xong; `isBusy(key)`
 *  để hiện "đang lưu" / tắt nút. Mọi nút ghi dữ liệu MỚI dùng hook này (xem CLAUDE.md). */
export function useActionLock() {
  const lock = useRef(createActionLock()).current
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set())
  const run = useCallback(<T,>(key: string, fn: () => Promise<T>) => lock.run(key, fn, () => setBusy(lock.keys())), [lock])
  const isBusy = useCallback((key: string) => busy.has(key), [busy])
  return { run, isBusy }
}
