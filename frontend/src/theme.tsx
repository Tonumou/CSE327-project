// Light / dark / system theme, shared by the whole website.
// The "dark" class on <html> switches every dark: style on.
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "smart-parking-theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function savedMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // storage blocked
  }
  return "system";
}

interface ThemeState {
  mode: ThemeMode;
  dark: boolean; // what is shown right now
  setMode: (m: ThemeMode) => void;
  toggle: () => void; // quick light <-> dark switch
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(savedMode);
  const [systemDark, setSystemDark] = useState(() => media().matches);

  // follow the operating system when the mode is "system"
  useEffect(() => {
    const m = media();
    const onChange = () => setSystemDark(m.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);

  const dark = mode === "dark" || (mode === "system" && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // storage blocked: the choice just isn't remembered
    }
  }, [dark, mode]);

  return (
    <ThemeContext.Provider value={{ mode, dark, setMode, toggle: () => setMode(dark ? "light" : "dark") }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
