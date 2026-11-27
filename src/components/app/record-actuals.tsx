import { isOneOff } from "@/lib/budget-tree";
import { useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Download, Eye, FileUp, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useYear } from "./active-year-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import {
  useAddAttachment,
  useBudgetData,
  useRemoveAttachment,
  useUpdateDelivery,
  useUpdateEvent,
  useWorkplan,
} from "@/data/hooks";
import { eventFigures, eventPlanned } from "@/lib/calc";
import { groupByRound, offerRoundDone, roundText } from "@/lib/deliveries";
import { durationLabel, kesToCents, todayISO } from "@/lib/format";
import type { BudgetEvent, BudgetLine, EventStatus } from "@/lib/types";
import { StatusChip } from "./chips";
import { Money, useFmt, Variance } from "./currency";

const schema = z.object({
  actualDate: z.string().min(1, "Date required"),
  quantity: z.coerce.number().min(0, "Must be ≥ 0"),
  unitCost: z.coerce.number().min(0, "Must be ≥ 0"),
  duration: z.coerce.number().min(0, "Must be ≥ 0"),
  location: z.string().optional(),
  notes: z.string().optional(),
});
type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.xlsx";
const OK_TYPES = /\.(pdf|jpe?g|png|xlsx)$/i;
const MAX = 10 * 1024 * 1024;
const NO_DELIVERY = "__none";
const unitWord = (u: string, n: number) =>
  u === "pax" ? (n === 1 ? "participant" : "participants") : u;

export function RecordActualsForm({ eventId, onDone }: { eventId: string; onDone?: () => void }) {
  const data = useBudgetData();
  const ev = data.events.find((e) => e.id === eventId);
  const line = ev ? data.lines.find((l) => l.id === ev.lineId) : undefined;
  if (!data.ready) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (!ev || !line) return <p className="p-4 text-sm">Event not found.</p>;
  return <Inner key={ev.id} ev={ev} line={line} onDone={onDone} />;
}

