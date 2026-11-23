// Repository interfaces backed by Supabase.
// UI must only reach these through hooks in src/data/hooks.ts.
import type {
  Activity,
  ActivityIndicator,
  ActivityResponsible,
  Attachment,
  AuditEntry,
  BudgetEvent,
  BudgetLine,
  BudgetPeriod,
  Component,
  Objective,
  Outcome,
  Site,
  Study,
  StudyMember,
  WorkplanData,
} from "@/lib/types";
import { planOccurrenceChange } from "@/lib/calc";
import { moveWithin, nextSortOrder, validateRepeat } from "@/lib/workplan";
import { eventTitle, type StoreData } from "./store";

export interface PeriodRepo {
  get(): Promise<BudgetPeriod | null>;
  /** Admins only. Goes through a database function, never a direct table write. */
  update(patch: Partial<BudgetPeriod>): Promise<void>;
}
export interface YearRepo {
  list(studyId: string): Promise<BudgetPeriod[]>;
  create(studyId: string, v: YearInput, copyFromId: string | null): Promise<string>;
  setStatus(id: string, status: "open" | "closed"): Promise<void>;
}
export type ObjectiveInput = Pick<Objective, "code" | "title">;
export type OutcomeInput = Pick<Outcome, "code" | "title">;
export type ActivityInput = Pick<Activity, "code" | "title" | "kind"> &
  Partial<
    Pick<
      Activity,
      "output" | "meansOfVerification" | "frequencyLabel" | "repeatEvery" | "repeatUnit" | "notes"
    >
  >;
export type MoveDir = "up" | "down";
export interface WorkplanRepo {
  get(): Promise<Omit<WorkplanData, "audit">>;
  addObjective(input: ObjectiveInput): Promise<Objective>;
  updateObjective(id: string, patch: Partial<ObjectiveInput>): Promise<Objective>;
  removeObjective(id: string): Promise<void>;
  moveObjective(id: string, dir: MoveDir): Promise<void>;
  addOutcome(objectiveId: string, input: OutcomeInput): Promise<Outcome>;
  updateOutcome(id: string, patch: Partial<OutcomeInput>): Promise<Outcome>;
  removeOutcome(id: string): Promise<void>;
  moveOutcome(id: string, dir: MoveDir): Promise<void>;
  addActivity(outcomeId: string, input: ActivityInput): Promise<Activity>;
  /** Changing a site activity to general clears its sites in the same write. */
  updateActivity(id: string, patch: Partial<ActivityInput>): Promise<Activity>;
  removeActivity(id: string): Promise<void>;
  moveActivity(id: string, dir: MoveDir): Promise<void>;
  addIndicator(activityId: string, input: { name: string; target?: number }): Promise<void>;
  updateIndicator(id: string, patch: { name?: string; target?: number | null }): Promise<void>;
  removeIndicator(id: string): Promise<void>;
  addResponsible(activityId: string, input: { name: string; userId?: string }): Promise<void>;
  updateResponsible(id: string, patch: { name?: string; userId?: string | null }): Promise<void>;
  removeResponsible(id: string): Promise<void>;
  setActivitySites(activityId: string, siteIds: string[]): Promise<void>;
}
export interface SiteRepo {
  add(name: string): Promise<Site>;
  rename(id: string, name: string): Promise<void>;
  setArchived(id: string, archived: boolean): Promise<void>;
}
export interface ComponentRepo {
  list(): Promise<Component[]>;
  create(input: Omit<Component, "id" | "periodId" | "sortOrder">): Promise<Component>;
  update(id: string, patch: Partial<Component>): Promise<Component>;
  remove(id: string): Promise<void>;
}
export type LineInput = Omit<BudgetLine, "id" | "sortOrder">;
export interface LineRepo {
  list(): Promise<BudgetLine[]>;
  create(input: LineInput): Promise<BudgetLine>;
  update(id: string, patch: Partial<BudgetLine>): Promise<BudgetLine>;
  duplicate(id: string): Promise<BudgetLine>;
  remove(id: string): Promise<void>;
}
export interface EventRepo {
  list(): Promise<BudgetEvent[]>;
  update(id: string, patch: Partial<BudgetEvent>): Promise<BudgetEvent>;
  /** Sets planned dates by sequence. Done and cancelled events are left alone. */
  schedule(lineId: string, dates: { sequence: number; plannedDate?: string }[]): Promise<number>;
}
export interface AttachmentRepo {
  list(): Promise<Attachment[]>;
  add(eventId: string, file: File, label?: string): Promise<Attachment>;
  remove(id: string): Promise<void>;
}
export interface AuditRepo {
  list(): Promise<AuditEntry[]>;
}
export interface StudyRepo {
  list(): Promise<Study[]>;
  canCreate(): Promise<boolean>;
  myEmail(): Promise<string>;
  create(name: string): Promise<string>;
  members(studyId: string): Promise<StudyMember[]>;
  addMember(studyId: string, email: string): Promise<boolean>;
  removeMember(studyId: string, userId: string): Promise<void>;
  setAdmin(studyId: string, userId: string, isAdmin: boolean): Promise<void>;
}
export interface AdminRepo {
  importLines(
    rows: { component: { id?: string; name: string }; line: Omit<LineInput, "componentId"> }[],
  ): Promise<number>;
}

