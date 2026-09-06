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
      { src: "/art/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // A separate crop, not the same file declared twice. Android clips roughly a fifth
      // off every edge of an adaptive icon, so the maskable one draws the mark at 56% of
      // the frame instead of 76% -- the previous manifest reused one full-bleed file for
      // both and lost the top of the artwork on every Android launcher.
      {
        src: "/art/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
