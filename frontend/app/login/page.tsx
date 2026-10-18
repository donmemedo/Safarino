"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, ascii, type Meta } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import type { Key } from "@/lib/dict";
import { Logo } from "@/components/TopBar";
import { Field, input, primary, Spinner } from "@/components/ui";

type Otp = { is_new: boolean; resend: number; dev_code?: string };
const ERR: Record<number, Key> = { 400: "wrongCode", 410: "codeExpired", 429: "tooMany", 422: "badPhone" };

export default function Login() {
  const { t, n, money } = usePrefs();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState<Otp | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [ref, setRef] = useState("");
  const [wait, setWait] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const codeEl = useRef<HTMLInputElement>(null);
  const [welcome, setWelcome] = useState(0);
  useEffect(() => void api<Meta>("/meta").then((m) => setWelcome(m.welcome)).catch(() => {}), []);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const fail = (e: unknown, fallback: Key = "error") => setErr(t(e instanceof ApiError ? ERR[e.status] ?? fallback : fallback));

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const p = ascii(phone).replace(/\D/g, "");
    if (!/^(0?9\d{9}|989\d{9})$/.test(p)) return setErr(t("badPhone"));
    setBusy(true);
    setErr("");
    try {
      const o = await api<Otp>("/auth/otp", { phone: p });
      setOtp(o);
      setWait(o.resend);
      setCode("");
      setTimeout(() => codeEl.current?.focus(), 50);
    } catch (x) {
      fail(x, "badPhone");
    }
    setBusy(false);
  };

  const verify = async (c = code) => {
    if (otp?.is_new && name.trim().length < 2) return setErr(t("empty"));
    setBusy(true);
    setErr("");
    try {
      await api("/auth/verify", { phone: ascii(phone).replace(/\D/g, ""), code: c, name, referral: ref });
      const next = new URLSearchParams(location.search).get("next") ?? "/";
      location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (x) {
      fail(x);
      setBusy(false);
    }
  };

  const onCode = (v: string) => {
    const c = ascii(v).replace(/\D/g, "").slice(0, 5);
    setCode(c);
    if (c.length === 5 && !otp?.is_new) verify(c);
  };

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-24">
      <div className="aurora" />
      <motion.div initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 24 }} className="glass w-full max-w-md rounded-[32px] p-6 sm:p-8">
        <motion.div initial={{ rotate: -25, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }} className="w-fit">
          <Logo size={56} />
        </motion.div>
        <h1 className="mt-5 text-[28px] font-black tracking-tight">{t("login")}</h1>
        <p className="text-sm text-muted">{t("loginSub")}</p>

        <AnimatePresence mode="wait" initial={false}>
          {!otp ? (
            <motion.form key="phone" onSubmit={send} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="mt-6 space-y-4">
              <Field label={t("phone")} hint={t("phoneHint")}>
                <input
                  autoFocus
                  dir="ltr"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912 345 6789"
                  className={`${input} h-14 text-center text-xl font-bold tracking-wider`}
                />
              </Field>
              <button disabled={busy || !phone} className={primary}>
                {busy ? <Spinner /> : t("getCode")}
              </button>
            </motion.form>
          ) : (
            <motion.form
              key="code"
              onSubmit={(e) => {
                e.preventDefault();
                verify();
              }}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="mt-6 space-y-4"
            >
              <p className="text-sm">
                {t("codeSentTo")}{" "}
                <b dir="ltr" className="inline-block">
                  {phone}
                </b>{" "}
                <button type="button" onClick={() => setOtp(null)} className="font-semibold text-amber-600 dark:text-accent">
                  {t("editPhone")}
                </button>
              </p>

              <label className="relative block" dir="ltr">
                <span className="sr-only">{t("code")}</span>
                <input
                  ref={codeEl}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => onCode(e.target.value)}
                  className="absolute inset-0 z-10 w-full opacity-0"
                  aria-label={t("code")}
                />
                <span className="grid grid-cols-5 gap-2" aria-hidden>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <motion.span
                      key={i}
                      animate={{ scale: code.length === i ? 1.06 : 1 }}
                      className={`grid h-14 place-items-center rounded-2xl bg-soft text-2xl font-black ${code.length === i ? "ring-2 ring-accent" : ""}`}
                    >
                      {code[i] ? n(+code[i]) : ""}
                    </motion.span>
                  ))}
                </span>
              </label>

              {otp.dev_code && (
                <button type="button" onClick={() => onCode(otp.dev_code!)} className="press w-full rounded-2xl border border-dashed border-line py-2 text-sm text-muted">
                  {t("demoCode")}: <b className="text-fg">{otp.dev_code.split("").map((d) => n(+d)).join("")}</b>
                </button>
              )}

              {otp.is_new && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-3">
                  <Field label={t("fullName")}>
                    <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} className={input} />
                  </Field>
                  <Field label={t("referralOpt")}>
                    <input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} dir="ltr" maxLength={20} className={`${input} font-mono`} />
                  </Field>
                  {welcome > 0 && <p className="rounded-2xl bg-accent/15 px-3 py-2 text-sm font-semibold">🎁 {t("welcomeGift", { n: money(welcome) })}</p>}
                </motion.div>
              )}

              <button disabled={busy || code.length < 5} className={primary}>
                {busy ? <Spinner /> : t("confirm")}
              </button>
              <button type="button" disabled={wait > 0 || busy} onClick={() => send()} className="w-full text-sm font-semibold text-muted disabled:opacity-60">
                {wait > 0 ? t("resendIn", { n: n(wait) }) : t("resend")}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {err && (
          <p role="alert" className="mt-3 text-center text-sm font-semibold text-danger">
            {err}
          </p>
        )}
        <p className="mt-6 text-center text-[11px] text-muted">{t("terms")}</p>
      </motion.div>
    </main>
  );
}
