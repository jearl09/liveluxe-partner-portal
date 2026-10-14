import Link from "next/link";
import { Search, X } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { hasActiveFilters, type ListParams } from "@/lib/domain/list-params";
import { cn } from "@/lib/utils";

/**
 * Partner and search filters for the ops lists. A plain GET form, so the filtered
 * view is a URL: Back works, it can be pasted into Slack, and no state lives in the
 * browser. Keys the page owns (a status, a band) ride along as hidden inputs so
 * applying a search never drops them; the page resets to 1 because the old page
 * number means nothing under a new filter.
 */
export function ListFilters({
  action,
  params,
  orgs,
  carry = {},
  clearHref,
}: {
  action: string;
  params: ListParams;
  orgs: { id: string; name: string }[];
  /** Page-owned query keys to keep when the form is submitted. */
  carry?: Record<string, string | undefined>;
  clearHref: string;
}) {
  const active = hasActiveFilters(params);
  return (
    <form
      action={action}
      method="get"
      role="search"
      aria-label="Filter requests"
      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-end"
    >
      {Object.entries(carry).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      {params.pageSize !== 25 && <input type="hidden" name="pageSize" value={params.pageSize} />}
      <label className={labelClass}>
        Reference, claim, PO or guest
        <input
          name="q"
          type="search"
          defaultValue={params.q}
          placeholder="LLX-2026-000412, a claim number or a name"
          maxLength={80}
          autoComplete="off"
          className={`${fieldClass} mt-1`}
        />
      </label>
      <label className={labelClass}>
        Partner
        <select name="orgId" defaultValue={params.orgId ?? ""} className={`${fieldClass} mt-1`}>
          <option value="">All partners</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <SubmitButton variant="outline" pendingLabel="Filtering…" className="flex-1 sm:flex-none">
          <Search className="h-4 w-4" aria-hidden /> Filter
        </SubmitButton>
        {active && (
          <Link href={clearHref} className={cn(buttonVariants({ variant: "ghost" }), "flex-1 sm:flex-none")}>
            <X className="h-4 w-4" aria-hidden /> Clear
          </Link>
        )}
      </div>
    </form>
  );
}
