import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Info, MoreHorizontal, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBudgetData, useDuplicateLine, useRemoveLine } from "@/data/hooks";
import { lineSummary as summaryOf } from "@/lib/calc";
import { lineFlags, sumSummaries, type Summary } from "@/lib/calc";
import {
  activityLabel,
  activityOptions,
  buildBudgetTree,
  filterBudgetTree,
  type ActivityBudget,
} from "@/lib/budget-tree";
import { durationLabel } from "@/lib/format";
import type { BudgetLine } from "@/lib/types";
import { ActivityPicker } from "@/components/app/budget-fields";
import { MoveLineDialog } from "@/components/app/move-line-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Money, useFmt } from "@/components/app/currency";
import { Flags } from "@/components/app/chips";
import { LineEditor } from "@/components/app/line-editor";
import { CLOSED_HINT, useYear } from "@/components/app/active-year-context";
import { PageHeader } from "@/components/app/shell";
import { Truncated } from "@/components/app/truncated";

export const Route = createFileRoute("/budget")({
  head: () => ({
    meta: [
      { title: "Budget · Project Budget Tracker" },
      {
        name: "description",
        content:
          "Budget lines grouped by objective, outcome and activity with planned, actual and remaining amounts.",
      },
      { property: "og:title", content: "Budget · Project Budget Tracker" },
      {
        property: "og:description",
        content:
          "Budget lines grouped by objective, outcome and activity with planned, actual and remaining amounts.",
      },
    ],
  }),
  component: BudgetPage,
});

