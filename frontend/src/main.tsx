import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import App from "./App";
import { AuthProvider } from "./auth";
import { PrefsProvider, usePrefs } from "./prefs";
import { ThemeProvider } from "./theme";
import { ToastProvider } from "./toast";
import "./index.css";

// "user" = follow the computer's "reduce motion" setting; "always" = the Settings switch is on
function Motion({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  return <MotionConfig reducedMotion={prefs.reduceMotion ? "always" : "user"}>{children}</MotionConfig>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <PrefsProvider>
        <Motion>
            <ToastProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ToastProvider>
        </Motion>
      </PrefsProvider>
    </ThemeProvider>
  </StrictMode>
);
