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
  Delivery,
  DeliveryResult,
  Objective,
  Outcome,
  Site,
  Study,
  StudyMember,
  WorkplanData,
} from "@/lib/types";
import { planOccurrenceChange, type Repeat } from "@/lib/calc";
import {
  deliveryDeleteBlock,
  INDICATOR_DELETE_BLOCK,
  isDuplicateRound,
  KIND_CHANGE_BLOCK,
  linkedLineMoveBlock,
  nextRound,
  parentDeleteBlock,
  planRounds,
  roundText,
  siteRemovalBlock,
  validateDelivery,
  validateEventLink,
  validateRounds,
} from "@/lib/deliveries";
import {
  cleanUnit,
  fundedDeleteMessage,
  linesUnder,
  validateLineActivity,
  validateLineMove,
} from "@/lib/budget-tree";
import { moveWithin, nextSortOrder, parseMultiEntry, validateRepeat } from "@/lib/workplan";
import { eventTitle, type StoreData } from "./store";

export interface PeriodRepo {
  get(): Promise<BudgetPeriod | null>;
  /** Admins only. Goes through a database function, never a direct table write. */
  update(patch: Partial<BudgetPeriod>): Promise<void>;
}
export interface YearRepo {
  list(studyId: string): Promise<BudgetPeriod[]>;
  create(
    studyId: string,
    v: YearInput,
    copyFromId: string | null,
    copyBudgetLines?: boolean,
  ): Promise<string>;
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
export interface MultiAdd {
  added: number;
  skipped: string[];
}
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
  /** Comma-separated names, one transaction. Target applies only to a single name. */
  addIndicators(activityId: string, input: { text: string; target?: number }): Promise<MultiAdd>;
  updateIndicator(id: string, patch: { name?: string; target?: number | null }): Promise<void>;
  removeIndicator(id: string): Promise<void>;
  /** Comma-separated names, one transaction. A user link applies only to a single name. */
  addResponsibles(activityId: string, input: { text: string; userId?: string }): Promise<MultiAdd>;
  updateResponsible(id: string, patch: { name?: string; userId?: string | null }): Promise<void>;
  removeResponsible(id: string): Promise<void>;
  setActivitySites(activityId: string, siteIds: string[]): Promise<void>;
}
export interface SiteRepo {
  add(name: string): Promise<Site>;
  rename(id: string, name: string): Promise<void>;
  setArchived(id: string, archived: boolean): Promise<void>;
}
export type LineInput = Omit<BudgetLine, "id" | "sortOrder" | "copiedFromId">;
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
/** A receipt goes on a spending record, proof of delivery on a delivery. */
export type AttachmentTarget = { eventId: string } | { deliveryId: string };
export interface AttachmentRepo {
  list(): Promise<Attachment[]>;
  add(target: AttachmentTarget, file: File, label?: string): Promise<Attachment>;
  remove(id: string): Promise<void>;
}
export interface DeliveryData {
  deliveries: Delivery[];
  results: DeliveryResult[];
}
export interface GenerateInput {
  rounds: number;
  firstDate?: string;
  repeat?: Repeat | null;
}
export interface GenerateResult {
  created: number;
  existing: number;
  outsideYear: number;
}
export interface DeliveryInput {
  roundNumber?: number;
  roundLabel?: string;
  siteId?: string;
  plannedDate?: string;
}
export type DeliveryPatch = Partial<
  Pick<Delivery, "status" | "plannedDate" | "actualDate" | "notes" | "roundLabel">
