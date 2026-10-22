import type { ClientSession, Model, MongooseDefaultQueryMiddleware, Query, Schema } from 'mongoose'
import { ChangeHistory } from './ChangeHistory.js'
import { captureBefore, pruneUnchanged, type Captured, type HistoryDeps } from '../utils/historyCore.js'

/** Mọi lệnh sửa/xóa qua Mongoose đều cất bản cũ vào ChangeHistory TRƯỚC khi
 *  ghi (cất lỗi → lần ghi bị hủy), sau đó bỏ bản lịch sử nếu nội dung không
 *  đổi. Gắn ở tầng model nên mọi controller/service đều đi qua — không cần nhớ
 *  gọi riêng ở từng chỗ. (Lệnh ghi thô `db.collection(...)` KHÔNG đi qua đây —
 *  code chạy thật hiện không dùng; script bảo trì phải tự sao lưu.) */
const QUERY_OPS: MongooseDefaultQueryMiddleware[] = ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany']

type Doc = Record<string, unknown> & { _id?: unknown }

function depsFor(model: Model<unknown>, coll: string, findBefore: () => Promise<Doc[]>, session: ClientSession | null): HistoryDeps {
  return {
    findBefore,
    insert: async (entries) => (await ChangeHistory.insertMany(entries, session ? { session } : {})).map((d) => String(d._id)),
    findAfter: async (ids) => (await model.find({ _id: { $in: ids } }).session(session).lean()) as unknown as Doc[],
    remove: async (ids) => { await ChangeHistory.deleteMany({ _id: { $in: ids } }).session(session) },
  }
}

export function historyPlugin(schema: Schema, opts: { coll: string }): void {
  schema.pre(QUERY_OPS, { document: false, query: true }, async function (this: Query<unknown, unknown>) {
    const session = (this.getOptions().session as ClientSession | undefined) ?? null
    const model = this.model as unknown as Model<unknown>
    const filter = this.getFilter()
    const deps = depsFor(model, opts.coll, async () => (await model.find(filter).session(session).lean()) as unknown as Doc[], session)
    const op = (this as unknown as { op?: string }).op ?? 'update'
    ;(this as unknown as { _history?: { cap: Captured | null; deps: HistoryDeps } })._history = { cap: await captureBefore(opts.coll, op, deps), deps }
  })
  schema.post(QUERY_OPS, { document: false, query: true }, async function (this: Query<unknown, unknown>) {
    const h = (this as unknown as { _history?: { cap: Captured | null; deps: HistoryDeps } })._history
    if (h?.cap) await pruneUnchanged(h.cap, h.deps).catch((err) => console.error('historyPlugin prune:', err))
  })

  // doc.save() trên bản ghi ĐÃ có (không phải tạo mới).
  schema.pre('save', async function () {
    if (this.isNew) return
    const model = this.constructor as Model<unknown>
    const session = this.$session() ?? null
    const deps = depsFor(model, opts.coll, async () => (await model.find({ _id: this._id }).session(session).lean()) as unknown as Doc[], session)
    this.$locals.history = { cap: await captureBefore(opts.coll, 'save', deps), deps }
  })
  schema.post('save', async function () {
    const h = this.$locals.history as { cap: Captured | null; deps: HistoryDeps } | undefined
    if (h?.cap) await pruneUnchanged(h.cap, h.deps).catch((err) => console.error('historyPlugin prune:', err))
    delete this.$locals.history
  })
}
