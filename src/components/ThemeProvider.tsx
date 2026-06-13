"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "auto" | "dark" | "light";

const THEME_KEY = "songbook:theme";
const NEXT: Record<Theme, Theme> = { auto: "dark", dark: "light", light: "auto" };
const LABEL: Record<Theme, string> = { auto: "◐", dark: "☾", light: "☀" };

const ThemeCtx = createContext<{ theme: Theme; cycleTheme: () => void }>({
  theme: "auto",
  cycleTheme: () => {},
});

function applyTheme(theme: Theme) {
  const isDark =
    theme === "dark" ||
    (theme === "auto" && !window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("auto");

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_KEY) ?? "auto") as Theme;
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  useEffect(() => {
    if (theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => applyTheme("auto");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const cycleTheme = () => {
    const next = NEXT[theme];
    setThemeState(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    applyTheme(next);
  };

  return (
    <ThemeCtx.Provider value={{ theme, cycleTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() { return useContext(ThemeCtx); }
export function themeLabel(t: Theme) { return LABEL[t]; }
