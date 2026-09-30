import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { env } from '../config/env.js'

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('AI_NOT_CONFIGURED')
  }
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  return client
}

// Claude tính phí ảnh theo (rộng × cao)/750 token — ảnh chụp thẳng từ điện
// thoại thường 3000-4000px/cạnh, tốn gấp NHIỀU LẦN mức cần thiết mà không
// đọc chữ tốt hơn (mô hình tự thu nhỏ nội bộ khi ảnh vượt quá mức này).
// Resize + nén JPEG trước khi gửi — giảm chi phí rõ rệt, không giảm độ đọc
// được chữ với ảnh chụp bài kiểm tra giấy thông thường.
const MAX_DIMENSION = 1568

async function prepareImage(imageBuffer: Buffer): Promise<{ buffer: Buffer; mediaType: 'image/jpeg' }> {
  const resized = await sharp(imageBuffer)
    .rotate() // tự xoay theo đúng chiều thật (EXIF) — ảnh chụp điện thoại hay bị lật khi đọc buffer thô
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer()
  return { buffer: resized, mediaType: 'image/jpeg' }
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
  /** ĐÚNG CHỖ nghi ngờ, không phải cả ảnh chung chung — VD "Câu 3: không
   *  chắc chữ đầu là 'will' hay 'is'". Giáo viên xem đúng chỗ này thay vì
   *  phải đọc lại từ đầu cả bài. Rỗng nếu không có chỗ nào đáng ngờ. */
  ambiguousItems: string[]
  /** true = điểm này AI ĐỌC LẠI từ điểm/dấu giáo viên đã chấm sẵn trên bài
   *  (đáng tin hơn — chỉ là chép lại số có sẵn). false = AI TỰ CHẤM từ đầu
   *  (kém chắc chắn hơn — AI vừa phải đọc chữ vừa phải tự biết đáp án đúng).
   *  Hiện rõ cho giáo viên biết để cân nhắc mức độ cần xem lại. */
  fromExistingGrade: boolean
}

const SYSTEM_PROMPT = `Bạn đang giúp một trung tâm Anh ngữ tại Việt Nam chấm bài kiểm tra giấy từ ảnh chụp.
Nhiệm vụ:
1. Đọc TÊN HỌC SINH viết tay/in trên đầu bài (thường ở góc trên). Nếu không thấy tên, để studentName rỗng.

2. TRƯỚC TIÊN, tìm xem bài này ĐÃ ĐƯỢC GIÁO VIÊN CHẤM SẴN chưa — đây là trường hợp phổ biến nhất và LUÔN ưu tiên đọc lại số có sẵn thay vì tự chấm. Dấu hiệu đã chấm sẵn:
   - Số điểm viết tay, thường được khoanh tròn/đóng khung, đặt ở góc trang hoặc lề mỗi phần (VD "9/10", "5", "4/5", "8" khoanh tròn). Bài có thể có NHIỀU con số như vậy nếu chấm riêng từng phần (I, II, III...) — CỘNG DỒN: rawScore = tổng số điểm đạt của mọi phần, rawMax = tổng số điểm tối đa của mọi phần đó (VD phần I được "5" khoanh trên tổng 5, phần III được "9/10" → rawScore=14, rawMax=15).
   - Dấu ✓/✗ hoặc gạch chéo ngay cạnh từng câu, đánh dấu đúng/sai cho từng câu học sinh đã làm.
   - Chữ sửa lỗi bằng mực khác màu (thường đỏ) ngay trên bài.
   Nếu tìm thấy các dấu hiệu này, đặt fromExistingGrade=true và CHỈ đếm/cộng lại đúng những gì giáo viên đã đánh dấu — không tự ý chấm lại hay đoán đáp án đúng/sai theo ý riêng.

3. CHỈ KHI KHÔNG có dấu hiệu đã chấm sẵn nào ở bước 2, mới tự chấm từ đầu: đặt fromExistingGrade=false, đếm tổng số câu của bài và số câu học sinh làm đúng. Học sinh Việt Nam chọn đáp án trắc nghiệm theo NHIỀU KIỂU khác nhau, có thể lẫn nhiều kiểu trong cùng 1 bài — nhận diện đúng đáp án học sinh chọn ở TỪNG kiểu sau:
   - Khoanh tròn quanh chữ cái/đáp án (khoanh vòng, có thể khoanh hở hoặc khoanh lại nhiều lần nếu đổi ý — lấy khoanh SAU CÙNG, ý gạch/xóa khoanh cũ nghĩa là đã đổi đáp án).
   - Đánh dấu tick/dấu ✓ hoặc dấu x bên cạnh đáp án.
   - Tô đậm/gạch chéo kín 1 ô hoặc 1 chữ cái (kiểu tô phiếu trắc nghiệm).
   - Nối bằng đường kẻ giữa 2 cột (dạng ghép câu/matching) — mỗi đường nối đúng tính 1 câu đúng.
   - Điền trực tiếp câu trả lời vào chỗ trống viết tay (fill-in-the-blank) — so khớp với đáp án đúng của đề nếu đề có ghi đáp án, hoặc dựa vào kiến thức tiếng Anh thông thường nếu đề không ghi đáp án.
   Nếu giáo viên đã CUNG CẤP SẴN đáp án đúng của đề (xem phần "ĐÁP ÁN ĐÚNG" bên dưới, nếu có) thì LUÔN dùng đáp án đó để so khớp — đây là nguồn đáng tin cậy nhất, không tự đoán theo kiến thức riêng nữa dù có chắc đến đâu.
   Nếu không đủ căn cứ để tính điểm, đặt unreadable=true.

4. Liệt kê ngắn gọn các dạng lỗi sai lặp lại (VD "chia động từ", "giới từ", "chính tả") — tối đa 5 mục, bằng tiếng Việt. Nếu fromExistingGrade=true và không thấy ghi chú lỗi cụ thể trên bài, để errors rỗng — đừng tự bịa lỗi.

5. Nếu chữ viết khó đọc, ảnh mờ, thiếu góc, đáp án/điểm số không rõ ràng (mờ, chồng lấn, số bị che), hoặc không chắc chắn về tên/điểm — đặt lowConfidence=true.

6. Với TỪNG chỗ cụ thể bạn không chắc chắn (tên, 1 câu, 1 con số điểm...) — liệt kê vào ambiguousItems, mỗi mục nói rõ Ở ĐÂU và NGHI NGỜ GÌ, để giáo viên xem đúng chỗ đó thay vì đọc lại từ đầu (VD "Tên học sinh: chữ đầu không rõ là 'Đ' hay 'D'", "Câu 5: khoanh đè lên 2 đáp án B và C"). Tối đa 6 mục. Nếu không có gì đáng ngờ, để rỗng — đừng liệt kê những chỗ bạn thật sự đã đọc rõ.

CHỈ trả về JSON hợp lệ theo đúng schema sau, không thêm chữ nào khác ngoài JSON:
{"studentName": string, "rawScore": number, "rawMax": number, "errors": string[], "lowConfidence": boolean, "unreadable": boolean, "fromExistingGrade": boolean, "ambiguousItems": string[]}`

