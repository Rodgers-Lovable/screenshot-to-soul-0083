import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  Info,
  Loader2,
  MoveRight,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBudgetData, useUpdateLine } from "@/data/hooks";
import { actualInputs, eventFigures, eventFlags, lineFlags, lineSummary } from "@/lib/calc";
import { formulaShort, kesToCents, pct, todayISO } from "@/lib/format";
import { Money, useFmt, Variance } from "@/components/app/currency";
import { Flags, StatusChip } from "@/components/app/chips";
import { LineEditor } from "@/components/app/line-editor";
import { MoveLineDialog } from "@/components/app/move-line-dialog";
import { activityLabel } from "@/lib/budget-tree";
import { useRecord } from "@/components/app/shell";
import { useYear } from "@/components/app/active-year-context";
import { Truncated } from "@/components/app/truncated";
import { ScheduleDialog } from "@/components/app/schedule-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/budget_/lines/$id")({
  head: () => ({
    meta: [
      { title: "Budget line · Project Budget Tracker" },
      { name: "description", content: "Planned vs actual for one budget line and its events." },
      { property: "og:title", content: "Budget line · Project Budget Tracker" },
      {
        property: "og:description",
        content: "Planned vs actual for one budget line and its events.",
      },
    ],
  }),
  component: LineDetail,
});

