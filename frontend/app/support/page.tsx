"use client";
import { useEffect, useState } from "react";
import { api, type Meta, type Ride, type Ticket } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import Icon from "@/components/Icon";
import { Card, input, Page, Spinner, useToast } from "@/components/ui";

const TOPICS = ["ride", "payment", "safety", "driver", "account", "other"] as const;

export default function Support() {
  const { t, L, lang, n, money, sep } = usePrefs();
  const [meta, setMeta] = useState<Meta>();
  const [rides, setRides] = useState<Ride[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("ride");
  const [rideId, setRideId] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, show] = useToast();
  const date = (s: number) => new Date(s * 1000).toLocaleString(lang === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" });

  useEffect(() => {
    api<Meta>("/meta").then(setMeta).catch(() => {});
    api<Ride[]>("/rides").then(setRides).catch(() => {});
    api<Ticket[]>("/tickets").then(setTickets).catch(() => {});
    const r = new URLSearchParams(location.search).get("ride");
    if (r) setRideId(r);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim().length < 5) return show(t("empty"));
    setBusy(true);
    try {
      setTickets(await api<Ticket[]>("/tickets", { topic, body, ride_id: rideId || null }));
      setBody("");
      show(t("ticketSent"));
    } catch {
      show(t("error"));
    }
    setBusy(false);
  };

  return (
    <Page title={t("support")}>
      {toast}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card i={1}>
            <h2 className="flex items-center gap-2 font-bold">
              <Icon name="shield" size={18} className="text-ok" />
              {t("safety")}
            </h2>
            <ul className="mt-3 space-y-2.5">
              {L.safety.map((s) => (
                <li key={s} className="flex items-start gap-2.5 text-sm">
                  <Icon name="check" size={16} className="mt-0.5 shrink-0 text-ok" />
                  {s}
                </li>
              ))}
            </ul>
            <a href="tel:110" className="press mt-4 flex h-11 items-center justify-center gap-2 rounded-2xl bg-danger/10 font-bold text-danger">
              <Icon name="phone" size={16} />
              {t("sos")}{sep}{n(110)}
            </a>
          </Card>

          <Card i={2}>
            <h2 className="font-bold">{t("pricing")}</h2>
            {meta && (
              <>
                <p className="mt-1 text-xs text-muted">{t("pricingNote", { cap: n(meta.surge_cap, 2), now: n(meta.surge_now, 2) })}</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead className="text-xs text-muted">
                      <tr>
                        <th className="py-2 text-start font-semibold" />
                        <th className="py-2 text-end font-semibold">{t("base")}</th>
                        <th className="py-2 text-end font-semibold">{t("perKm")}</th>
                        <th className="py-2 text-end font-semibold">{t("perMin")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {Object.entries(meta.services).map(([k, s]) => (
                        <tr key={k}>
                          <td className="py-2.5 font-bold">{s[lang]}</td>
                          <td className="py-2.5 text-end">{n(s.base)}</td>
                          <td className="py-2.5 text-end">{n(s.km)}</td>
                          <td className="py-2.5 text-end">{n(s.min)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] text-muted">{t("toman")}</p>
              </>
            )}
          </Card>

          <Card i={3}>
            <h2 className="font-bold">{t("cancelPolicy")}</h2>
            {meta && <p className="mt-1 text-sm text-muted">{t("cancelText", { a: money(meta.cancel.min), b: money(meta.cancel.max) })}</p>}
          </Card>

          <Card i={4}>
            <h2 className="font-bold">{t("faq")}</h2>
            <div className="mt-2 divide-y divide-line">
              {L.faq.map(([q, a]) => (
                <details key={q} className="group py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                    {q}
                    <Icon name="add" size={16} className="shrink-0 text-muted transition-transform group-open:rotate-45" />
                  </summary>
                  <p className="mt-2 text-sm text-muted">{a}</p>
                </details>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card i={2}>
            <h2 className="font-bold">{t("newTicket")}</h2>
            <form onSubmit={submit} className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("topic")}>
                {TOPICS.map((k) => (
                  <button type="button" key={k} role="radio" aria-checked={topic === k} onClick={() => setTopic(k)} className={`press h-9 rounded-full px-3.5 text-sm font-semibold ${topic === k ? "bg-fg text-bg" : "bg-soft"}`}>
                    {L.topics[k]}
                  </button>
                ))}
              </div>
              {rides.length > 0 && (
                <select value={rideId} onChange={(e) => setRideId(e.target.value)} aria-label={t("relatedRide")} className={input}>
                  <option value="">{t("relatedRide")}: —</option>
                  {rides.slice(0, 10).map((r) => (
                    <option key={r.id} value={r.id}>
                      {`${meta?.services[r.service]?.[lang] ?? ""}${sep}${date(r.created)}${sep}${money(r.fare)}`}
                    </option>
                  ))}
                </select>
              )}
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={1000} placeholder={t("describe")} className={`${input} h-auto resize-none py-3`} />
              <button disabled={busy} className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-extrabold text-accent-fg disabled:opacity-40">
                {busy ? <Spinner /> : <><Icon name="send" size={18} className="rtl:-scale-x-100" />{t("send")}</>}
              </button>
            </form>
          </Card>

          <Card i={3}>
            <h2 className="font-bold">{t("tickets")}</h2>
            {tickets.length === 0 && <p className="py-8 text-center text-sm text-muted">{t("noTickets")}</p>}
            <ul className="mt-2 divide-y divide-line">
              {tickets.map((k) => (
                <li key={k.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-sm">{L.topics[k.topic as keyof typeof L.topics]}</b>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${k.status === "urgent" ? "bg-danger/15 text-danger" : "bg-accent/20 text-amber-700 dark:text-accent"}`}>
                      {t(k.status)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{k.body}</p>
                  <span className="text-[11px] text-muted">{date(k.created)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </Page>
  );
}