/** Gửi 1 ảnh bài kiểm tra giấy cho AI đọc tên + chấm điểm. Không lưu ảnh lại
 *  ở đâu cả — chỉ dùng cho đúng 1 lần gọi này rồi bỏ, giảm tối đa dữ liệu
 *  ảnh trẻ em phải đi qua bên thứ ba.
 *  `answerKey`: đáp án đúng của đề (giáo viên tự gõ, dạng chữ tự do — VD
 *  "1-B 2-C 3-A..." hoặc liệt kê từng dòng) — nếu có, AI so khớp theo đáp án
 *  này thay vì tự đoán, chính xác hơn hẳn với bài CHƯA được chấm tay sẵn. */
export async function gradeTestPhoto(
  imageBuffer: Buffer, mimeType: string, answerKey?: string,
): Promise<AiGradeResult> {
  void mimeType // resize luôn về JPEG bên dưới — không cần giữ định dạng gốc
  const anthropic = getClient()
  const { buffer, mediaType } = await prepareImage(imageBuffer)

  const instructionText = answerKey?.trim()
    ? `Đọc tên học sinh và chấm điểm bài này.\n\nĐÁP ÁN ĐÚNG của đề (do giáo viên cung cấp — ưu tiên dùng để so khớp thay vì tự đoán):\n${answerKey.trim()}\n\nChỉ trả JSON theo đúng schema.`
    : 'Đọc tên học sinh và chấm điểm bài này. Chỉ trả JSON theo đúng schema.'

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    // system prompt CỐ ĐỊNH, gọi lặp lại y hệt cho mọi ảnh trong 1 lượt chấm
    // — đánh dấu cache để những lần gọi sau (trong ~5 phút) chỉ tính phí đọc
    // cache (rẻ hơn nhiều lần), thay vì tính lại phí input đầy đủ mỗi lần.
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
          { type: 'text', text: instructionText },
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
    fromExistingGrade: !!parsed.fromExistingGrade,
    ambiguousItems: Array.isArray(parsed.ambiguousItems) ? parsed.ambiguousItems.map(String).slice(0, 6) : [],
  }
}

