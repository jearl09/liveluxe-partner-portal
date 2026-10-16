import Link from "next/link";
import { Bath, BedDouble, PawPrint, Users } from "lucide-react";
import { formatMoney } from "@/lib/domain/money";
import { Photo } from "@/components/ui/photo";
import { canOptimiseImage } from "@/lib/listings/images";
import type { SearchResultItem } from "@/lib/listings/load";

/**
 * One search result (brief §7.3). Pricing shows only when dates are set: the nightly
 * average and the accommodation for the stay. With no dates the price area says
 * "Add dates for pricing" — never a "from" price. The whole card is the link. `eager` marks the
 * first row, whose photo is the page's largest paint, so it loads first instead of lazily.
 */
export function ResultCard({
  item,
  href,
  nights,
  eager = false,
}: {
  item: SearchResultItem;
  href: string;
  nights: number;
  eager?: boolean;
}) {
  const place = [item.suburb, item.state].filter(Boolean).join(", ");
  const money = (c: number) => formatMoney(c, item.currency);
  return (
    <li className="group border-subtle bg-surface rounded-card hover:border-strong-border focus-within:outline-focus relative flex flex-col overflow-hidden border transition-colors duration-150 focus-within:outline-2 focus-within:outline-offset-2">
      <div className="bg-inset relative aspect-[4/3] w-full overflow-hidden">
        {item.imageUrl ? (
          <Photo
            src={item.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1280px) 420px, (min-width: 640px) 50vw, 100vw"
            unoptimized={!canOptimiseImage(item.imageUrl)}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
            fallback={
              <div className="text-text-muted text-body-sm flex h-full items-center justify-center">No photo yet</div>
            }
          />
        ) : (
          <div className="text-text-muted text-body-sm flex h-full items-center justify-center">No photo yet</div>
        )}
        {item.maxPets > 0 && (
          <span className="bg-surface/95 text-text-primary text-body-sm rounded-pill absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 font-semibold">
            <PawPrint className="h-3.5 w-3.5" aria-hidden /> Pets welcome
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-text-primary text-h3 leading-tight font-semibold">
            <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
              {item.name}
            </Link>
          </h3>
          {place && <p className="text-text-muted text-body-sm mt-0.5">{place}</p>}
        </div>
        <ul className="text-text-secondary text-body-sm flex flex-wrap gap-x-3 gap-y-1">
          {item.bedrooms !== null && (
            <li className="inline-flex items-center gap-1">
              <BedDouble className="h-4 w-4" aria-hidden /> {item.bedrooms} {item.bedrooms === 1 ? "bed" : "beds"}
            </li>
          )}
          {item.bathrooms !== null && (
            <li className="inline-flex items-center gap-1">
              <Bath className="h-4 w-4" aria-hidden /> {Number(item.bathrooms)}{" "}
              {Number(item.bathrooms) === 1 ? "bath" : "baths"}
            </li>
          )}
          {item.maxGuests !== null && (
            <li className="inline-flex items-center gap-1">
              <Users className="h-4 w-4" aria-hidden /> Sleeps {item.maxGuests}
            </li>
          )}
        </ul>
        <div className="border-subtle mt-auto border-t pt-3">
          {!item.price ? (
            <p className="text-text-muted text-body-sm">Add dates for pricing</p>
          ) : !item.price.quotable ? (
            <p className="text-body-sm">
              <span className="text-text-primary font-semibold">Price on application</span>
              <span className="text-text-muted block">Some nights are not priced yet. Open it to ask for a quote.</span>
            </p>
          ) : (
            <div className="flex items-end justify-between gap-3">
              <p className="text-body-sm">
                <span className="text-text-primary text-body font-semibold tabular-nums">
                  {money(item.price.nightlyAverageCents)}
                </span>
                <span className="text-text-muted"> avg/night</span>
                <span className="text-text-secondary block tabular-nums">
                  {money(item.price.accommodationCents)} · {nights} {nights === 1 ? "night" : "nights"}, before fees
                </span>
              </p>
              <span className="bg-success-bg text-success-fg border-success-border rounded-pill text-body-sm shrink-0 border px-2.5 py-0.5 font-semibold">
                Available
              </span>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
