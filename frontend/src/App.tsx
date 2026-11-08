import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarCheck,
  ChevronDown,
  History as HistoryIcon,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings2,
  SlidersHorizontal,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { getStatus } from "./api";
import { useAuth } from "./auth";
import AuthPage from "./components/AuthPage";
import BookingPortal from "./components/BookingPortal";
import CommandPalette from "./components/CommandPalette";
import type { Command } from "./components/CommandPalette";
import Dashboard from "./components/Dashboard";
import History from "./components/History";
import Logo from "./components/Logo";
import NotificationBell from "./components/NotificationBell";
import Settings from "./components/Settings";
import SlotSetup from "./components/SlotSetup";
import { pageTransition, popIn, spring } from "./motion";
import { useTheme } from "./theme";
import { useToast } from "./toast";
import type { Role } from "./types";

type Page = "dashboard" | "booking" | "history" | "setup" | "settings";

interface NavItem {
  page: Page;
  label: string;
  hint: string;
  icon: ReactNode;
  roles: Role[];
}

const NAV: NavItem[] = [
  { page: "dashboard", label: "Live Dashboard", hint: "Real-time view of the car park", icon: <LayoutDashboard className="size-5" />, roles: ["driver", "operator"] },
  { page: "booking", label: "Reserve a Spot", hint: "Book a free space before you arrive", icon: <CalendarCheck className="size-5" />, roles: ["driver", "operator"] },
  { page: "history", label: "History", hint: "How busy the car park has been", icon: <HistoryIcon className="size-5" />, roles: ["driver", "operator"] },
  { page: "setup", label: "Slot Setup", hint: "Mark the parking spaces on the camera picture", icon: <Settings2 className="size-5" />, roles: ["operator"] },
  { page: "settings", label: "Settings", hint: "Your profile, password and preferences", icon: <SlidersHorizontal className="size-5" />, roles: ["driver", "operator"] },
];

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

