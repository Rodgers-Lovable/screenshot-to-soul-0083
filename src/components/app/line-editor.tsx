import { useEffect, useEffectEvent, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBudgetData, useCreateLine, useUpdateLine } from "@/data/hooks";
import { linePlanned, planOccurrenceChange } from "@/lib/calc";
import { durationLabel, formatKES, formatUSD, kesToCents } from "@/lib/format";
import { activityOptions, isOneOff, unitSuggestions } from "@/lib/budget-tree";
import {
  COST_CATEGORIES,
  DURATION_UNITS,
  ONE_OFF,
  QUANTITY_UNITS,
  type BudgetLine,
} from "@/lib/types";
import { ActivityPicker, UnitInput } from "./budget-fields";

const schema = z.object({
  activityId: z.string().min(1, "Choose an activity"),
  groupLabel: z.string().optional(),
  description: z.string().trim().min(1, "Description required").max(200),
  quantity: z.coerce.number().positive("Must be > 0"),
  quantityUnit: z.string().trim().min(1, "Unit required").max(40),
  unitCost: z.coerce.number().min(0, "Must be ≥ 0"),
  duration: z.coerce.number().positive("Must be > 0"),
  durationUnit: z.string().trim().min(1, "Duration unit required").max(40),
  occurrences: z.coerce.number().int("Whole number").min(1, "At least 1").max(366),
  justification: z.string().max(1000).optional(),
  costCategory: z
    .enum(["Personnel", "Travel", "Supplies", "Contractual", "Other", "none"])
    .optional(),
});
type In = z.input<typeof schema>;
type Out = z.output<typeof schema>;

export function formulaSentence(
  l: Pick<
    BudgetLine,
    "quantity" | "quantityUnit" | "unitCostCents" | "duration" | "durationUnit" | "occurrences"
  >,
  fx: number,
) {
  const total = linePlanned({ ...l, id: "", activityId: "", description: "", sortOrder: 0 });
  const dur = isOneOff(l.durationUnit) ? "1 one-off" : durationLabel(l.duration, l.durationUnit);
  return `${l.quantity} ${l.quantityUnit} × ${formatKES(l.unitCostCents)} × ${dur} × ${l.occurrences} = ${formatKES(total)} (${formatUSD(total, fx)})`;
}

