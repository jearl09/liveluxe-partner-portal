import Link from "next/link";
import { Wordmark } from "@/components/layout/brand";
import { Trouble } from "@/components/layout/trouble";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

/**
 * Unknown routes anywhere in the app. Renders outside the signed-in shell because we
 * do not know who is asking; "/" takes a signed-in user to their own home and
 * everyone else to sign in.
 */
export default function NotFound() {
  return (
    <div className="bg-background flex min-h-screen flex-col px-4 py-6 md:px-6">
      <header>
        <Wordmark descriptor="Partner portal" />
      </header>
      <main className="flex flex-1 items-center">
        <Trouble eyebrow="Error 404" title="That page doesn't exist" className="py-8">
          <p>The address may be mistyped, or the page has moved. Nothing has been changed.</p>
          <Button asChild className="mt-4">
            <Link href="/">Back to the portal</Link>
          </Button>
        </Trouble>
      </main>
    </div>
  );
}
