"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The route-level boundary. Anything thrown while rendering a screen lands here instead
 * of on Next's default English page.
 */
export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-5 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="t-heading">משהו השתבש</h1>
        <p className="t-body ink-3 max-w-[34ch]">
          הכניסות והריבאיים נשמרו. אפשר לנסות לטעון את המסך מחדש.
        </p>
      </div>
      <div className="flex w-full max-w-[18rem] flex-col gap-2">
        <Button type="button" onClick={reset}>
          <RefreshCwIcon aria-hidden="true" /> נסו שוב
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">חזרה לבית</Link>
        </Button>
      </div>
      {error.digest ? (
        <p className="t-caption ink-3" dir="ltr">
          {error.digest}
        </p>
      ) : null}
    </main>
  );
}
