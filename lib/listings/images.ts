/**
 * Listing photos come from Hostaway's own storage. Only its /listing/ path is allowed through the Next.js
 * image optimiser (next.config `images.remotePatterns`); a photo from anywhere else renders as-is
 * rather than failing the page.
 */
export const HOSTAWAY_IMAGE_HOST = "hostaway-platform.s3.us-west-2.amazonaws.com";

export function canOptimiseImage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === HOSTAWAY_IMAGE_HOST && u.pathname.startsWith("/listing/");
  } catch {
    return false;
  }
}
