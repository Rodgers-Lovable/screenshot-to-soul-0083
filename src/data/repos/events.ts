import { validateEventLink } from "@/lib/deliveries";
import { applyPatch, clone, db, read, tx } from "./core";
import type { EventRepo } from "./types";

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
