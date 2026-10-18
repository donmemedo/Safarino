"use client";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { along, api, ApiError, arc, ascii, type DriverSummary, type Me, type Meta, type Ride } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import Icon, { type IconName } from "@/components/Icon";
import { Card, Field, input, Loading, Page, Plate, primary, rise, Spinner, Stars, useToast } from "@/components/ui";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
const STEP = { arriving: "stepArrived", arrived: "stepStart", on_trip: "stepEnd" } as const;

export default function DriverPage() {
  const { t } = usePrefs();
  const [me, setMe] = useState<Me>();
  const [meta, setMeta] = useState<Meta>();
  const [edit, setEdit] = useState(false);

  useEffect(() => {
    api<Me>("/me").then(setMe).catch(() => {});
    api<Meta>("/meta").then(setMeta).catch(() => {});
  }, []);

  if (!me || !meta) return <Page title={t("driver")}><Loading /></Page>;
  if (!me.driver || edit)
    return <Signup me={me} meta={meta} onDone={(m) => { setMe(m); setEdit(false); }} onCancel={me.driver ? () => setEdit(false) : undefined} />;
  return <Hub me={me} meta={meta} onEdit={() => setEdit(true)} />;
}

function Signup({ me, meta, onDone, onCancel }: { me: Me; meta: Meta; onDone: (m: Me) => void; onCancel?: () => void }) {
  const { t, lang } = usePrefs();
  const d = me.driver;
  const [p0, l0, p1, , p2] = (d?.plate ?? "").split(" ");
  const [f, setF] = useState({ car: d?.car ?? "", color: d?.color ?? "", license: "", city: d?.city ?? "tehran", female: d?.female ?? false });
  const [plate, setPlate] = useState({ a: p0 ?? "", l: l0 || "ب", b: p1 ?? "", c: p2 ?? "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const digits = (s: string, max: number) => ascii(s).replace(/\D/g, "").slice(0, max);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      onDone(await api<Me>("/driver/register", { ...f, license: ascii(f.license), plate: `${plate.a} ${plate.l} ${plate.b} - ${plate.c}` }));
    } catch (x) {
      setErr(t(x instanceof ApiError && x.status === 422 ? "invalid" : "error"));
    }
    setBusy(false);
  };

  const cell = "bg-transparent text-center outline-none placeholder:text-black/25";
  return (
    <Page title={d ? t("editCar") : t("driverSignup")} wide={false}>
      {!d && <motion.p {...rise(1)} className="mt-1 text-muted">{t("driverSignupSub")}</motion.p>}
      <Card i={2} className="mt-5">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("car")}>
              <input required value={f.car} onChange={(e) => setF({ ...f, car: e.target.value })} placeholder={t("carPh")} maxLength={40} className={input} />
            </Field>
            <Field label={t("color")}>
              <input required value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} placeholder={t("colorPh")} maxLength={20} className={input} />
            </Field>
          </div>
          <Field label={t("plate")}>
            <span dir="ltr" className="flex h-14 items-stretch overflow-hidden rounded-xl border-2 border-black bg-white text-xl font-bold text-black">
              <span className="w-5 shrink-0 bg-[#1c3f94]" />
              <input required aria-label={`${t("plate")} 1`} inputMode="numeric" value={plate.a} onChange={(e) => setPlate({ ...plate, a: digits(e.target.value, 2) })} placeholder="12" className={`w-12 ${cell}`} />
              <select aria-label={`${t("plate")} letter`} value={plate.l} onChange={(e) => setPlate({ ...plate, l: e.target.value })} className="bg-transparent px-1 outline-none">
                {meta.plate_letters.map((x) => <option key={x}>{x}</option>)}
              </select>
              <input required aria-label={`${t("plate")} 2`} inputMode="numeric" value={plate.b} onChange={(e) => setPlate({ ...plate, b: digits(e.target.value, 3) })} placeholder="345" className={`w-16 min-w-0 flex-1 ${cell}`} />
              <span className="flex flex-col items-center justify-center border-s-2 border-black px-2">
                <span className="text-[8px]">ایران</span>
                <input required aria-label={`${t("plate")} 3`} inputMode="numeric" value={plate.c} onChange={(e) => setPlate({ ...plate, c: digits(e.target.value, 2) })} placeholder="67" className={`w-9 text-lg leading-none ${cell}`} />
              </span>
            </span>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("license")} hint={t("licenseHint")}>
              <input required dir="ltr" inputMode="numeric" value={f.license} onChange={(e) => setF({ ...f, license: digits(e.target.value, 10) })} className={input} />
            </Field>
            <Field label={t("city")}>
              <select value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} className={input}>
                {Object.entries(meta.cities).map(([k, c]) => <option key={k} value={k}>{c[lang]}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-soft p-3 text-sm">
            <input type="checkbox" checked={f.female} onChange={(e) => setF({ ...f, female: e.target.checked })} className="size-5 accent-[var(--accent)]" />
            {t("femaleDriver")}
          </label>
          {err && <p role="alert" className="text-sm font-semibold text-danger">{err}</p>}
          <button disabled={busy} className={primary}>{busy ? <Spinner /> : d ? t("save") : t("register")}</button>
          {onCancel && <button type="button" onClick={onCancel} className="w-full text-sm font-semibold text-muted">{t("back")}</button>}
          {!d && <p className="text-center text-xs text-muted">{t("reviewNote")}</p>}
        </form>
      </Card>
    </Page>
  );
}

