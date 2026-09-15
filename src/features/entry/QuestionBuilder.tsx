import { useState } from 'react'
import { C } from '@/constants/colors'
import { uid } from '@/utils/uid'
import { parseQuestions } from '@/utils/quizParser'
import type { Question, QuestionType, McqQuestion, FillQuestion, TrueFalseQuestion, MatchQuestion, OrderQuestion, ClozeQuestion } from '@/types/quiz'

interface Props {
  questions: Question[]
  onChange: (qs: Question[]) => void
}

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'Trắc nghiệm',
  fill: 'Điền từ',
  truefalse: 'Đúng / Sai',
  match: 'Ghép cặp',
  order: 'Sắp xếp thứ tự',
  cloze: 'Điền đoạn văn',
}

const TYPE_HINT: Record<QuestionType, string> = {
  mcq: 'Câu 1: What is she doing?\nA. She reading.\n==B. She is reading.\nC. She read.\nD. She reads.',
  fill: '1. She {{goes}} to school every day.\n2. Where does he live? {{Da Nang.;He lives in Da Nang.}}',
  truefalse: 'Mai is nine years old.\nT\n\nHer father is a doctor.\nF',
  match: 'What is your name?==My name is Nam.\nHow old are you?==I am ten years old.',
  order: 'She\nis\nreading\na book\n\nI\nlike\napples',
  cloze: "My name {{is}} Nam. I {{am;'m}} 10 years old.",
}

function EmptyMcq(): McqQuestion { return { id: uid(), type: 'mcq', text: '', options: ['', ''], correctIndexes: [] } }
function EmptyFill(): FillQuestion { return { id: uid(), type: 'fill', text: '', acceptedAnswers: [''] } }
function EmptyTF(): TrueFalseQuestion { return { id: uid(), type: 'truefalse', text: '', correctAnswer: true } }
function EmptyMatch(): MatchQuestion { return { id: uid(), type: 'match', pairs: [{ left: '', right: '' }, { left: '', right: '' }] } }
function EmptyOrder(): OrderQuestion { return { id: uid(), type: 'order', text: '', items: ['', ''] } }
function EmptyCloze(): ClozeQuestion { return { id: uid(), type: 'cloze', text: '', blanks: [] } }

