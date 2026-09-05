"use client";

/**
 * The last resort: a failure in the root layout itself, where no fonts, tokens or
 * providers are available. It must ship its own document and its own colours.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.25rem",
          padding: "2rem",
          textAlign: "center",
          background: "#0b0809",
          color: "#f5ede6",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.375rem", margin: 0 }}>האפליקציה נתקלה בתקלה</h1>
        <p style={{ margin: 0, color: "#b8a9a2", maxWidth: "34ch" }}>
          שום נתון לא אבד. נסו לטעון מחדש.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: "3rem",
            padding: "0 1.5rem",
            borderRadius: "14px",
            border: "none",
            background: "#94131e",
            color: "#f5ede6",
            fontSize: "1rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          נסו שוב
        </button>
        {error.digest ? (
          <p style={{ margin: 0, color: "#7a6b67", fontSize: "0.8125rem" }} dir="ltr">
            {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
