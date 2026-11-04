import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { backupService, type ClientSnapshotMeta } from '@/services/backups'
import { toast } from '@/store/toastStore'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { SnapshotSearchCard } from './SnapshotSearchCard'
import { StrandedRecoveryCard } from './StrandedRecoveryCard'
import { MissingSessionsCard } from './MissingSessionsCard'
import { ChangeHistoryCard } from './ChangeHistoryCard'

function viTime(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function deviceLabel(ua?: string): string {
  if (!ua) return 'Không rõ thiết bị'
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : 'Máy khác'
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : ''
  return br ? `${os} · ${br}` : os
}

/** Mã máy để đối chiếu với nhật ký/`checkDataSafety`. Bản giáo viên chủ động gửi
 *  từ "🛟 Bản sao lưu trên máy" mang deviceId `<máy>-bk<thời điểm chụp>`. */
function deviceCode(deviceId: string): string {
  const backup = /^(.*)-bk\d+$/.exec(deviceId)
  return backup ? `máy ${backup[1].slice(0, 8)} · bản gửi từ máy` : `máy ${deviceId.slice(0, 8)}`
}

interface DeviceGroup { key: string; latest: ClientSnapshotMeta; history: ClientSnapshotMeta[] }

type ToolKey = 'missing' | 'stranded' | 'history' | 'files'

// Xếp theo TÌNH HUỐNG admin đang gặp, không theo cách hệ thống lưu dữ liệu.
const TOOLS: Array<{ key: ToolKey; label: string; when: string }> = [
  { key: 'missing', label: 'Kiểm tra buổi thiếu', when: 'Nghi có em hoặc cả lớp thiếu ngày học' },
  { key: 'stranded', label: 'Dữ liệu kẹt trên máy', when: 'Giáo viên đã nhập mà server chưa có' },
  { key: 'history', label: 'Lịch sử điểm', when: 'Điểm bị sửa sai, cần lấy lại bản cũ' },
  { key: 'files', label: 'File sao lưu', when: 'Tải về hoặc tạo bản sao lưu' },
]
const TOOL_STORAGE_KEY = 'lms:backupsTool'

function loadTool(): ToolKey {
  try {
    const saved = localStorage.getItem(TOOL_STORAGE_KEY)
    return TOOLS.find((t) => t.key === saved)?.key ?? 'missing'
  } catch {
    return 'missing'
  }
}

export function BackupsPage() {
  const qc = useQueryClient()
  const [running, setRunning] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [openDevice, setOpenDevice] = useState<string | null>(null)
  const [tool, setTool] = useState<ToolKey>(loadTool)
  const chooseTool = (key: ToolKey) => {
    setTool(key)
    try { localStorage.setItem(TOOL_STORAGE_KEY, key) } catch { /* chỉ là tiện ích nhớ thẻ đang mở */ }
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'backups'],
    queryFn: backupService.list,
  })

  const devices = useMemo<DeviceGroup[]>(() => {
    const map = new Map<string, ClientSnapshotMeta[]>()
    for (const s of data?.snapshots ?? []) {
      const k = `${s.userId?._id ?? '?'}|${s.deviceId}`
      map.set(k, [...(map.get(k) ?? []), s])
    }
    // Máy còn dữ liệu CHƯA lên server lên đầu — đó là chỗ cần xử lý trước.
    return [...map.entries()]
      .map(([key, list]) => ({ key, latest: list[0], history: list }))
      .sort((a, b) => (b.latest.unsyncedSessionCount > 0 ? 1 : 0) - (a.latest.unsyncedSessionCount > 0 ? 1 : 0)
        || b.latest.createdAt.localeCompare(a.latest.createdAt))
  }, [data])

  const download = async (key: string) => {
    setDownloading(key)
    try {
      const url = await backupService.downloadUrl(key)
      window.location.href = url
    } catch {
      toast.error('Không lấy được link tải.')
    } finally {
      setDownloading(null)
    }
  }

  const runNow = async () => {
    setRunning(true)
    try {
      const r = await backupService.runNow()
      toast.success(`Đã sao lưu ${r.documents.toLocaleString('vi')} bản ghi (${kb(r.sizeBytes)}).`)
      await qc.invalidateQueries({ queryKey: ['admin', 'backups'] })
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      toast.error(`Sao lưu thất bại${msg ? `: ${msg}` : ''}`, { persist: true })
    } finally {
      setRunning(false)
    }
  }

  const dbBackups = data?.dbBackups ?? []
  const latestDb = dbBackups[0]
  const dbStale = !latestDb?.lastModified || Date.now() - new Date(latestDb.lastModified).getTime() > 36 * 3600 * 1000
  const unsentDevices = devices.filter((d) => d.latest.unsyncedSessionCount > 0).length
  const alertOf = (key: ToolKey): string | null => {
    if (key === 'stranded' && unsentDevices > 0) return `${unsentDevices} máy còn buổi chưa gửi`
    if (key === 'files' && !isLoading && dbStale) return 'Sao lưu database bị trễ'
    return null
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black" style={{ color: C.ink }}>Sao lưu & khôi phục</h1>
        <p className="text-sm mt-0.5" style={{ color: C.muted }}>Bạn đang cần làm gì?</p>
      </div>

      <nav aria-label="Công cụ sao lưu và khôi phục" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {TOOLS.map((t) => {
          const active = tool === t.key
          const alert = alertOf(t.key)
          return (
            <button
              key={t.key}
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => chooseTool(t.key)}
              className="flex flex-col items-start justify-start rounded-xl p-3 text-left transition-all hover:brightness-[0.97] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                background: active ? C.board : '#fff',
                border: `1px solid ${active ? C.board : C.line}`,
                outlineColor: C.board2,
              }}
            >
              <span className="block text-sm font-bold" style={{ color: active ? '#fff' : C.ink }}>{t.label}</span>
              <span className="mt-0.5 block text-xs leading-snug" style={{ color: active ? 'rgb(255 255 255 / 0.8)' : C.muted }}>{t.when}</span>
              {alert && (
                <span className="mt-1.5 block text-xs font-bold" style={{ color: active ? '#fff' : C.red }}>{alert}</span>
              )}
            </button>
          )
        })}
      </nav>

      {error && (
        <Card className="p-4 text-sm" >
          <span style={{ color: C.red }}>Không tải được danh sách sao lưu — kiểm tra cấu hình R2 trên server.</span>
        </Card>
      )}

      {/* Giữ cả 4 công cụ luôn được dựng (chỉ ẩn) — đổi thẻ không mất kết quả đang quét. */}
      <div hidden={tool !== 'missing'}><MissingSessionsCard /></div>
      <div hidden={tool !== 'stranded'} className="space-y-4">
        <SnapshotSearchCard />
        <StrandedRecoveryCard snapshots={data?.snapshots ?? []} />
      </div>
      <div hidden={tool !== 'history'}><ChangeHistoryCard /></div>

      <div hidden={tool !== 'files'} className="space-y-4">
      {/* Database */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-bold" style={{ color: C.ink }}>Sao lưu database (2 lần mỗi ngày)</div>
            <div className="text-sm" style={{ color: dbStale ? C.red : C.muted }}>
              {isLoading ? 'Đang tải...' : latestDb
                ? `Bản mới nhất: ${viTime(latestDb.lastModified)}${dbStale ? ' — đã hơn 36 giờ, lịch tự động có thể không chạy!' : ''}`
                : 'Chưa có bản sao lưu nào — bấm "Sao lưu ngay".'}
            </div>
          </div>
          <Btn kind="solid" loading={running} onClick={runNow}>Sao lưu ngay</Btn>
        </div>
        {dbBackups.length > 0 && (
          <div>
            {dbBackups.slice(0, 10).map((b, i) => (
              <div key={b.key} className="flex items-center justify-between gap-2 py-2 text-sm" style={i ? { borderTop: `1px solid ${C.line}` } : undefined}>
                <span style={{ color: C.ink }}>{viTime(b.lastModified)}</span>
                <Btn size="sm" loading={downloading === b.key} onClick={() => download(b.key)}>Tải về</Btn>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Devices */}
      <Card className="p-4 space-y-3">
        <div>
          <div className="font-bold" style={{ color: C.ink }}>Bản chụp từ máy giáo viên</div>
          <div className="text-sm" style={{ color: C.muted }}>Mỗi máy tự gửi khi có thay đổi và có mạng, tối đa 1 phút/lần.</div>
          <details className="mt-1 text-sm" style={{ color: C.muted }}>
            <summary className="cursor-pointer font-semibold" style={{ color: C.board2 }}>Cách khôi phục từ bản chụp</summary>
            <p className="mt-1">Máy còn tự giữ bản sao lưu ngay trên máy (không cần mạng): giáo viên mở "🛟 Bản sao lưu trên máy" ở cuối trang → "Gửi lên để khôi phục", rồi dùng thẻ "Dữ liệu kẹt trên máy" để điền phần server còn thiếu.</p>
            <p className="mt-1">Nạp thẳng: tải file về → đăng nhập ĐÚNG tài khoản đó → "Nhập lại từ file" (thay toàn bộ dữ liệu máy đó).</p>
          </details>
        </div>
        {!isLoading && devices.length === 0 && (
          <div className="text-sm" style={{ color: C.muted }}>Chưa có máy nào gửi bản chụp (giáo viên cần mở app sau bản cập nhật này).</div>
        )}
        {devices.map(({ key, latest, history }) => (
          <div key={key} className="rounded-xl p-3 space-y-2" style={{ border: `1px solid ${latest.unsyncedSessionCount > 0 ? C.red : C.line}` }}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="text-sm">
                <div className="font-semibold" style={{ color: C.ink }}>
                  {latest.userId?.name ?? 'Tài khoản đã xóa'} <span style={{ color: C.muted }}>· {deviceLabel(latest.userAgent)} · {deviceCode(latest.deviceId)}</span>
                </div>
                <div style={{ color: C.muted }}>
                  {viTime(latest.createdAt)} · {latest.classCount} lớp · {latest.sessionCount} buổi · {kb(latest.sizeBytes)}
                </div>
                {latest.unsyncedSessionCount > 0 && (
                  <div className="font-semibold" style={{ color: C.red }}>
                    {latest.unsyncedSessionCount} buổi trên máy này CHƯA lên server
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {history.length > 1 && (
                  <Btn size="sm" onClick={() => setOpenDevice(openDevice === key ? null : key)}>
                    {openDevice === key ? 'Ẩn bản cũ' : `${history.length - 1} bản cũ`}
                  </Btn>
                )}
                <Btn size="sm" kind="outline-primary" loading={downloading === latest.r2Key} onClick={() => download(latest.r2Key)}>Tải bản mới nhất</Btn>
              </div>
            </div>
            {openDevice === key && (
              <div className="text-sm">
                {history.slice(1).map((s, i) => (
                  <div key={s._id} className="flex items-center justify-between gap-2 py-1.5" style={i ? { borderTop: `1px solid ${C.line}` } : undefined}>
                    <span style={{ color: C.ink }}>
                      {viTime(s.createdAt)} · {s.sessionCount} buổi
                      {s.unsyncedSessionCount > 0 && <span style={{ color: C.red }}> · {s.unsyncedSessionCount} chưa lên server</span>}
                    </span>
                    <Btn size="sm" loading={downloading === s.r2Key} onClick={() => download(s.r2Key)}>Tải</Btn>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </Card>
      </div>
    </div>
  )
}
