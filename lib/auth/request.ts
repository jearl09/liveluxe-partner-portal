/** Small request helpers shared by the auth Route Handlers. */

/** Client IP as seen by Vercel's edge (first hop of X-Forwarded-For). "unknown" locally. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function userAgent(req: Request): string | null {
  return req.headers.get("user-agent");
}

/** Reads string fields from a form post, trimming and defaulting to "". */
export async function formFields<K extends string>(req: Request, keys: readonly K[]): Promise<Record<K, string>> {
  const form = await req.formData();
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = String(form.get(k) ?? "").trim();
  return out;
}

/** 303 redirect to a same-origin path, with query parameters. */
export function redirectTo(req: Request, path: string, params?: Record<string, string | undefined>) {
  const url = new URL(path, new URL(req.url).origin);
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, v);
  return Response.redirect(url.toString(), 303);
}

/**
 * 303 redirect that also sets a short-lived, HttpOnly cookie the destination page
 * reads once (e.g. an invitation link when email is not configured). Never put
 * secrets in the query string: URLs end up in logs and browser history.
 */
export function redirectWithCookie(
  req: Request,
  path: string,
  params: Record<string, string | undefined>,
  cookie: { name: string; value: string; maxAgeSeconds: number },
) {
  const url = new URL(path, new URL(req.url).origin);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, v);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.toString(),
      "Set-Cookie": `${cookie.name}=${encodeURIComponent(cookie.value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${cookie.maxAgeSeconds}${secure}`,
    },
  });
}