function Inner({ ev, line, onDone }: { ev: BudgetEvent; line: BudgetLine; onDone?: () => void }) {
  const data = useBudgetData();
  const { attachments } = data;
  const files = attachments.filter((a) => a.eventId === ev.id);
  const f = useFmt();
  const { canEdit, closed } = useYear();
  const update = useUpdateEvent();
  const addAtt = useAddAttachment();
  const rmAtt = useRemoveAttachment();
  const [pending, setPending] = useState<{ file: File; label: string }[]>([]);
  const [drag, setDrag] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deliveryId, setDeliveryId] = useState(ev.deliveryId ?? NO_DELIVERY);
  const wp = useWorkplan();
  const siteOf = (id?: string) => wp.data?.sites.find((x) => x.id === id)?.name;
  // A site activity's round already names the site; keep an old location visible.
  const showLocation =
    data.activities.find((a) => a.id === line.activityId)?.kind !== "site" || !!ev.location;
  const choices = groupByRound(
    data.deliveries.filter((x) => x.activityId === line.activityId),
    (id) => siteOf(id) ?? "",
  ).flatMap((g) => g.items);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"save" | "done" | "cancel" | "reopen" | null>(null);
  const updRound = useUpdateDelivery();
  const [offer, setOffer] = useState<{ id: string; name: string; date: string } | null>(null);
  const roundName = (id: string) => {
    const x = data.deliveries.find((d) => d.id === id);
    if (!x) return "";
    return `${roundText(x)}${x.siteId ? ` at ${siteOf(x.siteId) ?? "a site"}` : ""}`;
  };
  const inputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: {
      actualDate: ev.actualDate ?? todayISO(),
      quantity: ev.actualQuantity ?? line.quantity,
      unitCost: (ev.actualUnitCostCents ?? line.unitCostCents) / 100,
      duration: ev.actualDuration ?? line.duration,
      location: ev.location ?? "",
      notes: ev.notes ?? "",
    },
  });
  const w = useWatch({ control: form.control });
  const live = useMemo(() => {
    const q = Number(w.quantity) || 0,
      r = kesToCents(Number(w.unitCost) || 0),
      d = Number(w.duration) || 0;
    return eventFigures(line, {
      ...ev,
      status: "done",
      actualQuantity: q,
      actualUnitCostCents: r,
      actualDuration: d,
    });
  }, [w.quantity, w.unitCost, w.duration, line, ev]);

  const explain = (() => {
    const q = Number(w.quantity) || 0,
      d = Number(w.duration) || 0;
    const parts: string[] = [];
    const dq = line.quantity - q;
    if (dq)
      parts.push(
        `${Math.abs(dq)} ${dq > 0 ? "fewer" : "more"} ${unitWord(line.quantityUnit, Math.abs(dq))} than planned`,
      );
    const dd = line.duration - d;
    if (dd && !isOneOff(line.durationUnit))
      parts.push(
        `${Math.abs(dd)} ${dd > 0 ? "fewer" : "more"} ${line.durationUnit === "days" ? "day(s)" : line.durationUnit === "months" ? "month(s)" : line.durationUnit}`,
      );
    const dr = line.unitCostCents - kesToCents(Number(w.unitCost) || 0);
    if (dr) parts.push(`unit cost ${f.primary(Math.abs(dr))} ${dr > 0 ? "lower" : "higher"}`);
    if (!live.variance) return "Exactly on plan.";
    return `${f.primary(Math.abs(live.variance))} ${live.variance > 0 ? "saved" : "over"}${parts.length ? ": " + parts.join(", ") : ""}`;
  })();

  function addFiles(list: FileList | null) {
    if (!list || !canEdit) return;
    const next: { file: File; label: string }[] = [];
    for (const file of Array.from(list)) {
      if (!OK_TYPES.test(file.name)) {
        toast.error(`${file.name}: only PDF, JPG, PNG or XLSX`);
        continue;
      }
      if (file.size > MAX) {
        toast.error(`${file.name} is over 10 MB`);
        continue;
      }
      next.push({ file, label: "" });
    }
    setPending((p) => [...p, ...next]);
  }

  async function uploadPending() {
    if (!canEdit) return 0;
    for (const p of pending)
      await addAtt.mutateAsync({
        target: { eventId: ev.id },
        file: p.file,
        label: p.label || undefined,
      });
    const n = pending.length;
    setPending([]);
    return n;
  }

  async function run(which: NonNullable<typeof busy>, work: () => Promise<void>) {
    setBusy(which);
    try {
      await work();
    } finally {
      setBusy(null);
    }
  }

  async function save(status: EventStatus, extraNotes?: string) {
    const ok = status === "cancelled" ? true : await form.trigger();
    if (!ok) return;
    const v = schema.parse(form.getValues());
    try {
      const added = await uploadPending();
      await update.mutateAsync({
        id: ev.id,
        patch: {
          status,
          actualDate:
            status === "planned" && ev.status === "planned" ? ev.actualDate : v.actualDate,
          actualQuantity: v.quantity,
          actualUnitCostCents: kesToCents(v.unitCost),
          actualDuration: v.duration,
          location: v.location || undefined,
          deliveryId: deliveryId === NO_DELIVERY ? undefined : deliveryId,
          notes:
            extraNotes !== undefined
              ? [v.notes, `Cancelled: ${extraNotes}`].filter(Boolean).join("\n")
              : v.notes || undefined,
        },
      });
      if (status === "done" && files.length + added === 0)
        toast.warning(
          "Saved as done without evidence. Attach an attendance sheet or receipt when you can.",
        );
      else
        toast.success(
          status === "done" ? "Marked done" : status === "cancelled" ? "Event cancelled" : "Saved",
        );
      const round = data.deliveries.find((d) => d.id === deliveryId);
      if (round && offerRoundDone(status, round, v.actualDate)) {
        setOffer({ id: round.id, name: roundName(round.id), date: v.actualDate });
        return;
      }
      onDone?.();
    } catch {
      // The mutation hook already showed the error.
    }
  }

  async function markRoundDone() {
    if (!offer) return;
    try {
      await updRound.mutateAsync({
        id: offer.id,
        patch: { status: "completed", actualDate: offer.date },
      });
      toast.success(`${offer.name} marked done. Add proof it happened on the activity page.`);
      setOffer(null);
      onDone?.();
    } catch {
      // The mutation hook already showed the error.
    }
  }

  async function reopen() {
    try {
      await update.mutateAsync({ id: ev.id, patch: { status: "planned" } });
      toast.success("Event reopened");
    } catch {
      // The mutation hook already showed the error.
    }
  }

  const num = (name: "quantity" | "unitCost" | "duration", label: string, suffix: string) => (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={name}
          type="number"
          inputMode="decimal"
          step="any"
          className="tabular-nums"
          {...form.register(name)}
        />
        <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>
      </div>
      {form.formState.errors[name] && (
        <p className="text-xs text-destructive">{form.formState.errors[name]?.message}</p>
      )}
    </div>
  );

  return (
    <fieldset disabled={!canEdit} className="min-w-0 space-y-5 border-0 p-0">
      {closed && (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm">
          This year is closed. Actuals and evidence can be viewed but not changed.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={ev.status} />
        <span className="text-sm text-muted-foreground">
          Planned {ev.plannedDate ?? "— no date"}
        </span>
      </div>

      <section className="rounded-md border bg-muted/50 p-3">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Planned
        </h3>
        <p className="text-sm tabular-nums">
          {line.quantity} {line.quantityUnit} × {f.kes(line.unitCostCents)} ×{" "}
          {durationLabel(line.duration, line.durationUnit)} ={" "}
          <strong>{f.primary(eventPlanned(line))}</strong>
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Actual
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="actualDate">Actual date</Label>
            <Input id="actualDate" type="date" {...form.register("actualDate")} />
          </div>
          {num("quantity", "Quantity", line.quantityUnit)}
          {num("unitCost", "Unit cost", "KES")}
          {num("duration", "Duration", line.durationUnit)}
          {showLocation && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="location">Location</Label>
              <Input id="location" {...form.register("location")} />
            </div>
          )}
          <div className="space-y-1 sm:col-span-2">
            <Label>For round</Label>
            <Select value={deliveryId} onValueChange={setDeliveryId}>
              <SelectTrigger aria-label="For round">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DELIVERY}>Not tied to a round</SelectItem>
                {choices.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {roundText(x)}
                    {x.siteId ? ` at ${siteOf(x.siteId) ?? "a site"}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Optional. Only rounds of this line&apos;s activity are listed. Linking does not change
              any amounts.
            </p>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} {...form.register("notes")} />
          </div>
        </div>
      </section>

      <section className="rounded-md border p-3" aria-live="polite">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Fig label="Actual amount" cents={live.actual} />
          <Fig label="Variance" cents={live.variance} variance />
          <Fig label="Volume variance" cents={live.volumeVariance} variance />
          <Fig label="Rate variance" cents={live.rateVariance} variance />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{explain}</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Evidence
        </h3>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`flex w-full flex-col items-center gap-1 rounded-md border-2 border-dashed p-4 text-sm text-muted-foreground transition-colors ${drag ? "border-primary bg-accent" : "border-border"}`}
        >
          <FileUp className="h-5 w-5" aria-hidden />
          Drop files or tap to choose · PDF, JPG, PNG, XLSX up to 10 MB
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {pending.map((p, i) => (
          <div key={i} className="flex items-center gap-2 rounded border bg-muted/40 p-2">
            <span className="min-w-0 flex-1 truncate text-sm">{p.file.name}</span>
            <Input
              placeholder="Label, e.g. Signed attendance list"
              aria-label={`Label for ${p.file.name}`}
              value={p.label}
              className="h-8 w-40 sm:w-56"
              onChange={(e) =>
                setPending((all) =>
                  all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                )
              }
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Remove"
              onClick={() => setPending((all) => all.filter((_, j) => j !== i))}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {pending.length > 0 && (
          <p className="text-xs text-muted-foreground">New files upload when you save.</p>
        )}
        {files.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded border p-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{a.label ?? a.fileName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {a.fileName} · {Math.ceil(a.sizeBytes / 1024)} KB
              </p>
            </div>
            <Button asChild size="icon" variant="ghost" aria-label="Preview">
              <a href={a.fileUrl} target="_blank" rel="noreferrer">
                <Eye className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="icon" variant="ghost" aria-label="Download">
              <a href={a.fileUrl} download={a.fileName}>
                <Download className="h-4 w-4" />
              </a>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Remove file"
              onClick={() => rmAtt.mutate(a.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </section>

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
        {ev.status !== "planned" && (
          <Button
            variant="outline"
            loading={busy === "reopen"}
            disabled={!!busy}
            onClick={() => run("reopen", reopen)}
          >
            Reopen
          </Button>
        )}
        {ev.status !== "cancelled" && (
          <Button
            variant="outline"
            loading={busy === "cancel"}
            disabled={!!busy}
            onClick={() => {
              setReason("");
              setCancelOpen(true);
            }}
          >
            Mark cancelled
          </Button>
        )}
        <Button
          variant="secondary"
          loading={busy === "save"}
          disabled={!!busy}
          onClick={() => run("save", () => save(ev.status === "done" ? "done" : "planned"))}
        >
          Save without completing
        </Button>
        <Button
          loading={busy === "done"}
          disabled={!!busy}
          onClick={() => run("done", () => save("done"))}
        >
          Mark done
        </Button>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this event?</DialogTitle>
          </DialogHeader>
          <Label htmlFor="reason">Reason</Label>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim()}
              onClick={() => {
                setCancelOpen(false);
                void run("cancel", () => save("cancelled", reason.trim()));
              }}
            >
              Mark cancelled
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!offer}
        onOpenChange={(o) => {
          if (!o && !updRound.isPending) {
            setOffer(null);
            onDone?.();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {offer?.name} done too?</DialogTitle>
            <DialogDescription>
              This spending is for that round. It will be marked done with{" "}
              {offer ? format(parseISO(offer.date), "d MMM yyyy") : ""} as the date it took place.
              Proof and indicator results are still added on the activity page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={updRound.isPending}
              onClick={() => {
                setOffer(null);
                onDone?.();
              }}
            >
              Not now
            </Button>
            <Button loading={updRound.isPending} onClick={markRoundDone}>
              Mark round done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </fieldset>
  );
}

function Fig({ label, cents, variance }: { label: string; cents: number; variance?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      {variance ? <Variance cents={cents} /> : <Money cents={cents} />}
    </div>
  );
}
