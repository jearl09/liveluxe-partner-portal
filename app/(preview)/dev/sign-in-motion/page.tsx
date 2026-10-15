import { notFound } from "next/navigation";
import LoginPage from "@/app/(marketing)/login/page";
import { AuthShell } from "@/components/auth/auth-shell";
import { previewsAllowed } from "@/lib/preview";

export const metadata = { title: "Sign-in motion", robots: { index: false } };

/**
 * /dev/sign-in-motion: the sign-in page with the once-per-visit flag off, so the monogram is written on every
 * load (DECISIONS #81–82). Reload to replay. Dev and preview only; 404 in production.
 */
export default async function SignInMotionPage() {
  if (!previewsAllowed()) notFound();
  return (
    <AuthShell once={false}>
      <LoginPage searchParams={Promise.resolve({})} params={Promise.resolve({})} />
    </AuthShell>
  );
}
