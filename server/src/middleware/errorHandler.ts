import type { NextFunction, Request, Response } from 'express'
import { serverError } from '../utils/response.js'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  serverError(res, err)
}
