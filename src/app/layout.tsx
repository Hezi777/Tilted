import type { Metadata, Viewport } from "next";
import { Assistant, IBM_Plex_Sans, Suez_One } from "next/font/google";
import { DirectionProvider } from "@/components/ui/direction";
import { ViewerProvider } from "@/components/ViewerProvider";
import { LiveSessionBar } from "@/components/shell/LiveSessionBar";
import { TabBar } from "@/components/shell/TabBar";
import { getGamesForDevice } from "@/db/queries";
import { getViewer } from "@/lib/auth/session";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

const suezOne = Suez_One({
  variable: "--font-display",
  subsets: ["hebrew", "latin"],
  weight: "400",
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-numerals",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0809",
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
  const activeGame = viewer
    ? ((await getGamesForDevice(viewer.person.id)).find(
        (game) => game.status === "active",
      ) ?? null)
    : null;

  return (
    <html
      lang="he"
      dir="rtl"
      className={`${assistant.variable} ${suezOne.variable} ${ibmPlexSans.variable} h-full antialiased`}
    >
      <body className="text-foreground flex min-h-full flex-col items-center">
        <div className="app-shell flex w-full max-w-[450px] flex-1 flex-col">
          <DirectionProvider dir="rtl">
            <ViewerProvider viewer={viewer?.person ?? null}>
              <LiveSessionBar game={activeGame} />
              {children}
              <TabBar />
            </ViewerProvider>
          </DirectionProvider>
        </div>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
