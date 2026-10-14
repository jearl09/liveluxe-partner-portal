"use client";

import { useCallback, useEffect, useState } from "react";
import * as D from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import type { ListingImage } from "@/lib/listings/load";
import { cn } from "@/lib/utils";

/**
 * Gallery (brief §7.4): one large photo and four beside it, every one opening a
 * lightbox. In the lightbox the arrow keys move, Escape closes, focus returns to the
 * photo that opened it, and each photo carries its caption and position.
 */
export function Gallery({ images, name }: { images: ListingImage[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const count = images.length;
  const move = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + count) % count)), [count]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, move]);

  if (count === 0) {
    return (
      <div className="bg-inset border-subtle text-text-muted rounded-card flex aspect-[21/9] items-center justify-center border">
        Photos arrive with the next catalogue sync
      </div>
    );
  }
  const [hero, ...rest] = images;
  const thumbs = rest.slice(0, 4);
  const current = open === null ? null : images[open];
  const tile =
    "group bg-inset relative block h-full w-full overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

  return (
    <>
      <div className="grid gap-2 md:grid-cols-[3fr_2fr]">
        <button
          type="button"
          onClick={() => setOpen(0)}
          className={cn(tile, "rounded-card aspect-[4/3] md:aspect-auto md:h-[420px]")}
          aria-label={`Open photo 1 of ${count}${hero!.caption ? `: ${hero!.caption}` : ""}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Hostaway CDN, arbitrary host */}
          <img
            src={hero!.url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.01]"
          />
          <span className="bg-surface/95 text-text-primary text-body-sm rounded-pill absolute right-3 bottom-3 inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold md:hidden">
            <Images className="h-4 w-4" aria-hidden /> {count} photos
          </span>
        </button>
        {thumbs.length > 0 && (
          <ul className="hidden grid-cols-2 grid-rows-2 gap-2 md:grid md:h-[420px]">
            {thumbs.map((img, i) => (
              <li key={img.url} className="min-h-0">
                <button
                  type="button"
                  onClick={() => setOpen(i + 1)}
                  className={cn(tile, "rounded-card")}
                  aria-label={`Open photo ${i + 2} of ${count}${img.caption ? `: ${img.caption}` : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Hostaway CDN, arbitrary host */}
                  <img
                    src={img.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                  />
                  {i === thumbs.length - 1 && count > 5 && (
                    <span className="bg-navy/60 text-on-navy absolute inset-0 flex items-center justify-center font-semibold">
                      +{count - 5} more
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <D.Root open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <D.Portal>
          <D.Overlay className="anim-fade bg-navy-950/90 fixed inset-0 z-50" />
          <D.Content className="fixed inset-0 z-50 flex flex-col p-4 outline-none sm:p-8">
            <div className="text-on-navy flex items-center justify-between gap-4">
              <D.Title className="text-body font-semibold">
                {name} · photo {open !== null ? open + 1 : 0} of {count}
              </D.Title>
              <D.Close
                className="rounded-control hover:bg-navy-800 focus-visible:outline-focus inline-flex h-11 w-11 items-center justify-center focus-visible:outline-2"
                aria-label="Close photos"
              >
                <X className="h-6 w-6" aria-hidden />
              </D.Close>
            </div>
            <D.Description className="sr-only">Use the left and right arrow keys to move between photos.</D.Description>
            <div className="relative flex min-h-0 flex-1 items-center justify-center py-4">
              {current && (
                // eslint-disable-next-line @next/next/no-img-element -- Hostaway CDN, arbitrary host
                <img
                  src={current.url}
                  alt={current.caption ?? `${name}, photo ${open! + 1}`}
                  className="max-h-full max-w-full rounded-[4px] object-contain"
                />
              )}
              {count > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => move(-1)}
                    aria-label="Previous photo"
                    className="bg-surface/90 text-text-primary rounded-pill focus-visible:outline-focus absolute left-0 inline-flex h-11 w-11 items-center justify-center focus-visible:outline-2"
                  >
                    <ChevronLeft className="h-6 w-6" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(1)}
                    aria-label="Next photo"
                    className="bg-surface/90 text-text-primary rounded-pill focus-visible:outline-focus absolute right-0 inline-flex h-11 w-11 items-center justify-center focus-visible:outline-2"
                  >
                    <ChevronRight className="h-6 w-6" aria-hidden />
                  </button>
                </>
              )}
            </div>
            {current?.caption && <p className="text-on-navy-muted text-center">{current.caption}</p>}
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}
