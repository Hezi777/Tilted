import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import { DirectionProvider } from "@/components/ui/direction";
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
const rubik = Rubik({
  variable: "--font-app",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
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
  maximumScale: 1,
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
  const activeGame = viewer
    ? ((await getGamesForDevice(viewer.person.id)).find(
        (game) => game.status === "active",
      ) ?? null)
    : null;

  return (
    <html
      lang="he"
      dir="rtl"
      className={`${rubik.variable} dark h-full antialiased`}
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
