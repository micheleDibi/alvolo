export type ThemePref = "system" | "light" | "dark";

const KEY = "alvolo_theme";
const META_DARK = "#0b1120";
const META_LIGHT = "#f2f2f7";

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function resolve(pref: ThemePref): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return pref;
}

export function applyTheme(pref: ThemePref): void {
  const mode = resolve(pref);
  document.documentElement.dataset.theme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mode === "light" ? META_LIGHT : META_DARK);
}

export function setThemePref(pref: ThemePref): void {
  if (pref === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  applyTheme(pref);
}

let bound = false;
/** Re-apply on OS theme change while the user is in "system" mode. */
export function bindSystemTheme(): void {
  if (bound) return;
  bound = true;
  window
    .matchMedia("(prefers-color-scheme: light)")
    .addEventListener("change", () => {
      if (getThemePref() === "system") applyTheme("system");
    });
}
