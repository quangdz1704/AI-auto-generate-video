import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}
interface Props {
  value: string | number;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  children?: ReactNode;
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  allowCustom?: boolean;
}
function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((n) =>
      isValidElement<{ children?: ReactNode }>(n)
        ? textOf(n.props.children)
        : String(n),
    )
    .join("");
}
function optionChildren(nodes: ReactNode): SelectOption[] {
  return Children.toArray(nodes).flatMap((n) => {
    if (
      !isValidElement<{
        value?: string | number;
        children?: ReactNode;
        disabled?: boolean;
      }>(n)
    )
      return [];
    if (n.type !== "option") return optionChildren(n.props.children);
    return [
      {
        value: String(n.props.value ?? ""),
        label: textOf(n.props.children),
        disabled: n.props.disabled,
      },
    ];
  });
}
export default function Select({
  value,
  onValueChange,
  options,
  children,
  className = "",
  disabled,
  allowCustom,
  "aria-label": ariaLabel,
}: Props) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    popup = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0);
  const [position, setPosition] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    width: number;
    height: number;
  }>({
    left: 0,
    top: 0,
    width: 0,
    height: 320,
  });
  const all = options ?? optionChildren(children);
  const selected = all.find((o) => o.value === String(value));
  const needle = query
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
  const filtered = all.filter((o) =>
    `${o.label} ${o.value} ${o.description || ""}`
      .toLocaleLowerCase("vi")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .includes(needle),
  );
  if (allowCustom && query.trim() && !all.some((o) => o.value === query.trim()))
    filtered.push({
      value: query.trim(),
      label: `Dùng “${query.trim()}”`,
      description: "Giá trị tuỳ chỉnh",
    });
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (option: SelectOption) => {
    if (!option.disabled) {
      onValueChange(option.value);
      close();
    }
  };
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const box = trigger.current!.getBoundingClientRect();
      const below = window.innerHeight - box.bottom - 12,
        above = box.top - 12;
      const placeBelow = below >= 230 || below >= above;
      const height = Math.max(120, Math.min(360, placeBelow ? below : above));
      const width = Math.min(Math.max(box.width, 260), window.innerWidth - 24);
      setPosition({
        left: Math.min(Math.max(12, box.left), window.innerWidth - width - 12),
        ...(placeBelow
          ? { top: box.bottom + 6 }
          : { bottom: window.innerHeight - box.top + 6 }),
        width,
        height,
      });
    };
    const outside = (event: PointerEvent) => {
      if (
        !popup.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    place();
    search.current?.focus();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    popup.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  const keyboard = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
    if (e.key === "Tab") setOpen(false);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      let next = active;
      for (let i = 0; i < filtered.length; i++) {
        next = (next + delta + filtered.length) % filtered.length;
        if (!filtered[next].disabled) break;
      }
      setActive(next);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    }
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        className={`studio-select ${open ? "is-open" : ""} ${className}`}
        onClick={() => {
          setQuery("");
          setActive(
            Math.max(
              0,
              all.findIndex((o) => o.value === String(value)),
            ),
          );
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            setQuery("");
            setActive(0);
            setOpen(true);
          }
        }}
      >
        <span>{selected?.label || String(value) || "Chọn một mục"}</span>
        <ChevronDown size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            className="select-popover"
            style={{
              left: position.left,
              top: position.top,
              bottom: position.bottom,
              width: position.width,
              maxHeight: position.height,
            }}
            onKeyDown={keyboard}
          >
            <div className="select-search">
              <Search size={16} />
              <input
                ref={search}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Tìm kiếm…"
                aria-label="Tìm trong danh sách"
                role="combobox"
                aria-controls={id}
                aria-expanded="true"
                aria-autocomplete="list"
                aria-activedescendant={
                  filtered[active] ? `${id}-${active}` : undefined
                }
              />
            </div>
            <div
              id={id}
              role="listbox"
              aria-label={ariaLabel || "Danh sách lựa chọn"}
              className="select-options"
            >
              {filtered.map((o, i) => (
                <button
                  type="button"
                  tabIndex={-1}
                  role="option"
                  id={`${id}-${i}`}
                  key={o.value}
                  data-index={i}
                  aria-selected={o.value === String(value)}
                  aria-disabled={o.disabled || undefined}
                  className={`select-option ${i === active ? "highlighted" : ""}`}
                  onPointerMove={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                >
                  <span>
                    <strong>{o.label}</strong>
                    {o.description && <small>{o.description}</small>}
                  </span>
                  {o.value === String(value) && <Check size={16} />}
                </button>
              ))}
              {!filtered.length && (
                <div className="select-empty">
                  Không tìm thấy lựa chọn phù hợp.
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
