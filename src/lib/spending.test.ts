import { describe, expect, it } from "vitest";
import {
  countByTab,
  filterSpending,
  groupByLine,
  hasSpendingFilter,
  nextPlanned,
  rowsByDay,
  sortSpending,
} from "./spending";
import type { Activity, Attachment, BudgetEvent, BudgetLine, Objective, Outcome } from "./types";

const TODAY = "2026-11-15";

const line = (id: string, p: Partial<BudgetLine> = {}): BudgetLine => ({
  id,
  activityId: "a1",
  description: `Line ${id}`,
  quantity: 1,
  quantityUnit: "pax",
  unitCostCents: 10_000,
  duration: 1,
  durationUnit: "days",
  occurrences: 1,
  sortOrder: 1,
  ...p,
});
const ev = (id: string, lineId: string, p: Partial<BudgetEvent> = {}): BudgetEvent => ({
  id,
  lineId,
  sequence: 1,
  title: `Event ${id}`,
  status: "planned",
  ...p,
});
const receipt = (eventId: string): Attachment => ({
  id: `att-${eventId}`,
  eventId,
  fileName: "r.pdf",
  fileUrl: "storage:x",
  mimeType: "application/pdf",
  sizeBytes: 1,
  uploadedAt: "2026-11-01",
});
const activity = (id: string, sortOrder: number): Activity => ({
  id,
  outcomeId: "oc1",
  code: id.toUpperCase(),
  title: `Activity ${id}`,
  kind: "general",
  output: "",
  meansOfVerification: "",
  frequencyLabel: "",
  notes: "",
  sortOrder,
});
const objectives: Objective[] = [
  { id: "o1", periodId: "p", code: "1", title: "Objective", sortOrder: 1 },
];
const outcomes: Outcome[] = [
  { id: "oc1", objectiveId: "o1", code: "1.1", title: "Outcome", sortOrder: 1 },
];

const lines = [line("L1"), line("L2", { activityId: "a2" })];
const events = [
  ev("e1", "L1", { plannedDate: "2026-11-20", title: "Training lunch" }),
  ev("e2", "L1", { sequence: 2, plannedDate: "2026-11-01" }),
  ev("e3", "L2", { status: "done", plannedDate: "2026-10-01", actualDate: "2026-11-03" }),
  ev("e4", "L2", { sequence: 2 }),
  ev("orphan", "missing-line"),
];
const data = { lines, events, attachments: [receipt("e3")] };
const ids = (rows: { event: BudgetEvent }[]) => rows.map((r) => r.event.id);

describe("hasSpendingFilter", () => {
  it("ignores tab and view, sees any filter field", () => {
    expect(hasSpendingFilter({})).toBe(false);
    expect(hasSpendingFilter({ q: "" })).toBe(false);
    expect(hasSpendingFilter({ flag: "overdue" })).toBe(true);
  });
});

describe("filterSpending", () => {
  it("drops events whose line is gone and keeps the rest", () => {
    expect(ids(filterSpending(data, {}, TODAY))).toEqual(["e1", "e2", "e3", "e4"]);
  });

  it("filters by activity, line, month and title search", () => {
    expect(ids(filterSpending(data, { activity: "a2" }, TODAY))).toEqual(["e3", "e4"]);
    expect(ids(filterSpending(data, { line: "L1" }, TODAY))).toEqual(["e1", "e2"]);
    // A done event matches on its actual month or its planned month.
    expect(ids(filterSpending(data, { month: "2026-11" }, TODAY))).toEqual(["e1", "e2", "e3"]);
    expect(ids(filterSpending(data, { month: "2026-10" }, TODAY))).toEqual(["e3"]);
    expect(ids(filterSpending(data, { q: "LUNCH" }, TODAY))).toEqual(["e1"]);
  });

  it("filters by flag", () => {
    expect(ids(filterSpending(data, { flag: "overdue" }, TODAY))).toEqual(["e2"]);
    expect(ids(filterSpending(data, { flag: "no-date" }, TODAY))).toEqual(["e4"]);
    expect(ids(filterSpending(data, { flag: "upcoming" }, TODAY))).toEqual(["e1"]);
  });

  it("counts receipts per event", () => {
    const rows = filterSpending(data, {}, TODAY);
    expect(rows.find((r) => r.event.id === "e3")?.evidenceCount).toBe(1);
    expect(rows.find((r) => r.event.id === "e1")?.evidenceCount).toBe(0);
  });
});

describe("tabs and sorting", () => {
  const rows = filterSpending(data, {}, TODAY);

  it("counts rows per tab", () => {
    const counts = countByTab(rows, ["action", "done", "all"], TODAY);
    expect(counts).toEqual({ action: 2, done: 1, all: 4 });
  });

  it("sorts by planned date with undated rows last", () => {
    const sorted = sortSpending(rows, "all", { key: "date", dir: 1 }, TODAY);
    expect(ids(sorted)).toEqual(["e3", "e2", "e1", "e4"]);
  });

  it("reads the done tab newest first by actual date", () => {
    const done = [
      ...rows,
      ...filterSpending(
        {
          ...data,
          events: [ev("e5", "L1", { status: "done", actualDate: "2026-11-10" })],
        },
        {},
        TODAY,
      ),
    ];
    expect(ids(sortSpending(done, "done", { key: "date", dir: 1 }, TODAY))).toEqual(["e5", "e3"]);
  });

  it("sorts by title both ways", () => {
    const asc = ids(sortSpending(rows, "all", { key: "title", dir: 1 }, TODAY));
    expect(asc[0]).toBe("e2");
    expect(ids(sortSpending(rows, "all", { key: "title", dir: -1 }, TODAY))).toEqual(
      [...asc].reverse(),
    );
  });
});

describe("groupByLine", () => {
  it("orders lines by workplan activity order and events by sequence", () => {
    const rows = sortSpending(
      filterSpending(data, {}, TODAY),
      "all",
      { key: "date", dir: -1 },
      TODAY,
    );
    const groups = groupByLine(
      rows,
      { objectives, outcomes, activities: [activity("a2", 1), activity("a1", 2)], lines, events },
      TODAY,
    );
    expect(groups.map((g) => g.line.id)).toEqual(["L2", "L1"]);
    expect(groups[1]?.rows.map((r) => r.event.sequence)).toEqual([1, 2]);
    expect(groups[1]?.flags).toEqual(["overdue"]);
    expect(groups[0]?.activityName).toContain("Activity a2");
  });
});

describe("nextPlanned and rowsByDay", () => {
  it("finds the next planned event from today on", () => {
    expect(nextPlanned(events, TODAY)?.id).toBe("e1");
    expect(nextPlanned(events, "2026-12-01")).toBeUndefined();
  });

  it("puts done events on their actual day and skips undated ones", () => {
    const byDay = rowsByDay(filterSpending(data, {}, TODAY));
    expect(ids(byDay.get("2026-11-03") ?? [])).toEqual(["e3"]);
    expect(byDay.has("2026-10-01")).toBe(false);
    expect([...byDay.values()].flat()).toHaveLength(3);
  });
});
