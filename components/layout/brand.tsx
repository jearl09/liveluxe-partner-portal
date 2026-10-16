import Link from "next/link";
import { MARK_SHAPES, MARK_VIEWBOX } from "@/components/auth/brand-mark-data";
import { cn } from "@/lib/utils";

/** "Live Luxe" wordmark with a gold small-caps descriptor, as on the public site header. */
export function Wordmark({
  descriptor,
  href = "/",
  tone = "light",
  className,
}: {
  descriptor?: string;
  href?: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("flex shrink-0 items-center gap-2.5 whitespace-nowrap", className)}
      aria-label={descriptor ? `Live Luxe ${descriptor}, home` : "Live Luxe home"}
    >
      {/* The monogram from the sign-in page, small and still, so the app reads as the same product. */}
      <svg
        viewBox={`0 0 ${MARK_VIEWBOX.w} ${MARK_VIEWBOX.h}`}
        className="text-gold h-7 w-auto shrink-0"
        fill="currentColor"
        fillRule="evenodd"
        aria-hidden
      >
        {MARK_SHAPES.map((m) => (
          <path key={m.id} d={m.d} />
        ))}
      </svg>
      <span className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-serif text-[1.375rem] leading-none",
            tone === "dark" ? "text-on-navy" : "text-text-primary",
          )}
        >
          Live Luxe
        </span>
        {descriptor && (
          <span className={cn("eyebrow hidden min-[400px]:inline", tone === "dark" && "eyebrow-on-navy")}>
            {descriptor}
          </span>
        )}
      </span>
    </Link>
  );
}
