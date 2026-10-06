/**
 * Sample data for reviewing the dashboard design before Phase 3 (`/?demo=1`, never in production).
 * Shapes match what the loader produces from real rows; dates are relative to `now`.
 */
import type { DashboardRequestRow } from "@/lib/domain/dashboard";
import type { ActivityEvent } from "./types";

const day = (now: Date, offset: number) => {
  const d = new Date(now.getTime() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};
const hours = (now: Date, h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

export function demoRequests(now: Date): DashboardRequestRow[] {
  const base = {
    claimRef: null,
    poNumber: null,
    checkinReleasedAt: null,
    checkinReleasesAt: null,
    unreadComments: 0,
    paymentDue: false,
    holdExpiresAt: null,
    decisionDueAt: null,
  };
  return [
    {
      ...base,
      id: "d1",
      reference: "LLX-2026-002041",
      status: "COUNTER_OFFERED",
      propertyName: "Marvel Tower 1203",
      suburb: "Docklands",
      checkIn: day(now, 9),
      checkOut: day(now, 40),
      nights: 31,
      guestName: "Priya Natarajan",
      claimRef: "CLM-88213",
      totalFormatted: "AUD $8,432.00",
      holdExpiresAt: hours(now, 26),
    },
    {
      ...base,
      id: "d2",
      reference: "LLX-2026-002038",
      status: "AWAITING_PAYMENT",
      paymentDue: true,
      propertyName: "Harbour One 2108",
      suburb: "Docklands",
      checkIn: day(now, 5),
      checkOut: day(now, 61),
      nights: 56,
      guestName: "Daniel Okafor",
      claimRef: "CLM-88104",
      totalFormatted: "AUD $9,169.20",
      holdExpiresAt: hours(now, 20),
    },
    {
      ...base,
      id: "d3",
      reference: "LLX-2026-002035",
      status: "UNDER_REVIEW",
      unreadComments: 1,
      propertyName: "La Trobe Residences 804",
      suburb: "Docklands",
      checkIn: day(now, 12),
      checkOut: day(now, 42),
      nights: 30,
      guestName: "Mei-Ling Chen",
      poNumber: "PO-44817",
      totalFormatted: "AUD $7,650.00",
      decisionDueAt: hours(now, 2.25),
    },
    {
      ...base,
      id: "d4",
      reference: "LLX-2026-002042",
      status: "SUBMITTED",
      propertyName: "Marvel Tower 1507",
      suburb: "Docklands",
      checkIn: day(now, 3),
      checkOut: day(now, 31),
      nights: 28,
      guestName: "Family of Thomas Reid",
      claimRef: "CLM-88320",
      totalFormatted: "AUD $7,980.00",
      holdExpiresAt: hours(now, 1.67),
      decisionDueAt: hours(now, 3.5),
    },
    {
      ...base,
      id: "d5",
      reference: "LLX-2026-002030",
      status: "CONFIRMED",
      propertyName: "Harbour One 1511",
      suburb: "Docklands",
      checkIn: day(now, 2),
      checkOut: day(now, 33),
      nights: 31,
      guestName: "Grace Whitfield",
      claimRef: "CLM-87990",
      totalFormatted: "AUD $8,990.00",
      checkinReleasesAt: hours(now, 24),
    },
    {
      ...base,
      id: "d6",
      reference: "LLX-2026-002027",
      status: "CONFIRMED",
      propertyName: "La Trobe Residences 1102",
      suburb: "Docklands",
      checkIn: day(now, 2),
      checkOut: day(now, 16),
      nights: 14,
      guestName: "Samuel Adeyemi",
      poNumber: "PO-44790",
      totalFormatted: "AUD $4,480.00",
      checkinReleasedAt: hours(now, -6),
    },
    {
      ...base,
      id: "d7",
      reference: "LLX-2026-001998",
      status: "CHECKED_IN",
      propertyName: "Marvel Tower 905",
      suburb: "Docklands",
      checkIn: day(now, -26),
      checkOut: day(now, 4),
      nights: 30,
      guestName: "Rosa Martínez",
      claimRef: "CLM-87412",
      totalFormatted: "AUD $8,250.00",
    },
    {
      ...base,
      id: "d8",
      reference: "LLX-2026-001975",
      status: "CHECKED_IN",
      propertyName: "Harbour One 701",
      suburb: "Docklands",
      checkIn: day(now, -40),
      checkOut: day(now, 20),
      nights: 60,
      guestName: "Liam O'Connor",
      claimRef: "CLM-87201",
      totalFormatted: "AUD $15,400.00",
    },
    {
      ...base,
      id: "d9",
      reference: "LLX-2026-001960",
      status: "CHECKED_IN",
      propertyName: "La Trobe Residences 302",
      suburb: "Docklands",
      checkIn: day(now, -10),
      checkOut: day(now, 50),
      nights: 60,
      guestName: "Hannah Blake",
      poNumber: "PO-44502",
      totalFormatted: "AUD $15,900.00",
    },
    {
      ...base,
      id: "d10",
      reference: "LLX-2026-001940",
      status: "DECLINED",
      propertyName: "Marvel Tower 1203",
      suburb: "Docklands",
      checkIn: day(now, 1),
      checkOut: day(now, 8),
      nights: 7,
      guestName: "Noah Fischer",
      totalFormatted: "AUD $2,100.00",
    },
  ];
}

export function demoActivity(now: Date, ts: (iso: string) => string): ActivityEvent[] {
  const ev = (id: string, h: number, verb: string, reference: string, actor: string | null): ActivityEvent => {
    const iso = hours(now, -h);
    return {
      id,
      requestId: "d1",
      reference,
      verb,
      actor,
      atIso: iso,
      atLabel: ts(iso),
      atUtc: new Date(iso).toISOString(),
    };
  };
  return [
    ev("a1", 0.5, "Counter-offer made", "LLX-2026-002041", "Sarah M."),
    ev("a2", 3, "Comment added", "LLX-2026-002035", "Sarah M."),
    ev("a3", 5, "Approved", "LLX-2026-002038", "James K."),
    ev("a4", 22, "Invoice issued", "LLX-2026-001998", null),
    ev("a5", 30, "Declined", "LLX-2026-001940", "James K."),
    ev("a6", 50, "Check-in details released", "LLX-2026-002027", null),
  ];
}
