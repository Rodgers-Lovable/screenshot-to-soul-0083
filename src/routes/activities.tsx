import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useAddActivity,
  useAddObjective,
  useAddOutcome,
  useMoveActivity,
  useMoveObjective,
  useMoveOutcome,
  useRemoveActivity,
  useRemoveObjective,
  useRemoveOutcome,
  useDeliveries,
  useUpdateObjective,
  useUpdateOutcome,
  useWorkplan,
} from "@/data/hooks";
import type { Activity, ActivityKind, DeliveryStatus, Objective, Outcome } from "@/lib/types";
import {
  activityStatus,
  byActivity,
  DELIVERY_STATUS_LABEL,
  DELIVERY_STATUSES,
  deliveryProgress,
  filterTreeByStatus,
  progressText,
} from "@/lib/deliveries";
import { buildTree, duplicateCodes, filterTree, frequencyText, isDuplicate } from "@/lib/workplan";
import { PageHeader } from "@/components/app/shell";
import { CLOSED_HINT, useYear } from "@/components/app/active-year-context";
import {
  ActivityDialog,
  CodeTitleDialog,
  ConfirmDelete,
  DuplicateCodeWarning,
  DeliveryStatusChip,
  KindChip,
} from "@/components/app/workplan-ui";

export const Route = createFileRoute("/activities")({
  head: () => ({
    meta: [
      { title: "Activities · Project Budget Tracker" },
      {
        name: "description",
        content: "The yearly workplan: objectives, outcomes and the activities under them.",
      },
      { property: "og:title", content: "Activities · Project Budget Tracker" },
      {
        property: "og:description",
        content: "The yearly workplan: objectives, outcomes and the activities under them.",
      },
    ],
  }),
  component: ActivitiesPage,
});

type Dlg =
  | { t: "objective"; edit?: Objective }
  | { t: "outcome"; objective: Objective; edit?: Outcome }
  | { t: "activity"; outcome: Outcome }
  | { t: "del-objective"; item: Objective }
  | { t: "del-outcome"; item: Outcome }
  | { t: "del-activity"; item: Activity }
  | null;

