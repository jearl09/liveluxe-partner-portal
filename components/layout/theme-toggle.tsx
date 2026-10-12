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

/**
 * Light / system / dark, as a segmented control — the three states iOS offers, because
 * "follow the system" is a real preference that a two-way switch cannot express.
 */
export function ThemeToggle({ tone = "partner" }: { tone?: "partner" | "admin" }) {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);
  const dark = tone === "admin";

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md p-0.5",
        dark ? "bg-white/10" : "bg-muted border-border border",
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
              "ease-ios focus-visible:ring-ring flex h-7 w-8 items-center justify-center rounded-[0.4rem] transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none",
              selected
                ? dark
                  ? "bg-white/20 text-white"
                  : "bg-card text-strong shadow-xs"
                : dark
                  ? "text-white/60 hover:text-white"
                  : "text-muted-foreground hover:text-strong",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
