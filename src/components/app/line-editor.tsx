import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBudgetData, useCreateLine, useUpdateLine } from "@/data/hooks";
import { linePlanned, planOccurrenceChange } from "@/lib/calc";
import { durationLabel, formatKES, formatUSD, kesToCents } from "@/lib/format";
import { COST_CATEGORIES, DURATION_UNITS, QUANTITY_UNITS, type BudgetLine } from "@/lib/types";

const schema = z.object({
  componentId: z.string().min(1, "Choose a component"),
  groupLabel: z.string().optional(),
  description: z.string().trim().min(1, "Description required").max(200),
  quantity: z.coerce.number().positive("Must be > 0"),
  quantityUnit: z.enum(["pax", "SMS", "units", "lines", "vehicles", "sets"]),
  unitCost: z.coerce.number().min(0, "Must be ≥ 0"),
  duration: z.coerce.number().positive("Must be > 0"),
  durationUnit: z.enum(["days", "months", "one-off"]),
  occurrences: z.coerce.number().int("Whole number").min(1, "At least 1").max(366),
  justification: z.string().max(1000).optional(),
  costCategory: z.enum(["Personnel", "Travel", "Supplies", "Contractual", "Other", "none"]).optional(),
});
type In = z.input<typeof schema>;
type Out = z.output<typeof schema>;

export function formulaSentence(l: Pick<BudgetLine, "quantity" | "quantityUnit" | "unitCostCents" | "duration" | "durationUnit" | "occurrences">, fx: number) {
  const total = linePlanned({ ...l, id: "", componentId: "", description: "", sortOrder: 0 });
  const dur = l.durationUnit === "one-off" ? "1 one-off" : durationLabel(l.duration, l.durationUnit);
  return `${l.quantity} ${l.quantityUnit} × ${formatKES(l.unitCostCents)} × ${dur} × ${l.occurrences} = ${formatKES(total)} (${formatUSD(total, fx)})`;
}