function LineDetail() {
  const { id } = Route.useParams();
  const d = useBudgetData();
  const f = useFmt();
  const dir = (c: number) =>
    c ? `${f.primary(Math.abs(c))} ${c > 0 ? "under" : "over"}` : "on plan";
  const { open } = useRecord();
  const { canEdit } = useYear();
  const [edit, setEdit] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [moving, setMoving] = useState(false);
  const line = d.lines.find((l) => l.id === id);
  const events = useMemo(
    () => d.events.filter((e) => e.lineId === id).sort((a, b) => a.sequence - b.sequence),
    [d.events, id],
  );
  const s = useMemo(() => (line ? lineSummary(line, d.events) : null), [line, d.events]);
  if (!d.ready) return null;
  if (!line || !s)
    return (
      <p className="text-sm">
        Line not found.{" "}
        <Link to="/budget" className="text-primary underline">
          Back to budget
        </Link>
      </p>
    );
  const act = d.activities.find((a) => a.id === line.activityId);
  const today = todayISO();

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Link
            to="/budget"
            className="inline-flex shrink-0 items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Budget
          </Link>
          {act && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <Link
                to="/activities/$id"
                params={{ id: act.id }}
                className="min-w-0 hover:text-foreground"
              >
                <Truncated text={activityLabel(act)} className="max-w-xs" />
              </Link>
            </>
          )}
          {line.groupLabel && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <Truncated text={line.groupLabel} className="max-w-48" />
            </>
          )}
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-start gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{line.description}</h1>
              {line.justification && (
                <Popover>
                  <PopoverTrigger
                    className="mt-1.5 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                    aria-label="About this line"
                  >
                    <Info className="h-4 w-4" />
                  </PopoverTrigger>
                  <PopoverContent align="start" className="max-w-sm text-sm">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Justification</p>
                    {line.justification}
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <p className="text-sm text-muted-foreground tabular-nums">{formulaShort(line)}</p>
            <Flags flags={lineFlags(s)} />
          </div>
          <div className="flex gap-2">
            {events.some((e) => e.status === "planned") && (
              <Button variant="outline" disabled={!canEdit} onClick={() => setScheduling(true)}>
                <CalendarClock className="h-4 w-4" />
                Schedule
              </Button>
            )}
            <Button variant="outline" disabled={!canEdit} onClick={() => setMoving(true)}>
              <MoveRight className="h-4 w-4" />
              Move
            </Button>
            <Button variant="outline" disabled={!canEdit} onClick={() => setEdit(true)}>
              <Pencil className="h-4 w-4" />
              Edit line
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Headline label="Planned" cents={s.planned} />
        <Headline
          label="Actual to date"
          cents={s.actualToDate}
          danger={s.actualToDate > s.planned}
          progress={s.planned ? (s.actualToDate / s.planned) * 100 : 0}
          note={s.planned ? `${pct(s.actualToDate / s.planned)} of planned` : undefined}
        />
        <Headline label="Remaining" cents={s.remaining} danger={s.remaining < 0} />
      </div>

      <Card className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 md:grid-cols-4">
        <Minor label="Variance on completed">
          <Variance cents={s.varianceOnCompleted} className="items-start!" />
          <p className="text-xs text-muted-foreground tabular-nums">
            Volume {dir(s.volumeVariance)} · Rate {dir(s.rateVariance)}
          </p>
        </Minor>
        <Minor label="Still to spend">
          <Money cents={s.stillToSpend} className="items-start!" />
        </Minor>
        <Minor label="Projected balance">
          <Money
            cents={s.projectedBalance}
            tone={s.projectedBalance < 0 ? "danger" : undefined}
            className="items-start!"
          />
        </Minor>
        <Minor label="Released by cancellation">
          <Money cents={s.releasedByCancellation} className="items-start!" />
        </Minor>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Events</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-250 text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                <th className="text-right">#</th>
                <th className="text-left">Title</th>
                <th className="text-left">Planned date</th>
                <th className="text-left">Location</th>
                <th className="text-left">Status</th>
                <th className="text-right">Act. qty</th>
                <th className="text-right">Act. unit cost</th>
                <th className="text-right">Act. duration</th>
                <th className="text-right">Actual</th>
                <th className="text-right">Variance</th>
                <th className="text-right">Evidence</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const fig = eventFigures(line, e);
                const a = actualInputs(line, e);
                const n = d.attachments.filter((x) => x.eventId === e.id).length;
                const done = e.status === "done";
                return (
                  <tr key={e.id} className="h-10 border-t [&>td]:px-3 [&>td]:py-1">
                    <td className="num">{e.sequence}</td>
                    <td>
                      <Truncated text={e.title} className="max-w-65" />
                      <Flags flags={eventFlags(e, n, today)} />
                    </td>
                    <td className="tabular-nums">{e.plannedDate ?? "—"}</td>
                    <td>{e.location ?? ""}</td>
                    <td>
                      <StatusChip status={e.status} />
                    </td>
                    <td className="num">{done ? a.q1 : ""}</td>
                    <td className="num">{done ? f.kes(a.r1) : ""}</td>
                    <td className="num">{done ? a.d1 : ""}</td>
                    <td className="text-right">{done && <Money cents={fig.actual} />}</td>
                    <td className="text-right">{done && <Variance cents={fig.variance} />}</td>
                    <td className="num">{n}</td>
                    <td>
                      <Button size="sm" variant="outline" onClick={() => open(e.id)}>
                        {canEdit ? "Record" : "View"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <FinanceCard lineId={line.id} posted={line.financePostedCents} reported={s.actualToDate} />
      <LineEditor open={edit} onOpenChange={setEdit} line={line} />
      <MoveLineDialog line={moving ? line : null} onClose={() => setMoving(false)} />
      <ScheduleDialog
        line={scheduling ? line : null}
        events={events}
        period={d.period}
        onClose={() => setScheduling(false)}
      />
    </div>
  );
}

function Headline({
  label,
  cents,
  danger,
  progress,
  note,
}: {
  label: string;
  cents: number;
  danger?: boolean;
  progress?: number;
  note?: string;
}) {
  return (
    <Card className="space-y-1 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Money
        cents={cents}
        size="lg"
        tone={danger ? "danger" : undefined}
        className="items-start!"
      />
      {progress !== undefined && <Progress value={Math.min(progress, 100)} className="h-1.5" />}
      {note && <p className="text-xs text-muted-foreground tabular-nums">{note}</p>}
    </Card>
  );
}

function Minor({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function FinanceCard({
  lineId,
  posted,
  reported,
}: {
  lineId: string;
  posted?: number;
  reported: number;
}) {
  const upd = useUpdateLine();
  const { canEdit } = useYear();
  const [val, setVal] = useState(posted !== undefined ? String(posted / 100) : "");
  const p = posted ?? 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Finance reconciliation</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-4 sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="fin">Finance-posted amount (KES)</Label>
          <div className="relative">
            <Input
              id="fin"
              disabled={!canEdit || upd.isPending}
              aria-busy={upd.isPending}
              className={cn(upd.isPending && "pr-9")}
              type="number"
              step="any"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onBlur={() => {
                const c = val === "" ? undefined : kesToCents(Number(val));
                if (c !== posted)
                  upd.mutate(
                    { id: lineId, patch: { financePostedCents: c } },
                    { onSuccess: () => toast.success("Finance figure saved") },
                  );
              }}
            />
            {upd.isPending && (
              <Loader2
                className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-hidden
              />
            )}
          </div>
          {upd.isPending && (
            <p className="text-xs text-muted-foreground" role="status">
              Saving…
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Reported actual</p>
          <Money cents={reported} className="items-start!" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Difference (finance − reported)</p>
          {posted !== undefined ? (
            <Money cents={p - reported} signed className="items-start!" />
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Finance figure is for reference and is not included in totals.
        </p>
      </CardContent>
    </Card>
  );
}
