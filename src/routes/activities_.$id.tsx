import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { useOnChange } from "@/hooks/use-on-change";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { lineSummary, sumSummaries } from "@/lib/calc";
import { LineEditor } from "@/components/app/line-editor";
import { Money } from "@/components/app/currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useBudgetData,
  useDeliveries,
  useAddIndicators,
  useAddResponsibles,
  useRemoveIndicator,
  useRemoveResponsible,
  useSetActivitySites,
  useStudyMembers,
  useUpdateActivity,
  useUpdateIndicator,
  useUpdateResponsible,
  useWorkplan,
} from "@/data/hooks";
import type { ActivityIndicator, ActivityResponsible, DeliveryResult } from "@/lib/types";
import { CLOSED_HINT, useYear } from "@/components/app/active-year-context";
import { useActiveStudy } from "@/components/app/active-study-context";
import {
  ActivityFields,
  ConfirmDelete,
  DeliveryStatusChip,
  KindChip,
} from "@/components/app/workplan-ui";
import { DeliveriesCard } from "@/components/app/delivery-ui";
import { activityChip, indicatorTotals } from "@/lib/deliveries";
import { SELECT_NONE } from "@/lib/select";
import {
  activityFormValid,
  multiAddMessage,
  parseMultiEntry,
  toFormValue,
  type ActivityFormValue,
} from "@/lib/workplan";

