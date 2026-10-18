"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrefs } from "@/lib/prefs";
import Icon, { type IconName } from "./Icon";

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-[30%] bg-accent text-accent-fg shadow-[0_6px_20px_-4px_var(--accent)]"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="currentColor" aria-hidden>
        <path d="M12 2 4 21l8-4 8 4z" />
      </svg>
    </span>
  );
}

export default function TopBar() {
  const { t, theme, toggleTheme, toggleLang } = usePrefs();
  const path = usePathname();
  const links: [string, string, IconName][] = [
    ["/", t("ride"), "car"],
    ["/wallet", t("wallet"), "wallet"],
    ["/driver", t("driver"), "gauge"],
    ["/account", t("account"), "user"],
  ];
  const bare = path.startsWith("/login") || path.startsWith("/track");
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-[1000] flex items-center justify-between gap-2 p-3 pt-[max(.75rem,env(safe-area-inset-top))] sm:p-4">
      <Link href="/" className="glass press pointer-events-auto flex items-center gap-2.5 rounded-full py-1.5 pe-4 ps-1.5">
        <Logo />
        <span className="text-[17px] font-extrabold tracking-tight">{t("brand")}</span>
      </Link>

      <nav className="glass pointer-events-auto flex items-center gap-1 rounded-full p-1.5">
        {!bare && links.map(([href, label, icon]) => {
          const on = href === "/" ? path === "/" : path.startsWith(href) || (href === "/account" && /^\/(business|support)/.test(path));
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={on ? "page" : undefined}
              className={`press flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${on ? "bg-fg text-bg" : "hover:bg-soft"}`}
            >
              <Icon name={icon} size={18} />
              <span className="hidden lg:inline">{label}</span>
            </Link>
          );
        })}
        {!bare && <span className="mx-0.5 h-5 w-px bg-line" />}
        <button onClick={toggleLang} className="press h-9 rounded-full px-2.5 text-sm font-bold hover:bg-soft" aria-label={t("lang")}>
          {t("lang") === "English" ? "EN" : "فا"}
        </button>
        <button onClick={toggleTheme} className="press grid size-9 place-items-center rounded-full hover:bg-soft" aria-label={t("theme")}>
          <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
        </button>
      </nav>
    </header>
  );
}
