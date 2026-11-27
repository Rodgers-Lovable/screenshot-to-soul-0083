import { useMemo, useState } from "react";
import { useOnChange } from "@/hooks/use-on-change";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { Money } from "@/components/app/currency";
import { useYear } from "@/components/app/active-year-context";
import { useAudit, useBudgetData, useUpdatePeriod } from "@/data/hooks";
import { clamp, daysBetween, periodSummary } from "@/lib/calc";
import { todayISO } from "@/lib/format";
import type { BudgetPeriod } from "@/lib/types";
import { prefillYearDates, validateYear } from "@/lib/workplan";

export function PeriodForm() {
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
  useOnChange(period, (p) => {
    if (p) setV(prefillYearDates(p, todayISO()));
  });
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