function BudgetPage() {
  const d = useBudgetData();
  const { closed } = useYear();
  const f = useFmt();
  const [q, setQ] = useState("");
  const [activityId, setActivityId] = useState("");
  const [funding, setFunding] = useState<"all" | "funded" | "unfunded">("all");
  const [editor, setEditor] = useState<{ open: boolean; line?: BudgetLine; activityId?: string }>({
    open: false,
  });
  const [del, setDel] = useState<BudgetLine | null>(null);
  const [moving, setMoving] = useState<BudgetLine | null>(null);

  const tree = useMemo(
    () => buildBudgetTree(d.objectives, d.outcomes, d.activities, d.lines, d.events),
    [d.objectives, d.outcomes, d.activities, d.lines, d.events],
  );
  const shown = useMemo(
    () => filterBudgetTree(tree, { search: q, activityId: activityId || undefined, funding }),
    [tree, q, activityId, funding],
  );
  const total = useMemo(() => sumSummaries(tree.map((o) => o.summary)), [tree]);
  const options = useMemo(
    () =>
      activityOptions({ objectives: d.objectives, outcomes: d.outcomes, activities: d.activities }),
    [d.objectives, d.outcomes, d.activities],
  );
  const filtering = !!(q || activityId || funding !== "all");

  if (!d.ready) return null;
  return (
    <div>
      <PageHeader
        title="Budget"
        sub={d.period ? `${d.period.projectName} · ${d.period.name}` : undefined}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search lines"
            placeholder="Search lines"
            className="w-56 pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </PageHeader>

      {options.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2" data-tour="budget-filters">
          <div className="flex w-72 max-w-full items-center gap-1">
            <ActivityPicker
              value={activityId}
              onChange={setActivityId}
              options={options}
              label="Filter by activity"
              placeholder="All activities"
            />
            {activityId && (
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                aria-label="Clear activity filter"
                onClick={() => setActivityId("")}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
          <Select value={funding} onValueChange={(v) => setFunding(v as typeof funding)}>
            <SelectTrigger className="w-40" aria-label="Funding">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All activities</SelectItem>
              <SelectItem value="funded">With budget</SelectItem>
              <SelectItem value="unfunded">Unfunded</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {!options.length && (
        <div className="rounded-lg border bg-card p-6 text-sm">
          <p className="font-medium">This year has no activities yet.</p>
          <p className="mt-1 text-muted-foreground">
            Every budget line belongs to an activity. Add the objectives, outcomes and activities
            first, then add lines to them here.
          </p>
          <Button asChild variant="outline" className="mt-3">
            <Link to="/activities">Go to activities</Link>
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {shown.map((o, oi) => (
          <Collapsible
            key={o.objective.id}
            defaultOpen
            className="rounded-lg border bg-card"
            data-tour={oi === 0 ? "budget-objective" : undefined}
          >
            <div className="sticky top-14 z-20 flex items-center gap-3 rounded-t-lg border-b bg-card px-4 py-2.5">
              <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 text-left font-semibold">
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=closed]:-rotate-90" />
                <Truncated text={`Objective ${activityLabel(o.objective)}`} />
              </CollapsibleTrigger>
              <span className="hidden text-xs text-muted-foreground sm:inline">Planned</span>
              <Money cents={o.summary.planned} size="md" />
            </div>
            <CollapsibleContent>
              {o.outcomes.map((oc) => (
                <section key={oc.outcome.id} className="border-b last:border-b-0">
                  <div className="flex items-center gap-3 bg-muted/40 px-4 py-2 text-sm font-medium">
                    <Truncated
                      text={`Outcome ${activityLabel(oc.outcome)}`}
                      className="min-w-0 flex-1"
                    />
                    <Money cents={oc.summary.planned} />
                  </div>
                  {oc.activities.map((a) => (
                    <ActivityBlock
                      key={a.activity.id}
                      block={a}
                      filtering={filtering}
                      onAdd={() => setEditor({ open: true, activityId: a.activity.id })}
                      onEdit={(l) => setEditor({ open: true, line: l })}
                      onDelete={setDel}
                      onMove={setMoving}
                    />
                  ))}
                </section>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}
        {filtering && options.length > 0 && !shown.length && (
          <p className="rounded-lg border bg-card p-4 text-center text-sm text-muted-foreground">
            No matching lines or activities.
          </p>
        )}
      </div>

      <div className="sticky bottom-14 mt-4 flex items-center justify-between rounded-lg border bg-card px-4 py-3 shadow-sm md:bottom-0">
        <span className="font-semibold">Period total</span>
        <span className="text-right tabular-nums">
          <span className="block font-semibold" data-testid="grand-total-kes">
            {f.kes(total.planned)}
          </span>
          <span className="block text-xs text-muted-foreground" data-testid="grand-total-usd">
            {f.usd(total.planned)}
          </span>
        </span>
      </div>
      {closed && <p className="mt-2 text-xs text-muted-foreground">{CLOSED_HINT}</p>}

      <LineEditor
        open={editor.open}
        onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))}
        line={editor.line}
        activityId={editor.activityId}
      />
      <MoveLineDialog line={moving} onClose={() => setMoving(null)} />
      <DeleteLineDialog
        line={del}
        onClose={() => setDel(null)}
        hasDone={!!del && d.events.some((e) => e.lineId === del.id && e.status === "done")}
      />
    </div>
  );
}

function ActivityBlock({
  block,
  filtering,
  onAdd,
  onEdit,
  onDelete,
  onMove,
}: {
  block: ActivityBudget;
  filtering: boolean;
  onAdd: () => void;
  onEdit: (l: BudgetLine) => void;
  onDelete: (l: BudgetLine) => void;
  onMove: (l: BudgetLine) => void;
}) {
  const d = useBudgetData();
  const { canEdit, closed } = useYear();
  const { activity, lines, summary, funded } = block;
  const sums = useMemo(
    () => new Map(lines.map((l) => [l.id, summaryOf(l, d.events)])),
    [lines, d.events],
  );
  const groups = [...new Set(lines.map((l) => l.groupLabel ?? ""))];
  return (
    <div className="border-t first:border-t-0" data-testid="budget-activity">
      <div className="flex items-center gap-3 px-4 py-2">
        <Link
          to="/activities/$id"
          params={{ id: activity.id }}
          className="min-w-0 flex-1 text-sm font-medium text-primary hover:underline"
        >
          <Truncated text={activityLabel(activity)} />
        </Link>
        {!funded && (
          <span className="rounded border bg-card px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            Unfunded
          </span>
        )}
        {funded && <Money cents={summary.planned} />}
        <Button
          size="sm"
          variant="ghost"
          disabled={!canEdit}
          title={closed ? CLOSED_HINT : undefined}
          onClick={onAdd}
          data-tour="budget-add-line"
        >
          <Plus className="h-4 w-4" />
          Add line
        </Button>
      </div>
      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-275 text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                <th className="text-left">Description</th>
                <th className="text-right">Qty</th>
                <th className="text-left">Unit</th>
                <th className="text-right">Unit cost</th>
                <th className="text-left">Duration</th>
                <th className="text-right">Occ.</th>
                <th className="text-right">Planned</th>
                <th className="text-right">Actual</th>
                <th className="text-right">Remaining</th>
                <th className="text-left">Progress</th>
                <th className="text-left">Flags</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const gl = lines.filter((l) => (l.groupLabel ?? "") === g);
                const gs = sumSummaries(gl.map((l) => sums.get(l.id)!));
                return [
                  g && (
                    <tr key={`g-${g}`} className="bg-secondary/60">
                      <td
                        colSpan={6}
                        className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {g}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Money cents={gs.planned} />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Money cents={gs.actualToDate} />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Money cents={gs.remaining} />
                      </td>
                      <td colSpan={3} />
                    </tr>
                  ),
                  ...gl.map((l) => (
                    <LineRow
                      key={l.id}
                      line={l}
                      s={sums.get(l.id)!}
                      onEdit={() => onEdit(l)}
                      onMove={() => onMove(l)}
                      onDelete={() => onDelete(l)}
                    />
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      {!funded && !filtering && (
        <p className="px-4 pb-2 text-xs text-muted-foreground">No budget lines yet.</p>
      )}
    </div>
  );
}

function LineRow({
  line: l,
  s,
  onEdit,
  onMove,
  onDelete,
}: {
  line: BudgetLine;
  s: Summary;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const f = useFmt();
  const nav = useNavigate();
  const dup = useDuplicateLine();
  const { canEdit } = useYear();
  const go = () => nav({ to: "/budget/lines/$id", params: { id: l.id } });
  return (
    <tr
      className="h-10 cursor-pointer border-t hover:bg-muted/40 [&>td]:px-3 [&>td]:py-1"
      onClick={go}
      onKeyDown={(e) => e.key === "Enter" && go()}
      tabIndex={0}
    >
      <td className="max-w-[320px]">
        <span className="flex items-center gap-1.5">
          <Truncated text={l.description} className="min-w-0" />
          {l.justification && (
            <Tooltip>
              <TooltipTrigger onClick={(e) => e.stopPropagation()} aria-label="Justification">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{l.justification}</TooltipContent>
            </Tooltip>
          )}
        </span>
      </td>
      <td className="num">{l.quantity.toLocaleString()}</td>
      <td className="text-muted-foreground">{l.quantityUnit}</td>
      <td className="num">{f.kes(l.unitCostCents)}</td>
      <td className="text-muted-foreground">{durationLabel(l.duration, l.durationUnit)}</td>
      <td className="num">{l.occurrences}</td>
      <td className="text-right">
        <Money cents={s.planned} />
      </td>
      <td className="text-right">
        <Money cents={s.actualToDate} tone={s.actualToDate > s.planned ? "danger" : undefined} />
      </td>
      <td className="text-right">
        <Money cents={s.remaining} tone="auto" />
      </td>
      <td>
        <div
          className="h-1.5 w-20 rounded-full bg-muted"
          title={`${Math.round(s.progressPct * 100)}%`}
        >
          <div
            className={`h-1.5 rounded-full ${s.progressPct > 1 ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${Math.min(100, s.progressPct * 100)}%` }}
          />
        </div>
      </td>
      <td>
        <Flags flags={lineFlags(s)} />
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={!canEdit}
              aria-label="Line actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem onSelect={onMove}>Move to another activity</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                dup.mutate(l.id, { onSuccess: () => toast.success("Line duplicated") })
              }
            >
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onSelect={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function DeleteLineDialog({
  line,
  onClose,
  hasDone,
}: {
  line: BudgetLine | null;
  onClose: () => void;
  hasDone: boolean;
}) {
  const rm = useRemoveLine();
  const [typed, setTyped] = useState("");
  const ok = !hasDone || typed.trim() === line?.description;
  useEffect(() => {
    setTyped("");
  }, [line?.id]);
  return (
    <Dialog
      open={!!line}
      onOpenChange={(o) => {
        if (!o) {
          setTyped("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete line?</DialogTitle>
          <DialogDescription>
            This deletes “{line?.description}”, its events and their evidence files.
          </DialogDescription>
        </DialogHeader>
        {hasDone && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">This line has completed events.</p>
            <ConfirmLabel id="confirm-name" text={line?.description} />
            <Input
              id="confirm-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={line?.description}
              autoComplete="off"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!ok}
            onClick={() =>
              line &&
              rm.mutate(line.id, {
                onSuccess: () => {
                  toast.success("Line deleted");
                  setTyped("");
                  onClose();
                },
              })
            }
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmLabel({ id, text }: { id: string; text?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    // Stop the label from moving focus to the input.
    e.preventDefault();
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => toast.error("Could not copy"),
    );
  };
  return (
    <Label htmlFor={id} className="block text-sm/6 font-normal text-muted-foreground">
      Type{" "}
      <code className="rounded bg-muted box-decoration-clone px-1 py-0.5 font-mono text-xs text-foreground">
        {text}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy name"}
        className="mx-1 inline-flex size-5 items-center justify-center rounded align-middle text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      to confirm.
    </Label>
  );
}
