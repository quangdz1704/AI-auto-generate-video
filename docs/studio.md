# Frame Studio — web app nội bộ

Studio bọc pipeline video hiện tại bằng giao diện React và backend Express.
CLI vẫn hoạt động như trước; web app không cần Claude/Codex để mở giao diện
hay chỉnh scene thủ công.

## Chạy toàn bộ local bằng một lệnh (macOS/Linux)

Trong thư mục project:

```bash
npm install
npm run local:all
```

`local:all` tự build frontend rồi dùng `concurrently` bật cả ba service:

| Service   | Địa chỉ               | Vai trò                                   |
| --------- | --------------------- | ----------------------------------------- |
| Studio    | http://127.0.0.1:4310 | Frontend, backend, queue và worker render |
| VieNeu    | http://127.0.0.1:8000 | TTS tiếng Việt, preset và clone           |
| OmniVoice | http://127.0.0.1:8123 | TTS đa ngôn ngữ, design và clone          |

Giữ terminal mở, chờ TTS báo `Application startup complete`, rồi mở Studio.
Log có nhãn `web`, `vieneu`, `omnivoice`. Nhấn **Ctrl+C** để dừng cả nhóm.
Nếu một service thoát, concurrently dừng các service còn lại do nhóm đó khởi
chạy. Các lệnh không tự tắt process đang chạy sẵn: nếu gặp `address already
in use`, dừng instance cũ ở terminal của nó trước khi chạy lại.

Các chế độ khác:

```bash
npm run local:dev       # Web HMR + VieNeu + OmniVoice
npm run local:vieneu    # Web HMR + VieNeu, ít tốn RAM hơn
npm run dev            # Chỉ web HMR, dùng các TTS server đang chạy riêng
npm run tts:vieneu     # Chỉ VieNeu
npm run tts:omnivoice  # Chỉ OmniVoice
```

### Chuẩn bị trên máy mới

- Node.js >=22 và `npm install`.
- FFmpeg/ffprobe trong PATH; trên Mac cài bằng `brew install ffmpeg`.
- Chrome/Chromium cho HyperFrames render. Lần render đầu có thể cần mạng
  để npm tải `hyperframes@0.6.94`.
- Môi trường `.venv-vieneu` và `.venv-omnivoice` đã cài SDK/server tương ứng.
  Xem [VieNeu](vieneu.md) và [OmniVoice](omnivoice.md). Trên máy hiện tại hai
  môi trường đã có sẵn. Không cần activate Python khi dùng các npm script.
- Lần đầu TTS cần mạng để tải model. Khi đã cache đầy đủ có thể chạy:

```bash
HF_HUB_OFFLINE=1 npm run local:all
```

VieNeu dùng cache `.cache/vieneu/`; OmniVoice dùng cache Hugging Face mặc
định của môi trường. Clone VieNeu cần cả model speaker encoder; xem hướng
dẫn tải model phụ trợ trong [VieNeu](vieneu.md).

Kiểm tra sau khi bật:

```bash
curl --fail http://127.0.0.1:4310/api/health
curl --fail http://127.0.0.1:8000/health
curl --fail http://127.0.0.1:8123/health
```

Web, TTS và render chạy trên máy. Nếu chọn Claude/Codex/Gemini hoặc API
cloud để viết kịch bản thì phần AI vẫn cần kết nối nhà cung cấp. Có thể tự
chia cảnh không dùng AI, hoặc kết nối một model local qua endpoint compatible.

### Chạy riêng bản web đã build

```bash
npm run studio:build
npm run studio
```

`studio` dùng `studio-dist/` nếu có; nếu chưa build, tự mở frontend dev.
Sau khi sửa mã backend cần khởi động lại server; thay đổi giao diện trong
`npm run dev` dùng HMR. `local:all` luôn build lại frontend trước khi bật.

## Kết nối AI và ghi nhớ lựa chọn

Vào **Kết nối & cài đặt**:

- **CLI trên máy:** quét Claude Code, Codex CLI, Gemini CLI trong `PATH` của
  máy đang chạy backend. Quét chỉ xác nhận binary/phiên bản, không xác nhận
  tài khoản đã đăng nhập. Đăng nhập CLI từ terminal như bình thường.
