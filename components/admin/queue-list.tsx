"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import * as D from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export type QueueTone = "breached" | "at_risk" | "on_track" | "partner";

export interface QueueItem {
  id: string;
  href: string;
  /** "LLX-2026-000412 from Demo Insurance Co": the row's accessible name. */
  label: string;
  tone: QueueTone;
  /** Seven cells: SLA, reference, partner, property, stay, total. */
  cells: ReactNode[];
  /** Approve (and its reason when it cannot be pressed). */
  actions: ReactNode;
  /** Quote lines, partner history, guest, and the other decisions. */
  details: ReactNode;
}

const BAND: Record<QueueTone, string> = {
  breached: "border-l-danger-fg bg-danger-fg/[0.08]",
  at_risk: "border-l-attention-fg",
  on_track: "border-l-info-fg",
  partner: "border-l-muted-border",
};

/**
 * Column template: SLA, reference, partner, property, stay, total, actions. Between
 * 1024 and 1280 px the property column folds away (the stay cell carries the suburb)
 * so the reference never runs into the partner.
 */
const GRID =
  "lg:grid lg:grid-cols-[8rem_9rem_minmax(0,1fr)_minmax(0,1fr)_7.5rem_13rem] xl:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)_7.5rem_13rem] lg:items-center lg:gap-x-4";
const FOLD = "lg:hidden xl:block";

const HEADERS = ["Decision due", "Reference", "Partner", "Property", "Stay", "Total", ""];

const SHORTCUTS: [string, string][] = [
  ["j / k", "Next / previous request"],
  ["Enter", "Show or hide details"],
  ["o", "Open the full request"],
  ["a", "Approve"],
  ["c", "Counter-offer"],
  ["d", "Decline"],
  ["?", "This list"],
];

function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

const kbd = "bg-inset rounded-control border-subtle border px-1.5 py-0.5 font-mono text-text-primary";

/**
 * The queue rows (brief §6.3): one expanded at a time, and the keyboard an operator
 * working down the list expects. The decision buttons are the same server-posted
 * dialogs as on the request page; a shortcut only clicks the focused row's button,
 * so every decision still passes through its confirmation.
 */
