import { notFound, redirect } from "next/navigation";
import { RequestDetail } from "@/components/requests/request-detail";
import { getSessionClaims } from "@/lib/db/server";
import { env } from "@/lib/env";
import { getRequest } from "@/lib/requests/load";
import { loadRequestScreen } from "@/lib/requests/screen";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/admin/bookings/[id]">) {
  const { id } = await params;
  const d = await getRequest(id);
  return { title: d ? `${d.request.reference} · ${d.listing.name}` : "Booking" };
}

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Ops request / booking (brief §8): the shared detail screen with Live Luxe permissions. */
export default async function AdminBookingPage({ params, searchParams }: PageProps<"/admin/bookings/[id]">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  const { id } = await params;
  const sp = await searchParams;
  const s = await loadRequestScreen(id, claims, "ops");
  if (!s) notFound();
  return (
    <RequestDetail
      s={s}
      supportEmail={env().EMAIL_REPLY_TO}
      flash={{ done: str(sp.done), error: str(sp.error), detail: str(sp.detail), ref: str(sp.ref) }}
    />
  );
}
