import Link from "next/link";
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
      className={cn("flex shrink-0 items-baseline gap-2 whitespace-nowrap", className)}
      aria-label="Live Luxe home"
    >
      <span className={cn("font-serif text-[1.375rem] leading-none", tone === "dark" ? "text-white" : "text-navy-900")}>
        Live Luxe
      </span>
      {descriptor && <span className="eyebrow">{descriptor}</span>}
    </Link>
  );
}
