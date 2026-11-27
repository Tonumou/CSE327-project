// ------------------------------------------------------------
// GoogleButton.tsx - Feature 5: "Continue with Google" (federated identity)
// Uses Google Identity Services, Google's official sign-in script. After
// the user picks their Google account, Google hands the page a signed ID
// token ("credential"); onCredential sends it to POST /api/auth/google,
// where the backend checks it with Google's google-auth library.
// If the server has no GOOGLE_CLIENT_ID yet, the button explains that.
// ------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import { getGoogleConfig } from "../api";

interface GoogleIdentity {
  initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

let scriptLoading: Promise<void> | null = null;

// add Google's script to the page once
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptLoading) {
    scriptLoading = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptLoading = null;
        reject(new Error("Could not load Google sign-in"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptLoading;
}

// the multi-coloured "G" used on Google sign-in buttons
export function GoogleLogo({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

type State = "loading" | "ready" | "off" | "error";

export default function GoogleButton({ onCredential, dark }: { onCredential: (credential: string) => void; dark: boolean }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("loading");
  const [note, setNote] = useState("");
  const callback = useRef(onCredential);
  callback.current = onCredential;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const config = await getGoogleConfig();
        if (!config.enabled) {
          if (alive) setState("off");
          return;
        }
        await loadGoogleScript();
        if (!alive || !slot.current || !wrapper.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: config.client_id,
          callback: (response) => callback.current(response.credential),
        });
        // Google draws its own button (it may be at most 400 px wide)
        window.google.accounts.id.renderButton(slot.current, {
          type: "standard",
          theme: dark ? "filled_black" : "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "center",
          locale: "en", // same language as the rest of the website
          width: Math.min(400, wrapper.current.offsetWidth),
        });
        setState("ready");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [dark]);

  const explain = () =>
    setNote(
      state === "off"
        ? "Google sign-in is not set up on this server yet. The admin adds a Google Client ID in backend/config.py (see README.txt). You can use email and password meanwhile."
        : "Could not load Google sign-in. Check that the backend is running and the internet is connected, then reload the page."
    );

  return (
    <div ref={wrapper}>
      <div ref={slot} className={state === "ready" ? "flex min-h-11 justify-center" : "hidden"} />
      {state !== "ready" && (
        <button type="button" onClick={explain} disabled={state === "loading"} className="btn-ghost w-full gap-3 !py-3">
          <GoogleLogo /> Continue with Google
        </button>
      )}
      {note && state !== "ready" && <p className="mt-2 text-center text-xs text-stone-500 dark:text-stone-400">{note}</p>}
    </div>
  );
}
