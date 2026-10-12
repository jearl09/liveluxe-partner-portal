import Link from "next/link";
import { BedDouble, Bath, Users, PawPrint } from "lucide-react";
import { formatMoney } from "@/lib/domain/money";
import type { SearchResultItem } from "@/lib/listings/load";

function Price({ item }: { item: SearchResultItem }) {
  if (item.price) {
    if (!item.price.quotable) {
      return (
        <p className="text-foreground text-sm">
          <span className="font-medium">Price on application</span>
          <span className="text-muted-foreground block text-xs">Some nights are not rated yet</span>
        </p>
      );
    }
    return (
      <p className="text-sm">
        <span className="text-strong font-medium">{formatMoney(item.price.nightlyAverageCents, item.currency)}</span>
        <span className="text-muted-foreground"> avg / night</span>
        <span className="text-muted-foreground block text-xs">
          {formatMoney(item.price.accommodationCents, item.currency)} for {item.price.nights} nights, before fees
        </span>
      </p>
    );
  }
  if (item.basePriceCents) {
    return (
      <p className="text-sm">
        <span className="text-muted-foreground">from </span>
        <span className="text-strong font-medium">{formatMoney(item.basePriceCents, item.currency)}</span>
        <span className="text-muted-foreground"> / night</span>
        <span className="text-muted-foreground block text-xs">Add dates for live pricing</span>
      </p>
    );
  }
  return <p className="text-muted-foreground text-sm">Rates on request</p>;
}

/** One search result. The whole card is the link; facts use icons plus text, never icons alone (§13.5). */
export function ResultCard({ item, href }: { item: SearchResultItem; href: string }) {
  const place = [item.suburb, item.state].filter(Boolean).join(", ");
  return (
    <li className="border-border group bg-card relative overflow-hidden rounded-lg border">
      <div className="bg-muted aspect-[4/3] w-full overflow-hidden">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Hostaway CDN, arbitrary host
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">No photo yet</div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div>
          <h3 className="text-strong font-serif text-xl leading-tight">
            <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
              {item.name}
            </Link>
          </h3>
          {place && <p className="text-muted-foreground text-xs">{place}</p>}
        </div>
        <ul className="text-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {item.bedrooms !== null && (
            <li className="flex items-center gap-1">
              <BedDouble className="h-3.5 w-3.5" aria-hidden /> {item.bedrooms} bed
            </li>
          )}
          {item.bathrooms !== null && (
            <li className="flex items-center gap-1">
              <Bath className="h-3.5 w-3.5" aria-hidden /> {Number(item.bathrooms)} bath
            </li>
          )}
          {item.maxGuests !== null && (
            <li className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden /> sleeps {item.maxGuests}
            </li>
          )}
          {item.maxPets > 0 && (
            <li className="flex items-center gap-1">
              <PawPrint className="h-3.5 w-3.5" aria-hidden /> pets ok
            </li>
          )}
        </ul>
        <Price item={item} />
      </div>
    </li>
  );
}
