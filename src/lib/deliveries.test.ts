import { describe, expect, it } from "vitest";
import {
  activityStatus,
  deliveryDeleteBlock,
  deliveryFlags,
  deliveryProgress,
  filterDeliveries,
  filterTreeByStatus,
  groupByRound,
  indicatorTotals,
  isDuplicateRound,
  linkableEvents,
  missingEvidence,
  nextRound,
  offerRoundDone,
  parentDeleteBlock,
  planRounds,
  progressText,
  roundDates,
  roundText,
  deliveryLabel,
  validateDelivery,
  validateEventLink,
  validateRounds,
} from "./deliveries";
import type { BudgetEvent, BudgetLine, Delivery, DeliveryStatus } from "./types";

const del = (id: string, status: DeliveryStatus, extra: Partial<Delivery> = {}): Delivery => ({
  id,
  activityId: "a",
  roundNumber: 1,
  roundLabel: "",
  status,
  notes: "",
  ...extra,
});

describe("activityStatus", () => {
  it("is planned with no deliveries or none started", () => {
    expect(activityStatus([])).toBe("planned");
    expect(activityStatus([del("1", "planned"), del("2", "planned")])).toBe("planned");
  });
  it("is completed only when every delivery is completed", () => {
    expect(activityStatus([del("1", "completed"), del("2", "completed")])).toBe("completed");
    expect(activityStatus([del("1", "completed")])).toBe("completed");
  });
  it("is in progress for anything else", () => {
    expect(activityStatus([del("1", "in_progress")])).toBe("in_progress");
    expect(activityStatus([del("1", "completed"), del("2", "planned")])).toBe("in_progress");
    expect(activityStatus([del("1", "in_progress"), del("2", "completed")])).toBe("in_progress");
  });
});

describe("progress", () => {
  it("counts each status and formats it for the tree", () => {
    const p = deliveryProgress([
      del("1", "completed"),
      del("2", "completed"),
      del("3", "in_progress"),
      del("4", "planned"),
      del("5", "planned"),
    ]);
    expect(p).toEqual({ total: 5, planned: 2, inProgress: 1, completed: 2 });
    expect(progressText(p)).toBe("2 of 5");
    expect(progressText(deliveryProgress([]))).toBe("");
  });
});

describe("planRounds", () => {
  const sites = [
    { id: "s1", archived: false },
    { id: "s2", archived: false },
    { id: "s3", archived: true },
  ];
  it("makes one delivery per active site per round for a site activity", () => {
    const p = planRounds({ kind: "site", rounds: 2, sites, existing: [] });
    expect(p.create).toHaveLength(4);
    expect(p.create.map((c) => `${c.roundNumber}:${c.siteId}`)).toEqual([
      "1:s1",
      "1:s2",
      "2:s1",
      "2:s2",
    ]);
    expect(p.archivedSites).toBe(1);
  });
  it("makes one delivery per round with no site for a general activity", () => {
    const p = planRounds({ kind: "general", rounds: 3, sites: [], existing: [] });
    expect(p.create).toEqual([
      { roundNumber: 1, siteId: undefined, plannedDate: undefined },
      { roundNumber: 2, siteId: undefined, plannedDate: undefined },
      { roundNumber: 3, siteId: undefined, plannedDate: undefined },
    ]);
  });
  it("only adds missing combinations, so running it again never duplicates", () => {
    const first = planRounds({ kind: "site", rounds: 2, sites, existing: [] });
    const existing = first.create.map((c) => ({ roundNumber: c.roundNumber, siteId: c.siteId }));
    const again = planRounds({ kind: "site", rounds: 2, sites, existing });
    expect(again.create).toEqual([]);
    expect(again.existing).toBe(4);
    const more = planRounds({ kind: "site", rounds: 3, sites, existing });
    expect(more.create.map((c) => c.roundNumber)).toEqual([3, 3]);
  });
  it("fills in a site that was added later", () => {
    const existing = [{ roundNumber: 1, siteId: "s1" }];
    const p = planRounds({ kind: "site", rounds: 1, sites, existing });
    expect(p.create.map((c) => c.siteId)).toEqual(["s2"]);
    expect(p.existing).toBe(1);
  });
  it("treats a general activity's missing site as one combination", () => {
    const p = planRounds({ kind: "general", rounds: 2, sites: [], existing: [{ roundNumber: 1 }] });
    expect(p.create.map((c) => c.roundNumber)).toEqual([2]);
  });
  it("dates rounds from the first date by the repeat rule", () => {
    const p = planRounds({
      kind: "general",
      rounds: 3,
      sites: [],
      existing: [],
      firstDate: "2026-11-30",
      repeat: { every: 1, unit: "months" },
    });
    expect(p.create.map((c) => c.plannedDate)).toEqual(["2026-11-30", "2026-12-30", "2027-01-30"]);
  });
  it("dates only round one without a repeat rule", () => {
    expect(roundDates("2026-11-30", 3)).toEqual(["2026-11-30", undefined, undefined]);
    expect(roundDates(undefined, 2, { every: 1, unit: "weeks" })).toEqual([undefined, undefined]);
    expect(roundDates("bad", 1)).toEqual([undefined]);
  });
  it("counts dates outside the year as a warning", () => {
    const p = planRounds({
      kind: "general",
      rounds: 3,
      sites: [],
      existing: [],
      firstDate: "2027-09-01",
      repeat: { every: 1, unit: "months" },
      year: { startDate: "2026-09-30", endDate: "2027-09-29" },
    });
    expect(p.outsideYear).toBe(2);
    expect(p.create).toHaveLength(3);
  });
  it("makes nothing for a site activity with no active sites", () => {
    const p = planRounds({
      kind: "site",
      rounds: 2,
      sites: [{ id: "s", archived: true }],
      existing: [],
    });
    expect(p.create).toEqual([]);
  });
});