import {
  loadRemote,
  syncRemote,
  uploadEvidence,
  signUrls,
  currentUserLabel,
  listAudit,
  removeEvidence,
  loadWorkplan,
  syncWorkplan,
  getYear,
  listYears,
  createYear,
  updateYear,
  setYearStatus,
  type YearInput,
  listStudies,
  isPlatformAdmin,
  createStudy,
  listStudyMembers,
  addStudyMember,
  removeStudyMember,
  setStudyAdmin,
} from "./remote";
import { activePeriodId, activeStudyId } from "./active-study";

const CLOSED = "This year is closed. A study admin can reopen it to make changes.";
const NO_YEAR = "This study has no year yet. A study admin can create one under Settings, Years.";

// Working copy of one year's budget. Every write reloads it from Supabase, applies the change
// in memory, then writes only the rows that changed back. The study and year are captured
// before any await, and the working copy is only touched by synchronous code.
let state: StoreData | null = null;
let wstate: WorkplanData | null = null;
let actor = "coordinator";
let sink: AuditEntry[] | null = null;

function db(): StoreData {
  if (!state) throw new Error("Budget not loaded");
  return state;
}
function wdb(): WorkplanData {
  if (!wstate) throw new Error("Workplan not loaded");
  return wstate;
}
interface Scope {
  study: string;
  period: string | null;
}
const scopeNow = (): Scope => ({ study: activeStudyId(), period: activePeriodId() });

async function tx<T>(fn: () => T, scope: Scope = scopeNow()): Promise<T> {
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
async function wtx<T>(
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
const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Math.random()).slice(2);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const str = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? null
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);

function audit(
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
    oldValue: str(oldValue),
    newValue: str(newValue),
    changedAt: new Date().toISOString(),
    changedBy: actor,
  });
}
function auditCreate(entity: string, rec: object & { id: string }) {
  for (const [k, v] of Object.entries(rec))
    if (k !== "id" && v !== undefined) audit(entity, rec.id, k, null, v);
}
function applyPatch<T extends { id: string }>(entity: string, rec: T, patch: Partial<T>) {
  for (const [k, v] of Object.entries(patch) as [keyof T & string, T[keyof T & string]][]) {
    if (k === "id") continue;
    if (str(rec[k]) !== str(v)) {
      audit(entity, rec.id, k, rec[k], v);
      rec[k] = v;
    }
  }
}
const read = async <T>(f: (d: StoreData) => T): Promise<T> => {
  const { study, period } = scopeNow();
  return clone(f(await loadRemote(study, period)));
};
/** The loaded year. Only admins can create a year, so a missing one is an error here. */
function ensurePeriod(d: StoreData): BudgetPeriod {
  if (!d.period) throw new Error(NO_YEAR);
  return d.period;
}