export const Route = createFileRoute("/activities_/$id")({
  head: () => ({
    meta: [
      { title: "Activity · Project Budget Tracker" },
      {
        name: "description",
        content: "Activity details, indicators, responsible people and sites.",
      },
      { property: "og:title", content: "Activity · Project Budget Tracker" },
      {
        property: "og:description",
        content: "Activity details, indicators, responsible people and sites.",
      },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const { id } = Route.useParams();
  const wp = useWorkplan();
  const dl = useDeliveries();
  const { canEdit, closed } = useYear();
  const d = wp.data;
  const activity = d?.activities.find((a) => a.id === id);
  const back = (
    <Link
      to="/activities"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Activities
    </Link>
  );
  if (wp.isError)
    return <p className="text-sm text-destructive">Could not load: {wp.error.message}</p>;
  if (!d || !dl.data) return null;
  if (!activity)
    return (
      <div className="space-y-2">
        {back}
        <p className="text-sm">
          This activity is not in the current year. It may have been deleted, or it belongs to
          another year. Use the year switcher to change year.
        </p>
      </div>
    );
  const indicators = d.indicators
    .filter((i) => i.activityId === id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const responsibles = d.responsibles
    .filter((r) => r.activityId === id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const siteIds = d.activitySites.filter((s) => s.activityId === id).map((s) => s.siteId);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {back}
      <header>
        <div className="flex flex-wrap items-center gap-2">
          {activity.code && (
            <span className="font-mono text-sm text-muted-foreground">{activity.code}</span>
          )}
          <KindChip kind={activity.kind} />
          <DeliveryStatusChip
            {...activityChip(dl.data.deliveries.filter((x) => x.activityId === id))}
          />
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{activity.title}</h1>
        {closed && <p className="mt-1 text-sm text-muted-foreground">{CLOSED_HINT}</p>}
      </header>

      <DetailsCard
        key={JSON.stringify(toFormValue(activity))}
        activityId={id}
        value={toFormValue(activity)}
        siteCount={siteIds.length}
        canEdit={canEdit}
      />
      <DeliveriesCard activity={activity} />
      <BudgetCard activityId={id} canEdit={canEdit} />
      <IndicatorsCard
        activityId={id}
        rows={indicators}
        canEdit={canEdit}
        results={dl.data.results}
        deliveryIds={dl.data.deliveries.filter((x) => x.activityId === id).map((x) => x.id)}
      />
      <ResponsibleCard activityId={id} rows={responsibles} canEdit={canEdit} />
      <SitesCard
        activityId={id}
        kind={activity.kind}
        selected={siteIds}
        sites={d.sites}
        canEdit={canEdit}
      />
    </div>
  );
}

function BudgetCard({ activityId, canEdit }: { activityId: string; canEdit: boolean }) {
  const d = useBudgetData();
  const [adding, setAdding] = useState(false);
  const lines = d.lines
    .filter((l) => l.activityId === activityId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const total = sumSummaries(lines.map((l) => lineSummary(l, d.events)));
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Budget</CardTitle>
          <CardDescription>
            {lines.length
              ? `${lines.length} line${lines.length === 1 ? "" : "s"}`
              : "No budget lines. This activity is unfunded."}
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!canEdit}
          title={canEdit ? undefined : CLOSED_HINT}
          onClick={() => setAdding(true)}
        >
          <Plus className="h-4 w-4" />
          Add line
        </Button>
      </CardHeader>
      {lines.length > 0 && (
        <CardContent className="space-y-1">
          <ul className="divide-y text-sm">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-1.5">
                <Link
                  to="/budget/lines/$id"
                  params={{ id: l.id }}
                  className="min-w-0 truncate text-primary hover:underline"
                >
                  {l.description}
                </Link>
                <Money cents={lineSummary(l, d.events).planned} />
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
            <span>Planned total</span>
            <Money cents={total.planned} size="md" />
          </div>
        </CardContent>
      )}
      <LineEditor open={adding} onOpenChange={setAdding} activityId={activityId} />
    </Card>
  );
}

function DetailsCard({
  activityId,
  value,
  siteCount,
  canEdit,
}: {
  activityId: string;
  value: ActivityFormValue;
  siteCount: number;
  canEdit: boolean;
}) {
  const upd = useUpdateActivity();
  const [v, setV] = useState(value);
  const [confirm, setConfirm] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  const save = () =>
    upd.mutate({ id: activityId, patch: v }, { onSuccess: () => toast.success("Activity saved") });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (v.kind === "general" && value.kind === "site" && siteCount > 0) setConfirm(true);
    else save();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <fieldset disabled={!canEdit} className="min-w-0 border-0 p-0">
            <ActivityFields value={v} onChange={setV} idPrefix="act" />
          </fieldset>
          {canEdit && (
            <Button
              type="submit"
              loading={upd.isPending}
              disabled={!dirty || !activityFormValid(v)}
            >
              Save details
            </Button>
          )}
        </form>
        <ConfirmDelete
          open={confirm}
          title="Make this a general activity?"
          description={`This removes its ${siteCount} chosen site(s). The sites themselves stay in the study.`}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            save();
          }}
        />
      </CardContent>
    </Card>
  );
}

function IndicatorsCard({
  activityId,
  rows,
  canEdit,
  results,
  deliveryIds,
}: {
  activityId: string;
  rows: ActivityIndicator[];
  canEdit: boolean;
  results: DeliveryResult[];
  deliveryIds: string[];
}) {
  const totals = new Map(
    indicatorTotals(
      rows,
      results.filter((r) => deliveryIds.includes(r.deliveryId)),
    ).map((t) => [t.indicator.id, t]),
  );
  const add = useAddIndicators();
  const upd = useUpdateIndicator();
  const rm = useRemoveIndicator();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const [en, setEn] = useState("");
  const [et, setEt] = useState("");
  const [del, setDel] = useState<ActivityIndicator | null>(null);
  const parsed = parseMultiEntry(
    name,
    rows.map((r) => r.name),
  );
  const multi = parsed.add.length + parsed.skipped.length > 1;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || add.isPending) return;
    add.mutate(
      {
        activityId,
        input: { text: name, target: multi || target === "" ? undefined : Number(target) },
      },
      {
        onSuccess: (res) => {
          setName("");
          setTarget("");
          toast.success(multiAddMessage("indicator", "indicators", res.added, res.skipped.length));
        },
      },
    );
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Indicators</CardTitle>
        <CardDescription>
          What to measure. Add several at once, separated by commas. A target is optional. Results
          are entered on each round and added up here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!rows.length && <p className="text-sm text-muted-foreground">No indicators yet.</p>}
        <ul className="divide-y rounded-md border text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              {edit === r.id ? (
                <>
                  <Input
                    aria-label="Indicator name"
                    className="min-w-40 flex-1"
                    value={en}
                    onChange={(e) => setEn(e.target.value)}
                  />
                  <Input
                    aria-label="Target"
                    type="number"
                    min={0}
                    step="any"
                    className="w-28"
                    placeholder="Target"
                    value={et}
                    onChange={(e) => setEt(e.target.value)}
                  />
                  <Button
                    size="sm"
                    loading={upd.isPending}
                    disabled={!en.trim()}
                    onClick={() =>
                      upd.mutate(
                        {
                          id: r.id,
                          patch: { name: en, target: et === "" ? null : Number(et) },
                        },
                        { onSuccess: () => setEdit(null) },
                      )
                    }
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="mr-auto min-w-0 wrap-break-word">{r.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {totals.get(r.id)?.recorded
                      ? `${totals.get(r.id)?.total} recorded${r.target === undefined ? "" : ` of ${r.target} (${totals.get(r.id)?.percent}%)`}`
                      : r.target === undefined
                        ? "No target"
                        : `Target ${r.target}`}
                  </span>
                  {canEdit && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label={`Edit ${r.name}`}
                        onClick={() => {
                          setEdit(r.id);
                          setEn(r.name);
                          setEt(r.target === undefined ? "" : String(r.target));
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label={`Delete ${r.name}`}
                        onClick={() => setDel(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <form onSubmit={submit} className="space-y-1">
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="New indicators"
                placeholder="Indicators, separated by commas"
                className="min-w-40 flex-1"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  const p = parseMultiEntry(e.target.value);
                  if (p.add.length + p.skipped.length > 1) setTarget("");
                }}
              />
              <Input
                aria-label="New indicator target"
                type="number"
                min={0}
                step="any"
                placeholder="Target"
                className="w-28"
                disabled={multi}
                value={multi ? "" : target}
                onChange={(e) => setTarget(e.target.value)}
              />
              <Button type="submit" loading={add.isPending} disabled={!parsed.add.length}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            {multi && (
              <p className="text-xs text-muted-foreground">
                Targets are set for one indicator at a time. Edit each one after adding.
              </p>
            )}
          </form>
        )}
        <ConfirmDelete
          open={!!del}
          title="Delete this indicator?"
          description={del ? `"${del.name}" will be removed from this activity.` : ""}
          onCancel={() => setDel(null)}
          onConfirm={() => {
            if (del) rm.mutate(del.id, { onSuccess: () => toast.success("Indicator deleted") });
            setDel(null);
          }}
        />
      </CardContent>
    </Card>
  );
}

