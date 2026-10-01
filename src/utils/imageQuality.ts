/** Kiểm tra sơ bộ chất lượng ảnh NGAY TRÊN TRÌNH DUYỆT — hoàn toàn miễn phí
 *  (không gọi AI, không tốn phí), chạy TRƯỚC khi gửi ảnh cho AI chấm, để bắt
 *  sớm các ảnh rõ ràng kém chất lượng (quá mờ/quá tối/độ phân giải quá thấp)
 *  thay vì để AI "đoán mò" rồi tốn phí mà vẫn không ra kết quả tốt.
 *
 *  Độ nét (sharpness) đo bằng PHƯƠNG SAI CỦA LAPLACIAN — kỹ thuật kinh điển
 *  để phát hiện ảnh mờ (ảnh nét có nhiều biến thiên sáng-tối đột ngột ở viền
 *  nét chữ → phương sai cao; ảnh mờ các viền bị nhòe → phương sai thấp).
 *  Ngưỡng dùng ở đây là ước lượng theo kinh nghiệm thực tế, KHÔNG phải số đo
 *  khoa học tuyệt đối — chỉ nhằm bắt các ca RÕ RÀNG kém (rất mờ/rất tối),
 *  không nhằm phân loại chính xác mọi mức độ.
 *
 *  LƯU Ý: không kiểm tra được "chụp có đúng trọng tâm/đúng góc không" — việc
 *  đó cần hiểu NỘI DUNG ảnh (biết đâu là tờ giấy, đâu là nền), ngoài khả năng
 *  của phép đo thống kê đơn giản này. Phần đó vẫn phải người chụp tự để ý
 *  theo hướng dẫn hiển thị trên màn hình. */

const CHECK_WIDTH = 400
const BLUR_THRESHOLD = 25 // phương sai Laplacian dưới mức này coi là mờ (ước lượng kinh nghiệm)
const DARK_MAX = 50 // độ sáng trung bình (0-255) dưới mức này coi là quá tối
const BRIGHT_MIN = 235 // trên mức này coi là quá sáng/cháy sáng, khó đọc chữ
const LOW_RES_MIN = 500 // cạnh ngắn hơn mức này (px, ảnh GỐC chưa resize) coi là độ phân giải thấp

export interface ImageQuality {
  width: number
  height: number
  sharpness: number
  brightness: number
  blurry: boolean
  tooDark: boolean
  tooBright: boolean
  lowRes: boolean
  /** true nếu có ít nhất 1 vấn đề — dùng để quyết định có cần hỏi xác nhận trước khi chấm hay không. */
  hasIssue: boolean
}

function loadImageBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) return createImageBitmap(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

/** PDF hoặc file không phải ảnh — không kiểm tra được bằng Canvas, bỏ qua
 *  (coi như không có vấn đề gì, để AI tự đánh giá khi chấm thật). */
export async function checkImageQuality(file: File): Promise<ImageQuality | null> {
  if (!file.type.startsWith('image/')) return null

  try {
    const bitmap = await loadImageBitmap(file)
    const width = 'width' in bitmap ? bitmap.width : 0
    const height = 'height' in bitmap ? bitmap.height : 0
    if (!width || !height) return null

    const scale = CHECK_WIDTH / width
    const w = CHECK_WIDTH
    const h = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)

    const gray = new Float32Array(w * h)
    let sumBrightness = 0
    for (let i = 0; i < w * h; i++) {
      const v = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
      gray[i] = v
      sumBrightness += v
    }
    const brightness = sumBrightness / (w * h)

    let sumLap = 0
    let sumLapSq = 0
    let count = 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x
        const lap = gray[idx - 1] + gray[idx + 1] + gray[idx - w] + gray[idx + w] - 4 * gray[idx]
        sumLap += lap
        sumLapSq += lap * lap
        count++
      }
    }
    const meanLap = sumLap / count
    const sharpness = sumLapSq / count - meanLap * meanLap

    const blurry = sharpness < BLUR_THRESHOLD
    const tooDark = brightness < DARK_MAX
    const tooBright = brightness > BRIGHT_MIN
    const lowRes = Math.min(width, height) < LOW_RES_MIN

    if ('close' in bitmap) bitmap.close()

    return {
      width, height, sharpness, brightness, blurry, tooDark, tooBright, lowRes,
      hasIssue: blurry || tooDark || tooBright || lowRes,
    }
  } catch {
    return null
  }
}
