import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Upload,
} from "lucide-react";
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
import {
  useAddSite,
  useArchiveSite,
  useAudit,
  useBudgetData,
  useImportLines,
  useRenameSite,
  useSetYearStatus,
  useUpdatePeriod,
  useWorkplan,
} from "@/data/hooks";
import {
  downloadImportTemplate,
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
import { DURATION_UNITS, QUANTITY_UNITS, type BudgetPeriod } from "@/lib/types";
import { activityOptions, unitSuggestions } from "@/lib/budget-tree";
import { ActivityPicker, UnitInput } from "@/components/app/budget-fields";
import { PageHeader } from "@/components/app/shell";
import { TeamPanel } from "@/components/app/team-panel";
import { useYear } from "@/components/app/active-year-context";
import { CreateYearDialog } from "@/components/app/create-year-dialog";
import { prefillYearDates, validateYear } from "@/lib/workplan";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Project Budget Tracker" },
      {
        name: "description",
        content: "Years, sites, exchange rate, Excel import/export and audit log.",
      },
      { property: "og:title", content: "Settings · Project Budget Tracker" },
      {
        property: "og:description",
        content: "Years, sites, exchange rate, Excel import/export and audit log.",
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
        <TabsList className="h-auto flex-wrap" data-tour="settings-tabs">
          <TabsTrigger value="period">Year</TabsTrigger>
          <TabsTrigger value="years">Years</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="team" data-tour="settings-team">
            Team
          </TabsTrigger>
        </TabsList>
        <TabsContent value="period">
          <PeriodForm />
        </TabsContent>
        <TabsContent value="years">
          <YearsPanel />
        </TabsContent>
        <TabsContent value="sites">
          <SitesPanel />
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
  const { years, isAdmin, closed, year } = useYear();
  const upd = useUpdatePeriod();
  const blank: BudgetPeriod = {
    id: "",
    projectName: "",
    name: "",
    startDate: "",
    endDate: "",
    fxRate: 125,
    currency: "KES",
    status: "open",
  };
  const [v, setV] = useState<BudgetPeriod>(() => prefillYearDates(period ?? blank, todayISO()));
  const [confirmFx, setConfirmFx] = useState(false);
  useEffect(() => {
    if (period) setV(prefillYearDates(period, todayISO()));
  }, [period]);
  const readOnly = !isAdmin || closed || !year;
  const anyDone = events.some((e) => e.status === "done");
  const problem = validateYear(
    { ...v, currency: v.currency.trim().toUpperCase() },
    years,
    year?.id,
  );
  const invalid = !!problem || !v.projectName.trim();

  const doSave = () =>
    upd.mutate(
      { ...v, currency: v.currency.trim().toUpperCase() },
      { onSuccess: () => toast.success("Year saved") },
    );
  const save = () =>
    anyDone && period && v.fxRate !== period.fxRate ? setConfirmFx(true) : doSave();
  const field = (k: keyof BudgetPeriod, label: string, type = "text") => (
    <div className="space-y-1">
      <Label htmlFor={k}>{label}</Label>
      <Input
        id={k}
        type={type}
        step={type === "number" ? "any" : undefined}
        value={String(v[k] ?? "")}
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
          <CardTitle className="text-base">Year details</CardTitle>
          {readOnly && (
            <CardDescription>
              {!year
                ? "There is no year yet. Create one under Years."
                : closed
                  ? "This year is closed. Reopen it under Years to change these details."
                  : "Only study admins can change the dates, exchange rate and currency."}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <fieldset disabled={readOnly} className="min-w-0 space-y-3 border-0 p-0">
            <div className="grid gap-3 sm:grid-cols-2">
              {field("projectName", "Project name")}
              {field("name", "Year name")}
              {field("startDate", "Start date", "date")}
              {field("endDate", "End date", "date")}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                {field("fxRate", "Exchange rate to USD", "number")}
                <p className="text-xs text-muted-foreground">
                  Used to convert amounts to USD for display
                </p>
              </div>
              {field("currency", "Currency code")}
            </div>
            {period && (!period.startDate || !period.endDate) && (
              <p className="text-xs text-muted-foreground">
                The dates shown are the suggested financial year, 30 September to 29 September. They
                are not saved until you save the year.
              </p>
            )}
            {!readOnly && problem && v.name && v.startDate && v.endDate && (
              <p className="text-sm text-destructive">{problem}</p>
            )}
            <Button onClick={save} loading={upd.isPending} disabled={invalid}>
              Save year
            </Button>
          </fieldset>
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

function YearsPanel() {
  const { years, isAdmin, year, select } = useYear();
  const setStatus = useSetYearStatus();
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<{ id: string; name: string; to: "open" | "closed" } | null>(
    null,
  );
  const sorted = [...years].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const nameOf = (id?: string) => years.find((y) => y.id === id)?.name;
  const confirm = () => {
    if (!target) return;
    const t = target;
    setStatus.mutate(
      { id: t.id, status: t.to },
      {
        onSuccess: () =>
          toast.success(t.to === "closed" ? `${t.name} closed` : `${t.name} reopened`),
      },
    );
    setTarget(null);
  };
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Years</CardTitle>
          <CardDescription>
            Each year has its own workplan and budget. A closed year is read-only until an admin
            reopens it.
            {!isAdmin && " Only study admins can create, close or reopen a year."}
          </CardDescription>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            {years.length ? "Start a new year" : "Create the first year"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!sorted.length && <p className="text-sm text-muted-foreground">No years yet.</p>}
        <ul className="divide-y rounded-md border text-sm">
          {sorted.map((y) => (
            <li key={y.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <div className="mr-auto min-w-0">
                <p className="font-medium">
                  {y.name}
                  {y.id === year?.id && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">Viewing</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {y.startDate} to {y.endDate} · {y.currency}
                  {y.copiedFromId &&
                    nameOf(y.copiedFromId) &&
                    ` · Copied from ${nameOf(y.copiedFromId)}`}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs">
                {y.status === "closed" ? (
                  <>
                    <Lock className="h-3 w-3" aria-hidden />
                    Closed
                  </>
                ) : (
                  "Open"
                )}
              </span>
              {y.id !== year?.id && (
                <Button size="sm" variant="ghost" onClick={() => select(y.id)}>
                  View
                </Button>
              )}
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setTarget({
                      id: y.id,
                      name: y.name,
                      to: y.status === "closed" ? "open" : "closed",
                    })
                  }
                >
                  {y.status === "closed" ? (
                    <>
                      <LockOpen className="h-4 w-4" />
                      Reopen
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Close
                    </>
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
      {isAdmin && <CreateYearDialog open={creating} onOpenChange={setCreating} />}
      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target?.to === "closed" ? `Close ${target.name}?` : `Reopen ${target?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {target?.to === "closed"
                ? "Nobody can add, edit or delete anything in this year, including spending and evidence, until it is reopened."
                : "Team members can change this year again. The reopening is recorded in the audit log."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>
              {target?.to === "closed" ? "Close year" : "Reopen year"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function SitesPanel() {
  const { isAdmin } = useYear();
  const wp = useWorkplan();
  const add = useAddSite();
  const rename = useRenameSite();
  const archive = useArchiveSite();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [en, setEn] = useState("");
  const sites = [...(wp.data?.sites ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
  const active = sites.filter((s) => !s.archivedAt);
  const archived = sites.filter((s) => s.archivedAt);
  const row = (s: (typeof sites)[number]) => (
    <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
      {editing === s.id ? (
        <>
          <Input
            aria-label="Site name"
            className="min-w-40 flex-1"
            value={en}
            onChange={(e) => setEn(e.target.value)}
          />
          <Button
            size="sm"
            loading={rename.isPending}
            disabled={!en.trim()}
            onClick={() =>
              rename.mutate({ id: s.id, name: en }, { onSuccess: () => setEditing(null) })
            }
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span
            className={`mr-auto min-w-0 break-words ${s.archivedAt ? "text-muted-foreground" : ""}`}
          >
            {s.name}
          </span>
          {isAdmin && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(s.id);
                  setEn(s.name);
                }}
              >
                <Pencil className="h-4 w-4" />
                Rename
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  archive.mutate(
                    { id: s.id, archived: !s.archivedAt },
                    {
                      onSuccess: () =>
                        toast.success(s.archivedAt ? "Site restored" : "Site archived"),
                    },
                  )
                }
              >
                {s.archivedAt ? (
                  <>
                    <ArchiveRestore className="h-4 w-4" />
                    Restore
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" />
                    Archive
                  </>
                )}
              </Button>
            </>
          )}
        </>
      )}
    </li>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sites</CardTitle>
        <CardDescription>
          One list for the whole study. Each site activity picks the sites where it runs. Archive a
          site to stop using it; past years keep it.
          {!isAdmin && " Only study admins can change the list."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {wp.isError && (
          <p className="text-sm text-destructive">Could not load sites: {wp.error.message}</p>
        )}
        {!active.length && wp.isSuccess && (
          <p className="text-sm text-muted-foreground">No sites yet.</p>
        )}
        {active.length > 0 && (
          <ul className="divide-y rounded-md border text-sm">{active.map(row)}</ul>
        )}
        {isAdmin && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate(name, {
                onSuccess: () => {
                  setName("");
                  toast.success("Site added");
                },
              });
            }}
          >
            <Input
              aria-label="New site"
              placeholder="Site name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" loading={add.isPending} disabled={!name.trim()}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </form>
        )}
        {archived.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Archived
            </p>
            <ul className="divide-y rounded-md border text-sm">{archived.map(row)}</ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImportPanel() {
  const { objectives, outcomes, activities, lines } = useBudgetData();
  const { canEdit } = useYear();
  const imp = useImportLines();
  const [activityId, setActivityId] = useState("");
  const [blocks, setBlocks] = useState<(ParsedBlock & { group: string })[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const options = useMemo(
    () => activityOptions({ objectives, outcomes, activities }),
    [objectives, outcomes, activities],
  );
  const qtyUnits = useMemo(
    () =>
      unitSuggestions(
        QUANTITY_UNITS,
        lines.map((l) => l.quantityUnit),
      ),
    [lines],
  );
  const durUnits = useMemo(
    () =>
      unitSuggestions(
        DURATION_UNITS,
        lines.map((l) => l.durationUnit),
      ),
    [lines],
  );

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
      setBlocks(parsed.blocks.map((b) => ({ ...b, group: b.heading })));
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
        description: r.description,
        groupLabel: b.group.trim() || undefined,
        quantity: r.quantity,
        quantityUnit: r.quantityUnit,
        unitCostCents: kesToCents(r.unitCost),
        duration: r.duration,
        durationUnit: r.durationUnit,
        occurrences: r.occurrences,
      };
    });
    imp.mutate(
      { activityId, rows: payload },
      {
        onSuccess: (n) => {
          toast.success(`Imported ${n} line(s)`);
          setRows([]);
          setBlocks([]);
          setFileName("");
        },
      },
    );
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
          Upload an .xlsx budget and choose the one activity every row is added to. Rows without
          numbers become group labels you can edit. Not sure of the layout? Start from the template.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canEdit && (
          <p className="text-sm text-muted-foreground">
            Import is off because there is no open year to import into.
          </p>
        )}
        <div className="max-w-md space-y-1">
          <Label>Add the lines to this activity</Label>
          <ActivityPicker
            value={activityId}
            onChange={setActivityId}
            options={options}
            disabled={!canEdit}
            label="Import into activity"
          />
          {!options.length && canEdit && (
            <p className="text-xs text-muted-foreground">
              This year has no activities. Add one under Activities first.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${canEdit ? "cursor-pointer hover:bg-muted" : "pointer-events-none opacity-50"}`}
          >
            <Upload className="h-4 w-4" />
            {fileName || "Choose .xlsx file"}
            <input
              type="file"
              accept=".xlsx"
              disabled={!canEdit}
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </Label>
          <Button variant="ghost" size="sm" onClick={downloadImportTemplate}>
            <Download className="h-4 w-4" />
            Download template
          </Button>
        </div>
        {blocks.map((b) => (
          <div key={b.index} className="rounded-md border">
            <div className="flex flex-wrap items-end gap-3 border-b bg-muted/50 p-3">
              <p className="mr-auto font-medium">{b.heading}</p>
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
              <table className="w-full min-w-275 text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Unit cost</th>
                    <th>Duration</th>
                    <th>Dur. unit</th>
                    <th>Occ.</th>
                    <th className="text-right!">Calculated</th>
                    <th className="text-right!">In file</th>
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
                          <UnitInput
                            aria-label="Unit"
                            className="h-8 min-w-28"
                            value={r.quantityUnit}
                            suggestions={qtyUnits}
                            onChange={(v) => setRow(i, { quantityUnit: v })}
                          />
                        </td>
                        <td>{numCell(i, "unitCost", r.unitCost)}</td>
                        <td>{numCell(i, "duration", r.duration)}</td>
                        <td>
                          <UnitInput
                            aria-label="Duration unit"
                            className="h-8 min-w-28"
                            value={r.durationUnit}
                            suggestions={durUnits}
                            onChange={(v) => setRow(i, { durationUnit: v })}
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
          <Button onClick={confirm} loading={imp.isPending} disabled={!canEdit || !activityId}>
            Import {rows.length} line(s)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ExportPanel() {
  const d = useBudgetData();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Export to Excel</CardTitle>
        <CardDescription>
          A budget sheet and a summary sheet grouped by objective, outcome and activity, with
          carryover per line, and an events sheet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          disabled={!d.period}
          onClick={() => d.period && exportWorkbook(d.period, d, d.attachments)}
        >
          <Download className="h-4 w-4" />
          Download .xlsx
        </Button>
      </CardContent>
    </Card>
  );
}

function PeriodGlance() {
  const { period, activities, lines, events } = useBudgetData();
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
    ["Activities", activities.length],
    ["Lines", lines.length],
    ["Events", events.length],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Year at a glance</CardTitle>
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
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(AUDIT_PAGE_SIZES[1]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  // Filters can shrink the list below the current page.
  const current = Math.min(page, pages - 1);
  const start = current * size;
  const shown = rows.slice(start, start + size);
  useEffect(() => setPage(0), [entity, from, to]);
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
        <table className="w-full min-w-200 text-sm">
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
            {shown.map((a) => (
              <tr key={a.id} className="border-t [&>td]:px-3 [&>td]:py-1.5">
                <td className="whitespace-nowrap tabular-nums">
                  {new Date(a.changedAt).toLocaleString()}
                </td>
                <td>{a.entity}</td>
                <td className="font-mono text-xs">{a.field}</td>
                <td className="max-w-60 truncate text-muted-foreground" title={a.oldValue ?? ""}>
                  {a.oldValue ?? "—"}
                </td>
                <td className="max-w-60 truncate" title={a.newValue ?? ""}>
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
        {rows.length > AUDIT_PAGE_SIZES[0] && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Rows per page</span>
              <Select
                value={String(size)}
                onValueChange={(v) => {
                  const n = Number(v);
                  // Keep the first visible row on screen.
                  setPage(Math.floor(start / n));
                  setSize(n);
                }}
              >
                <SelectTrigger className="h-8 w-20" aria-label="Rows per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIT_PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="tabular-nums">
                {start + 1}–{start + shown.length} of {rows.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                aria-label="First page"
                disabled={current === 0}
                onClick={() => setPage(0)}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                aria-label="Previous page"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 tabular-nums text-muted-foreground">
                Page {current + 1} of {pages}
              </span>
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                aria-label="Next page"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                aria-label="Last page"
                disabled={current >= pages - 1}
                onClick={() => setPage(pages - 1)}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const AUDIT_PAGE_SIZES = [25, 50, 100, 200] as const;
