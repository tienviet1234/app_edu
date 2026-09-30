import { describe, it, expect } from 'vitest'
import { matchAiErrorTags } from './aiErrorTags'

describe('matchAiErrorTags', () => {
  it('khớp lỗi ngữ pháp dù không chứa chữ "ngữ pháp"', () => {
    expect(matchAiErrorTags(['chia động từ sai'], 'mini')).toEqual(['m_gram'])
    expect(matchAiErrorTags(['giới từ'], 'mini')).toEqual(['m_gram'])
  })

  it('khớp nhiều lỗi cùng lúc, không trùng lặp id', () => {
    const tags = matchAiErrorTags(['chính tả', 'phát âm', 'chính tả'], 'mini')
    expect(tags.sort()).toEqual(['m_pron', 'm_spell'])
  })

  it('dùng đúng bộ tag theo compKey (mini khác listen)', () => {
    expect(matchAiErrorTags(['không nghe kịp tốc độ'], 'listen')).toEqual(['l_speed'])
    expect(matchAiErrorTags(['không nghe kịp tốc độ'], 'mini')).toEqual([])
  })

  it('lỗi không khớp từ khóa nào thì trả về rỗng, không đoán bừa', () => {
    expect(matchAiErrorTags(['học sinh viết chữ hơi nhỏ'], 'mini')).toEqual([])
  })

  it('tiêu chí không dùng hệ tag lỗi (hw, attitude...) trả về rỗng', () => {
    expect(matchAiErrorTags(['chính tả'], 'hw')).toEqual([])
  })

  it('không có lỗi nào thì trả về rỗng', () => {
    expect(matchAiErrorTags([], 'mini')).toEqual([])
  })
})
