# 🎨 UI Design Spec — LMS app_edu
> **Dành cho developer**: Đọc file này theo thứ tự, code lần lượt từng Phase.  
> **Ràng buộc**: TailwindCSS v4 · CSS thuần (không framer-motion) · Giữ atoms: `Btn, Card, Chip, Pick, Stat`

---

## 1. DESIGN TOKENS

### 1.1 Bảng màu — Giữ C hiện tại, bổ sung thêm

```ts
// src/constants/colors.ts — CẬP NHẬT ĐẦY ĐỦ
export const C = {
  // ── Giữ nguyên (không đổi) ──────────────────────────
  board:  '#1E3A8A',   // header, primary button bg
  board2: '#2563EB',   // links, focus ring, accent
  paper:  '#F1F5F9',   // page background
  card:   '#FFFFFF',   // card surface
  ink:    '#0F172A',   // primary text
  muted:  '#64748B',   // secondary text
  line:   '#E2E8F0',   // borders & dividers
  red:    '#DC2626',   // error / danger
  gold:   '#F59E0B',   // alerts, gold rank accent
  blue:   '#3B82F6',   // informational

  // ── MỚI — thêm vào cuối ─────────────────────────────
  emerald:  '#10B981',   // success, "có mặt", score ≥80
  rose:     '#F43F5E',   // điểm <60, "vắng không phép" (đậm hơn red hiện tại)
  violet:   '#7C3AED',   // badge đặc biệt, rank cao nhất
  amber:    '#D97706',   // score 65–79, "trễ" (đậm hơn gold một chút)

  // Gradient presets (dùng như string constant)
  gradHeader:  'linear-gradient(160deg, #1E3A8A 0%, #1D4ED8 100%)',
  gradGold:    'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
  gradSuccess: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',

  // Semantic scores (dùng trong EntryScreen & Dashboard)
  scoreHigh:   '#10B981',   // ≥ 80
  scoreMid:    '#D97706',   // 65–79
  scoreLow:    '#F43F5E',   // < 65
} as const

// Helper: chọn màu điểm tự động
export function scoreColor(val: number | null): string {
  if (val === null) return C.muted
  if (val >= 80) return C.scoreHigh
  if (val >= 65) return C.scoreMid
  return C.scoreLow
}
```

### 1.2 Font chữ

**Giữ nguyên Be Vietnam Pro** — không đổi font.  
Chỉ bổ sung quy tắc weight usage rõ ràng hơn:

| Trường hợp | Weight | Class Tailwind |
|-----------|--------|---------------|
| Số liệu lớn (điểm, rank, stat) | 900 `font-black` | `font-black` |
| Tiêu đề section, tên học sinh | 700 `font-bold` | `font-bold` |
| Label, nút bấm, tab | 600 `font-semibold` | `font-semibold` |
| Body text, mô tả | 500 `font-medium` | `font-medium` |
| Caption, placeholder | 400 `font-normal` | `font-normal` |

### 1.3 Border-radius — Thống nhất lại

**Giữ `rounded-xl` (12px)** làm chuẩn cho card, input, button.  
Bổ sung thêm:

| Token | Giá trị | Dùng cho |
|-------|---------|---------|
| `rounded-lg` (8px) | Giữ nguyên | Pill badge nhỏ, chip |
| `rounded-xl` (12px) | **Chuẩn chính** | Button, input, card nội dung |
| `rounded-2xl` (16px) | Giữ nguyên | Card container chính |
| `rounded-3xl` (24px) | Giữ nguyên | Modal, auth card |
| `rounded-full` | Giữ nguyên | Avatar, progress ring |

> Không bo tròn thêm so với hiện tại — giữ cảm giác "professional" không quá playful.

### 1.4 Shadow — Nâng cấp 3 cấp độ

**Cấp hiện tại của Card quá mờ.** Nâng lên rõ hơn một chút:

