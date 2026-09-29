import Anthropic from '@anthropic-ai/sdk'
import { env } from '../config/env.js'

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('AI_NOT_CONFIGURED')
  }
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  return client
}

export interface AiGradeResult {
  /** Tên học sinh AI đọc được trên bài (nguyên văn, có thể sai/thiếu dấu). */
  studentName: string
  /** Điểm đạt được, theo đúng thang điểm GỐC của bài giấy đó (VD 8/10 câu). */
  rawScore: number
  /** Thang điểm gốc của bài giấy đó — KHÔNG PHẢI thang điểm của rubric app,
   *  quy đổi % ở tầng gọi (dùng rawScore/rawMax) để khớp đúng tiêu chí giáo
   *  viên chọn (Mini Test/Nghe/...), vì mỗi bài giấy có thể có số câu khác nhau. */
  rawMax: number
  /** Các lỗi/dạng sai cụ thể AI nhận thấy — hiển thị cho giáo viên tham khảo,
   *  không tự ghi vào đâu cả. */
  errors: string[]
  /** AI không chắc chắn (chữ mờ, ảnh xấu, không thấy tên...) — giáo viên nên
   *  kiểm tra kỹ hơn bình thường trước khi lưu. */
  lowConfidence: boolean
  /** AI không đọc được gì có ý nghĩa (ảnh mờ/lạc đề) — không có điểm để dùng. */
  unreadable: boolean
}

const SYSTEM_PROMPT = `Bạn đang giúp một trung tâm Anh ngữ tại Việt Nam chấm bài kiểm tra giấy từ ảnh chụp.
Nhiệm vụ:
1. Đọc TÊN HỌC SINH viết tay/in trên đầu bài (thường ở góc trên). Nếu không thấy tên, để studentName rỗng.
2. Đếm tổng số câu của bài và số câu học sinh làm đúng. Học sinh Việt Nam chọn đáp án trắc nghiệm theo NHIỀU KIỂU khác nhau, có thể lẫn nhiều kiểu trong cùng 1 bài — nhận diện đúng đáp án học sinh chọn ở TỪNG kiểu sau:
   - Khoanh tròn quanh chữ cái/đáp án (khoanh vòng, có thể khoanh hở hoặc khoanh lại nhiều lần nếu đổi ý — lấy khoanh SAU CÙNG, ý gạch/xóa khoanh cũ nghĩa là đã đổi đáp án).
   - Đánh dấu tick/dấu ✓ hoặc dấu x bên cạnh đáp án.
   - Tô đậm/gạch chéo kín 1 ô hoặc 1 chữ cái (kiểu tô phiếu trắc nghiệm).
   - Nối bằng đường kẻ giữa 2 cột (dạng ghép câu/matching) — mỗi đường nối đúng tính 1 câu đúng.
   - Điền trực tiếp câu trả lời vào chỗ trống viết tay (fill-in-the-blank) — so khớp với đáp án đúng của đề nếu đề có ghi đáp án, hoặc dựa vào kiến thức tiếng Anh thông thường nếu đề không ghi đáp án.
   Nếu bài ĐÃ được giáo viên chấm sẵn (có dấu đúng/sai, gạch chéo, hoặc điểm số viết tay của giáo viên trên bài) thì ưu tiên đọc theo dấu chấm đó thay vì tự chấm lại. Nếu không đủ căn cứ để tính điểm, đặt unreadable=true.
3. Liệt kê ngắn gọn các dạng lỗi sai lặp lại (VD "chia động từ", "giới từ", "chính tả") — tối đa 5 mục, bằng tiếng Việt.
4. Nếu chữ viết khó đọc, ảnh mờ, thiếu góc, đáp án tô/khoanh không rõ ràng (mờ, chồng lấn nhiều lựa chọn), hoặc không chắc chắn về tên/điểm — đặt lowConfidence=true.

CHỈ trả về JSON hợp lệ theo đúng schema sau, không thêm chữ nào khác ngoài JSON:
{"studentName": string, "rawScore": number, "rawMax": number, "errors": string[], "lowConfidence": boolean, "unreadable": boolean}`

/** Gửi 1 ảnh bài kiểm tra giấy cho AI đọc tên + chấm điểm. Không lưu ảnh lại
 *  ở đâu cả — chỉ dùng cho đúng 1 lần gọi này rồi bỏ, giảm tối đa dữ liệu
 *  ảnh trẻ em phải đi qua bên thứ ba. */
export async function gradeTestPhoto(imageBuffer: Buffer, mimeType: string): Promise<AiGradeResult> {
  const anthropic = getClient()
  const media = (['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const).includes(mimeType as never)
    ? (mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif')
    : 'image/jpeg'

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media, data: imageBuffer.toString('base64') } },
          { type: 'text', text: 'Đọc tên học sinh và chấm điểm bài này. Chỉ trả JSON theo đúng schema.' },
        ],
      },
    ],
  })

  const textBlock = msg.content.find((b) => b.type === 'text')
  const raw = textBlock && 'text' in textBlock ? textBlock.text : ''
  // Model đôi khi bọc JSON trong ```json ... ``` dù đã dặn — bóc ra trước khi parse.
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI_BAD_RESPONSE')

  let parsed: Partial<AiGradeResult>
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('AI_BAD_RESPONSE')
  }

  return {
    studentName: String(parsed.studentName ?? '').trim(),
    rawScore: Math.max(0, Number(parsed.rawScore) || 0),
    rawMax: Math.max(0, Number(parsed.rawMax) || 0),
    errors: Array.isArray(parsed.errors) ? parsed.errors.map(String).slice(0, 5) : [],
    lowConfidence: !!parsed.lowConfidence,
    unreadable: !!parsed.unreadable,
  }
}
