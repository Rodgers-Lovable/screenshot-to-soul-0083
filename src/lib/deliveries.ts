// Pure delivery rules: status roll-up, rounds, proof flags, indicator totals and delete checks.
import { scheduleDates, type FlagKind, type Repeat } from "@/lib/calc";
import type { ObjectiveNode } from "@/lib/workplan";
import type {
  ActivityIndicator,
  ActivityKind,
  BudgetEvent,
  BudgetLine,
  Delivery,
  DeliveryResult,
  DeliveryStatus,
  EventStatus,
} from "@/lib/types";

export const DELIVERY_STATUSES: DeliveryStatus[] = ["planned", "in_progress", "completed"];
export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  planned: "Not started",
  in_progress: "Ongoing",
  completed: "Done",
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** No deliveries, or none started, is planned. All completed is completed. Anything else is in progress. */
export function activityStatus(deliveries: Pick<Delivery, "status">[]): DeliveryStatus {
  if (!deliveries.length || deliveries.every((d) => d.status === "planned")) return "planned";
  if (deliveries.every((d) => d.status === "completed")) return "completed";
  return "in_progress";
}

export interface DeliveryProgress {
  total: number;
  planned: number;
  inProgress: number;
  completed: number;
}
export function deliveryProgress(deliveries: Pick<Delivery, "status">[]): DeliveryProgress {
  const count = (s: DeliveryStatus) => deliveries.filter((d) => d.status === s).length;
  return {
    total: deliveries.length,
    planned: count("planned"),
    inProgress: count("in_progress"),
    completed: count("completed"),
  };
}

/** Progress as the tree shows it, such as "2 of 5". Empty when there are no deliveries. */
export function progressText(p: DeliveryProgress): string {
  return p.total ? `${p.completed} of ${p.total}` : "";
}

/** Deliveries grouped by activity id. */
export function byActivity(deliveries: Delivery[]): Map<string, Delivery[]> {
  const m = new Map<string, Delivery[]>();
  for (const d of deliveries) m.set(d.activityId, [...(m.get(d.activityId) ?? []), d]);
  return m;
}

export const roundText = (d: Pick<Delivery, "roundNumber" | "roundLabel">) =>
  d.roundLabel.trim() ? `Round ${d.roundNumber}: ${d.roundLabel.trim()}` : `Round ${d.roundNumber}`;

/** "Round 2 at Site A". A site that can't be found reads as "a site". */
export const deliveryLabel = (
  d: Pick<Delivery, "roundNumber" | "roundLabel" | "siteId">,
  siteName: (id: string) => string | undefined,
) => (d.siteId ? `${roundText(d)} at ${siteName(d.siteId) || "a site"}` : roundText(d));

export interface RoundGroup {
  roundNumber: number;
  label: string;
  items: Delivery[];
}

/** Deliveries by round, rounds in order, each round's deliveries ordered by site name. */
export function groupByRound(
  deliveries: Delivery[],
  siteName: (id?: string) => string = (id) => id ?? "",
): RoundGroup[] {
  const map = new Map<number, Delivery[]>();
  for (const d of deliveries) map.set(d.roundNumber, [...(map.get(d.roundNumber) ?? []), d]);
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([roundNumber, items]) => ({
      roundNumber,
      label: items.find((i) => i.roundLabel.trim())?.roundLabel.trim() ?? "",
      items: [...items].sort(
        (a, b) => siteName(a.siteId).localeCompare(siteName(b.siteId)) || a.id.localeCompare(b.id),
      ),
    }));
}

export interface DeliveryFilter {
  siteId?: string;
  status?: DeliveryStatus;
}
export const filterDeliveries = (list: Delivery[], f: DeliveryFilter) =>
  list.filter((d) => (!f.siteId || d.siteId === f.siteId) && (!f.status || d.status === f.status));

/** A completed delivery with no proof file. */
export const missingEvidence = (d: Pick<Delivery, "status">, proofCount: number) =>
  d.status === "completed" && proofCount === 0;

export function deliveryFlags(
  d: Pick<Delivery, "status" | "plannedDate">,
  proofCount: number,
  today: string,
): FlagKind[] {
  const f: FlagKind[] = [];
  if (d.status !== "completed" && d.plannedDate && d.plannedDate < today) f.push("overdue");
  if (missingEvidence(d, proofCount)) f.push("missing-evidence");
  return f;
}