>;
export interface DeliveryRepo {
  list(): Promise<DeliveryData>;
  /** Adds the missing round and site combinations only. Safe to run again. */
  generate(activityId: string, input: GenerateInput): Promise<GenerateResult>;
  add(activityId: string, input: DeliveryInput): Promise<Delivery>;
  update(id: string, patch: DeliveryPatch): Promise<Delivery>;
  /** Blocked while spending is linked or proof files exist. */
  remove(id: string): Promise<void>;
  /** A null value clears the result. */
  setResult(
    deliveryId: string,
    indicatorId: string,
    value: number | null,
    notes?: string,
  ): Promise<void>;
  linkEvents(deliveryId: string, eventIds: string[]): Promise<number>;
  unlinkEvents(eventIds: string[]): Promise<number>;
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
  /** Adds every row as a line of one activity in the active year. */
  importLines(activityId: string, rows: Omit<LineInput, "activityId">[]): Promise<number>;
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
  const onLine = (a: Attachment) => !!a.eventId && evIds.includes(a.eventId);
  d.attachments
    .filter(onLine)
    .forEach((a) => audit("attachment", a.id, "(deleted)", a.fileName, null));
  d.attachments = d.attachments.filter((a) => !onLine(a));
  evIds.forEach((e) => audit("event", e, "(deleted)", e, null));
  d.events = d.events.filter((e) => e.lineId !== id);
  d.lines = d.lines.filter((l) => l.id !== id);
  audit("line", id, "(deleted)", line?.description, null);
}

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
function cleanLine<T extends { quantityUnit?: string; durationUnit?: string }>(v: T): T {
  const out = { ...v };
  if (out.quantityUnit !== undefined) {
    const u = cleanUnit(out.quantityUnit);
    if (!u) throw new Error("Give the line a unit, such as pax or sets.");
    out.quantityUnit = u;
  }
  if (out.durationUnit !== undefined) {
    const u = cleanUnit(out.durationUnit);
    if (!u) throw new Error("Give the line a duration unit, such as days, months or one-off.");
    out.durationUnit = u;
  }
  return out;
}
function createLine(input: LineInput): BudgetLine {
  const d = db();
  const bad = validateLineActivity(input.activityId, d.period?.id, d);
  if (bad) throw new Error(bad);
  const line: BudgetLine = { ...cleanLine(input), id: uid(), sortOrder: d.lines.length + 1 };
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
      patch = cleanLine(patch);
      if (patch.activityId !== undefined && patch.activityId !== line.activityId) {
        const bad = validateLineMove(line, patch.activityId, d);
        if (bad) throw new Error(bad);
        const linked = d.events.filter((e) => e.lineId === id && e.deliveryId).length;
        if (linked) throw new Error(linkedLineMoveBlock(linked));
      }
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
      const { id: _i, sortOrder: _s, financePostedCents: _f, copiedFromId: _c, ...rest } = src;
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
      if (patch.deliveryId) {
        const bad = validateEventLink(
          db().lines.find((l) => l.id === e.lineId),
          db().deliveries.find((x) => x.id === patch.deliveryId),
          {},
        );
        if (bad) throw new Error(bad);
      }
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
  add: async (target, file, label) => {
    const scope = scopeNow();
    const year = scope.period && (await getYear(scope.study, scope.period));
    if (year && year.status === "closed") throw new Error(CLOSED);
    const owner =
      "deliveryId" in target ? { deliveryId: target.deliveryId } : { eventId: target.eventId };
    const folder = "deliveryId" in target ? `deliveries/${target.deliveryId}` : target.eventId;
    const path = await uploadEvidence(scope.study, folder, file);
    return tx(() => {
      if ("deliveryId" in target && !db().deliveries.some((x) => x.id === target.deliveryId))
        throw new Error("Round not found");
      const a: Attachment = {
        id: uid(),
        ...owner,
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
/** Lines and deliveries of the active year, read before a change so protected items can be refused. */
async function budgetSnapshot(scope: Scope) {
  if (!scope.period)
    return {
      lines: [] as BudgetLine[],
      deliveries: [] as Delivery[],
      results: [] as DeliveryResult[],
    };
  const { lines, deliveries, results } = await loadRemote(scope.study, scope.period);
  return { lines, deliveries, results };
}
const deliveriesUnder = (activityIds: Set<string>, all: Delivery[]) =>
  all.filter((d) => activityIds.has(d.activityId)).length;
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
  removeObjective: async (id) => {
    const scope = scopeNow();
    const { lines, deliveries } = await budgetSnapshot(scope);
    return wtx(
      () => {
        const w = wdb();
        const outs = w.outcomes.filter((o) => o.objectiveId === id);
        const acts = w.activities.filter((a) => outs.some((o) => o.id === a.outcomeId));
        const held = parentDeleteBlock(
          "objective",
          deliveriesUnder(new Set(acts.map((a) => a.id)), deliveries),
        );
        if (held) throw new Error(held);
        const bad = fundedDeleteMessage(
          "objective",
          linesUnder(
            acts.map((a) => a.id),
            lines,
          ),
        );
        if (bad) throw new Error(bad);
        outs.forEach((o) => removeOutcomeLocal(o.id));
        const o = w.objectives.find((x) => x.id === id);
        w.objectives = w.objectives.filter((x) => x.id !== id);
        audit("objective", id, "(deleted)", o?.title, null);
      },
      {},
      scope,
    );
  },
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
  removeOutcome: async (id) => {
    const scope = scopeNow();
    const { lines, deliveries } = await budgetSnapshot(scope);
    return wtx(
      () => {
        const acts = wdb().activities.filter((a) => a.outcomeId === id);
        const held = parentDeleteBlock(
          "outcome",
          deliveriesUnder(new Set(acts.map((a) => a.id)), deliveries),
        );
        if (held) throw new Error(held);
        const bad = fundedDeleteMessage(
          "outcome",
          linesUnder(
            acts.map((a) => a.id),
            lines,
          ),
        );
        if (bad) throw new Error(bad);
        removeOutcomeLocal(id);
      },
      {},
      scope,
    );
  },
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
  updateActivity: async (id, patch) => {
    const scope = scopeNow();
    const { deliveries } =
      patch.kind !== undefined ? await budgetSnapshot(scope) : { deliveries: [] };
    return wtx(
      () => {
        const w = wdb();
        const a = activityOf(id);
        if (
          patch.kind !== undefined &&
          patch.kind !== a.kind &&
          deliveries.some((d) => d.activityId === id)
        )
          throw new Error(KIND_CHANGE_BLOCK);
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
            .forEach((s) =>
              audit("activity site", `${id}:${s.siteId}`, "(deleted)", s.siteId, null),
            );
          w.activitySites = w.activitySites.filter((s) => s.activityId !== id);
        }
        applyPatch<Activity>("activity", a, next as Partial<Activity>);
        return clone(a);
      },
      {},
      scope,
    );
  },
  removeActivity: async (id) => {
    const scope = scopeNow();
    const { lines, deliveries } = await budgetSnapshot(scope);
    return wtx(
      () => {
        const held = parentDeleteBlock("activity", deliveriesUnder(new Set([id]), deliveries));
        if (held) throw new Error(held);
        const bad = fundedDeleteMessage("activity", linesUnder([id], lines));
        if (bad) throw new Error(bad);
        removeActivityLocal(id);
      },
      {},
      scope,
    );
  },
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

  addIndicators: (activityId, input) =>
    wtx(() => {
      const w = wdb();
      activityOf(activityId);
      const mine = w.indicators.filter((x) => x.activityId === activityId);
      const { add, skipped } = parseMultiEntry(
        input.text,
        mine.map((x) => x.name),
      );
      if (!add.length && !skipped.length) throw new Error("Give the indicator a name.");
      const target = add.length === 1 ? input.target : undefined;
      if (target !== undefined && !(target >= 0)) throw new Error("The target cannot be negative.");
      let order = nextSortOrder(mine);
      for (const name of add) {
        const i: ActivityIndicator = { id: uid(), activityId, name, target, sortOrder: order++ };
        w.indicators.push(i);
        auditCreate("indicator", i);
      }
      return { added: add.length, skipped };
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
  removeIndicator: async (id) => {
    const scope = scopeNow();
    const { results } = await budgetSnapshot(scope);
    return wtx(
      () => {
        if (results.some((r) => r.indicatorId === id)) throw new Error(INDICATOR_DELETE_BLOCK);
        const w = wdb();
        const i = w.indicators.find((x) => x.id === id);
        w.indicators = w.indicators.filter((x) => x.id !== id);
        audit("indicator", id, "(deleted)", i?.name, null);
      },
      {},
      scope,
    );
  },

  addResponsibles: (activityId, input) =>
    wtx(() => {
      const w = wdb();
      activityOf(activityId);
      const mine = w.responsibles.filter((x) => x.activityId === activityId);
      const { add, skipped } = parseMultiEntry(
        input.text,
        mine.map((x) => x.name),
      );
      if (!add.length && !skipped.length) throw new Error("Give the person a name.");
      const userId = add.length === 1 ? input.userId : undefined;
      let order = nextSortOrder(mine);
      for (const name of add) {
        const r: ActivityResponsible = { id: uid(), activityId, name, userId, sortOrder: order++ };
        w.responsibles.push(r);
        auditCreate("responsible", r);
      }
      return { added: add.length, skipped };
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

  setActivitySites: async (activityId, siteIds) => {
    const scope = scopeNow();
    const { deliveries } = await budgetSnapshot(scope);
    return wtx(
      () => {
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
            if (deliveries.some((d) => d.activityId === activityId && d.siteId === siteId))
              throw new Error(
                siteRemovalBlock(w.sites.find((x) => x.id === siteId)?.name ?? "That site"),
              );
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
      },
      {},
      scope,
    );
  },
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

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const deliveryOf = (id: string) =>
  found(
    db().deliveries.find((x) => x.id === id),
    "Round",
  );
function siteLabel(siteId?: string) {
  return siteId ? (db().sites.find((s) => s.id === siteId)?.name ?? "a site") : "";
}
const deliveryText = (x: Delivery) =>
  `${roundText(x)}${x.siteId ? ` at ${siteLabel(x.siteId)}` : ""}`;
function activeSelected(activityId: string) {
  const d = db();
  return d.activitySites
    .filter((s) => s.activityId === activityId)
    .map((s) => ({ id: s.siteId, archived: !!d.sites.find((x) => x.id === s.siteId)?.archivedAt }));
}
function newDelivery(
  activityId: string,
  v: Omit<Delivery, "id" | "activityId" | "status" | "notes">,
) {
  const x: Delivery = { ...v, id: uid(), activityId, status: "planned", notes: "" };
  db().deliveries.push(x);
  audit("delivery", x.id, "(created)", null, deliveryText(x));
  return x;
}

export const deliveryRepo: DeliveryRepo = {
  list: () => read((d) => ({ deliveries: d.deliveries, results: d.results })),
  generate: (activityId, input) =>
    tx(() => {
      const d = db();
      const a = found(
        d.activities.find((x) => x.id === activityId),
        "Activity",
      );
      if (input.firstDate && !YMD.test(input.firstDate))
        throw new Error("Enter the first date as year, month and day.");
      const sites = activeSelected(activityId);
      const bad = validateRounds(input.rounds, a.kind, sites.filter((s) => !s.archived).length);
      if (bad) throw new Error(bad);
      const plan = planRounds({
        kind: a.kind,
        rounds: input.rounds,
        sites,
        existing: d.deliveries.filter((x) => x.activityId === activityId),
        firstDate: input.firstDate,
        repeat: input.repeat,
        year: d.period,
      });
      for (const c of plan.create)
        newDelivery(activityId, {
          roundNumber: c.roundNumber,
          roundLabel: "",
          siteId: c.siteId,
          plannedDate: c.plannedDate,
        });
      return {
        created: plan.create.length,
        existing: plan.existing,
        outsideYear: plan.outsideYear,
      };
    }),
  add: (activityId, input) =>
    tx(() => {
      const d = db();
      const a = found(
        d.activities.find((x) => x.id === activityId),
        "Activity",
      );
      const mine = d.deliveries.filter((x) => x.activityId === activityId);
      const siteId = input.siteId || undefined;
      if (a.kind === "general" && siteId)
        throw new Error("A general activity is not tied to a site.");
      if (a.kind === "site") {
        if (!siteId) throw new Error("Choose the site for this round.");
        const sel = activeSelected(activityId).find((s) => s.id === siteId);
        if (!sel) throw new Error("That site is not selected on this activity.");
        if (sel.archived)
          throw new Error("That site is archived. Restore it before adding rounds there.");
      }
      const round = input.roundNumber ?? nextRound(mine, siteId);
      if (!Number.isInteger(round) || round < 1)
        throw new Error("The round must be a whole number above zero.");
      if (isDuplicateRound(mine, round, siteId))
        throw new Error(
          `Round ${round}${siteId ? ` at ${siteLabel(siteId)}` : ""} already exists.`,
        );
      const bad = validateDelivery({ status: "planned", plannedDate: input.plannedDate });
      if (bad) throw new Error(bad);
      return clone(
        newDelivery(activityId, {
          roundNumber: round,
          roundLabel: input.roundLabel?.trim() ?? "",
          siteId,
          plannedDate: input.plannedDate || undefined,
        }),
      );
    }),
  update: (id, patch) =>
    tx(() => {
      const x = deliveryOf(id);
      const next = { ...patch };
      if (next.roundLabel !== undefined) next.roundLabel = next.roundLabel.trim();
      const bad = validateDelivery({
        status: next.status ?? x.status,
        plannedDate: "plannedDate" in next ? next.plannedDate : x.plannedDate,
        actualDate: "actualDate" in next ? next.actualDate : x.actualDate,
      });
      if (bad) throw new Error(bad);
      applyPatch<Delivery>("delivery", x, next);
      return clone(x);
    }),
  remove: (id) =>
    tx(() => {
      const d = db();
      const x = deliveryOf(id);
      const bad = deliveryDeleteBlock({
        linkedSpending: d.events.filter((e) => e.deliveryId === id).length,
        proofFiles: d.attachments.filter((a) => a.deliveryId === id).length,
      });
      if (bad) throw new Error(bad);
      d.results
        .filter((r) => r.deliveryId === id)
        .forEach((r) =>
          audit("delivery result", `${id}:${r.indicatorId}`, "(deleted)", r.value, null),
        );
      d.results = d.results.filter((r) => r.deliveryId !== id);
      d.deliveries = d.deliveries.filter((y) => y.id !== id);
      audit("delivery", id, "(deleted)", deliveryText(x), null);
    }),
  setResult: (deliveryId, indicatorId, value, notes = "") =>
    tx(() => {
      const d = db();
      const x = deliveryOf(deliveryId);
      if (!d.indicators.some((i) => i.id === indicatorId && i.activityId === x.activityId))
        throw new Error("That indicator belongs to a different activity than this delivery.");
      const key = `${deliveryId}:${indicatorId}`;
      const cur = d.results.find(
        (r) => r.deliveryId === deliveryId && r.indicatorId === indicatorId,
      );
      if (value === null) {
        if (!cur) return;
        d.results = d.results.filter((r) => r !== cur);
        audit("delivery result", key, "(deleted)", cur.value, null);
        return;
      }
      if (!Number.isFinite(value) || value < 0) throw new Error("A result cannot be negative.");
      if (!cur) {
        d.results.push({ deliveryId, indicatorId, value, notes: notes.trim() });
        audit("delivery result", key, "(created)", null, value);
      } else {
        if (cur.value !== value) audit("delivery result", key, "value", cur.value, value);
        if (cur.notes !== notes.trim())
          audit("delivery result", key, "notes", cur.notes, notes.trim());
        cur.value = value;
        cur.notes = notes.trim();
      }
    }),
  linkEvents: (deliveryId, eventIds) =>
    tx(() => {
      const d = db();
      const x = deliveryOf(deliveryId);
      let n = 0;
      for (const id of eventIds) {
        const e = found(
          d.events.find((y) => y.id === id),
          "Spending record",
        );
        const bad = validateEventLink(
          d.lines.find((l) => l.id === e.lineId),
          x,
          e,
        );
        if (bad) throw new Error(bad);
        if (e.deliveryId === deliveryId) continue;
        applyPatch<BudgetEvent>("event", e, { deliveryId });
        n++;
      }
      return n;
    }),
  unlinkEvents: (eventIds) =>
    tx(() => {
      let n = 0;
      for (const e of db().events)
        if (eventIds.includes(e.id) && e.deliveryId) {
          applyPatch<BudgetEvent>("event", e, { deliveryId: undefined });
          n++;
        }
      return n;
    }),
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
  importLines: (activityId, rows) =>
    tx(() => {
      for (const r of rows) createLine({ ...r, activityId });
      return rows.length;
    }),
};