const GUIDE_ITEMS: { type: QuestionType; rules: string[] }[] = [
  {
    type: 'mcq',
    rules: [
      'Dùng khi có nhiều lựa chọn, học sinh chọn 1 (hoặc nhiều) đáp án đúng.',
      'Form trực quan: tick vào ô ☑ trước lựa chọn đúng, có thể tick nhiều ô nếu câu có nhiều đáp án đúng.',
      'Dán cú pháp: dòng đề bài bắt đầu "Câu N:", mỗi dòng sau là 1 lựa chọn. Đáp án đúng thêm "==" ngay trước, không có dấu cách. Mỗi câu cách nhau 1 dòng trống.',
    ],
  },
  {
    type: 'fill',
    rules: [
      'Dùng khi học sinh phải tự gõ câu trả lời (không có sẵn lựa chọn).',
      'Form trực quan: viết câu có chữ "___" ở chỗ trống, rồi nhập đáp án đúng vào ô bên dưới.',
      'Dán cú pháp: đặt đáp án trong {{ }}. Nếu chấp nhận nhiều cách viết đúng, cách nhau bởi dấu ";" — ví dụ {{Da Nang.;He lives in Da Nang.}}. Hệ thống không phân biệt hoa/thường và khoảng trắng thừa khi chấm.',
    ],
  },
  {
    type: 'truefalse',
    rules: [
      'Dùng cho câu khẳng định, học sinh chọn Đúng hoặc Sai.',
      'Form trực quan: viết câu, bấm nút Đúng/Sai để chọn đáp án.',
      'Dán cú pháp: dòng 1 là câu khẳng định, dòng 2 chỉ ghi "T" (đúng) hoặc "F" (sai). Mỗi câu cách nhau 1 dòng trống.',
    ],
  },
  {
    type: 'match',
    rules: [
      'Dùng khi cần ghép 2 vế tương ứng (câu hỏi—câu trả lời, từ—nghĩa...).',
      'Form trực quan: nhập từng cặp vào 2 ô "Vế trái" / "Vế phải".',
      'Dán cú pháp: mỗi dòng 1 cặp, viết "vế trái==vế phải". Cần ít nhất 2 cặp. Học sinh sẽ thấy vế phải bị xáo trộn ngẫu nhiên khi làm bài.',
    ],
  },
  {
    type: 'order',
    rules: [
      'Dùng khi học sinh cần sắp xếp các từ/câu theo đúng thứ tự (VD xếp câu tiếng Anh đúng ngữ pháp).',
      'Form trực quan: nhập từng phần theo ĐÚNG thứ tự — hệ thống tự xáo trộn khi hiện cho học sinh làm bài.',
      'Dán cú pháp: mỗi dòng 1 phần theo đúng thứ tự, mỗi câu cách nhau 1 dòng trống. Cần ít nhất 2 phần.',
    ],
  },
  {
    type: 'cloze',
    rules: [
      'Dùng khi cần điền NHIỀU chỗ trống trong CÙNG 1 đoạn văn (khác "Điền từ" — mỗi câu chỉ 1 chỗ trống).',
      'Form trực quan: viết đoạn văn có nhiều chữ "___", rồi nhập đáp án cho từng ô trống hiện ra bên dưới theo đúng thứ tự.',
      'Dán cú pháp: đặt mỗi đáp án trong {{ }} ngay tại vị trí chỗ trống, ví dụ "My name {{is}} Nam". Nhiều đáp án chấp nhận cách nhau bởi ";".',
    ],
  },
]

