import { useEffect, useRef, useState } from "react";
import { Check, ArrowUpRight, X } from "lucide-react";
import type { TemplateInfo } from "./model";

export function TemplateArt({
  template,
  headline,
}: {
  template: TemplateInfo;
  headline?: string;
}) {
  return (
    <div
      className={`template-art art-${template.id.replace("frame-", "")}`}
      style={{ "--art-accent": template.color } as React.CSSProperties}
    >
      <div className="art-orbit" />
      {template.id === "frame-paper-story" && (
        <div
          className="art-sketch"
          style={{
            backgroundImage:
              'url("/api/template-assets/frame-paper-story/assets/sketch-scenes.png")',
          }}
        />
      )}
      <span className="art-kicker">FRAME / STUDIO</span>
      {template.id.includes("photo") ? (
        <div className="art-landscape">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      <strong>
        {headline ||
          {
            "frame-liquid-bg-hero": "Make it\nmove.",
            "frame-bold-poster": "BIG.\nBOLD.\nSTORY.",
            "frame-vignelli": "01.",
            "frame-pentagram-stat": "87.5%",
            "frame-build-minimal": "LESS.\nMORE.",
            "frame-creative-voltage": "GOOD\nENERGY",
            "frame-glitch-title": "NEXT_",
            "frame-aicoding-list": "01 —\n02 —\n03 —",
            "frame-aicoding-comparison": "A / B",
            "frame-logo-outro": "YOUR\nSTORY.",
            "frame-statement-outro": "ONE\nLAST\nTHING.",
            "frame-photo-story": "A new\nperspective.",
            "frame-paper-story": "Làm ít hơn.\nSống nhiều hơn.",
          }[template.id] ||
          "Your story."}
      </strong>
      <span className="art-footer">
        {template.name}
        <ArrowUpRight size={13} />
      </span>
    </div>
  );
}

export default function Templates({
  templates,
  selected,
  onSelect,
  onClose,
  fullPage = false,
}: {
  templates: TemplateInfo[];
  selected?: string;
  onSelect: (t: TemplateInfo) => void;
  onClose?: () => void;
  fullPage?: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const modal = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!onClose) return;
    const previous = document.activeElement as HTMLElement | null;
    modal.current?.querySelector<HTMLElement>("button")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = Array.from(
          modal.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
        );
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [onClose]);
  const content = (
    <>
      <div className="modal-heading">
        <div>
          <div className="eyebrow">THƯ VIỆN THIẾT KẾ</div>
          <h2>Một câu chuyện. Nhiều phong cách.</h2>
          <p>Template lo phần thiết kế. Bạn tập trung vào điều muốn kể.</p>
        </div>
        {onClose && (
          <button
            className="icon-button"
            aria-label="Đóng thư viện"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        )}
      </div>
      <div className="filter-tabs">
        {[
          ["all", "Tất cả"],
          ["hook", "Mở đầu"],
          ["body", "Nội dung"],
          ["outro", "Kết thúc"],
        ].map(([id, name]) => (
          <button
            className={filter === id ? "active" : ""}
            key={id}
            onClick={() => setFilter(id)}
          >
            {name}
            {id === "all" && <span>{templates.length}</span>}
          </button>
        ))}
      </div>
      <div className="template-grid">
        {templates
          .filter((t) => filter === "all" || t.role === filter)
          .map((t) => (
            <button
              className={`template-card ${t.id === selected ? "selected" : ""}`}
              onClick={() => onSelect(t)}
              key={t.id}
            >
              <TemplateArt template={t} />
              <div className="template-card-info">
                <strong>{t.name}</strong>
                {t.id === selected ? (
                  <Check size={16} />
                ) : (
                  <ArrowUpRight size={16} />
                )}
                <p>{t.description}</p>
              </div>
            </button>
          ))}
      </div>
    </>
  );
  if (fullPage)
    return <section className="template-page page-enter">{content}</section>;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <section
        ref={modal}
        className="modal template-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Chọn template"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </section>
    </div>
  );
}
