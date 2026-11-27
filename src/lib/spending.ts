// Filtering, sorting and grouping for the Spending page. Pure, so it can be tested.
import { activityOptions } from "./budget-tree";
import {
  eventFigures,
  eventFlags,
  inEventTab,
  lineFlags,
  lineProgress,
  lineSummary,
  type EventTab,
  type FlagKind,
} from "./calc";
import type { Activity, Attachment, BudgetEvent, BudgetLine, Objective, Outcome } from "./types";

export type EventFlagFilter =
  "upcoming" | "overdue" | "no-date" | "missing-evidence" | "over-budget";

export interface SpendingFilter {
  activity?: string;
  delivery?: string;
  line?: string;
  month?: string;
  flag?: EventFlagFilter;
  q?: string;
}

export type SortKey = "date" | "title" | "status" | "actual";
export interface SpendingSort {
  key: SortKey;
  dir: 1 | -1;
}

export interface SpendingRow {
  event: BudgetEvent;
  line: BudgetLine;
  flags: FlagKind[];
  evidenceCount: number;
  figures: ReturnType<typeof eventFigures>;
}

export const hasSpendingFilter = (f: SpendingFilter) =>
  !!(f.activity || f.delivery || f.line || f.month || f.flag || f.q);

const inMonth = (e: BudgetEvent, month: string) =>
  (e.actualDate ?? e.plannedDate ?? "").startsWith(month) ||
  (e.plannedDate ?? "").startsWith(month);

function matchesFlag(
  row: SpendingRow,
  flag: EventFlagFilter,
  riskyLines: Set<string>,
  today: string,
) {
  if (flag === "upcoming") return inEventTab(row.event, row.flags, "upcoming", today);
  if (flag === "over-budget") return riskyLines.has(row.line.id);
  return row.flags.includes(flag);
}

/** Every event that passes the filter bar. Tabs narrow it further. */
export function filterSpending(
  data: { lines: BudgetLine[]; events: BudgetEvent[]; attachments: Attachment[] },
  filter: SpendingFilter,
  today: string,
): SpendingRow[] {
  const lineById = new Map(data.lines.map((l) => [l.id, l]));
  const riskyLines = new Set(
    data.lines.filter((l) => lineFlags(lineSummary(l, data.events)).length).map((l) => l.id),
  );
  const evidence = new Map<string, number>();
  for (const a of data.attachments)
    if (a.eventId) evidence.set(a.eventId, (evidence.get(a.eventId) ?? 0) + 1);
  const q = filter.q?.toLowerCase();

  return data.events.flatMap((event) => {
    const line = lineById.get(event.lineId);
    if (!line) return [];
    if (filter.activity && line.activityId !== filter.activity) return [];
    if (filter.line && line.id !== filter.line) return [];
    if (filter.delivery && event.deliveryId !== filter.delivery) return [];
    if (filter.month && !inMonth(event, filter.month)) return [];
    if (q && !event.title.toLowerCase().includes(q)) return [];
    const evidenceCount = evidence.get(event.id) ?? 0;
    const row: SpendingRow = {
      event,
      line,
      flags: eventFlags(event, evidenceCount, today),
      evidenceCount,
      figures: eventFigures(line, event),
    };
    if (filter.flag && !matchesFlag(row, filter.flag, riskyLines, today)) return [];
    return [row];
  });
}

/** How many rows each tab would show. */
export function countByTab(rows: SpendingRow[], tabs: readonly EventTab[], today: string) {
  return Object.fromEntries(
    tabs.map((t) => [t, rows.filter((r) => inEventTab(r.event, r.flags, t, today)).length]),
  ) as Record<EventTab, number>;
}

/** The rows on one tab, sorted. Undated rows sort last by date. */
export function sortSpending(
  rows: SpendingRow[],
  tab: EventTab,
  sort: SpendingSort,
  today: string,
): SpendingRow[] {
  const dateOf = (r: SpendingRow) =>
    (tab === "done" ? (r.event.actualDate ?? r.event.plannedDate) : r.event.plannedDate) ?? "9";
  // Done tab reads newest first.
  const dir = tab === "done" && sort.key === "date" ? -sort.dir : sort.dir;
  const compare = (a: SpendingRow, b: SpendingRow) => {
    switch (sort.key) {
      case "date":
        return dateOf(a).localeCompare(dateOf(b));
      case "title":
        return a.event.title.localeCompare(b.event.title);
      case "status":
        return a.event.status.localeCompare(b.event.status);
      case "actual":
        return a.figures.actual - b.figures.actual;
    }
  };
  return rows
    .filter((r) => inEventTab(r.event, r.flags, tab, today))
    .sort((a, b) => compare(a, b) * dir);
}

export interface SpendingGroup {
  line: BudgetLine;
  activityName: string;
  rows: SpendingRow[];
  lineEvents: BudgetEvent[];
  progress: ReturnType<typeof lineProgress>;
  flags: FlagKind[];
  actual: number;
}

/** Rows grouped under their line, in workplan order, each group in event order. */
export function groupByLine(
  rows: SpendingRow[],
  data: {
    objectives: Objective[];
    outcomes: Outcome[];
    activities: Activity[];
    lines: BudgetLine[];
    events: BudgetEvent[];
  },
  today: string,
): SpendingGroup[] {
  const activityOrder = new Map(
    activityOptions(data).map((o, i) => [o.id, { label: o.label, index: i }]),
  );
  const byLine = new Map<string, SpendingRow[]>();
  for (const r of rows) byLine.set(r.line.id, [...(byLine.get(r.line.id) ?? []), r]);
  const indexOf = (l: BudgetLine) => activityOrder.get(l.activityId)?.index ?? 0;

  return data.lines
    .filter((l) => byLine.has(l.id))
    .sort((a, b) => indexOf(a) - indexOf(b) || a.sortOrder - b.sortOrder)
    .map((line) => {
      const lineEvents = data.events.filter((e) => e.lineId === line.id);
      const matched = [...(byLine.get(line.id) ?? [])].sort(
        (a, b) => a.event.sequence - b.event.sequence,
      );
      return {
        line,
        activityName: activityOrder.get(line.activityId)?.label ?? "",
        rows: matched,
        lineEvents,
        progress: lineProgress(lineEvents, today),
        flags: [...new Set(matched.flatMap((r) => r.flags))],
        actual: lineSummary(line, data.events).actualToDate,
      };
    });
}

/** The next planned event from today on. */
export function nextPlanned(events: BudgetEvent[], today: string): BudgetEvent | undefined {
  return events
    .filter((e) => e.status === "planned" && !!e.plannedDate && e.plannedDate >= today)
    .sort((a, b) => (a.plannedDate ?? "").localeCompare(b.plannedDate ?? ""))[0];
}

/** Rows keyed by the calendar day they show on: the actual date once done, else the plan. */
export function rowsByDay(rows: SpendingRow[]): Map<string, SpendingRow[]> {
  const byDay = new Map<string, SpendingRow[]>();
  for (const r of rows) {
    const day =
      r.event.status === "done" ? (r.event.actualDate ?? r.event.plannedDate) : r.event.plannedDate;
    if (day) byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }
  return byDay;
}
