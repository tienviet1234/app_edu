import { describe, it, expect } from 'vitest'
import { parseOrder, parseCloze, parseQuestions } from './quizParser'

describe('parseOrder', () => {
  it('mỗi khối (cách nhau dòng trống) = 1 câu, mỗi dòng = 1 phần theo đúng thứ tự', () => {
    const { questions, errors } = parseOrder('She\nis\nreading\na book\n\nI\nlike\napples')
    expect(errors).toEqual([])
    expect(questions).toHaveLength(2)
    expect(questions[0].items).toEqual(['She', 'is', 'reading', 'a book'])
    expect(questions[1].items).toEqual(['I', 'like', 'apples'])
  })

  it('báo lỗi nếu 1 khối chỉ có 1 phần (không đủ để sắp xếp)', () => {
    const { questions, errors } = parseOrder('Chỉ một dòng')
    expect(questions).toHaveLength(0)
    expect(errors).toHaveLength(1)
  })
})

describe('parseCloze', () => {
  it('tách nhiều {{đáp án}} trong 1 đoạn thành các ô trống ___ theo đúng thứ tự', () => {
    const { questions, errors } = parseCloze("My name {{is}} Nam. I {{am;'m}} 10 years old.")
    expect(errors).toEqual([])
    expect(questions).toHaveLength(1)
    expect(questions[0].text).toBe('My name ___ Nam. I ___ 10 years old.')
    expect(questions[0].blanks).toEqual([['is'], ['am', "'m"]])
  })

  it('nhiều khối (cách nhau dòng trống) = nhiều câu cloze riêng', () => {
    const { questions } = parseCloze('A {{cat}} sat.\n\nA {{dog}} ran.')
    expect(questions).toHaveLength(2)
    expect(questions[0].blanks).toEqual([['cat']])
    expect(questions[1].blanks).toEqual([['dog']])
  })

  it('báo lỗi nếu đoạn văn không có {{đáp án}} nào', () => {
    const { questions, errors } = parseCloze('Không có ô trống nào cả.')
    expect(questions).toHaveLength(0)
    expect(errors).toHaveLength(1)
  })
})

describe('parseQuestions dispatcher', () => {
  it('điều hướng đúng type "order" và "cloze" tới hàm parse tương ứng', () => {
    expect(parseQuestions('order', 'a\nb').questions[0].type).toBe('order')
    expect(parseQuestions('cloze', '{{x}}').questions[0].type).toBe('cloze')
  })
})