export function LineEditor({ open, onOpenChange, line, componentId }: { open: boolean; onOpenChange: (o: boolean) => void; line?: BudgetLine; componentId?: string }) {
  const { components, events, period } = useBudgetData();
  const fx = period?.fxRate ?? 125;
  const create = useCreateLine();
  const update = useUpdateLine();
  const defaults = (): In => line
    ? { componentId: line.componentId, groupLabel: line.groupLabel ?? "", description: line.description, quantity: line.quantity, quantityUnit: line.quantityUnit, unitCost: line.unitCostCents / 100, duration: line.duration, durationUnit: line.durationUnit, occurrences: line.occurrences, justification: line.justification ?? "", costCategory: line.costCategory ?? "none" }
    : { componentId: componentId ?? components[0]?.id ?? "", groupLabel: "", description: "", quantity: 1, quantityUnit: "pax", unitCost: 0, duration: 1, durationUnit: "days", occurrences: 1, justification: "", costCategory: "none" };
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(schema), defaultValues: defaults() });
  useEffect(() => { if (open) form.reset(defaults()); }, [open, line?.id, componentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = useWatch({ control: form.control });

  const preview = useMemo(() => {
    const p = { quantity: Number(w.quantity) || 0, quantityUnit: w.quantityUnit ?? "pax", unitCostCents: kesToCents(Number(w.unitCost) || 0), duration: w.durationUnit === "one-off" ? 1 : Number(w.duration) || 0, durationUnit: w.durationUnit ?? "days", occurrences: Number(w.occurrences) || 0 };
    let delta: string | null = null; let blocked: string | null = null;
    if (line && p.occurrences !== line.occurrences && p.occurrences > 0) {
      try {
        const plan = planOccurrenceChange(events.filter((e) => e.lineId === line.id), p.occurrences);
        delta = plan.add ? `${plan.add} planned event(s) will be added` : `${plan.removeIds.length} planned event(s) will be removed`;
      } catch (e) { blocked = e instanceof Error ? e.message : "Blocked"; }
    }
    return { sentence: formulaSentence(p, fx), total: linePlanned({ ...p, id: "", componentId: "", description: "", sortOrder: 0 }), delta, blocked };
  }, [w, line, events, fx]);

  async function onSubmit(v: Out) {
    if (preview.blocked) return;
    const payload = {
      componentId: v.componentId, groupLabel: v.groupLabel?.trim() || undefined, description: v.description, quantity: v.quantity, quantityUnit: v.quantityUnit,
      unitCostCents: kesToCents(v.unitCost), duration: v.durationUnit === "one-off" ? 1 : v.duration, durationUnit: v.durationUnit, occurrences: v.occurrences,
      justification: v.justification?.trim() || undefined, costCategory: v.costCategory && v.costCategory !== "none" ? v.costCategory : undefined,
    };
    try {
      if (line) await update.mutateAsync({ id: line.id, patch: payload });
      else await create.mutateAsync(payload);
      toast.success(line ? "Line updated" : "Line added");
      onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
  }

  const err = (k: keyof In) => form.formState.errors[k] && <p className="text-xs text-destructive">{String(form.formState.errors[k]?.message)}</p>;
  const sel = (name: "componentId" | "quantityUnit" | "durationUnit" | "costCategory", opts: { v: string; l: string }[], label: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={String(w[name] ?? "")} onValueChange={(v) => form.setValue(name, v as never, { shouldValidate: true })}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{opts.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
      </Select>
      {err(name)}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{line ? "Edit line" : "Add line"}</SheetTitle>
          <SheetDescription>Planned amount = quantity × unit cost × duration × occurrences.</SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-3">
          {sel("componentId", components.map((c) => ({ v: c.id, l: `${c.code}. ${c.name}` })), "Component")}
          <div className="space-y-1"><Label htmlFor="groupLabel">Group (optional)</Label><Input id="groupLabel" {...form.register("groupLabel")} /></div>
          <div className="space-y-1"><Label htmlFor="description">Description</Label><Input id="description" {...form.register("description")} />{err("description")}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="quantity">Quantity</Label><Input id="quantity" type="number" step="any" {...form.register("quantity")} />{err("quantity")}</div>
            {sel("quantityUnit", QUANTITY_UNITS.map((u) => ({ v: u, l: u })), "Unit")}
            <div className="space-y-1"><Label htmlFor="unitCost">Unit cost (KES)</Label><Input id="unitCost" type="number" step="any" {...form.register("unitCost")} />{err("unitCost")}</div>
            <div className="space-y-1"><Label htmlFor="occurrences">Occurrences</Label><Input id="occurrences" type="number" {...form.register("occurrences")} />{err("occurrences")}</div>
            <div className="space-y-1"><Label htmlFor="duration">Duration</Label><Input id="duration" type="number" step="any" disabled={w.durationUnit === "one-off"} {...form.register("duration")} />{err("duration")}</div>
            {sel("durationUnit", DURATION_UNITS.map((u) => ({ v: u, l: u })), "Duration unit")}
          </div>
          {sel("costCategory", [{ v: "none", l: "—" }, ...COST_CATEGORIES.map((c) => ({ v: c, l: c }))], "Cost category")}
          <div className="space-y-1"><Label htmlFor="justification">Justification</Label><Textarea id="justification" rows={3} {...form.register("justification")} /></div>

          <div className="rounded-md border bg-accent/50 p-3 text-sm" aria-live="polite">
            <p className="font-medium tabular-nums" data-testid="formula-preview">{preview.sentence}</p>
            {line && (
              <p className="mt-1 text-muted-foreground tabular-nums">
                Was {formatKES(linePlanned(line))} → now {formatKES(preview.total)}
              </p>
            )}
            {preview.delta && <p className="mt-1 text-muted-foreground">{preview.delta}</p>}
            {preview.blocked && <p className="mt-1 text-destructive">{preview.blocked}</p>}
          </div>
          <SheetFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!!preview.blocked}>{line ? "Save changes" : "Add line"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
