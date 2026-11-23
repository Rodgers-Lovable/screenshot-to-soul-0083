import { describe, expect, it } from "vitest";
import { livestockFixture, pbidsFixture, PBIDS_TOTAL_CENTS } from "@/test/fixtures";
import { linePlanned, lineSummary, sumSummaries } from "./calc";
import { buildExportSheets } from "./excel";
import {
  activityOptions,
  buildBudgetTree,
  cleanUnit,
  exportRows,
  filterBudgetTree,
  fundedDeleteMessage,
  isOneOff,
  linesUnder,
  unitSuggestions,
  validateLineActivity,
  validateLineMove,
} from "./budget-tree";
import { durationLabel, formulaShort } from "./format";
import type { BudgetPeriod } from "./types";

const period: BudgetPeriod = {
  id: "p1",
  projectName: "Study",
  name: "FY 2026/27",
  startDate: "2026-09-30",
  endDate: "2027-09-29",
  fxRate: 125,
  currency: "KES",
  status: "open",
};
const tree = (f = pbidsFixture()) =>
  buildBudgetTree(f.objectives, f.outcomes, f.activities, f.lines, f.events);

describe("budget tree subtotals", () => {
  it("rolls lines up to activity, outcome, objective and the year, in integer cents", () => {
    const t = tree();
    const total = sumSummaries(t.map((o) => o.summary));
    expect(total.planned).toBe(PBIDS_TOTAL_CENTS);
    expect(Number.isInteger(total.planned)).toBe(true);
    const o2 = t[1]!;
    expect(o2.summary.planned).toBe(
      o2.outcomes.flatMap((oc) => oc.activities).reduce((n, a) => n + a.summary.planned, 0),
    );
    const a1 = t[0]!.outcomes[0]!.activities[0]!;
    expect(a1.summary.planned).toBe(
      Math.round(10000 * 80 * 1 * 12) + Math.round(1 * 1_850_000 * 1 * 12),
    );
  });
  it("keeps sub-cent rates exact", () => {
    const f = pbidsFixture();
    expect(linePlanned(f.lines.find((l) => l.description === "Bulk SMS for survey")!)).toBe(
      12000 * 106 * 6,
    );
  });
  it("marks activities with no lines as unfunded, not as errors", () => {
    const a7 = tree()[2]!.outcomes[0]!.activities.find((a) => a.activity.id === "a7")!;
    expect(a7.funded).toBe(false);
    expect(a7.summary.planned).toBe(0);
  });
  it("counts actuals from done events in the subtotals", () => {
    const f = pbidsFixture();
    const e = f.events.find((x) => x.lineId === "l4")!;
    e.status = "done";
    const t = tree(f);
    const total = sumSummaries(t.map((o) => o.summary));
    expect(total.actualToDate).toBe(lineSummary(f.lines[3]!, f.events).actualToDate);
    expect(total.actualToDate).toBeGreaterThan(0);
  });
  it("orders by sort order and then code", () => {
    const f = pbidsFixture();
    f.objectives[0]!.sortOrder = 9;
    expect(tree(f).map((o) => o.objective.id)).toEqual(["o2", "o3", "o1"]);
  });
  it("works for a differently shaped study", () => {
    const t = tree(livestockFixture());
    const total = sumSummaries(t.map((o) => o.summary));
    expect(total.planned).toBe(5000 * 45 * 4 + 2 * 1_234_500 * 3);
    const acts = t[0]!.outcomes[0]!.activities;
    expect(acts.map((a) => a.funded)).toEqual([true, true, false]);
  });
});

describe("filters", () => {
  it("filters by funding and keeps the objective and outcome above a match", () => {
    const unfunded = filterBudgetTree(tree(), { funding: "unfunded" });
    expect(unfunded).toHaveLength(1);
    expect(unfunded[0]!.outcomes[0]!.activities.map((a) => a.activity.id)).toEqual(["a7"]);
    const funded = filterBudgetTree(tree(), { funding: "funded" });
    expect(
      funded.flatMap((o) => o.outcomes.flatMap((oc) => oc.activities)).some((a) => !a.funded),
    ).toBe(false);
  });
  it("filters by activity and by search text, leaving other lines out", () => {
    const one = filterBudgetTree(tree(), { activityId: "a4" });
    expect(
      one.flatMap((o) => o.outcomes.flatMap((oc) => oc.activities)).map((a) => a.activity.id),
    ).toEqual(["a4"]);
    const hit = filterBudgetTree(tree(), { search: "interviewers" });
    const acts = hit.flatMap((o) => o.outcomes.flatMap((oc) => oc.activities));
    expect(acts).toHaveLength(1);
    expect(acts[0]!.lines.map((l) => l.description)).toEqual(["Field interviewers"]);
    expect(filterBudgetTree(tree(), { search: "nothing like this" })).toEqual([]);
  });
  it("returns the tree untouched without filters", () => {
    const t = tree();
    expect(filterBudgetTree(t, {})).toBe(t);
  });
});

