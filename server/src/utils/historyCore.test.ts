import { describe, it, expect } from 'vitest'
import { captureBefore, pruneUnchanged, sameDocContent, type HistoryEntry } from './historyCore.js'

const oid = (hex: string) => ({ toHexString: () => hex, toString: () => hex })

function fakeDb(docs: Array<Record<string, unknown>>) {
  const history: Array<HistoryEntry & { id: string }> = []
  let n = 0
  return {
    history,
    deps: {
      findBefore: async () => docs.map((d) => JSON.parse(JSON.stringify(d))),
      insert: async (entries: HistoryEntry[]) => entries.map((e) => { const id = `h${++n}`; history.push({ ...e, id }); return id }),
      findAfter: async (ids: unknown[]) => docs.filter((d) => ids.map(String).includes(String(d._id))),
      remove: async (ids: string[]) => { for (const id of ids) history.splice(history.findIndex((h) => h.id === id), 1) },
    },
  }
}

describe('lịch sử thay đổi — luôn cất bản cũ trước khi sửa', () => {
  it('sửa điểm (máy giữ bản cũ đẩy đè mất Mini/Nghe — sự cố 19/10) → bản trước khi đè được giữ lại', async () => {
    const doc = { _id: 's1', scores: { mini: 8, listen: 1 }, updatedAt: 't0' }
    const db = fakeDb([doc])
    const cap = await captureBefore('scores', 'findOneAndUpdate', db.deps)
    doc.scores = {} as typeof doc.scores // bị đè
    doc.updatedAt = 't1'
    expect(await pruneUnchanged(cap, db.deps)).toBe(0)
    expect(db.history).toHaveLength(1)
    expect(db.history[0].before.scores).toEqual({ mini: 8, listen: 1 })
  })

  it('máy đẩy lại y nguyên (chỉ đổi updatedAt) → bỏ bản lịch sử, không phình', async () => {
    const doc = { _id: 's1', scores: { mini: 8 }, updatedAt: 't0' }
    const db = fakeDb([doc])
    const cap = await captureBefore('scores', 'findOneAndUpdate', db.deps)
    doc.updatedAt = 't1'
    expect(await pruneUnchanged(cap, db.deps)).toBe(1)
    expect(db.history).toHaveLength(0)
  })

  it('xóa bản ghi (không đọc lại được) → GIỮ lịch sử', async () => {
    const docs = [{ _id: 'x', lessonNo: 9 }]
    const db = fakeDb(docs)
    const cap = await captureBefore('classsessions', 'deleteOne', db.deps)
    docs.length = 0
    expect(await pruneUnchanged(cap, db.deps)).toBe(0)
    expect(db.history).toHaveLength(1)
  })

  it('đổi số buổi hàng loạt → cất từng buổi, chỉ giữ buổi thật sự đổi', async () => {
    const docs = [{ _id: 'a', lessonNo: 1 }, { _id: 'b', lessonNo: 2 }]
    const db = fakeDb(docs)
    const cap = await captureBefore('classsessions', 'updateMany', db.deps)
    docs[1].lessonNo = 5
    await pruneUnchanged(cap, db.deps)
    expect(db.history.map((h) => h.docId)).toEqual(['b'])
  })

  it('tạo mới (chưa có gì để cất) → không ghi lịch sử', async () => {
    expect(await captureBefore('scores', 'findOneAndUpdate', fakeDb([]).deps)).toBeNull()
  })

  it('cất lịch sử LỖI → ném lỗi (lần ghi phải bị hủy, không sửa khi chưa có bản sao)', async () => {
    const db = fakeDb([{ _id: 's1' }])
    db.deps.insert = async () => { throw new Error('db down') }
    await expect(captureBefore('scores', 'updateOne', db.deps)).rejects.toThrow('db down')
  })
})

describe('sameDocContent', () => {
  it('bỏ qua updatedAt/__v và thứ tự khóa; ObjectId so theo chuỗi', () => {
    expect(sameDocContent({ a: 1, b: { y: 2, x: 1 }, updatedAt: 1, __v: 0, id: oid('ff') }, { b: { x: 1, y: 2 }, a: 1, updatedAt: 2, id: 'ff' })).toBe(true)
  })
  it('khác giá trị → khác', () => {
    expect(sameDocContent({ total: 66 }, { total: 75 })).toBe(false)
  })
})
