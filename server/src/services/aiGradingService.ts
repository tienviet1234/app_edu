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
// Chỉ dùng cho lượt "Chấm kỹ hơn" (giáo viên chủ động bấm cho 1 ảnh cụ thể,
// không áp dụng mặc định cho cả xấp) — ảnh giữ chi tiết hơn cho chữ viết
// tay nhỏ, đổi lại tốn phí hơn nên KHÔNG dùng làm mặc định.
const MAX_DIMENSION_HIGH = 2200

async function prepareImage(imageBuffer: Buffer, highRes = false): Promise<{ buffer: Buffer; mediaType: 'image/jpeg' }> {
  const dim = highRes ? MAX_DIMENSION_HIGH : MAX_DIMENSION
  const resized = await sharp(imageBuffer)
    .rotate() // tự xoay theo đúng chiều thật (EXIF) — ảnh chụp điện thoại hay bị lật khi đọc buffer thô
    .resize({ width: dim, height: dim, fit: 'inside', withoutEnlargement: true })
    // Tăng độ tương phản (kéo dải sáng-tối cho đầy khung, giúp chữ mực nhạt/
    // ảnh chụp thiếu sáng nổi rõ hơn so với nền giấy) và làm nét nhẹ (giúp
    // đường nét chữ viết tay/khoanh tròn sắc hơn) — 2 bước xử lý ảnh chuẩn
    // trong OCR, miễn phí (không tốn thêm phí gọi AI), không hại ảnh vốn đã
    // rõ vì mức áp dụng nhẹ.
    .normalize()
    .sharpen({ sigma: 0.8 })
    .jpeg({ quality: 82 })
    .toBuffer()
  return { buffer: resized, mediaType: 'image/jpeg' }
}

type ContentSource =
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }

/** Chuẩn bị nội dung gửi cho AI — nhận cả ẢNH (jpeg/png/webp, được resize +
 *  tăng nét như trước) LẪN FILE PDF (gửi thẳng, không qua sharp vì sharp
 *  không xử lý được PDF — Claude tự đọc PDF trực tiếp qua khối "document",
 *  không cần tự chuyển từng trang PDF sang ảnh trước). */
