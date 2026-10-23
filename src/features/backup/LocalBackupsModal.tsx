import { useEffect, useState } from 'react'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'
import { backupService } from '@/services/backups'
import { deviceId } from '@/utils/clientSnapshot'
import { listLocalBackups, readLocalBackup, type LocalBackupMeta } from '@/utils/localBackup'
import { logActivity } from '@/services/activity'

const timeLabel = (at: number) => new Date(at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Bản sao lưu nằm ngay trên máy này (utils/localBackup.ts). Khôi phục an toàn
 *  = gửi bản đó lên server như 1 bản chụp máy → admin dùng công cụ "Dữ liệu
 *  kẹt" (chỉ điền chỗ server còn thiếu, không bao giờ đè điểm đã có). Không
 *  có nút nạp thẳng vào app ở đây — nạp đè sẽ mất phần nhập SAU lúc chụp. */
export function LocalBackupsModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [items, setItems] = useState<LocalBackupMeta[] | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => {
    listLocalBackups(userId).then(setItems).catch((e: Error) => setError(e.message || 'Trình duyệt không cho đọc kho sao lưu trên máy.'))
  }, [userId])

  const download = async (m: LocalBackupMeta) => {
    setBusyId(m.id)
    try {
      const raw = await readLocalBackup(m.id)
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `sao-luu-tren-may-${new Date(m.at).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      toast.error(`Không tải được: ${(e as Error).message}`)
    } finally {
      setBusyId(null)
    }
  }

  const sendForRecovery = async (m: LocalBackupMeta) => {
    if (!confirm(`Gửi bản sao lưu lúc ${timeLabel(m.at)} lên server để admin khôi phục?\n\nAdmin vào 💾 Sao lưu → Dữ liệu kẹt → Quét: hệ thống chỉ điền những buổi/điểm server CÒN THIẾU, không đè điểm đã có. Dữ liệu trên máy này không bị thay đổi.`)) return
    setBusyId(m.id)
    try {
      const raw = await readLocalBackup(m.id)
      await backupService.uploadSnapshot(`${deviceId()}-bk${m.at}`.slice(0, 80), raw)
      toast.success(`✓ Đã gửi bản lúc ${timeLabel(m.at)}. Báo admin vào 💾 Sao lưu → Dữ liệu kẹt → Quét để khôi phục.`, { persist: true })
      logActivity('backup.localSent', { at: new Date(m.at).toISOString(), unsaved: m.unsaved }, 'ClientSnapshot')
    } catch (e) {
      toast.error(`Chưa gửi được (kiểm tra mạng rồi thử lại): ${(e as Error).message}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: '#00000060' }} onClick={onClose}>
      <Card className="max-h-[85vh] w-full max-w-2xl space-y-3 overflow-y-auto p-5" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="font-bold text-base" style={{ color: C.ink }}>🛟 Bản sao lưu trên máy này</div>
        <div className="text-xs space-y-1" style={{ color: C.muted }}>
          <div>Máy tự lưu 1 bản mỗi khi dữ liệu thay đổi (tối đa 1 phút/lần, không cần mạng) và ngay trước khi "Xóa toàn bộ" / "Nhập lại từ file". Giữ lại tới 30 ngày.</div>
          <div>Mất điểm chưa lên server? Chọn bản <b>trước lúc mất</b> → "Gửi lên để khôi phục" → báo admin. Server chỉ điền phần còn thiếu, không đè điểm đã có.</div>
        </div>
        {error && <div className="text-sm" style={{ color: C.red }}>{error}</div>}
        {!items && !error && <div className="text-sm" style={{ color: C.muted }}>Đang đọc...</div>}
        {items?.length === 0 && <div className="text-sm" style={{ color: C.muted }}>Chưa có bản nào (máy sẽ tự lưu sau vài giây khi có dữ liệu).</div>}
        <div className="space-y-1">
          {items?.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-2 text-sm" style={{ border: `1px solid ${C.line}` }}>
              <span style={{ color: C.ink }}>
                <b>{timeLabel(m.at)}</b> <span style={{ color: C.muted }}>· {m.reason} · {m.sessions} buổi</span>
                {m.unsaved > 0 && <b style={{ color: C.amber }}> · {m.unsaved} buổi chưa lên server</b>}
              </span>
              <span className="flex gap-2">
                <Btn size="sm" kind="outline-primary" disabled={busyId !== null} onClick={() => void download(m)}>Tải file</Btn>
                <Btn size="sm" disabled={busyId !== null} onClick={() => void sendForRecovery(m)}>Gửi lên để khôi phục</Btn>
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-end"><Btn onClick={onClose}>Đóng</Btn></div>
      </Card>
    </div>
  )
}
