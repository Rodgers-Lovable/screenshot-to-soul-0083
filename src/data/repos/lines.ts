import type { Attachment, BudgetEvent, BudgetLine } from "@/lib/types";
import { planOccurrenceChange } from "@/lib/calc";
import { linkedLineMoveBlock } from "@/lib/deliveries";
import { cleanUnit, validateLineActivity, validateLineMove } from "@/lib/budget-tree";
import { eventTitle } from "../store";
import { applyPatch, audit, auditCreate, clone, db, read, tx, uid } from "./core";
import type { AdminRepo, LineInput, LineRepo } from "./types";

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
export function createLine(input: LineInput): BudgetLine {
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

export const adminRepo: AdminRepo = {
  importLines: (activityId, rows) =>
    tx(() => {
      for (const r of rows) createLine({ ...r, activityId });
      return rows.length;
    }),
};