async function prepareContent(buffer: Buffer, mimeType: string, highRes = false): Promise<ContentSource> {
  if (mimeType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
  }
  const { buffer: img, mediaType } = await prepareImage(buffer, highRes)
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: img.toString('base64') } }
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
  /** AI không đủ căn cứ để tính ra 1 ĐIỂM SỐ đáng tin — KHÔNG có nghĩa là
   *  không đọc được GÌ CẢ. studentName/questions/ambiguousItems vẫn phải
   *  được điền đầy đủ nhất có thể (xem bước 3 trong SYSTEM_PROMPT), để giáo
   *  viên tự đối chiếu với đáp án mẫu và chấm tay thay vì phải đọc lại ảnh
   *  từ đầu. Chỉ khi ảnh THỰC SỰ không thấy chữ nào (mờ hoàn toàn/lạc đề)
   *  thì các field đó mới hợp lý để trống. */
  unreadable: boolean
  /** ĐÚNG CHỖ nghi ngờ, không phải cả ảnh chung chung. Mỗi mục có sẵn vài
   *  phương án AI đoán được (suggestions) để giáo viên bấm chọn nhanh, thay
   *  vì phải tự gõ lại từ đầu — nếu không phương án nào đúng, giáo viên tự
   *  gõ câu trả lời thật vào. Rỗng nếu không có chỗ nào đáng ngờ. */
  ambiguousItems: Array<{
    description: string
    suggestions: string[]
    /** Vị trí ƯỚC LƯỢNG (không cần chính xác tuyệt đối) của chỗ nghi ngờ đó
     *  TRÊN ẢNH — x/y tính theo % chiều rộng/cao ảnh (0-100, góc trên-trái là
     *  0,0). Dùng để ghim ghi chú gần đúng khu vực lên ảnh gốc cho giáo viên
     *  dễ nhìn ra chỗ cần xem kỹ, không thay thế được description bằng chữ. */
    position: { x: number; y: number }
  }>
  /** true = điểm này AI ĐỌC LẠI từ điểm/dấu giáo viên đã chấm sẵn trên bài
   *  (đáng tin hơn — chỉ là chép lại số có sẵn). false = AI TỰ CHẤM từ đầu
   *  (kém chắc chắn hơn — AI vừa phải đọc chữ vừa phải tự biết đáp án đúng).
   *  Hiện rõ cho giáo viên biết để cân nhắc mức độ cần xem lại. */
  fromExistingGrade: boolean
  /** MỨC NGHIÊM TRỌNG HƠN lowConfidence — true nghĩa là AI cho rằng KHÔNG NÊN
   *  dùng điểm AI gợi ý, giáo viên nên tách bài này ra và tự chấm tay hoàn
   *  toàn (chữ viết quá xấu/nguệch ngoạc). Chỉ có ý nghĩa khi fromExistingGrade
   *  =false (bài chưa chấm sẵn) — bài đã có dấu chấm sẵn thì hầu như không cần. */
  needsManualGrading: boolean
  /** Lý do ngắn gọn khi needsManualGrading=true — hiện cho giáo viên biết vì
   *  sao, rỗng nếu needsManualGrading=false. */
  manualGradingReason: string
  /** Độ tin cậy của TÊN đọc được — "high" nếu tên IN SẴN (không phải viết
   *  tay) hoặc chữ viết tay rất rõ ràng dễ đọc; "low" nếu chữ viết tay khó
   *  đọc/không chắc chắn. Dùng để quyết định có cần giáo viên tự chọn lại
   *  học sinh hay chỉ cần xác nhận 1 cái khi đã khớp đúng 1 em. */
  nameConfidence: 'high' | 'low'
  /** Chi tiết TỪNG CÂU — chỉ có khi fromExistingGrade=false (tự chấm, AI biết
   *  rõ từng câu). Giáo viên sửa lại studentAnswer/correct trực tiếp trên
   *  từng dòng khi chữ quá xấu đọc sai — rawScore/rawMax được TÍNH LẠI ngay
   *  từ danh sách này ở tầng gọi (đếm số correct=true), không cần gõ lại số
   *  tổng tay. Rỗng nếu fromExistingGrade=true (chỉ có điểm tổng viết sẵn,
   *  không tách được từng câu). */
  questions: Array<{ no: string; studentAnswer: string; correct: boolean; uncertain: boolean }>
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
   Nếu không đủ căn cứ để tính RA MỘT ĐIỂM SỐ đáng tin (chữ quá xấu, đáp án không rõ đúng/sai), đặt unreadable=true — NHƯNG VẪN PHẢI điền studentName và liệt kê ĐẦY ĐỦ questions với NGUYÊN VĂN chữ bạn đọc được ở mỗi câu (studentAnswer), dù không chắc đúng/sai (đặt correct=false, uncertain=true cho các câu đó) — giáo viên cần xem được TOÀN BỘ nội dung bạn đọc được để tự đối chiếu với đáp án mẫu và chấm tay, không phải đọc lại ảnh gốc từ đầu. Chỉ để questions rỗng khi ảnh THỰC SỰ không thấy chữ nào (mờ hoàn toàn/lạc đề/không phải bài kiểm tra).

4. Liệt kê ngắn gọn các dạng lỗi sai lặp lại (VD "chia động từ", "giới từ", "chính tả") — tối đa 5 mục, bằng tiếng Việt. Nếu fromExistingGrade=true và không thấy ghi chú lỗi cụ thể trên bài, để errors rỗng — đừng tự bịa lỗi.

5. Nếu chữ viết khó đọc, ảnh mờ, thiếu góc, đáp án/điểm số không rõ ràng (mờ, chồng lấn, số bị che), hoặc không chắc chắn về tên/điểm — đặt lowConfidence=true.

6. Đánh giá ĐỘ CHẮC CHẮN của TÊN học sinh đọc được ở bước 1 — đặt nameConfidence="high" nếu tên được IN SẴN (chữ máy tính/font in trên đề, không phải viết tay), HOẶC chữ viết tay rất rõ ràng, ngay ngắn, không thể nhầm sang tên nào khác. Đặt nameConfidence="low" nếu tên viết tay khó đọc, nét chữ nguệch ngoạc, hoặc bạn phải đoán giữa vài cách đọc khác nhau.