export function QuestionBuilder({ questions, onChange }: Props) {
  const [pasteType, setPasteType] = useState<QuestionType>('mcq')
  const [pasteText, setPasteText] = useState('')
  const [pasteErrors, setPasteErrors] = useState<string[]>([])
  const [showPaste, setShowPaste] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  function update(id: string, fn: (q: Question) => Question) {
    onChange(questions.map((q) => (q.id === id ? fn(q) : q)))
  }
  function remove(id: string) {
    onChange(questions.filter((q) => q.id !== id))
  }
  function add(type: QuestionType) {
    const q =
      type === 'mcq' ? EmptyMcq()
      : type === 'fill' ? EmptyFill()
      : type === 'truefalse' ? EmptyTF()
      : type === 'match' ? EmptyMatch()
      : type === 'order' ? EmptyOrder()
      : EmptyCloze()
    onChange([...questions, q])
  }

  function handleParsePaste() {
    const { questions: parsed, errors } = parseQuestions(pasteType, pasteText)
    setPasteErrors(errors)
    if (parsed.length > 0) {
      onChange([...questions, ...parsed])
      setPasteText('')
    }
  }

  return (
    <div className="space-y-3">
      {/* Hướng dẫn cách nhập câu hỏi */}
      <div className="rounded-xl" style={{ border: `1px solid ${C.board}30`, background: C.board + '08' }}>
        <button
          type="button"
          onClick={() => setShowGuide((s) => !s)}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-bold"
          style={{ color: C.board }}
        >
          <span>{showGuide ? '▼' : '▶'}</span>
          <span>❓ Hướng dẫn cách nhập từng dạng câu hỏi</span>
        </button>
        {showGuide && (
          <div className="space-y-2.5 px-3 pb-3 text-xs">
            {GUIDE_ITEMS.map((g) => (
              <div key={g.type}>
                <div className="mb-0.5 font-bold" style={{ color: C.ink }}>{TYPE_LABELS[g.type]}</div>
                <ul className="ml-4 list-disc space-y-0.5" style={{ color: C.muted }}>
                  {g.rules.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danh sách câu hỏi hiện có */}
      {questions.map((q, i) => (
        <div key={q.id} className="rounded-xl p-3" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase" style={{ color: C.board }}>
              Câu {i + 1} · {TYPE_LABELS[q.type]}
            </span>
            <button type="button" onClick={() => remove(q.id)} className="text-xs font-bold" style={{ color: C.red }}>Xóa</button>
          </div>

          {q.type === 'mcq' && (
            <div className="space-y-1.5">
              <input
                value={q.text}
                onChange={(e) => update(q.id, (cur) => ({ ...(cur as McqQuestion), text: e.target.value }))}
                placeholder="Đề bài..."
                className="w-full rounded-lg px-2 py-1.5 text-sm"
                style={{ border: `1px solid ${C.line}` }}
              />
              {q.options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={q.correctIndexes.includes(oi)}
                    onChange={(e) => update(q.id, (cur) => {
                      const c = cur as McqQuestion
                      const idx = new Set(c.correctIndexes)
                      if (e.target.checked) idx.add(oi); else idx.delete(oi)
                      return { ...c, correctIndexes: [...idx] }
                    })}
                  />
                  <input
                    value={opt}
                    onChange={(e) => update(q.id, (cur) => {
                      const c = cur as McqQuestion
                      const options = [...c.options]; options[oi] = e.target.value
                      return { ...c, options }
                    })}
                    placeholder={`Lựa chọn ${String.fromCharCode(65 + oi)}`}
                    className="flex-1 rounded-lg px-2 py-1 text-sm"
                    style={{ border: `1px solid ${C.line}` }}
                  />
                  {q.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => update(q.id, (cur) => {
                        const c = cur as McqQuestion
                        return { ...c, options: c.options.filter((_, x) => x !== oi), correctIndexes: c.correctIndexes.filter((x) => x !== oi).map((x) => x > oi ? x - 1 : x) }
                      })}
                      className="text-xs" style={{ color: C.muted }}
                    >✕</button>
                  )}
                </div>
              ))}
              {q.options.length < 6 && (
                <button
                  type="button"
                  onClick={() => update(q.id, (cur) => ({ ...(cur as McqQuestion), options: [...(cur as McqQuestion).options, ''] }))}
                  className="text-xs font-semibold" style={{ color: C.board2 }}
                >+ Thêm lựa chọn</button>
              )}
            </div>
          )}

          {q.type === 'fill' && (
            <div className="space-y-1.5">
              <input
                value={q.text}
                onChange={(e) => update(q.id, (cur) => ({ ...(cur as FillQuestion), text: e.target.value }))}
                placeholder="Câu có chỗ trống, dùng ___ (VD: She ___ to school every day.)"
                className="w-full rounded-lg px-2 py-1.5 text-sm"
                style={{ border: `1px solid ${C.line}` }}
              />
              <input
                value={q.acceptedAnswers.join('; ')}
                onChange={(e) => update(q.id, (cur) => ({ ...(cur as FillQuestion), acceptedAnswers: e.target.value.split(';').map((s) => s.trim()) }))}
                placeholder="Đáp án đúng (nhiều đáp án cách nhau bởi ;)"
                className="w-full rounded-lg px-2 py-1.5 text-sm"
                style={{ border: `1px solid ${C.line}` }}
              />
            </div>
          )}

          {q.type === 'truefalse' && (
            <div className="space-y-1.5">
              <input
                value={q.text}
                onChange={(e) => update(q.id, (cur) => ({ ...(cur as TrueFalseQuestion), text: e.target.value }))}
                placeholder="Câu khẳng định..."
                className="w-full rounded-lg px-2 py-1.5 text-sm"
                style={{ border: `1px solid ${C.line}` }}
              />
              <div className="flex gap-2">
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => update(q.id, (cur) => ({ ...(cur as TrueFalseQuestion), correctAnswer: v }))}
                    className="rounded-lg px-3 py-1 text-xs font-bold"
                    style={{
                      background: q.correctAnswer === v ? C.board : '#fff',
                      color: q.correctAnswer === v ? '#fff' : C.muted,
                      border: `1px solid ${q.correctAnswer === v ? C.board : C.line}`,
                    }}
                  >
                    {v ? 'Đúng' : 'Sai'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {q.type === 'match' && (
            <div className="space-y-1.5">
              {q.pairs.map((p, pi) => (
                <div key={pi} className="flex items-center gap-2">
                  <input
                    value={p.left}
                    onChange={(e) => update(q.id, (cur) => {
                      const c = cur as MatchQuestion
                      const pairs = [...c.pairs]; pairs[pi] = { ...pairs[pi], left: e.target.value }
                      return { ...c, pairs }
                    })}
                    placeholder="Vế trái"
                    className="flex-1 rounded-lg px-2 py-1 text-sm"
                    style={{ border: `1px solid ${C.line}` }}
                  />
                  <span style={{ color: C.muted }}>—</span>
                  <input
                    value={p.right}
                    onChange={(e) => update(q.id, (cur) => {
                      const c = cur as MatchQuestion
                      const pairs = [...c.pairs]; pairs[pi] = { ...pairs[pi], right: e.target.value }
                      return { ...c, pairs }
                    })}
                    placeholder="Vế phải"
                    className="flex-1 rounded-lg px-2 py-1 text-sm"
                    style={{ border: `1px solid ${C.line}` }}
                  />
                  {q.pairs.length > 2 && (
                    <button
                      type="button"
                      onClick={() => update(q.id, (cur) => ({ ...(cur as MatchQuestion), pairs: (cur as MatchQuestion).pairs.filter((_, x) => x !== pi) }))}
                      className="text-xs" style={{ color: C.muted }}
                    >✕</button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => update(q.id, (cur) => ({ ...(cur as MatchQuestion), pairs: [...(cur as MatchQuestion).pairs, { left: '', right: '' }] }))}
                className="text-xs font-semibold" style={{ color: C.board2 }}
              >+ Thêm cặp</button>
            </div>
          )}

          {q.type === 'order' && (
            <div className="space-y-1.5">
              <input
                value={q.text ?? ''}
                onChange={(e) => update(q.id, (cur) => ({ ...(cur as OrderQuestion), text: e.target.value }))}
                placeholder="Hướng dẫn (không bắt buộc, VD: Sắp xếp thành câu đúng)"
                className="w-full rounded-lg px-2 py-1.5 text-sm"
                style={{ border: `1px solid ${C.line}` }}
              />
              <div className="text-xs" style={{ color: C.muted }}>
                Nhập các phần theo ĐÚNG thứ tự — hệ thống sẽ xáo trộn khi hiện cho học sinh.
              </div>
              {q.items.map((item, ii) => (
                <div key={ii} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-xs font-bold" style={{ color: C.muted }}>{ii + 1}.</span>
                  <input
                    value={item}
                    onChange={(e) => update(q.id, (cur) => {
                      const c = cur as OrderQuestion
                      const items = [...c.items]; items[ii] = e.target.value
                      return { ...c, items }
                    })}
                    placeholder={`Phần ${ii + 1}`}
                    className="flex-1 rounded-lg px-2 py-1 text-sm"
                    style={{ border: `1px solid ${C.line}` }}
                  />
                  {q.items.length > 2 && (
                    <button
                      type="button"
                      onClick={() => update(q.id, (cur) => ({ ...(cur as OrderQuestion), items: (cur as OrderQuestion).items.filter((_, x) => x !== ii) }))}
                      className="text-xs" style={{ color: C.muted }}
                    >✕</button>
                  )}
                </div>
              ))}
              {q.items.length < 8 && (
                <button
                  type="button"
                  onClick={() => update(q.id, (cur) => ({ ...(cur as OrderQuestion), items: [...(cur as OrderQuestion).items, ''] }))}
                  className="text-xs font-semibold" style={{ color: C.board2 }}
                >+ Thêm phần</button>
              )}
            </div>
          )}

          {q.type === 'cloze' && (
            <div className="space-y-1.5">
              <textarea
                value={q.text}
                onChange={(e) => update(q.id, (cur) => ({ ...(cur as ClozeQuestion), text: e.target.value }))}
                placeholder={'Đoạn văn, đánh dấu chỗ trống bằng ___ (VD: My name ___ Nam. I ___ 10 years old.)'}
                rows={3}
                className="w-full rounded-lg px-2 py-1.5 text-sm resize-none"
                style={{ border: `1px solid ${C.line}` }}
              />
              {(() => {
                const blankCount = (q.text.match(/___/g) ?? []).length
                if (blankCount === 0) {
                  return (
                    <div className="text-xs" style={{ color: C.muted }}>
                      Chưa có ô trống nào — gõ "___" (3 gạch dưới) vào chỗ cần điền trong đoạn văn trên.
                    </div>
                  )
                }
                return Array.from({ length: blankCount }, (_, bi) => (
                  <div key={bi} className="flex items-center gap-2">
                    <span className="shrink-0 text-xs font-bold" style={{ color: C.muted }}>Ô {bi + 1}:</span>
                    <input
                      value={(q.blanks[bi] ?? []).join('; ')}
                      onChange={(e) => update(q.id, (cur) => {
                        const c = cur as ClozeQuestion
                        const blanks = [...c.blanks]
                        blanks[bi] = e.target.value.split(';').map((s) => s.trim())
                        return { ...c, blanks }
                      })}
                      placeholder="Đáp án đúng (nhiều đáp án cách nhau bởi ;)"
                      className="flex-1 rounded-lg px-2 py-1 text-sm"
                      style={{ border: `1px solid ${C.line}` }}
                    />
                  </div>
                ))
              })()}
            </div>
          )}
        </div>
      ))}

      {/* Thêm câu hỏi mới bằng form */}
      <div>
        <div className="mb-1.5 text-xs font-bold" style={{ color: C.ink }}>
          ➕ Thêm câu hỏi mới — chọn dạng:
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => add(t)}
              className="rounded-lg px-3 py-1.5 text-xs font-bold transition-all hover:brightness-[0.93]"
              style={{ background: C.board, color: '#fff' }}
            >
              + {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Chế độ dán cú pháp */}
      <div>
        <button
          type="button"
          onClick={() => setShowPaste((s) => !s)}
          className="text-xs font-semibold" style={{ color: C.muted }}
        >
          {showPaste ? '▼' : '▶'} Dán cú pháp có sẵn (nâng cao)
        </button>
        {showPaste && (
          <div className="mt-2 space-y-2 rounded-xl p-3" style={{ background: C.paper }}>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setPasteType(t); setPasteErrors([]) }}
                  className="rounded-lg px-2.5 py-1 text-xs font-semibold"
                  style={{
                    background: pasteType === t ? C.board : '#fff',
                    color: pasteType === t ? '#fff' : C.muted,
                    border: `1px solid ${pasteType === t ? C.board : C.line}`,
                  }}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={TYPE_HINT[pasteType]}
              rows={5}
              className="w-full rounded-lg px-2 py-1.5 text-xs font-mono resize-none"
              style={{ border: `1px solid ${C.line}`, background: '#fff' }}
            />
            {pasteErrors.length > 0 && (
              <div className="rounded-lg px-2 py-1.5 text-xs" style={{ background: C.red + '12', color: C.red }}>
                {pasteErrors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            <button
              type="button"
              onClick={handleParsePaste}
              disabled={!pasteText.trim()}
              className="rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50"
              style={{ background: C.board, color: '#fff' }}
            >
              Phân tích & Thêm câu hỏi
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