export const periodRepo: PeriodRepo = {
  get: () => read((d) => d.period),
  update: async (patch) => {
    const { study, period } = scopeNow();
    if (!period) throw new Error(NO_YEAR);
    const cur = await getYear(study, period);
    if (!cur) throw new Error(NO_YEAR);
    if (cur.status === "closed") throw new Error(CLOSED);
    await updateYear(period, { ...cur, ...patch });
  },
};

export const yearRepo: YearRepo = {
  list: listYears,
  create: createYear,
  setStatus: setYearStatus,
};

function removeLineLocal(id: string) {
  const d = db();
  const line = d.lines.find((l) => l.id === id);
  const evIds = d.events.filter((e) => e.lineId === id).map((e) => e.id);
  d.attachments
    .filter((a) => evIds.includes(a.eventId))
    .forEach((a) => audit("attachment", a.id, "(deleted)", a.fileName, null));
  d.attachments = d.attachments.filter((a) => !evIds.includes(a.eventId));
  evIds.forEach((e) => audit("event", e, "(deleted)", e, null));
  d.events = d.events.filter((e) => e.lineId !== id);
  d.lines = d.lines.filter((l) => l.id !== id);
  audit("line", id, "(deleted)", line?.description, null);
}

export const componentRepo: ComponentRepo = {
  list: () => read((d) => [...d.components].sort((a, b) => a.sortOrder - b.sortOrder)),
  create: (input) =>
    tx(() => {
      const d = db();
      const c: Component = {
        id: uid(),
        periodId: ensurePeriod(d).id,
        sortOrder: d.components.length + 1,
        ...input,
      };
      d.components.push(c);
      auditCreate("component", c);
      return clone(c);
    }),
  update: (id, patch) =>
    tx(() => {
      const c = db().components.find((x) => x.id === id);
      if (!c) throw new Error("Component not found");
      applyPatch("component", c, patch);
      return clone(c);
    }),
  remove: (id) =>
    tx(() => {
      const d = db();
      d.lines.filter((l) => l.componentId === id).forEach((l) => removeLineLocal(l.id));
      const c = d.components.find((x) => x.id === id);
      d.components = d.components.filter((x) => x.id !== id);
      audit("component", id, "(deleted)", c?.name, null);
    }),
};

function createEvents(line: BudgetLine, from: number, to: number) {
  const d = db();
  for (let s = from; s <= to; s++) {
    const e: BudgetEvent = {
      id: uid(),
      lineId: line.id,
      sequence: s,
      title: eventTitle(line.description, s, line.occurrences),
      status: "planned",
    };
    d.events.push(e);
    audit("event", e.id, "(created)", null, e.title);
  }
}
function retitle(line: BudgetLine) {
  for (const e of db().events.filter((x) => x.lineId === line.id)) {
    const t = eventTitle(line.description, e.sequence, line.occurrences);
    if (e.title !== t) e.title = t;
  }
}
function createLine(input: LineInput): BudgetLine {
  const d = db();
  const line: BudgetLine = { ...input, id: uid(), sortOrder: d.lines.length + 1 };
  d.lines.push(line);
  auditCreate("line", line);
  createEvents(line, 1, line.occurrences);
  return line;
}

export const lineRepo: LineRepo = {
  list: () => read((d) => [...d.lines].sort((a, b) => a.sortOrder - b.sortOrder)),
  create: (input) => tx(() => clone(createLine(input))),
  update: (id, patch) =>
    tx(() => {
      const d = db();
      const line = d.lines.find((l) => l.id === id);
      if (!line) throw new Error("Line not found");
      if (patch.occurrences !== undefined && patch.occurrences !== line.occurrences) {
        const evs = d.events.filter((e) => e.lineId === id);
        const plan = planOccurrenceChange(evs, patch.occurrences); // throws if blocked
        const prev = evs.length;
        applyPatch("line", line, patch);
        if (plan.add) createEvents(line, prev + 1, prev + plan.add);
        for (const rid of plan.removeIds)
          audit("event", rid, "(deleted)", d.events.find((e) => e.id === rid)?.title, null);
        d.events = d.events.filter((e) => !plan.removeIds.includes(e.id));
      } else applyPatch("line", line, patch);
      retitle(line);
      return clone(line);
    }),
  duplicate: (id) =>
    tx(() => {
      const src = db().lines.find((l) => l.id === id);
      if (!src) throw new Error("Line not found");
      const { id: _i, sortOrder: _s, financePostedCents: _f, ...rest } = src;
      return clone(createLine({ ...rest, description: `${src.description} (copy)` }));
    }),
  remove: (id) => tx(() => removeLineLocal(id)),
};

