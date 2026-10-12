import Link from "next/link";
import { Trouble } from "@/components/layout/trouble";
import { Button } from "@/components/ui/button";

/** A request, listing or page the partner asked for that is not theirs or does not exist. */
export default function PortalNotFound() {
  return (
    <Trouble eyebrow="Not found" title="We couldn't find that">
      <p>
        The link may be out of date, or the reference may belong to another organisation. Check the reference and try
        again.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/requests">Your requests</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/search">Search availability</Link>
        </Button>
      </div>
    </Trouble>
  );
}
