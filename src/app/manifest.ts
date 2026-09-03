import type { MetadataRoute } from "next";

/** Installable app metadata. The 1024px source is served at both standard PWA sizes. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "פוקר — הקופה שלנו",
    short_name: "פוקר",
    description: "מעקב אחרי הקופה וסגירת החשבון בערב פוקר ביתי",
    lang: "he",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f2e8",
    theme_color: "#0b3d2e",
    icons: [
      { src: "/art/icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/art/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