export const eventRepo: EventRepo = {
  list: () => read((d) => d.events),
  update: (id, patch) =>
    tx(() => {
      const e = db().events.find((x) => x.id === id);
      if (!e) throw new Error("Event not found");
      applyPatch("event", e, patch);
      return clone(e);
    }),
  schedule: (lineId, dates) =>
    tx(() => {
      const bySeq = new Map(dates.map((x) => [x.sequence, x.plannedDate]));
      let n = 0;
      for (const e of db().events) {
        if (e.lineId !== lineId || e.status !== "planned" || !bySeq.has(e.sequence)) continue;
        const next = bySeq.get(e.sequence) || undefined;
        if (next === e.plannedDate) continue;
        applyPatch("event", e, { plannedDate: next });
        n++;
      }
      return n;
    }),
};

export const attachmentRepo: AttachmentRepo = {
  list: async () => signUrls(await read((d) => d.attachments)),
  add: async (eventId, file, label) => {
    const scope = scopeNow();
    const year = scope.period && (await getYear(scope.study, scope.period));
    if (year && year.status === "closed") throw new Error(CLOSED);
    const path = await uploadEvidence(scope.study, eventId, file);
    return tx(() => {
      const a: Attachment = {
        id: uid(),
        eventId,
        fileName: file.name,
        fileUrl: path,
        mimeType: file.type,
        sizeBytes: file.size,
        label,
        uploadedAt: new Date().toISOString(),
      };
      db().attachments.push(a);
      audit("attachment", a.id, "(created)", null, `${a.fileName}${label ? ` · ${label}` : ""}`);
      return clone(a);
    }, scope).catch(async (e) => {
      await removeEvidence([path]);
      throw e;
    });
  },
  remove: (id) =>
    tx(() => {
      const d = db();
      const a = d.attachments.find((x) => x.id === id);
      d.attachments = d.attachments.filter((x) => x.id !== id);
      audit("attachment", id, "(deleted)", a?.fileName, null);
    }),
};

function need(text: string | undefined, what: string): string {
  const v = (text ?? "").trim();
  if (!v) throw new Error(`Give the ${what} a title.`);
  return v;
}
function reorder<T extends { id: string; sortOrder: number }>(
  entity: string,
  siblings: T[],
  id: string,
  dir: MoveDir,
) {
  for (const m of moveWithin(siblings, id, dir)) {
    const row = siblings.find((x) => x.id === m.id);
    if (!row) continue;
    audit(entity, row.id, "sortOrder", row.sortOrder, m.sortOrder);
    row.sortOrder = m.sortOrder;
  }
}
function removeActivityLocal(id: string) {
  const w = wdb();
  const a = w.activities.find((x) => x.id === id);
  w.activitySites
    .filter((s) => s.activityId === id)
    .forEach((s) => audit("activity site", `${id}:${s.siteId}`, "(deleted)", s.siteId, null));
  w.activitySites = w.activitySites.filter((s) => s.activityId !== id);
  w.indicators
    .filter((i) => i.activityId === id)
    .forEach((i) => audit("indicator", i.id, "(deleted)", i.name, null));
  w.indicators = w.indicators.filter((i) => i.activityId !== id);
  w.responsibles
    .filter((r) => r.activityId === id)
    .forEach((r) => audit("responsible", r.id, "(deleted)", r.name, null));
  w.responsibles = w.responsibles.filter((r) => r.activityId !== id);
  w.activities = w.activities.filter((x) => x.id !== id);
  audit("activity", id, "(deleted)", a?.title, null);
}
function removeOutcomeLocal(id: string) {
  const w = wdb();
  w.activities.filter((a) => a.outcomeId === id).forEach((a) => removeActivityLocal(a.id));
  const o = w.outcomes.find((x) => x.id === id);
  w.outcomes = w.outcomes.filter((x) => x.id !== id);
  audit("outcome", id, "(deleted)", o?.title, null);
}
const found = <T>(row: T | undefined, what: string): T => {
  if (!row) throw new Error(`${what} not found`);
  return row;
};
const activityOf = (id: string) =>
  found(
    wdb().activities.find((a) => a.id === id),
    "Activity",
  );

