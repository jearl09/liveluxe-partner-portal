/**
 * Runs before first paint, inlined in <head> by app/layout.tsx.
 *
 * Only an explicit choice needs restoring: "follow the system" is the CSS default,
 * so the absence of the attribute is itself a valid state. Without this the browser
 * would paint the light theme, then React would swap to dark a frame later — the
 * flash the brief asks us to avoid.
 *
 * Kept as a string because it has to execute ahead of the bundle, and deliberately
 * tiny: anything that throws here would block the page. localStorage alone can throw
 * when cookies are blocked, so the whole thing sits in a try.
 */
export const THEME_STORAGE_KEY = "livluxe.theme";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;

export type ThemeChoice = "light" | "dark" | "system";
