// Pure rules for budget lines under the workplan: tree subtotals, moves, units, delete guards.
import { lineSummary, sumSummaries, type Summary } from "./calc";
import { byOrder } from "./workplan";
import type { Activity, BudgetEvent, BudgetLine, Objective, Outcome } from "./types";
import { ONE_OFF } from "./types";

export const isOneOff = (unit: string) => unit.trim().toLowerCase() === ONE_OFF;

/** Trims and collapses spaces in a free-text unit. Returns null when nothing is left. */
export function cleanUnit(v: string): string | null {
  const u = v.trim().replace(/\s+/g, " ");
  return u ? u : null;
}

/** Standard units first, then the ones already used. Case-insensitive, no repeats. */
export function unitSuggestions(standard: string[], used: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (u: string) => {
    const c = cleanUnit(u);
    if (!c || seen.has(c.toLowerCase())) return;
    seen.add(c.toLowerCase());
    out.push(c);
  };
  standard.forEach(add);
  used
    .map((u) => cleanUnit(u) ?? "")
    .sort((a, b) => a.localeCompare(b))
    .forEach(add);
  return out;
}

export const activityLabel = (a: Pick<Activity, "code" | "title">) =>
  a.code ? `${a.code}. ${a.title}` : a.title;

export interface ActivityBudget {
  activity: Activity;
  lines: BudgetLine[];
  summary: Summary;
  funded: boolean;
}
export interface OutcomeBudget {
  outcome: Outcome;
  activities: ActivityBudget[];
  summary: Summary;
}
export interface ObjectiveBudget {
  objective: Objective;
  outcomes: OutcomeBudget[];
  summary: Summary;
}

/** Objective, outcome, activity, with the lines of each activity and subtotals at every level. */
export function buildBudgetTree(
  objectives: Objective[],
  outcomes: Outcome[],
  activities: Activity[],
  lines: BudgetLine[],
  events: BudgetEvent[],
): ObjectiveBudget[] {
  const sums = new Map(lines.map((l) => [l.id, lineSummary(l, events)]));
  return [...objectives].sort(byOrder).map((objective) => {
    const oc = outcomes
      .filter((o) => o.objectiveId === objective.id)
      .sort(byOrder)
      .map((outcome) => {
        const acts = activities
          .filter((a) => a.outcomeId === outcome.id)
          .sort(byOrder)
          .map((activity) => {
            const own = lines
              .filter((l) => l.activityId === activity.id)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            return {
              activity,
              lines: own,
              funded: own.length > 0,
              summary: sumSummaries(own.flatMap((l) => sums.get(l.id) ?? [])),
            };
          });
        return { outcome, activities: acts, summary: sumSummaries(acts.map((a) => a.summary)) };
      });
    return { objective, outcomes: oc, summary: sumSummaries(oc.map((o) => o.summary)) };
  });
}

export interface BudgetFilter {
  search?: string;
  activityId?: string;
  funding?: "all" | "funded" | "unfunded";
}

/** Keeps activities that pass the filter, and the objectives and outcomes above them. Subtotals stay full. */
export function filterBudgetTree(tree: ObjectiveBudget[], f: BudgetFilter): ObjectiveBudget[] {
  const q = (f.search ?? "").trim().toLowerCase();
  const funding = f.funding ?? "all";
  if (!q && !f.activityId && funding === "all") return tree;
  return tree
    .map((o) => ({
      ...o,
      outcomes: o.outcomes
        .map((oc) => ({
          ...oc,
          activities: oc.activities
            .filter((a) => !f.activityId || a.activity.id === f.activityId)
            .filter((a) => funding === "all" || (funding === "funded") === a.funded)
            .map((a) =>
              q
                ? { ...a, lines: a.lines.filter((l) => l.description.toLowerCase().includes(q)) }
                : a,
            )
            .filter((a) => !q || a.lines.length > 0),
        }))
        .filter((oc) => oc.activities.length),
    }))
    .filter((o) => o.outcomes.length);
}

interface Chain {
  objectives: Objective[];
  outcomes: Outcome[];
  activities: Activity[];
}

/** The year an activity belongs to, found through its outcome and objective. */
export function activityPeriodId(activityId: string, c: Chain): string | undefined {
  const a = c.activities.find((x) => x.id === activityId);
  const oc = a && c.outcomes.find((x) => x.id === a.outcomeId);
  return oc && c.objectives.find((x) => x.id === oc.objectiveId)?.periodId;
}

/** Problem with putting a line on an activity of the active year, or null if allowed. */
export function validateLineActivity(
  activityId: string,
  periodId: string | undefined,
  c: Chain,
): string | null {
  if (!activityId) return "Choose an activity for this line.";
  const p = activityPeriodId(activityId, c);
  if (!p) return "That activity is not in this year.";
  if (periodId && p !== periodId) return "That activity belongs to another year.";
  return null;
}

/** A line can move between activities of its own year only. */
export function validateLineMove(
  line: Pick<BudgetLine, "activityId">,
  targetId: string,
  c: Chain,
): string | null {
  if (line.activityId === targetId) return "The line is already on that activity.";
  const from = activityPeriodId(line.activityId, c);
  const to = activityPeriodId(targetId, c);
  if (!to) return "That activity is not in this year.";
  if (from && from !== to) return "A line cannot move to an activity in another year.";
  return null;
}

export interface ActivityOption {
  id: string;
  label: string;
  group: string;
}

/** Activities of the year in workplan order, each with its objective and outcome as a group. */
export function activityOptions(c: Chain): ActivityOption[] {
  const out: ActivityOption[] = [];
  for (const o of [...c.objectives].sort(byOrder))
    for (const oc of c.outcomes.filter((x) => x.objectiveId === o.id).sort(byOrder))
      for (const a of c.activities.filter((x) => x.outcomeId === oc.id).sort(byOrder))
        out.push({
          id: a.id,
          label: activityLabel(a),
          group: `${activityLabel(o)} / ${activityLabel(oc)}`,
        });
  return out;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Why a workplan item cannot be deleted while its activities hold budget lines, or null. */
export function fundedDeleteMessage(
  kind: "activity" | "outcome" | "objective",
  lineCount: number,
): string | null {
  if (!lineCount) return null;
  const what = kind === "activity" ? "this activity" : `activities under this ${kind}`;
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} cannot be deleted because ${what} ${
    kind === "activity" ? "has" : "have"
  } ${plural(lineCount, "budget line")}. Move the lines to another activity, or delete them, first.`;
}

/** Number of lines under the given activities. */
export const linesUnder = (activityIds: Iterable<string>, lines: BudgetLine[]) => {
  const ids = new Set(activityIds);
  return lines.filter((l) => ids.has(l.activityId)).length;
};

export interface ExportRow {
  objective: string;
  outcome: string;
  activity: string;
  line: BudgetLine;
}

/** Lines in workplan order with their objective, outcome and activity, for exports. */
export function exportRows(tree: ObjectiveBudget[]): ExportRow[] {
  return tree.flatMap((o) =>
    o.outcomes.flatMap((oc) =>
      oc.activities.flatMap((a) =>
        a.lines.map((line) => ({
          objective: activityLabel(o.objective),
          outcome: activityLabel(oc.outcome),
          activity: activityLabel(a.activity),
          line,
        })),
      ),
    ),
  );
}
