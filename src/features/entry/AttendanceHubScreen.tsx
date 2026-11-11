import { useEffect, useState, type ReactNode } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { toast } from '@/store/toastStore'
import { AttendanceCenterView } from './AttendanceCenterView'
import { ClassGridView } from './ClassGridView'

type View = 'center' | 'class'
const VIEW_KEY = 'lms:attendanceView'
const readView = (): View => { try { return localStorage.getItem(VIEW_KEY) === 'class' ? 'class' : 'center' } catch { return 'center' } }
type Sub = 'grid' | 'entry'
const SUB_KEY = 'lms:attendanceClassSub'
const readSub = (): Sub => { try { return localStorage.getItem(SUB_KEY) === 'entry' ? 'entry' : 'grid' } catch { return 'grid' } }

/** Thẻ "Điểm danh & Điểm" (đợt 2, 11/11): mặc định TOÀN TRUNG TÂM (mỗi lớp 1 dòng × ngày);
 *  "Theo lớp" là màn Nhập điểm cũ GIỮ NGUYÊN (truyền vào qua `classView`). */
export function AttendanceHubScreen({ cls, classes, setCurrentClass, isAdmin, classView, forceClass, onJumpEntry }: {
  cls: ClassData | null
  classes: ClassData[]
  setCurrentClass: (index: number) => void
  isAdmin: boolean
  /** Màn "Chấm từng em" (EntryScreen cũ); nhận hàm về lưới cả lớp để gắn nút "Lưu và về lưới". */
  classView: (onBackToGrid: () => void) => ReactNode
  /** Có cú nhảy thẳng tới 1 em/1 buổi (VD từ Tổng quan) → mở luôn thẻ "Theo lớp". */
  forceClass?: boolean
  /** "Chấm điểm chi tiết →" ở lưới: App đặt `entryJumpTarget` → mở "Chấm từng em" đúng em + buổi. */
  onJumpEntry: (studentId: string, no: number) => void
}) {
  const [view, setViewState] = useState<View>(readView)
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* tiện ích nhớ thẻ */ } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const [sub, setSubState] = useState<Sub>(readSub)
  const setSub = (v: Sub) => { setSubState(v); try { localStorage.setItem(SUB_KEY, v) } catch { /* tiện ích nhớ thẻ */ } }
  useEffect(() => { if (forceClass) { setView('class'); setSub('entry') } }, [forceClass])

  function openClass(classId: string) {
    const idx = classes.findIndex((c) => c.id === classId)
    if (idx < 0) { toast.error('Máy này chưa có lớp đó — tải lại trang rồi thử lại.'); return }
    setCurrentClass(idx)
    setView('class')
    window.scrollTo({ top: 0 })
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="mr-1 text-[22px] font-extrabold tracking-tight" style={{ color: C.ink }}>Điểm danh &amp; Điểm</h1>
        <div className="inline-flex rounded-xl p-[3px]" style={{ background: C.line }} role="tablist">
          {([['center', isAdmin ? 'Toàn trung tâm' : 'Các lớp của tôi'], ['class', 'Theo lớp']] as Array<[View, string]>).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className="rounded-[9px] px-3 py-1.5 text-[13px] font-semibold"
              style={view === k ? { background: C.card, color: C.board, boxShadow: '0 1px 3px rgba(15,23,42,.12)' } : { color: C.muted }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === 'center' && <AttendanceCenterView isAdmin={isAdmin} onOpenClass={openClass} />}
      {view === 'class' && (cls ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button type="button" onClick={() => setView('center')} className="text-sm font-bold" style={{ color: C.board2 }}>‹ {isAdmin ? 'Toàn trung tâm' : 'Các lớp của tôi'}</button>
            <b className="text-lg" style={{ color: C.ink }} data-testid="class-title">{cls.name}</b>
            <span className="text-sm" style={{ color: C.muted }}>{cls.students.length} em{cls.teacher ? ` · ${cls.teacher}` : ''}</span>
            <div className="ml-auto inline-flex rounded-xl p-[3px]" style={{ background: C.line }} role="tablist" aria-label="Cách xem lớp">
              {([['grid', 'Lưới cả lớp'], ['entry', 'Chấm từng em']] as Array<[Sub, string]>).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className="rounded-[9px] px-3 py-1.5 text-[13px] font-semibold"
                  style={sub === k ? { background: C.card, color: C.board, boxShadow: '0 1px 3px rgba(15,23,42,.12)' } : { color: C.muted }}>{label}</button>
              ))}
            </div>
          </div>
          {sub === 'grid' && <ClassGridView key={cls.id} cls={cls} onOpenEntry={onJumpEntry} />}
          {sub === 'entry' && <div className="mx-auto max-w-5xl">{classView(() => { setSub('grid'); window.scrollTo({ top: 0 }) })}</div>}
        </div>
      ) : <div className="rounded-2xl p-8 text-center text-sm" style={{ background: C.card, color: C.muted }}>Chọn 1 lớp ở menu trên cùng.</div>)}
    </div>
  )
}
