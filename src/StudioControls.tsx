import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { RangeInput } from "./RangeInput";
import type { Point } from "./finish";
import { curveValue } from "./finishBrowser";
const openedGroups: string[] = [];
export function Control({
  label,
  value,
  onChange,
  min = -100,
  max = 100,
  step = 1,
  reset = 0,
  tip,
  disabled = false,
  icon,
  accent = "var(--gold)",
  card = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  reset?: number;
  tip?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  accent?: string;
  card?: boolean;
}) {
  const numericDrag = useRef<{ x: number; value: number } | null>(null);
  return (
    <div
      className={`pro-control ${card ? "classic-control" : ""}`}
      title={tip || label}
      onDoubleClick={() => !disabled && onChange(reset)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!disabled) onChange(reset);
      }}
    >
      <label>
        {icon}
        {label}
      </label>
      <div className="slider-wrap">
        <RangeInput
          label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onValue={onChange}
          style={
            {
              "--fill": `${((value - min) / (max - min)) * 100}%`,
              "--accent": accent,
            } as CSSProperties
          }
        />
        <div className="ticks" aria-hidden="true" />
      </div>
      <input
        aria-label={`${label} value`}
        type="number"
        value={Number(value.toFixed(3))}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        onChange={(e) =>
          onChange(Math.min(max, Math.max(min, +e.target.value)))
        }
        onPointerDown={(e) => {
          numericDrag.current = { x: e.clientX, value };
        }}
        onPointerMove={(e) => {
          const start = numericDrag.current;
          if (!start || !e.buttons || Math.abs(e.clientX - start.x) < 4) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          const fine = e.ctrlKey || e.metaKey ? 100 : e.shiftKey ? 10 : 1;
          onChange(
            Math.min(
              max,
              Math.max(
                min,
                Number(
                  (start.value + ((e.clientX - start.x) * step) / fine).toFixed(
                    4,
                  ),
                ),
              ),
            ),
          );
        }}
        onPointerUp={() => (numericDrag.current = null)}
        onPointerCancel={() => (numericDrag.current = null)}
      />
    </div>
  );
}
export function Group(props: Parameters<typeof GroupContent>[0]) {
  return <GroupContent key={props.name} {...props} />;
}
function GroupContent({
  name,
  children,
  initial = false,
  onReset,
}: {
  name: string;
  children: React.ReactNode;
  initial?: boolean;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("group:" + name) || String(initial),
      );
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    const close = (e: Event) => {
      if ((e as CustomEvent).detail === name) {
        setOpen(false);
        localStorage.setItem("group:" + name, "false");
      }
    };
    window.addEventListener("studio-close-group", close);
    return () => {
      window.removeEventListener("studio-close-group", close);
      const i = openedGroups.indexOf(name);
      if (i >= 0) openedGroups.splice(i, 1);
    };
  }, [name]);
  useEffect(() => {
    const i = openedGroups.indexOf(name);
    if (i >= 0) openedGroups.splice(i, 1);
    if (open) {
      openedGroups.push(name);
      while (openedGroups.length > 2)
        window.dispatchEvent(
          new CustomEvent("studio-close-group", {
            detail: openedGroups.shift(),
          }),
        );
    }
  }, [open, name]);
  return (
    <section className={`pro-group ${open ? "open" : ""}`}>
      <header>
        <button
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            localStorage.setItem("group:" + name, JSON.stringify(!open));
          }}
        >
          <span>{name}</span>
          <ChevronDown size={15} />
        </button>
        {onReset && (
          <button
            className="group-reset"
            title={`Reset ${name}`}
            aria-label={`Reset ${name}`}
            onClick={onReset}
          >
            <RotateCcw size={13} />
          </button>
        )}
      </header>
      {open && <div className="group-content">{children}</div>}
    </section>
  );
}
export function CurveEditor({
  curves,
  onChange,
}: {
  curves: Point[][];
  onChange: (p: Point[][]) => void;
}) {
  const [channel, setChannel] = useState(0),
    [selected, setSelected] = useState(1);
  const points = curves[channel];
  const update = (next: Point[]) => {
    const a = curves.slice();
    a[channel] = next;
    onChange(a);
  };
  const preset = (name: string) =>
    update(
      name === "flat"
        ? [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ]
        : name === "soft"
          ? [
              { x: 0, y: 0.06 },
              { x: 0.25, y: 0.3 },
              { x: 0.75, y: 0.7 },
              { x: 1, y: 0.94 },
            ]
          : [
              { x: 0, y: 0 },
              { x: 0.25, y: 0.17 },
              { x: 0.75, y: 0.83 },
              { x: 1, y: 1 },
            ],
    );
  return (
    <div className="curve-editor">
      <div className="inline-actions">
        <select
          aria-label="Curve channel"
          value={channel}
          onChange={(e) => setChannel(+e.target.value)}
        >
          {["RGB", "Red", "Green", "Blue"].map((n, i) => (
            <option key={n} value={i}>
              {n}
            </option>
          ))}
        </select>
        <button onClick={() => preset("contrast")}>S-curve</button>
        <button onClick={() => preset("soft")}>Soft</button>
        <button onClick={() => preset("flat")}>Reset</button>
      </div>
      <svg
        viewBox="0 0 256 150"
        role="application"
        aria-label="Tone curve"
        tabIndex={0}
        onKeyDown={(e) => {
          if (
            (e.key === "Delete" || e.key === "Backspace") &&
            selected > 0 &&
            selected < points.length - 1
          )
            update(points.filter((_, i) => i !== selected));
        }}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const r = e.currentTarget.getBoundingClientRect();
          const p = {
            x: Math.min(0.99, Math.max(0.01, (e.clientX - r.left) / r.width)),
            y: Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)),
          };
          if (
            points.length >= 32 ||
            points.some((q) => Math.abs(q.x - p.x) < 0.015)
          )
            return;
          update([...points, p].sort((a, b) => a.x - b.x));
        }}
      >
        {[0.25, 0.5, 0.75].map((v) => (
          <path
            key={v}
            d={`M ${v * 256} 0 V 150 M 0 ${v * 150} H 256`}
            className="curve-grid"
            pointerEvents="none"
          />
        ))}
        <path d="M 0 150 L 256 0" className="curve-grid" pointerEvents="none" />
        <polyline
          points={Array.from(
            { length: 129 },
            (_, i) => `${i * 2},${(1 - curveValue(points, i / 128)) * 150}`,
          ).join(" ")}
          fill="none"
          stroke={["#edbc73", "#dd7979", "#7bb990", "#7eacdc"][channel]}
          strokeWidth="2"
          pointerEvents="none"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x * 256}
            cy={(1 - p.y) * 150}
            r="4"
            fill={selected === i ? "#fff0cd" : "#edbc73"}
            onDoubleClick={() => {
              if (i > 0 && i < points.length - 1)
                update(points.filter((_, j) => j !== i));
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSelected(i);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const r =
                e.currentTarget.ownerSVGElement!.getBoundingClientRect();
              const a = points.slice();
              a[i] = {
                x:
                  i === 0
                    ? 0
                    : i === points.length - 1
                      ? 1
                      : Math.min(
                          points[i + 1].x - 0.01,
                          Math.max(
                            points[i - 1].x + 0.01,
                            (e.clientX - r.left) / r.width,
                          ),
                        ),
                y: Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)),
              };
              update(a);
            }}
            onPointerUp={(e) =>
              e.currentTarget.releasePointerCapture(e.pointerId)
            }
          />
        ))}
      </svg>
      <small>
        Click to add · drag to shape · double-click a point to remove
      </small>
    </div>
  );
}
export function ColorWheel({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const set = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(),
      x = (e.clientX - r.left - r.width / 2) / (r.width / 2),
      y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    onChange([
      ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
      Math.min(100, Math.hypot(x, y) * 100),
      value[2],
    ]);
  };
  return (
    <div className="wheel-unit">
      <label>{name}</label>
      <div
        role="slider"
        tabIndex={0}
        aria-label={`${name} hue and saturation`}
        aria-valuenow={value[1]}
        className="color-wheel"
        onDoubleClick={() => onChange([0, 0, 0])}
        onKeyDown={(e) => {
          if (
            ![
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
            ].includes(e.key)
          )
            return;
          e.preventDefault();
          const fine = e.ctrlKey || e.metaKey ? 0.01 : e.shiftKey ? 0.1 : 1;
          if (e.key === "Home") onChange([0, 0, 0]);
          else
            onChange([
              (value[0] +
                (e.key === "ArrowRight"
                  ? fine
                  : e.key === "ArrowLeft"
                    ? -fine
                    : 0) +
                360) %
                360,
              Math.max(
                0,
                Math.min(
                  100,
                  value[1] +
                    (e.key === "ArrowUp"
                      ? fine
                      : e.key === "ArrowDown"
                        ? -fine
                        : 0),
                ),
              ),
              value[2],
            ]);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          set(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e);
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      >
        <i
          style={{
            left: `${50 + (Math.cos((value[0] * Math.PI) / 180) * value[1]) / 2}%`,
            top: `${50 + (Math.sin((value[0] * Math.PI) / 180) * value[1]) / 2}%`,
          }}
        />
      </div>
      <input
        aria-label={`${name} luminance`}
        type="number"
        min={-100}
        max={100}
        value={value[2]}
        onChange={(e) =>
          onChange([
            value[0],
            value[1],
            Math.max(-100, Math.min(100, +e.target.value)),
          ])
        }
      />
    </div>
  );
}
