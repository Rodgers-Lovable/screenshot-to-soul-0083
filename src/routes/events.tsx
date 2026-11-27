import { createFileRoute, redirect } from "@tanstack/react-router";

// Old address of the Spending page. Keeps bookmarks and links working, with their filters.
export const Route = createFileRoute("/events")({
  validateSearch: (s: Record<string, unknown>) => s,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/spending", search: search as never, replace: true });
  },
});
