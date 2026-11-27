import { describe, expect, it } from "vitest";
import type { Activity, Objective, Outcome } from "@/lib/types";
import {
  buildTree,
  duplicateCodes,
  filterTree,
  findOverlap,
  frequencyText,
  moveWithin,
  multiAddMessage,
  parseMultiEntry,
  nextSortOrder,
  pickDefaultYear,
  suggestNextYear,
  yearLabel,
  validateRepeat,
  validateYear,
} from "./workplan";

const yr = (id: string, startDate: string, endDate: string, status = "open") => ({
  id,
  startDate,
  endDate,
  status,
  name: id,
});

describe("pickDefaultYear", () => {
  const years = [
    yr("y1", "2025-01-01", "2025-12-31", "closed"),
    yr("y2", "2026-01-01", "2026-12-31"),
    yr("y3", "2027-01-01", "2027-12-31"),
  ];
  it("returns null with no years", () => {
    expect(pickDefaultYear([], "2026-05-01")).toBeNull();
  });
  it("uses a saved id that belongs to the study", () => {
    expect(pickDefaultYear(years, "2026-05-01", "y1")?.id).toBe("y1");
  });
  it("ignores a saved id from another study", () => {
    expect(pickDefaultYear(years, "2026-05-01", "other")?.id).toBe("y2");
  });
  it("prefers the open year that contains today", () => {
    expect(pickDefaultYear(years, "2027-02-01")?.id).toBe("y3");
  });
  it("skips a closed year even when it contains today", () => {
    const only = [
      yr("a", "2026-01-01", "2026-12-31", "closed"),
      yr("b", "2020-01-01", "2020-12-31"),
    ];
    expect(pickDefaultYear(only, "2026-05-01")?.id).toBe("a");
  });
  it("falls back to the latest start date", () => {
    expect(pickDefaultYear(years, "2030-01-01")?.id).toBe("y3");
  });
  it("copes with years that have no dates", () => {
    expect(pickDefaultYear([yr("x", "", "")], "2026-01-01")?.id).toBe("x");
  });
});

describe("findOverlap and validateYear", () => {
  const years = [yr("y1", "2026-01-01", "2026-12-31")];
  it("treats shared end days as overlap and adjacent days as fine", () => {
    expect(findOverlap(years, "2026-12-31", "2027-06-30")?.id).toBe("y1");
    expect(findOverlap(years, "2027-01-01", "2027-12-31")).toBeNull();
    expect(findOverlap(years, "2025-01-01", "2025-12-31")).toBeNull();
    expect(findOverlap(years, "2025-06-01", "2026-01-01")?.id).toBe("y1");
  });
  it("ignores the year being edited", () => {
    expect(findOverlap(years, "2026-02-01", "2026-03-01", "y1")).toBeNull();
  });
  it("ignores years without real dates", () => {
    expect(findOverlap([yr("z", "", "")], "2026-01-01", "2026-02-01")).toBeNull();
  });
  const ok = {
    name: "Y",
    startDate: "2027-01-01",
    endDate: "2027-12-31",
    fxRate: 130,
    currency: "KES",
  };
  it("accepts a good year and names each problem", () => {
    expect(validateYear(ok, years)).toBeNull();
    expect(validateYear({ ...ok, name: " " }, years)).toMatch(/name/);
    expect(validateYear({ ...ok, startDate: "" }, years)).toMatch(/start and end/);
    expect(validateYear({ ...ok, endDate: "2027-01-01" }, years)).toMatch(/after the start/);
    expect(validateYear({ ...ok, fxRate: 0 }, years)).toMatch(/exchange rate/);
    expect(validateYear({ ...ok, currency: "KS" }, years)).toMatch(/currency/);
    expect(validateYear({ ...ok, startDate: "2026-06-01" }, years)).toMatch(/overlap "y1"/);
  });
});

