"use client";

import { Printer } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Opens the browser's print dialog, which is also how a request becomes a PDF
 * ("Save as PDF" is a destination in every modern browser). The page's print
 * stylesheet does the rest; nothing is generated server-side.
 */
export function PrintButton({ children = "Print / Save as PDF", ...rest }: Omit<ButtonProps, "onClick" | "type">) {
  return (
    <Button type="button" variant="outline" size="sm" className="print:hidden" onClick={() => window.print()} {...rest}>
      <Printer className="h-3.5 w-3.5" aria-hidden /> {children}
    </Button>
  );
}
