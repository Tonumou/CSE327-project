// Personal preferences from the Settings page, remembered in this browser
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export interface Prefs {
  refreshSeconds: number; // how often the live camera picture reloads
  notifyFree: boolean; // browser notification when a space becomes free
  compactMap: boolean; // smaller tiles on the slot map
  reduceMotion: boolean; // turn the big animations off
}

const PREFS_KEY = "smart-parking-prefs";
const DEFAULTS: Prefs = { refreshSeconds: 1, notifyFree: false, compactMap: false, reduceMotion: false };

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

const PrefsContext = createContext<{ prefs: Prefs; setPref: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void } | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // storage blocked: preferences last until the page is closed
    }
  }, [prefs]);

  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));
  return <PrefsContext.Provider value={{ prefs, setPref }}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used inside <PrefsProvider>");
  return ctx;
}