describe("validateRounds", () => {
  it("needs a whole number above zero, a sane limit and a site for site activities", () => {
    expect(validateRounds(0, "general", 0)).toMatch(/whole number/);
    expect(validateRounds(1.5, "general", 0)).toMatch(/whole number/);
    expect(validateRounds(101, "general", 0)).toMatch(/at most/);
    expect(validateRounds(2, "site", 0)).toMatch(/active site/);
    expect(validateRounds(2, "site", 1)).toBeNull();
    expect(validateRounds(2, "general", 0)).toBeNull();
  });
});

describe("rounds", () => {
  const ex = [
    { id: "1", roundNumber: 1, siteId: "s1" },
    { id: "2", roundNumber: 2, siteId: "s1" },
    { id: "3", roundNumber: 1, siteId: "s2" },
  ];
  it("finds the next free round per site", () => {
    expect(nextRound(ex, "s1")).toBe(3);
    expect(nextRound(ex, "s2")).toBe(2);
    expect(nextRound(ex, "s9")).toBe(1);
    expect(nextRound([{ roundNumber: 4 }])).toBe(5);
  });
  it("detects a duplicate, including a general activity with no site", () => {
    expect(isDuplicateRound(ex, 1, "s1")).toBe(true);
    expect(isDuplicateRound(ex, 1, "s1", "1")).toBe(false);
    expect(isDuplicateRound(ex, 3, "s1")).toBe(false);
    expect(isDuplicateRound([{ id: "g", roundNumber: 1 }], 1)).toBe(true);
    expect(isDuplicateRound([{ id: "g", roundNumber: 1 }], 1, "s1")).toBe(false);
  });
  it("groups by round with sites in name order", () => {
    const names: Record<string, string> = { s1: "Beta", s2: "Alpha" };
    const g = groupByRound(
      [
        del("a", "planned", { roundNumber: 2, siteId: "s1" }),
        del("b", "planned", { roundNumber: 1, siteId: "s1", roundLabel: "Baseline" }),
        del("c", "planned", { roundNumber: 1, siteId: "s2" }),
      ],
      (id) => names[id ?? ""] ?? "",
    );
    expect(g.map((r) => r.roundNumber)).toEqual([1, 2]);
    expect(g[0]?.items.map((i) => i.id)).toEqual(["c", "b"]);
    expect(g[0]?.label).toBe("Baseline");
    expect(roundText(del("x", "planned", { roundNumber: 2, roundLabel: " Midline " }))).toBe(
      "Round 2: Midline",
    );
    expect(roundText(del("x", "planned"))).toBe("Round 1");
  });
  it("labels a round with its site", () => {
    const names: Record<string, string> = { s1: "Kisumu" };
    const name = (id: string) => names[id];
    expect(deliveryLabel(del("x", "planned", { siteId: "s1" }), name)).toBe("Round 1 at Kisumu");
    expect(deliveryLabel(del("x", "planned", { siteId: "gone" }), name)).toBe("Round 1 at a site");
    expect(deliveryLabel(del("x", "planned"), name)).toBe("Round 1");
  });
  it("filters by site and status", () => {
    const list = [
      del("a", "planned", { siteId: "s1" }),
      del("b", "completed", { siteId: "s1" }),
      del("c", "completed", { siteId: "s2" }),
    ];
    expect(filterDeliveries(list, { siteId: "s1" }).map((d) => d.id)).toEqual(["a", "b"]);
    expect(filterDeliveries(list, { status: "completed" }).map((d) => d.id)).toEqual(["b", "c"]);
    expect(filterDeliveries(list, { siteId: "s2", status: "completed" })).toHaveLength(1);
    expect(filterDeliveries(list, {})).toHaveLength(3);
  });
});

