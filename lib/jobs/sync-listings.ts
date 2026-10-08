/**
 * sync-listings — full catalogue refresh from Hostaway (spec §6.4.1).
 *
 * Read-only against Hostaway. Pages through /listings, maps each payload through
 * the single mapper, and writes only what changed (content hash). Listings that
 * vanished from the feed are soft-deleted, but only when every page was fetched,
 * so a mid-run failure can never hide the whole portfolio (§17.3).
 *
 * Sensitive access fields (door codes, Wi-Fi) are NOT persisted yet — that lands
 * with the encrypted listing_access_details writer. Nothing here logs them either.
 */
import { adminDb } from "@/lib/db/admin";
import { hostaway } from "@/lib/hostaway/api";
import { mapListing, type ListingRow as MappedListing } from "@/lib/hostaway/mappers";
import { chunk, planListingSync } from "@/lib/domain/sync";
import { jitterPoint, toEwktPoint } from "@/lib/domain/geo";
import { log } from "@/lib/observability/logger";
import type { Database, Json } from "@/lib/db/types";
import type { JobFn } from "./registry";

const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const UPSERT_BATCH = 50;

type ListingInsert = Database["public"]["Tables"]["listings"]["Insert"];

function toListingInsert(m: MappedListing, syncedAt: string): ListingInsert {
  // Strip the mapper-only fields; the rest line up with the table columns.
  const { lat, lng, images, amenity_ids, ...columns } = m;
  void images;
  void amenity_ids; // written separately to their own tables
  const point = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
  return {
    ...columns,
    bed_config: (columns.bed_config ?? null) as Json,
    geom: point ? toEwktPoint(point) : null,
    geom_public: point ? toEwktPoint(jitterPoint(point, `listing:${m.hostaway_listing_id}`)) : null,
    hostaway_status: "active",
    is_active: true,
    last_synced_at: syncedAt,
  };
}

export const syncListings: JobFn = async ({ requestId }) => {
  const db = adminDb();
  const syncedAt = new Date().toISOString();
  let apiCalls = 0;
  let quarantined = 0;

  // 1. Fetch every page. A failure after page 0 leaves `complete` false.
  const mapped: MappedListing[] = [];
  let complete = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await hostaway.listListings(PAGE_SIZE, page * PAGE_SIZE);
    apiCalls++;
    if (!res.ok) {
      if (page === 0) throw new Error(`Hostaway /listings failed: ${res.code} — ${res.message}`);
      log.error("sync.listings.page_failed", { requestId, page, code: res.code, message: res.message });
      break;
    }
    for (const src of res.data) {
      try {
        mapped.push(mapListing(src).listing);
      } catch (e) {
        quarantined++;
        log.error("sync.listings.quarantined", { requestId, hostawayListingId: src.id, error: String(e) });
      }
    }
    if (res.data.length < PAGE_SIZE) {
      complete = true;
      break;
    }
  }

  // 2. Amenity labels (one call; optional).
  const amenityLabels = new Map<number, string>();
  const amenities = await hostaway.amenities();
  apiCalls++;
  if (amenities.ok) amenities.data.forEach((a) => amenityLabels.set(a.id, a.name));
  else log.warn("sync.listings.amenities_unavailable", { requestId, code: amenities.code });

  // 3. Plan against what we already hold.
  const { data: existing, error: existingErr } = await db
    .from("listings")
    .select("hostaway_listing_id, content_hash, is_active")
    .range(0, 4999);
  if (existingErr) throw new Error(`listings read failed: ${existingErr.message}`);

  const plan = planListingSync(
    mapped.map((m) => ({ hostawayListingId: m.hostaway_listing_id, contentHash: m.content_hash })),
    (existing ?? []).map((e) => ({
      hostawayListingId: e.hostaway_listing_id,
      contentHash: e.content_hash,
      isActive: e.is_active,
    })),
    complete,
  );
  const byId = new Map(mapped.map((m) => [m.hostaway_listing_id, m]));

  // 4. Upsert new/changed rows, then replace their images and amenities.
  for (const ids of chunk(plan.upsert, UPSERT_BATCH)) {
    const rows = ids.map((id) => toListingInsert(byId.get(id)!, syncedAt));
    const { data: written, error } = await db
      .from("listings")
      .upsert(rows, { onConflict: "hostaway_listing_id" })
      .select("id, hostaway_listing_id");
    if (error) throw new Error(`listings upsert failed: ${error.message}`);

    const uuidByHostaway = new Map((written ?? []).map((w) => [w.hostaway_listing_id, w.id]));
    const uuids = [...uuidByHostaway.values()];
    const [imgDel, amenDel] = await Promise.all([
      db.from("listing_images").delete().in("listing_id", uuids),
      db.from("listing_amenities").delete().in("listing_id", uuids),
    ]);
    if (imgDel.error) throw new Error(`listing_images delete failed: ${imgDel.error.message}`);
    if (amenDel.error) throw new Error(`listing_amenities delete failed: ${amenDel.error.message}`);

    const images = ids.flatMap((id) => {
      const listingId = uuidByHostaway.get(id);
      if (!listingId) return [];
      return byId.get(id)!.images.map((img) => ({
        listing_id: listingId,
        url: img.url,
        caption: img.caption,
        sort_order: img.sort_order,
      }));
    });
    const amenityRows = ids.flatMap((id) => {
      const listingId = uuidByHostaway.get(id);
      if (!listingId) return [];
      const unique = [...new Set(byId.get(id)!.amenity_ids)];
      return unique.map((code) => ({
        listing_id: listingId,
        amenity_code: String(code),
        label: amenityLabels.get(code) ?? null,
      }));
    });
    if (images.length) {
      const { error: imgErr } = await db.from("listing_images").insert(images);
      if (imgErr) throw new Error(`listing_images insert failed: ${imgErr.message}`);
    }
    if (amenityRows.length) {
      const { error: amErr } = await db.from("listing_amenities").insert(amenityRows);
      if (amErr) throw new Error(`listing_amenities insert failed: ${amErr.message}`);
    }
  }

  // 5. Unchanged rows: just record that we saw them.
  for (const ids of chunk(plan.touch, 200)) {
    const { error } = await db.from("listings").update({ last_synced_at: syncedAt }).in("hostaway_listing_id", ids);
    if (error) throw new Error(`listings touch failed: ${error.message}`);
  }

  // 6. Gone from the feed: soft-delete (only on a complete fetch).
  for (const ids of chunk(plan.deactivate, 200)) {
    const { error } = await db
      .from("listings")
      .update({ is_active: false, hostaway_status: "absent", last_synced_at: syncedAt })
      .in("hostaway_listing_id", ids);
    if (error) throw new Error(`listings deactivate failed: ${error.message}`);
  }

  const notes = [
    `fetched=${mapped.length}`,
    `complete=${complete}`,
    `upserted=${plan.upsert.length}`,
    `unchanged=${plan.touch.length}`,
    `deactivated=${plan.deactivate.length}`,
    `reactivated=${plan.reactivate.length}`,
    quarantined ? `quarantined=${quarantined}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    examined: mapped.length,
    changed: plan.upsert.length + plan.deactivate.length,
    apiCalls,
    notes,
  };
};
