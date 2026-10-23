import Select from "./Select";
import {
  ArrowDownToLine,
  ArrowLeft,
  Clapperboard,
  CheckCircle2,
  Square,
  RefreshCw,
  HardDrive,
  AudioLines,
  FileText,
  Layers3,
} from "lucide-react";
import type { RenderJob, Project } from "./model";

export default function Output({
  job,
  project,
  onBack,
  onRetry,
  onCancel,
  onChooseJob,
}: {
  job?: RenderJob;
  project?: Project;
  onBack: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onChooseJob: (id: string) => void;
}) {
  if (!job || !project)
    return (
      <div className="empty-state">
        <Clapperboard size={34} />
        <h2>Video tiếp theo đang chờ bạn.</h2>
        <button className="button primary" onClick={onBack}>
          Quay lại thiết kế
        </button>
      </div>
    );
  const running = job.status === "running" || job.status === "queued";
  const base = `/api/projects/${project.id}/runs/${job.id}`;
  return (
    <div className="output-page page-enter">
      <section className="panel output-main">
        <div className="output-header">
          <span
            className={`status-tag ${job.status === "completed" ? "online" : ""}`}
          >
            {running
              ? "ĐANG THỰC HIỆN"
              : job.status === "completed"
                ? "ĐÃ HOÀN THÀNH"
                : job.status === "cancelled"
                  ? "ĐÃ DỪNG"
                  : "CẦN THỬ LẠI"}
          </span>
          {project.jobs.length > 1 && (
            <Select
              aria-label="Chọn lần xuất"
              value={job.id}
              onValueChange={(value) => onChooseJob(value)}
            >
              {project.jobs.map((j, i) => (
                <option key={j.id} value={j.id}>
                  Lần xuất {project.jobs.length - i} ·{" "}
                  {new Date(j.createdAt).toLocaleTimeString("vi-VN")}
                </option>
              ))}
            </Select>
          )}
        </div>
        {job.status === "completed" ? (
          <>
            <div className="video-result">
              <video
                src={`${base}/video.mp4`}
                controls
                playsInline
                preload="metadata"
              />
            </div>
            <div className="output-success">
              <span>
                <CheckCircle2 size={20} /> Câu chuyện đã sẵn sàng.
              </span>
              <small>{job.duration?.toFixed(1)} giây · MP4</small>
            </div>
          </>
        ) : (
          <div className="render-stage">
            <div className={`render-symbol ${running ? "rendering" : ""}`}>
              <Clapperboard size={47} strokeWidth={1.2} />
              <span />
              <span />
            </div>
            <div className="eyebrow">
              {running ? "MAKING YOUR STORY MOVE" : "YOUR STORY IS STILL HERE"}
            </div>
            <h2>
              {running
                ? job.status === "queued"
                  ? "Câu chuyện đang chờ lượt."
                  : "Từng khung hình, từng chút một."
                : job.status === "cancelled"
                  ? "Đã tạm dừng câu chuyện."
                  : "Có một bước chưa hoàn thành."}
            </h2>
            <p>{job.message}</p>
            <div className="progress-label">
              <span>{job.stage.toUpperCase()}</span>
              <strong>{Math.round(job.progress)}%</strong>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label={job.message}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(job.progress)}
            >
              <span style={{ width: `${job.progress}%` }} />
            </div>
            {job.error && <div className="render-error">{job.error}</div>}
            <small>
              {running
                ? "Bạn có thể chuyển trang hoặc quay lại sau. Studio vẫn tiếp tục dựng."
                : "Kịch bản và tài nguyên đã lưu vẫn ở đây để bạn chỉnh và tạo lại."}
            </small>
          </div>
        )}
        <div className="output-actions">
          <button className="button secondary" onClick={onBack}>
            <ArrowLeft size={16} /> Trở lại thiết kế
          </button>
          {running ? (
            <button className="button secondary danger" onClick={onCancel}>
              <Square size={13} /> Dừng render
            </button>
          ) : (
            <button className="button primary" onClick={onRetry}>
              <RefreshCw size={15} /> Tạo phiên bản mới
            </button>
          )}
        </div>
      </section>
      <aside className="panel output-aside">
        <div className="panel-heading">
          <span className="number-circle">
            <ArrowDownToLine size={16} />
          </span>
          <div>
            <h2>Thành phẩm của bạn</h2>
            <p>Sẵn sàng cho bước tiếp theo.</p>
          </div>
        </div>
        {[
          [
            "video.mp4",
            "Video hoàn chỉnh",
            "MP4 · Hình ảnh + âm thanh",
            Clapperboard,
          ],
          [
            "voice.mp3",
            "Bản âm thanh",
            "MP3 · Lời đọc + nhạc / hiệu ứng",
            AudioLines,
          ],
          [
            "script.txt",
            "Lời đọc",
            "TXT · Dùng tạo phụ đề trong CapCut",
            FileText,
          ],
          [
            "script.json",
            "Kịch bản dự án",
            "JSON · Lưu và tái sử dụng",
            Layers3,
          ],
        ].map(([file, title, desc, Icon]) => {
          const I = Icon as typeof Clapperboard;
          return (
            <a
              key={String(file)}
              className={`download-item ${job.status !== "completed" ? "disabled" : ""}`}
              href={
                job.status === "completed"
                  ? `${base}/${file}?download=1`
                  : undefined
              }
              aria-disabled={job.status !== "completed"}
            >
              <I size={21} />
              <span>
                <strong>{String(title)}</strong>
                <small>{String(desc)}</small>
              </span>
              <ArrowDownToLine size={16} />
            </a>
          );
        })}
        <div className="soft-note">
          <HardDrive size={18} />
          <p>
            Tệp và lịch sử xuất được lưu trên máy chạy Studio, kể cả khi bạn
            đóng trình duyệt.
          </p>
        </div>
      </aside>
    </div>
  );
}
