// Repository interfaces + in-memory/localStorage implementation.
// UI must only reach these through hooks in src/data/hooks.ts.
import type { Attachment, AuditEntry, BudgetEvent, BudgetLine, BudgetPeriod, Component } from "@/lib/types";
import { planOccurrenceChange } from "@/lib/calc";
import { eventTitle, makeSeed, type StoreData } from "./seed";

export interface PeriodRepo { get(): Promise<BudgetPeriod | null>; update(patch: Partial<BudgetPeriod>): Promise<BudgetPeriod> }
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
export interface EventRepo { list(): Promise<BudgetEvent[]>; update(id: string, patch: Partial<BudgetEvent>): Promise<BudgetEvent> }
export interface AttachmentRepo {
  list(): Promise<Attachment[]>;
  add(eventId: string, file: File, label?: string): Promise<Attachment>;
  remove(id: string): Promise<void>;
}
export interface AuditRepo { list(): Promise<AuditEntry[]> }
export interface AdminRepo { reset(): Promise<void>; importLines(rows: { component: { id?: string; name: string }; line: Omit<LineInput, "componentId"> }[]): Promise<number> }

const KEY = "pbt-store-v1";
let state: StoreData | null = null;

function db(): StoreData {
  if (state) return state;
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      try { state = JSON.parse(raw) as StoreData; return state; } catch { /* fall through */ }
    }
  }
  state = makeSeed();
  persist();
  return state;
}
function persist() {
  if (typeof window === "undefined" || !state) return;
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { throw new Error("Browser storage is full. Remove some large attachments."); }
}
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const str = (v: unknown) => (v === undefined || v === null || v === "" ? null : typeof v === "object" ? JSON.stringify(v) : String(v));

function audit(entity: string, entityId: string, field: string, oldValue: unknown, newValue: unknown) {
  db().audit.push({ id: uid(), entity, entityId, field, oldValue: str(oldValue), newValue: str(newValue), changedAt: new Date().toISOString(), changedBy: "coordinator" });
}
function auditCreate(entity: string, rec: object & { id: string }) {
  for (const [k, v] of Object.entries(rec)) if (k !== "id" && v !== undefined) audit(entity, rec.id, k, null, v);
}
function applyPatch<T extends { id: string }>(entity: string, rec: T, patch: Partial<T>) {
  for (const [k, v] of Object.entries(patch) as [keyof T & string, T[keyof T & string]][]) {
    if (k === "id") continue;
    if (str(rec[k]) !== str(v)) { audit(entity, rec.id, k, rec[k], v); rec[k] = v; }
  }
}
const tick = <T,>(v: T) => Promise.resolve(clone(v));

export const periodRepo: PeriodRepo = {
  get: () => tick(db().period),
  async update(patch) {
    const d = db();
    if (!d.period) { d.period = { id: "p1", projectName: "", name: "", startDate: "", endDate: "", fxRate: 125, ...patch }; auditCreate("period", d.period); }
    else applyPatch("period", d.period, patch);
    persist(); return clone(d.period);
  },
};

export const componentRepo: ComponentRepo = {
  list: () => tick([...db().components].sort((a, b) => a.sortOrder - b.sortOrder)),
  async create(input) {
    const d = db();
    const c: Component = { id: uid(), periodId: d.period?.id ?? "p1", sortOrder: d.components.length + 1, ...input };
    d.components.push(c); auditCreate("component", c); persist(); return clone(c);
  },
  async update(id, patch) {
    const c = db().components.find((x) => x.id === id); if (!c) throw new Error("Component not found");
    applyPatch("component", c, patch); persist(); return clone(c);
  },
  async remove(id) {
    const d = db();
    const lineIds = d.lines.filter((l) => l.componentId === id).map((l) => l.id);
    for (const lid of lineIds) await lineRepo.remove(lid);
    const c = d.components.find((x) => x.id === id);
    d.components = d.components.filter((x) => x.id !== id);
    audit("component", id, "(deleted)", c?.name, null); persist();
  },
};