const obj = (id: string, sortOrder: number, code = ""): Objective => ({
  id,
  periodId: "p",
  code,
  title: id,
  sortOrder,
});
const out = (id: string, objectiveId: string, sortOrder: number, code = ""): Outcome => ({
  id,
  objectiveId,
  code,
  title: id,
  sortOrder,
});
const act = (
  id: string,
  outcomeId: string,
  sortOrder: number,
  code = "",
  kind: Activity["kind"] = "general",
): Activity => ({
  id,
  outcomeId,
  code,
  title: id,
  kind,
  output: "",
  meansOfVerification: "",
  frequencyLabel: "",
  notes: "",
  sortOrder,
});

describe("buildTree", () => {
  it("orders each level by sort order, then code naturally", () => {
    const tree = buildTree(
      [obj("o2", 2), obj("o1", 1)],
      [out("c2", "o1", 1, "1.10"), out("c1", "o1", 1, "1.2"), out("c3", "o2", 1)],
      [act("a2", "c1", 1, "x"), act("a1", "c1", 1, "a")],
    );
    expect(tree.map((o) => o.objective.id)).toEqual(["o1", "o2"]);
    expect(tree[0]!.outcomes.map((o) => o.outcome.id)).toEqual(["c1", "c2"]);
    expect(tree[0]!.outcomes[0]!.activities.map((a) => a.id)).toEqual(["a1", "a2"]);
  });
  it("leaves out rows whose parent is missing", () => {
    const tree = buildTree([obj("o1", 1)], [out("c1", "gone", 1)], [act("a1", "gone", 1)]);
    expect(tree[0]!.outcomes).toEqual([]);
  });
});

describe("filterTree", () => {
  const tree = buildTree(
    [obj("o1", 1, "1")],
    [out("c1", "o1", 1, "1.1")],
    [act("visit", "c1", 1, "1.1.1", "site"), act("train", "c1", 2, "1.1.2", "general")],
  );
  it("returns the tree untouched with no filter", () => {
    expect(filterTree(tree, { kind: "all", search: " " })).toBe(tree);
  });
  it("filters by kind and drops empty parents", () => {
    const r = filterTree(tree, { kind: "site" });
    expect(r[0]!.outcomes[0]!.activities.map((a) => a.id)).toEqual(["visit"]);
    expect(filterTree([...tree], { kind: "site", search: "train" })).toEqual([]);
  });
  it("searches title and code, case-blind", () => {
    expect(filterTree(tree, { search: "TRAIN" })[0]!.outcomes[0]!.activities).toHaveLength(1);
    expect(filterTree(tree, { search: "1.1.2" })[0]!.outcomes[0]!.activities[0]!.id).toBe("train");
  });
  it("keeps every activity when an outcome matches", () => {
    expect(filterTree(tree, { search: "c1" })[0]!.outcomes[0]!.activities).toHaveLength(2);
  });
});

describe("duplicateCodes", () => {
  it("flags repeats, ignoring case, spaces and blanks", () => {
    const d = duplicateCodes([
      { code: "1.1" },
      { code: " 1.1 " },
      { code: "" },
      { code: "" },
      { code: "A" },
    ]);
    expect([...d]).toEqual(["1.1"]);
  });
});

describe("validateRepeat", () => {
  it("accepts none or a full rule", () => {
    expect(validateRepeat()).toBeNull();
    expect(validateRepeat(null, null)).toBeNull();
    expect(validateRepeat(2, "weeks")).toBeNull();
  });
  it("rejects half a rule and bad numbers", () => {
    expect(validateRepeat(2, null)).toMatch(/both/);
    expect(validateRepeat(undefined, "months")).toMatch(/both/);
    expect(validateRepeat(0, "weeks")).toMatch(/above zero/);
    expect(validateRepeat(1.5, "weeks")).toMatch(/whole number/);
  });
});