describe("moving lines", () => {
  const f = pbidsFixture();
  const chain = { objectives: f.objectives, outcomes: f.outcomes, activities: f.activities };
  it("allows a move to another activity of the same year", () => {
    expect(validateLineMove({ activityId: "a1" }, "a5", chain)).toBeNull();
  });
  it("refuses the same activity, an unknown one and one in another year", () => {
    expect(validateLineMove({ activityId: "a1" }, "a1", chain)).toMatch(/already/);
    expect(validateLineMove({ activityId: "a1" }, "zzz", chain)).toMatch(/not in this year/);
    const other = {
      objectives: [
        ...f.objectives,
        { id: "ox", periodId: "p2", code: "", title: "Other", sortOrder: 1 },
      ],
      outcomes: [
        ...f.outcomes,
        { id: "ocx", objectiveId: "ox", code: "", title: "O", sortOrder: 1 },
      ],
      activities: [...f.activities, { ...f.activities[0]!, id: "ax", outcomeId: "ocx" }],
    };
    expect(validateLineMove({ activityId: "a1" }, "ax", other)).toMatch(/another year/);
  });
  it("requires an activity in the active year for a new line", () => {
    expect(validateLineActivity("", "p1", chain)).toMatch(/Choose/);
    expect(validateLineActivity("a3", "p1", chain)).toBeNull();
    expect(validateLineActivity("a3", "p2", chain)).toMatch(/another year/);
    expect(validateLineActivity("nope", "p1", chain)).toMatch(/not in this year/);
  });
  it("lists activities in workplan order with objective and outcome groups", () => {
    const o = activityOptions(chain);
    expect(o).toHaveLength(7);
    expect(o[0]).toEqual({
      id: "a1",
      label: "1.1.1. Maintain short codes",
      group: "1. Strengthen alert reporting / 1.1. Platform running",
    });
  });
});

describe("deleting funded items", () => {
  const f = pbidsFixture();
  it("explains what to do first", () => {
    const n = linesUnder(["a1"], f.lines);
    expect(n).toBe(2);
    expect(fundedDeleteMessage("activity", n)).toMatch(/has 2 budget lines.*Move the lines/);
    expect(fundedDeleteMessage("outcome", 3)).toMatch(/Outcome cannot be deleted/);
    expect(fundedDeleteMessage("objective", 1)).toMatch(/have 1 budget line\./);
  });
  it("allows unfunded items", () => {
    expect(fundedDeleteMessage("activity", linesUnder(["a7"], f.lines))).toBeNull();
  });
});

describe("units", () => {
  it("cleans free text", () => {
    expect(cleanUnit("  cold   boxes ")).toBe("cold boxes");
    expect(cleanUnit("   ")).toBeNull();
  });
  it("suggests standard values first, then the ones used, without repeats", () => {
    expect(unitSuggestions(["pax", "sets"], ["doses", "PAX", "boxes", " doses "])).toEqual([
      "pax",
      "sets",
      "boxes",
      "doses",
    ]);
  });
  it("treats only one-off as special, whatever its case", () => {
    expect(isOneOff("one-off")).toBe(true);
    expect(isOneOff(" One-Off ")).toBe(true);
    expect(isOneOff("weeks")).toBe(false);
  });
  it("keeps calc and labels correct for free-text duration units", () => {
    const line = livestockFixture().lines[1]!;
    expect(linePlanned(line)).toBe(2 * 1_234_500 * 3);
    expect(durationLabel(3, "weeks")).toBe("3 weeks");
    expect(durationLabel(1, "one-off")).toBe("one-off");
    expect(durationLabel(1, "days")).toBe("1 day");
    expect(formulaShort(line)).toBe("2 boxes × KES 12,345 × 3 weeks");
  });
});

describe("exports", () => {
  it("groups lines by objective, outcome and activity and keeps totals", () => {
    const f = pbidsFixture();
    const s = buildExportSheets(period, f, []);
    expect(s.budget[0]!.slice(0, 3)).toEqual(["Objective", "Outcome", "Activity"]);
    const body = s.budget.slice(1, -1);
    expect(body).toHaveLength(f.lines.length);
    expect(body[0]!.slice(0, 3)).toEqual([
      "1. Strengthen alert reporting",
      "1.1. Platform running",
      "1.1.1. Maintain short codes",
    ]);
    const grand = s.budget[s.budget.length - 1]!;
    expect(grand[11]).toBe(PBIDS_TOTAL_CENTS / 100);
    const sumTotal = s.summary[s.summary.length - 1]!;
    expect(sumTotal[3]).toBe("");
    expect(sumTotal[4]).toBe(5_875_204);
    const sum = body.reduce((n, r) => n + (r[11] as number), 0);
    expect(Math.round(sum * 100)).toBe(PBIDS_TOTAL_CENTS);
  });
  it("shows subtotals per activity, outcome and objective, and unfunded activities", () => {
    const s = buildExportSheets(period, pbidsFixture(), []);
    const labels = s.summary.map((r) => r[3]);
    expect(labels.filter((l) => l === "ACTIVITY TOTAL (unfunded)")).toHaveLength(1);
    expect(labels.filter((l) => l === "OUTCOME TOTAL")).toHaveLength(3);
    expect(labels.filter((l) => l === "OBJECTIVE TOTAL")).toHaveLength(3);
  });
  it("adds the activity to every event row", () => {
    const f = livestockFixture();
    const s = buildExportSheets(period, f, []);
    expect(s.events[0]!.slice(0, 4)).toEqual(["Objective", "Outcome", "Activity", "Line"]);
    expect(s.events).toHaveLength(1 + f.events.length);
    expect(s.events[1]![2]).toBe("Run vaccination rounds");
  });
  it("lists rows in workplan order", () => {
    const rows = exportRows(tree());
    expect(rows.map((r) => r.line.id)).toEqual(["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8"]);
  });
});
