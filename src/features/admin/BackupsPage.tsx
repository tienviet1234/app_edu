import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { backupService, type ClientSnapshotMeta } from '@/services/backups'
import { toast } from '@/store/toastStore'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { StrandedRecoveryCard } from './StrandedRecoveryCard'
import { MissingSessionsCard } from './MissingSessionsCard'

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

interface DeviceGroup { key: string; latest: ClientSnapshotMeta; history: ClientSnapshotMeta[] }

export function BackupsPage() {
  const qc = useQueryClient()
  const [running, setRunning] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [openDevice, setOpenDevice] = useState<string | null>(null)

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black" style={{ color: C.ink }}>Sao lưu & khôi phục</h1>
        <p className="text-sm mt-0.5" style={{ color: C.muted }}>
          2 lớp bảo vệ: sao lưu toàn bộ database mỗi ngày, và bản chụp dữ liệu trên TỪNG máy giáo viên (kể cả phần chưa lên server được).
        </p>
      </div>

      {error && (
        <Card className="p-4 text-sm" >
          <span style={{ color: C.red }}>Không tải được danh sách sao lưu — kiểm tra cấu hình R2 trên server.</span>
        </Card>
      )}

      {/* Database */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-bold" style={{ color: C.ink }}>Sao lưu database (hằng ngày, 2h sáng)</div>
            <div className="text-sm" style={{ color: dbStale ? C.red : C.muted }}>
              {isLoading ? 'Đang tải...' : latestDb
                ? `Bản mới nhất: ${viTime(latestDb.lastModified)}${dbStale ? ' — đã hơn 36 giờ, lịch tự động có thể không chạy!' : ''}`
                : 'Chưa có bản sao lưu nào — bấm "Sao lưu ngay".'}
            </div>
          </div>
          <Btn kind="solid" loading={running} onClick={runNow}>Sao lưu ngay</Btn>
        </div>
        {dbBackups.length > 0 && (
          <div className="divide-y" style={{ borderColor: C.line }}>
            {dbBackups.slice(0, 10).map((b) => (
              <div key={b.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span style={{ color: C.ink }}>{viTime(b.lastModified)}</span>
                <Btn size="sm" loading={downloading === b.key} onClick={() => download(b.key)}>Tải về</Btn>
              </div>
            ))}
          </div>
        )}
      </Card>

      <StrandedRecoveryCard snapshots={data?.snapshots ?? []} />

      <MissingSessionsCard />

      {/* Devices */}
      <Card className="p-4 space-y-3">
        <div>
          <div className="font-bold" style={{ color: C.ink }}>Bản chụp từ máy giáo viên</div>
          <div className="text-sm" style={{ color: C.muted }}>
            Mỗi máy tự gửi khi có thay đổi (tối đa 1 phút/lần). Máy còn tự giữ bản sao lưu ngay trên máy (không cần mạng) — giáo viên mở "🛟 Bản sao lưu trên máy" ở cuối trang → "Gửi lên để khôi phục", rồi dùng "Dữ liệu kẹt" ở trên để điền phần server còn thiếu. Nạp thẳng: tải file về → đăng nhập ĐÚNG tài khoản đó → "Nhập lại từ file" (thay toàn bộ dữ liệu máy đó).
          </div>
        </div>
        {!isLoading && devices.length === 0 && (
          <div className="text-sm" style={{ color: C.muted }}>Chưa có máy nào gửi bản chụp (giáo viên cần mở app sau bản cập nhật này).</div>
        )}
        {devices.map(({ key, latest, history }) => (
          <div key={key} className="rounded-xl p-3 space-y-2" style={{ border: `1px solid ${latest.unsyncedSessionCount > 0 ? C.red : C.line}` }}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="text-sm">
                <div className="font-semibold" style={{ color: C.ink }}>
                  {latest.userId?.name ?? 'Tài khoản đã xóa'} <span style={{ color: C.muted }}>· {deviceLabel(latest.userAgent)}</span>
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
              <div className="divide-y text-sm" style={{ borderColor: C.line }}>
                {history.slice(1).map((s) => (
                  <div key={s._id} className="flex items-center justify-between gap-2 py-1.5">
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
  )
}
