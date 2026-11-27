import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

const make = (path = "/") =>
  createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [path] }),
  });

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = make();

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it.each([
    ["/activities", "/activities"],
    ["/activities/a1", "/activities_/$id"],
    ["/spending", "/spending"],
    ["/spending/e1/record", "/spending_/$id/record"],
    ["/budget", "/budget"],
    ["/settings", "/settings"],
  ])("matches %s", (path, id) => {
    expect(make().matchRoutes(path).at(-1)?.routeId).toBe(id);
  });

  it("redirects the old events page to spending and keeps the filters", async () => {
    const router = make("/events?tab=done&flag=overdue&q=bus");
    await router.load();
    expect(router.state.location.pathname).toBe("/spending");
    expect(router.state.location.search).toEqual({ tab: "done", flag: "overdue", q: "bus" });
  });

  it("redirects the old record page to spending", async () => {
    const router = make("/events/e1/record");
    await router.load();
    expect(router.state.location.pathname).toBe("/spending/e1/record");
  });
});
