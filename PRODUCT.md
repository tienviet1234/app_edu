# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Bốn vai trò dùng chung một hệ thống, không vai trò nào vượt trội — cả ba nhóm đầu được ưu tiên cân bằng:

- **Giáo viên**: chấm điểm và điểm danh từng học sinh mỗi buổi, giao và duyệt bài tập; thường thao tác trên điện thoại hoặc laptop ngay trong giờ dạy.
- **Quản trị viên (admin)**: quản lý lớp, người dùng, tiêu chí chấm, học phí và lương; kiểm tra số liệu để đối chiếu với giáo viên.
- **Học sinh**: chủ yếu tiểu học đến cấp 2 tại một trung tâm Anh ngữ; xem điểm của mình, xếp hạng, nộp bài tập, làm trắc nghiệm.
- **Phụ huynh**: theo dõi kết quả và bài tập của con.

Giao diện và nội dung bằng tiếng Việt. Người dùng chính của trung tâm không phải người rành kỹ thuật.

## Product Purpose

Hệ thống quản lý chất lượng cho một trung tâm Anh ngữ: giáo viên chấm điểm theo tiêu chí, phụ huynh và học sinh theo dõi kết quả, học sinh nộp bài tập và làm bài trắc nghiệm tự chấm, admin quản lý lớp học, học phí và lương giáo viên. Thành công là giáo viên nhập nhanh và ít sai, số liệu (điểm, số buổi, tiền) luôn đúng và khớp giữa các màn hình, phụ huynh hiểu được tình hình của con.

## Positioning

- **Chấm điểm theo tiêu chí (rubric) từng buổi**: mỗi buổi chấm từng tiêu chí, hệ thống tự tính tổng điểm; admin tự chỉnh tiêu chí cho từng lớp.
- **Nhắc nhở và động viên tích cực**: nhắc hạn nộp bài, lời động viên nhẹ nhàng, tránh cảnh báo và so sánh gây tự ti cho trẻ.

## Operating Context

- Mỗi học sinh có chuỗi buổi học riêng (số buổi và ngày có thể khác nhau giữa các em trong cùng lớp).
- Giáo viên nhập điểm hằng ngày trong hoặc ngay sau giờ học; dữ liệu lưu tạm trên trình duyệt rồi đồng bộ lên máy chủ.
- Cuối tháng admin đối chiếu số buổi, học phí và lương với giáo viên; xuất báo cáo Excel và PDF.
- Dùng trên cả điện thoại và máy tính; có cài dạng ứng dụng web (PWA) và thông báo đẩy.

## Capabilities and Constraints

- Vai trò: admin, giáo viên, học sinh, phụ huynh; mỗi vai trò chỉ thấy phần của mình (học phí và lương chỉ admin).
- Bài tập dạng ảnh, video hoặc trắc nghiệm nhiều dạng (chọn đáp án, điền từ, nối, sắp xếp, điền nhiều ô trống); đáp án không được lộ cho học sinh.
- Điểm có quy tắc riêng (điểm một buổi quy về thang 100; tiêu chí dạng "chọn 1" khác dạng "cộng dồn"); hiển thị điểm phải luôn kèm mẫu số rõ ràng.
- Dữ liệu của trẻ em: cẩn trọng với mọi tích hợp bên thứ ba xử lý ảnh, video, âm thanh của học sinh.
- Chưa quyết định: chưa có yêu cầu riêng về khả năng truy cập (accessibility) ngoài mức thông thường.

## Brand Commitments

Tên hiển thị trong app: "Hệ thống quản lý chất lượng — Trung tâm Anh ngữ". Chưa có logo, bảng màu hay giọng điệu thương hiệu nào được người dùng chốt là ràng buộc; giao diện hiện có là hệ thống hình ảnh sẵn có của dự án.

## Evidence on Hand

Dự án đang chạy thật với dữ liệu của trung tâm. Không có lời chứng thực, số liệu khách hàng hay tài liệu thương hiệu nào trong repository; không được tự bịa các nội dung này.

## Product Principles

1. **Số liệu tiền và điểm phải đúng và giải thích được**: mọi con số hiển thị kèm căn cứ (điểm dạng "đạt/tối đa", tiền có bảng đối chiếu từng ngày).
2. **Không làm trẻ tự ti**: không phơi bày so sánh điểm giữa các em cho học sinh, dùng lời động viên thay vì cảnh báo đỏ.
3. **Nhập nhanh, khó nhầm**: thao tác hằng ngày của giáo viên ít bước, có xác nhận ở chỗ dễ mất dữ liệu.
4. **Không mất dữ liệu âm thầm**: dữ liệu luôn được đồng bộ lên máy chủ và báo rõ khi có lỗi, không để người dùng tưởng đã lưu.
5. **Mỗi vai trò thấy đúng phần của mình**, không lộ thông tin nhạy cảm (đáp án, học phí, lương) cho người không có quyền.