function createEvents(line: BudgetLine, from: number, to: number) {
  const d = db();
  for (let s = from; s <= to; s++) {
    const e: BudgetEvent = { id: uid(), lineId: line.id, sequence: s, title: eventTitle(line.description, s, line.occurrences), status: "planned" };
    d.events.push(e); audit("event", e.id, "(created)", null, e.title);
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
  d.lines.push(line); auditCreate("line", line);
  createEvents(line, 1, line.occurrences);
  return line;
}

export const lineRepo: LineRepo = {
  list: () => tick([...db().lines].sort((a, b) => a.sortOrder - b.sortOrder)),
  async create(input) { const l = createLine(input); persist(); return clone(l); },
  async update(id, patch) {
    const d = db();
    const line = d.lines.find((l) => l.id === id); if (!line) throw new Error("Line not found");
    if (patch.occurrences !== undefined && patch.occurrences !== line.occurrences) {
      const evs = d.events.filter((e) => e.lineId === id);
      const plan = planOccurrenceChange(evs, patch.occurrences); // throws if blocked
      const prev = evs.length;
      applyPatch("line", line, patch);
      if (plan.add) createEvents(line, prev + 1, prev + plan.add);
      for (const rid of plan.removeIds) audit("event", rid, "(deleted)", d.events.find((e) => e.id === rid)?.title, null);
      d.events = d.events.filter((e) => !plan.removeIds.includes(e.id));
    } else applyPatch("line", line, patch);
    retitle(line); persist(); return clone(line);
  },
  async duplicate(id) {
    const src = db().lines.find((l) => l.id === id); if (!src) throw new Error("Line not found");
    const { id: _i, sortOrder: _s, financePostedCents: _f, ...rest } = src;
    const l = createLine({ ...rest, description: `${src.description} (copy)` }); persist(); return clone(l);
  },
  async remove(id) {
    const d = db();
    const line = d.lines.find((l) => l.id === id);
    const evIds = d.events.filter((e) => e.lineId === id).map((e) => e.id);
    d.attachments.filter((a) => evIds.includes(a.eventId)).forEach((a) => audit("attachment", a.id, "(deleted)", a.fileName, null));
    d.attachments = d.attachments.filter((a) => !evIds.includes(a.eventId));
    evIds.forEach((e) => audit("event", e, "(deleted)", e, null));
    d.events = d.events.filter((e) => e.lineId !== id);
    d.lines = d.lines.filter((l) => l.id !== id);
    audit("line", id, "(deleted)", line?.description, null); persist();
  },
};

export const eventRepo: EventRepo = {
  list: () => tick(db().events),
  async update(id, patch) {
    const e = db().events.find((x) => x.id === id); if (!e) throw new Error("Event not found");
    applyPatch("event", e, patch); persist(); return clone(e);
  },
};

const readAsDataUrl = (file: File) =>
  new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });

export const attachmentRepo: AttachmentRepo = {
  list: () => tick(db().attachments),
  async add(eventId, file, label) {
    // Mock storage: small files are inlined so they survive a refresh; large ones use an object URL.
    const fileUrl = file.size < 1_500_000 ? await readAsDataUrl(file) : URL.createObjectURL(file);
    const a: Attachment = { id: uid(), eventId, fileName: file.name, fileUrl, mimeType: file.type, sizeBytes: file.size, label, uploadedAt: new Date().toISOString() };
    db().attachments.push(a);
    audit("attachment", a.id, "(created)", null, `${a.fileName}${label ? ` · ${label}` : ""}`);
    persist(); return clone(a);
  },
  async remove(id) {
    const d = db(); const a = d.attachments.find((x) => x.id === id);
    d.attachments = d.attachments.filter((x) => x.id !== id);
    audit("attachment", id, "(deleted)", a?.fileName, null); persist();
  },
};

export const auditRepo: AuditRepo = { list: () => tick([...db().audit].reverse()) };

export const adminRepo: AdminRepo = {
  async reset() { state = makeSeed(); persist(); },
  async importLines(rows) {
    const d = db(); const created = new Map<string, string>();
    for (const r of rows) {
      let cid = r.component.id;
      if (!cid) {
        cid = created.get(r.component.name);
        if (!cid) {
          const c: Component = { id: uid(), periodId: d.period?.id ?? "p1", code: String(d.components.length + 1), name: r.component.name, sortOrder: d.components.length + 1 };
          d.components.push(c); auditCreate("component", c); created.set(c.name, c.id); cid = c.id;
        }
      }
      createLine({ ...r.line, componentId: cid });
    }
    persist(); return rows.length;
  },
};

/** Test helper: load a fresh seed into memory. */
export const __resetForTests = () => { state = makeSeed(); };
