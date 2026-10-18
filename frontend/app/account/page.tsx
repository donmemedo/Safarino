"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, faDigits, type Me } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import Icon, { type IconName } from "@/components/Icon";
import { Card, input, Loading, Page, Spinner, useToast } from "@/components/ui";

export default function Account() {
  const { t, lang, n, money } = usePrefs();
  const [me, setMe] = useState<Me>();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, show] = useToast();

  useEffect(() => {
    api<Me>("/me").then((m) => {
      setMe(m);
      setName(m.name);
    }).catch(() => show(t("error")));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return show(t("empty"));
    setBusy(true);
    try {
      setMe(await api<Me>("/me", { name }));
      show(t("saved"));
    } catch {
      show(t("error"));
    }
    setBusy(false);
  };

  const logout = async () => {
    await api("/auth/logout", {}).catch(() => {});
    location.href = "/login";
  };

  if (!me) return <Page title={t("account")}>{toast}<Loading /></Page>;

  const links: [string, IconName, string, string][] = [
    ["/business", "briefcase", t("business"), me.org ? me.org.name : t("businessSub")],
    ["/driver", "gauge", me.driver ? t("driver") : t("driverSignup"), me.driver ? `${me.driver.car} ${me.driver.color}` : t("driverSignupSub")],
    ["/support", "help", t("support"), t("supportSub")],
    ["/wallet", "wallet", t("wallet"), money(me.wallet)],
  ];

  return (
    <Page title={t("account")} wide={false}>
      {toast}
      <Card i={1} className="mt-5">
        <div className="flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-[#ff6b35] text-2xl font-black text-accent-fg">{me.name.charAt(0)}</span>
          <div className="min-w-0 flex-1">
            <b className="block truncate text-xl">{me.name}</b>
            <span dir="ltr" className="block text-sm text-muted">
              {lang === "fa" ? faDigits(me.phone) : me.phone}
            </span>
          </div>
          <span className="text-center">
            <span className="flex items-center gap-1 text-lg font-black">
              <Icon name="star" size={16} fill className="text-accent" />
              {n(me.rating, 2)}
            </span>
            <span className="text-[10px] text-muted">{t("riderRating")}</span>
          </span>
        </div>
        <form onSubmit={save} className="mt-4 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label={t("fullName")} className={input} />
          <button disabled={busy || name === me.name} className="press h-12 shrink-0 rounded-2xl bg-fg px-5 font-bold text-bg disabled:opacity-30">
            {busy ? <Spinner /> : t("save")}
          </button>
        </form>
      </Card>

      <Card i={2} className="mt-4 !p-2">
        <ul className="divide-y divide-line">
          {links.map(([href, icon, title, sub]) => (
            <li key={href}>
              <Link href={href} className="press flex items-center gap-3 rounded-2xl p-3 hover:bg-soft">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-soft">
                  <Icon name={icon} />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block">{title}</b>
                  <span className="block truncate text-xs text-muted">{sub}</span>
                </span>
                <Icon name="chevron" size={18} className="text-muted rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card i={3} className="mt-4 flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent/20 text-amber-600 dark:text-accent">
          <Icon name="gift" />
        </span>
        <div className="flex-1">
          <b className="block">{t("referral")}</b>
          <span className="text-xs text-muted">{t("points")}: {n(me.points)}</span>
        </div>
        <b dir="ltr" className="rounded-full bg-soft px-3 py-1.5 font-mono text-sm">
          {me.referral}
        </b>
      </Card>

      <button onClick={logout} className="press glass mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-[22px] font-bold text-danger">
        <Icon name="logout" size={18} className="rtl:rotate-180" />
        {t("logout")}
      </button>
    </Page>
  );
}
