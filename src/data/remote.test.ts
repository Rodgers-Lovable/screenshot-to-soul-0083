import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BudgetPeriod, WorkplanData } from "@/lib/types";
import type { StoreData } from "./store";

type Call = {
  table: string;
  op: string;
  rows?: Record<string, unknown>[];
  eq?: unknown[];
  in?: unknown[];
};
const calls: Call[] = [];
let tableRows: Record<string, Record<string, unknown>[]> = {};
let rpcImpl: (fn: string) => unknown = () => ({ data: null, error: null });

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => ({
    upsert: (rows: Record<string, unknown>[]) => {
      calls.push({ table, op: "upsert", rows });
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
  const rpc = (fn: string) => rpcImpl(fn);
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
const empty = (): StoreData => ({
  period: null,
  components: [],
  lines: [],
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
    after.components = [{ id: "c", periodId: "p", code: "1", name: "C", sortOrder: 1 }];
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
    expect(writes.map((c) => c.table)).toEqual(["components", "audit_log"]);
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
    before.components = [{ id: "c", periodId: "p", code: "1", name: "C", sortOrder: 1 }];
    const after = empty();
    await syncRemote(before, after, "study-2");
    expect(calls.some((c) => c.op === "upsert")).toBe(false);
    const del = calls.find((c) => c.table === "components" && c.op === "delete");
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
      components: [{ id: "c", period_id: "p", study_id: "study-1" }],
      budget_lines: [
        { id: "l", component_id: "c", description: "d", study_id: "study-1", unit_cost_cents: 5 },
      ],
    };
    const d = await loadRemote("study-1", "p");
    expect(d.lines[0]).not.toHaveProperty("studyId");
    expect(d.lines[0]).not.toHaveProperty("study_id");
    expect(d.lines[0]?.unitCostCents).toBe(5);
    expect(d.period?.status).toBe("open");
  });

  it("returns an empty budget and reads nothing when the study has no year", async () => {
    const d = await loadRemote("study-1", null);
    expect(d.period).toBeNull();
    expect(d.components).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("reads only the chosen year and reaches children through their parents", async () => {
    tableRows = {
      budget_periods: [{ id: "p2", study_id: "study-1" }],
      components: [{ id: "c2", period_id: "p2" }],
      budget_lines: [{ id: "l2", component_id: "c2" }],
      budget_events: [{ id: "e2", line_id: "l2" }],
    };
    await loadRemote("study-1", "p2");
    const sel = (t: string) => calls.find((c) => c.table === t && c.op === "select");
    expect(sel("budget_periods")?.eq).toContainEqual(["id", "p2"]);
    expect(sel("components")?.eq).toContainEqual(["period_id", "p2"]);
    expect(sel("budget_lines")?.in).toEqual(["component_id", ["c2"]]);
    expect(sel("budget_events")?.in).toEqual(["line_id", ["l2"]]);
    expect(sel("attachments")?.in).toEqual(["event_id", ["e2"]]);
  });

  it("returns an empty budget when the year is not in the study", async () => {
    tableRows = { components: [{ id: "c", period_id: "x" }] };
    const d = await loadRemote("study-1", "x");
    expect(d.period).toBeNull();
    expect(d.components).toEqual([]);
    expect(calls.some((c) => c.table === "budget_lines")).toBe(false);
  });

  it("does not read child tables when a year has no components", async () => {
    tableRows = { budget_periods: [{ id: "p3" }] };
    await loadRemote("study-1", "p3");
    expect(calls.some((c) => c.table === "budget_lines")).toBe(false);
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
