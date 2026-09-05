import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Without this file a bad URL fell through to Next's built-in page: English, LTR and
 * light, which in a Hebrew dark app reads as the app having crashed.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-5 py-16 text-center">
      <p className="t-display text-[var(--text-2)]">404</p>
      <div className="flex flex-col gap-2">
        <h1 className="t-heading">הדף הזה לא קיים</h1>
        <p className="t-body ink-3 max-w-[34ch]">
          אולי הקישור ישן, או שהשולחן כבר נסגר.
        </p>
      </div>
      <Button asChild className="h-12 px-6">
        <Link href="/">חזרה לבית</Link>
      </Button>
    </main>
  );
}
