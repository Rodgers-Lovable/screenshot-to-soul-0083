// Pure budget maths. All money in integer cents (KES × 100). No React imports.
import type { BudgetEvent, BudgetLine, BudgetPeriod } from "./types";

const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(iso.length === 10 ? iso + "T00:00:00Z" : iso);
export const daysBetween = (a: string, b: string) => Math.round((toTime(b) - toTime(a)) / DAY);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function actualInputs(line: BudgetLine, ev: BudgetEvent) {
  return {
    q1: ev.actualQuantity ?? line.quantity,
    r1: ev.actualUnitCostCents ?? line.unitCostCents,
    d1: ev.actualDuration ?? line.duration,
  };
}

export const eventPlanned = (line: BudgetLine) =>
  Math.round(line.quantity * line.unitCostCents * line.duration);

export interface EventFigures {
  planned: number;
  actual: number;
  volumeVariance: number;
  rateVariance: number;
  variance: number;
}

export function eventFigures(line: BudgetLine, ev: BudgetEvent): EventFigures {
  const planned = eventPlanned(line);
  if (ev.status !== "done")
    return { planned, actual: 0, volumeVariance: 0, rateVariance: 0, variance: 0 };
  const { q1, r1, d1 } = actualInputs(line, ev);
  const q0d0 = line.quantity * line.duration;
  const q1d1 = q1 * d1;
  const actual = Math.round(q1d1 * r1);
  const volumeVariance = Math.round((q0d0 - q1d1) * line.unitCostCents);
  // Derived so the split always sums exactly after rounding.
  const rateVariance = planned - actual - volumeVariance;
  return { planned, actual, volumeVariance, rateVariance, variance: planned - actual };
}

export interface Summary {
  planned: number;
  actualToDate: number;
  plannedForCompleted: number;
  varianceOnCompleted: number;
  volumeVariance: number;
  rateVariance: number;
  remaining: number;
  stillToSpend: number;
  projectedBalance: number;
  releasedByCancellation: number;
  progressPct: number;
}

export const emptySummary = (): Summary => ({
  planned: 0,
  actualToDate: 0,
  plannedForCompleted: 0,
  varianceOnCompleted: 0,
  volumeVariance: 0,
  rateVariance: 0,
  remaining: 0,
  stillToSpend: 0,
  projectedBalance: 0,
  releasedByCancellation: 0,
  progressPct: 0,
});

export const linePlanned = (line: BudgetLine) =>
  Math.round(line.quantity * line.unitCostCents * line.duration * line.occurrences);

export function lineSummary(line: BudgetLine, events: BudgetEvent[]): Summary {
  const s = emptySummary();
  s.planned = linePlanned(line);
  for (const ev of events) {
    if (ev.lineId !== line.id) continue;
    const f = eventFigures(line, ev);
    if (ev.status === "done") {
      s.actualToDate += f.actual;
      s.plannedForCompleted += f.planned;
      s.volumeVariance += f.volumeVariance;
      s.rateVariance += f.rateVariance;
    } else if (ev.status === "planned") s.stillToSpend += f.planned;
    else s.releasedByCancellation += f.planned;
  }
  return finish(s);
}

function finish(s: Summary): Summary {
  s.varianceOnCompleted = s.plannedForCompleted - s.actualToDate;
  s.remaining = s.planned - s.actualToDate;
  s.projectedBalance = s.remaining - s.stillToSpend;
  s.progressPct = s.planned > 0 ? s.actualToDate / s.planned : 0;
  return s;
}

export function sumSummaries(list: Summary[]): Summary {
  const s = emptySummary();
  for (const x of list) {
    s.planned += x.planned;
    s.actualToDate += x.actualToDate;
    s.plannedForCompleted += x.plannedForCompleted;
    s.volumeVariance += x.volumeVariance;
    s.rateVariance += x.rateVariance;
    s.stillToSpend += x.stillToSpend;
    s.releasedByCancellation += x.releasedByCancellation;
  }
  return finish(s);
}

export const periodSummary = (lines: BudgetLine[], events: BudgetEvent[]) =>
  sumSummaries(lines.map((l) => lineSummary(l, events)));

export type BurnStatus = "On track" | "Behind plan" | "Ahead of plan";
export interface Burn {
  spentPct: number;
  timeElapsedPct: number;
  plannedToDatePct: number;
  status: BurnStatus;
}

