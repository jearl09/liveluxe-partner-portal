import { notFound, redirect } from "next/navigation";
import { RequestDetail } from "@/components/requests/request-detail";
import { getSessionClaims } from "@/lib/db/server";
import { env } from "@/lib/env";
import { getRequest } from "@/lib/requests/load";
import { loadRequestScreen } from "@/lib/requests/screen";

/** Tab title: reference and property only, never the guest (brief §5.13, §8.1). */
export async function generateMetadata({ params }: PageProps<"/requests/[id]">) {
  const { id } = await params;
  const d = await getRequest(id);
  return { title: d ? `${d.request.reference} · ${d.listing.name}` : "Request" };
}

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Partner request / booking (brief §8): the shared detail screen with the partner's permissions. */
export default async function RequestPage({ params, searchParams }: PageProps<"/requests/[id]">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  const { id } = await params;
  const sp = await searchParams;
  const s = await loadRequestScreen(id, claims, "partner");
  if (!s) notFound();
  return (
    <RequestDetail
      s={s}
      supportEmail={env().EMAIL_REPLY_TO}
      flash={{
        done: str(sp.submitted) ? (str(sp.finance) ? "finance_review" : "1") : str(sp.done),
        error: str(sp.error),
        detail: str(sp.detail),
        ref: str(sp.ref),
      }}
    />
  );
}
