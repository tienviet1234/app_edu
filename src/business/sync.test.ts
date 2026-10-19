import { describe, it, expect } from 'vitest'
import { pruneGoneFromServer, resolvePlausibleNo } from './sync'

const MONGOID_A = 'a'.repeat(24)
const MONGOID_B = 'b'.repeat(24)
const MONGOID_C = 'c'.repeat(24)
const LOCAL_ONLY = 'local-123'

describe('pruneGoneFromServer', () => {
  it('giữ nguyên bản ghi đã đồng bộ còn được server liệt kê', () => {
    const local = [{ id: MONGOID_A }, { id: MONGOID_B }]
    const result = pruneGoneFromServer(local, new Set([MONGOID_A, MONGOID_B]))
    expect(result).toEqual(local)
  })

  it('gỡ bản ghi đã đồng bộ nhưng server không còn liệt kê (VD: bị gộp/chuyển lớp)', () => {
    const local = [{ id: MONGOID_A }, { id: MONGOID_B }]
    const result = pruneGoneFromServer(local, new Set([MONGOID_A]))
    expect(result).toEqual([{ id: MONGOID_A }])
  })

  it('KHÔNG đụng bản ghi local-only (chưa đồng bộ lên server)', () => {
    const local = [{ id: LOCAL_ONLY }, { id: MONGOID_A }]
    const result = pruneGoneFromServer(local, new Set([MONGOID_A]))
    expect(result).toEqual(local)
  })

  it('server rỗng (chưa tải xong hoặc thật sự không còn gì) vẫn giữ local-only, gỡ hết bản ghi đã đồng bộ', () => {
    const local = [{ id: LOCAL_ONLY }, { id: MONGOID_A }, { id: MONGOID_B }]
    const result = pruneGoneFromServer(local, new Set())
    expect(result).toEqual([{ id: LOCAL_ONLY }])
  })

  it('không có gì để gỡ khi tất cả đã đồng bộ và server liệt kê đủ', () => {
    const local = [{ id: MONGOID_A }, { id: MONGOID_B }, { id: MONGOID_C }]
    const result = pruneGoneFromServer(local, new Set([MONGOID_A, MONGOID_B, MONGOID_C]))
    expect(result).toHaveLength(3)
  })

  it('mảng rỗng trả về mảng rỗng', () => {
    expect(pruneGoneFromServer([], new Set())).toEqual([])
  })
})

describe('resolvePlausibleNo', () => {
  it('khớp đúng 1 buổi đã có sẵn thì giữ nguyên', () => {
    expect(resolvePlausibleNo(5, [1, 2, 3, 4, 5], 12)).toBe(5)
  })

  it('cho phép buổi KẾ TIẾP chưa tạo (VD vừa chọn "Tháng 2") — bug thật đã gặp: trước đây bị validate rớt, tự nhảy về Tháng 1', () => {
    // Học sinh đang có 12 buổi (1..12), vừa chọn Tháng 2 → buổi 13 (chưa tạo)
    expect(resolvePlausibleNo(13, Array.from({ length: 12 }, (_, i) => i + 1), 12)).toBe(13)
  })

  it('cho phép buổi kế tiếp xa hơn 1 bậc nếu cả lớp đã chạm mốc đó (classWideMaxNo)', () => {
    // Em này mới có 5 buổi, nhưng cả lớp đã có bạn tới buổi 20 — chọn Tháng 2 (buổi 13) vẫn hợp lệ
    expect(resolvePlausibleNo(13, [1, 2, 3, 4, 5], 20)).toBe(13)
  })

  it('gỡ số RÁC bị kẹt từ trước (VD "1014" ở Lớp 7) — vượt xa mốc hợp lý', () => {
    expect(resolvePlausibleNo(1014, [1, 2, 3, 4, 5], 12)).toBeNull()
  })

  it('không có số lưu sẵn (chưa từng mở học sinh này) trả về null', () => {
    expect(resolvePlausibleNo(undefined, [1, 2, 3], 12)).toBeNull()
    expect(resolvePlausibleNo(null, [1, 2, 3], 12)).toBeNull()
  })

  it('số 0 hoặc âm luôn là rác dù trong mốc hợp lý', () => {
    expect(resolvePlausibleNo(0, [], 12)).toBeNull()
    expect(resolvePlausibleNo(-1, [], 12)).toBeNull()
  })

  it('học sinh chưa có buổi nào, chọn buổi 1 (kế tiếp) vẫn hợp lệ', () => {
    expect(resolvePlausibleNo(1, [], 8)).toBe(1)
  })
})
