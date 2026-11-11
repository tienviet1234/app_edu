import { describe, it, expect } from 'vitest'
import { createActionLock } from './actionLock'

describe('createActionLock (khóa nút ghi dữ liệu, 11/11)', () => {
  it('2 lần gọi liền cùng khóa → chỉ chạy 1 lần', async () => {
    const lock = createActionLock()
    let calls = 0
    let release!: () => void
    const p1 = lock.run('n1', () => { calls++; return new Promise<void>((r) => { release = r }) })
    const p2 = await lock.run('n1', async () => { calls++ })
    expect(p2).toEqual({ skipped: true })
    release(); await p1
    expect(calls).toBe(1)
  })
  it('khóa khác nhau chạy song song; xong (kể cả lỗi) thì nhả khóa', async () => {
    const lock = createActionLock()
    await expect(lock.run('a', async () => { throw new Error('mạng') })).rejects.toThrow('mạng')
    expect(lock.has('a')).toBe(false)
    const r = await Promise.all([lock.run('a', async () => 1), lock.run('b', async () => 2)])
    expect(r).toEqual([{ skipped: false, value: 1 }, { skipped: false, value: 2 }])
  })
})
