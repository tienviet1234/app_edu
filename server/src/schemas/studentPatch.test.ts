import { describe, it, expect } from 'vitest'
import { studentPatchSchema } from './lmsSchemas.js'

describe('studentPatchSchema (PATCH /students/:id) — không âm thầm bỏ trường (11/11)', () => {
  it('giữ sessionOffset + handwritingNote (trước đây bị bỏ, "Buổi trước" không bao giờ lên server)', () => {
    expect(studentPatchSchema.parse({ sessionOffset: 9, handwritingNote: 'chữ nghiêng' })).toEqual({ sessionOffset: 9, handwritingNote: 'chữ nghiêng' })
  })
  it('từ chối số âm / số lẻ / quá lớn', () => {
    for (const v of [-1, 2.5, 5000]) expect(studentPatchSchema.safeParse({ sessionOffset: v }).success).toBe(false)
  })
})
