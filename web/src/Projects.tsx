import { Plus, FolderOpen, ArrowRight, Clapperboard } from "lucide-react";
import type { Project } from "./model";
type Summary = Omit<Project, "draft"> & { aspect: string; scenes: number };

export default function Projects({
  projects,
  reset,
  openProject,
}: {
  projects: Summary[];
  reset: () => void;
  openProject: (id: string) => Promise<void>;
}) {
  return (
    <div className="projects-page page-enter">
      <div className="page-title-row">
        <div>
          <div className="eyebrow">MỌI CÂU CHUYỆN Ở ĐÂY</div>
          <h1>
            Dự án của bạn<span className="title-dot">.</span>
          </h1>
          <p>Tiếp tục ý tưởng còn dang dở, hoặc bắt đầu một điều mới.</p>
        </div>
        <button className="button primary" onClick={reset}>
          <Plus size={16} /> Tạo video mới
        </button>
      </div>
      {projects.length ? (
        <div className="project-grid">
          {projects.map((p, i) => (
            <button
              className="project-card"
              key={p.id}
              onClick={() => openProject(p.id)}
            >
              <div className={`project-cover cover-${i % 3}`}>
                <span>FRAME ORIGINAL / {String(i + 1).padStart(2, "0")}</span>
                <strong>{p.title}</strong>
                <Clapperboard size={24} />
                <small>{p.aspect}</small>
              </div>
              <div className="project-card-info">
                <strong>{p.title}</strong>
                <span
                  className={`status-tag ${p.jobs[0]?.status === "completed" ? "online" : ""}`}
                >
                  {p.jobs[0]?.status === "completed"
                    ? "Đã xuất"
                    : p.jobs[0]?.status === "running"
                      ? "Đang dựng"
                      : "Bản nháp"}
                </span>
                <p>
                  {p.scenes} cảnh ·{" "}
                  {new Date(p.updatedAt).toLocaleDateString("vi-VN")}
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <FolderOpen size={38} strokeWidth={1.3} />
          <h2>Chỗ cho câu chuyện đầu tiên.</h2>
          <p>
            Lưu một dự án trong Studio để tiếp tục chỉnh sửa bất cứ lúc nào.
          </p>
          <button className="button primary" onClick={reset}>
            Bắt đầu sáng tạo <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
