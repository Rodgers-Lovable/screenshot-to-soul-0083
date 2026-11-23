import { createFileRoute, redirect } from "@tanstack/react-router";

// Old address of the record page under Spending.
export const Route = createFileRoute("/events_/$id/record")({
  validateSearch: (s: Record<string, unknown>) => s,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/spending/$id/record",
      params: { id: params.id },
      search: search as never,
      replace: true,
    });
  },
});
