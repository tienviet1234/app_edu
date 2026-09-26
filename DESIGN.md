---
name: Bộ thẻ lớp học (Flashcard deck)
description: Mỗi học sinh là một tấm thẻ trong bộ thẻ của lớp; băng nhãn 4 màu phân loại tiêu chí chấm.
colors:
  cobalt-deep: "#1E2F8F"
  cobalt: "#2447D6"
  desk: "#EEF1F8"
  card: "#FFFFFF"
  ink: "#14182B"
  ink-muted: "#5B6478"
  edge: "#D5DAE8"
  tomato: "#E8503A"
  tomato-text: "#D93A2B"
  sunflower: "#F5B700"
  grass: "#178A4C"
  amber-text: "#B45309"
typography:
  display:
    fontFamily: "Baloo 2, Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "normal"
  body:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.3
rounded:
  sm: "2px"
  md: "6px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px"
  button-primary:
    backgroundColor: "{colors.cobalt-deep}"
    textColor: "{colors.card}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "8px 12px"
  button-pick:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 12px"
  student-tab:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "0 12px"
---

# Design System: Bộ thẻ lớp học

## Overview

**Ý tưởng:** lớp học là một bộ thẻ từ vựng (flashcard). Mỗi học sinh là một tấm thẻ; chấm điểm xong thì lật sang thẻ tiếp theo. Giao diện tránh kiểu "thẻ trắng bo tròn trên nền xám" quen thuộc của phần mềm văn phòng và tránh emoji làm biểu tượng.

**Chế độ:** Operate — thầy cô chấm điểm nhanh, một tay, giữa giờ dạy; ưu tiên rõ ràng và ít chạm nhầm hơn là trang trí.

## Colors

- **Desk `#EEF1F8`**: mặt bàn, nền trang (xanh xám hơi ngả tím, không phải xám trung tính).
- **Card `#FFFFFF`**: mặt thẻ.
- **Ink `#14182B`**: chữ chính (xanh đen). **Ink-muted `#5B6478`**: chữ phụ. **Edge `#D5DAE8`**: viền.
- **4 màu băng nhãn** dùng để phân loại, quay vòng theo thứ tự: Cobalt `#2447D6` (chuyên cần), Tomato `#E8503A`, Sunflower `#F5B700`, Grass `#178A4C`.
- **Cobalt-deep `#1E2F8F`**: thanh trên cùng và nút chính.
- Chữ màu trên nền trắng dùng biến thể đủ tương phản: Tomato-text `#D93A2B`, Amber-text `#B45309`, Grass `#178A4C`.

**Quy tắc màu là dấu hiệu:** màu chỉ mang nghĩa (loại tiêu chí, điểm cao/thấp); không dùng màu để trang trí.

## Typography

- **Display — Baloo 2 (800):** tên học sinh và con số điểm lớn. Hỗ trợ đầy đủ tiếng Việt, tròn trịa, hợp lớp học của trẻ.
- **Body — Be Vietnam Pro:** mọi chữ còn lại; nhãn nhỏ dùng 700, không viết hoa hàng loạt.
- Tên học sinh là chữ **to nhất** trang; tổng điểm đối diện nó ở cỡ lớn kèm "/100".

## Layout

Một tấm thẻ lớn ở giữa: tên và tổng điểm ở đầu, sau đó mỗi nhóm tiêu chí một băng có nhãn màu riêng. Dải thẻ nhỏ của cả lớp nằm phía trên; mép các thẻ còn lại nằm dưới thẻ đang chấm. Thanh điều hướng dưới cùng trên điện thoại, thanh bên trên máy tính. Vùng chạm tối thiểu **44px**, khoảng cách giữa nút 8px.

## Elevation & Depth

Phẳng: độ nổi do **viền 1.5px** đảm nhiệm, không có bóng mềm (`--shadow-md: none`). Chỉ thẻ nổi bật (`elevated`) mới có một bóng nhẹ. Độ sâu của "bộ thẻ" thể hiện bằng các dải mép thẻ thật (phần tử riêng) chứ không phải bóng đổ.

## Shapes

Vuông vức: thẻ và nút bo `6px`, thẻ nhỏ của học sinh bo `2px`. Băng nhãn dày 4–6px ở mép trên thẻ. Không bo tròn lớn (`rounded-2xl`) và không dùng chuyển màu làm nền.

## Components

- **Thẻ (Card):** nền trắng, viền 1.5px, băng nhãn 4px ở đỉnh khi có `accentTop`.
- **Nút chính:** cobalt-deep, chữ trắng, cao 44px. **Pick** (chọn 1 mức): nền trắng, khi chọn đổi sang màu ngữ nghĩa (cỏ = tốt, cà chua = chưa đạt, cobalt = trung tính).
- **Thẻ học sinh nhỏ:** vuông, có dấu tích cỏ khi đã chấm; thẻ đang xem tô cobalt và có **góc thẻ gấp** màu vàng ở góc trên phải — dấu chỗ đang dừng.
- **Dấu "ĐÃ CHẤM":** con dấu cobalt xoay nhẹ cạnh tên khi học sinh đã có điểm (trạng thái là dấu hiệu, không chỉ là màu).
- **Biểu tượng:** bộ nét đơn 24×24 vẽ tay (`Icon.tsx`), một độ dày, ăn theo màu chữ; không dùng emoji.

## Do's and Don'ts

- **Do** dùng băng nhãn màu để phân loại; **do** giữ vùng chạm ≥ 44px.
- **Do** thể hiện trạng thái bằng dấu (tích, dấu mộc, góc gấp) song song với màu.
- **Don't** dùng emoji làm biểu tượng, chuyển màu làm nền, hay bóng mềm dày để tạo độ nổi.
- **Don't** dùng màu cảnh báo đỏ gắt cho thông tin mà học sinh/phụ huynh nhìn thấy; giữ giọng động viên.
- **Don't** dùng đường viền màu dày ở cạnh trái/phải của thẻ hay hộp thông báo.
