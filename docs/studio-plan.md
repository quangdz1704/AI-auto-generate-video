# Video Studio — bản nội bộ

## Phạm vi đã chốt

Web app chạy trên máy chủ local, dùng pipeline HyperFrames/FFmpeg và hai TTS
provider hiện tại. Người dùng chọn CLI agent cài trên máy hoặc API key, lưu
cấu hình, chuẩn bị kịch bản, chỉnh từng cảnh/hình/giọng/template, xác nhận render,
theo dõi tiến trình thật và xem/tải kết quả. Chưa triển khai Internet hay tài khoản.

## Kiến trúc

- React + Vite cho studio tiếng Việt, Express cho API cùng origin.
- Module AI có adapter CLI và API qua AI SDK; không nối input vào shell command.
- Cấu hình và dự án lưu trên đĩa qua repository riêng. API key mã hoá tại chỗ,
  khoá nằm trong file riêng quyền 0600; API chỉ trả trạng thái có key.
- Worker render chạy process riêng, hàng đợi một video để tránh quá tải máy.
- Snapshot cấu hình từng lần render, sự kiện tiến trình từ pipeline, SSE và
  polling dự phòng. Khởi động lại đánh dấu lượt render dở để có thể thử lại.
- Giữ CLI hiện tại; thêm cấu hình và callback tuỳ chọn vào pipeline.
- File lưu local, upload có giới hạn/kiểm tra loại, preview template thật trong iframe.

## Các lát cắt triển khai

1. **Kết nối và ghi nhớ**: scan Claude/Codex/Gemini; lưu/chỉnh cấu hình CLI/API/TTS.
   Kiểm tra: persistence, redaction/key encryption, scan thực trên máy.
2. **Tạo và sửa kịch bản**: nhập text/URL hoặc script JSON; AI trả script đã
   validate; chỉnh scene/template, thêm/xoá cảnh và lưu dự án.
   Kiểm tra: adapter bằng fixture, lỗi provider, schema và API dự án.
3. **Âm thanh và hình**: lấy preset từ TTS, nghe thử, upload hình/nhạc nền,
   template ảnh mới; xem composition thật với nội dung đang sửa.
   Kiểm tra: asset validation, WAV thật, template preview và audio mixing.
4. **Render và kết quả**: snapshot, worker queue, tiến trình từng scene, lỗi và
   thử lại; video player, tải MP4/MP3/script. Kiểm tra: job lifecycle và render thật.
5. **Hoàn thiện UX**: desktop/mobile, empty/error/loading states, refresh/recovery,
   hướng dẫn khởi động. Kiểm tra: typecheck, test suite, frontend build và browser QA.

## Điểm mở rộng

AI adapters, repository, template catalog và worker boundary là các điểm thay
thế khi chuyển sang database/object storage/queue và nhiều người dùng. Bản này
không giả lập đăng nhập, billing hay dịch vụ image generation chưa cấu hình.