export function QueueList({ items }: { items: QueueItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [help, setHelp] = useState(false);
  const rows = useRef<(HTMLLIElement | null)[]>([]);

  const focusRow = useCallback(
    (i: number) => {
      const n = Math.max(0, Math.min(items.length - 1, i));
      setActive(n);
      const el = rows.current[n];
      el?.querySelector<HTMLElement>("[data-row-link]")?.focus();
      el?.scrollIntoView({ block: "nearest" });
    },
    [items.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
        return;
      }
      if (items.length === 0) return;
      const i = Math.min(active, items.length - 1);
      const item = items[i];
      const row = rows.current[i];
      switch (e.key) {
        case "j":
          e.preventDefault();
          focusRow(i + 1);
          break;
        case "k":
          e.preventDefault();
          focusRow(i - 1);
          break;
        case "Enter":
          // Only on the row's own link; Enter on a button keeps its meaning.
          if (!(e.target as HTMLElement).hasAttribute?.("data-row-link")) return;
          e.preventDefault();
          setOpen((o) => (o === item.id ? null : item.id));
          break;
        case "o":
          e.preventDefault();
          router.push(item.href);
          break;
        case "a":
        case "c":
        case "d": {
          if (!row) return;
          e.preventDefault();
          const key = e.key;
          const click = () =>
            rows.current[i]?.querySelector<HTMLButtonElement>(`[data-shortcut="${key}"]:not(:disabled)`)?.click();
          if (key === "c" && open !== item.id) {
            setOpen(item.id);
            requestAnimationFrame(() => requestAnimationFrame(click));
          } else click();
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, active, open, focusRow, router]);

  return (
    <>
      <div className="border-subtle bg-surface rounded-card overflow-hidden border">
        <div
          aria-hidden
          className={cn(
            GRID,
            "text-text-muted text-body-sm border-subtle hidden border-b border-l-4 border-l-transparent px-4 py-2.5 font-semibold",
          )}
        >
          {HEADERS.map((h, i) => (
            <span key={i} className={cn(i === 5 && "text-right", i === 3 && FOLD)}>
              {h}
            </span>
          ))}
        </div>
        <ul className="divide-subtle divide-y" aria-label="Requests waiting, most urgent first">
          {items.map((it, i) => {
            const expanded = open === it.id;
            return (
              <li
                key={it.id}
                ref={(el) => {
                  rows.current[i] = el;
                }}
                onFocus={() => setActive(i)}
                data-active={i === active || undefined}
                data-tone={it.tone}
                className={cn(
                  "relative border-l-4 transition-colors duration-150",
                  BAND[it.tone],
                  it.tone !== "breached" && "hover:bg-inset focus-within:bg-inset",
                )}
              >
                <div className={cn(GRID, "text-body-sm grid grid-cols-1 gap-y-1.5 px-4 py-3")}>
                  {it.cells.map((c, ci) => (
                    <div
                      key={ci}
                      className={cn("min-w-0", ci === 5 && "lg:text-right lg:tabular-nums", ci === 3 && FOLD)}
                    >
                      {ci === 1 ? (
                        <a
                          href={it.href}
                          data-row-link
                          aria-label={`Open ${it.label}`}
                          className="focus-visible:outline-focus rounded-control -mx-1 inline-block px-1 focus-visible:outline-2"
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            router.push(it.href);
                          }}
                        >
                          {c}
                        </a>
                      ) : (
                        c
                      )}
                    </div>
                  ))}
                  <div className="mt-2 flex items-start gap-2 lg:mt-0 lg:justify-end">
                    <div className="min-w-0 flex-1 lg:flex-none [&_button]:max-lg:w-full">{it.actions}</div>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`queue-details-${it.id}`}
                      aria-label={`${expanded ? "Hide" : "Show"} details for ${it.label}`}
                      onClick={() => setOpen(expanded ? null : it.id)}
                      className="text-text-secondary hover:text-text-primary hover:bg-inset rounded-control focus-visible:outline-focus text-body-sm coarse:h-11 inline-flex h-9 shrink-0 items-center gap-1 px-2 font-semibold focus-visible:outline-2"
                    >
                      <span className="lg:hidden" aria-hidden>
                        Details
                      </span>
                      <ChevronDown
                        className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")}
                        aria-hidden
                      />
                    </button>
                  </div>
                </div>
                <div
                  id={`queue-details-${it.id}`}
                  hidden={!expanded}
                  className="border-subtle bg-canvas border-t px-4 py-4 lg:px-5"
                >
                  {expanded && it.details}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-text-muted text-body-sm hidden lg:block">
        Keyboard: <kbd className={kbd}>j</kbd> <kbd className={kbd}>k</kbd> to move, <kbd className={kbd}>Enter</kbd>{" "}
        for details, <kbd className={kbd}>a</kbd> <kbd className={kbd}>c</kbd> <kbd className={kbd}>d</kbd> to decide.{" "}
        <button
          type="button"
          onClick={() => setHelp(true)}
          className="hover:text-text-primary underline underline-offset-4"
        >
          All shortcuts
        </button>
      </p>
      <D.Root open={help} onOpenChange={setHelp}>
        <D.Portal>
          <D.Overlay className="anim-fade bg-navy/50 fixed inset-0 z-50" />
          <D.Content className="bg-surface rounded-card fixed top-1/2 left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <D.Title className="text-h3 text-text-primary font-semibold">Keyboard shortcuts</D.Title>
              <D.Close className="text-text-muted hover:text-text-primary rounded-control -m-1 p-1" aria-label="Close">
                <X className="h-5 w-5" aria-hidden />
              </D.Close>
            </div>
            <D.Description className="text-text-muted text-body-sm mt-1">
              Decisions still open their confirmation. Nothing is decided on one key press.
            </D.Description>
            <dl className="text-body-sm mt-4 grid grid-cols-[6rem_1fr] gap-y-2">
              {SHORTCUTS.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt>
                    <kbd className={kbd}>{k}</kbd>
                  </dt>
                  <dd className="text-text-secondary">{v}</dd>
                </div>
              ))}
            </dl>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}
