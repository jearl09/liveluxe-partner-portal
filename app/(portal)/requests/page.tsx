import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Flash } from "@/components/requests/flash";
import { RequestsTable } from "@/components/requests/requests-table";
import { ListPagination } from "@/components/ui/list-pagination";
import { listQueryString, parseListParams } from "@/lib/domain/list-params";
import { getSessionClaims } from "@/lib/db/server";
import { listRequests } from "@/lib/requests/load";
import { cn } from "@/lib/utils";

export const metadata = { title: "Requests" };

const TABS = [
  { key: "open", label: "Open" },
  { key: "upcoming", label: "Upcoming stays" },
  { key: "history", label: "History" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/** Partner's requests (§13.1 /requests): open items first, then confirmed stays, then the past. */
export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  const sp = await searchParams;
  const tabRaw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = (TABS.some((t) => t.key === tabRaw) ? tabRaw : "open") as Tab;
  const params = parseListParams(sp);
  const page = await listRequests({ bucket: tab, page: params.page, pageSize: params.pageSize });
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const href = (patch: Partial<typeof params>) =>
    `/requests${listQueryString({ page: params.page, pageSize: params.pageSize, ...patch }, { tab: tab === "open" ? undefined : tab })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Requests"
        title="Booking requests"
        description="Everything your organisation has asked for, and where each request stands."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/search">
              <Search className="h-3.5 w-3.5" aria-hidden /> New search
            </Link>
          </Button>
        }
      />
      <Flash error={error} />
      <nav aria-label="Request filters" className="border-border flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "open" ? "/requests" : `/requests?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring -mb-px rounded-t-sm border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
              tab === t.key
                ? "border-accent text-strong font-medium"
                : "text-muted-foreground hover:text-strong border-transparent",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <RequestsTable
        rows={page.rows}
        hrefFor={(r) => `/requests/${r.id}`}
        emptyTitle={
          tab === "open" ? "Nothing open right now" : tab === "upcoming" ? "No upcoming stays" : "No past requests yet"
        }
        emptyHint={
          tab === "open"
            ? "Search availability, price a stay and submit a request. It will track here."
            : "Approved and confirmed stays appear here once Live Luxe has said yes."
        }
      />
      <ListPagination
        page={page}
        noun="request"
        hrefFor={(p) => href({ page: p })}
        sizeHrefFor={(s) => href({ pageSize: s as 25 | 50 | 100, page: 1 })}
      />
    </div>
  );
}