7. Đánh giá xem bài này có NÊN ĐỂ GIÁO VIÊN TỰ CHẤM TAY HOÀN TOÀN thay vì dùng điểm AI hay không — mức nghiêm trọng HƠN lowConfidence. CHỈ áp dụng khi fromExistingGrade=false (bài chưa có ai chấm sẵn): nếu chữ viết/đáp án của học sinh (không chỉ riêng tên) quá xấu, nguệch ngoạc, nhiều chỗ không thể phân biệt được đang chọn đáp án nào — đặt needsManualGrading=true và manualGradingReason là 1 câu ngắn gọn tiếng Việt giải thích cụ thể (VD "Chữ viết tay nguệch ngoạc, nhiều câu không rõ khoanh vào đáp án nào"). Nếu bài đủ rõ để tự chấm bình thường (kể cả khi có vài chỗ lẻ tẻ phải đưa vào ambiguousItems), đặt needsManualGrading=false và manualGradingReason rỗng. Nếu fromExistingGrade=true (chỉ đọc lại số có sẵn) thì hầu như luôn để needsManualGrading=false, trừ khi chính con số điểm giáo viên ghi sẵn cũng không đọc nổi.

8. CHỈ KHI fromExistingGrade=false (tự chấm từ đầu) — liệt kê CHI TIẾT TỪNG CÂU vào mảng questions, để giáo viên xem/sửa lại đúng từng câu thay vì chỉ 1 con số tổng:
   - no: số thứ tự câu, theo ĐÚNG cách đánh số của đề (VD "1", "I.3").
   - studentAnswer: đáp án bạn đọc được học sinh chọn/viết cho câu đó (VD "B", "is read"). Nếu chữ quá xấu không đọc nổi, để "?" — đừng đoán bừa.
   - correct: true nếu đúng theo đáp án đúng của đề (so theo "ĐÁP ÁN ĐÚNG" bên dưới nếu giáo viên có cung cấp, không thì theo kiến thức tiếng Anh), false nếu sai hoặc không xác định được (studentAnswer="?").
   - uncertain: true nếu bạn không chắc chắn đọc đúng chữ viết tay ở câu này (kể cả khi vẫn đoán ra được studentAnswer) — giáo viên sẽ được nhắc xem lại đúng các câu này.
   Liệt kê ĐẦY ĐỦ mọi câu của bài, không chỉ câu nghi ngờ. Nếu fromExistingGrade=true, để questions rỗng (không tách được từng câu từ điểm tổng viết sẵn).

9. Với TỪNG chỗ TỔNG QUÁT bạn không chắc chắn mà KHÔNG gắn với 1 câu cụ thể trong questions (VD tên học sinh, hoặc 2 con số điểm viết ở 2 góc trang mâu thuẫn nhau) — liệt kê vào ambiguousItems, mỗi mục gồm:
   - description: nói rõ Ở ĐÂU và NGHI NGỜ GÌ, để giáo viên xem đúng chỗ đó thay vì đọc lại từ đầu (VD "Tên học sinh: chữ đầu không rõ là 'Đ' hay 'D'").
   - suggestions: LIỆT KÊ SẴN các khả năng bạn nghĩ tới (tối đa 4), để giáo viên bấm chọn nhanh thay vì tự gõ lại. Nếu thật sự không đoán được phương án nào hợp lý, để suggestions rỗng — đừng bịa ra phương án không có căn cứ.
   - position: ƯỚC LƯỢNG gần đúng vị trí của chỗ đó trên ảnh — {"x": số 0-100 tính từ mép trái sang phải, "y": số 0-100 tính từ mép trên xuống dưới}. KHÔNG cần chính xác tuyệt đối từng pixel, chỉ cần đúng khu vực để giáo viên nhìn ảnh gốc biết nhìn vào đâu (VD góc trên bên trái ≈ {"x":10,"y":10}; giữa trang ≈ {"x":50,"y":50}; cuối trang bên phải ≈ {"x":85,"y":90}).
   Tối đa 6 mục ambiguousItems. Đừng lặp lại nghi ngờ về TỪNG CÂU ở đây nữa — cái đó đã có uncertain trong questions rồi.

