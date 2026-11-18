import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useScheduleLine } from "@/data/hooks";
import { scheduleDates, type Repeat } from "@/lib/calc";
import { todayISO } from "@/lib/format";
import type { BudgetEvent, BudgetLine, BudgetPeriod } from "@/lib/types";
import { StatusChip } from "@/components/app/chips";

const REPEATS: Record<string, { label: string; r: Repeat }> = {
  "1m": { label: "Every month", r: { every: 1, unit: "months" } },
  "2m": { label: "Every 2 months", r: { every: 2, unit: "months" } },
  "3m": { label: "Every 3 months (quarterly)", r: { every: 3, unit: "months" } },
  "6m": { label: "Every 6 months", r: { every: 6, unit: "months" } },
  "1w": { label: "Every week", r: { every: 1, unit: "weeks" } },
  "2w": { label: "Every 2 weeks", r: { every: 2, unit: "weeks" } },
};

const nice = (d?: string) => (d ? format(parseISO(d), "d MMM yyyy") : "No date");

export function ScheduleDialog({
  line,
  events,
  period,
  onClose,
}: {
  line: BudgetLine | null;
  events: BudgetEvent[];
  period: BudgetPeriod | null;
  onClose: () => void;
}) {
  const schedule = useScheduleLine();
  const sorted = useMemo(() => [...events].sort((a, b) => a.sequence - b.sequence), [events]);
  const [mode, setMode] = useState<"repeat" | "custom">("repeat");
  const [first, setFirst] = useState("");
  const [repeat, setRepeat] = useState("1m");
  const [custom, setCustom] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!line) return;
    const firstDated = sorted.find((e) => e.plannedDate)?.plannedDate;
    setFirst(firstDated ?? period?.startDate ?? todayISO());
    setMode(sorted.length > 1 ? "repeat" : "custom");
    setCustom(Object.fromEntries(sorted.map((e) => [e.sequence, e.plannedDate ?? ""])));
  }, [line?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const generated = useMemo(
    () => (first ? scheduleDates(first, sorted.length, REPEATS[repeat]!.r) : []),
    [first, repeat, sorted.length],
  );
  const proposed = (e: BudgetEvent, i: number) =>
    e.status !== "planned" ? e.plannedDate : mode === "repeat" ? generated[i] : custom[e.sequence];
  const outside = period
    ? sorted.filter((e, i) => {
        const d = proposed(e, i);
        return e.status === "planned" && d && (d < period.startDate || d > period.endDate);
      }).length
    : 0;

  const save = () => {
    if (!line) return;
    const dates = sorted
      .map((e, i) => ({ e, d: proposed(e, i) }))
      .filter(({ e }) => e.status === "planned")
      .map(({ e, d }) => ({ sequence: e.sequence, plannedDate: d || undefined }));
    schedule.mutate(
      { lineId: line.id, dates },
      {
        onSuccess: (n) => {
          toast.success(n ? `${n} event date(s) updated` : "No dates changed");
          onClose();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={!!line} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule events</DialogTitle>
          <DialogDescription className="line-clamp-2">{line?.description}</DialogDescription>
        </DialogHeader>

        {sorted.length > 1 && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={mode}
            onValueChange={(v) => v && setMode(v as "repeat" | "custom")}
            className="justify-start"
          >
            <ToggleGroupItem value="repeat">Repeat</ToggleGroupItem>
            <ToggleGroupItem value="custom">Pick each date</ToggleGroupItem>
          </ToggleGroup>
        )}

        {mode === "repeat" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="sched-first">First date</Label>
              <Input
                id="sched-first"
                type="date"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Repeat</Label>
              <Select value={repeat} onValueChange={setRepeat}>
                <SelectTrigger aria-label="Repeat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REPEATS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <tbody>
              {sorted.map((e, i) => (
                <tr key={e.id} className="border-b last:border-0 [&>td]:px-3 [&>td]:py-1.5">
                  <td className="w-16 text-muted-foreground tabular-nums">
                    {e.sequence} of {sorted.length}
                  </td>
                  <td>
                    {e.status !== "planned" ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Lock className="h-3 w-3" aria-hidden />
                        {nice(e.plannedDate)}
                      </span>
                    ) : mode === "custom" ? (
                      <Input
                        type="date"
                        aria-label={`Date for occurrence ${e.sequence}`}
                        className="h-8"
                        value={custom[e.sequence] ?? ""}
                        onChange={(ev) => setCustom({ ...custom, [e.sequence]: ev.target.value })}
                      />
                    ) : (
                      <span className="tabular-nums">{nice(generated[i])}</span>
                    )}
                  </td>
                  <td className="text-right">
                    <StatusChip status={e.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">Done and cancelled events keep their dates.</p>
        {outside > 0 && (
          <p className="flex items-center gap-1.5 text-sm text-warning-foreground">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {outside} date(s) fall outside the budget period.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={schedule.isPending || (mode === "repeat" && !first)}>
            Save dates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
