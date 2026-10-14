import { describe, expect, it } from "vitest";
import { canOptimiseImage } from "@/lib/listings/images";

describe("canOptimiseImage", () => {
  it("accepts Hostaway's listing bucket over https", () => {
    expect(canOptimiseImage("https://hostaway-platform.s3.us-west-2.amazonaws.com/listing/71167-1-abc")).toBe(true);
  });

  it("renders anything else unoptimised rather than failing the page", () => {
    expect(canOptimiseImage("http://hostaway-platform.s3.us-west-2.amazonaws.com/listing/1")).toBe(false);
    expect(canOptimiseImage("https://example.com/photo.jpg")).toBe(false);
    expect(canOptimiseImage("https://hostaway-platform.s3.us-west-2.amazonaws.com.evil.example/x")).toBe(false);
    expect(canOptimiseImage("https://hostaway-platform.s3.us-west-2.amazonaws.com/other/1")).toBe(false);
    expect(canOptimiseImage("not a url")).toBe(false);
  });
});
