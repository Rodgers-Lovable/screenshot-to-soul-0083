import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Download,
  Eye,
  FileUp,
  Link2,
  Paperclip,
  Plus,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddAttachment,
  useAddDelivery,
  useBudgetData,
  useGenerateDeliveries,
  useLinkEvents,
  useRemoveAttachment,
  useRemoveDelivery,
  useSetDeliveryResult,
  useUnlinkEvents,
  useUpdateDelivery,
  useWorkplan,
} from "@/data/hooks";
import {
  DELIVERY_STATUS_LABEL,
  DELIVERY_STATUSES,
  deliveryDeleteBlock,
  deliveryFlags,
  deliveryProgress,
  filterDeliveries,
  groupByRound,
  linkableEvents,
  nextRound,
  planRounds,
  roundText,
  validateDelivery,
  validateRounds,
  type DeliveryFilter,
} from "@/lib/deliveries";
import { frequencyText } from "@/lib/workplan";
import { todayISO } from "@/lib/format";
import type { Activity, BudgetEvent, Delivery, DeliveryStatus } from "@/lib/types";
import { CLOSED_HINT, useYear } from "./active-year-context";
import { Flags } from "./chips";
import { ConfirmDelete, DeliveryStatusChip } from "./workplan-ui";

const ALL = "__all";
const NONE = "__none";
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.xlsx";
const OK_TYPES = /\.(pdf|jpe?g|png|xlsx)$/i;
const MAX = 10 * 1024 * 1024;
const LONG_LIST = 8;

/** Everything the delivery screens read, with lookups. */
function useDeliveryContext(activity: Activity) {
  const d = useBudgetData();
  const wp = useWorkplan();
  const sites = wp.data?.sites ?? [];
  const siteName = (id?: string) => sites.find((s) => s.id === id)?.name ?? "";
  const mine = useMemo(
    () => d.deliveries.filter((x) => x.activityId === activity.id),
    [d.deliveries, activity.id],
  );
  const proofCount = (id: string) => d.attachments.filter((a) => a.deliveryId === id).length;
  const linked = (id: string) => d.events.filter((e) => e.deliveryId === id);
  const selected = (wp.data?.activitySites ?? [])
    .filter((s) => s.activityId === activity.id)
    .map((s) => ({ id: s.siteId, archived: !!sites.find((x) => x.id === s.siteId)?.archivedAt }));
  return { d, wp, sites, siteName, mine, proofCount, linked, selected };
}