describe("flags", () => {
  it("flags a completed delivery without proof, not a planned one", () => {
    expect(missingEvidence(del("1", "completed"), 0)).toBe(true);
    expect(missingEvidence(del("1", "completed"), 1)).toBe(false);
    expect(missingEvidence(del("1", "in_progress"), 0)).toBe(false);
    expect(deliveryFlags(del("1", "completed"), 0, "2026-12-01")).toEqual(["missing-evidence"]);
  });
  it("flags an unfinished delivery whose planned date has passed", () => {
    const late = del("1", "in_progress", { plannedDate: "2026-11-01" });
    expect(deliveryFlags(late, 0, "2026-12-01")).toEqual(["overdue"]);
    expect(
      deliveryFlags(del("1", "planned", { plannedDate: "2026-12-01" }), 0, "2026-12-01"),
    ).toEqual([]);
    expect(
      deliveryFlags(del("1", "completed", { plannedDate: "2026-11-01" }), 1, "2026-12-01"),
    ).toEqual([]);
  });
});

describe("validateDelivery", () => {
  it("requires an actual date to complete", () => {
    expect(validateDelivery({ status: "completed" })).toMatch(/date/);
    expect(validateDelivery({ status: "completed", actualDate: "2026-11-20" })).toBeNull();
    expect(validateDelivery({ status: "planned" })).toBeNull();
    expect(validateDelivery({ status: "in_progress", plannedDate: "2026-1-1" })).toMatch(/dates/);
    expect(validateDelivery({ status: "done" as DeliveryStatus })).toMatch(/Choose/);
  });
});

describe("delete checks", () => {
  it("blocks while spending is linked, then while proof exists", () => {
    expect(deliveryDeleteBlock({ linkedSpending: 2, proofFiles: 1 })).toMatch(/2 spending records/);
    expect(deliveryDeleteBlock({ linkedSpending: 1, proofFiles: 0 })).toMatch(
      /1 spending record linked/,
    );
    expect(deliveryDeleteBlock({ linkedSpending: 0, proofFiles: 3 })).toMatch(/3 proof files/);
    expect(deliveryDeleteBlock({ linkedSpending: 0, proofFiles: 1 })).toMatch(
      /1 proof file\. Remove it/,
    );
    expect(deliveryDeleteBlock({ linkedSpending: 0, proofFiles: 0 })).toBeNull();
  });
  it("blocks deleting a parent that holds deliveries", () => {
    expect(parentDeleteBlock("activity", 0)).toBeNull();
    expect(parentDeleteBlock("activity", 1)).toMatch(/has 1 round\./);
    expect(parentDeleteBlock("outcome", 3)).toMatch(/activities with 3 rounds/);
    expect(parentDeleteBlock("objective", 2)).toMatch(/before deleting the objective/);
  });
});

