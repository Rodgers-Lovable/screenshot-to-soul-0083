import { FLAG_LABEL, type FlagKind } from "@/lib/calc";
import type { EventStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AlertTriangle, CalendarX, CheckCircle2, Circle, CircleSlash, FileWarning, TrendingUp } from "lucide-react";

const FLAG_STYLE: Record<FlagKind, string> = {
  "over-budget": "bg-danger-soft text-destructive border-destructive/30",
  "projected-overrun": "bg-warning-soft text-warning-foreground border-warning/40",
  overdue: "bg-warning-soft text-warning-foreground border-warning/40",
  "missing-evidence": "bg-warning-soft text-warning-foreground border-warning/40",
  "no-date": "bg-muted text-muted-foreground border-border",
};
const FLAG_ICON = { "over-budget": AlertTriangle, "projected-overrun": TrendingUp, overdue: CalendarX, "missing-evidence": FileWarning, "no-date": Circle } as const;

export function FlagChip({ flag }: { flag: FlagKind }) {
  const I = FLAG_ICON[flag];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium", FLAG_STYLE[flag])}>
      <I className="h-3 w-3" aria-hidden />{FLAG_LABEL[flag]}
    </span>
  );
}

export function Flags({ flags }: { flags: FlagKind[] }) {
  if (!flags.length) return null;
  return <span className="flex flex-wrap gap-1">{flags.map((f) => <FlagChip key={f} flag={f} />)}</span>;
}

const STATUS: Record<EventStatus, { cls: string; I: typeof Circle; label: string }> = {
  planned: { cls: "border-border bg-card text-foreground", I: Circle, label: "Planned" },
  done: { cls: "border-primary/30 bg-accent text-accent-foreground", I: CheckCircle2, label: "Done" },
  cancelled: { cls: "border-border bg-muted text-muted-foreground line-through", I: CircleSlash, label: "Cancelled" },
};
export function StatusChip({ status }: { status: EventStatus }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium", s.cls)}>
      <s.I className="h-3 w-3" aria-hidden />{s.label}
    </span>
  );
}
