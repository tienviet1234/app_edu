/**
 * Lõi "lịch sử thay đổi" — tách khỏi Mongoose để có test (các thao tác DB được
 * truyền vào). Quy tắc:
 *  1. TRƯỚC khi ghi: cất bản hiện tại của mọi bản ghi sắp bị đụng tới. Cất lỗi
 *     → ném lỗi → lần ghi bị hủy (không bao giờ sửa khi chưa có bản sao).
 *  2. SAU khi ghi: bản nào nội dung thật ra không đổi (VD máy đẩy lại y nguyên —
 *     37.557 lần lưu điểm/tuần, đa số không đổi gì) thì bỏ bản lịch sử đó đi
 *     cho khỏi phình. Bước này lỗi thì chỉ thừa lịch sử, không hại gì.
 */

type Doc = Record<string, unknown> & { _id?: unknown }

export interface HistoryEntry { coll: string; docId: unknown; op: string; before: Doc }

export interface HistoryDeps {
  /** Các bản ghi khớp điều kiện của lần ghi, đọc TRƯỚC khi ghi. */
  findBefore: () => Promise<Doc[]>
  /** Cất lịch sử, trả về id từng bản lịch sử (cùng thứ tự). */
  insert: (entries: HistoryEntry[]) => Promise<string[]>
  /** Đọc lại các bản ghi SAU khi ghi. */
  findAfter: (ids: unknown[]) => Promise<Doc[]>
  /** Bỏ các bản lịch sử không cần (nội dung không đổi). */
  remove: (historyIds: string[]) => Promise<void>
}

export interface Captured { items: Array<{ historyId: string; docId: unknown; before: Doc }> }

const IGNORED = new Set(['updatedAt', '__v'])

/** Dạng chuẩn để so: bỏ updatedAt/__v, thứ tự khóa không quan trọng, ObjectId/Date → chuỗi. */
function canon(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) return v.map(canon)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof (o as { toHexString?: unknown }).toHexString === 'function') return String(v)
    return Object.fromEntries(Object.keys(o).filter((k) => !IGNORED.has(k) && o[k] !== undefined).sort().map((k) => [k, canon(o[k])]))
  }
  return v
}

/** 2 bản có cùng NỘI DUNG không (bỏ qua updatedAt/__v). */
export function sameDocContent(a: Doc | undefined, b: Doc | undefined): boolean {
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b))
}

/** Bước 1 — cất bản hiện tại. Không có bản ghi nào khớp (VD tạo mới) → null. */
export async function captureBefore(coll: string, op: string, deps: HistoryDeps): Promise<Captured | null> {
  const docs = await deps.findBefore()
  if (!docs.length) return null
  const ids = await deps.insert(docs.map((d) => ({ coll, docId: d._id, op, before: d })))
  return { items: docs.map((d, i) => ({ historyId: ids[i], docId: d._id, before: d })) }
}

/** Bước 2 — bỏ lịch sử của các bản ghi không đổi nội dung. Bản ghi đã bị xóa
 *  (không đọc lại được) thì GIỮ lịch sử. Trả về số bản lịch sử đã bỏ. */
export async function pruneUnchanged(captured: Captured | null, deps: Pick<HistoryDeps, 'findAfter' | 'remove'>): Promise<number> {
  if (!captured?.items.length) return 0
  const after = await deps.findAfter(captured.items.map((x) => x.docId))
  const afterById = new Map(after.map((d) => [String(d._id), d]))
  const drop = captured.items.filter((x) => {
    const a = afterById.get(String(x.docId))
    return a !== undefined && sameDocContent(x.before, a)
  }).map((x) => x.historyId)
  if (drop.length) await deps.remove(drop)
  return drop.length
}
