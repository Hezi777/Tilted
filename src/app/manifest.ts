import type { MetadataRoute } from "next";

/** Installable app metadata. Colours are the app's own tokens, so the launch splash
 * matches what paints a moment later instead of flashing something else first. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tilted Poker",
    short_name: "Tilted",
    description: "מעקב אחרי הקופה וסגירת החשבון בערב פוקר ביתי",
    lang: "he",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    // --ink-950 and --light: the ground the app actually paints, and the mark on it.
    background_color: "#0b0b0f",
    theme_color: "#0b0b0f",
    icons: [
      // Chrome's install prompt requires a 192; the 512 drives the splash.
      { src: "/art/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/art/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Separate files, not the same one declared twice. An adaptive launcher clips to a
      // circle, a squircle or a square depending on the device, and only a circle of 80%
      // diameter is guaranteed to survive -- so the maskable pair draws the mark smaller.
      // Declaring a full-bleed icon as maskable is what loses the roof on Android.
      {
        src: "/art/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/art/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
