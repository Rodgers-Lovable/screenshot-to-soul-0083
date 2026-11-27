import type { AuditEntry, BudgetLine, Delivery, DeliveryResult, WorkplanData } from "@/lib/types";
import { activePeriodId, activeStudyId } from "../active-study";
import {
  currentUserLabel,
  getYear,
  loadRemote,
  loadWorkplan,
  syncRemote,
  syncWorkplan,
} from "../remote";
import type { StoreData } from "../store";

export const CLOSED = "This year is closed. A study admin can reopen it to make changes.";
export const NO_YEAR =
  "This study has no year yet. A study admin can create one under Settings, Years.";

// Working copy of one year's budget. Every write reloads it from Supabase, applies the change
// in memory, then writes only the rows that changed back. The study and year are captured
// before any await, and the working copy is only touched by synchronous code.
let state: StoreData | null = null;
let wstate: WorkplanData | null = null;
let actor = "coordinator";
let sink: AuditEntry[] | null = null;

export function db(): StoreData {
  if (!state) throw new Error("Budget not loaded");
  return state;
}
export function wdb(): WorkplanData {
  if (!wstate) throw new Error("Workplan not loaded");
  return wstate;
}
export interface Scope {
  study: string;
  period: string | null;
}
export const scopeNow = (): Scope => ({ study: activeStudyId(), period: activePeriodId() });

export async function tx<T>(fn: () => T, scope: Scope = scopeNow()): Promise<T> {
  const [data, who] = await Promise.all([
    loadRemote(scope.study, scope.period),
    currentUserLabel(),
  ]);
  if (data.period?.status === "closed") throw new Error(CLOSED);
  state = data;
  actor = who;
  sink = data.audit;
  const before = clone(data);
  let r: T;
  try {
    r = fn();
  } finally {
    state = null;
    sink = null;
  }
  await syncRemote(before, data, scope.study);
  return r;
}
/** Workplan writes. Site list changes are not tied to a year, so they skip the closed check. */
export async function wtx<T>(
  fn: () => T,
  opt: { sites?: boolean } = {},
  scope: Scope = scopeNow(),
): Promise<T> {
  if (!opt.sites && !scope.period) throw new Error(NO_YEAR);
  const [data, year, who] = await Promise.all([
    loadWorkplan(scope.study, opt.sites ? null : scope.period),
    opt.sites || !scope.period ? null : getYear(scope.study, scope.period),
    currentUserLabel(),
  ]);
  if (!opt.sites && !year) throw new Error(NO_YEAR);
  if (year?.status === "closed") throw new Error(CLOSED);
  wstate = data;
  actor = who;
  sink = data.audit;
  const before = clone(data);
  let r: T;
  try {
    r = fn();
  } finally {
    wstate = null;
    sink = null;
  }
  await syncWorkplan(before, data, scope.study);
  return r;
}
export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Math.random()).slice(2);
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const auditText = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? null
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);

export function audit(
  entity: string,
  entityId: string,
  field: string,
  oldValue: unknown,
  newValue: unknown,
) {
  if (!sink) throw new Error("No write in progress");
  sink.push({
    id: uid(),
    entity,
    entityId,
    field,
    oldValue: auditText(oldValue),
    newValue: auditText(newValue),
    changedAt: new Date().toISOString(),
    changedBy: actor,
  });
}
export function auditCreate(entity: string, rec: object & { id: string }) {
  for (const [k, v] of Object.entries(rec))
    if (k !== "id" && v !== undefined) audit(entity, rec.id, k, null, v);
}
export function applyPatch<T extends { id: string }>(entity: string, rec: T, patch: Partial<T>) {
  for (const [k, v] of Object.entries(patch) as [keyof T & string, T[keyof T & string]][]) {
    if (k === "id") continue;
    if (auditText(rec[k]) !== auditText(v)) {
      audit(entity, rec.id, k, rec[k], v);
      rec[k] = v;
    }
  }
}
export const read = async <T>(f: (d: StoreData) => T): Promise<T> => {
  const { study, period } = scopeNow();
  return clone(f(await loadRemote(study, period)));
};

export const found = <T>(row: T | undefined, what: string): T => {
  if (!row) throw new Error(`${what} not found`);
  return row;
};

/** Lines and deliveries of the active year, read before a change so protected items can be refused. */
export async function budgetSnapshot(scope: Scope) {
  if (!scope.period)
    return {
      lines: [] as BudgetLine[],
      deliveries: [] as Delivery[],
      results: [] as DeliveryResult[],
    };
  const { lines, deliveries, results } = await loadRemote(scope.study, scope.period);
  return { lines, deliveries, results };
}
export const activityOf = (id: string) =>
  found(
    wdb().activities.find((a) => a.id === id),
    "Activity",
  );
