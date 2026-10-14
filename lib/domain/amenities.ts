/**
 * Hostaway's raw amenity list, curated for a corporate reader (brief §7.4): grouped,
 * renamed in plain words, duplicates merged ("Internet", "Wireless", "Free WiFi" are
 * one "Wi-Fi"), and noise dropped from the visible set ("Toilet", "Body soap"). Pure.
 */

export const AMENITY_GROUPS = [
  "Essentials",
  "Kitchen",
  "Laundry",
  "Comfort",
  "Accessibility",
  "Outdoor",
  "Safety",
  "Entertainment",
] as const;
export type AmenityGroup = (typeof AMENITY_GROUPS)[number];

/** raw label (lower case) → [plain label, group]. Labels not listed fall into Comfort as they are. */
const MAP: Record<string, [string, AmenityGroup]> = {
  internet: ["Wi-Fi", "Essentials"],
  wireless: ["Wi-Fi", "Essentials"],
  "free wifi": ["Wi-Fi", "Essentials"],
  "wifi speed (50+ mbps)": ["Fast Wi-Fi (50+ Mbps)", "Essentials"],
  "air conditioning": ["Air conditioning", "Essentials"],
  heating: ["Heating", "Essentials"],
  "hot water": ["Hot water", "Essentials"],
  linens: ["Bed linen", "Essentials"],
  towels: ["Towels", "Essentials"],
  essentials: ["Toiletries and basics", "Essentials"],
  "extra pillows and blankets": ["Extra pillows and blankets", "Essentials"],
  elevator: ["Lift", "Essentials"],
  "free parking": ["Free parking", "Essentials"],
  "paid parking": ["Paid parking", "Essentials"],
  "paid parking on premises": ["Paid parking on site", "Essentials"],
  "street parking": ["Street parking", "Essentials"],
  garage: ["Garage", "Essentials"],
  "laptop friendly workspace": ["Workspace", "Essentials"],
  "long term stays allowed": ["Long stays welcome", "Essentials"],
  "private entrance": ["Private entrance", "Essentials"],
  "electronic key card access": ["Key card entry", "Essentials"],
  kitchen: ["Full kitchen", "Kitchen"],
  "cooking basics": ["Cooking basics", "Kitchen"],
  "kitchen utensils": ["Utensils", "Kitchen"],
  refrigerator: ["Fridge", "Kitchen"],
  freezer: ["Freezer", "Kitchen"],
  microwave: ["Microwave", "Kitchen"],
  oven: ["Oven", "Kitchen"],
  stove: ["Stove", "Kitchen"],
  dishwasher: ["Dishwasher", "Kitchen"],
  toaster: ["Toaster", "Kitchen"],
  "electric kettle": ["Kettle", "Kitchen"],
  "coffee/tea maker": ["Coffee machine", "Kitchen"],
  "rice maker": ["Rice cooker", "Kitchen"],
  "dining table": ["Dining table", "Kitchen"],
  "dining area": ["Dining area", "Kitchen"],
  "dining room": ["Dining room", "Kitchen"],
  "kitchen island": ["Kitchen island", "Kitchen"],
  "wine glasses": ["Wine glasses", "Kitchen"],
  "baking sheet": ["Baking tray", "Kitchen"],
  "washing machine": ["Washing machine", "Laundry"],
  dryer: ["Dryer", "Laundry"],
  "drying rack for clothing": ["Clothes airer", "Laundry"],
  iron: ["Iron", "Laundry"],
  "iron board": ["Ironing board", "Laundry"],
  laundromat: ["Laundromat nearby", "Laundry"],
  "hair dryer": ["Hair dryer", "Comfort"],
  hangers: ["Hangers", "Comfort"],
  "clothing storage": ["Wardrobe", "Comfort"],
  "room darkening shades": ["Blackout blinds", "Comfort"],
  "private living room": ["Private living room", "Comfort"],
  gym: ["Gym in the building", "Comfort"],
  "fitness center": ["Gym in the building", "Comfort"],
  "private fitness center": ["Private gym", "Comfort"],
  "exercise equipment": ["Exercise equipment", "Comfort"],
  "fitness equipment": ["Exercise equipment", "Comfort"],
  "swimming pool": ["Pool", "Comfort"],
  pool: ["Pool", "Comfort"],
  "indoor pool": ["Indoor pool", "Comfort"],
  sauna: ["Sauna", "Comfort"],
  "private sauna": ["Private sauna", "Comfort"],
  jacuzzi: ["Spa bath", "Comfort"],
  "city view": ["City view", "Comfort"],
  "suitable for children": ["Suits children", "Comfort"],
  "suitable for infants": ["Suits infants", "Comfort"],
  "baby crib": ["Cot", "Comfort"],
  "pack n play travel crib": ["Travel cot", "Comfort"],
  "high chair": ["High chair", "Comfort"],
  "wheelchair access possible": ["Wheelchair access", "Accessibility"],
  "wide clearance to bed": ["Wide clearance to bed", "Accessibility"],
  "accessible height bed": ["Accessible-height bed", "Accessibility"],
  "accessible height toilet": ["Accessible-height toilet", "Accessibility"],
  "wide clearance to shower and toilet": ["Wide clearance to shower and toilet", "Accessibility"],
  "single level home": ["Single level", "Accessibility"],
  "bedroom step free access": ["Step-free bedroom", "Accessibility"],
  "bathroom step free access": ["Step-free bathroom", "Accessibility"],
  "common space step free access": ["Step-free living area", "Accessibility"],
  "common space wide doorway": ["Wide doorways", "Accessibility"],
  "bedroom wide doorway": ["Wide doorways", "Accessibility"],
  "bathroom wide doorway": ["Wide doorways", "Accessibility"],
  "wide doorway": ["Wide doorways", "Accessibility"],
  "flat smooth pathway to front door": ["Flat path to the door", "Accessibility"],
  "path to entrance lit at night": ["Lit path to the entrance", "Accessibility"],
  "grab rails in toilet": ["Grab rails in the toilet", "Accessibility"],
  balcony: ["Balcony", "Outdoor"],
  "outdoor furniture": ["Outdoor furniture", "Outdoor"],
  "barbeque utensils": ["Barbecue", "Outdoor"],
  "outdoor lighting": ["Outdoor lighting", "Outdoor"],
  beach: ["Near the beach", "Outdoor"],
  "kayak canoe": ["Kayak", "Outdoor"],
  "smoke detector": ["Smoke alarm", "Safety"],
  "carbon monoxide detector": ["Carbon monoxide alarm", "Safety"],
  "fire extinguisher": ["Fire extinguisher", "Safety"],
  "first aid kit": ["First aid kit", "Safety"],
  "emergency exit": ["Emergency exit", "Safety"],
  safe: ["Safe", "Safety"],
  tv: ["TV", "Entertainment"],
  "smart tv": ["Smart TV", "Entertainment"],
  "cable tv": ["Cable TV", "Entertainment"],
  "board games": ["Board games", "Entertainment"],
  books: ["Books", "Entertainment"],
  "ping pong table": ["Table tennis", "Entertainment"],
};

