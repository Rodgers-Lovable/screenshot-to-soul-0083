import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO, addDays } from "date-fns";
import { FileSpreadsheet, Info, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBudgetData } from "@/data/hooks";
import {
  burnRate,
  cumulativeByMonth,
  eventFlags,
  lineFlags,
  lineSummary,
  sumSummaries,
} from "@/lib/calc";
import { pct, todayISO } from "@/lib/format";
import { Money, useFmt } from "@/components/app/currency";
import { Flags } from "@/components/app/chips";
import { PageHeader, useRecord } from "@/components/app/shell";
import type { EventsSearch } from "./events";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Project Budget Tracker" },
      {
        name: "description",
        content: "Budget vs actual, burn rate and work lists for the project period.",
      },
      { property: "og:title", content: "Dashboard · Project Budget Tracker" },
      {
        property: "og:description",
        content: "Budget vs actual, burn rate and work lists for the project period.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const d = useBudgetData();
  const f = useFmt();
  const { open } = useRecord();
  const today = todayISO();

  const m = useMemo(() => {
    if (!d.period) return null;
    const lineSums = new Map(d.lines.map((l) => [l.id, lineSummary(l, d.events)]));
    const total = sumSummaries([...lineSums.values()]);
    const burn = burnRate(d.period, d.lines, d.events, today);
    const comp = d.components.map((c) => {
      const s = sumSummaries(
        d.lines.filter((l) => l.componentId === c.id).map((l) => lineSums.get(l.id)!),
      );
      return {
        name: `${c.code}. ${c.name}`,
        planned: s.planned / 100,
        actual: s.actualToDate / 100,
      };
    });
    const series = cumulativeByMonth(d.period, d.lines, d.events).map((p) => ({
      month: p.month,
      label: format(parseISO(p.month + "-01"), "MMM yy"),
      planned: p.planned / 100,
      actual: p.actual / 100,
    }));
    const attCount = (id: string) => d.attachments.filter((a) => a.eventId === id).length;
    const in30 = format(addDays(new Date(), 30), "yyyy-MM-dd");
    const upcoming = d.events
      .filter(
        (e) =>
          e.status === "planned" &&
          e.plannedDate &&
          e.plannedDate >= today &&
          e.plannedDate <= in30,
      )
      .sort((a, b) => a.plannedDate!.localeCompare(b.plannedDate!));
    const overdue = d.events
      .filter((e) => eventFlags(e, 0, today).includes("overdue"))
      .sort((a, b) => a.plannedDate!.localeCompare(b.plannedDate!));
    const missing = d.events.filter((e) =>
      eventFlags(e, attCount(e.id), today).includes("missing-evidence"),
    );
    const risky = d.lines
      .filter((l) => lineFlags(lineSums.get(l.id)!).length)
      .map((l) => ({ l, s: lineSums.get(l.id)! }));
    return {
      total,
      burn,
      comp,
      series,
      upcoming,
      overdue,
      missing,
      risky,
      ended: today > d.period.endDate,
      todayMonth: today.slice(0, 7),
    };
  }, [d, today]);

  if (!d.ready) return null;
  if (!d.period || !d.lines.length || !m) {
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <CardHeader>
          <CardTitle>No budget loaded yet</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild>
            <Link to="/settings">
              <FileSpreadsheet className="h-4 w-4" />
              Import budget from Excel
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/budget">
              <Plus className="h-4 w-4" />
              Add lines manually
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  const { total, burn } = m;
  const lineName = (id: string) => d.lines.find((l) => l.id === id)?.description ?? "";
  const todayLabel = m.series.find((s) => s.month === m.todayMonth)?.label;
  const tick = (v: number) =>
    f.cur === "KES" ? `${Math.round(v / 1000)}k` : `$${Math.round(v / f.fx / 1000)}k`;
  const tip = (v: number) => (f.cur === "KES" ? f.kes(v * 100) : f.usd(v * 100));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        sub={`${d.period.startDate} → ${d.period.endDate} · 1 USD = KES ${d.period.fxRate}`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-tour="dash-kpis">
        <Kpi label="Total budget" cents={total.planned} />
        <Kpi label="Actual to date" cents={total.actualToDate} />
        <Kpi label="Remaining" cents={total.remaining} />
        <Kpi
          label="Projected balance"
          cents={total.projectedBalance}
          danger={total.projectedBalance < 0}
          hint="Remaining minus what planned events will still cost"
        />
        {m.ended ? (
          <Kpi
            label="Carryover"
            cents={total.remaining}
            hint="Unspent money carries over to the next period"
          />
        ) : (
          <Kpi
            label="Projected carryover"
            cents={total.remaining - total.stillToSpend}
            hint="Unspent money carries over to the next period"
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card data-tour="dash-burn">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Burn rate</CardTitle>
            <Badge
              variant={burn.status === "On track" ? "secondary" : "outline"}
              className={
                burn.status === "Ahead of plan" ? "border-warning text-warning-foreground" : ""
              }
            >
              {burn.status}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <Bar3 label="Spent" v={burn.spentPct} cls="bg-primary" />
            <Bar3 label="Planned to date" v={burn.plannedToDatePct} cls="bg-chart-3" />
            <Bar3 label="Time elapsed" v={burn.timeElapsedPct} cls="bg-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Spent {pct(burn.spentPct)} vs {pct(burn.plannedToDatePct)} planned by today.
            </p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Planned vs actual by component</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer>
              <BarChart data={m.comp}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                <YAxis tickFormatter={tick} tick={{ fontSize: 11 }} width={50} />
                <RTooltip formatter={(v: number) => tip(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="planned" name="Planned" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="actual" name="Actual" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cumulative spend across the period</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer>
            <LineChart data={m.series}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={tick} tick={{ fontSize: 11 }} width={50} />
              <RTooltip formatter={(v: number) => tip(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {todayLabel && (
                <ReferenceLine
                  x={todayLabel}
                  stroke="var(--warning)"
                  strokeDasharray="4 3"
                  label={{ value: "Today", fontSize: 11, position: "top" }}
                />
              )}
              <Line
                type="monotone"
                dataKey="planned"
                name="Planned (cumulative)"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual (cumulative)"
                stroke="var(--chart-2)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <WorkList
          title="Upcoming in next 30 days"
          count={m.upcoming.length}
          search={{ flag: "upcoming" }}
        >
          {m.upcoming.slice(0, 5).map((e) => (
            <Row key={e.id} onClick={() => open(e.id)} title={e.title} meta={e.plannedDate} />
          ))}
        </WorkList>
        <WorkList title="Overdue" count={m.overdue.length} search={{ flag: "overdue" }}>
          {m.overdue.slice(0, 5).map((e) => (
            <Row key={e.id} onClick={() => open(e.id)} title={e.title} meta={e.plannedDate} />
          ))}
        </WorkList>
        <WorkList
          title="Lines over budget or projected to overrun"
          count={m.risky.length}
          search={{ flag: "over-budget" }}
        >
          {m.risky.slice(0, 5).map(({ l, s }) => (
            <Link
              key={l.id}
              to="/budget/lines/$id"
              params={{ id: l.id }}
              className="flex items-center gap-2 rounded px-2 py-2 hover:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{l.description}</span>
              <Flags flags={lineFlags(s)} />
            </Link>
          ))}
        </WorkList>
        <WorkList
          title="Done events missing evidence"
          count={m.missing.length}
          search={{ flag: "missing-evidence" }}
        >
          {m.missing.slice(0, 5).map((e) => (
            <Row
              key={e.id}
              onClick={() => open(e.id)}
              title={e.title}
              meta={lineName(e.lineId) ? e.actualDate : ""}
            />
          ))}
        </WorkList>
      </div>
    </div>
  );
}

function Kpi({
  label,
  cents,
  danger,
  hint,
}: {
  label: string;
  cents: number;
  danger?: boolean;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {hint && (
          <Tooltip>
            <TooltipTrigger aria-label={hint}>
              <Info className="h-3 w-3" />
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        )}
      </p>
      <Money
        cents={cents}
        size="lg"
        tone={danger ? "danger" : undefined}
        className="mt-2 !items-start"
      />
    </Card>
  );
}

function Bar3({ label, v, cls }: { label: string; v: number; cls: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums">{pct(v)}</span>
      </div>
      <div
        className="h-2 rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(v * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-2 rounded-full ${cls}`}
          style={{ width: `${Math.min(100, v * 100)}%` }}
        />
      </div>
    </div>
  );
}

function WorkList({
  title,
  count,
  search,
  children,
}: {
  title: string;
  count: number;
  search: EventsSearch;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {title}
          <Badge variant="secondary">{count}</Badge>
        </CardTitle>
        <Link to="/events" search={search} className="text-sm text-primary hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-0.5">
        {count ? (
          children
        ) : (
          <p className="px-2 py-2 text-sm text-muted-foreground">Nothing here.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ title, meta, onClick }: { title: string; meta?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-muted"
    >
      <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{meta}</span>
    </button>
  );
}
