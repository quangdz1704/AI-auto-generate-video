import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  LoaderCircle,
  RefreshCw,
  Upload,
  Volume2,
} from "lucide-react";
import Select from "./Select";
import { api, body, errorMessage } from "./api";
import type { Asset, Draft } from "./model";

type Voice = Draft["script"]["voice"];
interface Catalog {
  online: boolean;
  voices: { id: string; name: string; description?: string }[];
  message?: string;
}
export default function VoiceConfig({
  voice,
  onChange,
  assets = [],
  onUpload,
  text = "Xin chào, đây là giọng đọc cho câu chuyện của bạn. Cùng bắt đầu một ý tưởng mới nhé.",
  defaultsOnly = false,
}: {
  voice: Voice;
  onChange: (voice: Voice) => void;
  assets?: Asset[];
  onUpload?: (file: File) => Promise<Asset>;
  text?: string;
  defaultsOnly?: boolean;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [revision, setRevision] = useState(0);
  const [mode, setMode] = useState(
    voice.mode === "clone"
      ? "clone"
      : voice.provider === "omnivoice" && voice.instructions
        ? "design"
        : "preset",
  );
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [audio, setAudio] = useState("");
  const request = useRef<AbortController | null>(null);
  const voiceKey = JSON.stringify(voice);
  useEffect(() => {
    setMode(
      voice.mode === "clone"
        ? "clone"
        : voice.provider === "omnivoice" && voice.instructions
          ? "design"
          : "preset",
    );
  }, [voice.mode, voice.provider]);
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null);
    api<Catalog>(`/tts/voices?provider=${voice.provider}`, {
      signal: controller.signal,
    })
      .then(setCatalog)
      .catch((e) => {
        if (!controller.signal.aborted)
          setCatalog({ online: false, voices: [], message: errorMessage(e) });
      });
    return () => controller.abort();
  }, [voice.provider, revision]);
  useEffect(() => {
    request.current?.abort();
    setAudio("");
    setBusy("");
    setError("");
  }, [voiceKey, text]);
  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio);
    },
    [audio],
  );
  useEffect(() => () => request.current?.abort(), []);
  const patch = (v: Partial<Voice>) => onChange({ ...voice, ...v });
  const changeMode = (value: string) => {
    setMode(value);
    onChange({
      ...voice,
      mode: value === "clone" ? "clone" : "design",
      voice: value === "preset" ? voice.voice : undefined,
      instructions:
        value === "design"
          ? voice.instructions || "female, young adult, moderate pitch"
          : undefined,
      referenceAudio: value === "clone" ? voice.referenceAudio : undefined,
      referenceText: value === "clone" ? voice.referenceText : undefined,
    });
  };
  const listen = async () => {
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy("listen");
    setError("");
    setAudio("");
    try {
      const response = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body({ ...voice, text: text.trim().slice(0, 1000) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const blob = await response.blob();
      if (!controller.signal.aborted) setAudio(URL.createObjectURL(blob));
    } catch (e) {
      if (!controller.signal.aborted) setError(errorMessage(e));
    } finally {
      if (!controller.signal.aborted) setBusy("");
    }
  };
  return (
    <div className="voice-config">
      <div className="field-heading">
        <span>
          <AudioLines size={15} />{" "}
          {defaultsOnly ? "GIỌNG MẶC ĐỊNH" : "GIỌNG ĐỌC CHO VIDEO NÀY"}
        </span>
        <button
          type="button"
          className="text-button"
          onClick={() => setRevision((n) => n + 1)}
          aria-label="Quét lại danh sách giọng"
        >
          <RefreshCw size={14} className={catalog === null ? "spin" : ""} />
        </button>
      </div>
      <label className="field">
        Công cụ giọng đọc
        <Select
          aria-label={defaultsOnly ? "TTS mặc định" : "Công cụ giọng đọc"}
          value={voice.provider}
          onValueChange={(provider) => {
            setMode("preset");
            onChange({
              provider: provider as Voice["provider"],
              mode: "design",
              speed: 1,
            });
          }}
          options={[
            {
              value: "vieneu",
              label: "VieNeu-TTS",
              description: "Giọng Việt · Preset & clone",
            },
            {
              value: "omnivoice",
              label: "OmniVoice",
              description: "Đa ngôn ngữ · Design & clone",
            },
          ]}
        />
      </label>
      <label className="field">
        Cách tạo giọng
        <Select
          aria-label="Cách tạo giọng"
          value={mode}
          onValueChange={changeMode}
          options={[
            {
              value: "preset",
              label: "Giọng có sẵn",
              description: "Chọn từ danh sách của TTS server",
            },
            ...(voice.provider === "omnivoice"
              ? [
                  {
                    value: "design",
                    label: "Voice design",
                    description: "Thiết kế giọng bằng mô tả",
                  },
                ]
              : []),
            ...(!defaultsOnly
              ? [
                  {
                    value: "clone",
                    label: "Clone từ âm thanh mẫu",
                    description: "Dùng giọng từ bản ghi bạn cung cấp",
                  },
                ]
              : []),
          ]}
        />
      </label>
      {mode === "preset" && (
        <label className="field">
          Chọn giọng
          <Select
            aria-label="Chọn giọng"
            value={voice.voice || ""}
            onValueChange={(value) =>
              patch({ voice: value || undefined, instructions: undefined })
            }
            allowCustom
            options={[
              { value: "", label: "Giọng mặc định của server" },
              ...(catalog?.voices || []).map((v) => ({
                value: v.id,
                label: v.name,
                description: v.description,
              })),
              ...(voice.voice &&
              !catalog?.voices.some((v) => v.id === voice.voice)
                ? [{ value: voice.voice, label: voice.voice }]
                : []),
            ]}
          />
        </label>
      )}
      {mode === "design" && (
        <label className="field">
          Mô tả giọng
          <textarea
            rows={3}
            value={voice.instructions || ""}
            placeholder="female, young adult, warm and calm, moderate pitch"
            onChange={(e) =>
              patch({ instructions: e.target.value || undefined })
            }
          />
          <span className="field-help">
            Mô tả độ tuổi, âm sắc và cảm xúc bằng tiếng Anh.
          </span>
        </label>
      )}
      {mode === "clone" && (
        <div className="voice-clone">
          <p className="field-help">
            Chọn đoạn nói rõ, khoảng 3–8 giây, từ giọng bạn có quyền sử dụng.
          </p>
          <label className="field">
            Âm thanh mẫu
            <Select
              aria-label="Âm thanh mẫu"
              value={voice.referenceAudio?.replace(/^asset:/, "") || ""}
              onValueChange={(id) =>
                patch({ referenceAudio: id ? `asset:${id}` : undefined })
              }
              options={[
                { value: "", label: "Chọn bản ghi trong thư viện" },
                ...assets
                  .filter((a) => a.type === "audio")
                  .map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
          </label>
          {onUpload && (
            <label
              className="button secondary upload-voice"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (["Enter", " "].includes(e.key)) {
                  e.preventDefault();
                  e.currentTarget.click();
                }
              }}
            >
              <Upload size={15} />
              {busy === "upload" ? "Đang tải mẫu…" : "Tải âm thanh mẫu"}
              <input
                type="file"
                accept="audio/wav,audio/mpeg,audio/mp4,.wav,.mp3,.m4a"
                disabled={!!busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setBusy("upload");
                  setError("");
                  try {
                    const asset = await onUpload(file);
                    patch({ referenceAudio: `asset:${asset.id}` });
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    setBusy("");
                  }
                }}
              />
            </label>
          )}
          {voice.referenceAudio && (
            <audio
              key={voice.referenceAudio}
              controls
              preload="none"
              src={`/api/assets/${voice.referenceAudio.replace(/^asset:/, "")}/file`}
            />
          )}
          <label className="field">
            Lời nói trong âm thanh mẫu
            <textarea
              rows={2}
              value={voice.referenceText || ""}
              onChange={(e) =>
                patch({ referenceText: e.target.value || undefined })
              }
              placeholder="Nhập chính xác lời nói trong bản ghi…"
            />
          </label>
          {voice.provider === "vieneu" && (
            <p className="field-help">
              Studio tự đăng ký mẫu với VieNeu khi nghe thử hoặc render, kể cả
              sau khi khởi động lại TTS server.
            </p>
          )}
        </div>
      )}
      {voice.provider === "omnivoice" && (
        <label className="field">
          Tốc độ · {voice.speed}×
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={voice.speed}
            onChange={(e) => patch({ speed: Number(e.target.value) })}
          />
        </label>
      )}
      <div className="voice-status">
        <span className={`live-dot ${catalog?.online ? "" : "offline"}`} />
        {catalog === null
          ? "Đang tải danh sách giọng…"
          : catalog.online
            ? `${catalog.voices.length} giọng từ ${voice.provider === "vieneu" ? "VieNeu" : "OmniVoice"}`
            : catalog.message || "Chưa kết nối được TTS server."}
      </div>
      <button
        type="button"
        className="button secondary full-width"
        onClick={() => void listen()}
        disabled={
          !!busy ||
          (mode === "clone" &&
            (!voice.referenceAudio || !voice.referenceText?.trim())) ||
          (mode === "design" && !voice.instructions?.trim())
        }
      >
        {busy === "listen" ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <Volume2 size={16} />
        )}{" "}
        {busy === "listen"
          ? "Đang tạo bản nghe thử…"
          : "Nghe thử giọng đã chọn"}
      </button>
      {audio && (
        <audio
          key={audio}
          src={audio}
          controls
          autoPlay
          aria-label="Bản nghe thử giọng đã chọn"
        />
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <p className="field-help">
        {defaultsOnly
          ? "Lưu cấu hình để áp dụng cho dự án mới. Nếu vừa đổi địa chỉ server, hãy lưu trước khi quét giọng."
          : "Áp dụng riêng cho video này. Mặc định của bạn vẫn được giữ trong Settings."}
      </p>
    </div>
  );
}
