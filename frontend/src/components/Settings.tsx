// Settings: profile, password, appearance and live-view preferences
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Bell, KeyRound, Laptop, LayoutGrid, Loader2, Moon, Palette, RefreshCw, Save, ShieldCheck, Sun, UserRound } from "lucide-react";
import { motion } from "motion/react";
import { changePassword, updateProfile } from "../api";
import { useAuth } from "../auth";
import { Item, Stagger } from "../motion";
import { usePrefs } from "../prefs";
import { useTheme } from "../theme";
import type { ThemeMode } from "../theme";
import { useToast } from "../toast";

function Section({ icon, title, hint, children }: { icon: ReactNode; title: string; hint: string; children: ReactNode }) {
  return (
    <section className="card p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">{icon}</span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl p-3 transition hover:bg-stone-50 dark:hover:bg-stone-800/50">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-stone-500 dark:text-stone-400">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${on ? "justify-end bg-brand-600" : "justify-start bg-stone-300 dark:bg-stone-700"}`}
      >
        {/* knob snaps across with a spring */}
        <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 32 }} className="size-5 rounded-full bg-white shadow" />
      </button>
    </label>
  );
}

const THEMES: { mode: ThemeMode; label: string; icon: ReactNode; preview: string }[] = [
  { mode: "light", label: "Light", icon: <Sun className="size-4" />, preview: "bg-white border-stone-200" },
  { mode: "dark", label: "Dark", icon: <Moon className="size-4" />, preview: "bg-stone-900 border-stone-700" },
  { mode: "system", label: "System", icon: <Laptop className="size-4" />, preview: "bg-gradient-to-r from-white to-stone-900 border-stone-300" },
];

export default function Settings() {
  const { user, updateUser } = useAuth();
  const { mode, setMode } = useTheme();
  const { prefs, setPref } = usePrefs();
  const toast = useToast();

  const [name, setName] = useState(user?.full_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    try {
      updateUser(await updateProfile(name));
      toast("success", "Profile saved.");
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return toast("error", "The new passwords do not match.");
    setSavingPw(true);
    try {
      await changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      toast("success", "Password changed. Other devices were logged out.");
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setSavingPw(false);
    }
  };

  const toggleNotify = async (on: boolean) => {
    if (on && "Notification" in window && Notification.permission !== "granted") {
      const answer = await Notification.requestPermission();
      if (answer !== "granted") {
        toast("error", "The browser blocked notifications. Allow them in the address bar and try again.");
        return;
      }
    }
    setPref("notifyFree", on);
    toast("info", on ? "You'll get a notification when a space becomes free." : "Notifications turned off.");
  };

  if (!user) return null;

  return (
    <Stagger className="grid gap-6 lg:grid-cols-2" gap={0.08}>
      <Item>
      <Section icon={<UserRound className="size-5" />} title="Profile" hint="How you appear in Smart Parking">
        <div className="mb-5 flex items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-lg bg-brand-600 text-2xl font-bold text-white">
            {name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?"}
          </span>
          <div>
            <p className="font-semibold">{user.full_name}</p>
            <p className="text-sm text-stone-500">{user.email}</p>
            <span className="chip mt-1 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              <ShieldCheck className="size-3.5" /> {user.role === "operator" ? "Operator (admin)" : "Driver"}
            </span>
          </div>
        </div>
        <form onSubmit={saveName} className="space-y-3">
          <label className="block text-sm font-medium">
            Full name
            <input className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </label>
          <label className="block text-sm font-medium">
            Email <span className="font-normal text-stone-400">(can't be changed)</span>
            <input className="input mt-1.5 opacity-60" value={user.email} disabled />
          </label>
          <button className="btn-primary" disabled={savingName || name.trim() === user.full_name}>
            {savingName ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save profile
          </button>
        </form>
      </Section>
      </Item>

      <Item>
      <Section icon={<KeyRound className="size-5" />} title="Password" hint="Changing it logs you out on every other device">
        <form onSubmit={savePassword} className="space-y-3">
          {(
            [
              ["current", "Current password", "current-password"],
              ["next", "New password", "new-password"],
              ["confirm", "Repeat new password", "new-password"],
            ] as const
          ).map(([key, label, auto]) => (
            <label key={key} className="block text-sm font-medium">
              {label}
              <input
                type="password"
                className="input mt-1.5"
                value={pw[key]}
                onChange={(e) => setPw({ ...pw, [key]: e.target.value })}
                autoComplete={auto}
                required
                minLength={key === "current" ? 1 : 6}
              />
            </label>
          ))}
          {pw.confirm && pw.next !== pw.confirm && <p className="text-xs text-rose-500">The new passwords do not match.</p>}
          <button className="btn-primary" disabled={savingPw}>
            {savingPw ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Change password
          </button>
        </form>
      </Section>
      </Item>

      <Item>
      <Section icon={<Palette className="size-5" />} title="Appearance" hint="Choose how Smart Parking looks">
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.mode}
              onClick={() => setMode(t.mode)}
              className={`rounded-lg border-2 p-2 text-left transition hover:-translate-y-0.5 ${
                mode === t.mode ? "border-brand-600 ring-4 ring-brand-500/15" : "border-stone-200 dark:border-stone-700"
              }`}
            >
              <div className={`h-16 rounded-xl border ${t.preview} p-2`}>
                <div className="h-2 w-10 rounded-full bg-brand-500/80" />
                <div className="mt-1.5 h-1.5 w-14 rounded-full bg-stone-400/50" />
                <div className="mt-1 h-1.5 w-8 rounded-full bg-stone-400/50" />
              </div>
              <span className="mt-2 flex items-center gap-1.5 px-1 text-sm font-semibold">
                {t.icon} {t.label}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-stone-500">"System" follows your computer's light / dark setting automatically.</p>
      </Section>
      </Item>

      <Item>
      <Section icon={<RefreshCw className="size-5" />} title="Live view" hint="Remembered in this browser">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4 p-3">
            <span>
              <span className="block text-sm font-medium">Camera refresh</span>
              <span className="block text-xs text-stone-500 dark:text-stone-400">How often the live picture updates</span>
            </span>
            <div className="flex rounded-xl bg-stone-100 p-1 text-xs font-semibold dark:bg-stone-800">
              {[1, 2, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setPref("refreshSeconds", s)}
                  className={`rounded-lg px-3 py-1.5 transition ${prefs.refreshSeconds === s ? "bg-white text-brand-700 shadow-sm dark:bg-stone-700 dark:text-white" : "text-stone-500"}`}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>
          <Toggle
            on={prefs.compactMap}
            onChange={(v) => setPref("compactMap", v)}
            label="Compact slot map"
            hint="Smaller tiles - fits big car parks on one screen"
          />
          <Toggle
            on={prefs.reduceMotion}
            onChange={(v) => setPref("reduceMotion", v)}
            label="Reduce animations"
            hint="Turns off sliding and moving effects (also follows your computer's setting)"
          />
          <Toggle
            on={prefs.notifyFree}
            onChange={toggleNotify}
            label="Notify me when a space frees up"
            hint="A browser notification, even when this tab is in the background"
          />
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-stone-50 p-3 text-xs text-stone-500 dark:bg-stone-800/50 dark:text-stone-400">
          <Bell className="size-4 shrink-0" /> <LayoutGrid className="size-4 shrink-0" />
          Tip: press <kbd className="rounded border border-stone-300 bg-white px-1.5 font-mono dark:border-stone-600 dark:bg-stone-900">Ctrl</kbd> +{" "}
          <kbd className="rounded border border-stone-300 bg-white px-1.5 font-mono dark:border-stone-600 dark:bg-stone-900">K</kbd> anywhere to jump to a page.
        </div>
      </Section>
      </Item>
    </Stagger>
  );
}