export function DeliveriesCard({ activity }: { activity: Activity }) {
  const { canEdit } = useYear();
  const ctx = useDeliveryContext(activity);
  const { d, siteName, mine, proofCount, linked } = ctx;
  const [filter, setFilter] = useState<DeliveryFilter>({});
  const [open, setOpen] = useState<string | null>(null);
  const [gen, setGen] = useState(false);
  const [adding, setAdding] = useState(false);
  const today = todayISO();
  const shown = filterDeliveries(mine, filter);
  const groups = groupByRound(shown, siteName);
  const progress = deliveryProgress(mine);
  const long = mine.length > LONG_LIST;
  const lock = canEdit ? undefined : CLOSED_HINT;
  const siteIdsUsed = [...new Set(mine.map((x) => x.siteId).filter((x): x is string => !!x))];

  const row = (x: Delivery, title: string) => {
    const proof = proofCount(x.id);
    const spend = linked(x.id).length;
    return (
      <li key={x.id}>
        <button
          type="button"
          onClick={() => setOpen(x.id)}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-muted/40"
        >
          <span className="min-w-0 flex-1 basis-40 break-words font-medium">{title}</span>
          <DeliveryStatusChip status={x.status} />
          <span className="text-xs text-muted-foreground tabular-nums">
            {x.status === "completed"
              ? `Done ${x.actualDate ?? ""}`
              : x.plannedDate
                ? `Planned ${x.plannedDate}`
                : "No date"}
          </span>
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            title={`${proof} proof file${proof === 1 ? "" : "s"}`}
          >
            <Paperclip className="h-3 w-3" aria-hidden />
            {proof}
            <span className="sr-only">proof files</span>
          </span>
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            title={`${spend} linked spending record${spend === 1 ? "" : "s"}`}
          >
            <Link2 className="h-3 w-3" aria-hidden />
            {spend}
            <span className="sr-only">linked spending records</span>
          </span>
          <Flags flags={deliveryFlags(x, proof, today)} />
        </button>
      </li>
    );
  };
  return (
    <Card data-tour="deliveries">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Rounds</CardTitle>
          <CardDescription>
            {mine.length
              ? `${progress.completed} of ${progress.total} done`
              : activity.kind === "site"
                ? "Each round runs at every chosen site. Create the rounds to start tracking."
                : "Create the rounds to start tracking."}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!canEdit}
            title={lock}
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" />
            Add one
          </Button>
          <Button size="sm" disabled={!canEdit} title={lock} onClick={() => setGen(true)}>
            <Plus className="h-4 w-4" />
            Create rounds
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {long && (
          <div className="flex flex-wrap gap-2">
            {activity.kind === "site" && (
              <Select
                value={filter.siteId ?? ALL}
                onValueChange={(v) =>
                  setFilter((f) => ({ ...f, siteId: v === ALL ? undefined : v }))
                }
              >
                <SelectTrigger aria-label="Filter by site" className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All sites</SelectItem>
                  {siteIdsUsed.map((id) => (
                    <SelectItem key={id} value={id}>
                      {siteName(id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={filter.status ?? ALL}
              onValueChange={(v) =>
                setFilter((f) => ({ ...f, status: v === ALL ? undefined : (v as DeliveryStatus) }))
              }
            >
              <SelectTrigger aria-label="Filter by status" className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {DELIVERY_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {DELIVERY_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {!mine.length && <p className="text-sm text-muted-foreground">No rounds yet.</p>}
        {!!mine.length && !shown.length && (
          <p className="text-sm text-muted-foreground">No rounds match these filters.</p>
        )}
        {activity.kind === "general" && shown.length > 0 && (
          <ul className="divide-y rounded-md border text-sm">
            {groups.flatMap((g) => g.items).map((x) => row(x, roundText(x)))}
          </ul>
        )}
        {activity.kind === "site" &&
          groups.map((g) => (
            <section key={g.roundNumber} aria-label={`Round ${g.roundNumber}`}>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Round {g.roundNumber}
                {g.label ? `: ${g.label}` : ""}
              </h3>
              <ul className="divide-y rounded-md border text-sm">
                {g.items.map((x) => row(x, x.siteId ? siteName(x.siteId) : "No site"))}
              </ul>
            </section>
          ))}
      </CardContent>
      <GenerateDialog open={gen} onClose={() => setGen(false)} activity={activity} />
      <AddDeliveryDialog open={adding} onClose={() => setAdding(false)} activity={activity} />
      {open && (
        <DeliveryDialog
          key={open}
          deliveryId={open}
          activity={activity}
          onClose={() => setOpen(null)}
        />
      )}
    </Card>
  );
}

function GenerateDialog({
  open,
  onClose,
  activity,
}: {
  open: boolean;
  onClose: () => void;
  activity: Activity;
}) {
  const { year } = useYear();
  const { mine, selected } = useDeliveryContext(activity);
  const gen = useGenerateDeliveries();
  const [rounds, setRounds] = useState("1");
  const [first, setFirst] = useState("");
  const [useRule, setUseRule] = useState(true);
  const rule =
    activity.repeatEvery && activity.repeatUnit
      ? { every: activity.repeatEvery, unit: activity.repeatUnit }
      : null;
  const n = Number(rounds);
  const activeSites = selected.filter((s) => !s.archived).length;
  const bad = validateRounds(n, activity.kind, activeSites);
  const plan = planRounds({
    kind: activity.kind,
    rounds: bad ? 0 : n,
    sites: selected,
    existing: mine,
    firstDate: first || undefined,
    repeat: useRule ? rule : null,
    year,
  });
  const perRound = activity.kind === "site" ? activeSites : 1;
  const submit = () =>
    gen.mutate(
      {
        activityId: activity.id,
        input: { rounds: n, firstDate: first || undefined, repeat: useRule ? rule : null },
      },
      {
        onSuccess: (r) => {
          toast.success(
            r.created
              ? `${r.created} added${r.existing ? `, ${r.existing} already existed` : ""}`
              : "Nothing new to create. Every round already exists.",
          );
          onClose();
        },
      },
    );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create rounds</DialogTitle>
          <DialogDescription>
            {activity.kind === "site"
              ? "Each round is added at every chosen site."
              : "Adds the rounds in order."}{" "}
            Rounds that already exist are left alone, so you can run this again to add more.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="gen-rounds">Number of rounds</Label>
            <Input
              id="gen-rounds"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={rounds}
              onChange={(e) => setRounds(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gen-first">First date (optional)</Label>
            <Input
              id="gen-first"
              type="date"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
            />
          </div>
        </div>
        {rule && (
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="gen-rule"
              checked={useRule}
              onCheckedChange={(c) => setUseRule(c === true)}
            />
            <Label htmlFor="gen-rule" className="font-normal">
              Space rounds by this activity&apos;s repeat rule (
              {frequencyText("", rule.every, rule.unit).toLowerCase()})
            </Label>
          </div>
        )}
        {!rule && first && n > 1 && (
          <p className="text-xs text-muted-foreground">
            This activity has no repeat rule, so only round 1 gets the date. Set the others later.
          </p>
        )}
        <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm" aria-live="polite">
          {bad ? (
            <p>{bad}</p>
          ) : (
            <>
              <p className="font-medium">
                {perRound > 1
                  ? `${plan.create.length} will be created: ${n} round${n === 1 ? "" : "s"} at ${perRound} sites.`
                  : `${plan.create.length} round${plan.create.length === 1 ? "" : "s"} will be created.`}
              </p>
              {plan.existing > 0 && (
                <p className="text-muted-foreground">
                  {plan.existing} already exist and will be left as they are.
                </p>
              )}
            </>
          )}
          {plan.archivedSites > 0 && (
            <p className="text-muted-foreground">
              {plan.archivedSites} chosen site{plan.archivedSites === 1 ? " is" : "s are"} archived
              and skipped.
            </p>
          )}
        </div>
        {plan.outsideYear > 0 && (
          <p className="flex items-center gap-1.5 text-sm text-warning-foreground">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {plan.outsideYear} date{plan.outsideYear === 1 ? "" : "s"} fall outside this year. You
            can still create them.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={gen.isPending} disabled={!!bad || !plan.create.length}>
            Create {plan.create.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddDeliveryDialog({
  open,
  onClose,
  activity,
}: {
  open: boolean;
  onClose: () => void;
  activity: Activity;
}) {
  const { mine, selected, siteName } = useDeliveryContext(activity);
  const add = useAddDelivery();
  const [site, setSite] = useState("");
  const [round, setRound] = useState("");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const active = selected.filter((s) => !s.archived);
  const siteId = activity.kind === "site" ? site || undefined : undefined;
  const suggested = nextRound(mine, siteId);
  const needsSite = activity.kind === "site" && !siteId;
  const reset = () => {
    setSite("");
    setRound("");
    setLabel("");
    setDate("");
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a round</DialogTitle>
          <DialogDescription>
            For one-off or ad hoc work. Use Create rounds for a regular schedule.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {activity.kind === "site" && (
            <div className="space-y-1 sm:col-span-2">
              <Label>Site</Label>
              <Select value={site || NONE} onValueChange={(v) => setSite(v === NONE ? "" : v)}>
                <SelectTrigger aria-label="Site">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Choose a site</SelectItem>
                  {active.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {siteName(s.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="add-round">Round</Label>
            <Input
              id="add-round"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder={String(suggested)}
              value={round}
              onChange={(e) => setRound(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-date">Planned date (optional)</Label>
            <Input
              id="add-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="add-label">Label (optional)</Label>
            <Input
              id="add-label"
              placeholder="For example, Baseline"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={add.isPending}
            disabled={needsSite}
            onClick={() =>
              add.mutate(
                {
                  activityId: activity.id,
                  input: {
                    siteId,
                    roundNumber: round ? Number(round) : undefined,
                    roundLabel: label,
                    plannedDate: date || undefined,
                  },
                },
                {
                  onSuccess: () => {
                    toast.success("Round added");
                    reset();
                    onClose();
                  },
                },
              )
            }
          >
            Add round
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryDialog({
  deliveryId,
  activity,
  onClose,
}: {
  deliveryId: string;
  activity: Activity;
  onClose: () => void;
}) {
  const ctx = useDeliveryContext(activity);
  const x = ctx.d.deliveries.find((y) => y.id === deliveryId);
  if (!x) return null;
  return <Editor x={x} activity={activity} ctx={ctx} onClose={onClose} />;
}

function Editor({
  x,
  activity,
  ctx,
  onClose,
}: {
  x: Delivery;
  activity: Activity;
  ctx: ReturnType<typeof useDeliveryContext>;
  onClose: () => void;
}) {
  const { canEdit, closed } = useYear();
  const { d, wp, siteName, proofCount, linked } = ctx;
  const indicators = (wp.data?.indicators ?? [])
    .filter((i) => i.activityId === activity.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const resultOf = (id: string) =>
    d.results.find((r) => r.deliveryId === x.id && r.indicatorId === id);
  const files = d.attachments.filter((a) => a.deliveryId === x.id);
  const links = linked(x.id);
  const upd = useUpdateDelivery();
  const setResult = useSetDeliveryResult();
  const addAtt = useAddAttachment();
  const rmAtt = useRemoveAttachment();
  const rm = useRemoveDelivery();
  const link = useLinkEvents();
  const unlink = useUnlinkEvents();
  const [status, setStatus] = useState<DeliveryStatus>(x.status);
  const [planned, setPlanned] = useState(x.plannedDate ?? "");
  const [actual, setActual] = useState(x.actualDate ?? "");
  const [notes, setNotes] = useState(x.notes);
  const [label, setLabel] = useState(x.roundLabel);
  const [vals, setVals] = useState<Record<string, { v: string; n: string }>>(() =>
    Object.fromEntries(
      indicators.map((i) => [
        i.id,
        { v: resultOf(i.id) ? String(resultOf(i.id)?.value) : "", n: resultOf(i.id)?.notes ?? "" },
      ]),
    ),
  );
  const [pending, setPending] = useState<{ file: File; label: string }[]>([]);
  const [pickLink, setPickLink] = useState(NONE);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const proofWord = activity.meansOfVerification.trim();
  const problem = validateDelivery({
    status,
    plannedDate: planned || undefined,
    actualDate: actual || undefined,
  });
  const options = linkableEvents(activity.id, d.lines, d.events);
  const lineName = (e: BudgetEvent) => d.lines.find((l) => l.id === e.lineId)?.description ?? "";
  const deleteBlock = deliveryDeleteBlock({
    linkedSpending: links.length,
    proofFiles: files.length,
  });
  const dirtyResults = indicators.some((i) => {
    const cur = resultOf(i.id);
    const v = vals[i.id] ?? { v: "", n: "" };
    return v.v !== (cur ? String(cur.value) : "") || (cur ? v.n !== cur.notes : false);
  });

  const pickStatus = (s: DeliveryStatus) => {
    setStatus(s);
    if (s === "completed" && !actual) setActual(todayISO());
  };
  const addFiles = (list: FileList | null) => {
    if (!list || !canEdit) return;
    const next: { file: File; label: string }[] = [];
    for (const file of Array.from(list)) {
      if (!OK_TYPES.test(file.name)) toast.error(`${file.name}: only PDF, JPG, PNG or XLSX`);
      else if (file.size > MAX) toast.error(`${file.name} is over 10 MB`);
      else next.push({ file, label: "" });
    }
    setPending((p) => [...p, ...next]);
  };

  async function save() {
    if (problem) return;
    setSaving(true);
    try {
      await upd.mutateAsync({
        id: x.id,
        patch: {
          status,
          plannedDate: planned || undefined,
          actualDate: actual || undefined,
          notes,
          roundLabel: label,
        },
      });
      for (const i of indicators) {
        const v = vals[i.id] ?? { v: "", n: "" };
        const cur = resultOf(i.id);
        if (v.v === (cur ? String(cur.value) : "") && v.n === (cur?.notes ?? "")) continue;
        await setResult.mutateAsync({
          deliveryId: x.id,
          indicatorId: i.id,
          value: v.v.trim() === "" ? null : Number(v.v),
          notes: v.n,
        });
      }
      for (const p of pending)
        await addAtt.mutateAsync({
          target: { deliveryId: x.id },
          file: p.file,
          label: p.label || undefined,
        });
      if (status === "completed" && files.length + pending.length === 0)
        toast.warning("Saved as done without proof. Add proof it happened when you can.");
      else toast.success("Round saved");
      onClose();
    } catch {
      // The mutation hooks already showed the error.
    } finally {
      setSaving(false);
    }
  }

  const heading = `${roundText(x)}${x.siteId ? ` at ${siteName(x.siteId)}` : ""}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>{activity.title}</DialogDescription>
        </DialogHeader>
        <fieldset disabled={!canEdit} className="min-w-0 space-y-5 border-0 p-0">
          {closed && (
            <p className="rounded-md border bg-muted px-3 py-2 text-sm">
              This year is closed. This round can be viewed but not changed.
            </p>
          )}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => pickStatus(v as DeliveryStatus)}>
                <SelectTrigger aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELIVERY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {DELIVERY_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dl-label">Round label</Label>
              <Input id="dl-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dl-planned">Planned date</Label>
              <Input
                id="dl-planned"
                type="date"
                value={planned}
                onChange={(e) => setPlanned(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dl-actual">
                Date it took place{status === "completed" ? " (required)" : ""}
              </Label>
              <Input
                id="dl-actual"
                type="date"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="dl-notes">Notes</Label>
              <Textarea
                id="dl-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {problem && status === "completed" && (
              <p className="text-sm text-destructive sm:col-span-2">{problem}</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Proof it happened
            </h3>
            <p className="text-sm text-muted-foreground">
              {proofWord
                ? `Means of verification: ${proofWord}`
                : "No means of verification is set on this activity."}{" "}
              Upload the file that shows this took place.
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-1 rounded-md border-2 border-dashed p-4 text-sm text-muted-foreground disabled:opacity-50"
              disabled={!canEdit}
            >
              <FileUp className="h-5 w-5" aria-hidden />
              Tap to choose files · PDF, JPG, PNG, XLSX up to 10 MB
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
                  placeholder={proofWord || "Label"}
                  aria-label={`Label for ${p.file.name}`}
                  value={p.label}
                  className="h-8 w-36 sm:w-56"
                  onChange={(e) =>
                    setPending((all) =>
                      all.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)),
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

          {indicators.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Indicator results
              </h3>
              <ul className="space-y-2">
                {indicators.map((i) => (
                  <li key={i.id} className="grid gap-2 sm:grid-cols-[1fr_8rem_1fr] sm:items-center">
                    <span className="text-sm">
                      {i.name}
                      {i.target !== undefined && (
                        <span className="text-muted-foreground"> (target {i.target})</span>
                      )}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      aria-label={`Result for ${i.name}`}
                      placeholder="Result"
                      value={vals[i.id]?.v ?? ""}
                      onChange={(e) =>
                        setVals((s) => ({
                          ...s,
                          [i.id]: { v: e.target.value, n: s[i.id]?.n ?? "" },
                        }))
                      }
                    />
                    <Input
                      aria-label={`Note for ${i.name}`}
                      placeholder="Note (optional)"
                      value={vals[i.id]?.n ?? ""}
                      onChange={(e) =>
                        setVals((s) => ({
                          ...s,
                          [i.id]: { v: s[i.id]?.v ?? "", n: e.target.value },
                        }))
                      }
                    />
                  </li>
                ))}
              </ul>
              {dirtyResults && (
                <p className="text-xs text-muted-foreground">Results save with the round.</p>
              )}
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Linked spending
            </h3>
            <p className="text-sm text-muted-foreground">
              Spending records from this activity&apos;s budget lines. Delivery and spending are
              tracked separately, so linking is optional.
            </p>
            {!links.length && <p className="text-sm text-muted-foreground">Nothing linked.</p>}
            {links.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded border p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{e.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{lineName(e)}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    unlink.mutate([e.id], { onSuccess: () => toast.success("Unlinked") })
                  }
                >
                  <Unlink className="h-4 w-4" />
                  Unlink
                </Button>
              </div>
            ))}
            {options.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Select value={pickLink} onValueChange={setPickLink}>
                  <SelectTrigger
                    aria-label="Spending record to link"
                    className="min-w-0 flex-1 basis-56"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Choose a spending record</SelectItem>
                    {options.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  loading={link.isPending}
                  disabled={pickLink === NONE}
                  onClick={() =>
                    link.mutate(
                      { deliveryId: x.id, eventIds: [pickLink] },
                      {
                        onSuccess: () => {
                          setPickLink(NONE);
                          toast.success("Linked");
                        },
                      },
                    )
                  }
                >
                  <Link2 className="h-4 w-4" />
                  Link
                </Button>
              </div>
            )}
            {!options.length && !links.length && (
              <p className="text-xs text-muted-foreground">
                No unlinked spending records on this activity&apos;s budget lines.
              </p>
            )}
          </section>
        </fieldset>
        <DialogFooter className="gap-2 sm:justify-between">
          {canEdit ? (
            <Button
              variant="outline"
              className="text-destructive"
              title={deleteBlock ?? undefined}
              onClick={() => setConfirm(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete round
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {canEdit && (
              <Button onClick={save} loading={saving} disabled={!!problem}>
                Save
              </Button>
            )}
          </div>
        </DialogFooter>
        <ConfirmDelete
          open={confirm}
          title="Delete this round?"
          description={
            deleteBlock ??
            "Use this when the round will no longer happen. Its indicator results are removed too, and the deletion is recorded in the audit log."
          }
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            rm.mutate(x.id, {
              onSuccess: () => {
                toast.success("Round deleted");
                onClose();
              },
            });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