describe("ordering helpers", () => {
  const items = [obj("a", 1), obj("b", 2), obj("c", 3)];
  it("next sort order", () => {
    expect(nextSortOrder([])).toBe(1);
    expect(nextSortOrder(items)).toBe(4);
  });
  it("moves down and up", () => {
    expect(moveWithin(items, "a", "down")).toEqual([
      { id: "b", sortOrder: 1 },
      { id: "a", sortOrder: 2 },
    ]);
    expect(moveWithin(items, "c", "up")).toEqual([
      { id: "c", sortOrder: 2 },
      { id: "b", sortOrder: 3 },
    ]);
  });
  it("does nothing at the ends or for unknown ids", () => {
    expect(moveWithin(items, "a", "up")).toEqual([]);
    expect(moveWithin(items, "c", "down")).toEqual([]);
    expect(moveWithin(items, "zz", "up")).toEqual([]);
  });
  it("renumbers ties so the order sticks", () => {
    const tied = [obj("a", 1), obj("b", 1)];
    expect(moveWithin(tied, "b", "up")).toEqual([{ id: "a", sortOrder: 2 }]);
  });
});

describe("frequencyText", () => {
  it("joins label and rule", () => {
    expect(frequencyText("Quarterly", 3, "months")).toBe("Quarterly (every 3 months)");
    expect(frequencyText("", 1, "weeks")).toBe("Every 1 week");
    expect(frequencyText("Ad hoc")).toBe("Ad hoc");
    expect(frequencyText("")).toBe("");
  });
});

describe("suggestNextYear", () => {
  it("starts the next day and lasts a year", () => {
    expect(suggestNextYear({ startDate: "2026-01-01", endDate: "2026-12-31" })).toEqual({
      name: "2027",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
    });
  });
  it("handles a year that crosses calendar years and leap days", () => {
    expect(suggestNextYear({ startDate: "2026-07-01", endDate: "2027-06-30" })).toEqual({
      name: "2027/2028",
      startDate: "2027-07-01",
      endDate: "2028-06-30",
    });
    expect(suggestNextYear({ startDate: "2027-03-01", endDate: "2028-02-29" })?.endDate).toBe(
      "2029-02-28",
    );
  });
  it("keeps the length of a short period", () => {
    expect(suggestNextYear({ startDate: "2026-01-01", endDate: "2026-06-30" })?.startDate).toBe(
      "2026-07-01",
    );
  });
  it("gives nothing for missing dates", () => {
    expect(suggestNextYear({ startDate: "", endDate: "" })).toBeNull();
  });
  it("labels a year", () => {
    expect(yearLabel("2026-01-01", "2026-12-31")).toBe("2026");
  });
});

describe("parseMultiEntry", () => {
  it("splits, trims and collapses spaces", () => {
    expect(parseMultiEntry("Philip, Kadenge ,  Lorna  Ann").add).toEqual([
      "Philip",
      "Kadenge",
      "Lorna Ann",
    ]);
  });
  it("drops blanks", () => {
    expect(parseMultiEntry(" , a,, ,b,").add).toEqual(["a", "b"]);
    expect(parseMultiEntry(" , ").add).toEqual([]);
  });
  it("removes duplicates inside the entry, ignoring case", () => {
    expect(parseMultiEntry("Ann, ann, ANN, Bob")).toEqual({
      add: ["Ann", "Bob"],
      skipped: ["ann", "ANN"],
    });
  });
  it("skips names already on the activity", () => {
    expect(parseMultiEntry("Ann, Bob", ["  ann "])).toEqual({ add: ["Bob"], skipped: ["Ann"] });
  });
  it("keeps a single value", () => {
    expect(parseMultiEntry("Ann")).toEqual({ add: ["Ann"], skipped: [] });
  });
});

describe("multiAddMessage", () => {
  it("counts added and skipped", () => {
    expect(multiAddMessage("person", "people", 3, 0)).toBe("3 people added");
    expect(multiAddMessage("person", "people", 1, 2)).toBe("1 person added, 2 duplicates skipped");
  });
  it("says when all are duplicates", () => {
    expect(multiAddMessage("person", "people", 0, 2)).toBe(
      "Nothing added: all are already on this activity.",
    );
  });
});