export interface AiSolveResult {
  /** Đáp án đúng AI tự giải, dạng chữ tự do dễ đọc (VD "1-B 2-C 3-A..."),
   *  giáo viên XEM LẠI VÀ SỬA ĐƯỢC trước khi dùng — đây là bản NHÁP AI tự
   *  giải, không phải đáp án chính thức đã được xác nhận. */
  answerKey: string
  /** Có câu nào AI không chắc chắn về đáp án đúng (câu khó/hiếm, đề mơ hồ,
   *  ảnh mờ không đọc rõ đề...) — giáo viên nên xem kỹ các câu đó. */
  uncertainNotes: string[]
  lowConfidence: boolean
  unreadable: boolean
}

const SOLVE_SYSTEM_PROMPT = `Bạn đang giúp một trung tâm Anh ngữ tại Việt Nam CHUẨN BỊ đáp án cho 1 đề kiểm tra tiếng Anh (KHÔNG PHẢI bài làm của học sinh — đây là đề gốc/đề mẫu còn trống hoặc đã có đáp án đúng in sẵn).
Nhiệm vụ:
1. Đọc toàn bộ đề, xác định từng câu hỏi và số thứ tự của nó.
2. Nếu đề đã có sẵn đáp án đúng (in sẵn, hoặc giáo viên đã ghi đáp án lên đề) — đọc lại chính xác đáp án đó, không tự giải lại.
3. Nếu đề CHƯA có đáp án — tự giải từng câu bằng kiến thức tiếng Anh, chọn đáp án đúng nhất.
4. Trả về đáp án dạng chữ ngắn gọn, dễ đọc, mỗi câu 1 mục theo đúng số thứ tự trong đề (VD "1-B 2-C 3-A" cho trắc nghiệm, "1. is read" cho điền câu, "1-Correct" cho đúng/sai...). Giữ đúng thứ tự câu trong đề.
5. Với câu nào bạn KHÔNG chắc chắn (ngữ pháp mơ hồ, có thể có nhiều đáp án hợp lý, chữ đề mờ không đọc rõ) — vẫn đưa ra đáp án bạn cho là đúng nhất, nhưng liệt kê số câu đó vào uncertainNotes kèm lý do ngắn gọn, để giáo viên xem lại đúng những câu đó.
6. Nếu ảnh không phải đề kiểm tra, hoặc mờ tới mức không đọc được đề gì cả, đặt unreadable=true.
7. Nếu ảnh chụp thiếu góc/mờ một phần nhưng vẫn đọc được phần lớn đề, đặt lowConfidence=true và vẫn cố gắng giải hết phần đọc được.

CHỈ trả về JSON hợp lệ theo đúng schema sau, không thêm chữ nào khác ngoài JSON:
{"answerKey": string, "uncertainNotes": string[], "lowConfidence": boolean, "unreadable": boolean}`

/** Gửi 1 ảnh ĐỀ MẪU (không phải bài học sinh) cho AI tự giải ra đáp án đúng
 *  — dùng để tạo đáp án 1 lần cho cả xấp bài, thay vì để AI tự giải lại độc
 *  lập từng ảnh học sinh (dễ giải khác nhau giữa các lần gọi, chấm không
 *  nhất quán cho cùng 1 đề). Đáp án trả về LUÔN LÀ BẢN NHÁP — giáo viên phải
 *  xem lại/sửa trước khi dùng để chấm cả lớp, không dùng thẳng. */
export async function solveTestPhoto(imageBuffer: Buffer, mimeType: string): Promise<AiSolveResult> {
  void mimeType
  const anthropic = getClient()
  const { buffer, mediaType } = await prepareImage(imageBuffer)

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1536,
    system: [{ type: 'text', text: SOLVE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
          { type: 'text', text: 'Đọc đề này và đưa ra đáp án đúng cho từng câu. Chỉ trả JSON theo đúng schema.' },
        ],
      },
    ],
  })

  const textBlock = msg.content.find((b) => b.type === 'text')
  const raw = textBlock && 'text' in textBlock ? textBlock.text : ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI_BAD_RESPONSE')

  let parsed: Partial<AiSolveResult>
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('AI_BAD_RESPONSE')
  }

  return {
    answerKey: String(parsed.answerKey ?? '').trim(),
    uncertainNotes: Array.isArray(parsed.uncertainNotes) ? parsed.uncertainNotes.map(String).slice(0, 10) : [],
    lowConfidence: !!parsed.lowConfidence,
    unreadable: !!parsed.unreadable,
  }
}
