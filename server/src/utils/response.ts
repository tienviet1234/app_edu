import type { Response } from 'express'

export function ok<T>(res: Response, data: T, message?: string): void {
  res.json({ success: true, data, ...(message ? { message } : {}) })
}

export function created<T>(res: Response, data: T): void {
  res.status(201).json({ success: true, data })
}

export function badRequest(res: Response, message: string, errors?: Record<string, string>): void {
  res.status(400).json({ success: false, message, ...(errors ? { errors } : {}) })
}

export function unauthorized(res: Response, message = 'Chưa xác thực'): void {
  res.status(401).json({ success: false, message })
}

export function forbidden(res: Response, message = 'Không có quyền truy cập'): void {
  res.status(403).json({ success: false, message })
}

export function notFound(res: Response, message = 'Không tìm thấy'): void {
  res.status(404).json({ success: false, message })
}

export function serverError(res: Response, err: unknown): void {
  console.error('[Server Error]', err)
  res.status(500).json({ success: false, message: 'Lỗi máy chủ, thử lại sau.' })
}
