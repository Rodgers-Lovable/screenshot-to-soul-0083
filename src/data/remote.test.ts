import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BudgetPeriod, WorkplanData } from "@/lib/types";
import type { StoreData } from "./store";

type Call = {
  table: string;
  op: string;
  rows?: Record<string, unknown>[];
  eq?: unknown[];
  in?: unknown[];
  onConflict?: string;
};
const calls: Call[] = [];
let tableRows: Record<string, Record<string, unknown>[]> = {};
let rpcImpl: (fn: string, a?: unknown) => unknown = () => ({ data: null, error: null });

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => ({
    upsert: (rows: Record<string, unknown>[], opts?: { onConflict?: string }) => {
      calls.push({ table, op: "upsert", rows, onConflict: opts?.onConflict });
      return Promise.resolve({ error: null });
    },
    insert: (rows: Record<string, unknown>[]) => {
      calls.push({ table, op: "insert", rows });
      return Promise.resolve({ error: null });
    },
    delete: () => {
      const call: Call = { table, op: "delete", eq: [] };
      calls.push(call);
      const chain = {
        eq: (...a: unknown[]) => {
          call.eq?.push(a);
          return chain;
        },
        in: (...a: unknown[]) => {
          call.in = a;
          return Promise.resolve({ error: null });
        },
        then: (f: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(f),
      };
      return chain;
    },
    select: () => {
      const call: Call = { table, op: "select", eq: [] };
      calls.push(call);
      const chain = {
        eq: (...a: unknown[]) => {
          call.eq?.push(a);
          return chain;
        },
        in: (...a: unknown[]) => {
          call.in = a;
          return chain;
        },
        order: () => chain,
        range: () => Promise.resolve({ data: tableRows[table] ?? [], error: null }),
      };
      return chain;
    },
  });
  const rpc = (fn: string, a?: unknown) => rpcImpl(fn, a);
  return {
    supabase: {
      from,
      rpc,
      auth: { getSession: async () => ({ data: { session: null } }) },
      storage: { from: () => ({ remove: async () => ({}) }) },
    },
  };
});

import {
  createYear,
  isPlatformAdmin,
  loadRemote,
  loadWorkplan,
  syncRemote,
  syncWorkplan,
} from "./remote";

const year: BudgetPeriod = {
  id: "p",
  projectName: "x",
  name: "y",
  startDate: "",
  endDate: "",
  fxRate: 125,
  currency: "KES",
  status: "open",
};
const line = (id: string): StoreData["lines"][number] => ({
  id,
  activityId: "a",
  description: "d",
  quantity: 1,
  quantityUnit: "doses",
  unitCostCents: 5,
  duration: 1,
  durationUnit: "one-off",
  occurrences: 1,
  sortOrder: 1,
});
const empty = (): StoreData => ({
  period: null,
  objectives: [],
  outcomes: [],
  activities: [],
  sites: [],
  activitySites: [],
  indicators: [],
  lines: [],
  deliveries: [],
  results: [],
  events: [],
  attachments: [],
  audit: [],
});

beforeEach(() => {
  calls.length = 0;
  tableRows = {};
});

describe("syncRemote", () => {
  it("stamps the study on every upserted row, audit included", async () => {
    const after = empty();
    after.period = year;
    after.lines = [line("l")];
    after.audit = [
      {
        id: "a",
        entity: "period",
        entityId: "p",
        field: "name",
        oldValue: null,
        newValue: "y",
        changedAt: "t",
        changedBy: "me",
      },
    ];
    await syncRemote(empty(), after, "study-1");
    const writes = calls.filter((c) => c.op === "upsert" || c.op === "insert");
    expect(writes.map((c) => c.table)).toEqual(["budget_lines", "audit_log"]);
    for (const c of writes) for (const r of c.rows ?? []) expect(r.study_id).toBe("study-1");
  });

  it("inserts audit rows and never upserts them", async () => {
    const after = empty();
    after.audit = [
      {
        id: "a",
        entity: "line",
        entityId: "l",
        field: "x",
        oldValue: null,
        newValue: "y",
        changedAt: "t",
        changedBy: "me",
      },
    ];
    await syncRemote(empty(), after, "study-1");
    expect(calls.filter((c) => c.table === "audit_log").map((c) => c.op)).toEqual(["insert"]);
  });

  it("skips unchanged rows and scopes deletes to the study", async () => {
    const before = empty();
    before.lines = [line("l")];
    const after = empty();
    await syncRemote(before, after, "study-2");
    expect(calls.some((c) => c.op === "upsert")).toBe(false);
    const del = calls.find((c) => c.table === "budget_lines" && c.op === "delete");
    expect(del?.eq).toEqual([["study_id", "study-2"]]);
  });
});