function ResponsibleCard({
  activityId,
  rows,
  canEdit,
}: {
  activityId: string;
  rows: ActivityResponsible[];
  canEdit: boolean;
}) {
  const { study } = useActiveStudy();
  const members = useStudyMembers(study.id).data ?? [];
  const add = useAddResponsibles();
  const upd = useUpdateResponsible();
  const rm = useRemoveResponsible();
  const [name, setName] = useState("");
  const [userId, setUserId] = useState(SELECT_NONE);
  const emailOf = (uid?: string) => members.find((m) => m.userId === uid)?.email;
  const parsed = parseMultiEntry(
    name,
    rows.map((r) => r.name),
  );
  const multi = parsed.add.length + parsed.skipped.length > 1;
  const pick = (v: string) => {
    setUserId(v);
    const email = emailOf(v);
    if (email && !name.trim()) setName(email);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || add.isPending) return;
    add.mutate(
      {
        activityId,
        input: { text: name, userId: multi || userId === SELECT_NONE ? undefined : userId },
      },
      {
        onSuccess: (res) => {
          setName("");
          setUserId(SELECT_NONE);
          toast.success(multiAddMessage("person", "people", res.added, res.skipped.length));
        },
      },
    );
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Responsible people</CardTitle>
        <CardDescription>
          Type a name, or several separated by commas. Link one person to a study team account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!rows.length && <p className="text-sm text-muted-foreground">Nobody assigned yet.</p>}
        <ul className="divide-y rounded-md border text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="mr-auto min-w-0 wrap-break-word">
                {r.name}
                {r.userId && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    Linked to {emailOf(r.userId) ?? "a team member"}
                  </span>
                )}
              </span>
              {canEdit && r.userId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => upd.mutate({ id: r.id, patch: { userId: null } })}
                >
                  Unlink
                </Button>
              )}
              {canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label={`Remove ${r.name}`}
                  onClick={() =>
                    rm.mutate(r.id, { onSuccess: () => toast.success("Person removed") })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <form onSubmit={submit} className="space-y-1">
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="Names"
                placeholder="Names, separated by commas"
                className="min-w-40 flex-1"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  const p = parseMultiEntry(e.target.value);
                  if (p.add.length + p.skipped.length > 1) setUserId(SELECT_NONE);
                }}
              />
              <Select value={multi ? SELECT_NONE : userId} onValueChange={pick} disabled={multi}>
                <SelectTrigger aria-label="Link to a team member" className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE}>Not linked to an account</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" loading={add.isPending} disabled={!parsed.add.length}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            {multi && (
              <p className="text-xs text-muted-foreground">
                Linking to an account works for one name at a time.
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function SitesCard({
  activityId,
  kind,
  selected,
  sites,
  canEdit,
}: {
  activityId: string;
  kind: "general" | "site";
  selected: string[];
  sites: { id: string; name: string; archivedAt?: string }[];
  canEdit: boolean;
}) {
  const set = useSetActivitySites();
  const [pick, setPick] = useState<Set<string>>(new Set(selected));
  const key = selected.slice().sort().join(",");
  useOnChange(key, () => setPick(new Set(selected)));
  const list = useMemo(
    () =>
      sites
        .filter((s) => !s.archivedAt || selected.includes(s.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [sites, selected],
  );
  const dirty = [...pick].sort().join(",") !== key;
  if (kind === "general")
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sites</CardTitle>
          <CardDescription>
            This is a general activity, so it has no sites. Change its kind to Site above to choose
            where it runs.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sites</CardTitle>
        <CardDescription>Choose where this activity runs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!list.length && (
          <p className="text-sm text-muted-foreground">
            The study has no sites yet. A study admin adds them under Settings, Sites.
          </p>
        )}
        {list.length > 1 && (
          <div className="flex items-center gap-2 border-b pb-2 text-sm">
            <Checkbox
              id="site-all"
              disabled={!canEdit}
              checked={
                list.every((s) => pick.has(s.id))
                  ? true
                  : list.some((s) => pick.has(s.id))
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(c) => setPick(new Set(c === true ? list.map((s) => s.id) : []))}
            />
            <Label htmlFor="site-all" className="font-medium">
              Select all
            </Label>
          </div>
        )}
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`site-${s.id}`}
                disabled={!canEdit}
                checked={pick.has(s.id)}
                onCheckedChange={(c) =>
                  setPick((p) => {
                    const n = new Set(p);
                    if (c) n.add(s.id);
                    else n.delete(s.id);
                    return n;
                  })
                }
              />
              <Label htmlFor={`site-${s.id}`} className="font-normal">
                {s.name}
                {s.archivedAt && <span className="text-muted-foreground"> (archived)</span>}
              </Label>
            </li>
          ))}
        </ul>
        {canEdit && list.length > 0 && (
          <Button
            loading={set.isPending}
            disabled={!dirty}
            onClick={() =>
              set.mutate(
                { activityId, siteIds: [...pick] },
                { onSuccess: () => toast.success("Sites saved") },
              )
            }
          >
            Save sites
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
