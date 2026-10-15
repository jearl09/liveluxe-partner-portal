import { notFound } from "next/navigation";
import LoginPage from "@/app/(marketing)/login/page";
import { AuthShell } from "@/components/auth/auth-shell";
import { BrandMark, type MarkVariant } from "@/components/auth/brand-mark";
import { previewsAllowed } from "@/lib/preview";

export const metadata = { title: "Sign-in motion", robots: { index: false } };

const VARIANTS: { key: MarkVariant; name: string; note: string }[] = [
  {
    key: "draw",
    name: "A · Written in gold",
    note: "Drawn on stroke by stroke, the script L last, then one light catch.",
  },
  { key: "coin", name: "B · Coin turn", note: "One slow turn on its vertical axis, then the light catch." },
  { key: "assemble", name: "C · Monogram", note: "The strokes slide together into place, then the light catch." },
];

/**
 * /dev/sign-in-motion: the three monogram treatments side by side (DECISIONS #81), and each one on the real
 * sign-in screen with ?variant=draw|coin|assemble. Reload to replay. Dev and preview only; 404 in production.
 */
export default async function SignInMotionPage({ searchParams }: PageProps<"/dev/sign-in-motion">) {
  if (!previewsAllowed()) notFound();
  const { variant } = await searchParams;
  const chosen = VARIANTS.find((v) => v.key === variant);

  if (chosen) {
    return (
      <AuthShell markVariant={chosen.key} once={false}>
        <LoginPage searchParams={Promise.resolve({})} params={Promise.resolve({})} />
      </AuthShell>
    );
  }

  return (
    <main className="bg-background mx-auto w-full max-w-6xl px-4 py-10 lg:px-8">
      <h1 className="text-h1 font-serif">Sign-in motion</h1>
      <p className="text-text-secondary mt-2 max-w-prose">
        Three treatments of the monogram. Each plays once on load;{" "}
        <a href="/dev/sign-in-motion" className="underline underline-offset-2">
          reload to replay
        </a>
        . Open one to see it on the sign-in screen.
      </p>
      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {VARIANTS.map((v) => (
          <li key={v.key} className="border-subtle bg-surface rounded-card flex flex-col items-center border p-6">
            <BrandMark variant={v.key} className="h-44" />
            <h2 className="text-h3 mt-6 self-start">{v.name}</h2>
            <p className="text-text-secondary text-body-sm mt-1 self-start">{v.note}</p>
            <a
              href={`?variant=${v.key}`}
              className="text-text-gold mt-4 self-start text-sm font-medium underline underline-offset-2"
            >
              See it on the sign-in screen
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