export interface NewDelivery {
  roundNumber: number;
  siteId?: string;
  plannedDate?: string;
}
export interface RoundPlan {
  create: NewDelivery[];
  /** Combinations that already exist, left alone. */
  existing: number;
  /** Planned dates outside the year, for a warning. */
  outsideYear: number;
  /** Chosen sites that are archived, so no delivery is made there. */
  archivedSites: number;
}

/** Dates for each round: from the first date, repeating by the rule if there is one. */
export function roundDates(first: string | undefined, rounds: number, repeat?: Repeat | null) {
  if (!first || !isoDate.test(first)) return Array<string | undefined>(rounds).fill(undefined);
  if (!repeat) return Array.from({ length: rounds }, (_, i) => (i === 0 ? first : undefined));
  return scheduleDates(first, rounds, repeat);
}

/**
 * The deliveries to add for rounds 1..rounds. A site activity gets one per selected active site per
 * round, a general activity one per round. Combinations that exist already are never repeated.
 */
export function planRounds(o: {
  kind: ActivityKind;
  rounds: number;
  /** Sites selected on the activity, with their archived state. */
  sites: { id: string; archived: boolean }[];
  existing: Pick<Delivery, "roundNumber" | "siteId">[];
  firstDate?: string;
  repeat?: Repeat | null;
  year?: { startDate: string; endDate: string } | null;
}): RoundPlan {
  const rounds = Math.max(0, Math.floor(o.rounds));
  const dates = roundDates(o.firstDate, rounds, o.repeat);
  const active = o.kind === "site" ? o.sites.filter((s) => !s.archived).map((s) => s.id) : [];
  const archivedSites = o.kind === "site" ? o.sites.filter((s) => s.archived).length : 0;
  const have = new Set(o.existing.map((d) => `${d.roundNumber}:${d.siteId ?? ""}`));
  const create: NewDelivery[] = [];
  let existing = 0;
  for (let r = 1; r <= rounds; r++) {
    for (const siteId of o.kind === "site" ? active : [undefined]) {
      if (have.has(`${r}:${siteId ?? ""}`)) existing++;
      else create.push({ roundNumber: r, siteId, plannedDate: dates[r - 1] });
    }
  }
  const outsideYear = o.year
    ? create.filter(
        (c) =>
          c.plannedDate && (c.plannedDate < o.year!.startDate || c.plannedDate > o.year!.endDate),
      ).length
    : 0;
  return { create, existing, outsideYear, archivedSites };
}

export const MAX_ROUNDS = 100;

export function validateRounds(rounds: number, kind: ActivityKind, activeSites: number) {
  if (!Number.isInteger(rounds) || rounds < 1)
    return "Enter how many rounds, a whole number above zero.";
  if (rounds > MAX_ROUNDS) return `Create at most ${MAX_ROUNDS} rounds at a time.`;
  if (kind === "site" && !activeSites)
    return "Choose at least one active site for this activity first.";
  return null;
}

/** The next free round number at a site, or for the activity when it has no site. */
export function nextRound(existing: Pick<Delivery, "roundNumber" | "siteId">[], siteId?: string) {
  return (
    existing
      .filter((d) => (d.siteId ?? "") === (siteId ?? ""))
      .reduce((m, d) => Math.max(m, d.roundNumber), 0) + 1
  );
}

export const isDuplicateRound = (
  existing: Pick<Delivery, "id" | "roundNumber" | "siteId">[],
  round: number,
  siteId?: string,
  exceptId?: string,
) =>
  existing.some(
    (d) => d.id !== exceptId && d.roundNumber === round && (d.siteId ?? "") === (siteId ?? ""),
  );

/** Message when a status or date change is not allowed, else null. */
export function validateDelivery(v: {
  status: DeliveryStatus;
  plannedDate?: string;
  actualDate?: string;
}): string | null {
  if (!DELIVERY_STATUSES.includes(v.status)) return "Choose not started, ongoing or done.";
  for (const d of [v.plannedDate, v.actualDate])
    if (d && !isoDate.test(d)) return "Enter dates as year, month and day.";
  if (v.status === "completed" && !v.actualDate)
    return "Add the date it took place before marking it done.";
  return null;
}

