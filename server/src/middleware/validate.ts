import type { NextFunction, Request, Response } from 'express'
import type { AnyZodObject, ZodError } from 'zod'
import { badRequest } from '../utils/response.js'
import { rejectedWriteMetadata } from '../utils/dataRules.js'
import { writeRejectedAudit } from '../services/auditService.js'

interface ValidationSchemas {
  body?: AnyZodObject
  query?: AnyZodObject
  params?: AnyZodObject
}

/** `auditAs`: đường lưu dữ liệu quan trọng — bị từ chối vì sai định dạng cũng ghi
 *  nhật ký KÈM nội dung như các lần từ chối khác. Trước đây chặn ở đây là không để
 *  lại dấu vết gì trên server, không tra được giáo viên đã nhập gì. */
export function validate(schemas: ValidationSchemas, auditAs?: { action: string; resource: string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawBody = req.body as Record<string, unknown> | undefined
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body)
      if (schemas.query) req.query = schemas.query.parse(req.query)
      if (schemas.params) req.params = schemas.params.parse(req.params)
      next()
    } catch (err) {
      const issues = flattenZodError(err)
      if (auditAs) writeRejectedAudit(req, auditAs.action, auditAs.resource, { ...rejectedWriteMetadata('VALIDATION', rawBody), issues })
      badRequest(res, 'Validation failed.', issues)
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
