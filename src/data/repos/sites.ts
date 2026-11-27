import type { Site } from "@/lib/types";
import { nextSortOrder } from "@/lib/workplan";
import { applyPatch, auditCreate, clone, found, uid, wdb, wtx } from "./core";
import type { SiteRepo } from "./types";

export const siteRepo: SiteRepo = {
  add: (name) =>
    wtx(
      () => {
        const w = wdb();
        const n = name.trim();
        if (!n) throw new Error("Give the site a name.");
        if (w.sites.some((s) => s.name.trim().toLowerCase() === n.toLowerCase()))
          throw new Error("A site with that name already exists.");
        const site: Site = { id: uid(), name: n, sortOrder: nextSortOrder(w.sites) };
        w.sites.push(site);
        auditCreate("site", site);
        return clone(site);
      },
      { sites: true },
    ),
  rename: (id, name) =>
    wtx(
      () => {
        const w = wdb();
        const n = name.trim();
        if (!n) throw new Error("Give the site a name.");
        if (w.sites.some((s) => s.id !== id && s.name.trim().toLowerCase() === n.toLowerCase()))
          throw new Error("A site with that name already exists.");
        applyPatch(
          "site",
          found(
            w.sites.find((s) => s.id === id),
            "Site",
          ),
          { name: n },
        );
      },
      { sites: true },
    ),
  setArchived: (id, archived) =>
    wtx(
      () => {
        const s = found(
          wdb().sites.find((x) => x.id === id),
          "Site",
        );
        applyPatch("site", s, { archivedAt: archived ? new Date().toISOString() : undefined });
      },
      { sites: true },
    ),
};
