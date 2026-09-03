import type { MetadataRoute } from "next";

/** Installable app metadata. Colours are sampled from the rendered tokens so the
 * launch splash matches the app instead of flashing the old light ground. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "פוקר | הקופה שלנו",
    short_name: "פוקר",
    description: "מעקב אחרי הקופה וסגירת החשבון בערב פוקר ביתי",
    lang: "he",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    // Sampled from --background and --felt. The previous value was the old cream
    // palette, so the splash screen flashed light before the dark app painted.
    background_color: "#080305",
    theme_color: "#9f1228",
    icons: [
      // One 1024px source, declared at its real size. "any" keeps the full artwork;
      // "maskable" is safe because the chip was generated with padding to survive
      // being cropped to a circle or squircle.
      { src: "/art/icon-premium.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/art/icon-premium.png", sizes: "1024x1024", type: "image/png", purpose: "maskable" },
    ],
  };
}
