import { z } from 'zod'

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.')

export const idParamsSchema = z.object({
  id: objectIdSchema,
})

export const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  q: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
}).passthrough()

export const optionalDateSchema = z.preprocess(
  (value) => (value ? new Date(String(value)) : undefined),
  z.date().optional(),
)

export const requiredDateSchema = z.preprocess(
  (value) => new Date(String(value)),
  z.date(),
)
