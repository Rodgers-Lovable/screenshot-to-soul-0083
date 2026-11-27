// Pure workplan rules: year choice, overlap, tree order, duplicate codes, repeat rule.
import type {
  Activity,
  ActivityKind,
  BudgetPeriod,
  Objective,
  Outcome,
  RepeatUnit,
} from "@/lib/types";

type Span = Pick<BudgetPeriod, "id" | "startDate" | "endDate">;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const dated = (y: Span) => isoDate.test(y.startDate) && isoDate.test(y.endDate);

/** Saved year if it belongs to the study, else the open year holding today, else the latest. */
export function pickDefaultYear<T extends Span & { status: string }>(
  years: T[],
  today: string,
  savedId?: string | null,
): T | null {
  if (!years.length) return null;
  const saved = savedId ? years.find((y) => y.id === savedId) : undefined;
  if (saved) return saved;
  const current = years
    .filter((y) => y.status === "open" && dated(y) && y.startDate <= today && today <= y.endDate)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  if (current) return current;
  return (
    [...years].sort(
      (a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id),
    )[0] ?? null
  );
}

/** The first other year whose dates overlap the given range (inclusive). */
export function findOverlap<T extends Span>(
  years: T[],
  start: string,
  end: string,
  exceptId?: string,
): T | null {
  if (!isoDate.test(start) || !isoDate.test(end)) return null;
  return (
    years.find((y) => y.id !== exceptId && dated(y) && y.startDate <= end && start <= y.endDate) ??
    null
  );
}

export function validateYear(
  v: { name: string; startDate: string; endDate: string; fxRate: number; currency: string },
  others: Span[],
  exceptId?: string,
): string | null {
  if (!v.name.trim()) return "Give the year a name.";
  if (!isoDate.test(v.startDate) || !isoDate.test(v.endDate)) return "Choose a start and end date.";
  if (v.endDate <= v.startDate) return "The end date must be after the start date.";
  if (!(v.fxRate > 0)) return "The exchange rate must be above zero.";
  if (!/^[A-Z]{3}$/.test(v.currency.trim().toUpperCase())) return "Use a 3-letter currency code.";
  const clash = findOverlap(others, v.startDate, v.endDate, exceptId) as
    (Span & { name?: string }) | null;
  if (clash) return `These dates overlap ${clash.name ? `"${clash.name}"` : "another year"}.`;
  return null;
}

type Ordered = { id: string; code?: string; sortOrder: number };
const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export const byOrder = (a: Ordered, b: Ordered) =>
  a.sortOrder - b.sortOrder ||
  natural.compare(a.code ?? "", b.code ?? "") ||
  a.id.localeCompare(b.id);

export interface ActivityNode {
  activity: Activity;
}
export interface OutcomeNode {
  outcome: Outcome;
  activities: Activity[];
}
export interface ObjectiveNode {
  objective: Objective;
  outcomes: OutcomeNode[];
}

/** Objective > outcome > activity, each level ordered. Rows with a missing parent are left out. */
export function buildTree(
  objectives: Objective[],
  outcomes: Outcome[],
  activities: Activity[],
): ObjectiveNode[] {
  return [...objectives].sort(byOrder).map((objective) => ({
    objective,
    outcomes: outcomes
      .filter((o) => o.objectiveId === objective.id)
      .sort(byOrder)
      .map((outcome) => ({
        outcome,
        activities: activities.filter((a) => a.outcomeId === outcome.id).sort(byOrder),
      })),
  }));
}

export interface TreeFilter {
  kind?: ActivityKind | "all";
  search?: string;
}

/** Keeps activities that match, and the objectives and outcomes above them. */
export function filterTree(tree: ObjectiveNode[], f: TreeFilter): ObjectiveNode[] {
  const q = (f.search ?? "").trim().toLowerCase();
  const kind = f.kind && f.kind !== "all" ? f.kind : null;
  if (!q && !kind) return tree;
  const hit = (...parts: string[]) => parts.some((p) => p.toLowerCase().includes(q));
  return tree
    .map((o) => ({
      ...o,
      outcomes: o.outcomes
        .map((oc) => {
          const parentHit =
            !!q &&
            (hit(o.objective.code, o.objective.title) || hit(oc.outcome.code, oc.outcome.title));
          return {
            ...oc,
            activities: oc.activities.filter(
              (a) =>
                (!kind || a.kind === kind) &&
                (!q ||
                  parentHit ||
                  hit(a.code, a.title, a.output, a.meansOfVerification, a.frequencyLabel)),
            ),
          };
        })
        .filter((oc) => oc.activities.length),
    }))
    .filter((o) => o.outcomes.length);
}

/** Codes used more than once among siblings. Codes are free text, so this only warns. */
export function duplicateCodes(items: { code: string }[]): Set<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const { code } of items) {
    const c = code.trim().toLowerCase();
    if (!c) continue;
    if (seen.has(c)) dup.add(c);
    seen.add(c);
  }
  return dup;
}
export const isDuplicate = (dups: Set<string>, code: string) => dups.has(code.trim().toLowerCase());

export function validateRepeat(every?: number | null, unit?: RepeatUnit | null): string | null {
  const noEvery = every === undefined || every === null;
  if (noEvery && !unit) return null;
  if (noEvery || !unit) return "Set both the number and the unit, or leave both empty.";
  if (!Number.isInteger(every) || every <= 0)
    return "Repeat every must be a whole number above zero.";
  return null;
}

export const nextSortOrder = (items: { sortOrder: number }[]) =>
  items.reduce((m, i) => Math.max(m, i.sortOrder), 0) + 1;

