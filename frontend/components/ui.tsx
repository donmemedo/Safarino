"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { faDigits } from "@/lib/api";
import Icon from "./Icon";

export const rise = (i: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 260, damping: 26, delay: i * 0.06 },
});

export const input =
  "h-12 w-full min-w-0 rounded-2xl bg-soft px-4 text-[16px] outline-none placeholder:text-muted focus:ring-2 focus:ring-accent";
export const primary =
  "press flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] font-extrabold text-accent-fg shadow-[0_10px_30px_-10px_var(--accent)] disabled:opacity-40";

/** Page shell for the non-map screens: ambient background, large title, content width. */
export function Page({ title, children, wide = true }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto px-4 pb-12 pt-24 sm:pt-28 ${wide ? "max-w-5xl" : "max-w-xl"}`}>
      <div className="aurora" />
      <motion.h1 {...rise(0)} className="text-[34px] font-black tracking-tight">
        {title}
      </motion.h1>
      {children}
    </main>
  );
}

export function Card({ i = 1, className = "", children }: { i?: number; className?: string; children: React.ReactNode }) {
  return (
    <motion.section {...rise(i)} className={`glass rounded-[28px] p-5 ${className}`}>
      {children}
    </motion.section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Spinner() {
  return <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export function Loading() {
  return (
    <div className="grid min-h-[40vh] place-items-center text-accent">
      <span className="size-8 animate-spin rounded-full border-[3px] border-current border-t-transparent" />
    </div>
  );
}

/** Iranian plate: [flag strip][12 ب 345][ایران 67]. Each part is its own flex item so bidi can't reorder it. */
export function Plate({ plate, big = false }: { plate: string; big?: boolean }) {
  const [a, l, b, , c] = plate.split(" ");
  return (
    <span dir="ltr" className={`inline-flex items-stretch overflow-hidden rounded-md border-[1.5px] border-black bg-white font-bold text-black ${big ? "h-11" : "h-8"}`}>
      <span className="flex w-4 flex-col items-center justify-center bg-[#1c3f94] text-[5px] leading-none text-white">
        <span className="mb-0.5 h-1.5 w-2.5 bg-[linear-gradient(#239f40_33%,#fff_33%_66%,#da0000_66%)]" />
        I.R.
      </span>
      <span className={`flex items-center gap-1.5 px-2 ${big ? "text-xl" : "text-[15px]"}`}>
        <span>{faDigits(a ?? "")}</span>
        <span>{l}</span>
        <span>{faDigits(b ?? "")}</span>
      </span>
      <span className="flex flex-col items-center justify-center border-s-[1.5px] border-black px-1.5 text-[13px] leading-none">
        <span className="text-[7px]">ایران</span>
        {faDigits(c ?? "")}
      </span>
    </span>
  );
}

export function Stars({ value, onChange, size = 36 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <div className="flex justify-center gap-1" dir="ltr" role="radiogroup">
      {[1, 2, 3, 4, 5].map((s) => (
        <motion.button key={s} role="radio" aria-checked={s === value} aria-label={`${s}`} whileTap={{ scale: 0.8 }} whileHover={{ scale: 1.15 }} onClick={() => onChange(s)} className="p-1">
          <Icon name="star" size={size} fill={s <= value} className={s <= value ? "text-accent" : "text-muted/40"} />
        </motion.button>
      ))}
    </div>
  );
}

/** Floating status pill. */
export function useToast(): [React.ReactNode, (s: string) => void] {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(""), 2400);
    return () => clearTimeout(id);
  }, [msg]);
  const node = (
    <AnimatePresence>
      {msg && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          className="glass fixed inset-x-0 top-20 z-[1100] mx-auto w-fit max-w-[90vw] rounded-full px-5 py-3 text-sm font-semibold"
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
  return [node, useCallback((s: string) => setMsg(s), [])];
}
