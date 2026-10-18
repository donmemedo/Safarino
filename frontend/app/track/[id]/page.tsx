"use client";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { along, api, arc, type Meta, type Track } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import Icon from "@/components/Icon";
import { Loading, Plate } from "@/components/ui";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
const LIVE = ["searching", "arriving", "arrived", "on_trip"];

/** Public live view for family and friends; the API exposes no fare or rider details. */
export default function TrackPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang, theme, n, sep } = usePrefs();
  const [r, setR] = useState<Track | null>();
  const [meta, setMeta] = useState<Meta>();

  useEffect(() => {
    api<Meta>("/meta").then(setMeta).catch(() => {});
    let live = true;
    const load = () => api<Track>(`/track/${id}`).then((x) => live && setR(x)).catch(() => live && setR(null));
    load();
    const iv = setInterval(load, 2000);
    return () => {
      live = false;
      clearInterval(iv);
    };
  }, [id]);

  const approach = useMemo(() => (r ? arc(r.start, r.pickup, 24) : null), [r?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const trip = useMemo(() => (r ? arc(r.pickup, r.dropoff) : null), [r?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const onTrip = r?.status === "on_trip" || r?.status === "completed";
  const path = onTrip ? trip : approach;
  const car = r && path && r.status !== "searching" && r.status !== "canceled" ? along(path, r.status === "arrived" || r.status === "completed" ? 1 : r.progress) : null;

  if (r === undefined) return <main className="pt-24"><Loading /></main>;
  if (r === null)
    return (
      <main className="grid min-h-dvh place-items-center px-4 text-center">
        <div className="aurora" />
        <div>
          <Icon name="pin" size={48} className="mx-auto text-muted" />
          <p className="mt-3 font-bold">{t("tripNotFound")}</p>
        </div>
      </main>
    );

  const d = r.driver;
  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView theme={theme} center={r.pickup} pickup={r.pickup} dropoff={r.dropoff} path={path} dashed={!onTrip} car={car} idleCars={r.status === "searching"} fit={path} />
      <motion.section
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="glass absolute inset-x-0 bottom-0 z-[900] rounded-t-[30px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-4 md:start-4 md:w-[400px] md:rounded-[30px]"
      >
        <span className="text-xs font-semibold text-muted">
          {t("trackTitle")}
          {sep}
          {t("trackSub")}
        </span>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-extrabold">
          {LIVE.includes(r.status) && (
            <span className="relative flex size-2.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-ok" />
              <span className="relative size-2.5 rounded-full bg-ok" />
            </span>
          )}
          {t(r.status === "completed" ? "completed" : r.status === "canceled" ? "canceled" : r.status)}
        </h1>
        <p className="text-sm text-muted">
          {meta?.services[r.service]?.[lang]}
          {sep}
          {meta?.cities[r.city]?.[lang]}
          {sep}
          {n(r.km, 1)} {t("km")}
        </p>
        {LIVE.includes(r.status) && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-soft">
            <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${r.progress * 100}%` }} transition={{ ease: "linear", duration: 2 }} />
          </div>
        )}
        {d && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-soft p-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-[#ff6b35] text-lg font-black text-accent-fg">{d[lang].charAt(0)}</span>
            <div className="min-w-0 flex-1">
              <b className="block truncate">{d[lang]}</b>
              <span className="flex items-center gap-1 text-xs text-muted">
                <Icon name="star" size={12} fill className="text-accent" />
                {n(d.rating, 2)}
                {sep}
                {lang === "fa" ? d.car_fa : d.car_en}
              </span>
            </div>
            <Plate plate={d.plate} />
          </div>
        )}
      </motion.section>
    </main>
  );
}
