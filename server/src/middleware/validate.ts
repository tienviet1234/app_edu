import type { NextFunction, Request, Response } from 'express'
import type { AnyZodObject, ZodError } from 'zod'
import { badRequest } from '../utils/response.js'

interface ValidationSchemas {
  body?: AnyZodObject
  query?: AnyZodObject
  params?: AnyZodObject
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body)
      if (schemas.query) req.query = schemas.query.parse(req.query)
      if (schemas.params) req.params = schemas.params.parse(req.params)
      next()
    } catch (err) {
      badRequest(res, 'Validation failed.', flattenZodError(err))
    }
  }
}

function flattenZodError(err: unknown): Record<string, string> | undefined {
  const zodErr = err as ZodError | undefined
  if (!zodErr?.issues) return undefined

  return zodErr.issues.reduce<Record<string, string>>((acc, issue) => {
    const key = issue.path.join('.') || 'root'
    acc[key] = issue.message
    return acc
  }, {})
}
