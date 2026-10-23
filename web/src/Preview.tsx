import { useEffect, useRef, useState } from "react";
import { MonitorPlay } from "lucide-react";
import { body } from "./api";
import type { Scene } from "./model";

export default function Preview({
  scene,
  aspect,
}: {
  scene: Scene;
  aspect: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(260);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/templates/${scene.templateId}/preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body({
              aspect,
              inputs: scene.inputs,
              voiceText: scene.voiceText,
            }),
          },
        );
        if (!response.ok) throw new Error("Không tải được preview.");
        const content = await response.text();
        if (current) {
          setHtml(content);
          setError("");
        }
      } catch {
        if (current)
          setError("Không tải được preview template. Hãy thử chọn lại cảnh.");
      }
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [scene.templateId, scene.inputs, scene.voiceText, aspect]);
  const portrait = aspect === "9:16";
  return (
    <div className="preview-workspace">
      <div className="preview-label">
        <span>
          <MonitorPlay size={14} /> PREVIEW TRỰC TIẾP
        </span>
        <span>
          {aspect} <span className="live-dot" />
        </span>
      </div>
      <div
        className={`preview-device ${portrait ? "portrait" : "landscape"}`}
        ref={frame}
      >
        {html && !error ? (
          <iframe
            title="Xem trước cảnh video"
            sandbox="allow-scripts"
            srcDoc={html}
            width={portrait ? 1080 : 1920}
            height={portrait ? 1920 : 1080}
            style={{ transform: `scale(${width / (portrait ? 1080 : 1920)})` }}
          />
        ) : (
          <div className="preview-empty">
            {error || "Đang chuẩn bị khung hình…"}
          </div>
        )}
      </div>
      <p className="preview-caption">
        <span className="live-dot" /> Thay đổi được hiển thị ngay trên khung
        hình
      </p>
    </div>
  );
}
