import type { Metadata, Viewport } from "next";
import { Assistant } from "next/font/google";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Hebrew face. Satoshi (Latin + numerals) is loaded from the Fontshare CSS API in
// <head> below -- its licence permits CDN use but not self-hosting the webfont files.
const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "פוקר",
  description: "מעקב אחרי כניסות, ריבייים וסגירת חשבון בערב פוקר ביתי",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0b3d2e",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${assistant.variable} h-full antialiased`}
    >
      <head>
        <link
          rel="preconnect"
          href="https://api.fontshare.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap"
        />
      </head>
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <DirectionProvider dir="rtl">{children}</DirectionProvider>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
