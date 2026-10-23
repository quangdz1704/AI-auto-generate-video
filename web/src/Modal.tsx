import { useEffect, useRef } from "react";
export default function Modal({
  children,
  close,
  title,
}: {
  children: React.ReactNode;
  close: () => void;
  title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current
      ?.querySelector<HTMLElement>("button, input, select, textarea")
      ?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input, select, textarea, a[href]",
        ) ?? [],
      );
      if (e.shiftKey && document.activeElement === focusable[0]) {
        e.preventDefault();
        focusable.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === focusable.at(-1)) {
        e.preventDefault();
        focusable[0]?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-overlay" onClick={close}>
      <div
        ref={ref}
        className="modal review-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
