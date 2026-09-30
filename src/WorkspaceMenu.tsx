import { useEffect, useId, useRef, useState } from "react";
import {
  Bookmark,
  Brush,
  Check,
  ChevronDown,
  Images,
  Layers,
  PanelsTopLeft,
} from "lucide-react";

const workspaces = [
  { value: "Masks", label: "Masks", icon: Brush },
  { value: "Render Passes", label: "Passes", icon: Layers },
  { value: "Presets", label: "Presets", icon: Bookmark },
  { value: "Batch", label: "Batch", icon: Images },
];

export function WorkspaceMenu({
  workspace,
  onSelect,
}: {
  workspace: string;
  onSelect: (workspace: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const tabbing = useRef(false);
  const menuId = useId();
  const activeIndex = workspaces.findIndex((item) => item.value === workspace);

  const show = (index = Math.max(0, activeIndex)) => {
    setFocusIndex(index);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (value: string) => {
    onSelect(value);
    close();
  };

  useEffect(() => {
    if (open) items.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <div
      ref={root}
      className="workspace-menu"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (
          !(next instanceof Node) ||
          !event.currentTarget.contains(next) ||
          (tabbing.current && next === trigger.current)
        )
          setOpen(false);
        tabbing.current = false;
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={`workspace-menu-trigger ${open || activeIndex >= 0 ? "active" : ""}`}
        aria-label="Workspace panels"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show(event.key === "ArrowDown" ? 0 : workspaces.length - 1);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (open) close();
            else show();
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            close();
          }
        }}
      >
        <PanelsTopLeft size={16} />
        <span>Panels</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div
          id={menuId}
          className="workspace-menu-popover"
          role="menu"
          aria-label="Workspace panels"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Tab") {
              tabbing.current = true;
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setFocusIndex(
                (focusIndex +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  workspaces.length) %
                  workspaces.length,
              );
            } else if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              setFocusIndex(event.key === "Home" ? 0 : workspaces.length - 1);
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              choose(workspaces[focusIndex].value);
            }
          }}
        >
          {workspaces.map(({ value, label, icon: Icon }, index) => (
            <button
              key={value}
              ref={(element) => {
                items.current[index] = element;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={workspace === value}
              className={`workspace-menu-item ${workspace === value ? "active" : ""}`}
              tabIndex={focusIndex === index ? 0 : -1}
              onFocus={() => setFocusIndex(index)}
              onClick={() => choose(value)}
            >
              <Icon size={16} />
              <span>{label}</span>
              {workspace === value && (
                <Check className="workspace-menu-check" size={14} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