```css
/* Thêm vào src/index.css */

/* Level 1 — Flat card (giữ nguyên cho card phụ) */
--shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06);

/* Level 2 — Card chính (NÂNG từ hiện tại) */
--shadow-md: 0 4px 12px -2px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.06);

/* Level 3 — Card hover, modal, dropdown */
--shadow-lg: 0 12px 24px -4px rgb(0 0 0 / 0.14), 0 4px 8px -4px rgb(0 0 0 / 0.08);

/* Header shadow */
--shadow-header: 0 2px 16px 0 rgb(0 0 0 / 0.18);
```

**Thay đổi trong `Card.tsx`**: Đổi boxShadow từ `shadow-sm` hiện tại sang `--shadow-md`.

---

## 2. MOCKUP ẢNH MINH HỌA

![Dashboard Desktop](C:\Users\ASUS-PRO\.gemini\antigravity\brain\bff15e3c-e63f-4542-957a-77078c3f02f0\dashboard_redesign_1788838044189.png)
*Màn 1 — Dashboard desktop: Sidebar + StatCards + ClassCards*

![Mobile Bottom Nav](C:\Users\ASUS-PRO\.gemini\antigravity\brain\bff15e3c-e63f-4542-957a-77078c3f02f0\mobile_navigation_1788838059312.png)
*Màn 2 — Mobile: Bottom navigation bar*

![Entry Screen](C:\Users\ASUS-PRO\.gemini\antigravity\brain\bff15e3c-e63f-4542-957a-77078c3f02f0\entry_screen_redesign_1788838088579.png)
*Màn 3 — Nhập điểm: Color-coded rows + progress bar*

![Leaderboard](C:\Users\ASUS-PRO\.gemini\antigravity\brain\bff15e3c-e63f-4542-957a-77078c3f02f0\leaderboard_redesign_1788838100454.png)
*Màn 4 — Xếp hạng: Podium top 3 + trend indicator*

![Auth Login](C:\Users\ASUS-PRO\.gemini\antigravity\brain\bff15e3c-e63f-4542-957a-77078c3f02f0\auth_login_redesign_1788838128712.png)
*Màn 5 — Auth: Split layout branding + form*

---

## 3. SPEC TỪNG PHASE

---

### ⚙️ PHASE A — Design System (làm trước tiên)

#### `src/constants/colors.ts`
- **Thêm**: `emerald`, `rose`, `violet`, `amber`, 3 gradient constants, hàm `scoreColor()`
- **Không thay đổi** bất kỳ giá trị màu hiện có

#### `src/index.css`
Thêm vào sau `@layer base { ... }`:

```css
@layer base {
  /* --- CSS Custom Properties (Design Tokens) --- */
  :root {
    --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06);
    --shadow-md: 0 4px 12px -2px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.06);
    --shadow-lg: 0 12px 24px -4px rgb(0 0 0 / 0.14), 0 4px 8px -4px rgb(0 0 0 / 0.08);
    --shadow-header: 0 2px 16px 0 rgb(0 0 0 / 0.18);
    --radius-card: 1rem;      /* 16px = rounded-2xl */
    --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
    --transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
    --transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* --- Keyframe Animations --- */
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.96); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes shimmer {
    from { background-position: -200% center; }
    to   { background-position: 200% center; }
  }
  @keyframes pulseGold {
    0%, 100% { box-shadow: 0 0 0 0 rgb(245 158 11 / 0.5); }
    50%       { box-shadow: 0 0 0 6px rgb(245 158 11 / 0); }
  }
  @keyframes bounceIn {
    0%   { transform: scale(0.8); opacity: 0; }
    60%  { transform: scale(1.05); opacity: 1; }
    100% { transform: scale(1); }
  }

  /* --- Utility Classes --- */
  .animate-fade-in   { animation: fadeIn   var(--transition-base) both; }
  .animate-slide-up  { animation: slideUp  var(--transition-base) both; }
  .animate-slide-down{ animation: slideDown var(--transition-fast) both; }
  .animate-scale-in  { animation: scaleIn  var(--transition-base) both; }
  .animate-bounce-in { animation: bounceIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  .animate-pulse-gold{ animation: pulseGold 2s infinite; }

  .card-hover {
    transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  }
  .card-hover:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg) !important;
  }

  /* Skeleton shimmer */
  .skeleton {
    background: linear-gradient(90deg, #E2E8F0 25%, #F1F5F9 50%, #E2E8F0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 8px;
  }
}
```

