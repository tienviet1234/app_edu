# PROJECT_PROGRESS.md — LMS Educational Platform

> Maintained by AI Tech Lead. Updated after every phase.
> Stack: React 19 + TypeScript + Vite + TailwindCSS v4 (frontend) · Node.js + Express 4 + MongoDB + JWT (backend)

---

## Phase Status

| Phase | Title | Status | Notes |
|-------|-------|--------|-------|
| 1 | Foundation & Refactor | ✅ Complete | Vite, TS path alias, Zustand v5, business logic |
| 2 | Authentication & Security | ✅ Complete | JWT, OTP (Brevo HTTP API), RBAC, React Router, auth pages |
| 3 | Backend Wiring | ✅ Complete | middleware, routes, app.ts, server.ts, .env |
| 4 | Database Design | ✅ Complete | 19 core collections, ERD, normalized schema |
| 5 | API Layer | ✅ Complete | REST controllers + routes for all collections |
| 6 | Frontend Integration | ✅ Complete | React Query, service layer, API sync for classes/sessions |
| 7 | Student Accounts & Score Sync | ✅ Complete | Join code, student self-enroll, score sync to MongoDB |
| 8 | Reports & Notifications | ✅ Complete | Score sync fix, report upsert to MongoDB, notification bell |
| 9 | Mobile UI + PWA | ✅ Complete | vite-plugin-pwa, manifest, service worker, mobile tabs, install prompt |
| 10 | Deployment | ✅ Complete | Vercel (frontend) + Render (backend, Docker) + MongoDB Atlas |
| 11 | Admin Class/Teacher Management | ✅ Complete | Admin CRUD lớp học, gán giáo viên, teacher-managed students synced to server |
| 12 | Fast Score Entry | ✅ Complete | Editable session question counts, group student selection cho batch entry |
| 13 | UI Redesign | ✅ Complete | Color palette, shadows, gradient header, underline nav tabs, auth pages |
| 14 | Homework: Photo/Video Submission | ✅ Complete | Assignment + Submission models, Cloudinary (ảnh) + Cloudflare R2 (video), presigned URL |
| 15 | Homework: Auto-graded Quiz | ✅ Complete | mcq/fill/truefalse/match, form builder + paste-syntax, auto grading, no teacher review needed |
| 16 | AI Auto-grading (Whisper + Claude) | ⏸️ Deferred | Đã thiết kế chi phí (~$10/tháng @120 học sinh), chưa triển khai |
| 17 | Push notification khi giao bài | ⏳ Pending | Assignment tạo xong chưa báo phụ huynh tự động |
| 18 | Quản lý bài tập đã giao (edit/delete UI) | ⏳ Pending | `assignmentService.update()` có sẵn, chưa có UI dùng |
| 19 | Auto-xóa video sau 30 ngày | ⏳ Pending | Cron job dọn R2, tránh storage phình to |

---

## Technology Stack

### Frontend (`/`)
| Tool | Version | Purpose |
|------|---------|---------|
| React | 19 | UI framework |
| TypeScript | ~5.7 | Type safety |
| Vite | 6+ | Build tool |
| TailwindCSS | v4 | Styling (`@import "tailwindcss"`) |
| Zustand | v5 | Global state (appStore + authStore) |
| React Router | v7 | Routing + protected routes |
| React Hook Form + Zod | — | Form management + validation |
| Axios | — | HTTP client + refresh-token interceptor |
| @tanstack/react-query | — | Server state (parent portal, notifications...) |
| immer | — | Immutable state updates (`produce()`) |

