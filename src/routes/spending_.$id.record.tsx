import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useBudgetData } from "@/data/hooks";
import { RecordActualsForm } from "@/components/app/record-actuals";

export const Route = createFileRoute("/spending_/$id/record")({
  head: () => ({
    meta: [
      { title: "Record actuals · Project Budget Tracker" },
      {
        name: "description",
        content: "Record what actually happened at an event and attach evidence.",
      },
      { property: "og:title", content: "Record actuals · Project Budget Tracker" },
      {
        property: "og:description",
        content: "Record what actually happened at an event and attach evidence.",
      },
    ],
  }),
  component: RecordPage,
});

function RecordPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const ev = useBudgetData().events.find((e) => e.id === id);
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/spending"
        search={{}}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Spending
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Record actuals</h1>
      <p className="mb-4 text-sm text-muted-foreground">{ev?.title}</p>
      <RecordActualsForm eventId={id} onDone={() => nav({ to: "/spending", search: {} })} />
    </div>
  );
}
