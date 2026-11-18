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
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
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
import { useBudgetData } from "@/data/hooks";
import { eventFigures, eventFlags, lineFlags, lineSummary, periodMonths } from "@/lib/calc";
import { todayISO } from "@/lib/format";
import type { EventStatus } from "@/lib/types";
import { Money } from "@/components/app/currency";
import { Flags, StatusChip } from "@/components/app/chips";
import { PageHeader, useRecord } from "@/components/app/shell";
import { cn } from "@/lib/utils";

export type EventFlagFilter =
  "upcoming" | "overdue" | "no-date" | "missing-evidence" | "over-budget";
export interface EventsSearch {
  status?: string;
  component?: string;
  line?: string;
  month?: string;
  flag?: EventFlagFilter;
  q?: string;
  view?: "list" | "calendar";
}
const FLAGS: { v: EventFlagFilter; l: string }[] = [
  { v: "upcoming", l: "Upcoming (30 days)" },
  { v: "overdue", l: "Overdue" },
  { v: "no-date", l: "No date" },
  { v: "missing-evidence", l: "Missing evidence" },
  { v: "over-budget", l: "Line over budget / overrun" },
];
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/events")({
  validateSearch: (s: Record<string, unknown>): EventsSearch => ({
    status: str(s.status),
    component: str(s.component),
    line: str(s.line),
    month: str(s.month),
    q: str(s.q),
    flag: FLAGS.some((f) => f.v === s.flag) ? (s.flag as EventFlagFilter) : undefined,
    view: s.view === "calendar" ? "calendar" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Events · Project Budget Tracker" },
      {
        name: "description",
        content: "Every planned, done and cancelled activity event, as a list or calendar.",
      },
      { property: "og:title", content: "Events · Project Budget Tracker" },
      {
        property: "og:description",
        content: "Every planned, done and cancelled activity event, as a list or calendar.",
      },
    ],
  }),
  component: EventsPage,
});

type SortKey = "date" | "title" | "status" | "actual";

function EventsPage() {
  const search = Route.useSearch();
  const nav = useNavigate({ from: "/events" });
  const set = (patch: Partial<EventsSearch>) =>
    nav({ search: (p) => ({ ...p, ...patch }), replace: true });
  const d = useBudgetData();
  const { open } = useRecord();
  const today = todayISO();
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "date", dir: 1 });
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));
  const statuses = (search.status?.split(",") ?? []) as EventStatus[];

  const rows = useMemo(() => {
    const lineById = new Map(d.lines.map((l) => [l.id, l]));
    const risky = new Set(
      d.lines.filter((l) => lineFlags(lineSummary(l, d.events)).length).map((l) => l.id),
    );
    const in30 = format(addDays(new Date(), 30), "yyyy-MM-dd");
    return d.events
      .flatMap((e) => {
        const line = lineById.get(e.lineId);
        if (!line) return [];
        const n = d.attachments.filter((a) => a.eventId === e.id).length;
        const flags = eventFlags(e, n, today);
        if (statuses.length && !statuses.includes(e.status)) return [];
        if (search.component && line.componentId !== search.component) return [];
        if (search.line && line.id !== search.line) return [];
        if (
          search.month &&
          !(e.actualDate ?? e.plannedDate ?? "").startsWith(search.month) &&
          !(e.plannedDate ?? "").startsWith(search.month)
        )
          return [];
        if (search.q && !e.title.toLowerCase().includes(search.q.toLowerCase())) return [];
        if (
          search.flag === "upcoming" &&
          !(
            e.status === "planned" &&
            e.plannedDate &&
            e.plannedDate >= today &&
            e.plannedDate <= in30
          )
        )
          return [];
        if (search.flag === "over-budget" && !risky.has(line.id)) return [];
        if (
          search.flag &&
          search.flag !== "upcoming" &&
          search.flag !== "over-budget" &&
          !flags.includes(search.flag)
        )
          return [];
        return [{ e, line, flags, n, fig: eventFigures(line, e) }];
      })
      .sort((a, b) => {
        const k = sort.k;
        const v =
          k === "date"
            ? (a.e.plannedDate ?? "9").localeCompare(b.e.plannedDate ?? "9")
            : k === "title"
              ? a.e.title.localeCompare(b.e.title)
              : k === "status"
                ? a.e.status.localeCompare(b.e.status)
                : a.fig.actual - b.fig.actual;
        return v * sort.dir;
      });
  }, [d, search, sort, today, statuses]);

  if (!d.ready) return null;
  const months = d.period ? periodMonths(d.period) : [];
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
  const ALL = "__all";

  return (
    <div>
      <PageHeader title="Events" sub={`${rows.length} event(s)`}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={search.view ?? "list"}
          onValueChange={(v) => v && set({ view: v === "calendar" ? "calendar" : undefined })}
        >
          <ToggleGroupItem value="list">List</ToggleGroupItem>
          <ToggleGroupItem value="calendar">Calendar</ToggleGroupItem>
        </ToggleGroup>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          value={statuses}
          onValueChange={(v) => set({ status: v.length ? v.join(",") : undefined })}
          aria-label="Status"
        >
          <ToggleGroupItem value="planned">Planned</ToggleGroupItem>
          <ToggleGroupItem value="done">Done</ToggleGroupItem>
          <ToggleGroupItem value="cancelled">Cancelled</ToggleGroupItem>
        </ToggleGroup>
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
          aria-label="Search events"
          placeholder="Search"
          className="h-9 w-48"
          defaultValue={search.q}
          onChange={(e) => set({ q: e.target.value || undefined })}
        />
        {Object.values(search).some((v) => v && v !== "calendar") && (
          <Button variant="ghost" size="sm" onClick={() => nav({ search: { view: search.view } })}>
            Clear
          </Button>
        )}
      </div>

      {search.view === "calendar" ? (
        <Calendar month={calMonth} setMonth={setCalMonth} rows={rows} today={today} onOpen={open} />
      ) : (
        <div className="max-h-[calc(100dvh-14rem)] overflow-auto rounded-lg border bg-card">
          <table className="w-full min-w-225 text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
              <tr>
                {th("date", "Planned date")}
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
                  <td className="tabular-nums">{e.plannedDate ?? "—"}</td>
                  <td className="max-w-[320px] truncate">{e.title}</td>
                  <td className="max-w-55 truncate text-muted-foreground">{line.description}</td>
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
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    No events match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
        <span className="truncate">
          <SelectValue />
        </span>
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

type Rows = {
  e: { id: string; title: string; plannedDate?: string; actualDate?: string; status: EventStatus };
  flags: string[];
}[];
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
                    title={e.title}
                    className={cn(
                      "block w-full truncate rounded border px-1 py-0.5 text-left text-[11px]",
                      chip[e.status],
                      flags.includes("overdue") && "border-2 border-destructive",
                    )}
                  >
                    {flags.includes("overdue") && <span className="sr-only">Overdue: </span>}
                    {e.title}
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
