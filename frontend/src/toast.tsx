// Small pop-up messages in the corner ("Slot A1 saved", "Wrong password" ...)
import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

type Kind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

const ToastContext = createContext<(kind: Kind, text: string) => void>(() => {});

const STYLES: Record<Kind, { icon: ReactNode; bar: string }> = {
  success: { icon: <CheckCircle2 className="size-5 text-emerald-500" />, bar: "bg-emerald-500" },
  error: { icon: <XCircle className="size-5 text-rose-500" />, bar: "bg-rose-500" },
  info: { icon: <Info className="size-5 text-brand-500" />, bar: "bg-brand-500" },
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = (id: number) => setToasts((list) => list.filter((t) => t.id !== id));

  const show = useCallback((kind: Kind, text: string) => {
    const id = nextId++;
    setToasts((list) => [...list.slice(-3), { id, kind, text }]); // at most 4 on screen
    setTimeout(() => remove(id), 4500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout // the others move up smoothly when one closes
            initial={{ opacity: 0, x: 60, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, transition: { duration: 0.18 } }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="card pointer-events-auto relative flex items-start gap-3 overflow-hidden p-3.5 pr-9 shadow-lg"
          >
            <span className={`absolute inset-y-0 left-0 w-1 ${STYLES[t.kind].bar}`} />
            {STYLES[t.kind].icon}
            <p className="text-sm">{t.text}</p>
            <button
              onClick={() => remove(t.id)}
              className="absolute top-3 right-3 text-stone-400 hover:text-stone-600"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
            {/* bar that shrinks while the message is on screen */}
            <motion.span
              className={`absolute bottom-0 left-0 h-0.5 ${STYLES[t.kind].bar}`}
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 4.5, ease: "linear" }}
            />
          </motion.div>
        ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