#### `src/components/atoms/Btn.tsx` — Thêm variants, KHÔNG đổi `ghost/solid/gold`

```tsx
// Thêm variants mới — không thay thế STYLES hiện có
type BtnKind = 'solid' | 'ghost' | 'gold' | 'danger' | 'success' | 'outline-primary'
// Thêm size prop
type BtnSize = 'sm' | 'md' | 'lg'  // md = hiện tại

// Thêm vào STYLES:
danger: {
  background: '#FEF2F2',
  color: '#DC2626',
  border: '1px solid #FECACA',
  boxShadow: 'none',
},
success: {
  background: '#ECFDF5',
  color: '#059669',
  border: '1px solid #6EE7B7',
  boxShadow: 'none',
},
'outline-primary': {
  background: 'transparent',
  color: '#1E3A8A',
  border: '1px solid #1E3A8A',
  boxShadow: 'none',
},

// Thêm size mapping:
const SIZE_CLASS: Record<BtnSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',     // giữ nguyên hiện tại
  lg: 'px-4 py-2.5 text-base',
}

// Thêm loading state:
// Nếu loading={true} → render spinner inline (như SubmitBtn trong AuthLayout hiện có)
```

#### `src/components/atoms/Card.tsx` — Thêm variants

```tsx
// Thêm props: variant, hoverable, accentColor
type CardVariant = 'default' | 'elevated' | 'flat'
// default = hiện tại (shadow-md mới)
// elevated = shadow-lg + hover lift
// flat = no shadow, chỉ border

// Thêm prop hoverable?: boolean → thêm class "card-hover"
// Thêm prop accentTop?: string → border-top 3px solid [color] (dùng cho class card Dashboard)
```

#### `src/components/atoms/` — Thêm 2 atoms mới

**`Avatar.tsx`** — Avatar tròn với initials fallback:
```tsx
// Props: name: string, emoji?: string, size?: 'sm'(24px)|'md'(36px)|'lg'(48px)
// Nếu có emoji → hiển thị emoji
// Nếu không → lấy 2 chữ cái đầu tên, bg màu từ hash tên (deterministic)
// Colors bg deterministic: dùng array 6 màu pastel navy-tones
```

**`ProgressBar.tsx`** — Thanh progress dùng chung:
```tsx
// Props: value: number (0-100), color?: string, height?: number, animated?: boolean
// Thay thế các <div h-1 rounded-full> rải rác trong code hiện tại
```

---

### 📱 PHASE B — Navigation Layout

#### `src/App.tsx` — Đổi layout tổng thể

**Bố cục đổi từ:**
```
[Header + Tab bar]
[Main content]
```

**Sang:**
```
Desktop (≥640px sm breakpoint):
  [Slim topbar]
  [Sidebar dọc | Main content]

Mobile (<640px):
  [Slim topbar]
  [Main content]
  [Bottom Nav]
```

**Chi tiết Slim Topbar** (giữ nguyên màu `gradHeader`):
- Chiều cao: `h-14` (56px) thay vì chiều cao hiện tại
- Chứa: Logo EDU + tên trung tâm (ẩn trên mobile) | Class selector | Notification bell | User info
- **BỎ**: Tab bar trong header (chuyển sang Sidebar/BottomNav)

