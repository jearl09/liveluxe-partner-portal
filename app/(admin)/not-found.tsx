import Link from "next/link";
import { Trouble } from "@/components/layout/trouble";
import { Button } from "@/components/ui/button";

/** A booking, partner or rate card that does not exist, or an ID that is not one. */
export default function AdminNotFound() {
  return (
    <Trouble eyebrow="Not found" title="We couldn't find that">
      <p>The link may be out of date, or the ID is not valid. Nothing has been changed.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/admin/queue">Back to the queue</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/bookings">All bookings</Link>
        </Button>
      </div>
    </Trouble>
  );
}