function ActivitiesPage() {
  const wp = useWorkplan();
  const { year, canEdit, closed } = useYear();
  const dl = useDeliveries();
  const [kind, setKind] = useState<ActivityKind | "all">("all");
  const [status, setStatus] = useState<DeliveryStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [dlg, setDlg] = useState<Dlg>(null);

  const addObjective = useAddObjective();
  const updObjective = useUpdateObjective();
  const rmObjective = useRemoveObjective();
  const mvObjective = useMoveObjective();
  const addOutcome = useAddOutcome();
  const updOutcome = useUpdateOutcome();
  const rmOutcome = useRemoveOutcome();
  const mvOutcome = useMoveOutcome();
  const addActivity = useAddActivity();
  const rmActivity = useRemoveActivity();
  const mvActivity = useMoveActivity();

  const d = wp.data;
  const tree = useMemo(() => (d ? buildTree(d.objectives, d.outcomes, d.activities) : []), [d]);
  const deliveriesBy = useMemo(() => byActivity(dl.data?.deliveries ?? []), [dl.data]);
  const statusOf = (id: string) => activityStatus(deliveriesBy.get(id) ?? []);
  const shown = useMemo(
    () =>
      filterTreeByStatus(filterTree(tree, { kind, search }), status, (id) =>
        activityStatus(deliveriesBy.get(id) ?? []),
      ),
    [tree, kind, search, status, deliveriesBy],
  );
  const siteName = useMemo(() => new Map((d?.sites ?? []).map((s) => [s.id, s.name])), [d]);
  const sitesOf = (a: Activity) =>
    (d?.activitySites ?? [])
      .filter((s) => s.activityId === a.id)
      .map((s) => siteName.get(s.siteId) ?? "")
      .filter(Boolean);
  const peopleOf = (a: Activity) =>
    (d?.responsibles ?? []).filter((r) => r.activityId === a.id).map((r) => r.name);

  if (wp.isError)
    return (
      <p className="text-sm text-destructive">Could not load the workplan: {wp.error.message}</p>
    );
  if (!d || !dl.data) return null;

  const filtering = kind !== "all" || status !== "all" || search.trim() !== "";
  const done = (msg: string) => ({
    onSuccess: () => {
      toast.success(msg);
      setDlg(null);
    },
  });
  const objDups = duplicateCodes(d.objectives);
  const counts = `${d.objectives.length} objective(s) · ${d.activities.length} activity(ies)`;
  const lock = closed ? CLOSED_HINT : undefined;

  const delText = (dd: NonNullable<Dlg>) => {
    if (dd.t === "del-objective") {
      const outs = d.outcomes.filter((o) => o.objectiveId === dd.item.id);
      const acts = d.activities.filter((a) => outs.some((o) => o.id === a.outcomeId));
      return `This deletes "${dd.item.title}" with its ${outs.length} outcome(s) and ${acts.length} activity(ies), including their indicators, responsible people and sites. Anything with rounds cannot be deleted until its rounds are.`;
    }
    if (dd.t === "del-outcome") {
      const acts = d.activities.filter((a) => a.outcomeId === dd.item.id);
      return `This deletes "${dd.item.title}" with its ${acts.length} activity(ies), including their indicators, responsible people and sites.`;
    }
    if (dd.t === "del-activity")
      return `This deletes "${dd.item.title}" with its indicators, responsible people and site choices.`;
    return "";
  };

  return (
    <div>
      <PageHeader title="Activities" sub={year ? `${year.name} · ${counts}` : undefined}>
        <Button
          variant="outline"
          disabled={!canEdit}
          title={lock}
          onClick={() => setDlg({ t: "objective" })}
        >
          <Plus className="h-4 w-4" />
          Add objective
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search activities"
            placeholder="Search activities"
            className="w-full pl-8 sm:w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={kind}
          onValueChange={(v) => v && setKind(v as ActivityKind | "all")}
          aria-label="Filter by kind"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="general">General</ToggleGroupItem>
          <ToggleGroupItem value="site">Site</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={status}
          onValueChange={(v) => v && setStatus(v as DeliveryStatus | "all")}
          aria-label="Filter by status"
          className="flex-wrap"
        >
          <ToggleGroupItem value="all">Any status</ToggleGroupItem>
          {DELIVERY_STATUSES.map((st) => (
            <ToggleGroupItem key={st} value={st}>
              {DELIVERY_STATUS_LABEL[st]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {!d.objectives.length && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-12 text-center">
          <ListChecks className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">
            {year ? "No workplan for this year yet" : "No year to plan in yet"}
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {!year
              ? "A study admin needs to create a year first."
              : canEdit
                ? "Start with an objective, then add outcomes and the activities under them. You can also start a new year from last year's workplan under Settings, Years."
                : "Nothing was planned in this year."}
          </p>
          {canEdit && (
            <Button onClick={() => setDlg({ t: "objective" })}>
              <Plus className="h-4 w-4" />
              Add the first objective
            </Button>
          )}
        </div>
      )}
      {!!d.objectives.length && filtering && !shown.length && (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No activities match. Clear the search or choose All.
        </p>
      )}

      <div className="space-y-4" data-tour="activities-tree">
        {shown.map(({ objective, outcomes }) => {
          const outDups = duplicateCodes(d.outcomes.filter((o) => o.objectiveId === objective.id));
          return (
            <Collapsible key={objective.id} defaultOpen className="rounded-lg border bg-card">
              <div className="flex items-start gap-2 border-b px-3 py-2.5 sm:px-4">
                <CollapsibleTrigger
                  className="group flex min-w-0 flex-1 items-start gap-2 text-left"
                  aria-label={`Objective ${objective.code} ${objective.title}`}
                >
                  <ChevronDown className="mt-1 h-4 w-4 shrink-0 transition-transform group-data-[state=closed]:-rotate-90" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Objective {objective.code}
                      {isDuplicate(objDups, objective.code) && <DuplicateCodeWarning />}
                    </span>
                    <span className="block font-semibold">{objective.title}</span>
                  </span>
                </CollapsibleTrigger>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canEdit}
                  title={lock}
                  onClick={() => setDlg({ t: "outcome", objective })}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Outcome</span>
                  <span className="sr-only sm:hidden">Add outcome</span>
                </Button>
                <RowMenu
                  label="Objective actions"
                  disabled={!canEdit}
                  onUp={() => mvObjective.mutate({ id: objective.id, dir: "up" })}
                  onDown={() => mvObjective.mutate({ id: objective.id, dir: "down" })}
                  onEdit={() => setDlg({ t: "objective", edit: objective })}
                  onDelete={() => setDlg({ t: "del-objective", item: objective })}
                  hideMoves={filtering}
                />
              </div>
              <CollapsibleContent>
                {!outcomes.length && (
                  <p className="px-4 py-4 text-sm text-muted-foreground">No outcomes yet.</p>
                )}
                {outcomes.map(({ outcome, activities }) => {
                  const actDups = duplicateCodes(
                    d.activities.filter((a) => a.outcomeId === outcome.id),
                  );
                  return (
                    <section key={outcome.id} className="border-b last:border-b-0">
                      <div className="flex items-start gap-2 bg-muted/40 px-3 py-2 sm:px-4">
                        <div className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Outcome {outcome.code}
                            {isDuplicate(outDups, outcome.code) && <DuplicateCodeWarning />}
                          </span>
                          <span className="block text-sm font-medium">{outcome.title}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canEdit}
                          title={lock}
                          onClick={() => setDlg({ t: "activity", outcome })}
                        >
                          <Plus className="h-4 w-4" />
                          <span className="hidden sm:inline">Activity</span>
                          <span className="sr-only sm:hidden">Add activity</span>
                        </Button>
                        <RowMenu
                          label="Outcome actions"
                          disabled={!canEdit}
                          onUp={() => mvOutcome.mutate({ id: outcome.id, dir: "up" })}
                          onDown={() => mvOutcome.mutate({ id: outcome.id, dir: "down" })}
                          onEdit={() =>
                            setDlg({
                              t: "outcome",
                              objective,
                              edit: outcome,
                            })
                          }
                          onDelete={() => setDlg({ t: "del-outcome", item: outcome })}
                          hideMoves={filtering}
                        />
                      </div>
                      {!activities.length && (
                        <p className="px-4 py-3 text-sm text-muted-foreground">
                          {filtering ? "No matching activities." : "No activities yet."}
                        </p>
                      )}
                      <ul className="divide-y">
                        {activities.map((a) => {
                          const sites = sitesOf(a);
                          const people = peopleOf(a);
                          const freq = frequencyText(a.frequencyLabel, a.repeatEvery, a.repeatUnit);
                          return (
                            <li key={a.id} className="px-3 py-2.5 sm:px-4">
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    {a.code && (
                                      <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                                        {a.code}
                                        {isDuplicate(actDups, a.code) && <DuplicateCodeWarning />}
                                      </span>
                                    )}
                                    <Link
                                      to="/activities/$id"
                                      params={{ id: a.id }}
                                      className="text-sm font-medium text-primary hover:underline"
                                    >
                                      {a.title}
                                    </Link>
                                    <KindChip kind={a.kind} />
                                    <DeliveryStatusChip
                                      status={statusOf(a.id)}
                                      progress={progressText(
                                        deliveryProgress(deliveriesBy.get(a.id) ?? []),
                                      )}
                                    />
                                  </div>
                                  <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
                                    {a.kind === "site" && (
                                      <Meta
                                        label="Sites"
                                        value={
                                          sites.length
                                            ? sites.length > 3
                                              ? `${sites.slice(0, 3).join(", ")} and ${sites.length - 3} more`
                                              : sites.join(", ")
                                            : "None chosen yet"
                                        }
                                      />
                                    )}
                                    {people.length > 0 && (
                                      <Meta label="Responsible" value={people.join(", ")} />
                                    )}
                                    {a.meansOfVerification && (
                                      <Meta label="Verified by" value={a.meansOfVerification} />
                                    )}
                                    {freq && <Meta label="Frequency" value={freq} />}
                                  </dl>
                                </div>
                                <RowMenu
                                  label="Activity actions"
                                  disabled={!canEdit}
                                  onUp={() => mvActivity.mutate({ id: a.id, dir: "up" })}
                                  onDown={() => mvActivity.mutate({ id: a.id, dir: "down" })}
                                  editTo={a.id}
                                  onDelete={() => setDlg({ t: "del-activity", item: a })}
                                  hideMoves={filtering}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      <CodeTitleDialog
        open={dlg?.t === "objective"}
        heading={dlg?.t === "objective" && dlg.edit ? "Edit objective" : "Add objective"}
        initial={dlg?.t === "objective" ? dlg.edit : undefined}
        pending={addObjective.isPending || updObjective.isPending}
        onClose={() => setDlg(null)}
        onSave={(v) =>
          dlg?.t === "objective" && dlg.edit
            ? updObjective.mutate({ id: dlg.edit.id, patch: v }, done("Objective updated"))
            : addObjective.mutate(v, done("Objective added"))
        }
      />
      <CodeTitleDialog
        open={dlg?.t === "outcome"}
        heading={dlg?.t === "outcome" && dlg.edit ? "Edit outcome" : "Add outcome"}
        initial={dlg?.t === "outcome" ? dlg.edit : undefined}
        pending={addOutcome.isPending || updOutcome.isPending}
        onClose={() => setDlg(null)}
        onSave={(v) => {
          if (dlg?.t !== "outcome") return;
          if (dlg.edit) updOutcome.mutate({ id: dlg.edit.id, patch: v }, done("Outcome updated"));
          else
            addOutcome.mutate({ objectiveId: dlg.objective.id, input: v }, done("Outcome added"));
        }}
      />
      <ActivityDialog
        open={dlg?.t === "activity"}
        heading="Add activity"
        pending={addActivity.isPending}
        onClose={() => setDlg(null)}
        onSave={(v) =>
          dlg?.t === "activity" &&
          addActivity.mutate({ outcomeId: dlg.outcome.id, input: v }, done("Activity added"))
        }
      />
      <ConfirmDelete
        open={!!dlg && dlg.t.startsWith("del-")}
        title={
          dlg?.t === "del-objective"
            ? "Delete this objective?"
            : dlg?.t === "del-outcome"
              ? "Delete this outcome?"
              : "Delete this activity?"
        }
        description={dlg ? delText(dlg) : ""}
        onCancel={() => setDlg(null)}
        onConfirm={() => {
          if (!dlg) return;
          if (dlg.t === "del-objective") rmObjective.mutate(dlg.item.id, done("Objective deleted"));
          if (dlg.t === "del-outcome") rmOutcome.mutate(dlg.item.id, done("Outcome deleted"));
          if (dlg.t === "del-activity") rmActivity.mutate(dlg.item.id, done("Activity deleted"));
        }}
      />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <dt className="shrink-0">{label}:</dt>
      <dd className="min-w-0 break-words text-foreground">{value}</dd>
    </div>
  );
}

function RowMenu({
  label,
  disabled,
  onUp,
  onDown,
  onEdit,
  editTo,
  onDelete,
  hideMoves,
}: {
  label: string;
  disabled: boolean;
  onUp: () => void;
  onDown: () => void;
  onEdit?: () => void;
  editTo?: string;
  onDelete: () => void;
  hideMoves?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={disabled}
          aria-label={label}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!hideMoves && (
          <>
            <DropdownMenuItem onSelect={onUp}>
              <ArrowUp className="h-4 w-4" />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDown}>
              <ArrowDown className="h-4 w-4" />
              Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {editTo ? (
          <DropdownMenuItem asChild>
            <Link to="/activities/$id" params={{ id: editTo }}>
              <Pencil className="h-4 w-4" />
              Open and edit
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="text-destructive" onSelect={onDelete}>
          <Trash2 className="h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
