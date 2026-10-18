"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { api, type Meta, type Ride, type Wallet } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import Icon from "@/components/Icon";
import { Logo } from "@/components/TopBar";

import { rise } from "@/components/ui";

export default function WalletPage() {
  const { t, lang, n, money, sep, L } = usePrefs();
  const [w, setW] = useState<Wallet>();
  const [rides, setRides] = useState<Ride[]>([]);
  const [meta, setMeta] = useState<Meta>();
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api<Wallet>("/wallet").then(setW).catch(() => setErr(true));
    api<Ride[]>("/rides").then(setRides).catch(() => {});
    api<Meta>("/meta").then(setMeta).catch(() => {});
  }, []);

  const topUp = async (x: number) => {
    if (!(x > 0)) return;
    setErr(false);
    try {
      setW(await api<Wallet>("/wallet/topup", { amount: x }));
      setAmount("");
    } catch {
      setErr(true);
    }
  };

  const copy = async () => {
    await navigator.clipboard?.writeText(w!.referral);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-10 pt-24 sm:pt-28">
      <div className="aurora" />
      <motion.h1 {...rise(0)} className="text-[34px] font-black tracking-tight">
        {t("wallet")}
      </motion.h1>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          {/* Card */}
          <motion.div
            {...rise(1)}
            whileHover={{ rotateX: 4, rotateY: -4, scale: 1.01 }}
            style={{ transformPerspective: 900 }}
            className="relative aspect-[1.6] max-h-64 w-full overflow-hidden rounded-[28px] bg-gradient-to-br from-[#ffd60a] via-[#ffb300] to-[#ff6b35] p-6 text-[#111] shadow-[0_30px_60px_-20px_rgb(255_150_0/0.6)]"
          >
            <div className="absolute -end-16 -top-16 size-64 rounded-full bg-white/25 blur-2xl" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-extrabold">
                  <Logo size={30} />
                  {t("brand")}
                </span>
                <Icon name="wallet" size={26} />
              </div>
              <div>
                <span className="text-sm font-semibold opacity-70">{t("balance")}</span>
                <b className="block text-[clamp(28px,6vw,42px)] font-black leading-tight tabular-nums">{w ? money(w.balance) : "…"}</b>
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-black/10 px-2.5 py-0.5 text-xs font-bold">
                  <Icon name="star" size={12} fill />
                  {w ? n(w.points) : "…"} {t("points")}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Top up */}
          <motion.section {...rise(2)} className="glass rounded-[28px] p-5">
            <h2 className="font-bold">{t("topUp")}</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[50000, 100000, 200000].map((x) => (
                <button key={x} onClick={() => topUp(x)} className="press h-12 rounded-2xl bg-soft text-sm font-bold tabular-nums hover:bg-line">
                  +{n(x)}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d۰-۹]/g, ""))}
                placeholder={`${t("custom")} (${t("toman")})`}
                className="h-12 min-w-0 flex-1 rounded-2xl bg-soft px-4 text-[16px] outline-none placeholder:text-muted focus:ring-2 focus:ring-accent"
              />
              <button
                onClick={() => topUp(Number(amount.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))))}
                disabled={!amount}
                className="press h-12 rounded-2xl bg-accent px-5 font-extrabold text-accent-fg disabled:opacity-40"
              >
                {t("confirm")}
              </button>
            </div>
            {err && <p role="alert" className="mt-2 text-sm text-danger">{t("error")}</p>}
          </motion.section>

          {/* Referral */}
          <motion.section {...rise(3)} className="glass flex items-center gap-4 rounded-[28px] p-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent/20 text-amber-600 dark:text-accent">
              <Icon name="gift" />
            </span>
            <div className="min-w-0 flex-1">
              <b className="block">{t("referral")}</b>
              <span className="text-sm text-muted">{t("referralSub", { n: money(meta?.referral_gift ?? 0) })}</span>
            </div>
            <button onClick={copy} disabled={!w} className="press flex h-10 items-center gap-1.5 rounded-full bg-fg px-4 font-mono text-sm font-bold text-bg" dir="ltr">
              <Icon name={copied ? "check" : "copy"} size={16} />
              {copied ? t("copied") : w?.referral}
            </button>
          </motion.section>
        </div>

        {/* History */}
        <motion.section {...rise(4)} className="glass h-fit rounded-[28px] p-5">
          <h2 className="font-bold">{t("history")}</h2>
          {rides.length === 0 && (
            <div className="grid place-items-center py-12 text-center text-muted">
              <Icon name="clock" size={40} className="opacity-40" />
              <p className="mt-2 text-sm">{t("noHistory")}</p>
            </div>
          )}
          <ul className="mt-2 divide-y divide-line">
            {rides.map((r) => {
              const done = r.status === "completed", off = r.status === "canceled";
              return (
                <li key={r.id} className="flex items-center gap-3 py-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-soft">
                    <Icon name={r.service === "moto" ? "moto" : r.service === "courier" ? "courier" : "car"} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block text-[15px]">
                      {meta?.services[r.service]?.[lang]}
                      {sep}
                      {meta?.cities[r.city]?.[lang]}
                    </b>
                    <span className="text-xs text-muted">
                      {new Date(r.created * 1000).toLocaleString(lang === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </div>
                  <Link href={`/support?ride=${r.id}`} aria-label={t("getHelp")} className="press grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-soft">
                    <Icon name="help" size={16} />
                  </Link>
                  <div className="text-end">
                    <b className={`block text-sm tabular-nums ${off ? "text-muted line-through" : ""}`}>{money(r.fare)}</b>
                    <span className={`text-[11px] font-bold ${done ? "text-ok" : off ? "text-danger" : "text-amber-600 dark:text-accent"}`}>
                      {done ? t("done") : off ? t("canceled") : t(r.status as "arriving")}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </motion.section>

        <motion.section {...rise(5)} className="glass h-fit rounded-[28px] p-5 lg:col-start-2">
          <h2 className="font-bold">{t("txns")}</h2>
          {!w?.txns.length && <p className="py-8 text-center text-sm text-muted">{t("noTxns")}</p>}
          <ul className="mt-2 divide-y divide-line">
            {w?.txns.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <b className="block truncate">{L.txn[x.kind] ?? x.kind}</b>
                  <span className="text-[11px] text-muted">{new Date(x.created * 1000).toLocaleString(lang === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
                </span>
                <b dir="ltr" className={`shrink-0 tabular-nums ${x.amount > 0 ? "text-ok" : ""}`}>
                  {x.amount > 0 ? "+" : "−"}
                  {n(Math.abs(x.amount))}
                </b>
              </li>
            ))}
          </ul>
        </motion.section>
      </div>
    </main>
  );
}
