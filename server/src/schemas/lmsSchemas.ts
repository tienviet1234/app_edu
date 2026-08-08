import { z } from 'zod'
import { objectIdSchema, optionalDateSchema, requiredDateSchema } from './commonSchemas.js'

// ─── Course ───────────────────────────────────────────────────────────────────
export const courseBodySchema = z.object({
  centerId: objectIdSchema,
  name: z.string().min(2).max(160),
  code: z.string().max(40).optional(),
  description: z.string().max(2000).optional(),
  level: z.enum(['primary', 'secondary', 'high', 'adult']).optional(),
  rubricId: objectIdSchema.optional(),
  totalSessions: z.number().int().min(1).max(1000).optional(),
  sessionDuration: z.number().int().min(15).max(480).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
})

export const courseUpdateSchema = courseBodySchema.partial().omit({ centerId: true })

// ─── Class ────────────────────────────────────────────────────────────────────
const scheduleSlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM required'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM required'),
  room: z.string().max(80).optional(),
})

export const classBodySchema = z.object({
  centerId: objectIdSchema.optional(),
  branchId: objectIdSchema.optional(),
  courseId: objectIdSchema.optional(),
  name: z.string().min(2).max(160),
  academicYear: z.string().min(4).max(20).optional(),
  semester: z.string().max(40).optional(),
  teacherId: objectIdSchema.optional(),
  assistantTeacherIds: z.array(objectIdSchema).default([]),
  studentIds: z.array(objectIdSchema).default([]),
  schedule: z.array(scheduleSlotSchema).default([]),
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
  maxStudents: z.number().int().min(1).max(200).default(30),
  status: z.enum(['upcoming', 'active', 'completed', 'cancelled']).default('active'),
})

export const classUpdateSchema = classBodySchema.partial().omit({ centerId: true })

// ─── Lesson ───────────────────────────────────────────────────────────────────
export const lessonBodySchema = z.object({
  centerId: objectIdSchema.optional(),
  courseId: objectIdSchema,
  no: z.number().int().min(1),
  title: z.string().min(2).max(200),
  objectives: z.array(z.string().max(500)).default([]),
  materials: z.array(z.string().max(500)).default([]),
  duration: z.number().int().min(15).max(480).default(90),
  activities: z.string().max(5000).optional(),
  notes: z.string().max(2000).optional(),
})

export const lessonUpdateSchema = lessonBodySchema.partial().omit({ centerId: true, courseId: true })

// ─── Session ──────────────────────────────────────────────────────────────────
export const sessionBodySchema = z.object({
  centerId: objectIdSchema.optional(),
  classId: objectIdSchema,
  courseId: objectIdSchema.optional(),
  lessonId: objectIdSchema.optional(),
  title: z.string().min(1).max(160).optional(),
  lessonNo: z.number().int().min(1).optional(),
  scheduledAt: optionalDateSchema,
  durationMinutes: z.number().int().min(15).max(480).default(90),
  status: z.enum(['scheduled', 'completed', 'cancelled']).default('scheduled'),
  notes: z.string().max(2000).optional(),
})

export const sessionUpdateSchema = sessionBodySchema.partial().omit({ centerId: true, classId: true })

// ─── Attendance ───────────────────────────────────────────────────────────────
export const attendanceBodySchema = z.object({
  centerId: objectIdSchema,
  classId: objectIdSchema,
  sessionId: objectIdSchema,
  studentId: objectIdSchema,
  status: z.enum(['present', 'late', 'absent', 'excused']),
  minutesLate: z.number().int().min(0).max(480).optional(),
  note: z.string().max(1000).optional(),
})

export const attendanceUpdateSchema = attendanceBodySchema.partial().omit({ centerId: true, classId: true, sessionId: true, studentId: true })

// ─── Score ────────────────────────────────────────────────────────────────────
export const scoreBodySchema = z.object({
  centerId: objectIdSchema.optional(),
  classId: objectIdSchema,
  sessionId: objectIdSchema,
  studentId: objectIdSchema,
  rubricId: objectIdSchema.optional(),
  attendance: z.enum(['present', 'late', 'excused', 'absent']),
  scores: z.record(z.number()).default({}),
  tags: z.record(z.array(z.string())).default({}),
  ticks: z.record(z.array(z.string())).default({}),
  choice: z.record(z.string()).default({}),
  parts: z.record(z.record(z.number())).default({}),
  skip: z.record(z.boolean()).default({}),
  ev: z.record(z.unknown()).default({}),
  note: z.string().max(2000).optional(),
  total: z.number().min(0).default(0),
})

