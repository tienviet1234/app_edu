---
description: Dùng khi gặp lỗi/bug trong app_edu (LMS) cần điều tra và sửa có hệ thống — không đoán mò, không sửa nhiều file cùng lúc hy vọng hết lỗi.
---

# Debug — quy trình điều tra lỗi có hệ thống

Đọc `CLAUDE.md` trước nếu chưa có trong context (quy ước code, gotchas đã biết, quy tắc bảo mật).

Khi người dùng báo lỗi, luôn theo đúng thứ tự sau — không nhảy thẳng vào sửa code trước khi xác định rõ nguyên nhân gốc.

## 1. PROBLEM
Mô tả lại lỗi bằng 1-2 câu: hiện tượng gì, xảy ra khi nào, có tái hiện được không. Nếu người dùng đưa ảnh/log, đọc kỹ trước khi kết luận.

## 2. ROOT CAUSE
- Không đoán. Đọc trực tiếp file liên quan (Read/Grep) trước khi kết luận nguyên nhân.
- Kiểm tra 2 khả năng phổ biến nhất trong dự án này trước:
  - **Chưa deploy** — code đúng ở local nhưng Vercel/Render chưa build lại (luôn hỏi "đã push chưa" nếu là lỗi UI/behavior không xuất hiện)
  - **Env var thiếu** — đặc biệt `CLOUDINARY_*`, `R2_*` khi lỗi liên quan upload ảnh/video
- Xem qua các gotcha đã biết trong `CLAUDE.md` trước khi tìm nguyên nhân mới (paginate() không populate, authorize() 1 role, hover cần brightness filter...)
- Giải thích ngắn gọn TẠI SAO lỗi xảy ra, không chỉ MÔ TẢ lỗi.

## 3. FILES INVOLVED
Liệt kê chính xác file sẽ cần sửa, dựa trên bước 2 — không liệt kê file "có thể liên quan" chung chung.

## 4. FIX PLAN
Nêu ngắn gọn cách sửa **tối thiểu** — sửa đúng chỗ gây lỗi, không refactor kèm theo, không sửa file không liên quan.

## 5. IMPLEMENTATION
Áp dụng fix. Nếu sửa backend model/controller, nhớ chạy `cd server && npm run build` ngay sau đó. Nếu sửa frontend, chạy `npm run build` ở root.

## 6. VERIFICATION
- Build phải sạch lỗi TypeScript (bắt buộc, không bỏ qua)
- Nêu rõ cách người dùng tự kiểm tra lại trên app (bước cụ thể, không nói chung chung "thử lại xem")
- Nếu fix có khả năng ảnh hưởng tính năng khác (VD: sửa `sanitizeAssignment()` ảnh hưởng cả quiz), nêu rõ để người dùng test thêm

## Khi không chắc chắn
Nếu đọc code xong vẫn không rõ nguyên nhân, nói thẳng "chưa xác định được nguyên nhân, cần thêm thông tin: [cụ thể cần gì]" — không tự ý sửa nhiều nơi để "thử xem có hết lỗi không".
