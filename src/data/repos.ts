// Repository interfaces backed by Supabase.
// UI must only reach these through hooks in src/data/hooks.ts.
import type {
  Attachment,
  AuditEntry,
  BudgetEvent,
  BudgetLine,
  BudgetPeriod,
  Component,
  Study,
  StudyMember,
} from "@/lib/types";
import { planOccurrenceChange } from "@/lib/calc";
import { eventTitle, type StoreData } from "./store";

export interface PeriodRepo {
  get(): Promise<BudgetPeriod | null>;
  update(patch: Partial<BudgetPeriod>): Promise<BudgetPeriod>;
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
  listStudies,
  createStudy,
  listStudyMembers,
  addStudyMember,
  removeStudyMember,
  setStudyAdmin,
} from "./remote";
import { activeStudyId } from "./active-study";

// Working copy of the active study's budget. Every write reloads it from Supabase,
// applies the change in memory, then writes only the rows that changed back.
let state: StoreData | null = null;
let actor = "coordinator";

function db(): StoreData {
  if (!state) throw new Error("Budget not loaded");
  return state;
}
// The study is captured before any await, so a study switch cannot redirect the write.
async function tx<T>(fn: () => T | Promise<T>, study = activeStudyId()): Promise<T> {
  const [data, who] = await Promise.all([loadRemote(study), currentUserLabel()]);
  state = data;
  actor = who;
  const before = clone(data);
  const r = await fn();
  await syncRemote(before, data, study);
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
  db().audit.push({
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
  const study = activeStudyId();
  return clone(f(await loadRemote(study)));
};
function ensurePeriod(d: StoreData): BudgetPeriod {
  if (!d.period) {
    d.period = { id: uid(), projectName: "", name: "", startDate: "", endDate: "", fxRate: 125 };
    auditCreate("period", d.period);
  }
  return d.period;
}

export const periodRepo: PeriodRepo = {
  get: () => read((d) => d.period),
  update: (patch) =>
    tx(() => {
      const d = db();
      if (!d.period) {
        d.period = {
          projectName: "",
          name: "",
          startDate: "",
          endDate: "",
          fxRate: 125,
          ...patch,
          id: uid(),
        };
        auditCreate("period", d.period);
      } else applyPatch("period", d.period, patch);
      return clone(d.period);
    }),
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
    const study = activeStudyId();
    const path = await uploadEvidence(study, eventId, file);
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
    }, study).catch(async (e) => {
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

export const auditRepo: AuditRepo = { list: () => listAudit(activeStudyId()) };

export const studyRepo: StudyRepo = {
  list: listStudies,
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