**Chi tiết Sidebar Desktop** (`sm:block hidden`):
- Width: `w-16` khi collapsed (icon only), `w-56` khi expanded
- Collapsed mặc định trên `sm–md`, expanded trên `lg`
- Toggle bằng nút `<` `>` cuối sidebar
- Active tab: pill `bg-board2/15 text-board font-bold` với border-left `3px solid #2563EB`
- Inactive: `text-muted hover:text-ink hover:bg-slate-100`
- Group sections: "Giảng dạy" / "Quản lý" / "Hệ thống"

**Chi tiết Bottom Nav Mobile** (`sm:hidden block`):
- 5 tabs quan trọng nhất (chọn theo role):
  - Teacher/Admin: `📋 Tổng quan` · `✏️ Nhập điểm` · `🏆 Xếp hạng` · `📝 Bài tập` · `☰ Thêm`
  - Student: `📊 Điểm` · `🏆 Xếp hạng` · `📚 Học tập` · `🔔 Thông báo` · `☰ Thêm`
  - Parent: `👶 Con tôi` · `📝 Bài tập` · `🔔 Thông báo` · `☰ Thêm`
- "☰ Thêm" → mở sheet drawer từ dưới lên với các tabs còn lại
- Height: `h-16` (64px) + safe-area padding
- Active: icon + label màu `#1E3A8A`, indicator bar 2px trên cùng màu `C.gold`
- Inactive: icon + label màu `C.muted`
- **Notification badge**: chấm đỏ `8px` absolute top-right icon 🔔

**`src/components/molecules/BottomNav.tsx`** [NEW]:
```tsx
// Props: tabs, activeTab, onTabChange, notifCount
// Position: fixed bottom-0 left-0 right-0
// z-index: z-40
// Background: white, border-top: 1px solid C.line
// Safe area: padding-bottom env(safe-area-inset-bottom)
```

**`src/components/molecules/Sidebar.tsx`** [NEW]:
```tsx
// Props: tabs, activeTab, onTabChange, collapsed, onToggle
// Position: sticky top-14 (below topbar), height: calc(100vh - 56px)
// Width: w-16 collapsed / w-56 expanded, transition: width 200ms ease
// Overflow: hidden (text hides when collapsed)
```

---

### 📊 PHASE C — Dashboard

#### `src/features/dashboard/DashboardScreen.tsx`

**Bố cục đổi:** Grid 2 cột card lớp → giữ nguyên, nâng cấp nội dung từng card.

**Stat tiles** (4 tiles đầu):
- Thêm icon emoji mỗi tile: `🏫` `🎓` `📅` `☁️`
- Thêm sub-text nhỏ: "tháng này", "+3 tuần qua" v.v. (static text, không cần tính toán phức tạp)
- Dùng `scoreColor()` để tô màu số tùy context
- Bổ sung `accentTop` vào Card để có border màu trên đầu: board2 cho sync=full, gold cho partial, red cho =0

**Class card header** (dải navy trên mỗi card lớp):
- **Giữ nguyên** màu `C.board`, layout hiện tại
- Chỉ đổi: dùng `gradHeader` thay cho solid `#1E3A8A`
- Thêm badge `☁` phía phải nếu synced (hiện tại đã có, giữ nguyên)

**Attendance progress bar** — thay bằng `ProgressBar` atom mới:
- Height: `h-2` (8px, to hơn `h-1` hiện tại)
- Color: `C.emerald` nếu ≥90%, `C.gold` nếu ≥70%, `C.rose` nếu <70%
- Thêm label % phía phải bar

**Actions row** — 3 nút giữ nguyên nội dung, thêm icon:
- `Nhập điểm` kind="solid" (giữ)
- `Xếp hạng` kind="ghost" → đổi thành kind="outline-primary" (NEW)
- `Báo cáo` kind="ghost" (giữ)

**Section "Cần làm hôm nay"** [NEW, thêm trước class cards]:
- Nếu `dueClasses.length > 0` → alert card hiện có (giữ nguyên, chỉ style lại màu)
- Nếu không có gì → không render section này (không thêm empty state)

