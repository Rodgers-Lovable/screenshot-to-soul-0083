// Sample budget used only as a test fixture.
import type { Attachment, BudgetEvent, BudgetLine, BudgetPeriod, Component, DurationUnit, QuantityUnit } from "@/lib/types";
import { eventTitle, type StoreData } from "@/data/store";

type Row = [string, number, QuantityUnit, number, number, DurationUnit, number, string?];

const C1_PLATFORM: Row[] = [
  ["Alert verification support airtime", 400, "units", 25, 1, "months", 12, "Shared monthly cost with partner organisations incl. short code maintenance and SMS at KES 0.9"],
  ["AlertApp production short code maintenance", 10000, "SMS", 1, 1, "months", 12],
  ["AlertApp test short code maintenance", 1, "lines", 18500, 1, "months", 12],
];
const C1_OPS: Row[] = [
  ["Program Lead monthly airtime for virtual review meeting", 1, "pax", 2500, 1, "months", 12, "Airtime reimbursed after meeting attendance"],
  ["Regional coordinators monthly airtime", 12, "pax", 1200, 1, "months", 12, "3 staff in each of 4 regions"],
  ["Field assistants monthly airtime for review meetings", 64, "pax", 400, 1, "months", 12, "64 field assistants across 4 regions"],
  ["Facilitator per diems for regional supervision", 6, "pax", 12000, 4, "days", 2, "Biannual supervision"],
  ["Fuel for facilitator vehicles", 2, "vehicles", 18000, 1, "one-off", 2, "Fuel for supervision trips"],
  ["Regional coordinator per diems", 6, "pax", 9500, 3, "days", 2, "Regions 1, 3 and 4, sites >50km from office"],
  ["Venue: regional review meeting", 25, "pax", 1800, 1, "days", 4, "Quarterly regional review"],
  ["Facility sensitization: health worker transport", 50, "pax", 1200, 1, "one-off", 1],
  ["Facility sensitization: partner institute staff transport", 2, "pax", 3000, 8, "days", 1],
  ["Venue: National Technical Working Group", 30, "pax", 4000, 1, "days", 1],
  ["Transport: National Technical Working Group", 18, "pax", 2000, 1, "one-off", 1],
  ["Venue: National Data Review Meeting", 40, "pax", 4200, 2, "days", 1],
  ["Per diem: National Data Review Meeting", 18, "pax", 12500, 2, "days", 1, "Ministry staff per diem"],
  ["Transport: National Data Review Meeting", 22, "pax", 2200, 2, "days", 1],
];
const C2: Row[] = [
  ["Toll-free line (setup plus monthly)", 1, "lines", 18000, 1, "months", 12],
  ["Bulk SMS for SurveyApp", 12000, "SMS", 1.1, 1, "one-off", 6],
  ["Field interviewers for data collection", 3, "pax", 72000, 1, "months", 6],
  ["Assorted stationery", 3, "sets", 7000, 1, "one-off", 1],
  ["Assorted PPE for sample collection", 1, "sets", 20000, 1, "one-off", 1],
  ["Airtime communication costs", 5, "pax", 1000, 1, "one-off", 1],
  ["Training: venue and conference costs", 1, "units", 45000, 2, "days", 1],
  ["Fuel for local movement", 2, "vehicles", 12000, 1, "one-off", 1],
];


const SHEET_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300"><rect width="100%" height="100%" fill="#f4f6f6"/><text x="20" y="40" font-family="sans-serif" font-size="20" fill="#234">Attendance sheet (demo)</text><g stroke="#9ab" >${Array.from({ length: 10 }, (_, i) => `<line x1="20" x2="400" y1="${70 + i * 22}" y2="${70 + i * 22}"/>`).join("")}</g></svg>`,
  );

