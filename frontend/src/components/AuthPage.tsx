// Login + registration page (shown until the user is logged in)
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowRight,
  CalendarCheck,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Moon,
  ScanEye,
  Sun,
  User as UserIcon,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "../auth";
import { spring } from "../motion";
import Car, { carColor } from "./Car";
import Logo from "./Logo";
import { useTheme } from "../theme";
import { useToast } from "../toast";

type Mode = "login" | "register";

// 0-4: length, upper+lower case, number, symbol
function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}
const STRENGTH = [
  { label: "Too short", color: "bg-rose-500" },
  { label: "Weak", color: "bg-rose-500" },
  { label: "Fair", color: "bg-amber-500" },
  { label: "Good", color: "bg-lime-500" },
  { label: "Strong", color: "bg-emerald-500" },
];

function Field({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-400">{icon}</span>
      {children}
    </div>
  );
}

// little animated car park on the left: spaces fill and empty at random
function LotAnimation() {
  const [taken, setTaken] = useState<boolean[]>(() => Array.from({ length: 12 }, () => Math.random() > 0.5));
  useEffect(() => {
    const t = setInterval(
      () => setTaken((list) => list.map((v, i) => (i === Math.floor(Math.random() * list.length) ? !v : v))),
      1200
    );
    return () => clearInterval(t);
  }, []);
  const free = taken.filter((v) => !v).length;
  const rows = [taken.slice(0, 6), taken.slice(6)];
  return (
    <div className="rounded-lg border border-stone-700 bg-stone-800 p-4">
      <div className="mb-3 flex items-center justify-between text-xs text-stone-400">
        <span>Lot A · seen from the camera</span>
        <span className="font-mono text-sm text-emerald-400">{String(free).padStart(2, "0")} free</span>
      </div>
      {/* two rows of bays facing a driving lane, like a real car park from above */}
      {rows.map((row, r) => (
        <div key={r}>
          <div className={`grid grid-cols-6 ${r === 0 ? "border-b-2" : "border-t-2"} border-stone-500`}>
            {row.map((t, i) => (
              <div key={i} className={`relative flex h-16 items-center justify-center overflow-hidden ${i > 0 ? "border-l-2 border-stone-500" : ""}`}>
                <AnimatePresence>
                  {t && (
                    <motion.div
                      // drives in from the lane (nose first) and backs out again
                      initial={{ y: r === 0 ? 60 : -60, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: r === 0 ? 60 : -60, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 90, damping: 16 }}
                    >
                      <div style={{ transform: `rotate(${r === 0 ? -90 : 90}deg)` }}>
                        <Car color={carColor(r * 6 + i)} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
          {r === 0 && (
            <div className="flex h-8 items-center">
              <div className="bay-line w-full opacity-70" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AuthPage() {
  const { login, register } = useAuth();
  const toast = useToast();
  const { dark, toggle } = useTheme();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const strength = passwordStrength(password);
  const mismatch = mode === "register" && confirm.length > 0 && confirm !== password;

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "register") {
      if (password.length < 6) return setError("Password must be at least 6 characters");
      if (password !== confirm) return setError("The two passwords do not match");
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
        toast("success", "Welcome back!");
      } else {
        await register(name, email, password);
        toast("success", "Account created - welcome to Smart Parking!");
      }
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg === "Failed to fetch" ? "Cannot reach the backend at http://localhost:8000 - is it running?" : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* ---------- left: brand panel ---------- */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-stone-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Logo size={42} />
          <span className="font-[family-name:var(--font-display)] text-xl font-bold">Smart Parking</span>
        </div>

        <div className="space-y-8">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1 className="text-[40px] leading-[1.1] font-extrabold">
              Know where to park
              <br />
              <span className="text-paint">before you set off.</span>
            </h1>
            <p className="mt-4 max-w-md text-stone-400">
              One camera watches the whole lot and counts the empty bays. You see them here, and you can hold one
              for 15 minutes while you drive over.
            </p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}>
            <LotAnimation />
          </motion.div>
          <ul className="space-y-2.5 text-sm text-stone-300">
            {[
              { icon: <ScanEye className="size-4" />, text: "Free bays counted live from the camera feed" },
              { icon: <CalendarCheck className="size-4" />, text: "Book a bay, then check in with a 4-digit PIN" },
              { icon: <Zap className="size-4" />, text: "EV charging and accessible bays marked" },
            ].map((f, i) => (
              <motion.li
                key={f.text}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className="flex items-center gap-3"
              >
                <span className="text-paint">{f.icon}</span>
                {f.text}
              </motion.li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-stone-500">CSE327 project · SDG 11, sustainable cities and communities</p>
      </div>

      {/* ---------- right: form ---------- */}
      <div className="relative flex flex-1 items-center justify-center p-6">
        <button onClick={toggle} className="btn-ghost absolute top-5 right-5 !p-2.5" aria-label="Toggle dark mode">
          {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>

        <div className="w-full max-w-md animate-pop">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo size={36} />
            <span className="font-[family-name:var(--font-display)] text-lg font-bold">Smart Parking</span>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.h2
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="text-3xl font-extrabold"
            >
              {mode === "login" ? "Sign in" : "Create an account"}
            </motion.h2>
          </AnimatePresence>
          <p className="mt-1.5 text-stone-500 dark:text-stone-400">
            {mode === "login" ? "See the free bays and your bookings." : "You only need a name, an email and a password."}
          </p>

          {/* tabs */}
          <div className="mt-6 grid grid-cols-2 border-b border-stone-200 dark:border-stone-800">
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`relative pb-2.5 text-sm font-semibold transition-colors ${
                  mode === m ? "text-stone-900 dark:text-white" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {m === "login" ? "Sign in" : "Register"}
                {/* underline slides to the chosen tab */}
                {mode === m && <motion.span layoutId="auth-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600" transition={spring} />}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <AnimatePresence initial={false}>
            {mode === "register" && (
              <motion.div
                key="name"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <label className="mb-1.5 block text-sm font-medium">Full name</label>
                <Field icon={<UserIcon className="size-4" />}>
                  <input
                    className="input pl-10"
                    placeholder="e.g. Tamanna Akter"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </Field>
              </motion.div>
            )}
            </AnimatePresence>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Email</label>
              <Field icon={<Mail className="size-4" />}>
                <input
                  className="input pl-10"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </Field>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Password</label>
              <Field icon={<Lock className="size-4" />}>
                <input
                  className="input px-10"
                  type={showPw ? "text" : "password"}
                  placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </Field>
              {mode === "register" && password && (
                <div className="mt-2 animate-fade-in">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          i <= strength ? STRENGTH[strength].color : "bg-stone-200 dark:bg-stone-700"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-stone-500">Strength: {STRENGTH[strength].label}</p>
                </div>
              )}
            </div>

            <AnimatePresence initial={false}>
            {mode === "register" && (
              <motion.div
                key="confirm"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <label className="mb-1.5 block text-sm font-medium">Confirm password</label>
                <Field icon={<Lock className="size-4" />}>
                  <input
                    className={`input pl-10 ${mismatch ? "!border-rose-400 focus:!ring-rose-500/15" : ""}`}
                    type={showPw ? "text" : "password"}
                    placeholder="Type it again"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </Field>
                {mismatch && <p className="mt-1 text-xs text-rose-500">Passwords do not match</p>}
              </motion.div>
            )}
            </AnimatePresence>

            {error && (
              <motion.div
                key={error}
                animate={{ x: [0, -8, 8, -5, 5, 0] }}
                transition={{ duration: 0.4 }}
                className="rounded-md border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
              >
                {error}
              </motion.div>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full !py-3 text-base">
              {busy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  {mode === "login" ? "Sign in" : "Create account"} <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-stone-500">
            {mode === "login" ? "New here? " : "Already have an account? "}
            <button
              onClick={() => switchMode(mode === "login" ? "register" : "login")}
              className="font-semibold text-brand-600 hover:underline dark:text-brand-400"
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
          {mode === "register" && (
            <p className="mt-3 text-center text-xs text-stone-400">
              The first account ever created becomes the operator (admin) who can set up parking slots.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
