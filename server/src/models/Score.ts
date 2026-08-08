import { Schema, model, type Document, type Types } from 'mongoose'
import type { AttendanceStatus } from './Attendance.js'

export type { AttendanceStatus }

/**
 * Mirrors frontend SessionEntry from src/types/index.ts.
 * Mixed fields use the same key structure as the UI so data can be
 * loaded directly into UI state without transformation.
 *
 * scores  → Record<compKey, number>                 ('score' type)
 * tags    → Record<compKey, string[]>               (tag selections)
 * ticks   → Record<compKey, string[]>               (tick ids selected)
 * choice  → Record<compKey, string>                 (choice option id)
 * parts   → Record<compKey, Record<partId, number>> ('parts' type)
 * skip    → Record<compKey, boolean>
 * ev      → Record<evKey, string | {ok,total}>      (evidence values)
 */
export interface IScore extends Document {
  _id: Types.ObjectId
  sessionId: Types.ObjectId
  classId: Types.ObjectId
  centerId: Types.ObjectId
  studentId: Types.ObjectId
  rubricId: Types.ObjectId
  attendance: AttendanceStatus
  scores: Record<string, number>
  tags: Record<string, string[]>
  ticks: Record<string, string[]>
  choice: Record<string, string>
  parts: Record<string, Record<string, number>>
  skip: Record<string, boolean>
  ev: Record<string, unknown>
  note: string
  total: number
  recordedBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const scoreSchema = new Schema<IScore>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'ClassSession', required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rubricId: { type: Schema.Types.ObjectId, ref: 'Rubric', index: true },
    attendance: {
      type: String,
      enum: ['present', 'late', 'excused', 'absent'] as AttendanceStatus[],
      required: true,
    },
    scores: { type: Schema.Types.Mixed, default: {} },
    tags: { type: Schema.Types.Mixed, default: {} },
    ticks: { type: Schema.Types.Mixed, default: {} },
    choice: { type: Schema.Types.Mixed, default: {} },
    parts: { type: Schema.Types.Mixed, default: {} },
    skip: { type: Schema.Types.Mixed, default: {} },
    ev: { type: Schema.Types.Mixed, default: {} },
    note: { type: String, trim: true, maxlength: 2000, default: '' },
    total: { type: Number, required: true, min: 0, default: 0 },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true },
)

// One score record per student per session
scoreSchema.index({ sessionId: 1, studentId: 1 }, { unique: true })
// Queries: all scores for a class, or for a student across classes
scoreSchema.index({ classId: 1, studentId: 1 })
scoreSchema.index({ centerId: 1, studentId: 1, createdAt: -1 })

export const Score = model<IScore>('Score', scoreSchema)
