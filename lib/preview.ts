/**
 * Where design-review previews (`/dev/*`, sample data, no session) may render.
 * Allowed in local development and on Vercel preview deployments; everywhere else —
 * including a production build on a host that sets no VERCEL_ENV — they 404, and
 * the proxy keeps them behind sign-in as well. `DEV_PREVIEWS=1` is the explicit
 * override for a non-Vercel review environment.
 */
export function previewsAllowed(): boolean {
  return (
    process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview" || process.env.DEV_PREVIEWS === "1"
  );
}