CHỈ trả về JSON hợp lệ theo đúng schema sau, không thêm chữ nào khác ngoài JSON:
{"studentName": string, "rawScore": number, "rawMax": number, "errors": string[], "lowConfidence": boolean, "unreadable": boolean, "fromExistingGrade": boolean, "needsManualGrading": boolean, "manualGradingReason": string, "nameConfidence": "high"|"low", "questions": [{"no": string, "studentAnswer": string, "correct": boolean, "uncertain": boolean}], "ambiguousItems": [{"description": string, "suggestions": string[], "position": {"x": number, "y": number}}]}`

/** Gửi 1 ảnh bài kiểm tra giấy cho AI đọc tên + chấm điểm. Không lưu ảnh lại
 *  ở đâu cả — chỉ dùng cho đúng 1 lần gọi này rồi bỏ, giảm tối đa dữ liệu
 *  ảnh trẻ em phải đi qua bên thứ ba.
 *  `answerKey`: đáp án đúng của đề (giáo viên tự gõ, dạng chữ tự do — VD
 *  "1-B 2-C 3-A..." hoặc liệt kê từng dòng) — nếu có, AI so khớp theo đáp án
 *  này thay vì tự đoán, chính xác hơn hẳn với bài CHƯA được chấm tay sẵn.
 *  `highRes`: dùng độ phân giải cao hơn mức mặc định — CHỈ bật khi giáo viên
 *  chủ động bấm "Chấm kỹ hơn" cho 1 ảnh cụ thể, không dùng mặc định vì tốn
 *  phí hơn.
 *  `handwritingNote`: ghi chú đặc điểm nét chữ của ĐÚNG học sinh này (VD
 *  "hay viết 't' giống 'l'") — CHỈ có khi đã xác định được học sinh (dùng ở
 *  lượt "Chấm kỹ hơn", không dùng được ở lượt chấm đầu vì lúc đó chưa biết
 *  là em nào). Không phải ảnh, chỉ là vài dòng chữ giáo viên tự gõ. */
export async function gradeTestPhoto(
  imageBuffer: Buffer, mimeType: string, answerKey?: string, highRes = false, handwritingNote?: string,
): Promise<AiGradeResult> {
  const anthropic = getClient()
  const contentSource = await prepareContent(imageBuffer, mimeType, highRes)

  const parts = ['Đọc tên học sinh và chấm điểm bài này.']
  if (answerKey?.trim()) {
    parts.push(`\nĐÁP ÁN ĐÚNG của đề (do giáo viên cung cấp — ưu tiên dùng để so khớp thay vì tự đoán):\n${answerKey.trim()}`)
  }
  if (handwritingNote?.trim()) {
    parts.push(`\nGHI CHÚ NÉT CHỮ của đúng học sinh này (giáo viên đã ghi từ trước, dùng để đọc chữ viết tay chính xác hơn): ${handwritingNote.trim()}`)
  }
  parts.push('\nChỉ trả JSON theo đúng schema.')
  const instructionText = parts.join('\n')

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    // Nâng từ 1024 — giờ liệt kê CHI TIẾT TỪNG CÂU (mảng questions) khi tự
    // chấm, dài hơn hẳn kiểu cũ chỉ trả 1 con số tổng; đề 30-40 câu dễ vượt
    // 1024 token nếu giữ mức cũ.
    max_tokens: 2048,
    // TẮT "extended thinking" — model này mặc định tự suy luận dài trước khi
    // trả lời, và phần suy luận đó CŨNG tính vào max_tokens. Với đề bài
    // nhiều bước (bước 1: tìm dấu chấm sẵn, bước 2: so đáp án mẫu...), model
    // từng suy luận NGỐN HẾT SẠCH token, không còn chỗ viết JSON trả lời —
    // kết quả rỗng, bị coi là "không đọc được" dù ảnh hoàn toàn rõ. Việc
    // chấm điểm này không cần suy luận dài dòng, tắt hẳn cho chắc và rẻ hơn
    // (thinking token tính phí như output bình thường).
    thinking: { type: 'disabled' },
    // system prompt CỐ ĐỊNH, gọi lặp lại y hệt cho mọi ảnh trong 1 lượt chấm
    // — đánh dấu cache để những lần gọi sau (trong ~5 phút) chỉ tính phí đọc
    // cache (rẻ hơn nhiều lần), thay vì tính lại phí input đầy đủ mỗi lần.
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          contentSource,
          { type: 'text', text: instructionText },
        ],
      },
    ],
  })

  const textBlock = msg.content.find((b) => b.type === 'text')
  const raw = textBlock && 'text' in textBlock ? textBlock.text : ''
  if (process.env.AI_DEBUG === '1') {
    console.error('[AI_DEBUG] stop_reason=', msg.stop_reason, 'usage=', JSON.stringify(msg.usage))
    console.error('[AI_DEBUG] raw text:', raw)
  }
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
    needsManualGrading: !!parsed.needsManualGrading,
    manualGradingReason: typeof parsed.manualGradingReason === 'string' ? parsed.manualGradingReason.trim().slice(0, 200) : '',
    nameConfidence: parsed.nameConfidence === 'high' ? 'high' : 'low',
    questions: Array.isArray(parsed.questions)
      ? parsed.questions.slice(0, 60).map((q) => {
          const item = q as { no?: unknown; studentAnswer?: unknown; correct?: unknown; uncertain?: unknown }
          return {
            no: String(item?.no ?? '').trim(),
            studentAnswer: String(item?.studentAnswer ?? '').trim(),
            correct: !!item?.correct,
            uncertain: !!item?.uncertain,
          }
        }).filter((q) => q.no)
      : [],
    ambiguousItems: Array.isArray(parsed.ambiguousItems)
      ? parsed.ambiguousItems.slice(0, 6).map((it) => {
          const item = it as { description?: unknown; suggestions?: unknown; position?: unknown }
          const pos = item?.position as { x?: unknown; y?: unknown } | undefined
          const clamp = (n: unknown) => Math.min(100, Math.max(0, Number(n)))
          const x = pos && Number.isFinite(Number(pos.x)) ? clamp(pos.x) : 50
          const y = pos && Number.isFinite(Number(pos.y)) ? clamp(pos.y) : 50
          return {
            description: String(item?.description ?? '').trim(),
            suggestions: Array.isArray(item?.suggestions) ? item.suggestions.map(String).slice(0, 4) : [],
            position: { x, y },
          }
        }).filter((it) => it.description)
      : [],
  }
}

export interface AiSolveResult {
  /** Đáp án đúng AI tự giải, MỖI DÒNG 1 PHẦN TỬ (tiêu đề phần hoặc 1 câu) —
   *  giáo viên SỬA/XÁC NHẬN/XOÁ ĐƯỢC TỪNG DÒNG trước khi dùng, đây là bản
   *  NHÁP AI tự giải, không phải đáp án chính thức đã được xác nhận. */
  lines: Array<{ text: string; uncertain: boolean; note: string }>
  lowConfidence: boolean
  unreadable: boolean
}

const SOLVE_SYSTEM_PROMPT = `Bạn đang giúp một trung tâm Anh ngữ tại Việt Nam CHUẨN BỊ đáp án cho 1 đề kiểm tra tiếng Anh (KHÔNG PHẢI bài làm của học sinh — đây là đề gốc/đề mẫu còn trống hoặc đã có đáp án đúng in sẵn).
Nhiệm vụ:
1. Đọc toàn bộ đề, xác định từng câu hỏi và số thứ tự của nó.
2. Nếu đề đã có sẵn đáp án đúng (in sẵn, hoặc giáo viên đã ghi đáp án lên đề) — đọc lại chính xác đáp án đó, không tự giải lại.
3. Nếu đề CHƯA có đáp án — tự giải từng câu bằng kiến thức tiếng Anh, chọn đáp án đúng nhất.
4. TRẢ VỀ mảng lines — MỖI PHẦN TỬ LÀ 1 DÒNG, để giáo viên dễ đối chiếu ngược lại với đề gốc VÀ sửa/xoá được từng dòng riêng:
   - Nếu đề chia thành nhiều phần có tiêu đề riêng (I, II, III... hoặc Part 1, Part 2...), tạo 1 dòng riêng GIỮ NGUYÊN đúng tiêu đề đó làm phân cách giữa các phần (VD text="I. Find the words...", y hệt cách đề ghi dù rút gọn bớt cũng phải nhận ra được là phần nào), đặt uncertain=false cho dòng tiêu đề.
   - MỖI CÂU 1 PHẦN TỬ RIÊNG (không dồn nhiều câu vào 1 dòng) — dễ dò theo từng dòng khi cầm đề gốc so sánh.
   - text của mỗi câu viết theo đúng dạng của câu đó, GIỮ đúng số thứ tự VÀ đúng cách đánh số của đề gốc: trắc nghiệm ghi "3. C" hoặc "3-C"; điền từ ghi "3. is read"; đúng/sai ghi "3. Đúng" hoặc "3. Sai"; nối câu ghi "3. a-ii" (I.1, I.2... hay 1, 2, 3... tùy đề đánh số kiểu gì thì theo đúng kiểu đó, không tự đổi cách đánh số).
