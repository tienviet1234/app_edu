import { Schema, model, type Document, type Types } from 'mongoose'

// ─── Sub-document interfaces (mirror src/types/index.ts RubricDef) ───────────

export interface IRubricTag {
  id: string
  label: string
  good?: boolean
  weak?: string
  fix?: string
}

export interface IRubricTickItem {
  id: string
  label: string
  pts: number
}

export interface IRubricOptionErr {
  id: string
  label: string
  weak: string
  fix: string
}

export interface IRubricOption {
  id: string
  label: string
  pts: number
  err?: IRubricOptionErr
}

export interface IRubricPart {
  id: string
  label: string
  max: number
  weak?: string
  fix?: string
}

export interface IRubricEvidence {
  key: string
  type: 'ratio' | 'list' | 'text' | 'words'
  label: string
  ph?: string
  unit?: string
}

export interface IRubricZeroErr {
  id: string
  label: string
  weak: string
  fix: string
}

export type ComponentType = 'score' | 'ticks' | 'choice' | 'parts'

export interface IRubricComponent {
  key: string
  label: string
  max: number
  type: ComponentType
  tags?: IRubricTag[]
  items?: IRubricTickItem[]
  options?: IRubricOption[]
  parts?: IRubricPart[]
  stars?: boolean
  evidence?: IRubricEvidence[]
  zeroLabel?: string
  zeroErr?: IRubricZeroErr
}

export interface IAttendanceConfig {
  mode: 'avg' | 'deduct'
  base?: number
}

// ─── Main Rubric document ─────────────────────────────────────────────────────

export interface IRubric extends Document {
  _id: Types.ObjectId
  centerId: Types.ObjectId
  name: string
  description?: string
  level: 'primary' | 'secondary'
  comps: IRubricComponent[]
  attendance: IAttendanceConfig
  defaults?: { ticks?: Record<string, string[]> }
  isDefault: boolean
  isActive: boolean
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const rubricTagSchema = new Schema<IRubricTag>(
  { id: String, label: String, good: Boolean, weak: String, fix: String },
  { _id: false },
)

const rubricTickItemSchema = new Schema<IRubricTickItem>(
  { id: { type: String, required: true }, label: { type: String, required: true }, pts: { type: Number, required: true } },
  { _id: false },
)

const rubricOptionErrSchema = new Schema<IRubricOptionErr>(
  { id: String, label: String, weak: String, fix: String },
  { _id: false },
)

const rubricOptionSchema = new Schema<IRubricOption>(
  { id: { type: String, required: true }, label: { type: String, required: true }, pts: { type: Number, required: true }, err: rubricOptionErrSchema },
  { _id: false },
)

const rubricPartSchema = new Schema<IRubricPart>(
  { id: { type: String, required: true }, label: { type: String, required: true }, max: { type: Number, required: true }, weak: String, fix: String },
  { _id: false },
)

const rubricEvidenceSchema = new Schema<IRubricEvidence>(
  { key: { type: String, required: true }, type: { type: String, enum: ['ratio', 'list', 'text', 'words'], required: true }, label: { type: String, required: true }, ph: String, unit: String },
  { _id: false },
)

const rubricZeroErrSchema = new Schema<IRubricZeroErr>(
  { id: String, label: String, weak: String, fix: String },
  { _id: false },
)

const rubricComponentSchema = new Schema<IRubricComponent>(
  {
    key: { type: String, required: true, trim: true, maxlength: 40 },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    max: { type: Number, required: true, min: 0, max: 1000 },
    type: { type: String, enum: ['score', 'ticks', 'choice', 'parts'] as ComponentType[], required: true },
    tags: [rubricTagSchema],
    items: [rubricTickItemSchema],
    options: [rubricOptionSchema],
    parts: [rubricPartSchema],
    stars: Boolean,
    evidence: [rubricEvidenceSchema],
    zeroLabel: String,
    zeroErr: rubricZeroErrSchema,
  },
  { _id: false },
)

const attendanceConfigSchema = new Schema<IAttendanceConfig>(
  { mode: { type: String, enum: ['avg', 'deduct'], required: true }, base: Number },
  { _id: false },
)

// ─── Main Rubric schema ───────────────────────────────────────────────────────

const rubricSchema = new Schema<IRubric>(
  {
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000 },
    level: { type: String, enum: ['primary', 'secondary'], required: true, index: true },
    comps: {
      type: [rubricComponentSchema],
      required: true,
      validate: [(v: IRubricComponent[]) => v.length > 0, 'At least one component is required.'],
    },
    attendance: { type: attendanceConfigSchema, required: true },
    defaults: { type: Schema.Types.Mixed },
    isDefault: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true },
)

rubricSchema.index({ centerId: 1, level: 1, isDefault: 1 })
rubricSchema.index({ name: 'text', description: 'text' })

export const Rubric = model<IRubric>('Rubric', rubricSchema)
