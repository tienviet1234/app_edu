export type HealthLevel = 'ok' | 'warn' | 'bad'
export interface HealthItem { key: string; level: HealthLevel; title: string; detail: string; lines?: string[] }

export interface HealthInput {
  now: number
  /** null = chưa đọc được kho sao lưu (khác với chưa có bản nào). */
  latestBackupAt: number | null | undefined
  backupCount: number | null
  usedBytes: number
  limitBytes: number
  devices: Array<{ label: string; unsent: number; lastSeenAt: number }>
  rejected: Array<{ code: string; count: number }>
  clicksWithoutSession: Array<{ date: string; className: string; studentName: string }>
  sameDatePairs: string[]
  futureSessions: string[]
  scoresWithoutSession: number
  scoresOnDeletedSession: number
  stuckNumbers: number
  snapshotFailures: number
  suspectInherited: string[]
  /** Lệch dấu "đã thu" CÓ rủi ro tiền: sẽ thu lại buổi đã đóng / buổi bị ẩn (billedMismatchKind). */
  billedMismatches: string[]
  /** Đóng nhiều buổi hơn số buổi học trong lớp, không còn buổi để thu lại (chuyển lớp). */
  billedOverpaid?: string[]
  /** Phiếu mà điểm danh các buổi trong phiếu bị sửa SAU khi gửi (noticeAttendanceDrift). */
  attendanceDrift?: string[]
  /** Ngày chỉ ≤ 25% số em có buổi trong 30 ngày gần nhất (lonelyClassDays). */
  lonelyDays?: string[]
  /** Học sinh không còn trong danh sách lớp mà còn buổi chưa thu (biến khỏi màn học phí). */
  leftWithUnbilled?: string[]
  /** Em có số buổi không đúng 1..n trong 1 lớp (trống / trùng / nhảy số) — 10/11. */
  numberingBroken?: string[]
}

export interface SessionForCheck { className: string; studentName: string; date: string; notes?: string; maxes?: Record<string, number> | null }

/** Buổi có bài tập/số câu nghi lấy nhầm từ NGÀY KHÁC: khác hẳn phần lớn cả lớp hôm
 *  đó, mà lại trùng y phần lớn cả lớp của 1 ngày khác. Trước 05/11 buổi mới thừa
 *  hưởng theo số buổi nên dính kiểu này; số câu sai còn làm lệch điểm. Chỉ là nghi
 *  vấn để giáo viên đối chiếu, không tự sửa: có em làm bài riêng thật. */
export function suspectInherited(sessions: SessionForCheck[]): string[] {
  const out: string[] = []
  const classes = new Map<string, SessionForCheck[]>()
  for (const s of sessions) classes.set(s.className, [...(classes.get(s.className) ?? []), s])
  const fields: Array<[string, (s: SessionForCheck) => string]> = [
    ['bài tập', (s) => (s.notes ?? '').trim()],
    ['số câu', (s) => (s.maxes && Object.keys(s.maxes).length ? JSON.stringify(s.maxes) : '')],
  ]
  for (const [className, list] of classes) {
    const days = new Map<string, SessionForCheck[]>()
    for (const s of list) days.set(s.date, [...(days.get(s.date) ?? []), s])
    for (const [label, get] of fields) {
      const common = new Map<string, [string, number]>()
      for (const [d, group] of days) {
        const n = new Map<string, number>()
        for (const s of group) { const v = get(s); if (v) n.set(v, (n.get(v) ?? 0) + 1) }
        const top = [...n].sort((a, b) => b[1] - a[1])[0]
        if (top && top[1] >= 2) common.set(d, top)
      }
      for (const [d, group] of days) {
        const mine = common.get(d)
        if (!mine) continue
        for (const s of group) {
          const v = get(s)
          if (!v || v === mine[0]) continue
          const other = [...common].find(([od, t]) => od !== d && t[0] === v)
          if (other) out.push(`${className} · ${s.studentName} · ${d}: ${label} giống ngày ${other[0]}, khác cả lớp hôm đó`)
        }
      }
    }
  }
  return out
}

/** Nội dung thông báo buổi sáng cho admin: CHỈ khi có mục "cần xử lý ngay". Mục
 *  "cần xem" không gửi, để chuông không thành tiếng ồn rồi bị bỏ qua. */
export function morningAlertFrom(health: { items: HealthItem[] }): { title: string; body: string } | null {
  const bad = health.items.filter((i) => i.level === 'bad')
  if (!bad.length) return null
  const body = `${bad.map((i) => `${i.title}: ${i.detail}`).join('\n')}\nXem ở Sao lưu → Sức khỏe dữ liệu.`
  return { title: '🚨 Dữ liệu cần xử lý ngay', body: body.slice(0, 2000) }
}

