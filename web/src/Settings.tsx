import VoiceConfig from "./VoiceConfig";
import Select from "./Select";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  KeyRound,
  RefreshCw,
  Terminal,
  ShieldCheck,
  Save,
  Plug,
} from "lucide-react";
import { api, body, errorMessage } from "./api";
import type { Agent, PublicSettings } from "./model";

export default function Settings({
  settings,
  onSave,
  notify,
}: {
  settings: PublicSettings;
  onSave: (s: PublicSettings) => void;
  notify: (s: string, error?: boolean) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [models, setModels] = useState<
    { id: string; name: string; description?: string }[]
  >([]);
  const [modelSource, setModelSource] = useState("");
  const [modelBusy, setModelBusy] = useState(false);
  const modelRequest = useRef<AbortController | null>(null);
  const scanModels = async () => {
    modelRequest.current?.abort();
    const controller = new AbortController();
    modelRequest.current = controller;
    setModelBusy(true);
    setModelSource("");
    try {
      const result = await api<{ models: typeof models; source: string }>(
        "/models",
        {
          method: "POST",
          signal: controller.signal,
          body: body({
            ...draft.ai,
            ...(key || clearKey ? { apiKey: key } : {}),
          }),
        },
      );
      if (!controller.signal.aborted) {
        setModels(result.models);
        setModelSource(result.source);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setModels([]);
        setModelSource(errorMessage(e));
      }
    } finally {
      if (!controller.signal.aborted) setModelBusy(false);
    }
  };
  useEffect(() => {
    setModels([]);
    setModelSource("");
    setModelBusy(false);
    modelRequest.current?.abort();
    const timeout = setTimeout(() => {
      if (
        draft.ai.mode === "cli" ||
        (draft.ai.hasApiKey &&
          draft.ai.provider === settings.ai.provider &&
          draft.ai.baseUrl === settings.ai.baseUrl)
      )
        void scanModels();
    }, 350);
    return () => {
      clearTimeout(timeout);
      modelRequest.current?.abort();
    };
  }, [draft.ai.mode, draft.ai.cli, draft.ai.provider, draft.ai.baseUrl]);
  const scan = async () => {
    setScanning(true);
    try {
      setAgents(await api<Agent[]>("/agents"));
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setScanning(false);
    }
  };
  useEffect(() => {
    void scan();
  }, []);
  const ai = (patch: Partial<PublicSettings["ai"]>) =>
    setDraft((s) => ({ ...s, ai: { ...s.ai, ...patch } }));
  const save = async () => {
    setSaving(true);
    try {
      const value = await api<PublicSettings>("/settings", {
        method: "PUT",
        body: body({
          ...draft,
          ai: { ...draft.ai, ...(key || clearKey ? { apiKey: key } : {}) },
        }),
      });
      onSave(value);
      setDraft(value);
      setKey("");
      setClearKey(false);
      notify("Đã lưu kết nối và lựa chọn mặc định trên máy này.");
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="settings-page page-enter">
      <div className="section-heading">
        <div>
          <div className="eyebrow">KHÔNG GIAN CỦA BẠN</div>
          <h1>
            Kết nối một lần.
            <br />
            <span>Sáng tạo mỗi ngày.</span>
          </h1>
          <p>Chọn công cụ bạn quen dùng. Studio sẽ nhớ cho lần tiếp theo.</p>
        </div>
        <span className="heading-icon">
          <Plug size={36} strokeWidth={1.4} />
        </span>
      </div>
      <div className="settings-grid">
        <section className="panel settings-main">
          <div className="panel-heading">
            <span className="number-circle">01</span>
            <div>
              <h2>Trợ lý viết kịch bản</h2>
              <p>Dùng tài khoản CLI có sẵn hoặc kết nối API của bạn.</p>
            </div>
          </div>
          <div className="segmented">
            <button
              className={draft.ai.mode === "cli" ? "active" : ""}
              onClick={() => ai({ mode: "cli", model: "" })}
            >
              <Terminal size={16} /> CLI trên máy
            </button>
            <button
              className={draft.ai.mode === "api" ? "active" : ""}
              onClick={() => ai({ mode: "api", model: "" })}
            >
              <KeyRound size={16} /> API key
            </button>
          </div>
          {draft.ai.mode === "cli" ? (
            <>
              <div className="field-heading">
                <span>AGENT KHẢ DỤNG</span>
                <button
                  className="text-button"
                  onClick={scan}
                  disabled={scanning}
                >
                  <RefreshCw size={13} className={scanning ? "spin" : ""} />{" "}
                  {scanning ? "Đang quét…" : "Quét lại"}
                </button>
              </div>
              <div className="agent-options">
                {["claude", "codex", "gemini"].map((id) => {
                  const agent = agents.find((a) => a.id === id);
                  return (
                    <button
                      key={id}
                      className={`agent-option ${draft.ai.cli === id ? "selected" : ""}`}
                      onClick={() => ai({ cli: id as Agent["id"], model: "" })}
                      disabled={!agent?.available}
                    >
                      <span className={`agent-mark ${id}`}>
                        {id === "claude" ? "✳" : id === "codex" ? "⌘" : "✦"}
                      </span>
                      <span className="agent-info">
                        <strong>
                          {agent?.name ||
                            {
                              claude: "Claude Code",
                              codex: "Codex CLI",
                              gemini: "Gemini CLI",
                            }[id]}
                        </strong>
                        <small>
                          {agent?.available
                            ? agent.version
                            : scanning
                              ? "Đang tìm trong PATH…"
                              : "Chưa tìm thấy trên máy"}
                        </small>
                      </span>
                      <span
                        className={`status-tag ${agent?.available ? "online" : ""}`}
                      >
                        {agent?.available ? "Đã cài" : "Chưa cài"}
                      </span>
                      {draft.ai.cli === id && <Check size={16} />}
                    </button>
                  );
                })}
              </div>
              <div className="inline-note">
                <Terminal size={16} />
                <span>
                  Agent được quét trên <strong>máy đang chạy Studio</strong>.
                  Đăng nhập CLI trong terminal trước lần tạo kịch bản đầu tiên.
                </span>
              </div>
            </>
          ) : (
            <div className="api-form">
              <label className="field">
                Nhà cung cấp
                <Select
                  value={draft.ai.provider}
                  onValueChange={(value) => {
                    ai({
                      provider: value as PublicSettings["ai"]["provider"],
                      baseUrl: "",
                      model: "",
                      hasApiKey: false,
                    });
                    setKey("");
                  }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google Gemini</option>
                  <option value="compatible">OpenAI-compatible / Ollama</option>
                </Select>
              </label>
              <label className="field">
                API key{" "}
                {draft.ai.hasApiKey && !clearKey && (
                  <span className="saved-key">
                    <Check size={12} /> Đã lưu
                  </span>
                )}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setClearKey(false);
                  }}
                  placeholder={
                    draft.ai.hasApiKey && !clearKey
                      ? "Để trống để giữ key đã lưu"
                      : "Dán API key của bạn"
                  }
                />
              </label>
              {draft.ai.hasApiKey && (
                <button
                  className="text-button danger"
                  onClick={() => {
                    setClearKey(true);
                    setKey("");
                    ai({ hasApiKey: false });
                  }}
                >
                  Xoá key khi lưu
                </button>
              )}
              <label className="field">
                Base URL <span className="optional">tuỳ chọn</span>
                <input
                  value={draft.ai.baseUrl}
                  onChange={(e) => ai({ baseUrl: e.target.value })}
                  placeholder={
                    draft.ai.provider === "compatible"
                      ? "http://127.0.0.1:11434/v1"
                      : "Để trống để dùng API chính thức"
                  }
                />
              </label>
              <p className="field-help">
                API key dùng cho nhà cung cấp và endpoint đã chọn. Nếu đổi kết
                nối, hãy nhập key tương ứng.
              </p>
            </div>
          )}
          <div className="model-picker">
            <div className="field-heading">
              <span>{draft.ai.mode === "cli" ? "MODEL CLI" : "MODEL API"}</span>
              <button
                type="button"
                className="text-button"
                onClick={() => void scanModels()}
                disabled={modelBusy}
              >
                <RefreshCw size={14} className={modelBusy ? "spin" : ""} />
                {modelBusy ? "Đang quét…" : "Quét model"}
              </button>
            </div>
            <Select
              aria-label={draft.ai.mode === "cli" ? "Model CLI" : "Model API"}
              value={draft.ai.model}
              onValueChange={(model) => ai({ model })}
              allowCustom
              options={[
                {
                  value: "",
                  label:
                    draft.ai.mode === "cli"
                      ? "Mặc định của agent"
                      : "Chọn model từ nhà cung cấp",
                },
                ...models.map((m) => ({
                  value: m.id,
                  label: m.name,
                  description: m.description || m.id,
                })),
                ...(draft.ai.model &&
                !models.some((m) => m.id === draft.ai.model)
                  ? [{ value: draft.ai.model, label: draft.ai.model }]
                  : []),
              ]}
            />
            <p className="field-help" aria-live="polite">
              {modelSource ||
                "Quét danh sách, tìm kiếm hoặc nhập model ID tuỳ chỉnh trong dropdown."}
            </p>
          </div>
        </section>
        <div className="settings-aside">
          <section className="panel">
            <div className="panel-heading">
              <span className="number-circle">02</span>
              <div>
                <h2>Giọng đọc mặc định</h2>
                <p>Có thể đổi riêng cho từng video.</p>
              </div>
            </div>
            <label className="field">
              Địa chỉ VieNeu
              <input
                value={draft.tts.vieneuEndpoint}
                onChange={(e) =>
                  setDraft((s) => ({
                    ...s,
                    tts: { ...s.tts, vieneuEndpoint: e.target.value },
                  }))
                }
              />
            </label>
            <label className="field">
              Địa chỉ OmniVoice
              <input
                value={draft.tts.omnivoiceEndpoint}
                onChange={(e) =>
                  setDraft((s) => ({
                    ...s,
                    tts: { ...s.tts, omnivoiceEndpoint: e.target.value },
                  }))
                }
              />
            </label>
            <VoiceConfig
              defaultsOnly
              voice={{
                provider: draft.tts.provider,
                mode: "design",
                speed: 1,
                voice: draft.tts.voice || undefined,
                instructions:
                  draft.tts.provider === "omnivoice"
                    ? draft.tts.instructions || undefined
                    : undefined,
              }}
              onChange={(voice) =>
                setDraft((s) => ({
                  ...s,
                  tts: {
                    ...s.tts,
                    provider: voice.provider,
                    voice: voice.voice || "",
                    instructions: voice.instructions || "",
                  },
                }))
              }
            />
          </section>
          <section className="privacy-card">
            <ShieldCheck size={24} />
            <h3>Lưu ở đây. Thuộc về bạn.</h3>
            <p>
              Cấu hình và dự án lưu trên máy chạy Studio. API key được mã hoá
              bằng khoá local và không gửi lại cho trình duyệt.
            </p>
            <span>BẢN NỘI BỘ · LOCAL FIRST</span>
          </section>
        </div>
        <section className="panel brand-panel">
          <div className="panel-heading">
            <span className="number-circle">03</span>
            <div>
              <h2>Dấu ấn của bạn</h2>
              <p>Được điền sẵn khi tạo dự án mới.</p>
            </div>
          </div>
          <label className="field">
            Tên kênh / thương hiệu
            <input
              value={draft.brand.channel}
              onChange={(e) =>
                setDraft((s) => ({
                  ...s,
                  brand: { ...s.brand, channel: e.target.value },
                }))
              }
            />
          </label>
        </section>
      </div>
      <div className="settings-save">
        <span>
          <ShieldCheck size={15} /> Ghi nhớ trên máy này
        </span>
        <button className="button primary" onClick={save} disabled={saving}>
          <Save size={16} /> {saving ? "Đang lưu…" : "Lưu cấu hình"}
        </button>
      </div>
    </div>
  );
}
