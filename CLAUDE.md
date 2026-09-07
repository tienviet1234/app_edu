# CLAUDE.md

Hướng dẫn nhanh cho Claude Code khi làm việc trong repo này. Xem `PROJECT_PROGRESS.md` để biết kiến trúc đầy đủ, ERD, danh sách 24 collection và phase status.

## Tổng quan

LMS cho trung tâm Anh ngữ: giáo viên chấm điểm theo rubric, phụ huynh theo dõi con, học sinh xem điểm/xếp hạng, giao & nộp bài tập (ảnh/video/quiz tự chấm).

- **Frontend** (`/`): React 19 + TypeScript + Vite + TailwindCSS v4, deploy Vercel
- **Backend** (`/server`): Express 4 + Mongoose + JWT, deploy Render (Docker), MongoDB Atlas

## Lệnh thường dùng

```bash
npm run build              # frontend — tsc -b && vite build
cd server && npm run build # backend — tsc -p tsconfig.json
cd server && npm run dev   # backend dev — tsx watch
npm run dev                # frontend dev — vite
```

Luôn build cả 2 phía sau khi sửa code trước khi báo cáo hoàn thành.

## Skill có sẵn

- **`/debug`** — dùng khi điều tra lỗi/bug. Theo quy trình PROBLEM → ROOT CAUSE → FILES INVOLVED → FIX PLAN → IMPLEMENTATION → VERIFICATION, ưu tiên kiểm tra 2 nguyên nhân phổ biến (chưa deploy, thiếu env var) trước khi tìm nguyên nhân mới.

## Giao tiếp

- Giải thích/trao đổi bằng **tiếng Việt**. Code, tên biến, tên hàm, comment (nếu cần) bằng **tiếng Anh**.
- API route đặt tên theo REST chuẩn, số nhiều, không động từ: `GET /api/assignments`, `POST /api/assignments`, `PUT /api/assignments/:id`, `DELETE /api/assignments/:id` — xem `server/src/routes/` để theo đúng pattern hiện có, không tự đặt kiểu khác.

## Quy ước code

- **Màu sắc:** luôn dùng hằng số `C` từ `src/constants/colors.ts`, không hardcode hex trong component. Đổi màu toàn app chỉ cần sửa 1 file này.
- **Atoms trước:** `Btn`, `Card`, `Chip`, `Pick`, `Stat` (`src/components/atoms/`) đã có sẵn style/shadow/hover chuẩn — dùng lại thay vì tự viết `<button>`/`<div>` mới.
- **Service layer:** mỗi domain 1 file trong `src/services/` (vd `assignments.ts`, `submissions.ts`), dùng `api` từ `src/utils/api.ts` (axios), pattern trả về: `api.get(...).then((r) => r.data.data)`.
- **Backend response:** dùng helper trong `server/src/utils/response.ts` (`ok`, `created`, `notFound`...), không tự viết `res.json()` tay.
- **Backend controller:** bọc bằng `asyncHandler` từ `server/src/utils/asyncHandler.ts`, không tự try/catch từng hàm.
- **State updates:** dùng `immer` `produce()` cho update lồng sâu (session/entries), không mutate trực tiếp store.
- **Deep clone `SessionEntry`:** `JSON.parse(JSON.stringify(e))` — an toàn vì toàn field JSON-serializable.

## Gotchas đã gặp (đừng lặp lại)

- **`paginate()` (`server/src/utils/pagination.ts`) không hỗ trợ `.populate()`.** Cần populate thì tự gọi `parsePagination()` + query tay (xem `classController.listClasses`).
- **`authorize()` chỉ nhận 1 role.** `authorize('teacher')` đã tự cho phép `admin` qua rank hierarchy — không truyền `authorize('teacher', 'admin')`.
- **Hover trên `Btn`/atoms có inline `style.background`:** Tailwind `hover:bg-slate-50` KHÔNG override được inline style. Dùng `hover:brightness-[0.93]` (CSS filter, hoạt động trên inline style).
- **Git trên Windows báo warning `LF will be replaced by CRLF`** khi `git add` — vô hại, bỏ qua.
- **Không dán API key/secret vào chat** — nếu lỡ dán (Cloudinary/R2 token...), phải xóa token cũ và tạo lại trên dashboard nhà cung cấp, không chỉ đổi trong code.

## Bảo mật — quy tắc bắt buộc

- **Mật khẩu:** bcrypt hash 1 chiều (`server/src/models/User.ts`), `select: false`. Không ai — kể cả admin — xem được mật khẩu gốc. Đừng viết code "khôi phục" mật khẩu, chỉ có reset.
- **Video bài nộp:** KHÔNG BAO GIỜ trả URL R2 trực tiếp cho client. Luôn qua `getVideoPresignedUrl()` (`server/src/services/storageService.ts`), hết hạn 1 giờ. `Submission.videoKey` phải bị loại khỏi mọi response JSON (xem cách `submissionController` destructure `{ videoKey: _vk, ...safe }` trước khi trả về).
- **Quiz — ẩn đáp án đúng:** `assignmentController.sanitizeAssignment()` phải luôn chạy cho role học sinh/phụ huynh trước khi trả `Assignment.questions`. Nếu thêm field mới vào `IQuestion`, nhớ cập nhật hàm sanitize tương ứng để không lộ đáp án.
- **Dữ liệu trẻ em:** trung tâm phục vụ học sinh cấp 1 — cân nhắc kỹ trước khi thêm bất kỳ tích hợp bên thứ 3 nào xử lý ảnh/video/audio của học sinh (đã dùng Cloudinary + Cloudflare R2, xem đánh giá rủi ro trong lịch sử trò chuyện / PROJECT_PROGRESS.md).

## Việc đang dở / tồn đọng

Xem bảng "Phase Status" trong `PROJECT_PROGRESS.md` — các phase `⏳ Pending` / `⏸️ Deferred` là việc chưa làm, không phải đã hoàn thành.