- **API key:** chọn OpenAI, Anthropic, Google hoặc endpoint OpenAI-compatible
  (ví dụ Ollama). Nhập key và base URL nếu cần, bấm **Quét model** rồi chọn
  trong dropdown có tìm kiếm; có thể nhập ID tuỳ chỉnh ngay trong dropdown.
  Kết nối compatible local có thể không cần key.
- Chọn TTS mặc định, địa chỉ server và tên kênh. Bấm **Lưu cấu hình** để dùng
  lại sau khi đóng/mở ứng dụng. Model CLI có thể để trống để dùng mặc định
  của agent; model API cần ID cụ thể. Codex đọc danh mục `models_cache.json`
  do CLI tạo trên máy; Claude dùng alias `sonnet`, `opus`, `haiku` vì CLI
  không có API liệt kê model theo tài khoản. Gemini CLI có thể nhập ID thủ công.
  Chế độ API quét `/models` từ provider/endpoint được chọn, dùng key đang nhập
  hoặc key đã lưu cùng kết nối; thao tác quét không lưu hay thay đổi Settings.

Key không được đặt trong `localStorage` và không trả lại qua API. Backend mã
hoá key bằng AES-256-GCM; khoá local nằm trong file riêng quyền `0600`.
Để trống ô key khi lưu giữ nguyên key cùng provider/endpoint. Xoá key hoặc
chuyển provider/endpoint sẽ không mang key cũ sang kết nối mới.

CLI nhận prompt qua stdin, chạy trong thư mục tạm; không nối nội dung người
dùng vào shell. Claude tắt tools, Codex dùng sandbox read-only; Studio chỉ
nhận và validate JSON do agent trả về.

## Tạo video

1. **Nội dung:** nhập văn bản, URL bài báo công khai, `.txt` hoặc script
   `.json` có sẵn. Có nội dung mẫu và cách chia cảnh thủ công không cần AI.
   Chọn công cụ/giọng và nghe thử ở phần **Giọng đọc** trước khi tạo kịch bản.
2. **Kịch bản & thiết kế:** sửa lời đọc và các slot trên mỗi cảnh; chọn một
   trong thư viện template. Thêm/xoá/sắp xếp cảnh nội dung, giữ hook/outro ở hai đầu.
   Preview hiển thị HTML composition thật, không phải ảnh mockup.
3. **Hình ảnh:** upload PNG/JPEG/WebP (tối đa 8 MB). Cảnh chuyển sang Photo
   Story để hình được dùng trong cả preview và bản render. Tài nguyên đã
   upload nằm trong thư viện để tái sử dụng.
4. **Âm thanh:** chọn VieNeu/OmniVoice và preset; nghe thử lời đọc đang chỉnh.
   VieNeu không điều chỉnh tốc độ hoặc voice design của OmniVoice. Có thể
   upload MP3/WAV/M4A (tối đa 20 MB), chọn nhạc và chỉnh âm lượng. Nhạc lặp
   vừa độ dài lời đọc. SFX chỉ có khi đã tải thư viện SFX.
5. **Lưu dự án** để giữ bản trên backend; bản nháp cũng được nhớ trong trình
   duyệt. Cấu hình kết nối lưu ở server, độc lập với bản nháp trình duyệt.
6. **Tạo video:** kiểm tra lựa chọn, chọn chất lượng rồi xác nhận. Worker
   chụp bản script/cấu hình riêng cho lần xuất đó; chỉnh tiếp dự án không
   thay đổi lượt render đang chạy.
7. Theo dõi từng bước, dừng nếu cần, xem MP4 sau khi xong và tải
   `video.mp4`, `voice.mp3`, `script.txt` hoặc `script.json`. Lịch sử các lần
   xuất nằm trong dự án, có thể quay lại sau khi reload.

Giọng đọc thuộc từng dự án: preset lấy từ danh sách server, OmniVoice hỗ trợ
**Voice design** bằng mô tả; cả OmniVoice và VieNeu hỗ trợ **Clone từ âm thanh
mẫu**. Chọn/tải MP3/WAV/M4A trong thư viện và nhập lời nói chính xác trong mẫu,
nghe thử rồi dùng cho video. Studio chỉ đọc reference từ asset đã upload,
không nhận đường dẫn file tuỳ ý từ trình duyệt. Render chụp riêng tệp mẫu vào
thư mục lượt xuất. VieNeu tự đăng ký mẫu qua `POST /v1/voices` mỗi phiên client
và tái sử dụng trong các cảnh; lần sau có thể đăng ký lại sau khi TTS restart.
VieNeu không hỗ trợ voice design hoặc chỉnh tốc độ qua API này.