---

### ✏️ PHASE D — Entry Screen

#### `src/features/entry/EntryScreen.tsx`

**Bố cục:** Giữ nguyên 2-card layout (toolbar card + student card). Nâng cấp visual từng phần.

**Progress indicator** [THÊM vào toolbar card, ngay trên student pills]:
```tsx
// Thanh tiến trình "Đã nhập X/Y học sinh"
// Dùng ProgressBar atom: height=6px, color=C.emerald, animated=true
// Text: "Đã nhập {done}/{total} · {Math.round(done/total*100)}%"
// Vị trí: giữa "Số câu" row và "Student pills" row
```

**Student pills** — Nâng cấp màu:
- Active (đang xem): `bg-board text-white` (giữ)
- Đã nhập điểm: `bg-emerald/15 text-emerald border-emerald/30` (thay từ board2/1A hiện tại)
- Chưa nhập: `bg-white text-muted border-line` (giữ)
- Group selected: `bg-emerald/20 text-emerald border-emerald` (giữ)
- Dot indicator chưa nhập: `8px` amber, giữ nguyên

**Sync status** — Cải thiện feedback:
- `saving` → `⟳ Đang lưu...` màu `C.board2` (giữ)
- `saved` → `✓ Đã lưu` màu `C.emerald` **+ animation fade-out sau 2s**
- `error` → `⚠ Lỗi` màu `C.red` (giữ)

**Student card header** — Thêm score color:
- Số tổng điểm bên phải: tô màu bằng `scoreColor(total)` thay cho `text-white` trắng hiện tại
- Khi `attendance === 'absent'` → header đổi sang `C.rose` thay navy (không phải group mode)

**Nút điều hướng** (← Trước / Học sinh tiếp theo →):
- ← Trước: kind="ghost", size="md" (giữ)
- → Tiếp theo: kind="gold" (giữ), thêm `size="lg"` để to hơn → dễ bấm trên mobile

**Không thay đổi**: toolbar select, date input, homework input, CompEditor, Pick, group mode logic.

---

### 🏆 PHASE E — Leaderboard

#### `src/features/leaderboard/LeaderboardScreen.tsx`

**Sub-tab toggle** — Nâng style:
- Active: `bg-board text-white` (giữ)
- Inactive: `bg-line text-muted` → đổi thành `bg-white text-muted border border-line` (ghost style)

**Podium Top 3** [THÊM, render trước danh sách, chỉ khi `now.length >= 3`]:
```
Layout (CSS grid 3 cột):
Col 1 (Rank 2): align-self end, height 80px, bg slate-100
Col 2 (Rank 1): align-self end, height 112px, bg gold/20, border gold
Col 3 (Rank 3): align-self end, height 64px, bg slate-100

Mỗi cột:
  - Avatar (Avatar atom, size='lg') với rank badge overlay
  - Tên học sinh (font-bold, text-sm, truncate)
  - Điểm (font-black, text-lg, scoreColor)
  - Rank icon: 🥇🥈🥉 (text-2xl, trên Avatar)
```
- Rank 1 Avatar: thêm `animate-pulse-gold` (CSS animation đã định nghĩa)
- Không thêm confetti (tránh complexity)

**Danh sách từ rank 4 trở đi**:
- Giữ nguyên logic expand/collapse hiện tại
- Thêm: màu delta `d > 0` → emerald (thay board2 hiện tại), `d < 0` → rose (thay red)
- ExpBar: giữ nguyên

**Achievement cards** ("THÀNH TÍCH NỔI BẬT"):
- Giữ nguyên layout và nội dung
- Thêm `accentTop={C.gold}` vào mỗi Card để có đường vàng trên đầu

---

### 🔐 PHASE F — Auth

#### `src/features/auth/AuthLayout.tsx`

**Layout đổi từ centered card → split layout** (chỉ trên `sm` trở lên, mobile giữ nguyên):

