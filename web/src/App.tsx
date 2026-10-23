import Select from "./Select";
import Source from "./Source";
import Projects from "./Projects";
import Assets from "./Assets";
import Output from "./Output";
import Modal from "./Modal";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Clapperboard,
  FolderOpen,
  HardDrive,
  Layers3,
  LayoutTemplate,
  LoaderCircle,
  Menu,
  Save,
  Settings2,
  Sparkles,
  Terminal,
  X,
  AlertCircle,
  Clock3,
  CheckCircle2,
} from "lucide-react";
import { api, body, errorMessage, upload } from "./api";
import { DraftSchema } from "../../src/studio/schema";
import { TemplateScriptSchema } from "../../src/render/template-script-schema";
import {
  newDraft,
  sceneHeadline,
  type Draft,
  type PublicSettings,
  type TemplateInfo,
  type Project,
  type Asset,
  type Agent,
  type RenderJob,
} from "./model";
import Editor from "./Editor";
import Settings from "./Settings";
import Templates from "./Templates";

type ProjectSummary = Omit<Project, "draft"> & {
  aspect: string;
  scenes: number;
};
const steps = ["Nội dung", "Kịch bản & thiết kế", "Xuất video"];

export default function App() {
  const [settings, setSettings] = useState<PublicSettings>();
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [draft, setDraft] = useState<Draft>();
  const [project, setProject] = useState<Project>();
  const [page, setPage] = useState("studio");
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(0);
  const [sourceType, setSourceType] = useState("text");
  const [sceneCount, setSceneCount] = useState(5);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<{ message: string; error: boolean }>();
  const [initialError, setInitialError] = useState("");
  const [templateModal, setTemplateModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 760px)").matches,
  );
  const [previewJob, setPreviewJob] = useState("");
  const notify = (message: string, error = false) =>
    setToast({ message, error });
  const refreshProjects = () =>
    api<ProjectSummary[]>("/projects").then(setProjects);

  useEffect(() => {
    const media = matchMedia("(max-width: 760px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let current = true;
    Promise.all([
      api<PublicSettings>("/settings"),
      api<TemplateInfo[]>("/templates"),
      api<Agent[]>("/agents"),
      api<Asset[]>("/assets"),
      api<ProjectSummary[]>("/projects"),
    ])
      .then(async ([s, t, a, files, p]) => {
        if (!current) return;
        setSettings(s);
        setTemplates(t);
        setAgents(a);
        setAssets(files);
        setProjects(p);
        let value = newDraft(s, t);
        try {
          const saved = JSON.parse(
            localStorage.getItem("frame-studio-draft") || "null",
          );
          if (saved?.draft) value = DraftSchema.parse(saved.draft);
          if (saved?.projectId && p.some((p) => p.id === saved.projectId)) {
            const loaded = await api<Project>(`/projects/${saved.projectId}`);
            if (current) setProject(loaded);
            if (current)
              setStep(
                loaded.jobs.some((j) =>
                  ["queued", "running"].includes(j.status),
                )
                  ? 2
                  : saved.step === 1
                    ? 1
                    : 0,
              );
          }
        } catch {
          /* Older browser drafts are replaced with a valid new draft. */
        }
        const linkedProject = new URLSearchParams(location.search).get(
          "project",
        );
        if (linkedProject && p.some((item) => item.id === linkedProject)) {
          const loaded = await api<Project>(`/projects/${linkedProject}`);
          value = loaded.draft;
          if (current) {
            setProject(loaded);
            setStep(loaded.jobs.length ? 2 : 1);
          }
        }
        if (current) setDraft(value);
      })
      .catch((e) => {
        if (current) setInitialError(errorMessage(e));
      });
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => {
      try {
        const linkedProject = new URLSearchParams(location.search).get(
          "project",
        );
        localStorage.setItem(
          linkedProject
            ? `frame-studio-project-${linkedProject}`
            : "frame-studio-draft",
          body({ version: 1, draft, projectId: project?.id, step }),
        );
      } catch {
        /* Explicit project save remains available if browser storage is full. */
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, project?.id, step]);
  useEffect(() => {
    if (page !== "projects") return;
    void refreshProjects().catch(() => {});
    const timer = setInterval(() => {
      void refreshProjects().catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [page]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => setToast(undefined),
      toast.error ? 10000 : 4500,
    );
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!project?.id) return;
    const id = project.id;
    const events = new EventSource(`/api/projects/${id}/events`);
    const update = (job: RenderJob) => {
      setProject((prev) =>
        !prev || prev.id !== id
          ? prev
          : {
              ...prev,
              jobs: [job, ...prev.jobs.filter((j) => j.id !== job.id)].sort(
                (a, b) => b.createdAt.localeCompare(a.createdAt),
              ),
            },
      );
      if (job.status === "completed") void refreshProjects();
    };
    events.onmessage = (event) => update(JSON.parse(event.data));
    // Polling also recovers when a proxy/browser drops an SSE connection.
    const timer = setInterval(() => {
      if (events.readyState !== EventSource.OPEN)
        api<Project>(`/projects/${id}`)
          .then((p) => setProject((prev) => (prev?.id === id ? p : prev)))
          .catch(() => {});
    }, 4000);
    return () => {
      events.close();
      clearInterval(timer);
    };
  }, [project?.id]);

  if (!settings || !draft)
    return (
      <div className="app-loading">
        <div className="brand-icon">
          f<span>▶</span>
        </div>
        {initialError ? (
          <>
            <h2>Chưa mở được Studio</h2>
            <p>{initialError}</p>
            <button
              className="button primary"
              onClick={() => location.reload()}
            >
              Thử lại
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" size={22} />
            <p>Đang chuẩn bị không gian sáng tạo…</p>
          </>
        )}
      </div>
    );
  const currentDraft = draft;
  const activeJob = project?.jobs.find((j) =>
    ["queued", "running"].includes(j.status),
  );
  const job =
    project?.jobs.find((j) => j.id === previewJob) ?? project?.jobs[0];
  const openPage = (page: string) => {
    setPage(page);
    setMenu(false);
  };
  const saveProject = async () => {
    const value = DraftSchema.parse(currentDraft);
    const result = await api<Project>(
      project ? `/projects/${project.id}` : "/projects",
      { method: project ? "PUT" : "POST", body: body(value) },
    );
    setProject(result);
    await refreshProjects();
    return result;
  };
  const save = async () => {
    setBusy("save");
    try {
      await saveProject();
      notify("Đã lưu dự án trên máy này.");
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setBusy("");
    }
  };
  const uploadAsset = async (file: File) => {
    if (file.size > (file.type.startsWith("image/") ? 8_000_000 : 20_000_000))
      throw new Error("Tệp quá lớn. Ảnh tối đa 8 MB, âm thanh tối đa 20 MB.");
    const asset = await api<Asset>("/assets", {
      method: "POST",
      body: body({ name: file.name, data: await upload(file) }),
    });
    setAssets((prev) => [asset, ...prev]);
    notify(`Đã thêm ${file.name}`);
    return asset;
  };
  const chooseTemplate = (template: TemplateInfo) => {
    const scene = currentDraft.script.scenes[selected];
    const inputs = structuredClone(template.defaults);
    for (const key of Object.keys(inputs)) {
      if (
        key in scene.inputs &&
        typeof inputs[key] === typeof scene.inputs[key] &&
        Array.isArray(inputs[key]) === Array.isArray(scene.inputs[key])
      )
        inputs[key] = scene.inputs[key];
    }
    if (typeof inputs.headline === "string")
      inputs.headline = sceneHeadline(scene);
    setDraft({
      ...currentDraft,
      script: {
        ...currentDraft.script,
        scenes: currentDraft.script.scenes.map((s, i) =>
          i === selected ? { ...s, templateId: template.id, inputs } : s,
        ),
      },
    });
    setTemplateModal(false);
    setPage("studio");
    setStep(1);
  };
  const generate = async (manual = false) => {
    setBusy(manual ? "manual" : "generate");
    try {
      let text = currentDraft.sourceText,
        title = currentDraft.title,
        sourceUrl = currentDraft.sourceUrl;
      if (sourceType === "url") {
        const article = await api<{ text: string; title: string; url: string }>(
          "/source",
          { method: "POST", body: body({ url: sourceUrl }) },
        );
        text = article.text;
        sourceUrl = article.url;
        if (title === "Câu chuyện mới" || !title.trim()) title = article.title;
      }
      if (text.trim().length < 20)
        throw new Error(
          "Hãy thêm ít nhất 20 ký tự nội dung hoặc chọn Dùng nội dung mẫu.",
        );
      let script = currentDraft.script;
      if (manual) {
        const sentences = text
          .match(/[^.!?\n]+[.!?]?/g)
          ?.map((s) => s.trim())
          .filter(Boolean) ?? [text];
        const count = Math.min(
          12,
          Math.max(3, Math.min(sceneCount, sentences.length)),
        );
        const groups = Array.from(
          { length: count },
          (_, i) =>
            sentences
              .slice(
                Math.floor((i * sentences.length) / count),
                Math.floor(((i + 1) * sentences.length) / count),
              )
              .join(" ") ||
            (i === count - 1 ? "Theo dõi để xem câu chuyện tiếp theo." : title),
        );
        script = {
          ...script,
          scenes: groups.map((voiceText, i) => {
            const role = i === 0 ? "hook" : i === count - 1 ? "outro" : "body";
            const templateId =
              role === "hook"
                ? "frame-liquid-bg-hero"
                : role === "outro"
                  ? "frame-logo-outro"
                  : "frame-photo-story";
            const t = templates.find((t) => t.id === templateId)!;
            return {
              id: `${role}-${i + 1}`,
              type: role,
              templateId,
              voiceText,
              inputs: {
                ...t.defaults,
                ...(role === "outro"
                  ? {
                      brand_name: settings.brand.channel,
                      tagline: "Cảm ơn bạn đã theo dõi",
                      primary_url: "",
                    }
                  : {
                      headline:
                        i === 0
                          ? title
                          : voiceText.split(/\s+/).slice(0, 8).join(" "),
                      ...(role === "hook"
                        ? {
                            subheadline:
                              "Câu chuyện của bạn, góc nhìn của bạn.",
                            kicker: "CÂU CHUYỆN MỚI",
                          }
                        : { subtitle: "" }),
                      brand: settings.brand.channel,
                    }),
              },
            };
          }),
        };
      } else {
        script = await api<Draft["script"]>("/generate", {
          method: "POST",
          body: body({
            text,
            title,
            sourceUrl,
            channel: settings.brand.channel,
            aspect: currentDraft.script.aspect,
            sceneCount,
          }),
        });
        script.voice = currentDraft.script.voice;
      }
      script.metadata = {
        ...script.metadata,
        title,
        source: {
          url: sourceUrl,
          domain: sourceUrl ? new URL(sourceUrl).hostname : "local",
          image: null,
        },
      };
      setDraft({ ...currentDraft, title, sourceText: text, sourceUrl, script });
      setSelected(0);
      setStep(1);
      notify(
        manual
          ? "Đã chia nội dung thành các cảnh. Bạn có thể chỉnh từng cảnh."
          : "Kịch bản đã sẵn sàng. Chỉnh lại theo cách của bạn.",
      );
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setBusy("");
    }
  };
  const render = async () => {
    setBusy("render");
    try {
      const saved = await saveProject();
      const job = await api<RenderJob>(`/projects/${saved.id}/render`, {
        method: "POST",
      });
      setProject({ ...saved, jobs: [job, ...saved.jobs] });
      setPreviewJob(job.id);
      setConfirm(false);
      setStep(2);
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setBusy("");
    }
  };
  const openProject = async (id: string) => {
    try {
      const p = await api<Project>(`/projects/${id}`);
      setProject(p);
      setDraft(p.draft);
      setSelected(0);
      setPage("studio");
      setStep(p.jobs[0] ? 2 : 1);
      setPreviewJob("");
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  const reset = () => {
    setDraft(newDraft(settings, templates));
    setProject(undefined);
    setSelected(0);
    setStep(0);
    openPage("studio");
    setPreviewJob("");
  };
  const fileImport = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("Nội dung nhập tối đa 1 MB.");
      const text = await file.text();
      if (file.name.endsWith(".json")) {
        const script = TemplateScriptSchema.parse(JSON.parse(text));
        if (
          script.scenes.some(
            (s) => !templates.some((t) => t.id === s.templateId),
          )
        )
          throw new Error("Kịch bản có template chưa cài đặt.");
        setDraft({ ...currentDraft, script, title: script.metadata.title });
        setSelected(0);
        setStep(1);
      } else {
        setDraft({ ...currentDraft, sourceText: text.slice(0, 60000) });
        setSourceType("text");
      }
      notify("Đã nhập nội dung từ tệp.");
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };

  return (
    <div className="app-shell">
      {menu && <div className="sidebar-scrim" onClick={() => setMenu(false)} />}
      <aside
        id="workspace-navigation"
        inert={mobile && !menu}
        className={`sidebar ${menu ? "mobile-open" : ""}`}
      >
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            openPage("studio");
          }}
        >
          <span className="brand-icon">
            f<span>▶</span>
          </span>
          <span>
            frame<span className="brand-period">.</span>
          </span>
          <small>STUDIO</small>
        </a>
        <div className="workspace-pill">
          <span className="workspace-avatar">
            {settings.brand.channel[0].toUpperCase()}
          </span>
          <span>
            <strong>{settings.brand.channel}</strong>
            <small>Không gian nội bộ</small>
          </span>
          <span className="workspace-dot" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            ["studio", "Studio sáng tạo", Clapperboard],
            ["projects", "Dự án của tôi", FolderOpen],
            ["templates", "Thư viện template", LayoutTemplate],
            ["assets", "Tài nguyên", Layers3],
          ].map(([id, title, Icon]) => {
            const I = Icon as typeof Clapperboard;
            return (
              <button
                key={String(id)}
                className={page === id ? "active" : ""}
                onClick={() => openPage(String(id))}
              >
                <I size={18} />
                <span>{String(title)}</span>
                {id === "projects" && projects.length > 0 && (
                  <small>{projects.length}</small>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-tip">
          <span className="tip-icon">
            <Sparkles size={16} />
          </span>
          <strong>
            Câu chuyện tiếp theo
            <br />
            bắt đầu từ bạn.
          </strong>
          <p>Một ý tưởng nhỏ. Một video đáng nhớ.</p>
          <button onClick={reset}>
            Tạo video mới <ArrowUpIcon />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => openPage("settings")}
          >
            <Settings2 size={18} />
            <span>Kết nối & cài đặt</span>
          </button>
          <div className="local-status">
            <span className="live-dot" />
            <span>Đang chạy local</span>
            <HardDrive size={13} />
          </div>
          <div className="sidebar-signature">
            BUILT FOR YOUR NEXT STORY <span>↗</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-expanded={menu}
              aria-controls="workspace-navigation"
              aria-label="Mở menu"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span>Không gian làm việc</span>
            <ChevronRight size={14} />
            <strong>
              {
                {
                  studio: "Studio sáng tạo",
                  settings: "Kết nối & cài đặt",
                  projects: "Dự án của tôi",
                  templates: "Thư viện template",
                  assets: "Tài nguyên",
                }[page]
              }
            </strong>
          </div>
          <div className="topbar-right">
            <span className="internal-badge">
              <span className="live-dot" /> Internal beta
            </span>
            <button
              className="connection-button"
              onClick={() => openPage("settings")}
            >
              <Terminal size={15} />
              <span>
                {settings.ai.mode === "cli"
                  ? agents.find((a) => a.id === settings.ai.cli)?.name ||
                    settings.ai.cli
                  : settings.ai.provider}
              </span>
              <Settings2 size={13} />
            </button>
            <span className="user-avatar">
              {settings.brand.channel[0].toUpperCase()}
            </span>
          </div>
        </header>
        <main>
          {page === "settings" ? (
            <Settings
              settings={settings}
              onSave={setSettings}
              notify={notify}
            />
          ) : page === "templates" ? (
            <Templates
              fullPage
              templates={templates}
              selected={draft.script.scenes[selected]?.templateId}
              onSelect={chooseTemplate}
            />
          ) : page === "projects" ? (
            <Projects
              projects={projects}
              reset={reset}
              openProject={openProject}
            />
          ) : page === "assets" ? (
            <Assets assets={assets} uploadAsset={uploadAsset} notify={notify} />
          ) : (
            <>
              <div className="studio-heading">
                <div>
                  <div className="eyebrow">YOUR NEXT STORY STARTS HERE</div>
                  <div className="studio-title">
                    <h1>
                      {step === 0
                        ? "Biến ý tưởng thành video"
                        : step === 1
                          ? "Đặt dấu ấn của bạn"
                          : "Câu chuyện đang thành hình"}
                      <span className="title-dot">.</span>
                    </h1>
                    <span className="studio-tag">AI VIDEO STUDIO</span>
                  </div>
                  <p>
                    {step === 0
                      ? "Bạn có câu chuyện. Chúng mình có công cụ để kể nó."
                      : step === 1
                        ? "Chỉnh từng khung hình, lắng nghe từng câu chữ."
                        : "Từ những khung hình riêng lẻ đến một video hoàn chỉnh."}
                  </p>
                </div>
                {step > 0 && (
                  <div className="studio-heading-actions">
                    <button
                      className="button secondary"
                      disabled={!!busy}
                      onClick={save}
                    >
                      <Save size={15} />
                      {busy === "save" ? "Đang lưu…" : "Lưu dự án"}
                    </button>
                    {step === 1 && (
                      <button
                        className="button primary"
                        disabled={!!busy || !!activeJob}
                        onClick={() => setConfirm(true)}
                      >
                        {activeJob ? (
                          <LoaderCircle size={16} className="spin" />
                        ) : (
                          <Clapperboard size={16} />
                        )}
                        {activeJob ? "Đang render" : "Tạo video"}
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="workflow">
                <div className="workflow-steps">
                  {steps.map((label, i) => (
                    <button
                      key={label}
                      className={`${step === i ? "active" : ""} ${step > i ? "done" : ""}`}
                      onClick={() => setStep(i)}
                      disabled={!!busy || (i === 2 && !project?.jobs.length)}
                    >
                      <span>
                        {step > i ? (
                          <Check size={13} />
                        ) : (
                          String(i + 1).padStart(2, "0")
                        )}
                      </span>
                      {label}
                      {i < 2 && (
                        <ChevronRight size={14} className="step-chevron" />
                      )}
                    </button>
                  ))}
                </div>
                <span className="browser-saved">
                  <CheckCheck size={14} /> Bản nháp được nhớ trên trình duyệt
                </span>
              </div>
              {step === 0 ? (
                <Source
                  assets={assets}
                  onUpload={uploadAsset}
                  draft={draft}
                  setDraft={setDraft}
                  sourceType={sourceType}
                  setSourceType={setSourceType}
                  sceneCount={sceneCount}
                  setSceneCount={setSceneCount}
                  busy={busy}
                  fileImport={fileImport}
                  generate={generate}
                  openPage={openPage}
                  settings={settings}
                  agents={agents}
                  templates={templates}
                  chooseTemplate={chooseTemplate}
                />
              ) : step === 1 ? (
                <>
                  <div className="project-title-bar">
                    <input
                      aria-label="Tên dự án"
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
                    />
                    <span className="tiny-tag">
                      {draft.script.voice.provider === "vieneu"
                        ? "VIENEU"
                        : "OMNIVOICE"}
                    </span>
                    <span className="tiny-tag">{draft.script.aspect}</span>
                  </div>
                  <Editor
                    draft={draft}
                    onChange={setDraft}
                    templates={templates}
                    selected={selected}
                    onSelected={setSelected}
                    onTemplates={() => setTemplateModal(true)}
                    assets={assets}
                    onUpload={uploadAsset}
                    settings={settings}
                    notify={notify}
                  />
                </>
              ) : (
                <Output
                  job={job}
                  project={project}
                  onBack={() => setStep(1)}
                  onRetry={() => setConfirm(true)}
                  onCancel={async () => {
                    if (!project || !activeJob) return;
                    try {
                      await api(
                        `/projects/${project.id}/jobs/${activeJob.id}/cancel`,
                        { method: "POST" },
                      );
                    } catch (e) {
                      notify(errorMessage(e), true);
                    }
                  }}
                  onChooseJob={setPreviewJob}
                />
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            FRAME STUDIO <span>—</span> SPACE FOR YOUR STORIES.
          </span>
          <span>
            <span className="live-dot" /> Local first. Made yours.
          </span>
        </footer>
      </div>
      {templateModal && (
        <Templates
          templates={templates}
          selected={draft.script.scenes[selected]?.templateId}
          onSelect={chooseTemplate}
          onClose={() => setTemplateModal(false)}
        />
      )}
      {confirm && (
        <Modal
          title="Xác nhận tạo video"
          close={() => !busy && setConfirm(false)}
        >
          <div className="modal-heading">
            <div>
              <div className="eyebrow">SẴN SÀNG KỂ CÂU CHUYỆN?</div>
              <h2>Một bước nữa thôi.</h2>
              <p>Kiểm tra lựa chọn trước khi Studio bắt đầu dựng.</p>
            </div>
            <button
              className="icon-button"
              aria-label="Đóng xác nhận"
              disabled={!!busy}
              onClick={() => setConfirm(false)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="review-title">
            <Clapperboard size={23} />
            <strong>{draft.title}</strong>
          </div>
          <dl className="review-details">
            <div>
              <dt>Khung hình</dt>
              <dd>
                {draft.script.aspect} · {draft.script.scenes.length} cảnh
              </dd>
            </div>
            <div>
              <dt>Giọng đọc</dt>
              <dd>
                {draft.script.voice.provider === "vieneu"
                  ? "VieNeu-TTS"
                  : "OmniVoice"}{" "}
                ·{" "}
                {draft.script.voice.mode === "clone"
                  ? `Clone · ${assets.find((a) => a.id === draft.script.voice.referenceAudio?.replace(/^asset:/, ""))?.name || "Âm thanh mẫu"}`
                  : draft.script.voice.instructions
                    ? `Voice design · ${draft.script.voice.instructions}`
                    : draft.script.voice.voice || "Giọng mặc định"}
              </dd>
            </div>
            <div>
              <dt>Nhạc nền</dt>
              <dd>
                {assets.find((a) => a.id === draft.musicAsset)?.name ||
                  "Không có"}
              </dd>
            </div>
            <div>
              <dt>Hiệu ứng</dt>
              <dd>{draft.sfx ? "Tự chọn nếu đã cài thư viện" : "Tắt"}</dd>
            </div>
          </dl>
          <label className="field">
            Chất lượng xuất
            <Select
              value={draft.quality}
              onValueChange={(value) =>
                setDraft({
                  ...draft,
                  quality: value as Draft["quality"],
                })
              }
            >
              <option value="draft">Bản nháp · Dựng thử nhanh</option>
              <option value="standard">Tiêu chuẩn · Cân bằng chất lượng</option>
              <option value="high">Cao · Ưu tiên hình ảnh</option>
            </Select>
          </label>
          <div className="soft-note">
            <Clock3 size={17} />
            <span>
              Video được dựng trên máy này. Bạn có thể tiếp tục chỉnh sửa; lượt
              render sẽ dùng bản vừa xác nhận.
            </span>
          </div>
          <button
            className="button primary full-width"
            onClick={render}
            disabled={!!busy}
          >
            {busy === "render" ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Clapperboard size={17} />
            )}
            {busy === "render" ? "Đang chuẩn bị…" : "Xác nhận & tạo video"}
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.message}</span>
          <button
            aria-label="Đóng thông báo"
            onClick={() => setToast(undefined)}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function ArrowUpIcon() {
  return <span aria-hidden="true">↗</span>;
}