### Backend (`/server`)
| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Runtime |
| Express | ^4.21 | HTTP framework |
| TypeScript | ~5.7 | Type safety |
| MongoDB Atlas | 7+ | Database (`lms` db, cluster0) |
| Mongoose | ^8.9 | ODM |
| JWT | — | Access token (15m) + Refresh token (7d, httpOnly, hashed + tokenPrefix index) |
| bcryptjs | — | Password + OTP hashing |
| Zod | — | Request validation |
| Brevo HTTP API | — | Transactional email (OTP) — SMTP kept as local-dev fallback |
| web-push | — | Web Push notifications (VAPID) |
| **multer** | ^2.2 | Multipart upload handling (memory storage) |
| **cloudinary** | ^2.10 | Ảnh bài tập — nén WebP tự động, free tier 25GB |
| **@aws-sdk/client-s3** + **s3-request-presigner** | ^3 | Cloudflare R2 (S3-compatible) — video bài nói, presigned URL 1 giờ |

---

## Database Collections

### ERD — Entity Relationship Diagram

```mermaid
erDiagram
    CENTER ||--o{ BRANCH : "has"
    CENTER ||--o{ USER : "scopes"
    CENTER ||--o{ COURSE : "owns"
    CENTER ||--o{ RUBRIC : "defines"
    CENTER ||--o{ SETTINGS : "configures"

    BRANCH ||--o{ CLASS : "hosts"

    COURSE ||--o{ LESSON : "contains"
    COURSE ||--o{ CLASS : "instantiates"

    RUBRIC ||--o{ COURSE : "used by"
    RUBRIC ||--o{ SCORE : "scores with"

    CLASS ||--o{ CLASS_SESSION : "runs"
    CLASS }o--o{ USER : "enrolls students"
    CLASS }o--|| USER : "assigned teacher"
    CLASS ||--o{ ASSIGNMENT : "homework of"

    CLASS_SESSION ||--o{ ATTENDANCE : "tracks"
    CLASS_SESSION ||--o{ SCORE : "generates"
    CLASS_SESSION }o--o| LESSON : "follows"
    CLASS_SESSION ||--o{ ASSIGNMENT : "optional link"

    ASSIGNMENT ||--o{ SUBMISSION : "receives"
    SUBMISSION }|--|| USER : "submitted for (student)"

    USER ||--o| TEACHER_PROFILE : "extends"
    USER ||--o| STUDENT_PROFILE : "extends"
    USER ||--o| PARENT_PROFILE : "extends"

    STUDENT_PROFILE }o--o{ USER : "linked parents"
    PARENT_PROFILE }o--o{ USER : "linked students"

    SCORE }|--|| USER : "for student"
    ATTENDANCE }|--|| USER : "for student"
    REPORT }|--|| USER : "for student"

    CLASS ||--o{ REPORT : "period summary"

    USER ||--o{ NOTIFICATION : "receives"
    USER ||--o{ AUDIT_LOG : "actor"
    USER ||--o{ UPLOAD_ASSET : "uploads"

    CENTER {
        ObjectId _id PK
        string name
        string code UK
        string plan
        bool isActive
        object settings
    }

    BRANCH {
        ObjectId _id PK
        ObjectId centerId FK
        string name
        bool isActive
    }

    USER {
        ObjectId _id PK
        ObjectId centerId FK
        ObjectId branchId FK
        string name
        string email UK
        string role
        string phone
        bool isActive
    }

    TEACHER_PROFILE {
        ObjectId _id PK
        ObjectId userId UK_FK
        ObjectId centerId FK
        array branchIds
        array specializations
        number experience
        object rating
    }

    STUDENT_PROFILE {
        ObjectId _id PK
        ObjectId userId UK_FK
        ObjectId centerId FK
        ObjectId branchId FK
        date dateOfBirth
        string grade
        array parentIds
    }

    PARENT_PROFILE {
        ObjectId _id PK
        ObjectId userId UK_FK
        ObjectId centerId FK
        array studentIds
        string relationship
    }

    COURSE {
        ObjectId _id PK
        ObjectId centerId FK
        ObjectId rubricId FK
        string name
        string code
        string level
        number totalSessions
        string status
    }

    RUBRIC {
        ObjectId _id PK
        ObjectId centerId FK
        string name
        string level
        array comps
        object attendance
        object defaults
        bool isDefault
    }

    LESSON {
        ObjectId _id PK
        ObjectId centerId FK
        ObjectId courseId FK
        number no UK_per_course
        string title
        array objectives
        array materials
        number duration
    }

    CLASS {
        ObjectId _id PK
        ObjectId centerId FK
        ObjectId branchId FK
        ObjectId courseId FK
        ObjectId teacherId FK
        string name
        string academicYear
        array studentIds
        array schedule
        date startDate
        string status
    }

    CLASS_SESSION {
        ObjectId _id PK
        ObjectId centerId FK
        ObjectId classId FK
        ObjectId courseId FK
        ObjectId lessonId FK
        string title
        date scheduledAt
        number durationMinutes
        string status
    }

    ATTENDANCE {
        ObjectId _id PK
        ObjectId centerId FK
        ObjectId classId FK
        ObjectId sessionId FK
        ObjectId studentId FK
        string status
        number minutesLate
    }

    SCORE {
        ObjectId _id PK
        ObjectId centerId FK
        ObjectId classId FK
        ObjectId sessionId FK
        ObjectId studentId FK
        ObjectId rubricId FK
        string attendance
        Mixed scores
        Mixed tags
        Mixed ticks
        Mixed choice
        Mixed parts
        Mixed skip
        Mixed ev
        number total
    }

    REPORT {
        ObjectId _id PK
        ObjectId centerId FK
        ObjectId classId FK
        ObjectId studentId FK
        ObjectId teacherId FK
        object period
        string comment
        array strengths
        array improvements
        number score
        string status
    }

    NOTIFICATION {
        ObjectId _id PK
        ObjectId centerId FK
        ObjectId recipientId FK
        string title
        string type
        date readAt
    }

    AUDIT_LOG {
        ObjectId _id PK
        ObjectId centerId FK
        ObjectId actorId FK
        string action
        string resource
        ObjectId resourceId
    }

    UPLOAD_ASSET {
        ObjectId _id PK
        ObjectId centerId FK
        ObjectId ownerId FK
        string url
        string scope
        string mimeType
        number size
    }

    SETTINGS {
        ObjectId _id PK
        string scope
        ObjectId scopeId FK
        string key UK_per_scope
        Mixed value
    }

    ASSIGNMENT {
        ObjectId _id PK
        ObjectId classId FK
        ObjectId sessionId FK
        ObjectId createdBy FK
        string title
        date dueDate
        string submitType "photo|video|both|quiz"
        string scriptText
        number maxPhotos
        array questions "mcq|fill|truefalse|match, chỉ khi submitType=quiz"
        bool isActive
    }

    SUBMISSION {
        ObjectId _id PK
        ObjectId assignmentId FK
        ObjectId classId FK
        ObjectId studentId FK
        ObjectId submittedBy FK
        array photos "Cloudinary url+publicId"
        string videoKey "R2 object key, không trả ra client"
        array answers "quiz: {questionId,value,correct,correctText}"
        number autoScore "0-100, quiz tự chấm"
        string status "submitted|reviewed"
        string teacherComment
        number teacherScore
        date reviewedAt
    }
```

