// Shared animation building blocks (Motion library, https://motion.dev)
// - variants: how elements enter / leave
// - <Stagger> + <Item>: children appear one after another
// - <Reveal>: animates when scrolled into view
// - <CheckDraw>: a tick that draws itself (successful check-in)
import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { Variants } from "motion/react";

export const spring = { type: "spring", stiffness: 380, damping: 30 } as const;
export const softSpring = { type: "spring", stiffness: 200, damping: 24 } as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: softSpring },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.92, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.95, y: 6, transition: { duration: 0.15 } },
};

// page change: new page slides up while the old one fades out
export const pageTransition = {
  initial: { opacity: 0, y: 14, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
} as const;

export function Stagger({ children, className, delay = 0, gap = 0.06 }: { children: ReactNode; className?: string; delay?: number; gap?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: delay } } }}
    >
      {children}
    </motion.div>
  );
}

export function Item({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={fadeUp}>
      {children}
    </motion.div>
  );
}

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ ...softSpring, delay }}
    >
      {children}
    </motion.div>
  );
}

// a tick that draws itself, used after a successful check-in
export function CheckDraw({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 52 52" width={size} height={size} className={className}>
      <motion.circle
        cx="26"
        cy="26"
        r="23"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
      <motion.path
        d="M15 27 l7 7 l15 -16"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, delay: 0.45, ease: "easeOut" }}
      />
    </svg>
  );
}