const emptyWork = (): WorkplanData => ({
  sites: [],
  objectives: [],
  outcomes: [],
  activities: [],
  indicators: [],
  responsibles: [],
  activitySites: [],
  audit: [],
});

describe("syncRemote and years", () => {
  it("never writes the year row, even when it changed", async () => {
    const before = empty();
    before.period = { ...year, name: "Old" };
    const after = empty();
    after.period = { ...year, name: "New" };
    await syncRemote(before, after, "study-1");
    expect(calls.some((c) => c.table === "budget_periods")).toBe(false);
  });
});

describe("loadRemote", () => {
  it("keeps study_id out of loaded rows so it cannot leak into audit entries", async () => {
    tableRows = {
      budget_periods: [{ id: "p", study_id: "study-1", status: "open", currency: "KES" }],
      objectives: [{ id: "o", period_id: "p", study_id: "study-1", title: "O" }],
      outcomes: [{ id: "oc", objective_id: "o", study_id: "study-1", title: "OC" }],
      activities: [{ id: "a", outcome_id: "oc", study_id: "study-1", title: "A" }],
      budget_lines: [
        {
          id: "l",
          activity_id: "a",
          description: "d",
          study_id: "study-1",
          unit_cost_cents: 5,
          copied_from_id: "old",
        },
      ],
    };
    const d = await loadRemote("study-1", "p");
    expect(d.lines[0]).not.toHaveProperty("studyId");
    expect(d.lines[0]).not.toHaveProperty("study_id");
    expect(d.lines[0]?.unitCostCents).toBe(5);
    expect(d.lines[0]?.activityId).toBe("a");
    expect(d.lines[0]?.copiedFromId).toBe("old");
    expect(d.activities[0]?.id).toBe("a");
    expect(d.period?.status).toBe("open");
  });

  it("returns an empty budget and reads nothing when the study has no year", async () => {
    const d = await loadRemote("study-1", null);
    expect(d.period).toBeNull();
    expect(d.activities).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("reads only the chosen year and reaches children through their parents", async () => {
    tableRows = {
      budget_periods: [{ id: "p2", study_id: "study-1" }],
      objectives: [{ id: "o2", period_id: "p2" }],
      outcomes: [{ id: "oc2", objective_id: "o2" }],
      activities: [{ id: "a2", outcome_id: "oc2" }],
      budget_lines: [{ id: "l2", activity_id: "a2" }],
      budget_events: [{ id: "e2", line_id: "l2" }],
    };
    await loadRemote("study-1", "p2");
    const sel = (t: string) => calls.find((c) => c.table === t && c.op === "select");
    expect(sel("budget_periods")?.eq).toContainEqual(["id", "p2"]);
    expect(sel("objectives")?.eq).toContainEqual(["period_id", "p2"]);
    expect(sel("outcomes")?.in).toEqual(["objective_id", ["o2"]]);
    expect(sel("activities")?.in).toEqual(["outcome_id", ["oc2"]]);
    expect(sel("budget_lines")?.in).toEqual(["activity_id", ["a2"]]);
    const order = calls.filter((c) => c.op === "select").map((c) => c.table);
    expect(order.indexOf("objectives")).toBeLessThan(order.indexOf("outcomes"));
    expect(order.indexOf("outcomes")).toBeLessThan(order.indexOf("activities"));
    expect(order.indexOf("activities")).toBeLessThan(order.indexOf("budget_lines"));
    expect(calls.some((c) => c.table === "components")).toBe(false);
    expect(sel("budget_events")?.in).toEqual(["line_id", ["l2"]]);
    expect(sel("attachments")?.in).toEqual(["event_id", ["e2"]]);
  });

  it("reads deliveries through the activities, and their results and proof through them", async () => {
    tableRows = {
      budget_periods: [{ id: "p2" }],
      objectives: [{ id: "o2", period_id: "p2" }],
      outcomes: [{ id: "oc2", objective_id: "o2" }],
      activities: [{ id: "a2", outcome_id: "oc2" }],
      deliveries: [
        { id: "d1", activity_id: "a2", site_id: "s1", round_number: 2, round_label: "" },
      ],
      delivery_indicator_results: [{ delivery_id: "d1", indicator_id: "i1", value: 4, notes: "" }],
      budget_lines: [{ id: "l2", activity_id: "a2" }],
      budget_events: [{ id: "e2", line_id: "l2", delivery_id: "d1" }],
      attachments: [{ id: "at1", delivery_id: "d1", file_name: "p.pdf" }],
    };
    const d = await loadRemote("study-1", "p2");
    const sel = (t: string) => calls.filter((c) => c.table === t && c.op === "select");
    expect(sel("deliveries")[0]?.in).toEqual(["activity_id", ["a2"]]);
    expect(sel("delivery_indicator_results")[0]?.in).toEqual(["delivery_id", ["d1"]]);
    expect(sel("attachments").map((c) => c.in?.[0])).toEqual(["event_id", "delivery_id"]);
    expect(d.deliveries[0]).toMatchObject({ siteId: "s1", roundNumber: 2 });
    expect(d.results).toEqual([{ deliveryId: "d1", indicatorId: "i1", value: 4, notes: "" }]);
    expect(d.events[0]?.deliveryId).toBe("d1");
    expect(d.attachments.map((a) => a.deliveryId)).toContain("d1");
  });

  it("does not read deliveries when a year has no activities", async () => {
    tableRows = { budget_periods: [{ id: "p4" }] };
    await loadRemote("study-1", "p4");
    expect(calls.some((c) => c.table === "deliveries")).toBe(false);
  });

  it("returns an empty budget when the year is not in the study", async () => {
    tableRows = { objectives: [{ id: "o", period_id: "x" }] };
    const d = await loadRemote("study-1", "x");
    expect(d.period).toBeNull();
    expect(d.activities).toEqual([]);
    expect(calls.some((c) => c.table === "budget_lines")).toBe(false);
  });

  it("does not read lines when a year has no activities", async () => {
    tableRows = { budget_periods: [{ id: "p3" }] };
    await loadRemote("study-1", "p3");
    expect(calls.some((c) => c.table === "budget_lines")).toBe(false);
  });
});

describe("syncRemote deliveries", () => {
  const delivery = (id: string): StoreData["deliveries"][number] => ({
    id,
    activityId: "a",
    siteId: "s",
    roundNumber: 1,
    roundLabel: "",
    status: "planned",
    notes: "",
  });
  const event = (id: string, deliveryId?: string): StoreData["events"][number] => ({
    id,
    lineId: "l",
    sequence: 1,
    title: "t",
    status: "planned",
    deliveryId,
  });
  it("writes a new delivery before the spending and proof that point at it", async () => {
    const after = empty();
    after.deliveries = [delivery("d")];
    after.results = [{ deliveryId: "d", indicatorId: "i", value: 3, notes: "" }];
    after.events = [event("e", "d")];
    after.attachments = [
      {
        id: "at",
        deliveryId: "d",
        fileName: "p",
        fileUrl: "storage:x",
        mimeType: "",
        sizeBytes: 1,
        uploadedAt: "t",
      },
    ];
    await syncRemote(empty(), after, "study-1");
    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual([
      "deliveries:upsert",
      "delivery_indicator_results:upsert",
      "budget_events:upsert",
      "attachments:upsert",
    ]);
    expect(calls[1]?.onConflict).toBe("delivery_id,indicator_id");
    expect(calls[1]?.rows?.[0]).toMatchObject({
      study_id: "study-1",
      delivery_id: "d",
      indicator_id: "i",
      value: 3,
    });
    expect(calls[3]?.rows?.[0]).toMatchObject({ delivery_id: "d", event_id: null });
  });

  it("unlinks spending before it deletes the delivery, and deletes proof and results first", async () => {
    const before = empty();
    before.deliveries = [delivery("d")];
    before.results = [{ deliveryId: "d", indicatorId: "i", value: 3, notes: "" }];
    before.events = [event("e", "d")];
    before.attachments = [
      {
        id: "at",
        deliveryId: "d",
        fileName: "p",
        fileUrl: "storage:x",
        mimeType: "",
        sizeBytes: 1,
        uploadedAt: "t",
      },
    ];
    const after = JSON.parse(JSON.stringify(before)) as StoreData;
    after.deliveries = [];
    after.results = [];
    after.attachments = [];
    delete after.events[0]?.deliveryId;
    await syncRemote(before, after, "study-1");
    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual([
      "budget_events:upsert",
      "delivery_indicator_results:delete",
      "attachments:delete",
      "deliveries:delete",
    ]);
    expect(calls[0]?.rows?.[0]).toMatchObject({ id: "e", delivery_id: null });
    expect(calls[1]?.eq).toEqual([
      ["study_id", "study-1"],
      ["delivery_id", "d"],
      ["indicator_id", "i"],
    ]);
  });

  it("skips unchanged deliveries and results", async () => {
    const same = empty();
    same.deliveries = [delivery("d")];
    same.results = [{ deliveryId: "d", indicatorId: "i", value: 3, notes: "" }];
    await syncRemote(same, JSON.parse(JSON.stringify(same)), "study-1");
    expect(calls).toEqual([]);
  });

  it("updates a changed result value", async () => {
    const before = empty();
    before.results = [{ deliveryId: "d", indicatorId: "i", value: 3, notes: "" }];
    const after = JSON.parse(JSON.stringify(before)) as StoreData;
    after.results[0]!.value = 5;
    await syncRemote(before, after, "study-1");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.rows?.[0]).toMatchObject({ value: 5 });
  });
});

describe("loadWorkplan", () => {
  it("reads sites for the study and the tree only for the chosen year", async () => {
    tableRows = {
      sites: [{ id: "s", name: "A", sort_order: 1 }],
      objectives: [{ id: "o", period_id: "p", code: "1", title: "T", copied_from_id: "old" }],
      outcomes: [{ id: "oc", objective_id: "o" }],
      activities: [{ id: "a", outcome_id: "oc", means_of_verification: "Report" }],
      activity_sites: [{ activity_id: "a", site_id: "s" }],
    };
    const w = await loadWorkplan("study-1", "p");
    const sel = (t: string) => calls.find((c) => c.table === t && c.op === "select");
    expect(sel("objectives")?.eq).toContainEqual(["period_id", "p"]);
    expect(sel("outcomes")?.in).toEqual(["objective_id", ["o"]]);
    expect(sel("activities")?.in).toEqual(["outcome_id", ["oc"]]);
    expect(sel("activity_sites")?.in).toEqual(["activity_id", ["a"]]);
    expect(w.objectives[0]?.copiedFromId).toBe("old");
    expect(w.activities[0]?.meansOfVerification).toBe("Report");
    expect(w.activitySites).toEqual([{ activityId: "a", siteId: "s" }]);
  });

  it("with no year, returns only the site list", async () => {
    tableRows = { sites: [{ id: "s", name: "A", sort_order: 1 }] };
    const w = await loadWorkplan("study-1", null);
    expect(w.sites).toHaveLength(1);
    expect(w.objectives).toEqual([]);
    expect(calls.map((c) => c.table)).toEqual(["sites"]);
  });

  it("splits long id lists into several requests", async () => {
    tableRows = {
      objectives: [{ id: "o" }],
      outcomes: Array.from({ length: 250 }, (_, i) => ({ id: `oc${i}`, objective_id: "o" })),
    };
    await loadWorkplan("study-1", "p");
    expect(calls.filter((c) => c.table === "activities" && c.op === "select")).toHaveLength(3);
  });
});

describe("syncWorkplan", () => {
  const act = (id: string, kind: "site" | "general") => ({
    id,
    outcomeId: "oc",
    code: "",
    title: id,
    kind,
    output: "",
    meansOfVerification: "",
    frequencyLabel: "",
    notes: "",
    sortOrder: 1,
  });
  it("clears site links before a kind change and adds links after the activity exists", async () => {
    const before = emptyWork();
    before.activities = [act("a1", "site")];
    before.activitySites = [{ activityId: "a1", siteId: "s1" }];
    const after = emptyWork();
    after.activities = [act("a1", "general"), act("a2", "site")];
    after.activitySites = [{ activityId: "a2", siteId: "s2" }];
    await syncWorkplan(before, after, "study-1");
    const order = calls.map((c) => `${c.table}:${c.op}`);
    expect(order).toEqual(["activity_sites:delete", "activities:upsert", "activity_sites:insert"]);
    expect(calls[2]?.rows).toEqual([{ study_id: "study-1", activity_id: "a2", site_id: "s2" }]);
  });

  it("stamps the study, deletes children before parents and scopes deletes", async () => {
    const before = emptyWork();
    before.objectives = [{ id: "o", periodId: "p", code: "", title: "T", sortOrder: 1 }];
    before.outcomes = [{ id: "oc", objectiveId: "o", code: "", title: "T", sortOrder: 1 }];
    const after = emptyWork();
    after.sites = [{ id: "s", name: "A", sortOrder: 1 }];
    await syncWorkplan(before, after, "study-9");
    const order = calls.map((c) => `${c.table}:${c.op}`);
    expect(order).toEqual(["sites:upsert", "outcomes:delete", "objectives:delete"]);
    expect(calls[0]?.rows?.[0]?.study_id).toBe("study-9");
    expect(calls[1]?.eq).toEqual([["study_id", "study-9"]]);
  });

  it("skips unchanged rows", async () => {
    const same = emptyWork();
    same.sites = [{ id: "s", name: "A", sortOrder: 1 }];
    await syncWorkplan(same, JSON.parse(JSON.stringify(same)), "study-1");
    expect(calls).toEqual([]);
  });
});

describe("createYear", () => {
  it("calls the database function with named arguments", async () => {
    let args: unknown;
    rpcImpl = (fn: string) => {
      args = fn;
      return Promise.resolve({ data: "new-id", error: null });
    };
    const id = await createYear(
      "study-1",
      { name: "Y", startDate: "2027-01-01", endDate: "2027-12-31", fxRate: 130, currency: "KES" },
      "old",
    );
    expect(id).toBe("new-id");
    expect(args).toBe("create_workplan_year");
  });
  it("copies budget lines only when asked and a source year is given", async () => {
    const seen: Record<string, unknown>[] = [];
    rpcImpl = (_fn, a) => {
      seen.push(a as Record<string, unknown>);
      return Promise.resolve({ data: "id", error: null });
    };
    const v = {
      name: "Y",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      fxRate: 1,
      currency: "KES",
    };
    await createYear("s", v, "old");
    await createYear("s", v, "old", true);
    await createYear("s", v, null, true);
    expect(seen.map((a) => a._copy_budget_lines)).toEqual([false, true, false]);
  });
  it("turns a database error into an Error with its message", async () => {
    rpcImpl = () => Promise.resolve({ data: null, error: { message: "These dates overlap" } });
    await expect(
      createYear(
        "s",
        { name: "Y", startDate: "a", endDate: "b", fxRate: 1, currency: "KES" },
        null,
      ),
    ).rejects.toThrow("These dates overlap");
  });
});

describe("isPlatformAdmin", () => {
  it("is true only for a true answer", async () => {
    rpcImpl = () => Promise.resolve({ data: true, error: null });
    expect(await isPlatformAdmin()).toBe(true);
    rpcImpl = () => Promise.resolve({ data: false, error: null });
    expect(await isPlatformAdmin()).toBe(false);
  });

  it("fails closed on an error or a thrown request", async () => {
    rpcImpl = () => Promise.resolve({ data: true, error: { message: "boom" } });
    expect(await isPlatformAdmin()).toBe(false);
    rpcImpl = () => Promise.reject(new Error("offline"));
    expect(await isPlatformAdmin()).toBe(false);
  });
});
