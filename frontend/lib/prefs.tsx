"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { dict, lists, type Key } from "./dict";

export type Lang = keyof typeof dict;
export type Theme = "light" | "dark";

const Ctx = createContext<{
  lang: Lang;
  theme: Theme;
  t: (k: Key, vars?: Record<string, string>) => string;
  L: (typeof lists)["fa"];
  n: (x: number, digits?: number) => string;
  money: (x: number) => string;
  pct: (x: number) => string;
  /** Inline separator: Persian comma in fa, since "·" reads as the Persian zero "۰". */
  sep: string;
  toggleLang: () => void;
  toggleTheme: () => void;
} | null>(null);

const save = (k: string, v: string) => (document.cookie = `${k}=${v};path=/;max-age=31536000;samesite=lax`);

export function Prefs({ lang: initLang, children }: { lang: Lang; children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(initLang);
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"), []);

  const toggleLang = useCallback(() => {
    const l = lang === "fa" ? "en" : "fa";
    const el = document.documentElement;
    el.lang = l;
    el.dir = l === "fa" ? "rtl" : "ltr";
    save("lang", l);
    setLang(l);
  }, [lang]);

  const toggleTheme = useCallback(() => {
    const th = theme === "dark" ? "light" : "dark";
    const apply = () => {
      document.documentElement.dataset.theme = th;
      setTheme(th);
    };
    save("theme", th);
    // Native cross-fade where supported
    const d = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (d.startViewTransition) d.startViewTransition(apply);
    else apply();
  }, [theme]);

  const loc = lang === "fa" ? "fa-IR" : "en-US";
  const n = (x: number, digits = 0) => x.toLocaleString(loc, { maximumFractionDigits: digits });
  const t = (k: Key, vars?: Record<string, string>) => dict[lang][k].replace(/\{(\w+)\}/g, (_, v) => vars?.[v] ?? "");
  const money = (x: number) => `${n(x)} ${dict[lang].toman}`;
  const pct = (x: number) => `${n(x)}${lang === "fa" ? "٪" : "%"}`;

  return (
    <Ctx.Provider value={{ lang, theme, t, L: lists[lang], n, money, pct, sep: lang === "fa" ? "، " : " · ", toggleLang, toggleTheme }}>
      {children}
    </Ctx.Provider>
  );
}

export const usePrefs = () => useContext(Ctx)!;
