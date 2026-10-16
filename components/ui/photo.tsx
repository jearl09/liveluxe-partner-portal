"use client";

import Image, { type ImageProps } from "next/image";
import { useState, type ReactNode } from "react";

/**
 * A listing photo that falls back quietly when the image cannot be loaded. Hostaway replaces photos and their old
 * URLs start answering 403 until the next listing sync picks up the new ones; a placeholder reads better than a
 * broken-image icon.
 */
export function Photo({ fallback, ...props }: ImageProps & { fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return <Image {...props} alt={props.alt} onError={() => setFailed(true)} />;
}
