import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'

/** Công cụ "Gộp ngày lệch" ĐÃ GỠ (10/11/2026): gom buổi theo SỐ BUỔI giữa các em rồi dời ngày
 *  về ngày đa số — từ khi mỗi em có dãy số buổi riêng, "Buổi 9" của 2 em là 2 ngày khác nhau,
 *  chạy là dời ngày sai hàng loạt và có thể tạo 2 buổi cùng ngày. Trả 410 cho cả máy còn chạy
 *  bản app cũ. Không mở lại. */
export const sessionDateReconcileRouter = Router()

sessionDateReconcileRouter.use(authenticate)
sessionDateReconcileRouter.use(authorize('admin'))
sessionDateReconcileRouter.all('*', (_req, res) => {
  res.status(410).json({ success: false, message: 'Công cụ "Gộp ngày lệch" đã gỡ vì dời ngày sai khi mỗi em có số buổi riêng. Sửa ngày từng buổi ở Nhập điểm hoặc Thống kê buổi.' })
})
