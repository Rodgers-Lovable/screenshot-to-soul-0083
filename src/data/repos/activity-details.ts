// Indicators, responsible people and sites of one activity.
import type { ActivityIndicator, ActivityResponsible } from "@/lib/types";
import { INDICATOR_DELETE_BLOCK, siteRemovalBlock } from "@/lib/deliveries";
import { nextSortOrder, parseMultiEntry } from "@/lib/workplan";
import {
  activityOf,
  applyPatch,
  audit,
  auditCreate,
  budgetSnapshot,
  found,
  scopeNow,
  uid,
  wdb,
  wtx,
} from "./core";
import type { WorkplanRepo } from "./types";

type ActivityDetailsRepo = Pick<
  WorkplanRepo,
  | "addIndicators"
  | "updateIndicator"
  | "removeIndicator"
  | "addResponsibles"
  | "updateResponsible"
  | "removeResponsible"
  | "setActivitySites"
>;

export const activityDetailsRepo: ActivityDetailsRepo = {
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