export function makeSeed(): StoreData {
  const period: BudgetPeriod = { id: "p1", projectName: "Program Alpha", name: "FY2026/27", startDate: "2026-09-30", endDate: "2027-09-29", fxRate: 125 };
  const components: Component[] = [
    { id: "c1", periodId: "p1", code: "1", name: "Community Alert Reporting", sortOrder: 1 },
    { id: "c2", periodId: "p1", code: "2", name: "Rapid Field Surveys", sortOrder: 2 },
  ];
  const lines: BudgetLine[] = [];
  const push = (rows: Row[], componentId: string, groupLabel?: string) =>
    rows.forEach(([description, quantity, quantityUnit, unit, duration, durationUnit, occurrences, justification]) => {
      const n = lines.length + 1;
      lines.push({ id: `l${n}`, componentId, groupLabel, description, quantity, quantityUnit, unitCostCents: Math.round(unit * 100), duration, durationUnit, occurrences, justification, sortOrder: n });
    });
  push(C1_PLATFORM, "c1", "Platform costs");
  push(C1_OPS, "c1", "Operations and meetings");
  push(C2, "c2");

  const events: BudgetEvent[] = [];
  const attachments: Attachment[] = [];
  for (const l of lines) {
    for (let s = 1; s <= l.occurrences; s++) {
      events.push({ id: `e-${l.id}-${s}`, lineId: l.id, sequence: s, title: eventTitle(l.description, s, l.occurrences), status: "planned" });
    }
  }
  const ev = (lineId: string, seq: number) => events.find((e) => e.lineId === lineId && e.sequence === seq)!;
  const attach = (eventId: string, label: string) =>
    attachments.push({ id: `a-${eventId}`, eventId, fileName: "attendance-sheet.svg", fileUrl: SHEET_SVG, mimeType: "image/svg+xml", sizeBytes: SHEET_SVG.length, label, uploadedAt: "2026-11-01T09:00:00Z" });

  // Monthly lines: 15th of each month from Oct 2026; Oct done.
  lines.filter((l) => l.durationUnit === "months" && l.occurrences > 1).forEach((l, idx) => {
    for (let s = 1; s <= l.occurrences; s++) {
      const m = 10 + s - 1;
      const y = m > 12 ? 2027 : 2026;
      const mm = ((m - 1) % 12) + 1;
      ev(l.id, s).plannedDate = `${y}-${String(mm).padStart(2, "0")}-15`;
    }
    const oct = ev(l.id, 1);
    oct.status = "done";
    oct.actualDate = oct.plannedDate;
    if (idx % 2 === 0) attach(oct.id, "Payment receipt");
  });
  // Bulk SMS: every two months
  ["2026-10-15", "2026-12-15", "2027-02-15", "2027-04-15", "2027-06-15", undefined].forEach((d, i) => (ev("l19", i + 1).plannedDate = d));

  const q = ["2026-11-05", "2027-02-10", "2027-05-12", "2027-08-11"];
  q.forEach((d, i) => (ev("l10", i + 1).plannedDate = d));
  Object.assign(ev("l10", 1), { status: "done", actualDate: "2026-11-05", actualQuantity: 19, actualUnitCostCents: 180000, location: "Regional office" });
  attach(ev("l10", 1).id, "Signed attendance list");

  Object.assign(ev("l7", 1), { plannedDate: "2026-11-10", status: "done", actualDate: "2026-11-10", actualQuantity: 6, actualUnitCostCents: 1200000, actualDuration: 5 });
  ev("l7", 2).plannedDate = "2027-05-18";
  ev("l8", 1).plannedDate = "2026-11-10";
  ev("l8", 2).plannedDate = "2027-05-18";
  ev("l9", 1).plannedDate = "2027-01-20";
  ev("l11", 1).plannedDate = "2026-11-03";
  Object.assign(ev("l24", 1), { plannedDate: "2026-10-20", status: "done", actualDate: "2026-10-20", actualUnitCostCents: 4000000, location: "Nairobi" });
  attach(ev("l24", 1).id, "Venue invoice");
  ev("l16", 1).plannedDate = "2027-07-20";
  ev("l15", 1).plannedDate = "2027-07-20";
  ev("l17", 1).plannedDate = "2027-07-20";
  ev("l13", 1).plannedDate = "2026-12-08";
  ev("l14", 1).plannedDate = "2026-12-08";
  ev("l20", 1).plannedDate = "2026-11-25";
  ["2026-12-25", "2027-01-25", "2027-02-25", "2027-03-25", "2027-04-25"].forEach((d, i) => (ev("l20", i + 2).plannedDate = d));
  ev("l21", 1).plannedDate = "2026-11-24";
  ev("l25", 1).plannedDate = "2026-12-02";
  // l12, l22, l23 left without dates → "No date" flag.

  return { period, components, lines, events, attachments, audit: [] };
}