/** New sort orders after moving one item up or down. Empty when it cannot move. */
export function moveWithin<T extends Ordered>(
  siblings: T[],
  id: string,
  dir: "up" | "down",
): { id: string; sortOrder: number }[] {
  const list = [...siblings].sort(byOrder);
  const i = list.findIndex((x) => x.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return [];
  const a = list[i];
  const b = list[j];
  if (!a || !b) return [];
  list[i] = b;
  list[j] = a;
  const before = new Map(siblings.map((s) => [s.id, s.sortOrder]));
  return list
    .map((x, n) => ({ id: x.id, sortOrder: n + 1 }))
    .filter((x) => before.get(x.id) !== x.sortOrder);
}

/** Frequency as people read it, e.g. "Every 2 weeks". */
export function frequencyText(label: string, every?: number, unit?: RepeatUnit): string {
  const rule = every && unit ? `every ${every} ${every === 1 ? unit.replace(/s$/, "") : unit}` : "";
  if (label && rule) return `${label} (${rule})`;
  return label || (rule ? rule.charAt(0).toUpperCase() + rule.slice(1) : "");
}

/** A short label for a year's dates, such as "2027" or "2026/2027". */
export function yearLabel(startDate: string, endDate: string): string {
  const a = startDate.slice(0, 4);
  const b = endDate.slice(0, 4);
  return a === b ? a : `${a}/${b}`;
}

export interface YearDates {
  name: string;
  startDate: string;
  endDate: string;
}
const pad = (n: number) => String(n).padStart(2, "0");
const fyName = (startYear: number) => `FY ${startYear}/${pad((startYear + 1) % 100)}`;
const fyOf = (startYear: number): YearDates => ({
  name: fyName(startYear),
  startDate: `${startYear}-09-30`,
  endDate: `${startYear + 1}-09-29`,
});

/** The financial year (30 September to 29 September) holding a date. Null if the date is invalid. */
export function financialYearContaining(date: string): YearDates | null {
  if (!isoDate.test(date)) return null;
  const y = Number(date.slice(0, 4));
  return fyOf(date.slice(5) >= "09-30" ? y : y - 1);
}

/** The first financial year that starts after the given year ends, so it never overlaps. */
export function nextFinancialYearAfter(prev: { endDate: string }): YearDates | null {
  const cur = financialYearContaining(prev.endDate);
  return cur ? fyOf(Number(cur.startDate.slice(0, 4)) + 1) : null;
}

/** Fills a blank start or end with the matching financial year. Nothing is saved by this. */
export function prefillYearDates<T extends { startDate: string; endDate: string }>(
  y: T,
  today: string,
): T {
  if (isoDate.test(y.startDate) && isoDate.test(y.endDate)) return y;
  const fy =
    financialYearContaining(isoDate.test(y.startDate) ? y.startDate : y.endDate) ??
    financialYearContaining(today);
  if (!fy) return y;
  return {
    ...y,
    startDate: isoDate.test(y.startDate) ? y.startDate : fy.startDate,
    endDate: isoDate.test(y.endDate) ? y.endDate : fy.endDate,
  };
}

/** Start and end for a new year: the financial year of today, or the one after the latest year. */
export function defaultNewYear(years: Span[], today: string): YearDates | null {
  const latest = [...years]
    .filter(dated)
    .sort((a, b) => b.endDate.localeCompare(a.endDate) || b.id.localeCompare(a.id))[0];
  return latest ? nextFinancialYearAfter(latest) : financialYearContaining(today);
}

/** The editable fields of an activity. */
export interface ActivityFormValue {
  code: string;
  title: string;
  kind: ActivityKind;
  output: string;
  meansOfVerification: string;
  frequencyLabel: string;
  repeatEvery?: number;
  repeatUnit?: RepeatUnit;
  notes: string;
}
export const blankActivity: ActivityFormValue = {
  code: "",
  title: "",
  kind: "general",
  output: "",
  meansOfVerification: "",
  frequencyLabel: "",
  notes: "",
};
export const toFormValue = (a: Activity): ActivityFormValue => ({
  code: a.code,
  title: a.title,
  kind: a.kind,
  output: a.output,
  meansOfVerification: a.meansOfVerification,
  frequencyLabel: a.frequencyLabel,
  repeatEvery: a.repeatEvery,
  repeatUnit: a.repeatUnit,
  notes: a.notes,
});

export const activityFormValid = (v: ActivityFormValue) =>
  !!v.title.trim() && !validateRepeat(v.repeatEvery, v.repeatUnit);

export interface MultiEntry {
  add: string[];
  skipped: string[];
}

/** Splits a comma-separated entry. Skips blanks, repeats in the entry and names already present. */
export function parseMultiEntry(text: string, existing: string[] = []): MultiEntry {
  const key = (v: string) => v.toLowerCase();
  const seen = new Set(existing.map((e) => key(e.replace(/\s+/g, " ").trim())));
  const add: string[] = [];
  const skipped: string[] = [];
  for (const part of text.split(",")) {
    const v = part.replace(/\s+/g, " ").trim();
    if (!v) continue;
    if (seen.has(key(v))) skipped.push(v);
    else {
      seen.add(key(v));
      add.push(v);
    }
  }
  return { add, skipped };
}

/** Toast text for a multi-add result. */
export function multiAddMessage(noun: string, plural: string, added: number, skipped: number) {
  const dup = `${skipped} duplicate${skipped === 1 ? "" : "s"} skipped`;
  if (!added)
    return `Nothing added: ${skipped === 1 ? "that is" : "all are"} already on this activity.`;
  const base = `${added} ${added === 1 ? noun : plural} added`;
  return skipped ? `${base}, ${dup}` : base;
}
