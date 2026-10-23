# VieNeu-TTS local (v3 Turbo)

Project hỗ trợ hai provider: `omnivoice` (mặc định) và `vieneu`.
VieNeu chạy trên máy bạn qua API local `http://127.0.0.1:8000`, không cần
API key khi server không bật xác thực. Đây là tích hợp **v3 Turbo**, không
phải dịch vụ cloud v4.

## Cài và bật server trên macOS/Linux

Tại thư mục gốc project, dùng môi trường Python riêng với `uv`:

```bash
uv venv .venv-vieneu --python python3
uv pip install --python .venv-vieneu/bin/python \
  "vieneu==3.8.3" "huggingface-hub>=2.2.0" fastapi uvicorn python-multipart

HF_HOME="$PWD/.cache/vieneu" HF_HUB_DISABLE_SYMLINKS=1 VIENEU_BACKEND=onnx \
  HOST=127.0.0.1 PORT=8000 .venv-vieneu/bin/python -m apps.openai_speech
```

Giữ terminal này mở. Lần đầu cần mạng để tải model; các lần sau dùng cache
trong `.cache/vieneu/`. Backend ONNX chạy trên CPU, phù hợp để thử trên Mac.
Server mặc định nghe tại `127.0.0.1:8000`.
`HF_HUB_DISABLE_SYMLINKS=1` lưu model thành file thường để tránh lỗi ONNX
Runtime `External data path escapes model directory` khi cache dùng symlink.
Sau lần tải model thành công, có thể thêm `HF_HUB_OFFLINE=1` vào lệnh bật
server để khởi động bằng cache, không kiểm tra Hugging Face qua mạng.

Nếu đã có server VieNeu v3 Turbo thì chỉ cần đặt `VIENEU_ENDPOINT` trỏ vào
server đó; không cần cài thêm môi trường này.

## Nghe thử trước khi render video

Mở terminal thứ hai, tại thư mục project:

```bash
curl --fail http://127.0.0.1:8000/health
curl --fail http://127.0.0.1:8000/v1/voices

TTS_PROVIDER=vieneu npm run tts:preview
afplay output/tts-preview/vieneu.wav
```

Lệnh preview luôn tạo lại audio, không dùng cache. Có thể truyền câu và
đường dẫn WAV riêng:

```bash
TTS_PROVIDER=vieneu VIENEU_VOICE="Mai Anh" npm run tts:preview -- \
  "Xin chào! Đây là giọng đọc thử cho bản tin công nghệ." \
  output/tts-preview/vieneu-mai-anh.wav
```

Dùng `TTS_PROVIDER=omnivoice npm run tts:preview` để tạo bản OmniVoice.
`afplay` có sẵn trên macOS; ở hệ điều hành khác, mở file bằng trình nghe nhạc.
Tên giọng hợp lệ lấy từ trường `id` của `GET /v1/voices`.

## Chạy video với VieNeu

Đặt các dòng sau trong `.env.local`:

```env
TTS_PROVIDER=vieneu
VIENEU_ENDPOINT=http://127.0.0.1:8000
# Tuỳ chọn: bỏ dòng này để dùng giọng mặc định của server
VIENEU_VOICE=Mai Anh
TTS_CONCURRENCY=1
```

Sau đó chạy như cũ:

```bash
npm run pipeline -- output/my-video/script.json
```

Hoặc chỉ chọn VieNeu cho một lần chạy bằng biến môi trường:

```bash
TTS_PROVIDER=vieneu VIENEU_VOICE="Mai Anh" \
  npm run pipeline -- output/my-video/script.json
```

Thứ tự chọn provider: **`TTS_PROVIDER` (shell hoặc `.env.local`) →
`voice.provider` trong script → `omnivoice`**. Muốn chọn riêng trong từng
script thì bỏ `TTS_PROVIDER` khỏi `.env.local` và dùng:

```json
"voice": {
  "provider": "vieneu",
  "voice": "Mai Anh",
  "speed": 1
}
```

`VIENEU_VOICE` ưu tiên hơn `voice.voice` của script, giúp thử cùng kịch bản
với nhiều giọng. Nếu script cũ có preset OmniVoice như `nova`, hãy đặt
`VIENEU_VOICE` thành ID hợp lệ của VieNeu khi chuyển provider.

VieNeu trả WAV; pipeline dùng FFmpeg để tạo `voice.mp3` và `video.mp4` như
trước. Audio scene VieNeu nằm trong `voice/vieneu/`, tên file có hash của
server, giọng, nội dung và hash bản ghi clone. Đổi giọng hoặc lời đọc sẽ tạo audio mới; audio
OmniVoice trong `voice/scene-*.wav` vẫn được giữ nguyên.

**Mỗi lần chạy vẫn ghi lại `voice.mp3` và `video.mp4` trong thư mục script.**
Để giữ cả hai bản so sánh, sao chép script sang hai thư mục output khác nhau
trước khi chạy. Với script có đường dẫn audio tham chiếu tương đối, nhớ cập
nhật đường dẫn nếu di chuyển sang thư mục ở độ sâu khác.

## Tuỳ chọn không dùng chung với OmniVoice

- VieNeu API không áp dụng `speed` hay `instructions`. Pipeline in cảnh báo
  nếu script có các thiết lập này hoặc tham số sampling riêng của OmniVoice.
- `mode: "clone"` dùng `referenceAudio` và `referenceText` trong script.
  Client tự đăng ký bản ghi qua `POST /v1/voices`, đặt ID theo hash nội dung,
  rồi gọi speech với ID này. Transcript được giữ trong script để tương thích
  OmniVoice; VieNeu enrollment tự xử lý bản ghi. Mỗi phiên client đăng ký một
  lần cho cùng mẫu, kể cả khi TTS server vừa restart.
- Trong web, chọn **Clone từ âm thanh mẫu**, tải/chọn bản ghi khoảng 3–8 giây,
  nhập lời nói trong mẫu và nghe thử. Tệp mẫu lưu local cùng thư viện; bản render
  có snapshot riêng. Chỉ dùng bản ghi giọng bạn có quyền sử dụng.

Clone cần thêm model phụ trợ vào cùng cache trước khi bật chế độ offline:

```bash
HF_HOME="$PWD/.cache/vieneu" HF_HUB_DISABLE_SYMLINKS=1 .venv-vieneu/bin/python - <<'PYTHON'
from huggingface_hub import hf_hub_download
for name in ["speaker_encoder.onnx", "denoiser.onnx"]:
    hf_hub_download("pnnbao-ump/VieNeu-TTS-v3-Turbo", name)
PYTHON
```

Nếu server yêu cầu Bearer auth, đặt `VIENEU_API_KEY` ở cả server và project.

## Tài liệu gốc

- [VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS)
- [Speech API và cách đăng ký giọng](https://github.com/pnnbao97/VieNeu-TTS/blob/main/docs/streaming.md)
- [Dependencies và phiên bản SDK](https://github.com/pnnbao97/VieNeu-TTS/blob/main/pyproject.toml)