---

## Collection Summary (24 model files)

| # | Collection | Model File | Key Relationships |
|---|-----------|------------|------------------|
| 1 | users | `User.ts` | root identity; centerId, branchId |
| 2 | centers | `Center.ts` | multi-tenant root |
| 3 | branches | `Branch.ts` | centerId → Center |
| 4 | teacherprofiles | `TeacherProfile.ts` | userId → User, centerId → Center |
| 5 | studentprofiles | `StudentProfile.ts` | userId → User, parentIds → User[] |
| 6 | parentprofiles | `ParentProfile.ts` | userId → User, studentIds → User[] |
| 7 | courses | `Course.ts` | centerId → Center, rubricId → Rubric |
| 8 | rubrics | `Rubric.ts` | centerId → Center; full RubricDef format |
| 9 | lessons | `Lesson.ts` | courseId → Course; no unique per course |
| 10 | classes | `Class.ts` | centerId, branchId, courseId, teacherId, studentIds[] |
| 11 | classsessions | `ClassSession.ts` | classId → Class, lessonId → Lesson |
| 12 | attendances | `Attendance.ts` | centerId, classId, sessionId, studentId |
| 13 | scores | `Score.ts` | sessionId+studentId unique; mirrors SessionEntry |
| 14 | reports | `Report.ts` | classId+studentId+period unique; period{from,to,label} |
| 15 | notifications | `Notification.ts` | recipientId → User (fan-out on write) |
| 16 | auditlogs | `AuditLog.ts` | centerId, actorId → User; append-only |
| 17 | uploadassets | `UploadAsset.ts` | centerId, ownerId → User |
| 18 | settings | `Settings.ts` | scope+scopeId+key unique |
| 19 | refreshtokens | `RefreshToken.ts` | userId → User; TTL, hashed, `tokenPrefix` index cho O(1) lookup |
| 20 | otptokens | `OtpToken.ts` | auth support — OTP đăng ký/quên mật khẩu |
| 21 | invitetokens | `InviteToken.ts` | admin cấp mã mời cho giáo viên đăng ký |
| 22 | pushsubscriptions | `PushSubscription.ts` | userId → User; Web Push VAPID |
| 23 | **assignments** | `Assignment.ts` | classId → Class, createdBy → User; embed `questions[]` khi quiz |
| 24 | **submissions** | `Submission.ts` | assignmentId+studentId unique; ảnh (Cloudinary) / video (R2 key) / quiz answers |

