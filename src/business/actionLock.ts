/** Khóa thao tác ghi dữ liệu theo khóa (VD id phiếu). Dùng `Set` trong ref, KHÔNG dùng state React:
 *  2 cú bấm liền trong cùng 1 lượt vẫn thấy state cũ (`saving = false`) → gửi đôi (kịch bản trình
 *  duyệt 10/11 bắt được ở hộp Sửa số buổi + Thêm buổi). Lõi thuần để test; hook ở `useActionLock`. */
export function createActionLock() {
  const held = new Set<string>()
  return {
    has: (key: string) => held.has(key),
    keys: () => new Set(held),
    /** Chạy `fn` nếu khóa đang rảnh; đang bận thì trả `{ skipped: true }`, không chạy gì. */
    async run<T>(key: string, fn: () => Promise<T>, onChange?: () => void): Promise<{ skipped: true } | { skipped: false; value: T }> {
      if (held.has(key)) return { skipped: true }
      held.add(key); onChange?.()
      try { return { skipped: false, value: await fn() } } finally { held.delete(key); onChange?.() }
    },
  }
}