/** Why a delivery cannot be deleted, else null. Spending links and proof files both block it. */
export function deliveryDeleteBlock(o: {
  linkedSpending: number;
  proofFiles: number;
}): string | null {
  if (o.linkedSpending)
    return `This round has ${o.linkedSpending} spending record${o.linkedSpending === 1 ? "" : "s"} linked to it. Unlink ${o.linkedSpending === 1 ? "it" : "them"} before deleting the round.`;
  if (o.proofFiles)
    return `This round has ${o.proofFiles} proof file${o.proofFiles === 1 ? "" : "s"}. Remove ${o.proofFiles === 1 ? "it" : "them"} before deleting the round.`;
  return null;
}

export function parentDeleteBlock(
  what: "activity" | "outcome" | "objective",
  deliveries: number,
): string | null {
  if (!deliveries) return null;
  const n = deliveries === 1 ? "1 round" : `${deliveries} rounds`;
  return what === "activity"
    ? `This activity has ${n}. Delete the rounds before deleting the activity.`
    : `This ${what} has activities with ${n}. Delete the rounds before deleting the ${what}.`;
}

export const linkedLineMoveBlock = (n: number) =>
  `${n} spending record${n === 1 ? " of this line is" : "s of this line are"} linked to rounds. Unlink ${n === 1 ? "it" : "them"} before moving the line to another activity.`;
export const KIND_CHANGE_BLOCK =
  "This activity has rounds, so it cannot change between general and site.";
export const siteRemovalBlock = (siteName: string) =>
  `${siteName} has rounds on this activity. Delete them before removing the site.`;
export const INDICATOR_DELETE_BLOCK =
  "This indicator has recorded results. Delete the rounds or clear the results first.";

/** Why a spending record cannot link to a delivery, else null. */
export function validateEventLink(
  line: Pick<BudgetLine, "activityId"> | undefined,
  delivery: Pick<Delivery, "id" | "activityId"> | undefined,
  event: Pick<BudgetEvent, "deliveryId">,
): string | null {
  if (!line || !delivery) return "Round not found.";
  if (line.activityId !== delivery.activityId)
    return "A spending record can only link to a round of the same activity.";
  if (event.deliveryId && event.deliveryId !== delivery.id)
    return "That spending record is already linked to another round. Unlink it first.";
  return null;
}

/** After a spending record is marked done, whether to offer marking its round done on the same date. */
export const offerRoundDone = (
  eventStatus: EventStatus,
  round: Pick<Delivery, "status"> | undefined,
  actualDate: string,
) => eventStatus === "done" && !!round && round.status !== "completed" && isoDate.test(actualDate);

/** Spending records of the activity that are not linked to any delivery. */
export function linkableEvents(
  activityId: string,
  lines: BudgetLine[],
  events: BudgetEvent[],
): BudgetEvent[] {
  const mine = new Set(lines.filter((l) => l.activityId === activityId).map((l) => l.id));
  return events.filter((e) => mine.has(e.lineId) && !e.deliveryId);
}

export interface IndicatorTotal {
  indicator: ActivityIndicator;
  total: number;
  target?: number;
  /** Share of the target reached, as a whole percent. Undefined without a target. */
  percent?: number;
  recorded: number;
}

/** Recorded results added up per indicator, beside its target. */
export function indicatorTotals(
  indicators: ActivityIndicator[],
  results: DeliveryResult[],
): IndicatorTotal[] {
  return [...indicators]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((indicator) => {
      const mine = results.filter((r) => r.indicatorId === indicator.id);
      const total = mine.reduce((s, r) => s + r.value, 0);
      const target = indicator.target;
      return {
        indicator,
        total,
        target,
        recorded: mine.length,
        percent: target ? Math.round((total / target) * 100) : undefined,
      };
    });
}

/** Keeps activities with the given calculated status, and the objectives and outcomes above them. */
export function filterTreeByStatus(
  tree: ObjectiveNode[],
  status: DeliveryStatus | "all",
  statusOf: (activityId: string) => DeliveryStatus,
): ObjectiveNode[] {
  if (status === "all") return tree;
  return tree
    .map((o) => ({
      ...o,
      outcomes: o.outcomes
        .map((oc) => ({
          ...oc,
          activities: oc.activities.filter((a) => statusOf(a.id) === status),
        }))
        .filter((oc) => oc.activities.length),
    }))
    .filter((o) => o.outcomes.length);
}

/** Status and progress text for an activity's status chip. */
export const activityChip = (deliveries: Pick<Delivery, "status">[]) => ({
  status: activityStatus(deliveries),
  progress: progressText(deliveryProgress(deliveries)),
});
