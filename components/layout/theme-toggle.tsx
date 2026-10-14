"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY, type ThemeChoice } from "@/app/theme-script";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "Match system", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];

/*
 * The stored choice is browser state, not React state, so it is read through
 * useSyncExternalStore: the server renders "system", the client re-reads after
 * hydration, and a change in another tab arrives over the storage event.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : "system";
  } catch {
    return "system";
  }
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  // Cross-fade the repaint, then drop the class so nothing else inherits a colour transition.
  root.classList.add("theme-switching");
  window.setTimeout(() => root.classList.remove("theme-switching"), 220);

  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private mode or blocked storage: the choice still holds for this page view.
  }
  listeners.forEach((l) => l());
}

const ORDER: ThemeChoice[] = ["light", "dark", "system"];

/**
 * Light / system / dark, as a segmented control — the three states iOS offers, because
 * "follow the system" is a real preference that a two-way switch cannot express.
 *
 * Below `lg` the header has no room for three buttons beside the nav, so the same
 * three states collapse into one button that cycles light → dark → system. Its
 * accessible name says which is current and which comes next, so a screen reader
 * hears the state without needing to see the icon. Both controls read and write the
 * same stored choice.
 */
export function ThemeToggle({ tone = "partner" }: { tone?: "partner" | "admin" }) {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);
  const dark = tone === "admin";
  const current = OPTIONS.find((o) => o.value === choice) ?? OPTIONS[1]!;
  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]!;
  const nextLabel = OPTIONS.find((o) => o.value === next)?.label.toLowerCase();

  return (
    <>
      <button
        type="button"
        onClick={() => apply(next)}
        aria-label={`Colour theme: ${current.label}. Switch to ${nextLabel}`}
        title={`Theme: ${current.label}`}
        className={cn(
          "rounded-control coarse:h-11 coarse:w-11 flex h-10 w-10 items-center justify-center transition-colors duration-150 lg:hidden",
          dark ? "text-on-navy hover:bg-on-navy-hover" : "text-text-primary hover:bg-surface",
        )}
      >
        <current.Icon className="h-4 w-4" aria-hidden />
      </button>
      <div
        role="radiogroup"
        aria-label="Colour theme"
        className={cn(
          "rounded-control hidden items-center gap-0.5 p-0.5 lg:inline-flex",
          dark ? "bg-on-navy-hover" : "bg-surface border-subtle border",
        )}
      >
        {OPTIONS.map(({ value, label, Icon }) => {
          const selected = choice === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              onClick={() => apply(value)}
              className={cn(
                "flex h-8 w-9 items-center justify-center rounded-[4px] transition-colors duration-150",
                selected
                  ? dark
                    ? "text-on-navy bg-on-navy-selected"
                    : "bg-inset text-text-primary"
                  : dark
                    ? "text-on-navy-muted hover:text-on-navy"
                    : "text-text-muted hover:text-text-primary",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </button>
          );
        })}
      </div>
    </>
  );
}