export const workplanRepo: WorkplanRepo = {
  get: async () => {
    const { study, period } = scopeNow();
    const { audit: _a, ...rest } = await loadWorkplan(study, period);
    return clone(rest);
  },

  addObjective: (input) => {
    const scope = scopeNow();
    return wtx(
      () => {
        const w = wdb();
        const o: Objective = {
          id: uid(),
          periodId: scope.period as string,
          code: input.code.trim(),
          title: need(input.title, "objective"),
          sortOrder: nextSortOrder(w.objectives),
        };
        w.objectives.push(o);
        auditCreate("objective", o);
        return clone(o);
      },
      {},
      scope,
    );
  },
  updateObjective: (id, patch) =>
    wtx(() => {
      const o = found(
        wdb().objectives.find((x) => x.id === id),
        "Objective",
      );
      const next = { ...patch };
      if (next.code !== undefined) next.code = next.code.trim();
      if (next.title !== undefined) next.title = need(next.title, "objective");
      applyPatch("objective", o, next);
      return clone(o);
    }),
  removeObjective: (id) =>
    wtx(() => {
      const w = wdb();
      w.outcomes.filter((o) => o.objectiveId === id).forEach((o) => removeOutcomeLocal(o.id));
      const o = w.objectives.find((x) => x.id === id);
      w.objectives = w.objectives.filter((x) => x.id !== id);
      audit("objective", id, "(deleted)", o?.title, null);
    }),
  moveObjective: (id, dir) => wtx(() => reorder("objective", wdb().objectives, id, dir)),

  addOutcome: (objectiveId, input) =>
    wtx(() => {
      const w = wdb();
      found(
        w.objectives.find((o) => o.id === objectiveId),
        "Objective",
      );
      const o: Outcome = {
        id: uid(),
        objectiveId,
        code: input.code.trim(),
        title: need(input.title, "outcome"),
        sortOrder: nextSortOrder(w.outcomes.filter((x) => x.objectiveId === objectiveId)),
      };
      w.outcomes.push(o);
      auditCreate("outcome", o);
      return clone(o);
    }),
  updateOutcome: (id, patch) =>
    wtx(() => {
      const o = found(
        wdb().outcomes.find((x) => x.id === id),
        "Outcome",
      );
      const next = { ...patch };
      if (next.code !== undefined) next.code = next.code.trim();
      if (next.title !== undefined) next.title = need(next.title, "outcome");
      applyPatch("outcome", o, next);
      return clone(o);
    }),
  removeOutcome: (id) => wtx(() => removeOutcomeLocal(id)),
  moveOutcome: (id, dir) =>
    wtx(() => {
      const w = wdb();
      const o = found(
        w.outcomes.find((x) => x.id === id),
        "Outcome",
      );
      reorder(
        "outcome",
        w.outcomes.filter((x) => x.objectiveId === o.objectiveId),
        id,
        dir,
      );
    }),

  addActivity: (outcomeId, input) =>
    wtx(() => {
      const w = wdb();
      found(
        w.outcomes.find((o) => o.id === outcomeId),
        "Outcome",
      );
      const bad = validateRepeat(input.repeatEvery, input.repeatUnit);
      if (bad) throw new Error(bad);
      const a: Activity = {
        id: uid(),
        outcomeId,
        code: input.code.trim(),
        title: need(input.title, "activity"),
        kind: input.kind,
        output: input.output?.trim() ?? "",
        meansOfVerification: input.meansOfVerification?.trim() ?? "",
        frequencyLabel: input.frequencyLabel?.trim() ?? "",
        repeatEvery: input.repeatEvery,
        repeatUnit: input.repeatUnit,
        notes: input.notes?.trim() ?? "",
        sortOrder: nextSortOrder(w.activities.filter((x) => x.outcomeId === outcomeId)),
      };
      w.activities.push(a);
      auditCreate("activity", a);
      return clone(a);
    }),
  updateActivity: (id, patch) =>
    wtx(() => {
      const w = wdb();
      const a = activityOf(id);
      const next: Partial<ActivityInput> = { ...patch };
      for (const k of [
        "code",
        "output",
        "meansOfVerification",
        "frequencyLabel",
        "notes",
      ] as const) {
        const v = next[k];
        if (v !== undefined) next[k] = v.trim();
      }
      if (next.title !== undefined) next.title = need(next.title, "activity");
      const every = "repeatEvery" in next ? next.repeatEvery : a.repeatEvery;
      const unit = "repeatUnit" in next ? next.repeatUnit : a.repeatUnit;
      const bad = validateRepeat(every, unit);
      if (bad) throw new Error(bad);
      if (next.kind === "general" && a.kind === "site") {
        w.activitySites
          .filter((s) => s.activityId === id)
          .forEach((s) => audit("activity site", `${id}:${s.siteId}`, "(deleted)", s.siteId, null));
        w.activitySites = w.activitySites.filter((s) => s.activityId !== id);
      }
      applyPatch<Activity>("activity", a, next as Partial<Activity>);
      return clone(a);
    }),
  removeActivity: (id) => wtx(() => removeActivityLocal(id)),
  moveActivity: (id, dir) =>
    wtx(() => {
      const w = wdb();
      const a = activityOf(id);
      reorder(
        "activity",
        w.activities.filter((x) => x.outcomeId === a.outcomeId),
        id,
        dir,
      );
    }),

  addIndicator: (activityId, input) =>
    wtx(() => {
      const w = wdb();
      activityOf(activityId);
      if (!input.name.trim()) throw new Error("Give the indicator a name.");
      if (input.target !== undefined && !(input.target >= 0))
        throw new Error("The target cannot be negative.");
      const i: ActivityIndicator = {
        id: uid(),
        activityId,
        name: input.name.trim(),
        target: input.target,
        sortOrder: nextSortOrder(w.indicators.filter((x) => x.activityId === activityId)),
      };
      w.indicators.push(i);
      auditCreate("indicator", i);
    }),
  updateIndicator: (id, patch) =>
    wtx(() => {
      const i = found(
        wdb().indicators.find((x) => x.id === id),
        "Indicator",
      );
      if (patch.name !== undefined && !patch.name.trim())
        throw new Error("Give the indicator a name.");
      if (patch.target != null && !(patch.target >= 0))
        throw new Error("The target cannot be negative.");
      applyPatch("indicator", i, {
        ...(patch.name !== undefined && { name: patch.name.trim() }),
        ...("target" in patch && { target: patch.target ?? undefined }),
      });
    }),
  removeIndicator: (id) =>
    wtx(() => {
      const w = wdb();
      const i = w.indicators.find((x) => x.id === id);
      w.indicators = w.indicators.filter((x) => x.id !== id);
      audit("indicator", id, "(deleted)", i?.name, null);
    }),

  addResponsible: (activityId, input) =>
    wtx(() => {
      const w = wdb();
      activityOf(activityId);
      if (!input.name.trim()) throw new Error("Give the person a name.");
      const r: ActivityResponsible = {
        id: uid(),
        activityId,
        name: input.name.trim(),
        userId: input.userId,
        sortOrder: nextSortOrder(w.responsibles.filter((x) => x.activityId === activityId)),
      };
      w.responsibles.push(r);
      auditCreate("responsible", r);
    }),
  updateResponsible: (id, patch) =>
    wtx(() => {
      const r = found(
        wdb().responsibles.find((x) => x.id === id),
        "Person",
      );
      if (patch.name !== undefined && !patch.name.trim())
        throw new Error("Give the person a name.");
      applyPatch("responsible", r, {
        ...(patch.name !== undefined && { name: patch.name.trim() }),
        ...("userId" in patch && { userId: patch.userId ?? undefined }),
      });
    }),
  removeResponsible: (id) =>
    wtx(() => {
      const w = wdb();
      const r = w.responsibles.find((x) => x.id === id);
      w.responsibles = w.responsibles.filter((x) => x.id !== id);
      audit("responsible", id, "(deleted)", r?.name, null);
    }),

  setActivitySites: (activityId, siteIds) =>
    wtx(() => {
      const w = wdb();
      const a = activityOf(activityId);
      const want = new Set(siteIds);
      if (a.kind !== "site" && want.size) throw new Error("Only site activities can have sites.");
      const have = new Set(
        w.activitySites.filter((s) => s.activityId === activityId).map((s) => s.siteId),
      );
      for (const siteId of want) {
        if (have.has(siteId)) continue;
        const site = found(
          w.sites.find((s) => s.id === siteId),
          "Site",
        );
        if (site.archivedAt) throw new Error(`${site.name} is archived. Restore it first.`);
        w.activitySites.push({ activityId, siteId });
        audit("activity site", `${activityId}:${siteId}`, "(created)", null, site.name);
      }
      for (const siteId of have)
        if (!want.has(siteId)) {
          w.activitySites = w.activitySites.filter(
            (s) => !(s.activityId === activityId && s.siteId === siteId),
          );
          audit(
            "activity site",
            `${activityId}:${siteId}`,
            "(deleted)",
            w.sites.find((s) => s.id === siteId)?.name ?? siteId,
            null,
          );
        }
    }),
};