// green = AI watching a camera, amber = starting / no camera picture, red = backend offline
function LiveIndicator() {
  const [state, setState] = useState<"live" | "starting" | "nocamera" | "offline">("starting");
  useEffect(() => {
    const check = () =>
      getStatus()
        .then((s) => setState(!s.ai_running ? "starting" : s.error ? "nocamera" : "live"))
        .catch(() => setState("offline"));
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, []);
  const look = {
    live: { dot: "bg-emerald-500", text: "Live", cls: "text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300" },
    starting: { dot: "bg-amber-500", text: "Starting", cls: "text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300" },
    nocamera: { dot: "bg-amber-500", text: "No camera", cls: "text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300" },
    offline: { dot: "bg-rose-500", text: "Backend offline", cls: "text-rose-700 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-300" },
  }[state];
  return (
    <span className={`chip hidden sm:inline-flex ${look.cls}`}>
      <span className="relative flex size-2">
        {state === "live" && <span className={`absolute inline-flex size-full animate-ping rounded-full ${look.dot} opacity-75`} />}
        <span className={`relative inline-flex size-2 rounded-full ${look.dot}`} />
      </span>
      {look.text}
    </span>
  );
}

export default function App() {
  const { user, checking, logout } = useAuth();
  const toast = useToast();
  const { dark, toggle } = useTheme();
  const [page, setPage] = useState<Page>("dashboard");
  const [drawer, setDrawer] = useState(false); // mobile menu
  const [menu, setMenu] = useState(false); // user dropdown
  const [palette, setPalette] = useState(false); // Ctrl + K search
  const menuRef = useRef<HTMLDivElement>(null);

  // close the user dropdown when clicking anywhere else
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Ctrl + K (or Cmd + K on a Mac) opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-brand-600" />
      </div>
    );
  }
  if (!user) return <AuthPage />;

  const items = NAV.filter((n) => n.roles.includes(user.role));
  const current = items.find((n) => n.page === page) ?? items[0];

  const go = (p: Page) => {
    setPage(p);
    setDrawer(false);
  };

  const signOut = async () => {
    await logout();
    setPage("dashboard");
    toast("info", "You have been logged out.");
  };

  const commands: Command[] = [
    ...items.map((n) => ({ id: n.page, label: n.label, group: "Pages", icon: n.icon, run: () => go(n.page) })),
    { id: "theme", label: dark ? "Switch to light mode" : "Switch to dark mode", group: "Actions", icon: dark ? <Sun className="size-5" /> : <Moon className="size-5" />, run: toggle },
    { id: "logout", label: "Log out", group: "Actions", icon: <LogOut className="size-5" />, run: signOut },
  ];

  const sidebar = (where: "desktop" | "mobile") => (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <Logo size={38} />
        <div>
          <div className="font-[family-name:var(--font-display)] text-[17px] font-bold">Smart Parking</div>
          <div className="text-xs text-stone-500">Lot monitor · CSE327</div>
        </div>
      </div>
      <div className="bay-line mx-5 mb-3 opacity-80" />

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {items.map((n, i) => {
          const active = n.page === current.page;
          return (
            <motion.button
              key={n.page}
              onClick={() => go(n.page)}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring, delay: 0.05 * i }}
              whileTap={{ scale: 0.97 }}
              className={`group relative flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "text-stone-900 dark:text-white" : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
              }`}
            >
              {/* the highlight and its blue edge slide from the old item to the new one */}
              {active && (
                <motion.span
                  layoutId={`nav-highlight-${where}`}
                  className="absolute inset-0 rounded-md border-l-[3px] border-brand-600 bg-stone-100 dark:border-brand-400 dark:bg-stone-800"
                  transition={spring}
                />
              )}
              <span className={`relative ${active ? "text-brand-600 dark:text-brand-400" : "transition group-hover:translate-x-0.5"}`}>{n.icon}</span>
              <span className="relative">{n.label}</span>
            </motion.button>
          );
        })}
      </nav>

      <div className="border-t border-stone-200 px-5 py-4 text-xs text-stone-500 dark:border-stone-800">
        <p className="font-medium text-stone-700 dark:text-stone-300">Signed in as {user.role}</p>
        <p className="mt-0.5">Bookings are held for 15 minutes.</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-stone-200 bg-white lg:block dark:border-stone-800 dark:bg-stone-900">
        {sidebar("desktop")}
      </aside>

      {/* mobile drawer: slides in from the left, slides out again */}
      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-stone-900/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl dark:bg-stone-900"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={spring}
            >
              <button onClick={() => setDrawer(false)} className="absolute top-5 right-4 text-stone-400" aria-label="Close menu">
                <X className="size-5" />
              </button>
              {sidebar("mobile")}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-stone-200 bg-white/80 px-4 py-3 backdrop-blur-md sm:px-6 dark:border-stone-800 dark:bg-stone-900/80">
          <button onClick={() => setDrawer(true)} className="btn-ghost !p-2 lg:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          {/* page title rolls over when the page changes */}
          <div className="relative min-w-0 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={current.page} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} transition={{ duration: 0.2 }}>
                <h1 className="truncate text-lg font-bold tracking-tight">{current.label}</h1>
                <p className="hidden truncate text-xs text-stone-500 sm:block dark:text-stone-400">{current.hint}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPalette(true)}
              className="hidden items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-400 transition hover:border-stone-300 md:flex dark:border-stone-700 dark:hover:border-stone-600"
            >
              <Search className="size-4" /> Search...
              <kbd className="ml-4 rounded-md border border-stone-200 px-1.5 text-[10px] font-semibold dark:border-stone-700">Ctrl K</kbd>
            </button>
            <LiveIndicator />
            <NotificationBell />
            <button onClick={toggle} className="btn-ghost overflow-hidden !p-2.5" aria-label="Toggle dark mode" title="Light / dark mode">
              {/* sun and moon spin in and out */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={dark ? "sun" : "moon"}
                  initial={{ rotate: -90, scale: 0, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  exit={{ rotate: 90, scale: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="block"
                >
                  {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
                </motion.span>
              </AnimatePresence>
            </button>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenu((m) => !m)}
                className="flex items-center gap-2 rounded-xl p-1 pr-2 transition hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
                  {initials(user.full_name)}
                </span>
                <span className="hidden text-left md:block">
                  <span className="block text-sm leading-tight font-semibold">{user.full_name}</span>
                  <span className="block text-xs leading-tight text-stone-500 capitalize">{user.role}</span>
                </span>
                <ChevronDown className={`size-4 text-stone-400 transition ${menu ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
              {menu && (
                <motion.div
                  variants={popIn}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  style={{ transformOrigin: "top right" }}
                  className="card absolute right-0 mt-2 w-64 p-2 shadow-xl"
                >
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold">{user.full_name}</p>
                    <p className="truncate text-xs text-stone-500">{user.email}</p>
                    <span
                      className={`chip mt-2 ${
                        user.role === "operator"
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                          : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                      }`}
                    >
                      <ShieldCheck className="size-3.5" /> {user.role === "operator" ? "Operator (admin)" : "Driver"}
                    </span>
                  </div>
                  <div className="my-1 border-t border-stone-100 dark:border-stone-800" />
                  <button
                    onClick={() => {
                      setMenu(false);
                      go("settings");
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <SlidersHorizontal className="size-4" /> Settings
                  </button>
                  <button
                    onClick={toggle}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    {dark ? <Sun className="size-4" /> : <Moon className="size-4" />} {dark ? "Light mode" : "Dark mode"}
                  </button>
                  <button
                    onClick={signOut}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  >
                    <LogOut className="size-4" /> Log out
                  </button>
                </motion.div>
              )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          {/* page transition: old page fades out, new one slides up */}
          <AnimatePresence mode="wait">
            <motion.div key={current.page} {...pageTransition}>
              {current.page === "dashboard" && <Dashboard onReserve={() => go("booking")} />}
              {current.page === "booking" && <BookingPortal />}
              {current.page === "history" && <History />}
              {current.page === "setup" && <SlotSetup />}
              {current.page === "settings" && <Settings />}
            </motion.div>
          </AnimatePresence>
        </main>
        <CommandPalette commands={commands} open={palette} onClose={() => setPalette(false)} />
      </div>
    </div>
  );
}
