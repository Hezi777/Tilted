import type { Metadata, Viewport } from "next";
import { Assistant, Rubik } from "next/font/google";
import { DirectionProvider } from "@/components/ui/direction";
import { MotionPreferences } from "@/components/MotionPreferences";
import { PushServiceWorker } from "@/components/PushServiceWorker";
import { ViewerProvider } from "@/components/ViewerProvider";
import { LiveSessionBar } from "@/components/shell/LiveSessionBar";
import { TabBar } from "@/components/shell/TabBar";
import { getGamesForDevice } from "@/db/queries";
import { getViewer } from "@/lib/auth/session";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// One family for the whole app: Hebrew, Latin, and the money. Rubik is geometric
// with subtly rounded corners and ships real tabular figures, which is the only
// reason a separate numeral face was ever loaded beside the UI font -- so this is
// three families down to one, and two fewer requests on an apartment connection.
/**
 * Two families, and the split is not stylistic -- each one is doing something the
 * other measurably cannot.
 *
 * Assistant carries the Hebrew and the Latin UI: it is the smoothest and most open
 * of the Hebrew faces, which is what the interface wants.
 *
 * Rubik carries money, and only money. Assistant's figures are not tabular -- its
 * `1` is 10px narrower than its `0` at 40px -- and `AnimatedMoney` counts over
 * 600ms, so an amount set in it would shuffle sideways on almost every frame.
 * Rubik's advance width is identical across every digit string, and it has a real
 * shekel sign, which no Latin geometric face does. See docs/design-system.md.
 */
const assistant = Assistant({
  variable: "--font-app",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const rubik = Rubik({
  variable: "--font-numeral",
  subsets: ["hebrew", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000"),
  ),
  title: "Tilted Poker",
  description: "ניהול כניסות, ריבאיים וסגירת חשבון בערב פוקר ביתי",
  manifest: "/manifest.webmanifest",
  // iOS reads none of the manifest. Without an apple-touch-icon it puts a screenshot of
  // the page on the home screen, and it will not composite a background behind a
  // transparent icon -- it renders one as a black slab -- so this file is opaque.
  icons: {
    apple: [{ url: "/art/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Tilted",
    // The app paints its own near-black ground, so the status bar should sit on it
    // rather than above a separate bar in a different colour.
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No `maximumScale`. Capping it disables pinch-zoom, which is an accessibility
  // control, not a layout leak -- and this app is read in a dim room by people who
  // may want a closer look at who owes what. The layout is already fluid at 390px,
  // so there is nothing for a zoom to break.
  viewportFit: "cover",
  themeColor: "#0B0B0F",
};

// The layout resolves the signed-in Person, so nothing below it can be static.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  // Resolved here rather than fetched by the bar itself: the layout is already dynamic
  // and server-rendered, so an open table is known before the first paint.
  // A settling game is not over -- the host has started closing it, but every other
  // seat still has its own result to enter, so the strip has to keep leading back in.
  const activeGame = viewer
    ? ((await getGamesForDevice(viewer.person.id)).find(
        (game) => game.status === "active" || game.status === "settling",
      ) ?? null)
    : null;

  return (
    // `data-reduce-motion` mirrors the account setting for the CSS animations Framer
    // never sees -- the Radix enter/exit keyframes and the pulsing live dot.
    <html
      lang="he"
      dir="rtl"
      className={`${assistant.variable} ${rubik.variable} dark h-full antialiased`}
      {...(viewer?.person.reduceMotion ? { "data-reduce-motion": "true" } : {})}
    >
      <body className="text-foreground flex min-h-full flex-col items-center">
        <div className="app-shell flex w-full max-w-[450px] flex-1 flex-col">
          <DirectionProvider dir="rtl">
            <ViewerProvider viewer={viewer?.person ?? null}>
              <MotionPreferences
                hapticsEnabled={viewer?.person.hapticsEnabled ?? true}
                reduceMotion={viewer?.person.reduceMotion ?? false}
              >
                <PushServiceWorker />
                <LiveSessionBar game={activeGame} />
                {children}
                <TabBar />
              </MotionPreferences>
            </ViewerProvider>
          </DirectionProvider>
        </div>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