export const siteRepo: SiteRepo = {
  add: (name) =>
    wtx(
      () => {
        const w = wdb();
        const n = name.trim();
        if (!n) throw new Error("Give the site a name.");
        if (w.sites.some((s) => s.name.trim().toLowerCase() === n.toLowerCase()))
          throw new Error("A site with that name already exists.");
        const site: Site = { id: uid(), name: n, sortOrder: nextSortOrder(w.sites) };
        w.sites.push(site);
        auditCreate("site", site);
        return clone(site);
      },
      { sites: true },
    ),
  rename: (id, name) =>
    wtx(
      () => {
        const w = wdb();
        const n = name.trim();
        if (!n) throw new Error("Give the site a name.");
        if (w.sites.some((s) => s.id !== id && s.name.trim().toLowerCase() === n.toLowerCase()))
          throw new Error("A site with that name already exists.");
        applyPatch(
          "site",
          found(
            w.sites.find((s) => s.id === id),
            "Site",
          ),
          { name: n },
        );
      },
      { sites: true },
    ),
  setArchived: (id, archived) =>
    wtx(
      () => {
        const s = found(
          wdb().sites.find((x) => x.id === id),
          "Site",
        );
        applyPatch("site", s, { archivedAt: archived ? new Date().toISOString() : undefined });
      },
      { sites: true },
    ),
};

export const auditRepo: AuditRepo = { list: () => listAudit(activeStudyId()) };

export const studyRepo: StudyRepo = {
  list: listStudies,
  canCreate: isPlatformAdmin,
  myEmail: currentUserLabel,
  create: createStudy,
  members: listStudyMembers,
  addMember: addStudyMember,
  removeMember: removeStudyMember,
  setAdmin: setStudyAdmin,
};

export const adminRepo: AdminRepo = {
  importLines: (rows) =>
    tx(() => {
      const d = db();
      const created = new Map<string, string>();
      for (const r of rows) {
        let cid = r.component.id;
        if (!cid) {
          cid = created.get(r.component.name);
          if (!cid) {
            const c: Component = {
              id: uid(),
              periodId: ensurePeriod(d).id,
              code: String(d.components.length + 1),
              name: r.component.name,
              sortOrder: d.components.length + 1,
            };
            d.components.push(c);
            auditCreate("component", c);
            created.set(c.name, c.id);
            cid = c.id;
          }
        }
        createLine({ ...r.line, componentId: cid });
      }
      return rows.length;
    }),
};
