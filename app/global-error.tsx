"use client";

/**
 * Last resort: the root layout itself failed, so there is no stylesheet, font or
 * theme to lean on. Plain markup in the brand colours, honouring the OS theme.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-AU">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#faf7f1",
          color: "#2b3442",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <style>{`@media (prefers-color-scheme: dark){body{background:#0b1422!important;color:#c9d1dd!important}h1{color:#f3f5f8!important}}`}</style>
        <main style={{ maxWidth: 440, padding: "0 1.5rem" }}>
          <p
            style={{
              color: "#b7853a",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            Live Luxe · Partner portal
          </p>
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontWeight: 500,
              fontSize: 30,
              margin: "0.5rem 0 1rem",
              color: "#101c2c",
            }}
          >
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            The page could not be shown. Try again in a moment.
            {error.digest && (
              <>
                {" "}
                Reference <code style={{ fontFamily: "ui-monospace, monospace" }}>{error.digest}</code>.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1rem",
              background: "#101c2c",
              color: "#fff",
              border: 0,
              borderRadius: 10,
              padding: "0.75rem 1.25rem",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