5. Với câu nào bạn KHÔNG chắc chắn (ngữ pháp mơ hồ, có thể có nhiều đáp án hợp lý, chữ đề mờ không đọc rõ) — vẫn đưa ra đáp án bạn cho là đúng nhất trong text, nhưng đặt uncertain=true và note là 1 câu ngắn gọn giải thích lý do nghi ngờ, để giáo viên xem lại đúng dòng đó. Dòng chắc chắn thì uncertain=false, note rỗng.
6. Nếu ảnh không phải đề kiểm tra, hoặc mờ tới mức không đọc được đề gì cả, đặt unreadable=true.
7. Nếu ảnh chụp thiếu góc/mờ một phần nhưng vẫn đọc được phần lớn đề, đặt lowConfidence=true và vẫn cố gắng giải hết phần đọc được.

CHỈ trả về JSON hợp lệ theo đúng schema sau, không thêm chữ nào khác ngoài JSON:
{"lines": [{"text": string, "uncertain": boolean, "note": string}], "lowConfidence": boolean, "unreadable": boolean}`

/** Gửi 1 ảnh ĐỀ MẪU (không phải bài học sinh) cho AI tự giải ra đáp án đúng
 *  — dùng để tạo đáp án 1 lần cho cả xấp bài, thay vì để AI tự giải lại độc
 *  lập từng ảnh học sinh (dễ giải khác nhau giữa các lần gọi, chấm không
 *  nhất quán cho cùng 1 đề). Đáp án trả về LUÔN LÀ BẢN NHÁP — giáo viên phải
 *  xem lại/sửa trước khi dùng để chấm cả lớp, không dùng thẳng. */
export async function solveTestPhoto(imageBuffer: Buffer, mimeType: string): Promise<AiSolveResult> {
  const anthropic = getClient()
  const contentSource = await prepareContent(imageBuffer, mimeType)

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    // Nâng lên từ 1536 — cách trình bày mới (mỗi câu 1 dòng riêng, giữ tiêu
    // đề từng phần) dài hơn hẳn kiểu cũ dồn nhiều câu 1 dòng, nhất là đề
    // nhiều trang/nhiều câu (VD đề 4 trang, ~30+ câu/phần) — 1536 dễ bị cắt
    // giữa chừng, mất phần cuối đáp án.
    max_tokens: 4096,
    // Tắt "extended thinking" — cùng lý do như gradeTestPhoto ở trên: suy
    // luận dài ngốn hết max_tokens, không còn chỗ viết JSON trả lời.
    thinking: { type: 'disabled' },
    system: [{ type: 'text', text: SOLVE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          contentSource,
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
    lines: Array.isArray(parsed.lines)
      ? parsed.lines.slice(0, 120).map((l) => {
          const item = l as { text?: unknown; uncertain?: unknown; note?: unknown }
          return {
            text: String(item?.text ?? '').trim(),
            uncertain: !!item?.uncertain,
            note: typeof item?.note === 'string' ? item.note.trim() : '',
          }
        }).filter((l) => l.text)
      : [],
    lowConfidence: !!parsed.lowConfidence,
    unreadable: !!parsed.unreadable,
  }
}
