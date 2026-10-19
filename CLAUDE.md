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
npm run test                # frontend — chạy test Vitest 1 lần (business logic, vd business/scoring.ts)
npm run test:watch          # frontend — chạy test theo dõi khi sửa code
```

Luôn build cả 2 phía sau khi sửa code trước khi báo cáo hoàn thành. Nếu sửa `src/business/` (tính điểm, xếp hạng...), chạy thêm `npm run test`.

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
- **Thêm field mới vào `ClassData`/`Session`/bất kỳ model nào khác** phải thêm đủ 3 chỗ: Mongoose schema, Zod schema (`server/src/schemas/lmsSchemas.ts`), và `src/App.tsx` (mapping đồng bộ server→local). Thiếu Zod schema thì request PATCH bị **âm thầm xóa field đó** dù model/controller đúng hết — trông như "lưu thành công" nhưng field không bao giờ tới DB (gặp với `customNotePhrases`, `compExtraItems`).
- **`Session.no` là nguồn số buổi DUY NHẤT toàn app** — không tự đánh số lại theo kỳ báo cáo/theo trang ở bất kỳ màn nào khác (đã từng làm vậy ở `sessionDetailsOf`, gây lệch số giữa Nhập điểm và Báo cáo, phải bỏ hẳn). Muốn đổi CÁCH HIỂN THỊ (VD reset về 1 mỗi tháng) thì làm ở tầng hiển thị (`sessionLabelOf`/`periodPositionOf` trong `business/tuition.ts`), không đụng vào `no` thật.
- **Đổi NHIỀU buổi cùng lúc (đổi chéo số buổi) dễ vỡ vì chốt chặn trùng `lessonNo` ở server** (`findConflictingSession`) — lưu tuần tự từng buổi sẽ bị từ chối giữa chừng vì số đích "còn chủ". Phải dọn chỗ TẠM (đẩy sang dải số lớn không ai dùng) trước rồi mới gán số thật — xem `ResequenceSessionsModal.applySafely`.
- **Tính học phí (`billingPeriodsOf`/`currentProgressOf`/`sessionsBilledOf` ở `business/tuition.ts`) luôn phải nhận `unbilledSessionsOf(student)`, KHÔNG truyền thẳng `student.sessions`.** Các hàm này chỉ đếm số lượng buổi còn lại — xóa 1 buổi lỗi/trùng nằm TRONG 1 kỳ đã thu tiền sẽ làm buổi còn sót bị đếm lại thành buổi mới, thu tiền trùng.
- **Vòng lặp lưu nhiều buổi/bản ghi liên tiếp (không có API bulk)**: chỉ cập nhật state cục bộ (optimistic) cho các mục ĐÃ lưu server thành công — không cập nhật hết cả danh sách trước khi biết kết quả, kẻo state máy này "tưởng" đã lưu trong khi server chưa ghi nhận (xem `markSent`/`ResequenceSessionsModal`).
- **Logic phức tạp có nhiều trường hợp biên (tính điểm, học phí, đánh số...) phải viết thành hàm thuần trong `src/business/*.ts` kèm test, không viết thẳng trong component** — component không có test tự động, lỗi chỉ phát hiện khi người dùng báo lại.
- **Các effect đồng bộ server→local trong `App.tsx` (học sinh, buổi học) trước đây CHỈ THÊM, không bao giờ GỠ** — máy nào đã mở 1 lớp trước khi dữ liệu đổi (VD học sinh bị gộp/chuyển lớp qua "Chuyển lớp") sẽ mãi mãi hiển thị bản ghi cũ trùng lặp, dù F5/đăng nhập tài khoản khác bao nhiêu lần, vì cache cục bộ (`localStorage`, theo từng máy) không tự biết server đã đổi. Luôn dùng `pruneGoneFromServer()` (`business/sync.ts`) để gỡ bản ghi đã đồng bộ (isMongoid) nhưng server không còn liệt kê — giữ nguyên bản ghi local-only (chưa đồng bộ). Thêm field/quan hệ mới có thể bị gộp/chuyển giữa các lớp thì nhớ áp dụng tương tự.
- **1 lớp có thể do 2 giáo viên cùng quản lý** (`Class.teacherId` = giáo viên chính, `Class.assistantTeacherIds` = giáo viên phụ, quyền ngang nhau). MỌI chỗ kiểm tra "đây có phải lớp của giáo viên này" hoặc lọc "các lớp giáo viên này dạy" PHẢI dùng `isClassTeacher()`/`teacherScopeFilter()` (`server/src/utils/classAuth.ts`) — tự so sánh thẳng `cls.teacherId === userId` sẽ khiến giáo viên phụ bị từ chối (403) hoặc không thấy lớp/dữ liệu mình đang dạy. Đã quét và sửa toàn bộ controller hiện có (class/session/score/assignment/submission/report/debt/tuitionNotice/notification/user/studentMerge) — controller MỚI thêm sau này nhớ dùng 2 hàm này, không tự viết lại.
- **`GET /sessions?classId=X` (sessionController.listSessions) từng có bug: nếu role=teacher, dòng ghi đè `filter.classId` bằng "mọi lớp giáo viên này dạy" CHẠY SAU, xóa mất filter classId cụ thể đã xin** — client tưởng chỉ nhận buổi của lớp X nhưng thực ra nhận buổi của TẤT CẢ lớp giáo viên đó dạy trộn lẫn, lộ ra khi 1 học sinh có mặt ở 2 lớp (VD đang chuyển lớp giữa kỳ). Khi thêm filter theo role ở các controller khác, luôn kiểm tra: nếu đã có 1 giá trị cụ thể từ query thì xác thực quyền trên giá trị đó, KHÔNG ghi đè bằng danh sách rộng hơn.
- **`ResequenceSessionsModal.applySafely` lưu TUẦN TỰ từng buổi 1 — lỗi mạng giữa chừng ở bước 2 (gán số thật) để lại buổi kẹt VĨNH VIỄN ở số TẠM (dải +1000, VD "Buổi 1014")** hiện thẳng ra cho học sinh/phụ huynh thấy, vì không có cơ chế tự thử lại hay cảnh báo rõ (gặp thật ở Lớp 7, 5 học sinh, kẹt nhiều tuần không ai để ý vì thông báo lỗi cũ quá mờ nhạt "lỗi N buổi — thử lại sau"). Đã vá: tự thử lại 3 lần/buổi trước khi coi là lỗi, và báo lỗi phải nêu ĐÍCH DANH ngày bị kẹt + giục thử lại NGAY. Nghi ngờ 1 học sinh bị lệch số buổi kiểu này → tra trực tiếp `ClassSession.find({studentId}).sort({scheduledAt:1})` xem có `lessonNo` bất thường (số rất lớn, nhảy cóc) không trước khi kết luận nguyên nhân khác.

## Bảo mật — quy tắc bắt buộc

- **Mật khẩu:** bcrypt hash 1 chiều (`server/src/models/User.ts`), `select: false`. Không ai — kể cả admin — xem được mật khẩu gốc. Đừng viết code "khôi phục" mật khẩu, chỉ có reset.
- **Video bài nộp:** KHÔNG BAO GIỜ trả URL R2 trực tiếp cho client. Luôn qua `getVideoPresignedUrl()` (`server/src/services/storageService.ts`), hết hạn 1 giờ. `Submission.videoKey` phải bị loại khỏi mọi response JSON (xem cách `submissionController` destructure `{ videoKey: _vk, ...safe }` trước khi trả về).
- **Quiz — ẩn đáp án đúng:** `assignmentController.sanitizeAssignment()` phải luôn chạy cho role học sinh/phụ huynh trước khi trả `Assignment.questions`. Nếu thêm field mới vào `IQuestion`, nhớ cập nhật hàm sanitize tương ứng để không lộ đáp án.
- **Dữ liệu trẻ em:** trung tâm phục vụ học sinh cấp 1 — cân nhắc kỹ trước khi thêm bất kỳ tích hợp bên thứ 3 nào xử lý ảnh/video/audio của học sinh (đã dùng Cloudinary + Cloudflare R2, xem đánh giá rủi ro trong lịch sử trò chuyện / PROJECT_PROGRESS.md).

## Việc đang dở / tồn đọng

Xem bảng "Phase Status" trong `PROJECT_PROGRESS.md` — các phase `⏳ Pending` / `⏸️ Deferred` là việc chưa làm, không phải đã hoàn thành.
