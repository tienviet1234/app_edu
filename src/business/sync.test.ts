import { describe, it, expect } from 'vitest'
import { pruneGoneFromServer } from './sync'

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
