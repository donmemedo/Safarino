"use client";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { api, arc, along, ApiError, route, type Me, type Meta, type P, type Quote, type Ride } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import Icon, { type IconName } from "@/components/Icon";
import { Logo } from "@/components/TopBar";
import { Plate, Stars } from "@/components/ui";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const TEHRAN = { lat: 35.7, lng: 51.389 };
const SVC_ICON: Record<string, IconName> = { eco: "car", plus: "plus", ladies: "ladies", moto: "moto", courier: "courier" };
const ACTIVE = ["searching", "arriving", "arrived", "on_trip"];
const toP = ([lat, lng]: [number, number]) => ({ lat, lng });
const km = (a: P, b: P) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)) * 111;
let splashed = false;

export default function Home() {
  const { t, lang, theme, n, money, pct, sep } = usePrefs();
  const [meta, setMeta] = useState<Meta>();
  const [city, setCity] = useState("tehran");
  const [center, setCenter] = useState<P>(TEHRAN);
  const [pickup, setPickup] = useState<P>(TEHRAN);
  const [drop, setDrop] = useState<{ p: P; name: string } | null>(null);
  const [path, setPath] = useState<P[] | null>(null);
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [svc, setSvc] = useState("eco");
  const [pay, setPay] = useState<"wallet" | "cash" | "org">("wallet");
  const [me, setMe] = useState<Me>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [q, setQ] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [mini, setMini] = useState(false);
  const [splash, setSplash] = useState(!splashed);

  const fail = (e: unknown) =>
    setToast(e instanceof ApiError && e.status === 402 ? t(e.message.includes("organization") ? "orgBudget" : "low") : t("error"));
  const loadMe = () => api<Me>("/me").then(setMe).catch(() => {});

  useEffect(() => {
    splashed = true;
    const s = setTimeout(() => setSplash(false), 1400);
    api<Meta>("/meta").then(setMeta).catch(fail);
    loadMe();
    // Resume an in-flight ride after a reload
    api<Ride[]>("/rides")
      .then((rs) => {
        const r = rs.find((x) => ACTIVE.includes(x.status));
        if (!r) return;
        setCity(r.city);
        setPickup(r.pickup);
        setDrop({ p: r.dropoff, name: t("dropoff") });
        setSvc(r.service);
        setRide(r);
      })
      .catch(() => {});
    return () => clearTimeout(s);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  // Route + fares whenever the trip changes
  useEffect(() => {
    setPath(null);
    setQuotes(null);
    if (!drop) return;
    let live = true;
    route(pickup, drop.p).then((r) => live && setPath(r));
    api<Quote[]>("/quote", { city, pickup, dropoff: drop.p }).then((x) => live && setQuotes(x)).catch(fail);
    return () => {
      live = false;
    };
  }, [pickup, drop, city]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll the ride timeline
  const rideId = ride && ACTIVE.includes(ride.status) ? ride.id : null;
  useEffect(() => {
    if (!rideId) return;
    const id = setInterval(async () => {
      const r = await api<Ride>(`/rides/${rideId}`).catch(() => null);
      if (!r) return;
      setRide(r);
      if (r.status === "completed" || r.status === "canceled") loadMe();
      if (r.status === "canceled") setRide(null);
    }, 1000);
    return () => clearInterval(id);
  }, [rideId]);

  const chooseCity = (k: string) => {
    const c = toP(meta!.cities[k].center);
    setCity(k);
    setCenter(c);
    setPickup(c);
    setDrop(null);
  };

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (g) => {
        const p = { lat: g.coords.latitude, lng: g.coords.longitude };
        setCenter(p);
        setPickup(p);
      },
      () => setToast(t("error")),
    );

  const request = async () => {
    setBusy(true);
    try {
      setRide(await api<Ride>("/rides", { city, pickup, dropoff: drop!.p, service: svc, payment: pay }));
      setMini(false);
    } catch (e) {
      fail(e);
    }
    setBusy(false);
  };

  const cancel = async () => {
    try {
      await api(`/rides/${ride!.id}/cancel`, {});
      setRide(null);
      loadMe();
    } catch (e) {
      fail(e);
    }
  };

  const finish = () => {
    setRide(null);
    setDrop(null);
    loadMe();
  };

  const phase = ride ? (["arriving", "arrived"].includes(ride.status) ? "approach" : ride.status === "on_trip" ? "trip" : ride.status) : drop ? "choose" : "where";
  const approach = useMemo(() => (ride ? arc(ride.start, ride.pickup, 24) : null), [ride?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fit = useMemo(() => (phase === "choose" || phase === "trip" ? path : phase === "approach" ? approach : null), [phase, path, approach]);
  const car = useMemo(() => {
    if (!ride || !approach) return null;
    if (ride.status === "arriving") return along(approach, ride.progress);
    if (ride.status === "arrived") return along(approach, 1);
    if (ride.status === "on_trip" && path) return along(path, ride.progress);
    if (ride.status === "completed") return { ...ride.dropoff, deg: 0 };
    return null;
  }, [ride, approach, path]);

  const cityObj = meta?.cities[city];
  const places = (cityObj?.places ?? []).filter((p) => !q || p.fa.includes(q) || p.en.toLowerCase().includes(q.toLowerCase()));
  const quote = quotes?.find((x) => x.service === svc);
  const svcName = (k: string) => meta?.services[k]?.[lang] ?? "";

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView
        theme={theme}
        center={center}
        pickup={pickup}
        dropoff={drop?.p ?? null}
        path={phase === "approach" ? approach : path}
        dashed={phase === "approach" || phase === "searching"}
        car={car}
        idleCars={!ride || ride.status === "searching"}
        fit={fit}
        onTap={ride ? undefined : (p) => setDrop({ p, name: t("pinned") })}
        onPickup={ride ? undefined : setPickup}
      />

      <button onClick={locate} aria-label={t("myLocation")} className="glass press absolute end-4 top-20 z-[900] grid size-11 place-items-center rounded-full sm:top-24">
        <Icon name="locate" />
      </button>

      <motion.section
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 30, delay: 0.25 }}
        className="glass absolute inset-x-0 bottom-0 z-[900] flex max-h-[64dvh] flex-col rounded-t-[30px] md:inset-x-auto md:bottom-4 md:start-4 md:top-24 md:max-h-none md:w-[420px] md:rounded-[30px]"
      >
        <motion.button
          onPanEnd={(_, i) => setMini(i.offset.y > 20)}
          onClick={() => setMini(!mini)}
          aria-label={t("back")}
          aria-expanded={!mini}
          className="flex h-6 w-full shrink-0 touch-none justify-center pt-2.5 md:hidden"
        >
          <span className="h-1.5 w-10 rounded-full bg-muted/40" />
        </motion.button>
        <div
          className={`no-scrollbar overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 transition-[max-height] duration-500 md:max-h-none md:pt-5 ${mini ? "max-h-24 overflow-hidden" : "max-h-[60dvh]"}`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={phase === "approach" ? "ride" : phase === "trip" ? "ride" : phase}
              initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
              transition={{ duration: 0.28 }}
            >
              {phase === "where" && (
                <>
                  <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{me ? t("helloName", { name: me.name.split(" ")[0] }) : t("hello")}</h1>
                  <p className="mt-0.5 text-sm text-muted">{t("tagline")}</p>

                  <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
                    {meta &&
                      Object.entries(meta.cities).map(([k, c]) => (
                        <button
                          key={k}
                          onClick={() => chooseCity(k)}
                          className={`press h-9 shrink-0 rounded-full px-4 text-sm font-semibold ${k === city ? "bg-fg text-bg" : "bg-soft hover:bg-line"}`}
                        >
                          {c[lang]}
                        </button>
                      ))}
                  </div>

                  <label className="mt-3 flex h-13 items-center gap-3 rounded-2xl bg-soft px-4 focus-within:ring-2 focus-within:ring-accent">
                    <Icon name="search" className="text-muted" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted" />
                  </label>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                    <Icon name="pin" size={14} />
                    {t("tapMap")}
                  </p>

                  <ul className="mt-1 divide-y divide-line">
                    {places.map((pl, i) => (
                      <motion.li key={pl.en} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
                        <button onClick={() => setDrop({ p: toP(pl.at), name: pl[lang] })} className="press flex w-full items-center gap-3 py-3 text-start">
                          <span className="grid size-10 place-items-center rounded-full bg-soft">
                            <Icon name="pin" size={18} />
                          </span>
                          <span className="flex-1">
                            <b className="block text-[15px] font-semibold">{pl[lang]}</b>
                            <span className="text-xs text-muted">
                              {n(km(pickup, toP(pl.at)), 1)} {t("km")}
                            </span>
                          </span>
                          <Icon name="back" size={16} className="text-muted ltr:rotate-180" />
                        </button>
                      </motion.li>
                    ))}
                  </ul>

                  <div className="relative mt-3 overflow-hidden rounded-3xl bg-gradient-to-br from-accent to-[#ff9f0a] p-4 text-accent-fg">
                    <Icon name="gift" size={64} className="absolute -bottom-3 end-2 opacity-20" />
                    <b className="block text-lg font-extrabold">{t("firstRide")} {pct(30)}</b>
                    <span className="text-sm opacity-80">{t("tagline")}</span>
                  </div>
                </>
              )}

              {phase === "choose" && drop && (
                <>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setDrop(null)} aria-label={t("back")} className="press grid size-10 place-items-center rounded-full bg-soft">
                      <Icon name="back" className="rtl:rotate-180" />
                    </button>
                    <h2 className="text-xl font-extrabold tracking-tight">{t("chooseRide")}</h2>
                  </div>

                  <div className="mt-3 rounded-2xl bg-soft p-3 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="size-2.5 rounded-full bg-ok" />
                      <span className="text-muted">{t("pickup")}</span>
                      <b className="ms-auto font-semibold">{t("myLocation")}</b>
                    </div>
                    <div className="my-1 ms-[4px] h-3 w-px bg-line" />
                    <div className="flex items-center gap-3">
                      <span className="size-2.5 rounded-[3px] bg-fg" />
                      <span className="text-muted">{t("dropoff")}</span>
                      <b className="ms-auto truncate font-semibold">{drop.name}</b>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {!quotes && [0, 1, 2].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-soft" />)}
                    {quotes?.map((x, i) => {
                      const on = x.service === svc;
                      return (
                        <motion.button
                          key={x.service}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 * i }}
                          onClick={() => setSvc(x.service)}
                          aria-pressed={on}
                          className={`press flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-start ${on ? "border-accent bg-accent/10" : "border-transparent hover:bg-soft"}`}
                        >
                          <span className={`grid size-12 place-items-center rounded-2xl ${on ? "bg-accent text-accent-fg" : "bg-soft"}`}>
                            <Icon name={SVC_ICON[x.service]} size={24} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <b className="text-[16px] font-bold">{svcName(x.service)}</b>
                              {x.surge > 1 && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/25 px-1.5 text-[11px] font-bold text-amber-700 dark:text-accent">
                                  <Icon name="bolt" size={11} fill />×{n(x.surge, 2)}
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-muted">
                              {meta!.services[x.service].seats > 0 && `${n(meta!.services[x.service].seats)} ${t(meta!.services[x.service].seats === 1 ? "seat" : "seats")}${sep}`}
                              {n(x.eta)} {t("away")}
                            </span>
                          </span>
                          <span className="text-end">
                            <b className="block text-[15px] font-bold tabular-nums">{money(x.fare)}</b>
                            {x.discount > 0 && <s className="text-xs text-muted tabular-nums">{n(x.before_discount)}</s>}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>

                  {quote && (
                    <p className="mt-3 flex items-center justify-center gap-3 text-xs text-muted">
                      <span>
                        {n(quote.km, 1)} {t("km")}
                      </span>
                      <span className="h-3 w-px bg-line" />
                      <span>
                        {n(quote.minutes)} {t("min")}
                      </span>
                      {quote.discount > 0 && (
                        <>
                          <span className="h-3 w-px bg-line" />
                          <span className="font-semibold text-ok">{t("firstRide")}</span>
                        </>
                      )}
                    </p>
                  )}

                  <div className={`mt-3 grid gap-1 rounded-2xl bg-soft p-1 ${me?.org ? "grid-cols-3" : "grid-cols-2"}`} role="radiogroup">
                    {(me?.org ? (["wallet", "cash", "org"] as const) : (["wallet", "cash"] as const)).map((m) => (
                      <button
                        key={m}
                        role="radio"
                        aria-checked={pay === m}
                        onClick={() => setPay(m)}
                        className={`press relative h-11 rounded-xl text-sm font-semibold ${pay === m ? "text-fg" : "text-muted"}`}
                      >
                        {pay === m && <motion.span layoutId="pay" className="absolute inset-0 rounded-xl bg-solid shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
                        <span className="relative">
                          {m === "wallet" ? `${t("payWallet")}${me ? `${sep}${n(me.wallet)}` : ""}` : m === "org" ? t("payOrg") : t("payCash")}
                        </span>
                      </button>
                    ))}
                  </div>

                  <button
                    disabled={!quote || busy}
                    onClick={request}
                    className="press mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-extrabold text-accent-fg shadow-[0_10px_30px_-8px_var(--accent)] disabled:opacity-50"
                  >
                    {busy ? <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : `${t("request")} ${svcName(svc)}`}
                  </button>
                </>
              )}

              {phase === "searching" && (
                <div className="py-4 text-center">
                  <div className="radar relative mx-auto grid size-32 place-items-center">
                    <span />
                    <span />
                    <span />
                    <span className="!static !animate-none grid size-16 place-items-center rounded-full !border-0 bg-accent text-accent-fg shadow-[0_0_40px_var(--accent)]">
                      <Icon name={SVC_ICON[svc]} size={28} />
                    </span>
                  </div>
                  <h2 className="mt-4 text-xl font-extrabold">{t("searching")}</h2>
                  <p className="text-sm text-muted">{t("searchingSub")}</p>
                  <button onClick={cancel} className="press mt-5 h-12 w-full rounded-2xl bg-soft font-semibold text-danger">
                    {t("cancelRide")}
                  </button>
                </div>
              )}

              {ride && (phase === "approach" || phase === "trip") && (
                <RideCard ride={ride} eta={quote?.eta ?? 4} onCancel={cancel} onToast={setToast} svcName={svcName(ride.service)} />
              )}

              {phase === "completed" && ride && <RateCard ride={ride} onDone={finish} onToast={setToast} onError={fail} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.section>

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="glass fixed inset-x-0 top-20 z-[1100] mx-auto w-fit max-w-[90vw] rounded-full px-5 py-3 text-sm font-semibold"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {splash && (
          <motion.div exit={{ opacity: 0, scale: 1.08 }} transition={{ duration: 0.5 }} className="fixed inset-0 z-[3000] grid place-items-center bg-bg">
            <motion.div initial={{ scale: 0.4, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="flex flex-col items-center gap-4">
              <Logo size={96} />
              <motion.b initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="text-3xl font-black tracking-tight">
                {t("brand")}
              </motion.b>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function RideCard({ ride, eta, onCancel, onToast, svcName }: { ride: Ride; eta: number; onCancel: () => void; onToast: (s: string) => void; svcName: string }) {
  const { t, lang, n, sep, money } = usePrefs();
  const d = ride.driver!;
  const [confirming, setConfirming] = useState(false);
  const left = ride.status === "arriving" ? Math.max(1, Math.ceil(eta * (1 - ride.progress))) : Math.max(1, Math.ceil(ride.minutes * (1 - ride.progress)));
  const share = async () => {
    const url = `${location.origin}/track/${ride.id}`;
    if (navigator.share) await navigator.share({ title: t("brand"), url }).catch(() => {});
    else {
      await navigator.clipboard?.writeText(url);
      onToast(t("shared"));
    }
  };
  const actions: [IconName, string, () => void, string?][] = [
    ["phone", t("call"), () => onToast(t("callToast"))],
    ["message", t("message"), () => onToast(t("msgToast"))],
    ["share", t("share"), share],
    ["shield", t("sos"), () => {
      api(`/rides/${ride.id}/sos`, {}).catch(() => {});
      onToast(t("sosSent"));
      location.href = "tel:110";
    }, "text-danger"],
  ];
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">{t(ride.status as "arriving")}</h2>
          <p className="text-sm text-muted">{ride.status === "arrived" ? t("arrivedSub") : `${n(left)} ${t("min")}${sep}${svcName}`}</p>
        </div>
        {ride.status !== "arrived" && (
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent text-accent-fg">
            <b className="text-xl leading-none">{n(left)}</b>
            <span className="-mt-2 text-[10px] font-semibold">{t("min")}</span>
          </span>
        )}
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-soft">
        <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${(ride.status === "arrived" ? 1 : ride.progress) * 100}%` }} transition={{ ease: "linear", duration: 1 }} />
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-soft p-3">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-[#ff6b35] text-xl font-black text-accent-fg">{d[lang].charAt(0)}</span>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[16px]">{d[lang]}</b>
          <span className="flex items-center gap-1 text-xs text-muted">
            <Icon name="star" size={12} fill className="text-accent" />
            {n(d.rating, 2)}
            {sep}
            {n(d.trips)} {t("trips")}
          </span>
          <span className="block truncate text-xs text-muted">{lang === "fa" ? d.car_fa : d.car_en}</span>
        </div>
        <Plate plate={d.plate} />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {actions.map(([ic, label, fn, cls]) => (
          <button key={ic} onClick={fn} className={`press flex flex-col items-center gap-1.5 rounded-2xl bg-soft py-3 text-xs font-semibold ${cls ?? ""}`}>
            <Icon name={ic} />
            {label}
          </button>
        ))}
      </div>

      {ride.status !== "on_trip" && !confirming && (
        <button onClick={() => (ride.cancel_fee ? setConfirming(true) : onCancel())} className="press mt-3 h-12 w-full rounded-2xl font-semibold text-danger hover:bg-soft">
          {t("cancelRide")}
        </button>
      )}
      <AnimatePresence>
        {ride.status !== "on_trip" && confirming && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden rounded-2xl bg-danger/10 p-3" role="alertdialog">
            <p className="text-sm font-semibold">{t("cancelFeeQ", { fee: money(ride.cancel_fee) })}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => setConfirming(false)} className="press h-11 rounded-xl bg-solid font-bold">{t("keepRide")}</button>
              <button onClick={onCancel} className="press h-11 rounded-xl bg-danger font-bold text-white">{t("cancelRide")}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RateCard({ ride, onDone, onToast, onError }: { ride: Ride; onDone: () => void; onToast: (s: string) => void; onError: (e: unknown) => void }) {
  const { t, n, money, sep } = usePrefs();
  const [stars, setStars] = useState(5);
  const [tip, setTip] = useState(0);
  const [comment, setComment] = useState("");
  const submit = async () => {
    try {
      await api(`/rides/${ride.id}/rate`, { stars, tip, comment });
      onToast(t("thanks"));
      onDone();
    } catch (e) {
      onError(e);
    }
  };
  return (
    <div className="text-center">
      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 12 }} className="mx-auto grid size-16 place-items-center rounded-full bg-ok text-white">
        <Icon name="check" size={32} />
      </motion.span>
      <h2 className="mt-3 text-xl font-extrabold">{t("completed")}</h2>
      <p className="text-sm text-muted">
        {t("amountPaid")}: <b className="text-fg">{money(ride.fare)}</b>
        {sep}
        {n(ride.km, 1)} {t("km")}
      </p>

      <p className="mt-5 font-semibold">{t("rateRide")}</p>
      <div className="mt-2">
        <Stars value={stars} onChange={setStars} />
      </div>

      <p className="mt-4 text-sm font-semibold">{t("tip")}</p>
      <div className="mt-2 flex justify-center gap-2">
        {[0, 5000, 10000, 20000].map((x) => (
          <button key={x} onClick={() => setTip(x)} className={`press h-9 rounded-full px-3.5 text-sm font-semibold tabular-nums ${tip === x ? "bg-fg text-bg" : "bg-soft"}`}>
            {x ? n(x) : "—"}
          </button>
        ))}
      </div>

      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("comment")} rows={2} maxLength={500} className="mt-4 w-full resize-none rounded-2xl bg-soft p-3 text-[16px] outline-none placeholder:text-muted focus:ring-2 focus:ring-accent" />
      <button onClick={submit} className="press mt-3 h-14 w-full rounded-2xl bg-accent text-[17px] font-extrabold text-accent-fg">
        {t("submit")}
      </button>
    </div>
  );
}
