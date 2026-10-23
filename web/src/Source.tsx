import VoiceConfig from "./VoiceConfig";
import Select from "./Select";
import {
  FileText,
  Upload,
  Link2,
  Globe,
  Sparkles,
  LoaderCircle,
  WandSparkles,
  ArrowRight,
  ChevronRight,
  AudioLines,
} from "lucide-react";
import { TemplateArt } from "./Templates";
import {
  SAMPLE,
  type Draft,
  type Asset,
  type Agent,
  type PublicSettings,
  type TemplateInfo,
} from "./model";

export default function Source({
  draft,
  setDraft,
  sourceType,
  setSourceType,
  sceneCount,
  setSceneCount,
  busy,
  fileImport,
  generate,
  openPage,
  settings,
  agents,
  templates,
  chooseTemplate,
  assets,
  onUpload,
}: {
  assets: Asset[];
  onUpload: (file: File) => Promise<Asset>;
  draft: Draft;
  setDraft: (draft: Draft) => void;
  sourceType: string;
  setSourceType: (value: string) => void;
  sceneCount: number;
  setSceneCount: (value: number) => void;
  busy: string;
  fileImport: (file?: File) => Promise<void>;
  generate: (manual?: boolean) => Promise<void>;
  openPage: (page: string) => void;
  settings: PublicSettings;
  agents: Agent[];
  templates: TemplateInfo[];
  chooseTemplate: (template: TemplateInfo) => void;
}) {
  return (
    <div className="source-layout page-enter">
      <section className="source-panel panel">
        <div className="source-card-heading">
          <span className="number-circle">01</span>
          <div>
            <h2>Câu chuyện của bạn là gì?</h2>
            <p>Dán nội dung, thêm bài viết hoặc nhập kịch bản có sẵn.</p>
          </div>
          <FileText size={23} strokeWidth={1.3} />
        </div>
        <div className="source-tabs">
          <button
            onClick={() => setSourceType("text")}
            className={sourceType === "text" ? "active" : ""}
          >
            <FileText size={15} /> Văn bản
          </button>
          <button
            onClick={() => setSourceType("url")}
            className={sourceType === "url" ? "active" : ""}
          >
            <Link2 size={15} /> Link bài viết
          </button>
          <label>
            <Upload size={15} /> Nhập tệp
            <input
              type="file"
              accept=".txt,.json"
              onChange={(e) => void fileImport(e.target.files?.[0])}
            />
          </label>
        </div>
        <label className="field">
          Tên video
          <input
            value={draft.title}
            onChange={(e) =>
              setDraft({
                ...draft,
                title: e.target.value,
                script: {
                  ...draft.script,
                  metadata: {
                    ...draft.script.metadata,
                    title: e.target.value,
                  },
                },
              })
            }
            placeholder="Đặt tên cho câu chuyện của bạn"
            maxLength={200}
          />
        </label>
        {sourceType === "text" ? (
          <div className="source-input-wrap">
            <textarea
              aria-label="Nội dung video"
              value={draft.sourceText}
              onChange={(e) =>
                setDraft({ ...draft, sourceText: e.target.value })
              }
              maxLength={60000}
              placeholder={
                "Mọi video hay đều bắt đầu bằng một ý tưởng…\n\nDán bài viết, ghi chú hoặc kể cho AI nghe điều bạn muốn chia sẻ."
              }
            />
            <div className="source-input-footer">
              <button
                className="text-button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    sourceText: SAMPLE,
                    title: "Mỗi ý tưởng, một câu chuyện",
                    script: {
                      ...draft.script,
                      metadata: {
                        ...draft.script.metadata,
                        title: "Mỗi ý tưởng, một câu chuyện",
                      },
                    },
                  })
                }
              >
                <Sparkles size={13} /> Dùng nội dung mẫu
              </button>
              <span>
                {draft.sourceText.length.toLocaleString("vi-VN")} / 60.000
              </span>
            </div>
          </div>
        ) : (
          <div className="url-source">
            <label className="field">
              Đường dẫn bài viết
              <input
                type="url"
                value={draft.sourceUrl}
                onChange={(e) =>
                  setDraft({ ...draft, sourceUrl: e.target.value })
                }
                placeholder="https://…"
              />
            </label>
            <div className="soft-note">
              <Globe size={18} />
              <p>
                Studio sẽ đọc nội dung bài viết công khai trước khi tạo kịch
                bản. Với bài cần đăng nhập, bạn có thể dán văn bản trực tiếp.
              </p>
            </div>
          </div>
        )}
        <div className="source-options">
          <label className="field">
            Tỉ lệ video
            <Select
              value={draft.script.aspect}
              onValueChange={(value) =>
                setDraft({
                  ...draft,
                  script: {
                    ...draft.script,
                    aspect: value as Draft["script"]["aspect"],
                  },
                })
              }
            >
              <option value="9:16">9:16 · Shorts, Reels, TikTok</option>
              <option value="16:9">16:9 · YouTube, màn hình rộng</option>
            </Select>
          </label>
          <label className="field">
            Số cảnh gợi ý
            <Select
              value={sceneCount}
              onValueChange={(value) => setSceneCount(Number(value))}
            >
              {[3, 4, 5, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n} cảnh
                </option>
              ))}
            </Select>
          </label>
        </div>
        <details className="source-voice" open>
          <summary>
            <AudioLines size={17} /> Giọng đọc{" "}
            <span>Chọn và nghe thử trước khi bắt đầu</span>
          </summary>
          <VoiceConfig
            voice={draft.script.voice}
            onChange={(voice) =>
              setDraft({ ...draft, script: { ...draft.script, voice } })
            }
            assets={assets}
            onUpload={onUpload}
          />
        </details>
        <div className="generation-actions">
          <button
            className="button primary"
            onClick={() => void generate()}
            disabled={!!busy || !draft.title.trim()}
          >
            {busy === "generate" ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <WandSparkles size={17} />
            )}
            {busy === "generate"
              ? "AI đang viết câu chuyện…"
              : "Tạo kịch bản với AI"}
            <ArrowRight size={16} />
          </button>
          <button
            className="text-button"
            onClick={() => void generate(true)}
            disabled={!!busy}
          >
            {busy === "manual"
              ? "Đang chuẩn bị…"
              : "Tự chia cảnh, không dùng AI"}
          </button>
        </div>
        <div className="source-connection">
          <span className="live-dot" />
          <span>
            {settings.ai.mode === "cli"
              ? `Sử dụng ${agents.find((a) => a.id === settings.ai.cli)?.name || settings.ai.cli}`
              : `API ${settings.ai.provider}`}
          </span>
          <button onClick={() => openPage("settings")}>
            Đổi kết nối <ChevronRight size={12} />
          </button>
        </div>
      </section>
      <aside className="source-aside">
        <div className="inspiration-card">
          <div className="inspiration-top">
            <span>MADE TO CREATE</span>
            <Sparkles size={17} />
          </div>
          <h2>
            Ý tưởng nhỏ.
            <br />
            Khung hình lớn.
          </h2>
          <p>Từ những dòng chữ đầu tiên đến một video mang dấu ấn của bạn.</p>
          <div className="inspiration-composition">
            <div className="floating-frame rear">
              <span>YOUR VOICE.</span>
              <AudioLines size={42} strokeWidth={1} />
              <small>A story worth hearing.</small>
            </div>
            <div className="floating-frame front">
              <span>YOUR VISION.</span>
              <strong>
                MAKE
                <br />
                IT
                <br />
                <em>MOVE.</em>
              </strong>
              <small>FRAME STUDIO ↗</small>
            </div>
            <span className="orbit-tag">
              <span className="live-dot" /> 9:16 · READY TO TELL
            </span>
          </div>
          <div className="inspiration-bottom">
            <span>01 / Ý TƯỞNG</span>
            <span>02 / SÁNG TẠO</span>
            <span>03 / CHIA SẺ</span>
          </div>
        </div>
        <div className="how-card">
          <h3>Từ ý tưởng đến video</h3>
          <div>
            <span>01</span>
            <p>
              <strong>Bạn chọn nội dung</strong>
              <small>Văn bản, bài viết hoặc kịch bản sẵn có.</small>
            </p>
          </div>
          <div>
            <span>02</span>
            <p>
              <strong>Thêm phong cách riêng</strong>
              <small>Template, hình ảnh và giọng đọc.</small>
            </p>
          </div>
          <div>
            <span>03</span>
            <p>
              <strong>Để Studio lo phần còn lại</strong>
              <small>Dựng video, xem trước và tải về.</small>
            </p>
          </div>
        </div>
      </aside>
      <section className="template-strip">
        <div className="section-mini-heading">
          <div>
            <span className="eyebrow">A LITTLE INSPIRATION</span>
            <h2>Chọn một chất riêng.</h2>
          </div>
          <button className="text-button" onClick={() => openPage("templates")}>
            Khám phá {templates.length} template <ArrowRight size={15} />
          </button>
        </div>
        <div className="template-strip-grid">
          {[
            "frame-liquid-bg-hero",
            "frame-bold-poster",
            "frame-photo-story",
            "frame-pentagram-stat",
          ]
            .map((id) => templates.find((t) => t.id === id))
            .filter((t): t is TemplateInfo => !!t)
            .map((t) => (
              <button
                className="strip-card"
                key={t.id}
                onClick={() => chooseTemplate(t)}
              >
                <TemplateArt template={t} />
                <span>
                  {t.name}
                  <ArrowRight size={14} />
                </span>
              </button>
            ))}
        </div>
      </section>
    </div>
  );
}
