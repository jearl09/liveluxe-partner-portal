"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SEARCH_SORT_LABELS, SEARCH_SORTS, type SearchSort } from "@/lib/domain/search";
import { fieldClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** Result order (brief §7.3). Changes the URL; price sorts are offered only with dates. */
export function SortSelect({ value, hasDates }: { value: SearchSort; hasDates: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const options = SEARCH_SORTS.filter((s) => hasDates || !s.startsWith("price"));
  return (
    <label className="text-text-secondary text-body-sm inline-flex items-center gap-2 font-semibold">
      Sort
      <select
        value={options.includes(value) ? value : "best"}
        aria-busy={pending}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === "best") next.delete("sort");
          else next.set("sort", e.target.value);
          next.delete("page");
          const qs = next.toString();
          start(() => router.push(qs ? `${pathname}?${qs}` : pathname));
        }}
        className={cn(fieldClass, "w-auto min-w-44 py-1.5", pending && "opacity-60")}
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {SEARCH_SORT_LABELS[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
