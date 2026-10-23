import VoiceConfig from "./VoiceConfig";
import Select from "./Select";
import { useEffect, useState, type ChangeEvent } from "react";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  LayoutTemplate,
  AudioLines,
  SlidersHorizontal,
  Play,
  LoaderCircle,
  Upload,
  ImagePlus,
  ArrowRight,
} from "lucide-react";
import Preview from "./Preview";
import { TemplateArt } from "./Templates";
import { body, errorMessage } from "./api";
import {
  sceneHeadline,
  slotLabels,
  type Draft,
  type Scene,
  type TemplateInfo,
  type Asset,
  type PublicSettings,
} from "./model";

function Slot({
  name,
  value,
  change,
}: {
  name: string;
  value: unknown;
  change: (v: unknown) => void;
}) {
  const [text, setText] = useState(
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
  const [error, setError] = useState("");
  useEffect(
    () =>
      setText(
        typeof value === "string" ? value : JSON.stringify(value, null, 2),
      ),
    [value],
  );
  if (name === "illustration")
    return (
      <label className="field">
        {slotLabels[name]}
        <Select
          aria-label="Tranh minh hoạ có sẵn"
          value={String(value)}
          onValueChange={change}
          options={[
            { value: "learning", label: "Học tập · Đêm muộn" },
            { value: "overload", label: "Công việc · Quá tải" },
            { value: "balance", label: "Cân bằng · Thư thái" },
          ]}
        />
      </label>
    );
  if (name === "accent" && /^#[0-9a-f]{6}$/i.test(String(value)))
    return (
      <label className="field">
        Màu nhấn từ
        <input
          aria-label="Màu nhấn từ"
          type="color"
          value={String(value)}
          onChange={(e) => change(e.target.value)}
        />
      </label>
    );
  const complex = typeof value === "object";
  return (
    <label className="field">
      {slotLabels[name] || name}
      {complex ? (
        <>
          <textarea
            rows={
              Array.isArray(value) && value.every((v) => typeof v === "string")
                ? 3
                : 5
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              try {
                change(JSON.parse(text));
                setError("");
              } catch {
                setError("Giữ đúng cấu trúc JSON cho trường này.");
              }
            }}
          />
          <small className={error ? "field-error" : "field-help"}>
            {error || "Dữ liệu có cấu trúc · JSON"}
          </small>
        </>
      ) : (
        <input
          value={String(value ?? "")}
          onChange={(e) => {
            setText(e.target.value);
            change(
              typeof value === "number"
                ? Number(e.target.value)
                : e.target.value,
            );
          }}
        />
      )}
    </label>
  );
}

export default function Editor({
  draft,
  onChange,
  templates,
  selected,
  onSelected,
  onTemplates,
  assets,
  onUpload,
  notify,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  templates: TemplateInfo[];
  selected: number;
  onSelected: (n: number) => void;
  onTemplates: () => void;
  assets: Asset[];
  onUpload: (file: File) => Promise<Asset>;
  settings: PublicSettings;
  notify: (message: string, error?: boolean) => void;
}) {
  const [tab, setTab] = useState("content");
  const [listening, setListening] = useState(false);
  const [audio, setAudio] = useState("");
  const [uploading, setUploading] = useState(false);
  const scene = draft.script.scenes[selected] ?? draft.script.scenes[0];
  const template = templates.find((t) => t.id === scene.templateId)!;
  const updateScene = (patch: Partial<Scene>) =>
    onChange({
      ...draft,
      script: {
        ...draft.script,
        scenes: draft.script.scenes.map((s, i) =>
          i === selected ? { ...s, ...patch } : s,
        ),
      },
    });
  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio);
    },
    [audio],
  );
  const listen = async () => {
    setListening(true);
    try {
      const response = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body({
          ...draft.script.voice,
          text: scene.voiceText.slice(0, 1000),
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      setAudio(URL.createObjectURL(await response.blob()));
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setListening(false);
    }
  };
  const addScene = () => {
    const position = Math.min(selected + 1, draft.script.scenes.length - 1);
    const paper = scene.templateId === "frame-paper-story";
    const t = templates.find(
      (t) => t.id === (paper ? "frame-paper-story" : "frame-photo-story"),
    )!;
    const scenes = [...draft.script.scenes];
    scenes.splice(position, 0, {
      id: `body-${crypto.randomUUID().slice(0, 8)}`,
      type: "body",
      voiceText: "Thêm lời đọc cho cảnh này.",
      templateId: t.id,
      inputs: paper
        ? {
            ...t.defaults,
            headline: scene.inputs.headline || draft.title,
            illustration: ["learning", "overload", "balance"][position % 3],
            brand: scene.inputs.brand || "",
          }
        : { ...t.defaults, brand: draft.script.metadata.channel },
    });
    onChange({ ...draft, script: { ...draft.script, scenes } });
    onSelected(position);
  };
  const moveScene = (delta: number) => {
    const next = selected + delta;
    if (
      next <= 0 ||
      next >= draft.script.scenes.length - 1 ||
      scene.type !== "body"
    )
      return;
    const scenes = [...draft.script.scenes];
    [scenes[selected], scenes[next]] = [scenes[next], scenes[selected]];
    onChange({ ...draft, script: { ...draft.script, scenes } });
    onSelected(next);
  };
  const paperStory = scene.templateId === "frame-paper-story";
  const setSceneImage = (assetId: string) => {
    if (paperStory) {
      updateScene({
        inputs: { ...scene.inputs, imageAsset: assetId, image: "" },
      });
      return;
    }
    const photo = templates.find((t) => t.id === "frame-photo-story")!;
    updateScene({
      templateId: photo.id,
      inputs: {
        ...photo.defaults,
        ...(scene.templateId === photo.id ? scene.inputs : {}),
        headline: sceneHeadline(scene),
        brand: draft.script.metadata.channel,
        imageAsset: assetId,
      },
    });
  };
  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const asset = await onUpload(file);
      setSceneImage(asset.id);
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };
  return (
    <div className="editor-layout page-enter">
      <aside className="scene-panel">
        <div className="scene-heading">
          <h3>
            Các cảnh <span>{draft.script.scenes.length}</span>
          </h3>
          <button
            className="icon-button"
            title="Thêm cảnh"
            aria-label="Thêm cảnh"
            onClick={addScene}
            disabled={draft.script.scenes.length >= 12}
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="scene-list">
          {draft.script.scenes.map((s, i) => {
            const t =
              templates.find((t) => t.id === s.templateId) ?? templates[0];
            return (
              <button
                className={`scene-item ${i === selected ? "selected" : ""}`}
                key={s.id}
                onClick={() => onSelected(i)}
              >
                <span className="scene-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="scene-thumb">
                  <TemplateArt template={t} headline={sceneHeadline(s)} />
                </div>
                <div className="scene-info">
                  <small>
                    {s.type === "hook"
                      ? "MỞ ĐẦU"
                      : s.type === "outro"
                        ? "KẾT THÚC"
                        : "NỘI DUNG"}
                  </small>
                  <strong>{sceneHeadline(s)}</strong>
                  <span>{t.name}</span>
                </div>
              </button>
            );
          })}
        </div>
        <button
          className="add-scene"
          onClick={addScene}
          disabled={draft.script.scenes.length >= 12}
        >
          <Plus size={16} /> Thêm một cảnh
        </button>
        <div className="scene-bottom">
          <span>
            {draft.script.scenes.length} cảnh · khoảng{" "}
            {Math.max(
              5,
              Math.round(
                draft.script.scenes.reduce(
                  (n, s) => n + s.voiceText.length,
                  0,
                ) / 15,
              ),
            )}{" "}
            giây
          </span>
          <small>Thời lượng sẽ khớp với giọng đọc</small>
        </div>
      </aside>
      <section className="canvas-panel">
        <div className="canvas-toolbar">
          <span>
            <span className="live-dot" /> Cảnh {selected + 1}{" "}
            <span className="muted">/ {draft.script.scenes.length}</span>
          </span>
          <div className="canvas-actions">
            <Select
              aria-label="Tỉ lệ video"
              value={draft.script.aspect}
              onValueChange={(value) =>
                onChange({
                  ...draft,
                  script: {
                    ...draft.script,
                    aspect: value as Draft["script"]["aspect"],
                  },
                })
              }
            >
              <option value="9:16">9:16 · Dọc</option>
              <option value="16:9">16:9 · Ngang</option>
            </Select>
            <button
              className="icon-button"
              aria-label="Di chuyển cảnh lên"
              onClick={() => moveScene(-1)}
              disabled={scene.type !== "body" || selected <= 1}
            >
              <ChevronUp size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Di chuyển cảnh xuống"
              onClick={() => moveScene(1)}
              disabled={
                scene.type !== "body" ||
                selected >= draft.script.scenes.length - 2
              }
            >
              <ChevronDown size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Xoá cảnh"
              disabled={
                scene.type !== "body" || draft.script.scenes.length <= 3
              }
              onClick={() => {
                onChange({
                  ...draft,
                  script: {
                    ...draft.script,
                    scenes: draft.script.scenes.filter(
                      (_, i) => i !== selected,
                    ),
                  },
                });
                onSelected(Math.max(0, selected - 1));
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <Preview scene={scene} aspect={draft.script.aspect} />
        <div className="narration-card">
          <div className="field-heading">
            <span>
              <AudioLines size={14} /> LỜI ĐỌC CẢNH{" "}
              {String(selected + 1).padStart(2, "0")}
            </span>
            <span className="muted">{scene.voiceText.length} ký tự</span>
          </div>
          <textarea
            aria-label="Lời đọc của cảnh"
            value={scene.voiceText}
            onChange={(e) => updateScene({ voiceText: e.target.value })}
            placeholder="Bạn muốn kể điều gì ở cảnh này?"
            rows={3}
          />
          <div className="narration-footer">
            <span>Viết số thành chữ để giọng đọc tự nhiên hơn.</span>
            <button
              className="text-button"
              onClick={listen}
              disabled={listening || !scene.voiceText.trim()}
            >
              {listening ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <Play size={14} />
              )}
              {listening ? "Đang tạo giọng…" : "Nghe thử"}
            </button>
          </div>
          {audio && (
            <audio className="audio-preview" controls autoPlay src={audio} />
          )}
        </div>
      </section>
      <aside className="inspector">
        <div className="inspector-tabs">
          <button
            onClick={() => setTab("content")}
            className={tab === "content" ? "active" : ""}
          >
            <SlidersHorizontal size={15} /> Thiết kế
          </button>
          <button
            onClick={() => setTab("audio")}
            className={tab === "audio" ? "active" : ""}
          >
            <AudioLines size={15} /> Âm thanh
          </button>
        </div>
        {tab === "content" ? (
          <div className="inspector-content">
            <div className="field-heading">
              <span>TEMPLATE CỦA CẢNH</span>
            </div>
            <button className="current-template" onClick={onTemplates}>
              <span
                className="template-swatch"
                style={{ background: template?.color }}
              >
                <LayoutTemplate size={18} />
              </span>
              <span>
                <strong>{template?.name}</strong>
                <small>Đổi phong cách</small>
              </span>
              <ArrowRight size={16} />
            </button>
            {paperStory && (
              <div className="paper-style-actions">
                <button
                  className="button secondary full-width"
                  onClick={() =>
                    onChange({
                      ...draft,
                      script: {
                        ...draft.script,
                        scenes: draft.script.scenes.map((s, i) => ({
                          ...s,
                          templateId: template.id,
                          inputs: {
                            ...template.defaults,
                            headline: scene.inputs.headline || draft.title,
                            illustration: ["learning", "overload", "balance"][
                              i % 3
                            ],
                            brand: scene.inputs.brand || "",
                            ...(s.templateId === template.id &&
                            s.inputs.imageAsset
                              ? { imageAsset: s.inputs.imageAsset }
                              : {}),
                          },
                        })),
                      },
                    })
                  }
                >
                  Áp dụng phong cách cho cả video
                </button>
                <p>
                  Tiêu đề xuyên suốt, tranh đổi theo cảnh. Phụ đề dùng lời đọc;
                  nhịp nhấn từ được ước lượng theo thời lượng audio.
                </p>
              </div>
            )}
            <div className="inspector-divider" />
            <div className="field-heading">
              <span>CHỮ TRÊN KHUNG HÌNH</span>
            </div>
            <div className="slot-fields">
              {Object.entries(scene.inputs)
                .filter(([key]) => !["image", "imageAsset"].includes(key))
                .map(([key, value]) => (
                  <Slot
                    key={`${scene.id}-${key}`}
                    name={key}
                    value={value}
                    change={(v) =>
                      updateScene({
                        inputs: {
                          ...scene.inputs,
                          [key]: v,
                          ...(key === "illustration"
                            ? { imageAsset: "", image: "" }
                            : {}),
                        },
                      })
                    }
                  />
                ))}
            </div>
            <div className="inspector-divider" />
            <div className="field-heading">
              <span>HÌNH ẢNH</span>
              <span className="tiny-tag">
                {paperStory ? "PAPER STORY" : "PHOTO STORY"}
              </span>
            </div>
            {typeof scene.inputs.imageAsset === "string" &&
              scene.inputs.imageAsset && (
                <img
                  className="uploaded-image"
                  src={`/api/assets/${scene.inputs.imageAsset}/file`}
                  alt="Ảnh đã chọn cho cảnh"
                />
              )}
            <label className="upload-zone">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={uploadImage}
                disabled={uploading}
              />
              <ImagePlus size={22} />
              <strong>
                {uploading ? "Đang tải ảnh…" : "Thêm hình ảnh của bạn"}
              </strong>
              <small>PNG, JPG, WebP · tối đa 8 MB</small>
            </label>
            {assets.some((a) => a.type === "image") && (
              <label className="field">
                Hoặc chọn từ thư viện
                <Select
                  value={String(scene.inputs.imageAsset || "")}
                  onValueChange={setSceneImage}
                >
                  <option value="">Chọn hình ảnh</option>
                  {assets
                    .filter((a) => a.type === "image")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </Select>
              </label>
            )}
            <p className="field-help">
              {paperStory
                ? "Giữ bố cục Paper Story khi thay tranh bằng ảnh của bạn. Chọn tranh có sẵn để quay lại bộ minh hoạ mặc định."
                : "Thêm ảnh sẽ chuyển cảnh sang Photo Story để ảnh được đưa vào video."}
            </p>
          </div>
        ) : (
          <div className="inspector-content">
            <VoiceConfig
              voice={draft.script.voice}
              onChange={(voice) =>
                onChange({ ...draft, script: { ...draft.script, voice } })
              }
              assets={assets}
              onUpload={onUpload}
              text={scene.voiceText}
            />
            <div className="inspector-divider" />
            <div className="field-heading">
              <span>NHẠC NỀN</span>
              <span className="optional">tuỳ chọn</span>
            </div>
            <label className="field">
              Bản nhạc
              <Select
                value={draft.musicAsset || ""}
                onValueChange={(value) =>
                  onChange({
                    ...draft,
                    musicAsset: value || undefined,
                  })
                }
              >
                <option value="">Không có nhạc nền</option>
                {assets
                  .filter((a) => a.type === "audio")
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
            </label>
            <label className="upload-inline">
              <Upload size={15} /> Tải nhạc của bạn
              <input
                type="file"
                accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const a = await onUpload(file);
                    onChange({ ...draft, musicAsset: a.id });
                  } catch (error) {
                    notify(errorMessage(error), true);
                  }
                }}
              />
            </label>
            {draft.musicAsset && (
              <>
                <audio
                  controls
                  src={`/api/assets/${draft.musicAsset}/file`}
                  className="audio-preview"
                />
                <label className="field">
                  Âm lượng nhạc{" "}
                  <span>{Math.round(draft.musicVolume * 100)}%</span>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.01"
                    value={draft.musicVolume}
                    onChange={(e) =>
                      onChange({
                        ...draft,
                        musicVolume: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </>
            )}
            <div className="inspector-divider" />
            <label className="toggle-row">
              <span>
                <strong>Hiệu ứng âm thanh</strong>
                <small>Tự chọn theo nội dung nếu có thư viện SFX</small>
              </span>
              <input
                type="checkbox"
                checked={draft.sfx}
                onChange={(e) => onChange({ ...draft, sfx: e.target.checked })}
              />
            </label>
          </div>
        )}
      </aside>
    </div>
  );
}
