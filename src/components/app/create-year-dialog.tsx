import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateYear } from "@/data/hooks";
import type { BudgetPeriod } from "@/lib/types";
import { todayISO } from "@/lib/format";
import { defaultNewYear, validateYear } from "@/lib/workplan";
import { Checkbox } from "@/components/ui/checkbox";
import { useActiveStudy } from "./active-study-context";
import { useYear } from "./active-year-context";

const BLANK = "__blank";

/** Admin dialog: start a new year blank, or from an earlier year's workplan. */
export function CreateYearDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { years } = useYear();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{years.length ? "Start a new year" : "Create the first year"}</DialogTitle>
          <DialogDescription>
            A year holds its own workplan and budget. Its dates cannot overlap another year.
          </DialogDescription>
        </DialogHeader>
        {open && <YearForm years={years} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function YearForm({ years, onDone }: { years: BudgetPeriod[]; onDone: () => void }) {
  const { study } = useActiveStudy();
  const { select } = useYear();
  const create = useCreateYear();
  const latest = useMemo(
    () => [...years].sort((a, b) => b.startDate.localeCompare(a.startDate))[0],
    [years],
  );
  const next = defaultNewYear(years, todayISO());
  const [from, setFrom] = useState(latest ? latest.id : BLANK);
  const [withLines, setWithLines] = useState(false);
  const [v, setV] = useState({
    name: next?.name ?? "",
    startDate: next?.startDate ?? "",
    endDate: next?.endDate ?? "",
    fxRate: latest?.fxRate ?? 125,
    currency: latest?.currency ?? "KES",
  });
  const problem = validateYear({ ...v, currency: v.currency.trim().toUpperCase() }, years);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (problem) return;
    create.mutate(
      {
        studyId: study.id,
        value: { ...v, name: v.name.trim(), currency: v.currency.trim().toUpperCase() },
        copyFromId: from === BLANK ? null : from,
        copyBudgetLines: from !== BLANK && withLines,
      },
      {
        onSuccess: (id) => {
          toast.success(`Year created${from === BLANK ? "" : " from the earlier workplan"}`);
          select(id);
          onDone();
        },
      },
    );
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      {years.length > 0 && (
        <div className="space-y-1">
          <Label>Start from</Label>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger aria-label="Start from">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={BLANK}>A blank year</SelectItem>
              {[...years]
                .sort((a, b) => b.startDate.localeCompare(a.startDate))
                .map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    Workplan of {y.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Copies objectives, outcomes, activities, indicators, responsible people and site
            choices.
          </p>
          {from !== BLANK && (
            <div className="flex items-start gap-2 pt-1">
              <Checkbox
                id="year-copy-lines"
                checked={withLines}
                onCheckedChange={(c) => setWithLines(c === true)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label htmlFor="year-copy-lines">Include budget lines</Label>
                <p className="text-xs text-muted-foreground">
                  Copies each line with fresh planned records. Spending, actuals, finance postings
                  and evidence are not copied.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="year-name">Year name</Label>
        <Input
          id="year-name"
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="year-start">Start date</Label>
          <Input
            id="year-start"
            type="date"
            value={v.startDate}
            onChange={(e) => setV({ ...v, startDate: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="year-end">End date</Label>
          <Input
            id="year-end"
            type="date"
            value={v.endDate}
            onChange={(e) => setV({ ...v, endDate: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="year-fx">Exchange rate to USD</Label>
          <Input
            id="year-fx"
            type="number"
            step="any"
            value={v.fxRate}
            onChange={(e) => setV({ ...v, fxRate: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="year-cur">Currency</Label>
          <Input
            id="year-cur"
            maxLength={3}
            value={v.currency}
            onChange={(e) => setV({ ...v, currency: e.target.value })}
          />
        </div>
      </div>
      {problem && v.name && v.startDate && v.endDate && (
        <p className="text-sm text-destructive">{problem}</p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={!!problem || create.isPending}>
          Create year
        </Button>
      </DialogFooter>
    </form>
  );
}
