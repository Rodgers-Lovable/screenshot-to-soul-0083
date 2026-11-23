import { describe, expect, it } from "vitest";
import { makeSeed } from "@/test/demo-budget";
import {
  burnRate,
  eventPlanned,
  periodMonths,
  eventFigures,
  eventFlags,
  lineFlags,
  lineSummary,
  periodSummary,
  planOccurrenceChange,
  cumulativeByMonth,
  addMonthsISO,
  inEventTab,
  lineProgress,
  scheduleDates,
} from "./calc";
import { formatKES, formatUSD, formulaShort, parseMoney } from "./format";
import type { BudgetEvent, BudgetLine, BudgetPeriod } from "./types";

const line = (p: Partial<BudgetLine> = {}): BudgetLine => ({
  id: "L",
  activityId: "a",
  description: "x",
  quantity: 25,
  quantityUnit: "pax",
  unitCostCents: 180000,
  duration: 1,
  durationUnit: "days",
  occurrences: 4,
  sortOrder: 1,
  ...p,
});
const ev = (p: Partial<BudgetEvent> = {}): BudgetEvent => ({
  id: Math.random().toString(),
  lineId: "L",
  sequence: 1,
  title: "t",
  status: "planned",
  ...p,
});

describe("seed totals", () => {
  it("period planned total is KES 5,040,000 / $40,320 at 125", () => {
    const s = makeSeed();
    const total = periodSummary(s.lines, s.events).planned;
    expect(formatKES(total)).toBe("KES 5,040,000");
    expect(formatUSD(total, 125)).toBe("$40,320");
  });
  it("line 16 at 16 pax drops from 450,000 to 400,000", () => {
    const l16 = makeSeed().lines.find((l) => l.id === "l16")!;
    expect(lineSummary(l16, []).planned).toBe(45_000_000);
    expect(lineSummary({ ...l16, quantity: 16 }, []).planned).toBe(40_000_000);
  });
  it("line 10 Q1 at 19 pax: volume +10,800, rate 0", () => {
    const s = makeSeed();
    const l = s.lines.find((x) => x.id === "l10")!;
    const f = eventFigures(
      l,
      s.events.find((e) => e.id === "e-l10-1")!,
    );
    expect(f.volumeVariance).toBe(1_080_000);
    expect(f.rateVariance).toBe(0);
  });
  it("line 7 occ 1: volume −72,000 and missing evidence", () => {
    const s = makeSeed();
    const l = s.lines.find((x) => x.id === "l7")!;
    const e = s.events.find((x) => x.id === "e-l7-1")!;
    expect(eventFigures(l, e).volumeVariance).toBe(-7_200_000);
    expect(
      eventFlags(e, s.attachments.filter((a) => a.eventId === e.id).length, "2026-11-17"),
    ).toContain("missing-evidence");
  });
});

describe("event figures", () => {
  it("not done → actual 0", () => expect(eventFigures(line(), ev()).actual).toBe(0));
  it("done uses planned fallback", () =>
    expect(eventFigures(line(), ev({ status: "done" })).actual).toBe(4_500_000));
  it("rate variance alone", () => {
    const f = eventFigures(
      line({ quantity: 1, unitCostCents: 4_500_000, duration: 2 }),
      ev({ status: "done", actualUnitCostCents: 4_000_000 }),
    );
    expect(f.rateVariance).toBe(1_000_000);
    expect(f.volumeVariance).toBe(0);
  });
  it("volume + rate = planned − actual for random inputs", () => {
    for (let i = 0; i < 500; i++) {
      const r = () => Math.floor(Math.random() * 100) + 1;
      const l = line({ quantity: r(), unitCostCents: r() * 137, duration: (r() % 10) + 1 });
      const f = eventFigures(
        l,
        ev({
          status: "done",
          actualQuantity: r(),
          actualUnitCostCents: r() * 91,
          actualDuration: (r() % 7) + 1,
        }),
      );
      expect(f.volumeVariance + f.rateVariance).toBe(f.planned - f.actual);
    }
  });
});

describe("line summary", () => {
  const l = line();
  const evs = [
    ev({ sequence: 1, status: "done", actualQuantity: 30 }),
    ev({ sequence: 2, status: "cancelled" }),
    ev({ sequence: 3 }),
    ev({ sequence: 4 }),
  ];
  const s = lineSummary(l, evs);
  it("planned", () => expect(s.planned).toBe(18_000_000));
  it("actual to date", () => expect(s.actualToDate).toBe(5_400_000));
  it("variance on completed", () => expect(s.varianceOnCompleted).toBe(-900_000));
  it("remaining", () => expect(s.remaining).toBe(12_600_000));
  it("still to spend excludes cancelled", () => expect(s.stillToSpend).toBe(9_000_000));
  it("projected balance", () => expect(s.projectedBalance).toBe(3_600_000));
  it("released by cancellation", () => expect(s.releasedByCancellation).toBe(4_500_000));
  it("progress", () => expect(s.progressPct).toBeCloseTo(0.3));
  it("flags over budget and projected overrun", () => {
    const o = lineSummary(line({ occurrences: 1 }), [ev({ status: "done", actualQuantity: 30 })]);
    expect(lineFlags(o)).toEqual(["over-budget", "projected-overrun"]);
  });
});