```
Mobile (< sm): Giữ nguyên hoàn toàn
Desktop (≥ sm):
  <div className="grid grid-cols-2 min-h-screen">
    {/* Left panel — branding */}
    <div style={{ background: gradHeader }}>
      Logo EDU + subtitle + decorative element
      (decorative: các hình tròn bán trong suốt, CSS thuần, không SVG phức tạp)
    </div>
    {/* Right panel — form */}
    <div className="flex items-center justify-center bg-white p-8">
      <div className="w-full max-w-sm">
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  </div>
```

**Left panel decorative** (pure CSS, không cần thêm file):
```css
/* Các hình tròn trang trí */
.auth-left::before {
  content: '';
  position: absolute;
  width: 300px; height: 300px;
  border-radius: 50%;
  background: rgba(255,255,255,0.05);
  top: -80px; right: -80px;
}
.auth-left::after {
  content: '';
  position: absolute;
  width: 200px; height: 200px;
  border-radius: 50%;
  background: rgba(255,255,255,0.05);
  bottom: 60px; left: -60px;
}
```

**OTP Page** (`OtpPage.tsx`) — 6 input riêng lẻ:
- Hiện tại đang dùng 1 input text → giữ nguyên (đủ dùng, không phức tạp thêm)
- Chỉ thêm style: padding lớn hơn, text-center, font-black size lớn

**Form inputs** — Thêm transition border-color:
```css
input { transition: border-color 150ms ease, box-shadow 150ms ease; }
/* Hiện tại đã có trong index.css, giữ nguyên */
```

---

## 4. ANIMATION SPEC — Số liệu cụ thể

### 4.1 Chuyển tab (setTab)

```css
/* Áp dụng vào main content wrapper trong App.tsx */
/* Wrap mỗi <Screen /> bằng div có key={activeTab} */
.tab-content {
  animation: slideUp 200ms cubic-bezier(0.4, 0, 0.2, 1) both;
}
/* Implement: <div key={activeTab} className="animate-slide-up"> */
```

| Thuộc tính | Giá trị |
|-----------|---------|
| Type | `slideUp` (y: +8px → 0, opacity: 0 → 1) |
| Duration | `200ms` |
| Easing | `cubic-bezier(0.4, 0, 0.2, 1)` (ease-out) |
| Trigger | Mỗi khi `activeTab` thay đổi → dùng `key={activeTab}` |

### 4.2 Card mount (Dashboard class cards)

```tsx
// Mỗi class card trong DashboardScreen thêm:
<Card
  key={cls.id}
  className="animate-scale-in overflow-hidden"
  style={{ animationDelay: `${i * 60}ms` }}
>
```

| Thuộc tính | Giá trị |
|-----------|---------|
| Type | `scaleIn` (scale: 0.96→1, opacity: 0→1) |
| Duration | `200ms` |
| Easing | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Stagger | `60ms` × index (cứ mỗi card sau delay thêm 60ms) |
| Max stagger | Cap tại 4 card = 240ms tổng |

### 4.3 Hover card (Dashboard class card)

```tsx
<Card hoverable> // hoverable prop mới trong Card.tsx
```

```css
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  transition: transform 150ms ease, box-shadow 150ms ease;
}
```

| Thuộc tính | Giá trị |
|-----------|---------|
| Duration | `150ms` |
| Easing | `ease` |
| Transform | `translateY(-2px)` |
| Shadow | `--shadow-lg` |

### 4.4 Leaderboard Rank 1 glow

```tsx
// Chỉ áp dụng cho card rank 1 trong Podium
<div className="animate-pulse-gold rounded-full">
  <Avatar ... />
</div>
```

```css
@keyframes pulseGold {
  0%, 100% { box-shadow: 0 0 0 0 rgb(245 158 11 / 0.5); }
  50%       { box-shadow: 0 0 0 8px rgb(245 158 11 / 0); }
}
```

