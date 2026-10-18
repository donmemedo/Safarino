"use client";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { api, ApiError, ascii, faDigits, type Meta, type Org } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import Icon from "@/components/Icon";
import { Card, Field, input, Loading, Page, primary, Spinner, useToast } from "@/components/ui";

const num = (s: string) => Number(ascii(s).replace(/\D/g, ""));

export default function Business() {
  const { t, lang, n, money, pct, sep } = usePrefs();
  const [org, setOrg] = useState<Org | null>();
  const [meta, setMeta] = useState<Meta>();
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, show] = useToast();
  const fa = (s: string) => (lang === "fa" ? faDigits(s) : s);

  useEffect(() => {
    api<Meta>("/meta").then(setMeta).catch(() => {});
    api<Org>("/org")
      .then((o) => {
        setOrg(o);
        setBudget(String(o.budget));
      })
      .catch((e) => (e instanceof ApiError && e.status === 404 ? setOrg(null) : show(t("error"))));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<Org>, done?: () => void) => {
    setBusy(true);
    try {
      setOrg(await fn());
      done?.();
    } catch (e) {
      const s = e instanceof ApiError ? e.status : 0;
      show(t(s === 404 ? "notFound" : s === 409 ? "inOrg" : s === 422 ? "invalid" : "error"));
    }
    setBusy(false);
  };

  if (org === undefined) return <Page title={t("business")}>{toast}<Loading /></Page>;

  if (org === null)
    return (
      <Page title={t("business")} wide={false}>
        {toast}
        <Card i={1} className="mt-5">
          <span className="grid size-14 place-items-center rounded-2xl bg-accent text-accent-fg">
            <Icon name="briefcase" size={26} />
          </span>
          <h2 className="mt-3 text-xl font-extrabold">{t("createOrg")}</h2>
          {meta && <p className="mt-1 text-sm text-muted">{t("orgPitch", { c: pct(meta.org.commission * 100) })}</p>}
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length < 2 || !num(budget)) return show(t("empty"));
              run(() => api<Org>("/org", { name, budget: num(budget) }));
            }}
          >
            <Field label={t("orgName")}>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={input} />
            </Field>
            <Field label={t("monthlyBudget")} hint={budget ? money(num(budget)) : undefined}>
              <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" dir="ltr" placeholder="5,000,000" className={input} />
            </Field>
            <button disabled={busy} className={primary}>
              {busy ? <Spinner /> : t("create")}
            </button>
          </form>
        </Card>
      </Page>
    );

  const used = org.budget ? Math.min(1, org.spend / org.budget) : 0;
  return (
    <Page title={org.name}>
      {toast}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <Card i={1} className="relative overflow-hidden">
            <span className="text-sm text-muted">{t("spent")}</span>
            <b className="block text-[clamp(28px,6vw,40px)] font-black tabular-nums leading-tight">{money(org.spend)}</b>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-soft">
              <motion.div initial={{ width: 0 }} animate={{ width: `${used * 100}%` }} transition={{ type: "spring", stiffness: 80, damping: 18 }} className={`h-full rounded-full ${used > 0.9 ? "bg-danger" : "bg-accent"}`} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted">
              <span>
                {t("remaining")}: <b className="text-fg">{money(org.remaining)}</b>
              </span>
              <span>
                {t("budget")}: <b className="text-fg">{money(org.budget)}</b>
              </span>
            </div>
            {!org.admin && <p className="mt-4 rounded-2xl bg-soft p-3 text-sm">{t("memberNote")}</p>}
            {org.admin && (
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => api<Org>("/org/budget", { budget: num(budget) }), () => show(t("saved")));
                }}
              >
                <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" dir="ltr" aria-label={t("changeBudget")} className={input} />
                <button disabled={busy || num(budget) === org.budget} className="press h-12 shrink-0 rounded-2xl bg-fg px-4 text-sm font-bold text-bg disabled:opacity-30">
                  {t("changeBudget")}
                </button>
              </form>
            )}
          </Card>

          {org.members && (
            <Card i={2}>
              <h2 className="font-bold">
                {t("members")} <span className="text-muted">({n(org.members.length)})</span>
              </h2>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => api<Org>("/org/members", { phone: ascii(phone) }), () => setPhone(""));
                }}
              >
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" dir="ltr" placeholder={t("memberPhone")} className={input} />
                <button disabled={busy || !phone} className="press flex h-12 shrink-0 items-center gap-1 rounded-2xl bg-accent px-4 font-bold text-accent-fg disabled:opacity-40">
                  <Icon name="add" size={18} />
                  {t("add")}
                </button>
              </form>
              <p className="mt-1 text-xs text-muted">{t("memberHint")}</p>
              <ul className="mt-2 divide-y divide-line">
                {org.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-soft font-bold">{m.name.charAt(0)}</span>
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-sm">
                        {m.name} {m.admin && <span className="ms-1 rounded-full bg-accent/25 px-1.5 text-[10px]">{t("admin")}</span>}
                      </b>
                      <span dir="ltr" className="text-xs text-muted">
                        {fa(m.phone)}
                      </span>
                    </div>
                    <span className="text-end text-xs">
                      <b className="block tabular-nums">{money(m.spend)}</b>
                      <span className="text-muted">
                        {n(m.rides)} {t("trips")}
                      </span>
                    </span>
                    {!m.admin && (
                      <button onClick={() => run(() => api<Org>(`/org/members/${m.id}`, undefined, "DELETE"))} aria-label={t("remove")} className="press grid size-9 place-items-center rounded-full text-danger hover:bg-danger/10">
                        <Icon name="trash" size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {org.invoice && (
          <div className="space-y-5">
            <Card i={3}>
              <h2 className="font-bold">{t("invoice")}</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">{t("ridesCost")}</dt>
                  <dd className="tabular-nums">{money(org.invoice.rides)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">{t("panelFee")}</dt>
                  <dd className="tabular-nums">{money(org.invoice.panel_fee)}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2 text-base font-black">
                  <dt>{t("total")}</dt>
                  <dd className="tabular-nums">{money(org.invoice.total)}</dd>
                </div>
              </dl>
            </Card>
            <Card i={4}>
              <h2 className="font-bold">{t("recentRides")}</h2>
              {!org.rides?.length && <p className="py-6 text-center text-sm text-muted">{t("noHistory")}</p>}
              <ul className="mt-2 divide-y divide-line">
                {org.rides?.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <b className="block truncate">{r.name}</b>
                      <span className="text-xs text-muted">
                        {meta?.services[r.service]?.[lang]}
                        {sep}
                        {new Date(r.created * 1000).toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US")}
                      </span>
                    </span>
                    <b className={`tabular-nums ${r.status === "canceled" ? "text-muted line-through" : ""}`}>{money(r.fare)}</b>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>
    </Page>
  );
}