describe("spending links", () => {
  const line = (id: string, activityId: string): BudgetLine => ({
    id,
    activityId,
    description: id,
    quantity: 1,
    quantityUnit: "u",
    unitCostCents: 1,
    duration: 1,
    durationUnit: "one-off",
    occurrences: 1,
    sortOrder: 1,
  });
  const ev = (id: string, lineId: string, deliveryId?: string): BudgetEvent => ({
    id,
    lineId,
    sequence: 1,
    title: id,
    status: "planned",
    deliveryId,
  });
  it("links only within one activity", () => {
    expect(validateEventLink(line("l", "a"), { id: "d", activityId: "a" }, {})).toBeNull();
    expect(validateEventLink(line("l", "b"), { id: "d", activityId: "a" }, {})).toMatch(
      /same activity/,
    );
    expect(validateEventLink(undefined, { id: "d", activityId: "a" }, {})).toMatch(/not found/);
  });
  it("refuses a record that is linked to another delivery", () => {
    const d = { id: "d", activityId: "a" };
    expect(validateEventLink(line("l", "a"), d, { deliveryId: "d" })).toBeNull();
    expect(validateEventLink(line("l", "a"), d, { deliveryId: "other" })).toMatch(/already linked/);
  });
  it("offers unlinked records from every line of the activity", () => {
    const lines = [line("l1", "a"), line("l2", "a"), line("l3", "b")];
    const events = [ev("e1", "l1"), ev("e2", "l2"), ev("e3", "l3"), ev("e4", "l1", "d")];
    expect(linkableEvents("a", lines, events).map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});

describe("indicatorTotals", () => {
  it("adds results per indicator against the target", () => {
    const ind = [
      { id: "i2", activityId: "a", name: "Quality", sortOrder: 2 },
      { id: "i1", activityId: "a", name: "Visits", target: 10, sortOrder: 1 },
    ];
    const t = indicatorTotals(ind, [
      { deliveryId: "d1", indicatorId: "i1", value: 4, notes: "" },
      { deliveryId: "d2", indicatorId: "i1", value: 3.5, notes: "" },
      { deliveryId: "d2", indicatorId: "i2", value: 2, notes: "" },
    ]);
    expect(t.map((x) => x.indicator.id)).toEqual(["i1", "i2"]);
    expect(t[0]).toMatchObject({ total: 7.5, target: 10, percent: 75, recorded: 2 });
    expect(t[1]).toMatchObject({ total: 2, recorded: 1 });
    expect(t[1]?.percent).toBeUndefined();
  });
  it("shows zero when nothing is recorded", () => {
    const t = indicatorTotals(
      [{ id: "i", activityId: "a", name: "N", target: 5, sortOrder: 1 }],
      [],
    );
    expect(t[0]).toMatchObject({ total: 0, percent: 0, recorded: 0 });
  });
});

describe("filterTreeByStatus", () => {
  const act = (id: string) => ({
    id,
    outcomeId: "oc",
    code: "",
    title: id,
    kind: "general" as const,
    output: "",
    meansOfVerification: "",
    frequencyLabel: "",
    notes: "",
    sortOrder: 1,
  });
  const tree = [
    {
      objective: { id: "o", periodId: "p", code: "", title: "O", sortOrder: 1 },
      outcomes: [
        {
          outcome: { id: "oc", objectiveId: "o", code: "", title: "OC", sortOrder: 1 },
          activities: [act("a1"), act("a2")],
        },
      ],
    },
  ];
  const status = (id: string): DeliveryStatus => (id === "a1" ? "completed" : "planned");
  it("keeps everything for all, else only matching activities and their parents", () => {
    expect(filterTreeByStatus(tree, "all", status)).toBe(tree);
    const done = filterTreeByStatus(tree, "completed", status);
    expect(done[0]?.outcomes[0]?.activities.map((a) => a.id)).toEqual(["a1"]);
    expect(filterTreeByStatus(tree, "in_progress", status)).toEqual([]);
  });
});

describe("offerRoundDone", () => {
  it("offers a linked round that is not done yet", () => {
    expect(offerRoundDone("done", { status: "planned" }, "2026-11-03")).toBe(true);
    expect(offerRoundDone("done", { status: "in_progress" }, "2026-11-03")).toBe(true);
  });
  it("never offers a round that is already done", () => {
    expect(offerRoundDone("done", { status: "completed" }, "2026-11-03")).toBe(false);
  });
  it("offers only when the record is marked done with a date", () => {
    expect(offerRoundDone("planned", { status: "planned" }, "2026-11-03")).toBe(false);
    expect(offerRoundDone("cancelled", { status: "planned" }, "2026-11-03")).toBe(false);
    expect(offerRoundDone("done", undefined, "2026-11-03")).toBe(false);
    expect(offerRoundDone("done", { status: "planned" }, "")).toBe(false);
  });
});