| Thuộc tính | Giá trị |
|-----------|---------|
| Type | `pulseGold` (box-shadow pulse) |
| Duration | `2000ms` |
| Iteration | `infinite` |
| Áp dụng | CHỈ avatar rank 1 trong Podium |

### 4.5 Sync status toast

```tsx
// Trong EntryScreen — khi saved:
<span
  className="animate-slide-down"
  style={{ color: C.emerald }}
>
  ✓ Đã lưu
</span>
// Sau 2000ms → class="animate-fade-out" (opacity 1→0, 300ms)
// Implement bằng setTimeout + useState để toggle class
```

| Thuộc tính | Giá trị |
|-----------|---------|
| Show | `slideDown 150ms ease` |
| Auto-hide delay | `2000ms` |
| Hide | `opacity 0, 300ms ease` |

### 4.6 Bottom Nav tab switch

```css
/* Icon + label của active tab */
.bottom-nav-active {
  transition: color 150ms ease;
}
/* Không dùng transform/scale → tránh layout shift trên mobile */
```

| Thuộc tính | Giá trị |
|-----------|---------|
| Duration | `150ms` |
| Property | `color` only |
| Không làm | scale, translate (tránh jank mobile) |

### 4.7 Student pill select (EntryScreen)

```css
.student-pill {
  transition: background 100ms ease, color 100ms ease, border-color 100ms ease;
}
```

| Thuộc tính | Giá trị |
|-----------|---------|
| Duration | `100ms` (nhanh — thao tác liên tục) |
| Easing | `ease` |
| Không làm | transform (tránh layout shift khi bấm nhanh) |

### 4.8 Sidebar expand/collapse

```css
.sidebar {
  transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
/* width: 64px → 224px khi expand */
/* Label text: opacity 0→1 delay 100ms khi expand */
```

| Thuộc tính | Giá trị |
|-----------|---------|
| Duration | `200ms` |
| Easing | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Property | `width` |
| Label delay | `100ms` (chờ sidebar mở rồi mới fade text in) |

### 4.9 Progress bar fill (ProgressBar atom)

```tsx
// Khi animated=true:
<div
  style={{
    width: `${value}%`,
    transition: 'width 600ms cubic-bezier(0.4, 0, 0.2, 1)',
  }}
/>
// Trick: mount với width=0, sau 16ms (1 frame) set width=value
// → bar "chạy" từ 0 đến giá trị thực khi lần đầu render
```

| Thuộc tính | Giá trị |
|-----------|---------|
| Duration | `600ms` |
| Easing | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Trigger | Mount component (1 lần) |

---

## 5. THỨ TỰ FILE CẦN SỬA THEO PHASE

### Phase A (nền tảng — làm trước)
1. `src/constants/colors.ts` — thêm màu + scoreColor
2. `src/index.css` — thêm CSS variables + keyframes + utility classes
3. `src/components/atoms/Card.tsx` — thêm variants, shadow mới, hoverable, accentTop
4. `src/components/atoms/Btn.tsx` — thêm danger/success/outline-primary + size + loading
5. `src/components/atoms/Avatar.tsx` — [NEW]
6. `src/components/atoms/ProgressBar.tsx` — [NEW]

### Phase B (layout — làm thứ 2)
7. `src/components/molecules/BottomNav.tsx` — [NEW]
8. `src/components/molecules/Sidebar.tsx` — [NEW]
9. `src/App.tsx` — refactor layout: topbar + sidebar + bottom nav

### Phase C (dashboard)
10. `src/features/dashboard/DashboardScreen.tsx` — stat tiles + card nâng cấp

### Phase D (entry screen)
11. `src/features/entry/EntryScreen.tsx` — progress bar + pill colors + sync toast

### Phase E (leaderboard)
12. `src/features/leaderboard/LeaderboardScreen.tsx` — podium + delta colors

### Phase F (auth)
13. `src/features/auth/AuthLayout.tsx` — split layout desktop