describe("event flags", () => {
  it("overdue", () =>
    expect(eventFlags(ev({ plannedDate: "2026-11-03" }), 0, "2026-11-17")).toEqual(["overdue"]));
  it("no date", () => expect(eventFlags(ev(), 0, "2026-11-17")).toEqual(["no-date"]));
  it("done with evidence is clean", () =>
    expect(eventFlags(ev({ status: "done" }), 1, "2026-11-17")).toEqual([]));
});

describe("burn rate", () => {
  const period = {
    id: "p",
    projectName: "",
    name: "",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    fxRate: 125,
    currency: "KES",
    status: "open" as const,
  };
  const l = line({ occurrences: 2 });
  it("behind plan when spent is >10pp lower", () => {
    const b = burnRate(
      period,
      [l],
      [ev({ plannedDate: "2026-02-01" }), ev({ sequence: 2, plannedDate: "2026-11-01" })],
      "2026-07-01",
    );
    expect(b.plannedToDatePct).toBe(0.5);
    expect(b.spentPct).toBe(0);
    expect(b.status).toBe("Behind plan");
    expect(b.timeElapsedPct).toBeCloseTo(181 / 364);
  });
  it("on track within 10pp", () => {
    expect(
      burnRate(
        period,
        [l],
        [ev({ plannedDate: "2026-02-01", status: "done" }), ev({ sequence: 2 })],
        "2026-07-01",
      ).status,
    ).toBe("On track");
  });
  it("ahead of plan", () => {
    expect(
      burnRate(
        period,
        [l],
        [ev({ plannedDate: "2026-12-01", status: "done" }), ev({ sequence: 2 })],
        "2026-07-01",
      ).status,
    ).toBe("Ahead of plan");
  });
  it("time elapsed clamps", () =>
    expect(burnRate(period, [l], [], "2030-01-01").timeElapsedPct).toBe(1));
  it("cumulative series ends at actual total", () => {
    const s = makeSeed();
    const series = cumulativeByMonth(s.period!, s.lines, s.events);
    expect(series).toHaveLength(12);
    expect(series[11].actual).toBe(periodSummary(s.lines, s.events).actualToDate);
  });
});

describe("occurrence changes", () => {
  it("adds", () => expect(planOccurrenceChange([ev()], 3).add).toBe(2));
  it("removes highest planned first", () => {
    const evs = [
      ev({ id: "1", sequence: 1 }),
      ev({ id: "2", sequence: 2, status: "done" }),
      ev({ id: "3", sequence: 3 }),
    ];
    expect(planOccurrenceChange(evs, 2).removeIds).toEqual(["3"]);
    expect(planOccurrenceChange(evs, 1).removeIds).toEqual(["3", "1"]);
  });
  it("blocks when not enough planned", () => {
    expect(() =>
      planOccurrenceChange([ev({ status: "done" }), ev({ status: "cancelled" })], 1),
    ).toThrow();
  });
});

describe("scheduling", () => {
  it("clamps month ends without drifting", () => {
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");
    expect(scheduleDates("2026-01-31", 3, { every: 1, unit: "months" })).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });
  it("crosses the year", () =>
    expect(scheduleDates("2026-11-15", 3, { every: 2, unit: "months" })).toEqual([
      "2026-11-15",
      "2027-01-15",
      "2027-03-15",
    ]));
  it("repeats weekly", () =>
    expect(scheduleDates("2026-12-28", 2, { every: 2, unit: "weeks" })).toEqual([
      "2026-12-28",
      "2027-01-11",
    ]));
});

describe("event tabs", () => {
  const today = "2026-11-18";
  it("needs action covers overdue, undated and missing evidence", () => {
    expect(inEventTab(ev(), ["no-date"], "action", today)).toBe(true);
    expect(inEventTab(ev({ plannedDate: "2026-12-01" }), [], "action", today)).toBe(false);
  });
  it("this month matches planned or actual date", () => {
    expect(inEventTab(ev({ plannedDate: "2026-11-02" }), [], "month", today)).toBe(true);
    expect(
      inEventTab(
        ev({ plannedDate: "2026-10-30", actualDate: "2026-11-01", status: "done" }),
        [],
        "month",
        today,
      ),
    ).toBe(true);
    expect(inEventTab(ev({ plannedDate: "2026-12-02" }), [], "month", today)).toBe(false);
  });
  it("upcoming is planned within 60 days", () => {
    expect(inEventTab(ev({ plannedDate: "2027-01-10" }), [], "upcoming", today)).toBe(true);
    expect(inEventTab(ev({ plannedDate: "2027-02-10" }), [], "upcoming", today)).toBe(false);
    expect(inEventTab(ev({ plannedDate: "2026-11-01" }), [], "upcoming", today)).toBe(false);
  });
});

