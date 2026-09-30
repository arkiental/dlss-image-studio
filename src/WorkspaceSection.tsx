import { useId, useRef, type ReactNode } from "react";

const workspaces = [
  { value: "Masks", label: "Masks" },
  { value: "Render Passes", label: "Passes" },
  { value: "Presets", label: "Presets" },
  { value: "Batch", label: "Batch" },
];

export function WorkspaceSection({
  workspace,
  onSelect,
  children,
}: {
  workspace: string;
  onSelect: (workspace: string) => void;
  children: ReactNode;
}) {
  const panelId = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(
    0,
    workspaces.findIndex((item) => item.value === workspace),
  );

  return (
    <section className="workspace-section" aria-label="Workspace">
      <div
        className="workspace-tabs"
        role="tablist"
        aria-label="Workspace sections"
      >
        {workspaces.map(({ value, label }, index) => (
          <button
            key={value}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            id={`${panelId}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={selected === index}
            aria-controls={panelId}
            tabIndex={selected === index ? 0 : -1}
            className={`workspace-tab ${selected === index ? "active" : ""}`}
            onClick={() => onSelect(value)}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === "Home") next = 0;
              else if (event.key === "End") next = workspaces.length - 1;
              else if (event.key === "ArrowRight" || event.key === "ArrowDown")
                next = (index + 1) % workspaces.length;
              else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
                next = (index - 1 + workspaces.length) % workspaces.length;
              else return;
              event.preventDefault();
              event.stopPropagation();
              onSelect(workspaces[next].value);
              tabs.current[next]?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id={panelId}
        className={`workspace-content${workspace === "Render Passes" ? " workspace-passes" : ""}`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-${selected}`}
      >
        {children}
      </div>
    </section>
  );
}
