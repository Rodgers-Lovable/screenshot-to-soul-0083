import type { BudgetEvent, Delivery } from "@/lib/types";
import {
  deliveryDeleteBlock,
  deliveryLabel,
  isDuplicateRound,
  nextRound,
  planRounds,
  validateDelivery,
  validateEventLink,
  validateRounds,
} from "@/lib/deliveries";
import { applyPatch, audit, clone, db, found, read, tx, uid } from "./core";
import type { DeliveryRepo } from "./types";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const deliveryOf = (id: string) =>
  found(
    db().deliveries.find((x) => x.id === id),
    "Round",
  );
const siteLabel = (siteId: string) => db().sites.find((s) => s.id === siteId)?.name;
const deliveryText = (x: Delivery) => deliveryLabel(x, siteLabel);
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
          `Round ${round}${siteId ? ` at ${siteLabel(siteId) ?? "a site"}` : ""} already exists.`,
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
