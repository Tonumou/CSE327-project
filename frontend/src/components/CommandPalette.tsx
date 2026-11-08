// Ctrl + K: search box to jump to a page or run an action from the keyboard
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { KeyboardEvent } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { popIn } from "../motion";

export interface Command {
  id: string;
  label: string;
  group: string; // "Pages" / "Actions"
  icon: ReactNode;
  run: () => void;
}

export default function CommandPalette({ commands, open, onClose }: { commands: Command[]; open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const shown = commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  const run = (c?: Command) => {
    if (!c) return;
    onClose();
    c.run();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      run(shown[active]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  let lastGroup = "";
  return (
    <AnimatePresence>
    {open && (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[15vh]">
      <motion.div className="absolute inset-0 bg-stone-900/50 backdrop-blur-sm" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div variants={popIn} initial="hidden" animate="show" exit="exit" className="card relative w-full max-w-lg overflow-hidden shadow-xl">
        <div className="flex items-center gap-3 border-b border-stone-100 px-4 dark:border-stone-800">
          <Search className="size-5 text-stone-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder="Type a page or an action..."
            className="flex-1 bg-transparent py-4 text-base outline-none"
          />
          <kbd className="rounded-md border border-stone-200 px-1.5 py-0.5 text-[10px] font-semibold text-stone-400 dark:border-stone-700">ESC</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {shown.map((c, i) => {
            const header = c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <li key={c.id}>
                {header && <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">{c.group}</p>}
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(c)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    i === active ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : ""
                  }`}
                >
                  <span className="opacity-80">{c.icon}</span>
                  {c.label}
                  {i === active && <CornerDownLeft className="ml-auto size-4 opacity-60" />}
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-3 py-8 text-center text-sm text-stone-500">Nothing found for "{query}"</li>}
        </ul>
        <div className="flex gap-4 border-t border-stone-100 px-4 py-2 text-[11px] text-stone-400 dark:border-stone-800">
          <span>↑ ↓ to move</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
        </div>
      </motion.div>
    </div>
    )}
    </AnimatePresence>
  );
}
