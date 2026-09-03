import type { Metadata } from "next";
import JoinPage from "../page";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/codes";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const code = normalizeRoomCode((await params).code);
  const validCode = isValidRoomCode(code) ? code : "";
  const title = validCode ? `הזמנה לשולחן ${validCode}` : "הזמנה לשולחן";
  const description = "השולחן כבר פתוח. בוחרים את השם והדמות ומצטרפים לערב.";

  return {
    title: `${title} | Tilted Poker`,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: "/art/neon-hero.webp", width: 1200, height: 676, alt: "Tilted Poker" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/art/neon-hero.webp"],
    },
  };
}

export default function InvitePage() {
  return <JoinPage />;
}
