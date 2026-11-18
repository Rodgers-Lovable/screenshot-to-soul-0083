import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAudit, useBudgetData, useImportLines, useUpdatePeriod } from "@/data/hooks";
import {
  exportWorkbook,
  parseBudgetRows,
  readWorkbook,
  type ParsedBlock,
  type ParsedRow,
} from "@/lib/excel";
import { formatKES, kesToCents, todayISO } from "@/lib/format";
import { clamp, daysBetween, periodSummary } from "@/lib/calc";
import { Progress } from "@/components/ui/progress";
import { Money } from "@/components/app/currency";
import {
  DURATION_UNITS,
  QUANTITY_UNITS,
  type BudgetPeriod,
  type DurationUnit,
  type QuantityUnit,
} from "@/lib/types";
import { PageHeader } from "@/components/app/shell";
import { TeamPanel } from "@/components/app/team-panel";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Project Budget Tracker" },
      { name: "description", content: "Period, exchange rate, Excel import/export and audit log." },
      { property: "og:title", content: "Settings · Project Budget Tracker" },
      {
        property: "og:description",
        content: "Period, exchange rate, Excel import/export and audit log.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" />
      <Tabs defaultValue="period">
        <TabsList className="flex-wrap">
          <TabsTrigger value="period">Period</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>
        <TabsContent value="period">
          <PeriodForm />
        </TabsContent>
        <TabsContent value="import">
          <ImportPanel />
        </TabsContent>
        <TabsContent value="export">
          <ExportPanel />
        </TabsContent>
        <TabsContent value="audit">
          <AuditLog />
        </TabsContent>
        <TabsContent value="team">
          <TeamPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PeriodForm() {
  const { period, events } = useBudgetData();
  const upd = useUpdatePeriod();
  const blank: BudgetPeriod = {
    id: "p1",
    projectName: "",
    name: "",
    startDate: "",
    endDate: "",
    fxRate: 125,
  };
  const [v, setV] = useState<BudgetPeriod>(period ?? blank);
  const [confirmFx, setConfirmFx] = useState(false);
  useEffect(() => {
    if (period) setV(period);
  }, [period]);
  const anyDone = events.some((e) => e.status === "done");
  const invalid =
    !v.projectName.trim() ||
    !v.name.trim() ||
    !v.startDate ||
    !v.endDate ||
    v.endDate <= v.startDate ||
    !(v.fxRate > 0);

  const doSave = () => upd.mutate(v, { onSuccess: () => toast.success("Period saved") });
  const save = () =>
    anyDone && period && v.fxRate !== period.fxRate ? setConfirmFx(true) : doSave();
  const field = (k: keyof BudgetPeriod, label: string, type = "text") => (
    <div className="space-y-1">
      <Label htmlFor={k}>{label}</Label>
      <Input
        id={k}
        type={type}
        step={type === "number" ? "any" : undefined}
        value={String(v[k])}
        onChange={(e) =>
          setV({ ...v, [k]: type === "number" ? Number(e.target.value) : e.target.value })
        }
      />
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Budget period</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {field("projectName", "Project name")}
            {field("name", "Period name")}
            {field("startDate", "Start date", "date")}
            {field("endDate", "End date", "date")}
          </div>
          <div className="space-y-1">
            {field("fxRate", "Exchange rate (KES per 1 USD)", "number")}
            <p className="text-xs text-muted-foreground">
              Used to convert all KES amounts to USD for display
            </p>
          </div>
          {v.endDate && v.startDate && v.endDate <= v.startDate && (
            <p className="text-sm text-destructive">End date must be after start date.</p>
          )}
          <Button onClick={save} disabled={invalid}>
            Save period
          </Button>
        </CardContent>
      </Card>

      <PeriodGlance />

      <AlertDialog open={confirmFx} onOpenChange={setConfirmFx}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change exchange rate to {v.fxRate}?</AlertDialogTitle>
            <AlertDialogDescription>
              Events have already been recorded. Every USD figure in the app, including past
              actuals, will be recalculated at the new rate. KES amounts don't change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doSave}>Change rate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const NEW = "__new";
function ImportPanel() {
  const { components } = useBudgetData();
  const imp = useImportLines();
  const [blocks, setBlocks] = useState<
    (ParsedBlock & { componentId: string; newName: string; group: string })[]
  >([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");

  async function onFile(file?: File) {
    if (!file) return;
    try {
      const parsed = parseBudgetRows(await readWorkbook(file));
      if (!parsed.rows.length) {
        toast.error(
          "No budget rows found. The sheet needs a header row with a Description column.",
        );
        return;
      }
      setFileName(file.name);
      setRows(parsed.rows);
      setBlocks(
        parsed.blocks.map((b) => ({ ...b, componentId: NEW, newName: b.heading, group: "" })),
      );
    } catch {
      toast.error("Couldn't read that file. Upload an .xlsx workbook.");
    }
  }
  const setRow = (i: number, patch: Partial<ParsedRow>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const calc = (r: ParsedRow) => r.quantity * r.unitCost * r.duration * r.occurrences;

  function confirm() {
    const payload = rows.map((r) => {
      const b = blocks.find((x) => x.index === r.block)!;
      return {
        component:
          b.componentId === NEW
            ? { name: b.newName.trim() || "Imported" }
            : { id: b.componentId, name: "" },
        line: {
          description: r.description,
          groupLabel: b.group.trim() || undefined,
          quantity: r.quantity,
          quantityUnit: r.quantityUnit,
          unitCostCents: kesToCents(r.unitCost),
          duration: r.duration,
          durationUnit: r.durationUnit,
          occurrences: r.occurrences,
        },
      };
    });
    imp.mutate(payload, {
      onSuccess: (n) => {
        toast.success(`Imported ${n} line(s)`);
        setRows([]);
        setBlocks([]);
        setFileName("");
      },
    });
  }
  const numCell = (
    i: number,
    k: "quantity" | "unitCost" | "duration" | "occurrences",
    val: number,
  ) => (
    <Input
      type="number"
      step="any"
      aria-label={k}
      className="h-8 w-24 text-right tabular-nums"
      value={val}
      onChange={(e) => setRow(i, { [k]: Number(e.target.value) })}
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import from Excel</CardTitle>
        <CardDescription>
          Upload an .xlsx budget. Rows without numbers become block headings; you choose which
          component each block goes into.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
          <Upload className="h-4 w-4" />
          {fileName || "Choose .xlsx file"}
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </Label>
        {blocks.map((b) => (
          <div key={b.index} className="rounded-md border">
            <div className="flex flex-wrap items-end gap-3 border-b bg-muted/50 p-3">
              <p className="mr-auto font-medium">{b.heading}</p>
              <div className="space-y-1">
                <Label className="text-xs">Component</Label>
                <Select
                  value={b.componentId}
                  onValueChange={(v) =>
                    setBlocks((all) =>
                      all.map((x) => (x.index === b.index ? { ...x, componentId: v } : x)),
                    )
                  }
                >
                  <SelectTrigger className="h-8 w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW}>New component…</SelectItem>
                    {components.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code}. {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {b.componentId === NEW && (
                <div className="space-y-1">
                  <Label className="text-xs">New component name</Label>
                  <Input
                    className="h-8 w-56"
                    value={b.newName}
                    onChange={(e) =>
                      setBlocks((all) =>
                        all.map((x) =>
                          x.index === b.index ? { ...x, newName: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Group (optional)</Label>
                <Input
                  className="h-8 w-44"
                  value={b.group}
                  onChange={(e) =>
                    setBlocks((all) =>
                      all.map((x) => (x.index === b.index ? { ...x, group: e.target.value } : x)),
                    )
                  }
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Unit cost</th>
                    <th>Duration</th>
                    <th>Dur. unit</th>
                    <th>Occ.</th>
                    <th className="!text-right">Calculated</th>
                    <th className="!text-right">In file</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) =>
                    r.block !== b.index ? null : (
                      <tr key={i} className="border-t [&>td]:px-2 [&>td]:py-1">
                        <td>
                          <Input
                            className="h-8 min-w-56"
                            value={r.description}
                            onChange={(e) => setRow(i, { description: e.target.value })}
                          />
                        </td>
                        <td>{numCell(i, "quantity", r.quantity)}</td>
                        <td>
                          <MiniSelect
                            value={r.quantityUnit}
                            opts={QUANTITY_UNITS}
                            onChange={(v) => setRow(i, { quantityUnit: v as QuantityUnit })}
                          />
                        </td>
                        <td>{numCell(i, "unitCost", r.unitCost)}</td>
                        <td>{numCell(i, "duration", r.duration)}</td>
                        <td>
                          <MiniSelect
                            value={r.durationUnit}
                            opts={DURATION_UNITS}
                            onChange={(v) => setRow(i, { durationUnit: v as DurationUnit })}
                          />
                        </td>
                        <td>{numCell(i, "occurrences", r.occurrences)}</td>
                        <td className="num">{formatKES(kesToCents(calc(r)))}</td>
                        <td className="num">
                          {r.fileAmount === null ? "—" : formatKES(kesToCents(r.fileAmount))}
                          {r.fileAmount !== null && Math.abs(r.fileAmount - calc(r)) > 0.5 && (
                            <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-warning-soft px-1 text-[11px] text-warning-foreground">
                              <AlertTriangle className="h-3 w-3" />
                              differs
                            </span>
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {rows.length > 0 && (
          <Button onClick={confirm} disabled={imp.isPending}>
            Import {rows.length} line(s)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function MiniSelect({
  value,
  opts,
  onChange,
}: {
  value: string;
  opts: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-24">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opts.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ExportPanel() {
  const d = useBudgetData();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Export to Excel</CardTitle>
        <CardDescription>
          One sheet per component, a summary sheet with carryover per line and component, and an
          events sheet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          disabled={!d.period}
          onClick={() =>
            d.period && exportWorkbook(d.period, d.components, d.lines, d.events, d.attachments)
          }
        >
          <Download className="h-4 w-4" />
          Download .xlsx
        </Button>
      </CardContent>
    </Card>
  );
}

function PeriodGlance() {
  const { period, components, lines, events } = useBudgetData();
  const { data: audit = [] } = useAudit();
  const total = useMemo(() => periodSummary(lines, events), [lines, events]);
  const lastChange = useMemo(
    () =>
      audit.reduce<string | null>(
        (max, a) => (!max || a.changedAt > max ? a.changedAt : max),
        null,
      ),
    [audit],
  );
  if (!period?.startDate || !period.endDate) return null;

  const today = todayISO();
  const span = Math.max(daysBetween(period.startDate, period.endDate), 1);
  const elapsed = clamp(daysBetween(period.startDate, today), 0, span);
  const counts: [string, number][] = [
    ["Components", components.length],
    ["Lines", lines.length],
    ["Events", events.length],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Period at a glance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>
              {elapsed} of {span} days elapsed
            </span>
            <span className="text-muted-foreground">{span - elapsed} left</span>
          </div>
          <Progress value={(elapsed / span) * 100} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {counts.map(([label, n]) => (
            <div key={label} className="rounded-md border px-3 py-2">
              <div className="text-xl font-semibold tabular-nums">{n}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
        <div className="flex items-end justify-between border-t pt-4">
          <span className="text-sm text-muted-foreground">Total planned</span>
          <Money cents={total.planned} size="md" />
        </div>
        <p className="text-xs text-muted-foreground">
          {lastChange
            ? `Last change ${new Date(lastChange).toLocaleString()}`
            : "No changes recorded yet"}
        </p>
      </CardContent>
    </Card>
  );
}

function AuditLog() {
  const { data = [] } = useAudit();
  const [entity, setEntity] = useState("__all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const entities = useMemo(() => [...new Set(data.map((a) => a.entity))].sort(), [data]);
  const rows = data.filter(
    (a) =>
      (entity === "__all" || a.entity === entity) &&
      (!from || a.changedAt.slice(0, 10) >= from) &&
      (!to || a.changedAt.slice(0, 10) <= to),
  );
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-end gap-3 space-y-0">
        <CardTitle className="mr-auto text-base">
          Audit log{" "}
          <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
        </CardTitle>
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="h-9 w-40" aria-label="Entity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All entities</SelectItem>
            {entities.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          aria-label="From"
          className="h-9 w-40"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          type="date"
          aria-label="To"
          className="h-9 w-40"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
              <th>When</th>
              <th>Entity</th>
              <th>Field</th>
              <th>Old</th>
              <th>New</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 500).map((a) => (
              <tr key={a.id} className="border-t [&>td]:px-3 [&>td]:py-1.5">
                <td className="whitespace-nowrap tabular-nums">
                  {new Date(a.changedAt).toLocaleString()}
                </td>
                <td>{a.entity}</td>
                <td className="font-mono text-xs">{a.field}</td>
                <td
                  className="max-w-[240px] truncate text-muted-foreground"
                  title={a.oldValue ?? ""}
                >
                  {a.oldValue ?? "—"}
                </td>
                <td className="max-w-[240px] truncate" title={a.newValue ?? ""}>
                  {a.newValue ?? "—"}
                </td>
                <td>{a.changedBy}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No changes recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
