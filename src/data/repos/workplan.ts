import type { Activity, Delivery, Objective, Outcome } from "@/lib/types";
import { KIND_CHANGE_BLOCK, parentDeleteBlock } from "@/lib/deliveries";
import { fundedDeleteMessage, linesUnder } from "@/lib/budget-tree";
import { moveWithin, nextSortOrder, validateRepeat } from "@/lib/workplan";
import { loadWorkplan } from "../remote";
import {
  activityOf,
  applyPatch,
  audit,
  auditCreate,
  budgetSnapshot,
  clone,
  found,
  scopeNow,
  uid,
  wdb,
  wtx,
} from "./core";
import { activityDetailsRepo } from "./activity-details";
import type { ActivityInput, MoveDir, WorkplanRepo } from "./types";

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
const deliveriesUnder = (activityIds: Set<string>, all: Delivery[]) =>
  all.filter((d) => activityIds.has(d.activityId)).length;

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

  ...activityDetailsRepo,
};
