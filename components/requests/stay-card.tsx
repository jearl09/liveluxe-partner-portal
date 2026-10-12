import { MapPin } from "lucide-react";
import { guestsSummary } from "@/lib/domain/requests";
import { cn, formatDate } from "@/lib/utils";

/**
 * Property + dates + guests summary used on the submission form and both detail pages.
 * `plain` drops the card chrome so it can sit as the first section of a larger panel.
 */
export function StayCard({
  listing,
  checkIn,
  checkOut,
  nights,
  adults,
  childGuests,
  pets,
  plain = false,
}: {
  listing: { name: string; suburb: string | null; state: string | null; imageUrl: string | null };
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  childGuests: number;
  pets: number;
  plain?: boolean;
}) {
  const place = [listing.suburb, listing.state].filter(Boolean).join(", ");
  return (
    <div className={cn("flex gap-4", !plain && "border-border bg-card rounded-lg border p-4")}>
      <div className="bg-muted h-20 w-28 shrink-0 overflow-hidden rounded-lg">
        {listing.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- Hostaway CDN
          <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 text-sm">
        <p className="text-strong font-serif text-xl leading-tight">{listing.name}</p>
        {place && (
          <p className="text-muted-foreground flex items-center gap-1 text-xs">
            <MapPin className="h-3 w-3" aria-hidden /> {place}
          </p>
        )}
        <p className="text-foreground mt-2">
          {formatDate(checkIn)} → {formatDate(checkOut)} · {nights} {nights === 1 ? "night" : "nights"}
        </p>
        <p className="text-muted-foreground text-xs">{guestsSummary(adults, childGuests, pets)}</p>
      </div>
    </div>
  );
}
