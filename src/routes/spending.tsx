import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  ArrowUpDown,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useBudgetData } from "@/data/hooks";
import {
  eventFigures,
  eventFlags,
  inEventTab,
  lineFlags,
  lineProgress,
  lineSummary,
  periodMonths,
  UPCOMING_DAYS,
  type EventTab,
  type FlagKind,
} from "@/lib/calc";
import { todayISO } from "@/lib/format";
import type { BudgetEvent, BudgetLine, EventStatus } from "@/lib/types";
import { Money } from "@/components/app/currency";
import { Flags, StatusChip } from "@/components/app/chips";
import { PageHeader, useRecord } from "@/components/app/shell";
import { useYear } from "@/components/app/active-year-context";
import { ScheduleDialog } from "@/components/app/schedule-dialog";
import { cn } from "@/lib/utils";
import { Truncated } from "@/components/app/truncated";

export type EventFlagFilter =
  "upcoming" | "overdue" | "no-date" | "missing-evidence" | "over-budget";
export interface SpendingSearch {
  tab?: EventTab;
  component?: string;
  line?: string;
  month?: string;
  flag?: EventFlagFilter;
  q?: string;
  view?: "flat" | "calendar";
}
const FLAGS: { v: EventFlagFilter; l: string }[] = [
  { v: "upcoming", l: "Upcoming (30 days)" },
  { v: "overdue", l: "Overdue" },
  { v: "no-date", l: "No date" },
  { v: "missing-evidence", l: "Missing evidence" },
  { v: "over-budget", l: "Line over budget / overrun" },
];
const TABS: { v: EventTab; l: string }[] = [
  { v: "action", l: "Needs action" },
  { v: "month", l: "This month" },
  { v: "upcoming", l: "Upcoming" },
  { v: "done", l: "Done" },
  { v: "all", l: "All" },
];
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/spending")({
  validateSearch: (s: Record<string, unknown>): SpendingSearch => ({
    tab: TABS.some((t) => t.v === s.tab) ? (s.tab as EventTab) : undefined,
    component: str(s.component),
    line: str(s.line),
    month: str(s.month),
    q: str(s.q),
    flag: FLAGS.some((f) => f.v === s.flag) ? (s.flag as EventFlagFilter) : undefined,
    view: s.view === "calendar" || s.view === "flat" ? s.view : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Spending · Project Budget Tracker" },
      {
        name: "description",
        content: "Every planned, done and cancelled spending record, as a list or calendar.",
      },
      { property: "og:title", content: "Spending · Project Budget Tracker" },
      {
        property: "og:description",
        content: "Every planned, done and cancelled spending record, as a list or calendar.",
      },
    ],
  }),
  component: SpendingPage,
});

type SortKey = "date" | "title" | "status" | "actual";
type Row = {
  e: BudgetEvent;
  line: BudgetLine;
  flags: FlagKind[];
  n: number;
  fig: ReturnType<typeof eventFigures>;
};
const ALL = "__all";
const HINT_KEY = "pbt-events-hint-dismissed";
const niceDate = (d?: string) => (d ? format(parseISO(d), "d MMM yyyy") : undefined);