function Hub({ me, meta, onEdit }: { me: Me; meta: Meta; onEdit: () => void }) {
  const { t, lang, theme, n, money, pct, L, sep } = usePrefs();
  const [s, setS] = useState<DriverSummary>();
  const [reqs, setReqs] = useState<Ride[]>([]);
  const [active, setActive] = useState<Ride | null>(null);
  const [done, setDone] = useState<Ride | null>(null);
  const [stars, setStars] = useState(5);
  const [busy, setBusy] = useState("");
  const [toast, show] = useToast();

  const refresh = useCallback(() => api<DriverSummary>("/driver/summary").then(setS).catch(() => show(t("error"))), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void refresh(), [refresh]);

  // Live requests + active trip while online
  useEffect(() => {
    if (!s?.online) return;
    const poll = async () => {
      const a = await api<Ride | null>("/driver/active").catch(() => null);
      setActive(a);
      setReqs(a ? [] : await api<Ride[]>("/driver/requests").catch(() => []));
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [s?.online]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch {
      show(t("error"));
    }
    setBusy("");
  };

  const toggle = () =>
    act("online", async () => {
      const r = await api<{ online: boolean }>("/driver/online", { online: !s!.online });
      setS((x) => x && { ...x, online: r.online });
      if (!r.online) setReqs([]);
    });
  const accept = (id: string) =>
    act(id, async () => {
      setActive(await api<Ride>(`/driver/rides/${id}/accept`, {}));
      setReqs([]);
    });
  const step = () =>
    act("step", async () => {
      const r = await api<Ride>(`/driver/rides/${active!.id}/advance`, {});
      if (r.status === "completed") {
        setActive(null);
        setDone(r);
        refresh();
      } else setActive(r);
    });
  const rateRider = () =>
    act("rate", async () => {
      await api(`/driver/rides/${done!.id}/rate`, { stars });
      setDone(null);
      setStars(5);
      show(t("thanks"));
    });

  const path = useMemo(() => {
    if (!active) return null;
    return active.status === "on_trip" ? arc(active.pickup, active.dropoff) : arc(active.start, active.pickup, 24);
  }, [active?.id, active?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return <Page title={t("driver")}>{toast}<Loading /></Page>;

  const max = Math.max(1, ...s.week);
  // Last bar is today; the Persian week starts on Saturday (JS getDay 6 → index 0).
  const dayOf = (i: number) => L.days[(new Date(Date.now() - (6 - i) * 864e5).getDay() + 1) % 7];
  const tiles: [IconName, string, string][] = [
    ["car", t("tripsToday"), n(s.trips)],
    ["clock", t("totalTrips"), n(s.total)],
    ["star", t("rating"), n(s.rating, 2)],
    ["wallet", t("balance"), n(s.balance)],
  ];

  return (
    <Page title={t("driver")}>
      {toast}
      <motion.button
        {...rise(1)}
        onClick={toggle}
        disabled={!!busy || !!active}
        role="switch"
        aria-checked={s.online}
        className={`press mt-5 flex w-full items-center gap-4 rounded-[28px] p-5 text-start transition-colors duration-500 ${s.online ? "bg-ok text-white shadow-[0_20px_50px_-20px_var(--ok)]" : "glass"}`}
      >
        <span className={`relative grid size-12 place-items-center rounded-full ${s.online ? "bg-white/20" : "bg-soft"}`}>
          {s.online && <span className="absolute inset-0 animate-ping rounded-full bg-white/30" />}
          <Icon name="gauge" />
        </span>
        <span className="flex-1">
          <b className="block text-lg">{s.online ? t("online") : t("offline")}</b>
          <span className={`text-sm ${s.online ? "text-white/80" : "text-muted"}`}>
            {s.online ? t("onlineSub") : t("offlineSub")}
            {sep}
            {meta.cities[s.city]?.[lang]}
          </span>
        </span>
        <span className={`flex h-8 w-14 items-center rounded-full p-1 ${s.online ? "justify-end bg-white/30" : "justify-start bg-line"}`}>
          <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 32 }} className="size-6 rounded-full bg-white shadow" />
        </span>
      </motion.button>

      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="glass mt-5 rounded-[28px] p-5 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-ok text-white">
              <Icon name="check" size={28} />
            </span>
            <h2 className="mt-2 text-lg font-extrabold">{t("tripDone")}</h2>
            <p className="text-sm text-muted">
              {t("youEarn")}: <b className="text-fg">{money(done.earning ?? 0)}</b>
            </p>
            {done.payment === "cash" && <p className="mt-1 text-sm font-bold text-amber-700 dark:text-accent">{t("collectCash", { n: money(done.fare) })}</p>}
            <p className="mt-4 font-semibold">
              {t("rateRider")}: <bdi>{done.rider?.name}</bdi>
            </p>
            <div className="mt-1">
              <Stars value={stars} onChange={setStars} size={32} />
            </div>
            <button onClick={rateRider} disabled={busy === "rate"} className={`${primary} mt-3`}>
              {busy === "rate" ? <Spinner /> : t("submit")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {active && (
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass mt-5 overflow-hidden rounded-[28px]">
          <div className="relative h-64">
            <MapView
              theme={theme}
              center={active.pickup}
              pickup={active.pickup}
              dropoff={active.dropoff}
              path={path}
              dashed={active.status !== "on_trip"}
              car={path ? along(path, active.status === "arrived" ? 1 : active.progress) : null}
              idleCars={false}
              fit={path}
              pad="none"
            />
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold">{t(active.status as "arriving")}</h2>
                <p className="flex items-center gap-1 text-sm text-muted">
                  {t("rider")}: <b className="text-fg"><bdi>{active.rider?.name}</bdi></b>
                  <Icon name="star" size={12} fill className="ms-1 text-accent" />
                  {n(active.rider?.rating ?? 5, 1)}
                </p>
              </div>
              <span className="text-end">
                <b className="block text-lg tabular-nums">{money(active.earning ?? 0)}</b>
                <span className="text-xs text-muted">{t("youEarn")}</span>
              </span>
            </div>
            <p className={`mt-3 flex items-center gap-2 rounded-2xl p-3 text-sm font-semibold ${active.payment === "cash" ? "bg-accent/15" : "bg-soft"}`}>
              <Icon name={active.payment === "cash" ? "cash" : "wallet"} size={18} />
              {active.payment === "cash" ? t("collectCash", { n: money(active.fare) }) : t("paidInApp")}
            </p>
            <button onClick={step} disabled={busy === "step"} className={`${primary} mt-3`}>
              {busy === "step" ? <Spinner /> : t(STEP[active.status as keyof typeof STEP] ?? "confirm")}
            </button>
          </div>
        </motion.section>
      )}

      {!active && s.online && (
        <Card i={2} className="mt-5">
          <h2 className="flex items-center gap-2 font-bold">
            <span className="relative flex size-2.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-ok" />
              <span className="relative size-2.5 rounded-full bg-ok" />
            </span>
            {t("requests")}
          </h2>
          {reqs.length === 0 && <p className="py-6 text-center text-sm text-muted">{t("noRequests")}</p>}
          <ul className="mt-3 space-y-3">
            <AnimatePresence>
              {reqs.map((r) => (
                <motion.li key={r.id} layout initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="rounded-2xl bg-soft p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <b className="text-[15px]">{meta.services[r.service]?.[lang]}</b>
                      <p className="text-xs text-muted">
                        <bdi>{r.rider?.name}</bdi>
                        {sep}★ {n(r.rider?.rating ?? 5, 1)}
                        {sep}
                        {n(r.km, 1)} {t("km")}
                        {sep}
                        {n(r.minutes)} {t("min")}
                      </p>
                    </div>
                    <span className="shrink-0 text-end">
                      <b className="block tabular-nums">{money(r.earning ?? 0)}</b>
                      <span className="text-[11px] text-muted">{r.payment === "cash" ? t("payCash") : t("paidInApp")}</span>
                    </span>
                  </div>
                  <button onClick={() => accept(r.id)} disabled={!!busy} className="press mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-accent font-extrabold text-accent-fg disabled:opacity-50">
                    {busy === r.id ? <Spinner /> : t("accept")}
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </Card>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card i={3}>
            <span className="text-sm text-muted">{t("today")}</span>
            <b className="block text-[clamp(30px,6vw,44px)] font-black leading-tight tabular-nums">{money(s.today)}</b>
            <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted">
              <span>
                {t("weekEarn")}: <b className="text-fg tabular-nums">{money(s.week.reduce((a, b) => a + b, 0))}</b>
              </span>
              <span>
                {t("commission")}: <b className="text-fg">{pct(s.commission * 100)}</b>
              </span>
              <span className="text-ok">{t("settle")}</span>
            </div>
            <p className="mt-5 text-[11px] text-muted">{t("kToman")}</p>
            <div className="mt-2 flex h-44 items-end gap-2 sm:gap-3" role="img" aria-label={t("weekEarn")}>
              {s.week.map((v, i) => {
                const today = i === s.week.length - 1;
                return (
                  <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <span className={`text-[10px] font-semibold tabular-nums ${today ? "text-fg" : "text-muted"}`}>{n(Math.round(v / 1000))}</span>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(2, (Math.max(0, v) / max) * 100)}%` }}
                      transition={{ type: "spring", stiffness: 120, damping: 18, delay: 0.3 + i * 0.05 }}
                      className={`w-full rounded-xl ${today ? "bg-accent shadow-[0_0_24px_-4px_var(--accent)]" : "bg-fg/15"}`}
                    />
                    <span className={`text-xs ${today ? "font-bold" : "text-muted"}`}>{dayOf(i)}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map(([ic, label, val], i) => (
              <motion.div key={label} {...rise(4 + i)} className="glass rounded-3xl p-4">
                <Icon name={ic} size={18} className="text-muted" />
                <b className="mt-2 block truncate text-2xl font-black tabular-nums">{val}</b>
                <span className="text-xs text-muted">{label}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <Card i={4}>
            <h2 className="flex items-center gap-2 font-bold">
              <Icon name="bolt" size={18} fill className="text-accent" />
              {t("hotspots")}
            </h2>
            <ul className="mt-3 space-y-2">
              {s.hotspots.map((h) => (
                <li key={h.en} className="relative overflow-hidden rounded-2xl bg-soft p-3">
                  <motion.span
                    initial={{ width: 0 }}
                    animate={{ width: `${((h.surge - 1) / (meta.surge_cap - 1)) * 100}%` }}
                    transition={{ duration: 1, delay: 0.5 }}
                    className="absolute inset-y-0 start-0 bg-accent/25"
                  />
                  <span className="relative flex items-center justify-between">
                    <b className="text-[15px]">{h[lang]}</b>
                    <span className="font-bold tabular-nums">×{n(h.surge, 2)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card i={5} className="flex items-center gap-3">
            <Plate plate={me.driver!.plate} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {me.driver!.car} {me.driver!.color}
            </span>
            <button onClick={onEdit} disabled={!!active} className="press shrink-0 rounded-full bg-soft px-3 py-1.5 text-xs font-bold disabled:opacity-40">
              {t("editCar")}
            </button>
          </Card>
        </div>
      </div>
    </Page>
  );
}