---

## Normalization Decisions

| Decision | Approach | Rationale |
|----------|---------|-----------|
| Score data | Reference (separate collection) | Large, queried independently per student/session |
| Evidence | **Embedded** in Score.ev | Always read with Score; never queried alone |
| Rubric components | **Embedded** array in Rubric | Read whole rubric together; components never queried independently |
| Lesson objectives/materials | **Embedded** arrays in Lesson | Small, always read with Lesson |
| Class schedule | **Embedded** array in Class | Read with Class; at most 7 slots |
| Notifications | **Fan-out** (one doc per recipient) | Fast unread count query; no scatter-gather |
| Attendance | Separate collection | Queried independently per student, per session, per class |
| Report period | Embedded `period{from,to,label}` in Report | Always accessed together; compound unique index on classId+studentId+period.from |
| Quiz questions | **Embedded** array in Assignment | Câu hỏi luôn đọc cùng assignment; ẩn đáp án đúng (`sanitizeAssignment()`) khi trả về học sinh/phụ huynh |
| Quiz answers | **Embedded** array in Submission | Nhỏ, luôn đọc cùng submission; chấm 1 lần lúc nộp, không query riêng |
| Photo metadata | **Embedded** `{url, publicId}[]` in Submission | Cloudinary URL đã đủ dùng để hiển thị + xóa; không cần collection riêng |
| Video storage | R2 object key only, KHÔNG lưu URL trực tiếp | Bắt buộc đi qua presigned URL (hết hạn 1 giờ) — bảo mật dữ liệu trẻ em |

---

## Key Index Strategy

```
// "All sessions for a class" (teacher dashboard)
ClassSession: { classId: 1, scheduledAt: 1 }

// "A student's score for a session" (entry screen)
Score: { sessionId: 1, studentId: 1 }  // unique

// "All scores for a student in a class" (report generation)
Score: { classId: 1, studentId: 1 }

// "Unread notifications for a user" (notification bell)
Notification: { recipientId: 1, readAt: 1, createdAt: -1 }

// "All classes a teacher teaches"
Class: { centerId: 1, teacherId: 1 }

// "All classes a student is enrolled in"
Class: { centerId: 1, studentIds: 1 }

// "Attendance record per session per student" (unique constraint)
Attendance: { sessionId: 1, studentId: 1 }  // unique

// "Monthly report per student per class"
Report: { classId: 1, studentId: 1, 'period.from': 1 }  // unique

// "Refresh token O(1) lookup" (không cần bcrypt.compare toàn bộ token của user)
RefreshToken: { tokenPrefix: 1 }

// "Bài tập theo lớp, mới nhất trước"
Assignment: { classId: 1, dueDate: -1 }

// "Mỗi học sinh chỉ nộp 1 lần cho 1 bài tập" (unique constraint)
Submission: { assignmentId: 1, studentId: 1 }  // unique
```

