import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreData } from "./store";

type Call = { table: string; op: string; rows?: Record<string, unknown>[]; eq?: unknown[] };
const calls: Call[] = [];
let loadRows: Record<string, unknown>[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => ({
    upsert: (rows: Record<string, unknown>[]) => {
      calls.push({ table, op: "upsert", rows });
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
        in: () => Promise.resolve({ error: null }),
      };
      return chain;
    },
    select: () => {
      const chain = {
        eq: () => chain,
        order: () => chain,
        range: () => Promise.resolve({ data: loadRows, error: null }),
      };
      return chain;
    },
  });
  return { supabase: { from, storage: { from: () => ({ remove: async () => ({}) }) } } };
});

import { loadRemote, syncRemote } from "./remote";

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
  loadRows = [];
});

describe("syncRemote", () => {
  it("stamps the study on every upserted row, audit included", async () => {
    const after = empty();
    after.period = {
      id: "p",
      projectName: "x",
      name: "y",
      startDate: "",
      endDate: "",
      fxRate: 125,
    };
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
    const upserts = calls.filter((c) => c.op === "upsert");
    expect(upserts.map((c) => c.table)).toEqual(["budget_periods", "components", "audit_log"]);
    for (const c of upserts) for (const r of c.rows ?? []) expect(r.study_id).toBe("study-1");
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

describe("loadRemote", () => {
  it("keeps study_id out of loaded rows so it cannot leak into audit entries", async () => {
    loadRows = [
      { id: "l", component_id: "c", description: "d", study_id: "study-1", unit_cost_cents: 5 },
    ];
    const d = await loadRemote("study-1");
    expect(d.lines[0]).not.toHaveProperty("studyId");
    expect(d.lines[0]).not.toHaveProperty("study_id");
    expect(d.lines[0]?.unitCostCents).toBe(5);
  });
});