function SpendingPage() {
  const search = Route.useSearch();
  const nav = useNavigate({ from: "/spending" });
  const d = useBudgetData();
  const { open } = useRecord();
  const { canEdit } = useYear();
  const today = todayISO();
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "date", dir: 1 });
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [scheduling, setScheduling] = useState<BudgetLine | null>(null);

  const hasFilter = !!(search.component || search.line || search.month || search.flag || search.q);
  // Dashboard links pass only a flag, so filtered visits open on "All".
  const tab: EventTab = search.tab ?? (hasFilter ? "all" : "action");
  const view = search.view ?? "grouped";
  const set = (patch: Partial<SpendingSearch>) =>
    nav({ search: (p) => ({ ...p, tab: p.tab ?? tab, ...patch }), replace: true });

  // Everything that passes the filter bar; tabs narrow it further.
  const filtered = useMemo<Row[]>(() => {
    const lineById = new Map(d.lines.map((l) => [l.id, l]));
    const risky = new Set(
      d.lines.filter((l) => lineFlags(lineSummary(l, d.events)).length).map((l) => l.id),
    );
    const evidence = new Map<string, number>();
    for (const a of d.attachments) evidence.set(a.eventId, (evidence.get(a.eventId) ?? 0) + 1);
    const q = search.q?.toLowerCase();
    return d.events.flatMap((e) => {
      const line = lineById.get(e.lineId);
      if (!line) return [];
      const n = evidence.get(e.id) ?? 0;
      const flags = eventFlags(e, n, today);
      if (search.component && line.componentId !== search.component) return [];
      if (search.line && line.id !== search.line) return [];
      if (
        search.month &&
        !(e.actualDate ?? e.plannedDate ?? "").startsWith(search.month) &&
        !(e.plannedDate ?? "").startsWith(search.month)
      )
        return [];
      if (q && !e.title.toLowerCase().includes(q)) return [];
      if (search.flag === "upcoming" && !inEventTab(e, flags, "upcoming", today)) return [];
      if (search.flag === "over-budget" && !risky.has(line.id)) return [];
      if (
        search.flag &&
        search.flag !== "upcoming" &&
        search.flag !== "over-budget" &&
        !flags.includes(search.flag)
      )
        return [];
      return [{ e, line, flags, n, fig: eventFigures(line, e) }];
    });
  }, [d, search, today]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        TABS.map((t) => [t.v, filtered.filter((r) => inEventTab(r.e, r.flags, t.v, today)).length]),
      ) as Record<EventTab, number>,
    [filtered, today],
  );

  const rows = useMemo(() => {
    const dateOf = (r: Row) =>
      (tab === "done" ? (r.e.actualDate ?? r.e.plannedDate) : r.e.plannedDate) ?? "9";
    // Done tab reads newest first.
    const dir = tab === "done" && sort.k === "date" ? -sort.dir : sort.dir;
    return filtered
      .filter((r) => inEventTab(r.e, r.flags, tab, today))
      .sort((a, b) => {
        const v =
          sort.k === "date"
            ? dateOf(a).localeCompare(dateOf(b))
            : sort.k === "title"
              ? a.e.title.localeCompare(b.e.title)
              : sort.k === "status"
                ? a.e.status.localeCompare(b.e.status)
                : a.fig.actual - b.fig.actual;
        return v * dir;
      });
  }, [filtered, tab, sort, today]);

  const groups = useMemo(() => {
    const compOrder = new Map(d.components.map((c) => [c.id, c]));
    const byLine = new Map<string, Row[]>();
    for (const r of rows) byLine.set(r.line.id, [...(byLine.get(r.line.id) ?? []), r]);
    return d.lines
      .filter((l) => byLine.has(l.id))
      .sort(
        (a, b) =>
          (compOrder.get(a.componentId)?.sortOrder ?? 0) -
            (compOrder.get(b.componentId)?.sortOrder ?? 0) || a.sortOrder - b.sortOrder,
      )
      .map((line) => {
        const lineEvents = d.events.filter((e) => e.lineId === line.id);
        const matched = byLine.get(line.id)!.sort((a, b) => a.e.sequence - b.e.sequence);
        return {
          line,
          comp: compOrder.get(line.componentId),
          rows: matched,
          lineEvents,
          progress: lineProgress(lineEvents, today),
          flags: [...new Set(matched.flatMap((r) => r.flags))],
          actual: lineSummary(line, d.events).actualToDate,
        };
      });
  }, [rows, d, today]);

  const nextUp = useMemo(
    () =>
      d.events
        .filter((e) => e.status === "planned" && e.plannedDate && e.plannedDate >= today)
        .sort((a, b) => a.plannedDate!.localeCompare(b.plannedDate!))[0],
    [d.events, today],
  );

  if (!d.ready) return null;
  const months = d.period ? periodMonths(d.period) : [];
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const th = (k: SortKey, label: string, right?: boolean) => (
    <th
      className={cn("px-3 py-2 font-medium", right ? "text-right" : "text-left")}
      aria-sort={sort.k === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        className="inline-flex items-center gap-1"
        onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );
  const sub =
    view === "calendar"
      ? `${filtered.length} event(s)`
      : view === "grouped"
        ? `${groups.length} line(s) · ${rows.length} event(s)`
        : `${rows.length} event(s)`;

  return (
    <div>
      <PageHeader title="Spending" sub={sub}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          onValueChange={(v) =>
            v && set({ view: v === "grouped" ? undefined : (v as "flat" | "calendar") })
          }
          aria-label="View"
          data-tour="spending-view"
        >
          <ToggleGroupItem value="grouped">By line</ToggleGroupItem>
          <ToggleGroupItem value="flat">All rows</ToggleGroupItem>
          <ToggleGroupItem value="calendar">Calendar</ToggleGroupItem>
        </ToggleGroup>
      </PageHeader>

      <WorkflowHint />

      {view !== "calendar" && (
        <Tabs value={tab} onValueChange={(v) => set({ tab: v as EventTab })} className="mb-3">
          <TabsList className="h-auto flex-wrap" data-tour="spending-tabs">
            {TABS.map((t) => (
              <TabsTrigger key={t.v} value={t.v} className="gap-1.5">
                {t.l}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    t.v === "action" && counts.action
                      ? "bg-warning-soft text-warning-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {counts[t.v]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2" data-tour="spending-filters">
        <FilterSelect
          label="Component"
          value={search.component}
          onChange={(v) => set({ component: v, line: undefined })}
          opts={d.components.map((c) => ({ v: c.id, l: `${c.code}. ${c.name}` }))}
          all={ALL}
        />
        <FilterSelect
          label="Line"
          value={search.line}
          onChange={(v) => set({ line: v })}
          opts={d.lines
            .filter((l) => !search.component || l.componentId === search.component)
            .map((l) => ({ v: l.id, l: l.description }))}
          all={ALL}
        />
        <FilterSelect
          label="Month"
          value={search.month}
          onChange={(v) => set({ month: v })}
          opts={months.map((m) => ({ v: m, l: format(parseISO(m + "-01"), "MMM yyyy") }))}
          all={ALL}
        />
        <FilterSelect
          label="Flag"
          value={search.flag}
          onChange={(v) => set({ flag: v as EventFlagFilter | undefined })}
          opts={FLAGS}
          all={ALL}
        />
        <Input
          aria-label="Search spending"
          placeholder="Search"
          className="h-9 w-48"
          defaultValue={search.q}
          onChange={(e) => set({ q: e.target.value || undefined })}
        />
        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => nav({ search: { view: search.view, tab: search.tab } })}
          >
            Clear filters
          </Button>
        )}
      </div>

      {view === "calendar" ? (
        <Calendar
          month={calMonth}
          setMonth={setCalMonth}
          rows={filtered}
          today={today}
          onOpen={open}
        />
      ) : !rows.length ? (
        <EmptyState tab={tab} filtered={hasFilter} next={nextUp} />
      ) : view === "grouped" ? (
        <div className="max-h-[calc(100dvh-18rem)] overflow-auto rounded-lg border bg-card">
          <table className="w-full min-w-225 text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                <th>Line</th>
                <th className="w-44">Progress</th>
                <th className="w-32">Next date</th>
                <th>In this view</th>
                <th className="text-right!">Actual to date</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const multi = g.lineEvents.length > 1;
                const isOpen = multi && expanded.has(g.line.id);
                const single = g.rows[0]!;
                const activate = () => (multi ? toggle(g.line.id) : open(single.e.id));
                const pct = g.progress.total
                  ? ((g.progress.done + g.progress.cancelled) / g.progress.total) * 100
                  : 0;
                return [
                  <tr
                    key={g.line.id}
                    tabIndex={0}
                    aria-expanded={multi ? isOpen : undefined}
                    onClick={activate}
                    onKeyDown={(k) => k.key === "Enter" && activate()}
                    className="h-12 cursor-pointer border-t hover:bg-muted/40 [&>td]:px-3 [&>td]:py-1.5"
                  >
                    <td className="max-w-90">
                      <div className="flex items-center gap-2">
                        {multi ? (
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                              isOpen && "rotate-90",
                            )}
                            aria-hidden
                          />
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <Truncated text={g.line.description} className="font-medium" />
                          <Truncated
                            text={`${g.comp?.code}. ${g.comp?.name}${g.line.groupLabel ? ` · ${g.line.groupLabel}` : ""}`}
                            className="text-xs text-muted-foreground"
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      {multi ? (
                        <div className="space-y-1">
                          <div className="text-xs tabular-nums">
                            {g.progress.done} of {g.progress.total} done
                            {g.progress.cancelled ? ` · ${g.progress.cancelled} cancelled` : ""}
                          </div>
                          <Progress value={pct} className="h-1.5" />
                        </div>
                      ) : (
                        <StatusChip status={single.e.status} />
                      )}
                    </td>
                    <td className="tabular-nums">
                      {niceDate(multi ? g.progress.next : single.e.plannedDate) ?? (
                        <span className="text-muted-foreground">
                          {g.progress.undated ? "No date" : "—"}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {multi && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {g.rows.length} event{g.rows.length === 1 ? "" : "s"}
                          </span>
                        )}
                        <Flags flags={g.flags} />
                      </div>
                    </td>
                    <td className="text-right">
                      {g.actual ? (
                        <Money cents={g.actual} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      {g.lineEvents.some((e) => e.status === "planned") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          disabled={!canEdit}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setScheduling(g.line);
                          }}
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                          Schedule
                        </Button>
                      )}
                    </td>
                  </tr>,
                  ...(isOpen
                    ? g.rows.map(({ e, flags, fig }) => (
                        <tr
                          key={e.id}
                          tabIndex={0}
                          onClick={() => open(e.id)}
                          onKeyDown={(k) => k.key === "Enter" && open(e.id)}
                          className="h-9 cursor-pointer bg-muted/20 hover:bg-muted/50 [&>td]:px-3 [&>td]:py-1"
                        >
                          <td className="pl-12! text-muted-foreground tabular-nums">
                            Occurrence {e.sequence} of {g.lineEvents.length}
                          </td>
                          <td>
                            <StatusChip status={e.status} />
                          </td>
                          <td className="tabular-nums">
                            {niceDate(
                              e.status === "done" ? (e.actualDate ?? e.plannedDate) : e.plannedDate,
                            ) ?? <span className="text-muted-foreground">No date</span>}
                          </td>
                          <td>
                            <Flags flags={flags} />
                          </td>
                          <td className="text-right">
                            {e.status === "done" ? (
                              <Money cents={fig.actual} />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td />
                        </tr>
                      ))
                    : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="max-h-[calc(100dvh-18rem)] overflow-auto rounded-lg border bg-card">
          <table className="w-full min-w-225 text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
              <tr>
                {th("date", tab === "done" ? "Date" : "Planned date")}
                {th("title", "Event")}
                <th className="px-3 py-2 text-left font-medium">Line</th>
                {th("status", "Status")}
                <th className="px-3 py-2 text-left font-medium">Flags</th>
                {th("actual", "Actual", true)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, line, flags, fig }) => (
                <tr
                  key={e.id}
                  tabIndex={0}
                  onClick={() => open(e.id)}
                  onKeyDown={(k) => k.key === "Enter" && open(e.id)}
                  className="h-10 cursor-pointer border-t hover:bg-muted/40 [&>td]:px-3 [&>td]:py-1"
                >
                  <td className="tabular-nums">
                    {(tab === "done" ? (e.actualDate ?? e.plannedDate) : e.plannedDate) ?? "—"}
                  </td>
                  <td className="max-w-80">
                    <Truncated text={e.title} />
                  </td>
                  <td className="max-w-55 text-muted-foreground">
                    <Truncated text={line.description} />
                  </td>
                  <td>
                    <StatusChip status={e.status} />
                  </td>
                  <td>
                    <Flags flags={flags} />
                  </td>
                  <td className="text-right">
                    {e.status === "done" ? (
                      <Money cents={fig.actual} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ScheduleDialog
        line={scheduling}
        events={scheduling ? d.events.filter((e) => e.lineId === scheduling.id) : []}
        period={d.period}
        onClose={() => setScheduling(null)}
      />
    </div>
  );
}

function WorkflowHint() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* hint just shows again next visit */
    }
  };
  const steps = [
    { I: CalendarClock, t: "Plan a date", s: "Use Schedule to date a whole line at once" },
    { I: CheckCircle2, t: "Mark done", s: "Open the event and record what was spent" },
    { I: Paperclip, t: "Attach evidence", s: "Receipts, invoices or attendance sheets" },
  ];
  return (
    <div className="relative mb-4 rounded-lg border bg-card px-4 py-3">
      <button
        onClick={dismiss}
        aria-label="Hide these steps"
        className="absolute top-2 right-2 rounded p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
      <ol className="grid gap-3 pr-6 sm:grid-cols-3">
        {steps.map(({ I, t, s }, i) => (
          <li key={t} className="flex gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <I className="h-4 w-4" aria-hidden />
            </span>
            <div className="text-sm leading-tight">
              <div className="font-medium">
                {i + 1}. {t}
              </div>
              <div className="text-xs text-muted-foreground">{s}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EmptyState({
  tab,
  filtered,
  next,
}: {
  tab: EventTab;
  filtered: boolean;
  next?: BudgetEvent;
}) {
  const msg = filtered
    ? "No events match these filters."
    : tab === "action"
      ? "Nothing needs action."
      : tab === "upcoming"
        ? `Nothing planned in the next ${UPCOMING_DAYS} days.`
        : tab === "done"
          ? "No events marked done yet."
          : "No events in this view.";
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-card px-4 py-10 text-center">
      {tab === "action" && !filtered && <CheckCircle2 className="mb-1 h-6 w-6 text-primary" />}
      <p className="font-medium">{msg}</p>
      {next && !filtered && (
        <p className="text-sm text-muted-foreground">
          Next up: {next.title} on {niceDate(next.plannedDate)}.
        </p>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  opts,
  all,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  opts: { v: string; l: string }[];
  all: string;
}) {
  return (
    <Select value={value ?? all} onValueChange={(v) => onChange(v === all ? undefined : v)}>
      <SelectTrigger className="h-9 w-auto max-w-55" aria-label={label}>
        <Truncated text={opts.find((o) => o.v === value)?.l ?? `All ${label.toLowerCase()}s`}>
          <SelectValue />
        </Truncated>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={all}>All {label.toLowerCase()}s</SelectItem>
        {opts.map((o) => (
          <SelectItem key={o.v} value={o.v}>
            {o.l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type Rows = { e: BudgetEvent; flags: string[] }[];
function Calendar({
  month,
  setMonth,
  rows,
  today,
  onOpen,
}: {
  month: Date;
  setMonth: (d: Date) => void;
  rows: Rows;
  today: string;
  onOpen: (id: string) => void;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(month, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
  const byDay = new Map<string, Rows>();
  for (const r of rows) {
    const k = r.e.status === "done" ? (r.e.actualDate ?? r.e.plannedDate) : r.e.plannedDate;
    if (!k) continue;
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }
  const chip: Record<EventStatus, string> = {
    planned: "bg-card border-border",
    done: "bg-accent text-accent-foreground border-primary/30",
    cancelled: "bg-muted text-muted-foreground line-through border-border",
  };
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Previous month"
          onClick={() => setMonth(addMonths(month, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium">{format(month, "MMMM yyyy")}</span>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Next month"
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
          <div key={w} className="border-b px-2 py-1 text-muted-foreground">
            {w}
          </div>
        ))}
        {days.map((day) => {
          const k = format(day, "yyyy-MM-dd");
          const list = byDay.get(k) ?? [];
          return (
            <div
              key={k}
              className={cn(
                "min-h-24 border-b border-r p-1",
                day.getMonth() !== month.getMonth() && "bg-muted/40",
                k === today && "bg-accent/40",
              )}
            >
              <div className="mb-1 text-right tabular-nums text-muted-foreground">
                {day.getDate()}
              </div>
              <div className="space-y-1">
                {list.map(({ e, flags }) => (
                  <button
                    key={e.id}
                    onClick={() => onOpen(e.id)}
                    className={cn(
                      "block w-full rounded border px-1 py-0.5 text-left text-[11px]",
                      chip[e.status],
                      flags.includes("overdue") && "border-2 border-destructive",
                    )}
                  >
                    <Truncated text={e.title}>
                      {flags.includes("overdue") && <span className="sr-only">Overdue: </span>}
                      {e.title}
                    </Truncated>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