export const scoreUpdateSchema = scoreBodySchema.partial().omit({ centerId: true, classId: true, sessionId: true, studentId: true })

// ─── Rubric ───────────────────────────────────────────────────────────────────
const rubricTagSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  good: z.boolean().optional(),
  weak: z.string().max(200).optional(),
  fix: z.string().max(200).optional(),
})

const rubricErrSchema = z.object({
  id: z.string(),
  label: z.string(),
  weak: z.string(),
  fix: z.string(),
})

const rubricComponentSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  max: z.number().min(0).max(1000),
  type: z.enum(['score', 'ticks', 'choice', 'parts']),
  tags: z.array(rubricTagSchema).optional(),
  items: z.array(z.object({ id: z.string(), label: z.string(), pts: z.number() })).optional(),
  options: z.array(z.object({ id: z.string(), label: z.string(), pts: z.number(), err: rubricErrSchema.optional() })).optional(),
  parts: z.array(z.object({ id: z.string(), label: z.string(), max: z.number(), weak: z.string().optional(), fix: z.string().optional() })).optional(),
  stars: z.boolean().optional(),
  evidence: z.array(z.object({ key: z.string(), type: z.enum(['ratio', 'list', 'text', 'words']), label: z.string(), ph: z.string().optional(), unit: z.string().optional() })).optional(),
  zeroLabel: z.string().max(200).optional(),
  zeroErr: rubricErrSchema.optional(),
})

export const rubricBodySchema = z.object({
  centerId: objectIdSchema,
  name: z.string().min(2).max(160),
  description: z.string().max(2000).optional(),
  level: z.enum(['primary', 'secondary']),
  comps: z.array(rubricComponentSchema).min(1),
  attendance: z.object({
    mode: z.enum(['avg', 'deduct']),
    base: z.number().optional(),
  }),
  defaults: z.object({
    ticks: z.record(z.array(z.string())).optional(),
  }).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export const rubricUpdateSchema = rubricBodySchema.partial().omit({ centerId: true })

// ─── Report ───────────────────────────────────────────────────────────────────
export const reportBodySchema = z.object({
  centerId: objectIdSchema.optional(),
  classId: objectIdSchema,
  courseId: objectIdSchema.optional(),
  studentId: objectIdSchema,
  teacherId: objectIdSchema.optional(),
  rubricId: objectIdSchema.optional(),
  period: z.object({
    from: requiredDateSchema,
    to: requiredDateSchema,
    label: z.string().min(1).max(60),
  }),
  title: z.string().min(2).max(180),
  summary: z.string().min(1).max(5000),
  comment: z.string().max(3000).optional(),
  strengths: z.array(z.string().max(500)).default([]),
  improvements: z.array(z.string().max(500)).default([]),
  score: z.number().min(0).max(100).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
})

export const reportUpdateSchema = reportBodySchema.partial().omit({ centerId: true, classId: true, studentId: true })

// ─── Notification ─────────────────────────────────────────────────────────────
export const notificationBodySchema = z.object({
  centerId: objectIdSchema.optional(),
  recipientId: objectIdSchema,
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(2000),
  type: z.enum(['system', 'course', 'attendance', 'report', 'score', 'announcement']).optional(),
  data: z.record(z.unknown()).optional(),
})

export const broadcastBodySchema = z.object({
  classId: objectIdSchema,
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(2000),
  type: z.enum(['system', 'course', 'attendance', 'report', 'score', 'announcement']).default('announcement'),
})

// ─── Upload ───────────────────────────────────────────────────────────────────
export const uploadBodySchema = z.object({
  centerId: objectIdSchema.optional(),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().min(0),
  url: z.string().url().max(2000),
  storageKey: z.string().max(500).optional(),
  scope: z.enum(['profile', 'course', 'session', 'report', 'evidence', 'general']).optional(),
  relatedId: objectIdSchema.optional(),
})
