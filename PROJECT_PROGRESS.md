# PROJECT_PROGRESS.md — LMS Educational Platform

> Maintained by AI Tech Lead. Updated after every phase.  
> Stack: React 19 + TypeScript + Vite + TailwindCSS v4 (frontend) · Node.js + Express + MongoDB + JWT (backend)

---

## Phase Status

| Phase | Title | Status | Notes |
|-------|-------|--------|-------|
| 1 | Foundation & Refactor | ✅ Complete | Vite, TS path alias, Zustand v5, business logic |
| 2 | Authentication & Security | ✅ Complete | JWT, OTP, RBAC, React Router, auth pages |
| 3 | Backend Wiring | ✅ Complete | middleware, routes, app.ts, server.ts, .env |
| 4 | Database Design | ✅ Complete | 19 collections, ERD, normalized schema |
| 5 | API Layer | ✅ Complete | REST controllers + routes for all collections |
| 6 | Frontend Integration | ✅ Complete | React Query, service layer, API sync for classes/sessions |
| 7 | Student Accounts & Score Sync | ✅ Complete | Join code, student self-enroll, score sync to MongoDB |
| 8 | Reports & Notifications | ✅ Complete | Score sync fix, report upsert to MongoDB, notification bell |
| 9 | Mobile UI + PWA | ✅ Complete | vite-plugin-pwa, manifest, service worker, mobile tabs, install prompt |
| 10 | Deployment | ✅ Ready | Dockerfile, railway.json, vercel.json, cookie fix, gitignore secured |

---

## Technology Stack

### Frontend (`/`)
| Tool | Version | Purpose |
|------|---------|---------|
| React | 19 | UI framework |
| TypeScript | 6 | Type safety |
| Vite | 6 | Build tool |
| TailwindCSS | v4 | Styling (`@import "tailwindcss"`) |
| Zustand | v5 | Global state (appStore + authStore) |
| React Router | v7 | Routing + protected routes |
| React Hook Form | — | Form management |
| Zod | — | Schema validation |
| Axios | — | HTTP client + interceptors |

### Backend (`/server`)
| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Runtime |
| Express | 5 | HTTP framework |
| TypeScript | 6 | Type safety |
| MongoDB | 7+ | Database |
| Mongoose | 8 | ODM |
| JWT | — | Access token (15m) + Refresh token (7d, httpOnly) |
| bcryptjs | — | Password + OTP hashing |
| Zod | — | Request validation |
| Nodemailer | — | Email (dev: JSON transport, prod: SMTP) |

---

## Database Collections (Phase 4)

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

    CLASS_SESSION ||--o{ ATTENDANCE : "tracks"
    CLASS_SESSION ||--o{ SCORE : "generates"
    CLASS_SESSION }o--o| LESSON : "follows"

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
```

---

## Collection Summary (19 total)

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
| 19 | refreshtokens | `RefreshToken.ts` | userId → User; TTL, hashed |

*(OtpToken is collection #20 — auth support)*

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
```

---

## Phase 3 Pending (Backend Wiring)

These files need to be created to complete Phase 3:

- [ ] `server/src/middleware/authenticate.ts` — verify JWT, attach req.user
- [ ] `server/src/middleware/authorize.ts` — RBAC role guard
- [ ] `server/src/routes/auth.ts` — mount auth controller
- [ ] `server/src/app.ts` — Express app setup (cors, cookie-parser, routes)
- [ ] `server/src/server.ts` — listen + connect DB
- [ ] `server/.env` — env vars for local dev

---

## File Map

```
app_edu/
├── src/                          # React frontend
│   ├── types/index.ts            # Domain types (SessionEntry, RubricDef, etc.)
│   ├── types/auth.ts             # Auth types (UserRole, AuthUser, ROLE_RANK)
│   ├── constants/                # rubrics.ts, tags.ts, ranks.ts, colors.ts
│   ├── business/                 # scoring.ts, stats.ts, ranking.ts, report.ts
│   ├── store/                    # appStore.ts, authStore.ts (Zustand v5)
│   ├── features/                 # auth/, entry/, classes/, leaderboard/, report/, parent/, student/
│   ├── router/                   # AppRouter, ProtectedRoute, UnauthorizedPage
│   └── components/               # atoms/, molecules/
│
└── server/src/                   # Express backend
    ├── config/                   # env.ts, db.ts
    ├── models/                   # All 20 Mongoose models + index.ts barrel
    ├── controllers/              # authController.ts + feature stubs
    ├── middleware/               # (pending Phase 3)
    ├── routes/                   # (pending Phase 3)
    ├── utils/                    # jwt.ts, email.ts, response.ts, pagination.ts
    └── schemas/                  # Zod validation schemas
```
