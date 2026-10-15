import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/auth-shell";

/** Public auth surfaces: login, invite acceptance, password reset, MFA (§13.1). The frame lives in AuthShell. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
