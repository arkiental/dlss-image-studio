import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import {
  adjustmentLocation,
  findAdjustments,
  type AdjustmentEntry,
} from "./adjustmentCatalog";

export function AdjustmentSearch({
  onNavigate,
}: {
  onNavigate: (entry: AdjustmentEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const frame = useRef<number | null>(null);
  const resultId = useId();
  const results = findAdjustments(query);

  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "k" ||
        document.querySelector('[role="dialog"]')
      )
        return;
      event.preventDefault();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("keydown", shortcut);
    return () => {
      window.removeEventListener("keydown", shortcut);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  function clear() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setQuery("");
    input.current?.focus();
  }

  function choose(entry: AdjustmentEntry) {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    setQuery("");
    onNavigate(entry);
    let attempts = 0;
    const reveal = () => {
      attempts++;
      if (entry.group)
        window.dispatchEvent(
          new CustomEvent("studio-open-group", { detail: entry.group }),
        );
      const content = document.querySelector<HTMLElement>(".inspector-content");
      let group: HTMLElement | undefined;
      if (entry.group && content) {
        group = Array.from(
          content.querySelectorAll<HTMLElement>(".pro-group"),
        ).find(
          (element) =>
            element.querySelector("header button span")?.textContent ===
            entry.group,
        );
      }
      const scope = group || content;
      let summary: HTMLElement | undefined;
      if (scope && entry.details) {
        summary = Array.from(
          scope.querySelectorAll<HTMLElement>("details > summary"),
        ).find((element) => element.textContent?.includes(entry.details!));
        const details = summary?.parentElement;
        if (details instanceof HTMLDetailsElement) details.open = true;
      }
      const target =
        scope && entry.control
          ? Array.from(
              scope.querySelectorAll<HTMLElement>(
                "input, select, button, [tabindex]",
              ),
            ).find(
              (element) =>
                element.getAttribute("aria-label") === entry.control ||
                (element instanceof HTMLButtonElement &&
                  element.textContent?.trim() === entry.control),
            )
          : undefined;
      const focusAndReveal = (element: HTMLElement) => {
        element.focus({ preventScroll: true });
        if (content) {
          const visible = content.getBoundingClientRect();
          const bounds = element.getBoundingClientRect();
          if (bounds.top < visible.top || bounds.bottom > visible.bottom)
            content.scrollTop += bounds.top - visible.top - 16;
        }
        frame.current = null;
      };
      if (target && !target.matches(":disabled")) {
        focusAndReveal(target);
        return;
      }
      if (target?.matches(":disabled") && summary) {
        focusAndReveal(summary);
        return;
      }
      if (attempts < 20) frame.current = requestAnimationFrame(reveal);
      else {
        const fallback =
          summary ||
          group?.querySelector<HTMLButtonElement>("header button") ||
          content?.querySelector<HTMLButtonElement>(
            '.workspace-tab[aria-selected="true"]',
          );
        if (fallback) focusAndReveal(fallback);
        frame.current = null;
      }
    };
    frame.current = requestAnimationFrame(reveal);
  }

  function keyDown(event: KeyboardEvent<HTMLElement>, index?: number) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      clear();
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next =
        index === undefined
          ? direction === 1
            ? 0
            : results.length - 1
          : (index + direction + results.length) % results.length;
      buttons.current[next]?.focus();
    } else if (index === undefined && event.key === "Enter") {
      event.preventDefault();
      choose(results[0]);
    } else if (
      index !== undefined &&
      (event.key === "Home" || event.key === "End")
    ) {
      event.preventDefault();
      event.stopPropagation();
      buttons.current[event.key === "Home" ? 0 : results.length - 1]?.focus();
    }
  }

  return (
    <div className="adjustment-search" role="search" aria-label="Adjustments">
      <div className="adjustment-search-field">
        <Search size={14} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          aria-label="Search adjustments"
          aria-controls={query.trim() ? resultId : undefined}
          placeholder="Find adjustment…"
          title="Find adjustment · Ctrl+K"
          value={query}
          onChange={(event) => {
            if (frame.current !== null) cancelAnimationFrame(frame.current);
            frame.current = null;
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => keyDown(event)}
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear adjustment search"
            title="Clear search · Esc"
            onClick={clear}
          >
            <X size={14} />
          </button>
        ) : (
          <kbd aria-hidden="true">Ctrl K</kbd>
        )}
      </div>
      {query.trim() && (
        <div
          id={resultId}
          className="adjustment-search-results"
          aria-label="Adjustment search results"
        >
          <div className="adjustment-search-count" role="status">
            {results.length
              ? `${results.length} ${results.length === 1 ? "result" : "results"}`
              : "No adjustments found"}
          </div>
          {results.map((entry, index) => (
            <button
              key={entry.id}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              className="adjustment-search-result"
              onClick={() => choose(entry)}
              onKeyDown={(event) => keyDown(event, index)}
            >
              <span>{entry.label}</span>
              <span className="search-result-location">
                {adjustmentLocation(entry)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