/** Present in nearly every home or not a reason to choose one; kept out of the visible set. */
const NOISE = new Set([
  "toilet",
  "shower",
  "body soap",
  "shampoo",
  "conditioner",
  "shower gel",
  "cleaning products",
  "coffee",
  "trash compactor",
  "car not necessary",
  "in person check-in",
  "cleaning before checkout",
]);

export interface AmenityView {
  label: string;
  group: AmenityGroup;
}

export function curateAmenities(raw: readonly (string | null)[]): AmenityView[] {
  const seen = new Set<string>();
  const out: AmenityView[] = [];
  for (const r of raw) {
    const key = (r ?? "").trim().toLowerCase();
    if (!key || NOISE.has(key)) continue;
    const [label, group] = MAP[key] ?? [r!.trim().replace(/^./, (c) => c.toUpperCase()), "Comfort"];
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, group });
  }
  return out;
}

/** Curated order: what a placement officer looks for first comes first in each group. */
const RANK = new Map([...new Set(Object.values(MAP).map(([l]) => l))].map((l, i) => [l, i]));
const rank = (l: string) => RANK.get(l) ?? Number.MAX_SAFE_INTEGER;

export function groupAmenities(items: readonly AmenityView[]): { group: AmenityGroup; items: string[] }[] {
  return AMENITY_GROUPS.map((group) => ({
    group,
    items: items
      .filter((i) => i.group === group)
      .map((i) => i.label)
      .sort((a, b) => rank(a) - rank(b)),
  })).filter((g) => g.items.length > 0);
}

/** The at-a-glance facts a placement officer filters on (brief §7.4 chips). */
export function amenityFacts(items: readonly AmenityView[]): {
  parking: string | null;
  lift: boolean;
  accessible: boolean;
  workspace: boolean;
} {
  const has = (l: string) => items.some((i) => i.label === l);
  const parking =
    ["Free parking", "Paid parking on site", "Paid parking", "Garage", "Street parking"].find(has) ?? null;
  return {
    parking,
    lift: has("Lift"),
    accessible: items.some((i) => i.group === "Accessibility" && i.label === "Wheelchair access"),
    workspace: has("Workspace"),
  };
}
