import type { Metadata, Viewport } from "next";
import { Inter, Vazirmatn } from "next/font/google";
import { cookies } from "next/headers";
import { Prefs, type Lang } from "@/lib/prefs";
import TopBar from "@/components/TopBar";
import "./globals.css";

const vazir = Vazirmatn({ subsets: ["arabic", "latin"], variable: "--font-vazir" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "سفرینو | Safarino",
  description: "تاکسی اینترنتی سفرینو — سفر امن، قیمت شفاف",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Without a saved theme, follow the OS before first paint (no flash).
const themeScript = `try{if(!document.documentElement.dataset.theme)document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const c = await cookies();
  const lang: Lang = c.get("lang")?.value === "en" ? "en" : "fa";
  const theme = c.get("theme")?.value;
  return (
    <html
      lang={lang}
      dir={lang === "fa" ? "rtl" : "ltr"}
      data-theme={theme === "dark" || theme === "light" ? theme : undefined}
      className={`${vazir.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Prefs lang={lang}>
          <TopBar />
          {children}
        </Prefs>
      </body>
    </html>
  );
}
