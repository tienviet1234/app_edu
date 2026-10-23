import type { Request } from 'express'
import { Types } from 'mongoose'
import { AuditLog } from '../models/AuditLog.js'
import type { AuthRequest } from '../middleware/auth.js'

interface AuditInput {
  action: string
  resource: string
  resourceId?: string
  metadata?: Record<string, unknown>
}

/** Ghi nhật ký 1 lần server TỪ CHỐI lưu (kèm nội dung bị từ chối — xem
 *  rejectedWriteMetadata). Việc phụ: lỗi ghi nhật ký không được làm hỏng
 *  phản hồi trả về máy giáo viên, nên nuốt lỗi ở đây. */
export function writeRejectedAudit(req: Request, action: string, resource: string, metadata: Record<string, unknown>): void {
  writeAudit(req, { action, resource, metadata }).catch((err) => console.error('writeRejectedAudit:', err))
}

export async function writeAudit(req: Request, input: AuditInput): Promise<void> {
  const authReq = req as AuthRequest

  await AuditLog.create({
    actorId: authReq.userId ? new Types.ObjectId(authReq.userId) : undefined,
    actorRole: authReq.user?.role,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ? new Types.ObjectId(input.resourceId) : undefined,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    appVersion: appVersionOf(req),
    metadata: input.metadata,
  })
}

/** Phiên bản app máy gửi kèm (header X-App-Version) — chỉ nhận chuỗi ngắn an toàn. */
export function appVersionOf(req: Request): string | undefined {
  const v = req.get('x-app-version')
  return v && /^[\w.:-]{1,40}$/.test(v) ? v : undefined
}
