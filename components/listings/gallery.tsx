import type { ListingImage } from "@/lib/listings/load";

/** Hero plus up to four thumbnails. Images come from Hostaway's CDN. */
export function Gallery({ images, name }: { images: ListingImage[]; name: string }) {
  const [hero, ...rest] = images;
  if (!hero) {
    return (
      <div className="bg-cream-100 border-cream-200 text-ink-500 flex aspect-[21/9] items-center justify-center rounded-xl border text-sm">
        Photos arrive with the next catalogue sync
      </div>
    );
  }
  const thumbs = rest.slice(0, 4);
  return (
    <div className="grid gap-2 md:grid-cols-[3fr_2fr]">
      <div className="bg-cream-100 aspect-[4/3] overflow-hidden rounded-xl md:aspect-auto md:h-[420px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- Hostaway CDN, arbitrary host */}
        <img src={hero.url} alt={hero.caption ?? name} className="h-full w-full object-cover" />
      </div>
      {thumbs.length > 0 && (
        <ul className="hidden grid-cols-2 gap-2 md:grid">
          {thumbs.map((img) => (
            <li key={img.url} className="bg-cream-100 h-[206px] overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- Hostaway CDN, arbitrary host */}
              <img src={img.url} alt={img.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