describe("line progress", () => {
  it("counts statuses and finds the next date", () => {
    const p = lineProgress(
      [
        ev({ status: "done", plannedDate: "2026-10-15" }),
        ev({ plannedDate: "2026-11-01" }),
        ev({ plannedDate: "2026-12-15" }),
        ev({ plannedDate: "2026-11-20" }),
        ev(),
        ev({ status: "cancelled" }),
      ],
      "2026-11-18",
    );
    expect(p).toEqual({ total: 6, done: 1, cancelled: 1, undated: 1, next: "2026-11-20" });
  });
});

describe("short formula", () => {
  const f = (p: Partial<BudgetLine>) =>
    formulaShort({
      quantity: 1,
      quantityUnit: "pax",
      unitCostCents: 100_00,
      duration: 1,
      durationUnit: "one-off",
      occurrences: 1,
      ...p,
    });
  it("reads monthly lines as months", () =>
    expect(
      f({ quantity: 600, quantityUnit: "units", durationUnit: "months", occurrences: 12 }),
    ).toBe("600 units × KES 100 × 12 months"));
  it("keeps days and repeats", () =>
    expect(f({ duration: 4, durationUnit: "days", occurrences: 2 })).toBe(
      "1 pax × KES 100 × 4 days × 2 times",
    ));
  it("drops one-off and groups thousands", () =>
    expect(f({ quantity: 15000, quantityUnit: "SMS" })).toBe("15,000 SMS × KES 100"));
});

describe("money", () => {
  it("formats", () => {
    expect(formatKES(123_456_700)).toBe("KES 1,234,567");
    expect(formatKES(110)).toBe("KES 1.10");
    expect(formatUSD(123_456_750, 125)).toBe("$9,876.54");
  });
  it("parses messy strings", () => {
    expect(parseMoney("Ksh120,000")).toBe(120000);
    expect(parseMoney(" Ksh\u00a030,000.00 ")).toBe(30000);
    expect(parseMoney("$923")).toBe(923);
    expect(parseMoney("n/a")).toBeNull();
  });
});

import { parseBudgetRows } from "./excel";
describe("excel import parsing", () => {
  it("reads blocks and messy money", () => {
    const { blocks, rows } = parseBudgetRows([
      ["Description", "Qty", "Unit", "Unit cost", "Days", "Frequency", "Total"],
      ["Platform costs", null, null, null, null, null, null],
      ["Airtime", "12", "pax", "Ksh1,200", 1, 12, " Ksh 172,800.00 "],
      ["Venue", 25, "pax", "$923", 1, 4, "Ksh120,000"],
    ]);
    expect(blocks.map((b) => b.heading)).toEqual(["Platform costs"]);
    expect(rows[0]).toMatchObject({
      quantity: 12,
      unitCost: 1200,
      occurrences: 12,
      fileAmount: 172800,
      durationUnit: "days",
    });
    expect(rows[1].unitCost).toBe(923);
  });
});

describe("a 30 September to 29 September year", () => {
  const per = (startDate: string, endDate: string) =>
    ({
      id: "p",
      projectName: "",
      name: "",
      startDate,
      endDate,
      fxRate: 1,
      currency: "KES",
      status: "open",
    }) as BudgetPeriod;
  it("has 12 months, October to September", () => {
    const m = periodMonths(per("2026-09-30", "2027-09-29"));
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2026-10");
    expect(m[11]).toBe("2027-09");
    expect(new Set(m).size).toBe(12);
  });
  it("has 12 months across a leap day", () => {
    const m = periodMonths(per("2027-09-30", "2028-09-29"));
    expect(m).toHaveLength(12);
    expect(m).toContain("2028-02");
  });
  it("counts activity on 30 Sep and 29 Sep inside the year", () => {
    const p = per("2026-09-30", "2027-09-29");
    const l = line({ id: "l", occurrences: 3 });
    const ev = (id: string, d: string): BudgetEvent => ({
      id,
      lineId: "l",
      sequence: 1,
      title: "t",
      status: "planned",
      plannedDate: d,
    });
    const series = cumulativeByMonth(
      p,
      [l],
      [ev("a", "2026-09-30"), ev("b", "2027-09-29"), ev("c", "2027-01-10")],
    );
    const one = eventPlanned(l);
    expect(series).toHaveLength(12);
    expect(series[0]!.planned).toBe(one);
    expect(series[11]!.planned).toBe(3 * one);
  });
  it("measures time elapsed over the 364 days", () => {
    const p = per("2026-09-30", "2027-09-29");
    expect(burnRate(p, [], [], "2026-09-30").timeElapsedPct).toBe(0);
    expect(burnRate(p, [], [], "2027-09-29").timeElapsedPct).toBe(1);
  });
});
