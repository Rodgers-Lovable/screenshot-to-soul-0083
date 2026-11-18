import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { addMonths, addWeeks, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, CalendarRange, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBudgetData, useUpdateEvent, useUpdateLine } from "@/data/hooks";
import { actualInputs, eventFigures, eventFlags, lineFlags, lineSummary } from "@/lib/calc";
import { kesToCents, todayISO } from "@/lib/format";
import type { BudgetEvent } from "@/lib/types";
import { Money, useFmt } from "@/components/app/currency";
import { Flags, StatusChip } from "@/components/app/chips";
import { LineEditor, formulaSentence } from "@/components/app/line-editor";
import { useRecord } from "@/components/app/shell";

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
  const { open } = useRecord();
  const [edit, setEdit] = useState(false);
  const [bulk, setBulk] = useState(false);
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
  const comp = d.components.find((c) => c.id === line.componentId);
  const today = todayISO();

  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/budget"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Budget
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {comp ? `${comp.code}. ${comp.name}` : ""}
              {line.groupLabel ? ` · ${line.groupLabel}` : ""}
            </p>
            <h1 className="text-xl font-semibold">{line.description}</h1>
            <p className="mt-1 text-sm tabular-nums">{formulaSentence(line, f.fx)}</p>
            {line.justification && (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{line.justification}</p>
            )}
            <div className="mt-2">
              <Flags flags={lineFlags(s)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBulk(true)}>
              <CalendarRange className="h-4 w-4" />
              Bulk set dates
            </Button>
            <Button variant="outline" onClick={() => setEdit(true)}>
              <Pencil className="h-4 w-4" />
              Edit line
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Fig label="Planned" cents={s.planned} />
        <Fig label="Actual to date" cents={s.actualToDate} danger={s.actualToDate > s.planned} />
        <Fig label="Remaining" cents={s.remaining} />
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Variance on completed</p>
          <Money
            cents={s.varianceOnCompleted}
            signed
            size="md"
            tone="auto"
            className="!items-start"
          />
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            Volume {f.primary(s.volumeVariance)} · Rate {f.primary(s.rateVariance)}
          </p>
        </Card>
        <Fig label="Still to spend" cents={s.stillToSpend} />
        <Fig label="Projected balance" cents={s.projectedBalance} danger={s.projectedBalance < 0} />
        <Fig label="Released by cancellation" cents={s.releasedByCancellation} />
      </div>

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
                      <div className="max-w-65 truncate">{e.title}</div>
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
                    <td className="text-right">
                      {done && <Money cents={fig.variance} signed tone="auto" />}
                    </td>
                    <td className="num">{n}</td>
                    <td>
                      <Button size="sm" variant="outline" onClick={() => open(e.id)}>
                        Record
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
      <BulkDates open={bulk} onOpenChange={setBulk} events={events} />
    </div>
  );
}

function Fig({ label, cents, danger }: { label: string; cents: number; danger?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Money
        cents={cents}
        size="md"
        tone={danger ? "danger" : undefined}
        className="!items-start"
      />
    </Card>
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
          <Input
            id="fin"
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
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Reported actual</p>
          <Money cents={reported} className="!items-start" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Difference (finance − reported)</p>
          {posted !== undefined ? (
            <Money cents={p - reported} signed className="!items-start" />
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

type Pattern = "monthly" | "quarterly" | "weeks" | "pick";
function BulkDates({
  open,
  onOpenChange,
  events,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  events: BudgetEvent[];
}) {
  const upd = useUpdateEvent();
  const [pattern, setPattern] = useState<Pattern>("monthly");
  const [start, setStart] = useState(todayISO());
  const [n, setN] = useState(2);
  const [picked, setPicked] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setPattern("monthly");
      setStart(todayISO());
      setN(2);
      setPicked({});
    }
  }, [open]);
  const targets = events.filter((e) => e.status === "planned");
  const dates = targets.map((e, i) => {
    if (pattern === "pick") return picked[e.id] ?? e.plannedDate ?? "";
    const base = parseISO(start);
    const dt =
      pattern === "monthly"
        ? addMonths(base, i)
        : pattern === "quarterly"
          ? addMonths(base, i * 3)
          : addWeeks(base, i * n);
    return format(dt, "yyyy-MM-dd");
  });
  async function apply() {
    for (let i = 0; i < targets.length; i++)
      if (dates[i] !== (targets[i].plannedDate ?? ""))
        await upd.mutateAsync({ id: targets[i].id, patch: { plannedDate: dates[i] || undefined } });
    toast.success("Dates updated");
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk set dates</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Applies to the {targets.length} planned event(s); done and cancelled events keep their
          dates.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Pattern</Label>
            <Select value={pattern} onValueChange={(v) => setPattern(v as Pattern)}>
              <SelectTrigger aria-label="Pattern">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly from a start date</SelectItem>
                <SelectItem value="quarterly">Quarterly from a start date</SelectItem>
                <SelectItem value="weeks">Every N weeks</SelectItem>
                <SelectItem value="pick">Pick dates individually</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {pattern !== "pick" && (
            <div className="space-y-1">
              <Label htmlFor="bstart">Start date</Label>
              <Input
                id="bstart"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
          )}
          {pattern === "weeks" && (
            <div className="space-y-1">
              <Label htmlFor="bn">Every N weeks</Label>
              <Input
                id="bn"
                type="number"
                min={1}
                value={n}
                onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          )}
        </div>
        <ul className="space-y-1">
          {targets.map((e, i) => (
            <li key={e.id} className="flex items-center gap-2 text-sm">
              <span className="w-6 text-right tabular-nums text-muted-foreground">
                {e.sequence}
              </span>
              {pattern === "pick" ? (
                <Input
                  type="date"
                  aria-label={`Date for occurrence ${e.sequence}`}
                  value={dates[i]}
                  onChange={(ev) => setPicked((p) => ({ ...p, [e.id]: ev.target.value }))}
                  className="h-8"
                />
              ) : (
                <span className="tabular-nums">{dates[i]}</span>
              )}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={apply} disabled={!targets.length}>
            Apply dates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