export function LineEditor({
  open,
  onOpenChange,
  line,
  activityId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  line?: BudgetLine;
  activityId?: string;
}) {
  const { objectives, outcomes, activities, lines, events, period } = useBudgetData();
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
  const fx = period?.fxRate ?? 125;
  const create = useCreateLine();
  const update = useUpdateLine();
  const defaults = (): In =>
    line
      ? {
          activityId: line.activityId,
          groupLabel: line.groupLabel ?? "",
          description: line.description,
          quantity: line.quantity,
          quantityUnit: line.quantityUnit,
          unitCost: line.unitCostCents / 100,
          duration: line.duration,
          durationUnit: line.durationUnit,
          occurrences: line.occurrences,
          justification: line.justification ?? "",
          costCategory: line.costCategory ?? "none",
        }
      : {
          activityId: activityId ?? "",
          groupLabel: "",
          description: "",
          quantity: 1,
          quantityUnit: "units",
          unitCost: 0,
          duration: 1,
          durationUnit: "days",
          occurrences: 1,
          justification: "",
          costCategory: "none",
        };
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(schema),
    defaultValues: defaults(),
  });
  // Reset only when the dialog opens or switches line, not on every render.
  const resetForm = useEffectEvent(() => form.reset(defaults()));
  const lineId = line?.id;
  useEffect(() => {
    if (open) resetForm();
  }, [open, lineId, activityId]);
  const w = useWatch({ control: form.control });

  const preview = useMemo(() => {
    const p = {
      quantity: Number(w.quantity) || 0,
      quantityUnit: w.quantityUnit ?? "",
      unitCostCents: kesToCents(Number(w.unitCost) || 0),
      duration: isOneOff(w.durationUnit ?? "") ? 1 : Number(w.duration) || 0,
      durationUnit: w.durationUnit ?? "days",
      occurrences: Number(w.occurrences) || 0,
    };
    let delta: string | null = null;
    let blocked: string | null = null;
    if (line && p.occurrences !== line.occurrences && p.occurrences > 0) {
      try {
        const plan = planOccurrenceChange(
          events.filter((e) => e.lineId === line.id),
          p.occurrences,
        );
        delta = plan.add
          ? `${plan.add} planned event(s) will be added`
          : `${plan.removeIds.length} planned event(s) will be removed`;
      } catch (e) {
        blocked = e instanceof Error ? e.message : "Blocked";
      }
    }
    return {
      sentence: formulaSentence(p, fx),
      total: linePlanned({ ...p, id: "", activityId: "", description: "", sortOrder: 0 }),
      delta,
      blocked,
    };
  }, [w, line, events, fx]);

  async function onSubmit(v: Out) {
    if (preview.blocked) return;
    const payload = {
      activityId: v.activityId,
      groupLabel: v.groupLabel?.trim() || undefined,
      description: v.description,
      quantity: v.quantity,
      quantityUnit: v.quantityUnit,
      unitCostCents: kesToCents(v.unitCost),
      duration: isOneOff(v.durationUnit) ? 1 : v.duration,
      durationUnit: v.durationUnit,
      occurrences: v.occurrences,
      justification: v.justification?.trim() || undefined,
      costCategory: v.costCategory && v.costCategory !== "none" ? v.costCategory : undefined,
    };
    try {
      if (line) await update.mutateAsync({ id: line.id, patch: payload });
      else await create.mutateAsync(payload);
      toast.success(line ? "Line updated" : "Line added");
      onOpenChange(false);
    } catch {
      // The mutation hook already showed the error.
    }
  }

  const err = (k: keyof In) =>
    form.formState.errors[k] && (
      <p className="text-xs text-destructive">{String(form.formState.errors[k]?.message)}</p>
    );
  const sel = (name: "costCategory", opts: { v: string; l: string }[], label: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select
        value={String(w[name] ?? "")}
        onValueChange={(v) => form.setValue(name, v as never, { shouldValidate: true })}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opts.map((o) => (
            <SelectItem key={o.v} value={o.v}>
              {o.l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {err(name)}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{line ? "Edit line" : "Add line"}</SheetTitle>
          <SheetDescription>
            Planned amount = quantity × unit cost × duration × occurrences.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-3">
          <div className="space-y-1">
            <Label>Activity</Label>
            <ActivityPicker
              value={w.activityId ?? ""}
              onChange={(id) => form.setValue("activityId", id, { shouldValidate: true })}
              options={options}
            />
            {!options.length && (
              <p className="text-xs text-muted-foreground">
                This year has no activities yet. Add one under Activities first.
              </p>
            )}
            {err("activityId")}
          </div>
          <div className="space-y-1">
            <Label htmlFor="groupLabel">Group (optional)</Label>
            <Input id="groupLabel" {...form.register("groupLabel")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Input id="description" {...form.register("description")} />
            {err("description")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" type="number" step="any" {...form.register("quantity")} />
              {err("quantity")}
            </div>
            <div className="space-y-1">
              <Label htmlFor="quantityUnit">Unit</Label>
              <UnitInput
                id="quantityUnit"
                value={w.quantityUnit ?? ""}
                onChange={(v) => form.setValue("quantityUnit", v, { shouldValidate: true })}
                suggestions={qtyUnits}
                placeholder="pax, sets, doses"
              />
              {err("quantityUnit")}
            </div>
            <div className="space-y-1">
              <Label htmlFor="unitCost">Unit cost (KES)</Label>
              <Input id="unitCost" type="number" step="any" {...form.register("unitCost")} />
              {err("unitCost")}
            </div>
            <div className="space-y-1">
              <Label htmlFor="occurrences">Occurrences</Label>
              <Input id="occurrences" type="number" {...form.register("occurrences")} />
              {err("occurrences")}
            </div>
            <div className="space-y-1">
              <Label htmlFor="duration">Duration</Label>
              <Input
                id="duration"
                type="number"
                step="any"
                disabled={isOneOff(w.durationUnit ?? "")}
                {...form.register("duration")}
              />
              {err("duration")}
            </div>
            <div className="space-y-1">
              <Label htmlFor="durationUnit">Duration unit</Label>
              <UnitInput
                id="durationUnit"
                value={w.durationUnit ?? ""}
                onChange={(v) => form.setValue("durationUnit", v, { shouldValidate: true })}
                suggestions={durUnits}
                placeholder={ONE_OFF}
              />
              {err("durationUnit")}
            </div>
          </div>
          {sel(
            "costCategory",
            [{ v: "none", l: "—" }, ...COST_CATEGORIES.map((c) => ({ v: c, l: c }))],
            "Cost category",
          )}
          <div className="space-y-1">
            <Label htmlFor="justification">Justification</Label>
            <Textarea id="justification" rows={3} {...form.register("justification")} />
          </div>

          <div className="rounded-md border bg-accent/50 p-3 text-sm" aria-live="polite">
            <p className="font-medium tabular-nums" data-testid="formula-preview">
              {preview.sentence}
            </p>
            {line && (
              <p className="mt-1 text-muted-foreground tabular-nums">
                Was {formatKES(linePlanned(line))} → now {formatKES(preview.total)}
              </p>
            )}
            {preview.delta && <p className="mt-1 text-muted-foreground">{preview.delta}</p>}
            {preview.blocked && <p className="mt-1 text-destructive">{preview.blocked}</p>}
          </div>
          <SheetFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={create.isPending || update.isPending}
              disabled={!!preview.blocked || !options.length}
            >
              {line ? "Save changes" : "Add line"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
