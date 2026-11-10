import { useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { toast } from '@/store/toastStore'
import { TuitionCenterView } from './TuitionCenterView'
import { TuitionReportScreen } from './TuitionReportScreen'

type View = 'center' | 'class'
const VIEW_KEY = 'lms:tuitionView'
const readView = (): View => { try { return localStorage.getItem(VIEW_KEY) === 'class' ? 'class' : 'center' } catch { return 'center' } }

/** Tab "Học phí": mặc định TOÀN TRUNG TÂM (mỗi em 1 dòng), "Theo lớp" là màn học phí
 *  cũ giữ nguyên — gửi phiếu, sửa số buổi, học phí riêng vẫn làm ở đó. */
export function TuitionHubScreen({ cls, classes, update, setCurrentClass, isAdmin }: {
  cls: ClassData | null
  classes: ClassData[]
  update: (fn: (c: ClassData) => void) => void
  setCurrentClass: (index: number) => void
  isAdmin: boolean
}) {
  const [view, setViewState] = useState<View>(readView)
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* chỉ là tiện ích nhớ thẻ */ } }

  function openClass(classId: string, studentName: string) {
    const idx = classes.findIndex((c) => c.id === classId)
    if (idx < 0) { toast.error('Máy này chưa có lớp đó — tải lại trang rồi thử lại.'); return }
    setCurrentClass(idx)
    setView('class')
    toast.info(`Đã mở học phí ${classes[idx].name} — tìm ${studentName} trong danh sách.`)
    window.scrollTo({ top: 0 })
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="mr-1 text-[22px] font-extrabold tracking-tight" style={{ color: C.ink }}>Học phí</h1>
        <div className="inline-flex rounded-xl p-[3px]" style={{ background: C.line }} role="tablist">
          {([['center', isAdmin ? 'Toàn trung tâm' : 'Các lớp của tôi'], ['class', 'Theo lớp']] as Array<[View, string]>).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className="rounded-[9px] px-3 py-1.5 text-[13px] font-semibold"
              style={view === k ? { background: C.card, color: C.board, boxShadow: '0 1px 3px rgba(15,23,42,.12)' } : { color: C.muted }}>
              {label}
            </button>
          ))}
        </div>
        {view === 'class' && cls && <span className="text-sm" style={{ color: C.muted }}>{cls.name} · đổi lớp ở menu trên cùng</span>}
      </div>
      {view === 'center' && <TuitionCenterView isAdmin={isAdmin} onOpenClass={openClass} />}
      {view === 'class' && (cls
        ? <div className="mx-auto max-w-5xl"><TuitionReportScreen key={cls.id} cls={cls} update={update} /></div>
        : <div className="rounded-2xl p-8 text-center text-sm" style={{ background: C.card, color: C.muted }}>Chọn 1 lớp ở menu trên cùng.</div>)}
    </div>
  )
}