const HOUR = 3600e3
const worst = (levels: HealthLevel[]): HealthLevel => (levels.includes('bad') ? 'bad' : levels.includes('warn') ? 'warn' : 'ok')
const viTime = (t: number) => new Date(t + 7 * HOUR).toISOString().slice(0, 16).replace('T', ' ')

/** Tổng hợp các lớp bảo vệ dữ liệu thành danh sách đọc được. Admin tự mở khi cần
 *  (không hiện thanh cảnh báo lúc mở app — admin đã yêu cầu gỡ). Mỗi mục trả lời 1
 *  câu: lớp này còn hoạt động không, có gì cần xem không. */
export function summarizeDataHealth(i: HealthInput): { level: HealthLevel; items: HealthItem[] } {
  const items: HealthItem[] = []

  if (i.latestBackupAt === undefined) {
    items.push({ key: 'backup', level: 'warn', title: 'Sao lưu database', detail: 'Chưa đọc được kho sao lưu, không kết luận được.' })
  } else if (i.latestBackupAt === null) {
    items.push({ key: 'backup', level: 'bad', title: 'Sao lưu database', detail: 'Chưa có bản sao lưu nào.' })
  } else {
    const hours = (i.now - i.latestBackupAt) / HOUR
    items.push({
      key: 'backup', level: hours > 36 ? 'bad' : 'ok', title: 'Sao lưu database',
      detail: `Bản mới nhất ${viTime(i.latestBackupAt)}, cách đây ${Math.round(hours)} giờ${i.backupCount != null ? ` · đang giữ ${i.backupCount} bản` : ''}${hours > 36 ? '. Quá 36 giờ, lịch tự động có thể không chạy.' : ''}`,
    })
  }

  const pct = i.limitBytes ? (i.usedBytes / i.limitBytes) * 100 : 0
  items.push({
    key: 'capacity', level: pct >= 85 ? 'bad' : pct >= 65 ? 'warn' : 'ok', title: 'Dung lượng database',
    detail: `Đã dùng ${Math.round(i.usedBytes / 1048576)} MB / ${Math.round(i.limitBytes / 1048576)} MB (${Math.round(pct)}%)${pct >= 65 ? '. Đầy thì mọi lần lưu đều hỏng, cần dọn nhật ký hoặc nâng gói.' : ''}`,
  })

  const stale = i.devices.filter((d) => d.unsent > 0 && i.now - d.lastSeenAt > 24 * HOUR)
  const recent = i.devices.filter((d) => d.unsent > 0 && i.now - d.lastSeenAt <= 24 * HOUR)
  items.push({
    key: 'devices', level: stale.length ? 'warn' : 'ok', title: 'Dữ liệu còn nằm trên máy',
    detail: stale.length ? `${stale.length} máy có buổi chưa gửi và hơn 1 ngày chưa mở app.` : recent.length ? `${recent.length} máy vừa dùng còn buổi chưa gửi, thường tự gửi tiếp.` : 'Không máy nào còn buổi chưa gửi.',
    lines: [...stale, ...recent].map((d) => `${d.label}: ${d.unsent} buổi, gần nhất ${viTime(d.lastSeenAt)}`),
  })

  const missing = new Map<string, string[]>()
  for (const c of i.clicksWithoutSession) { const k = `${c.date} ${c.className}`; missing.set(k, [...(missing.get(k) ?? []), c.studentName]) }
  items.push({
    key: 'clicks', level: missing.size ? 'warn' : 'ok', title: 'Bấm chuyển em mà không có buổi (14 ngày)',
    detail: missing.size ? `${i.clicksWithoutSession.length} em ở ${missing.size} lượt: có thể tưởng đã điểm danh.` : 'Không có.',
    lines: [...missing].map(([k, names]) => `${k}: ${names.join(', ')}`),
  })

  const rejectedTotal = i.rejected.reduce((n, r) => n + r.count, 0)
  items.push({
    key: 'rejected', level: i.rejected.some((r) => r.code === 'VALIDATION' || r.code === 'SESSION_DELETED') ? 'warn' : 'ok', title: 'Lần lưu bị server từ chối (7 ngày)',
    detail: rejectedTotal ? `${rejectedTotal} lần, nội dung còn trong nhật ký: ${i.rejected.map((r) => `${r.code} × ${r.count}`).join(', ')}` : 'Không có.',
  })

  const broken = i.scoresWithoutSession + i.scoresOnDeletedSession + i.stuckNumbers
  items.push({
    key: 'integrity', level: i.scoresWithoutSession || i.stuckNumbers ? 'bad' : 'ok', title: 'Toàn vẹn dữ liệu',
    detail: broken ? `${i.scoresWithoutSession} điểm không có buổi · ${i.scoresOnDeletedSession} điểm thuộc buổi đã xóa · ${i.stuckNumbers} buổi kẹt số tạm` : 'Không có điểm mồ côi, không có buổi kẹt số tạm.',
  })

  items.push({
    key: 'dates', level: i.sameDatePairs.length || i.futureSessions.length ? 'warn' : 'ok', title: 'Ngày học bất thường',
    detail: i.sameDatePairs.length || i.futureSessions.length ? `${i.sameDatePairs.length} ngày có 2 buổi cùng 1 em · ${i.futureSessions.length} buổi ngày tương lai` : 'Không có.',
    lines: [...i.sameDatePairs, ...i.futureSessions],
  })

  // Ảnh hưởng TIỀN thật (thu lại buổi đã đóng / buổi bị ẩn không bao giờ thu) → cần
  // xử lý ngay, chuông sáng báo (từ 09/11; trước đó chỉ "cần xem" nên sự cố 08/11 do
  // giáo viên phát hiện). Đóng dư do chuyển lớp, không còn buổi để thu lại → chỉ xem.
  items.push({
    key: 'billed', level: i.billedMismatches.length ? 'bad' : 'ok', title: 'Phiếu học phí lệch dấu "đã thu"',
    detail: i.billedMismatches.length ? `${i.billedMismatches.length} em: buổi đã đóng tiền sẽ bị tính lại kỳ sau, hoặc có buổi bị ẩn không bao giờ được thu.` : 'Không có.',
    lines: i.billedMismatches,
  })
  if (i.billedOverpaid?.length) {
    items.push({
      key: 'billedOverpaid', level: 'warn', title: 'Đóng nhiều buổi hơn số buổi học trong lớp',
      detail: `${i.billedOverpaid.length} em (thường do chuyển lớp/nghỉ ngang). Không còn buổi nào để thu lại; xem có cần trừ sang lớp mới không.`,
      lines: i.billedOverpaid,
    })
  }
  items.push({
    key: 'attendanceDrift', level: i.attendanceDrift?.length ? 'bad' : 'ok', title: 'Điểm danh bị sửa sau khi gửi phiếu',
    detail: i.attendanceDrift?.length ? `${i.attendanceDrift.length} phiếu: số tiền trên phiếu không còn khớp điểm danh hiện tại.` : 'Không có.',
    lines: i.attendanceDrift,
  })
  items.push({
    key: 'leftUnbilled', level: i.leftWithUnbilled?.length ? 'warn' : 'ok', title: 'Học sinh đã rời lớp còn buổi chưa thu',
    detail: i.leftWithUnbilled?.length ? `${i.leftWithUnbilled.length} em không còn trong danh sách lớp nên không hiện ở màn Học phí — đã thu ngoài app hay cần chốt buổi?` : 'Không có.',
    lines: i.leftWithUnbilled,
  })
  items.push({
    key: 'numbering', level: i.numberingBroken?.length ? 'bad' : 'ok', title: 'Số buổi không liền mạch',
    detail: i.numberingBroken?.length ? `${i.numberingBroken.length} em có số buổi trống / trùng / nhảy số — mở "Sửa số buổi" của em đó, bấm "💡 Gợi ý" rồi Lưu.` : 'Mọi em đều có số buổi 1..n liền mạch.',
    lines: i.numberingBroken,
  })
  items.push({
    key: 'lonelyDays', level: i.lonelyDays?.length ? 'warn' : 'ok', title: 'Ngày chỉ vài em có buổi (30 ngày)',
    detail: i.lonelyDays?.length ? `${i.lonelyDays.length} ngày: học bù riêng hay nhập nhầm ngày? (sự cố Lớp 7 24/10, 27/10 là nhập nhầm, bị tính tiền).` : 'Không có.',
    lines: i.lonelyDays,
  })

  items.push({
    key: 'inherited', level: i.suspectInherited.length ? 'warn' : 'ok', title: 'Bài tập, số câu nghi lấy nhầm từ ngày khác',
    detail: i.suspectInherited.length ? `${i.suspectInherited.length} chỗ cần giáo viên đối chiếu. Có em làm bài riêng thật nên app không tự sửa; số câu sai làm lệch điểm.` : 'Không có.',
    lines: i.suspectInherited,
  })

  items.push({
    key: 'snapshots', level: i.snapshotFailures ? 'warn' : 'ok', title: 'Gửi bản chụp từ máy (7 ngày)',
    detail: i.snapshotFailures ? `${i.snapshotFailures} lần gửi lỗi.` : 'Không có lần lỗi.',
  })

  return { level: worst(items.map((x) => x.level)), items }
}