---

## Third-party Services (chi phí ước tính @120 học sinh)

| Dịch vụ | Dùng cho | Free tier | Chi phí ước tính |
|---------|---------|-----------|-----------------|
| Cloudinary | Ảnh bài tập (nén WebP tự động) | 25GB storage | $0 |
| Cloudflare R2 | Video bài nói | 10GB storage, egress miễn phí | ~$0.05/tháng |
| Brevo | Email OTP | — | (theo gói Brevo hiện tại) |
| MongoDB Atlas | Database chính | M0 free tier | $0 |
| Render | Backend hosting (Docker) | Free tier (cold start) | $0 hoặc $7 (Starter, luôn chạy) |
| Vercel | Frontend hosting | Free tier | $0 |
| Whisper + Claude API | *(chưa triển khai — Phase 16)* | — | ~$10/tháng nếu bật |

**Bảo mật dữ liệu:** video không bao giờ trả URL trực tiếp — client phải gọi `GET /submissions/:id/video-url` để lấy presigned URL hết hạn sau 1 giờ (`server/src/services/storageService.ts`).

---

## File Map

```
app_edu/
├── src/                          # React frontend
│   ├── types/                    # index.ts (SessionEntry, RubricDef...), auth.ts, quiz.ts
│   ├── constants/                # rubrics.ts, tags.ts, ranks.ts, colors.ts
│   ├── business/                 # scoring.ts, stats.ts, ranking.ts, report.ts
│   ├── store/                    # appStore.ts, authStore.ts (Zustand v5)
│   ├── services/                 # 1 file/domain: assignments.ts, submissions.ts, classes.ts, scores.ts...
│   ├── utils/                    # api.ts (axios + refresh interceptor), quizParser.ts, format.ts, mongoid.ts
│   ├── features/
│   │   ├── auth/                 # Login/Register/Otp/ForgotPassword/ResetPassword + AuthLayout
│   │   ├── entry/                # EntryScreen (nhập điểm), HomeworkScreen, AssignHomeworkModal,
│   │   │                         # QuestionBuilder (form + paste-syntax), SubmissionReviewPanel
│   │   ├── parent/                # ParentPortalScreen, HomeworkTab, SubmitHomeworkModal, QuizPlayer
│   │   ├── admin/                # AdminLayout, UsersPage, AdminClassesPage, CoursesPage, RubricEditor...
│   │   ├── classes/, leaderboard/, report/, student/, dashboard/, learn/, notifications/, profile/
│   │   └── ...
│   ├── router/                   # AppRouter, ProtectedRoute
│   └── components/                # atoms/ (Btn, Card, Chip, Pick, Stat), molecules/ (CompEditor, EvidenceFields...)
│
└── server/src/                   # Express backend
    ├── config/                   # env.ts, db.ts
    ├── models/                   # 24 Mongoose models + index.ts barrel (xem Collection Summary)
    ├── controllers/               # 1 file/domain — assignmentController.ts, submissionController.ts,
    │                               # classController.ts, scoreController.ts, authController.ts...
    ├── services/                  # storageService.ts (Cloudinary+R2), quizGrading.ts, emailService.ts,
    │                               # pushService.ts, auditService.ts
    ├── middleware/                # auth.ts (authenticate/authorize), validate.ts, errorHandler.ts
    ├── routes/                    # 1 router/domain, mounted trong app.ts
    ├── utils/                     # jwt.ts, email.ts, response.ts, pagination.ts, asyncHandler.ts
    └── schemas/                   # Zod validation schemas
```
