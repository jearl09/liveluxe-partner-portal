import { MapPin } from "lucide-react";
import { guestsSummary } from "@/lib/domain/requests";
import { formatDate } from "@/lib/utils";

/** Property + dates + guests summary used on the submission form and both detail pages. */
export function StayCard({
  listing,
  checkIn,
  checkOut,
  nights,
  adults,
  childGuests,
  pets,
}: {
  listing: { name: string; suburb: string | null; state: string | null; imageUrl: string | null };
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  childGuests: number;
  pets: number;
}) {
  const place = [listing.suburb, listing.state].filter(Boolean).join(", ");
  return (
    <div className="border-cream-200 flex gap-4 rounded-xl border bg-white p-4">
      <div className="bg-cream-100 h-20 w-28 shrink-0 overflow-hidden rounded-lg">
        {listing.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- Hostaway CDN
          <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 text-sm">
        <p className="text-navy-900 font-serif text-xl leading-tight">{listing.name}</p>
        {place && (
          <p className="text-ink-500 flex items-center gap-1 text-xs">
            <MapPin className="h-3 w-3" aria-hidden /> {place}
          </p>
        )}
        <p className="text-ink-700 mt-2">
          {formatDate(checkIn)} → {formatDate(checkOut)} · {nights} {nights === 1 ? "night" : "nights"}
        </p>
        <p className="text-ink-500 text-xs">{guestsSummary(adults, childGuests, pets)}</p>
      </div>
    </div>
  );
}
