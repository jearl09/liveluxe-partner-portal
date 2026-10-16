import { Building2 } from "lucide-react";
import { Photo } from "@/components/ui/photo";
import { canOptimiseImage } from "@/lib/listings/images";
import { cn } from "@/lib/utils";

/**
 * A small photo of the apartment beside its name on the dashboard, so a place is recognised at a glance. The name
 * next to it carries the meaning, so the photo is decorative. No photo, or one that will not load: a quiet building glyph on the inset tone.
 */
export function PropertyThumb({
  url,
  size = 40,
  className,
}: {
  url: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const glyph = <Building2 className="text-text-muted absolute inset-0 m-auto h-4 w-4" />;
  return (
    <span
      aria-hidden
      className={cn("bg-inset rounded-control relative block shrink-0 overflow-hidden", className)}
      style={{ width: size, height: size }}
    >
      {url ? (
        <Photo
          src={url}
          alt=""
          fill
          sizes={`${size * 2}px`}
          unoptimized={!canOptimiseImage(url)}
          className="object-cover"
          fallback={glyph}
        />
      ) : (
        glyph
      )}
    </span>
  );
}