export function burnRate(
  period: BudgetPeriod,
  lines: BudgetLine[],
  events: BudgetEvent[],
  today: string,
): Burn {
  const total = periodSummary(lines, events);
  const byId = new Map(lines.map((l) => [l.id, l]));
  let plannedToDate = 0;
  for (const ev of events) {
    const line = byId.get(ev.lineId);
    if (line && ev.plannedDate && ev.plannedDate <= today) plannedToDate += eventPlanned(line);
  }
  const spentPct = total.planned ? total.actualToDate / total.planned : 0;
  const plannedToDatePct = total.planned ? plannedToDate / total.planned : 0;
  const span = daysBetween(period.startDate, period.endDate);
  const timeElapsedPct = span > 0 ? clamp(daysBetween(period.startDate, today) / span, 0, 1) : 0;
  const diff = spentPct - plannedToDatePct;
  const status: BurnStatus =
    Math.abs(diff) <= 0.1 + 1e-9 ? "On track" : diff < 0 ? "Behind plan" : "Ahead of plan";
  return { spentPct, timeElapsedPct, plannedToDatePct, status };
}

export type FlagKind =
  "over-budget" | "projected-overrun" | "overdue" | "no-date" | "missing-evidence";
export const FLAG_LABEL: Record<FlagKind, string> = {
  "over-budget": "Over budget",
  "projected-overrun": "Projected overrun",
  overdue: "Overdue",
  "no-date": "No date",
  "missing-evidence": "Missing evidence",
};

export function lineFlags(s: Summary): FlagKind[] {
  const f: FlagKind[] = [];
  if (s.actualToDate > s.planned) f.push("over-budget");
  if (s.projectedBalance < 0) f.push("projected-overrun");
  return f;
}

export function eventFlags(ev: BudgetEvent, attachmentCount: number, today: string): FlagKind[] {
  const f: FlagKind[] = [];
  if (ev.status === "planned" && ev.plannedDate && ev.plannedDate < today) f.push("overdue");
  if (ev.status === "planned" && !ev.plannedDate) f.push("no-date");
  if (ev.status === "done" && attachmentCount === 0) f.push("missing-evidence");
  return f;
}

/** Month keys (YYYY-MM) covering the period. */
export function periodMonths(period: BudgetPeriod): string[] {
  const out: string[] = [];
  const [sy, sm] = period.startDate.split("-").map(Number);
  const [ey, em] = period.endDate.split("-").map(Number);
  let y = sy,
    m = sm;
  // Period starting on the 30th of a month is treated as starting the following month.
  if (Number(period.startDate.slice(8)) >= 28) {
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function cumulativeByMonth(
  period: BudgetPeriod,
  lines: BudgetLine[],
  events: BudgetEvent[],
) {
  const months = periodMonths(period);
  const byId = new Map(lines.map((l) => [l.id, l]));
  const planned = new Map<string, number>();
  const actual = new Map<string, number>();
  for (const ev of events) {
    const line = byId.get(ev.lineId);
    if (!line) continue;
    const f = eventFigures(line, ev);
    if (ev.plannedDate && ev.status !== "cancelled") {
      const k = clampMonth(ev.plannedDate.slice(0, 7), months);
      planned.set(k, (planned.get(k) ?? 0) + f.planned);
    }
    if (ev.status === "done") {
      const k = clampMonth(
        (ev.actualDate ?? ev.plannedDate ?? period.startDate).slice(0, 7),
        months,
      );
      actual.set(k, (actual.get(k) ?? 0) + f.actual);
    }
  }
  let cp = 0,
    ca = 0;
  return months.map((m) => {
    cp += planned.get(m) ?? 0;
    ca += actual.get(m) ?? 0;
    return { month: m, planned: cp, actual: ca };
  });
}

function clampMonth(k: string, months: string[]) {
  if (!months.length) return k;
  if (k < months[0]) return months[0];
  if (k > months[months.length - 1]) return months[months.length - 1];
  return k;
}

/** Event count change needed when occurrences change. Throws if impossible. */
export function planOccurrenceChange(
  events: BudgetEvent[],
  newOcc: number,
): { add: number; removeIds: string[] } {
  const current = events.length;
  if (newOcc >= current) return { add: newOcc - current, removeIds: [] };
  const need = current - newOcc;
  const removable = events
    .filter((e) => e.status === "planned")
    .sort((a, b) => b.sequence - a.sequence);
  if (removable.length < need) {
    throw new Error(
      `Can't reduce to ${newOcc}: only ${removable.length} planned event(s) can be removed; the others are done or cancelled.`,
    );
  }
  return { add: 0, removeIds: removable.slice(0, need).map((e) => e.id) };
}