Settings chỉ điền mặc định cho dự án mới; thay giọng trong dự án không đổi
Settings, và lưu Settings không ghi đè giọng của dự án đang chỉnh.

Nguồn API model: [Claude Code aliases](https://code.claude.com/docs/en/model-config),
[Anthropic Models](https://platform.claude.com/docs/en/api/models/list),
[Google Models](https://ai.google.dev/api/models).

## Paper Story — template explainer nét chì

Trong thư viện, chọn **Paper Story**, sửa tiêu đề, chọn tranh có sẵn hoặc ảnh
riêng. Nút **Áp dụng phong cách cho cả video** giữ tiêu đề xuyên suốt, đổi bộ
tranh qua các cảnh và lấy lời đọc làm phụ đề. Các từ được nhấn theo thời gian
ước lượng từ độ dài audio; chưa có forced alignment. Hỗ trợ 9:16, 16:9, 1:1.

Tranh gốc, prompt và example script nằm tại
[templates/frame-paper-story](../templates/frame-paper-story/README.md).
Nếu backend đang chạy từ trước khi thêm template, khởi động lại
`npm run local:all` hoặc `npm run local:dev` để cập nhật danh mục.

Workspace dùng thử Paper Story được lưu riêng ở `.studio-data/paper-story-preview`.
Có thể mở lại riêng bằng:

```bash
STUDIO_PORT=4312 STUDIO_DATA_DIR="$PWD/.studio-data/paper-story-preview" npm run studio
```

## Dữ liệu và worker

```text
.studio-data/                   # ignored by Git
├── settings.json               # config + API key đã mã hoá
├── local.key                   # khoá local (0600)
├── assets.json
├── assets/                     # ảnh, nhạc đã upload
├── scratch/                    # tệp tạm
└── projects/<project-id>/
    ├── project.json            # draft + lịch sử/progress
    └── runs/<run-id>/          # snapshot + output của từng lần xuất
```

Sao lưu **cả** thư mục dữ liệu nếu chuyển máy, bao gồm `local.key` để đọc lại
key đã lưu. Đây là lưu trữ local dành cho chủ máy; người có quyền đọc thư
mục dữ liệu cũng có thể giải mã key bằng khoá local.

Hàng đợi xử lý một video mỗi lúc. Worker là process riêng; progress qua IPC,
API đẩy SSE và có polling dự phòng. Khi backend khởi động lại, lượt đang dở
được đánh dấu thất bại để người dùng chủ động tạo lại, không báo hoàn thành giả.

Tuỳ chọn môi trường:

```env
STUDIO_PORT=4310
# Mặc định chỉ nghe trên loopback
STUDIO_HOST=127.0.0.1
# Tuỳ chọn đường dẫn tuyệt đối thay .studio-data/
# STUDIO_DATA_DIR=/path/to/studio-data
```

## Mở rộng sau

Module `src/studio/ai.ts` chứa adapter API/CLI; `store.ts` chứa persistence;
`jobs.ts` quản lý worker; pipeline nhận `config` và `onProgress` tuỳ chọn.
Các ranh giới này cho phép thay file store bằng database/object storage và
thay queue local bằng worker service mà vẫn giữ UI/API.

Bản hiện tại là **một workspace nội bộ dùng chung**, chưa có tài khoản hay
phân quyền. Khi publish sẽ cần thêm xác thực, phân tách dữ liệu, quyền truy
cập file, quota và chính sách quản lý worker. Không đưa bản local này lên
Internet như một dịch vụ nhiều người dùng khi chưa bổ sung các phần đó.

## Kiểm tra

```bash
npm run typecheck
npm test
npm run studio:build
```

Tài liệu tham chiếu CLI:
[Codex non-interactive](https://learn.chatgpt.com/docs/non-interactive-mode),
[Gemini headless](https://geminicli.com/docs/cli/headless/).
