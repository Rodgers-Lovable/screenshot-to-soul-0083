// Supabase persistence for the repositories: load the shared budget, write back row diffs.
import { supabase } from "@/integrations/supabase/client";
import type {
  ActivitySite,
  Attachment,
  DeliveryResult,
  AuditEntry,
  BudgetPeriod,
  Study,
  StudyMember,
  StudyRole,
  WorkplanData,
} from "@/lib/types";
import type { StoreData } from "./store";
import { logger } from "@/lib/log";

const log = logger("data");

type WKey = "sites" | "objectives" | "outcomes" | "activities" | "indicators" | "responsibles";
const COLS = {
  sites: ["id", "name", "sortOrder", "archivedAt"],
  objectives: ["id", "periodId", "code", "title", "sortOrder", "copiedFromId"],
  outcomes: ["id", "objectiveId", "code", "title", "sortOrder", "copiedFromId"],
  activities: [
    "id",
    "outcomeId",
    "code",
    "title",
    "kind",
    "output",
    "meansOfVerification",
    "frequencyLabel",
    "repeatEvery",
    "repeatUnit",
    "notes",
    "sortOrder",
    "copiedFromId",
  ],
  indicators: ["id", "activityId", "name", "target", "sortOrder", "copiedFromId"],
  responsibles: ["id", "activityId", "name", "userId", "sortOrder"],
  lines: [
    "id",
    "activityId",
    "groupLabel",
    "description",
    "quantity",
    "quantityUnit",
    "unitCostCents",
    "duration",
    "durationUnit",
    "occurrences",
    "justification",
    "costCategory",
    "financePostedCents",
    "sortOrder",
    "copiedFromId",
  ],
  events: [
    "id",
    "lineId",
    "sequence",
    "title",
    "plannedDate",
    "location",
    "status",
    "actualDate",
    "actualQuantity",
    "actualUnitCostCents",
    "actualDuration",
    "notes",
    "deliveryId",
  ],
  deliveries: [
    "id",
    "activityId",
    "siteId",
    "roundNumber",
    "roundLabel",
    "plannedDate",
    "actualDate",
    "status",
    "notes",
  ],
  results: ["deliveryId", "indicatorId", "value", "notes"],
  attachments: [
    "id",
    "eventId",
    "deliveryId",
    "fileName",
    "fileUrl",
    "mimeType",
    "sizeBytes",
    "label",
    "uploadedAt",
  ],
  audit: ["id", "entity", "entityId", "field", "oldValue", "newValue", "changedAt", "changedBy"],
} as const;
const TABLE = {
  period: "budget_periods",
  sites: "sites",
  objectives: "objectives",
  outcomes: "outcomes",
  activities: "activities",
  indicators: "activity_indicators",
  responsibles: "activity_responsibles",
  activitySites: "activity_sites",
  lines: "budget_lines",
  deliveries: "deliveries",
  results: "delivery_indicator_results",
  events: "budget_events",
  attachments: "attachments",
  audit: "audit_log",
} as const;
const BUCKET = "evidence";
const STORAGE = "storage:";

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
type Obj = Record<string, unknown>;
const toRow = (o: object, cols: readonly string[]) =>
  Object.fromEntries(cols.map((c) => [snake(c), (o as Obj)[c] ?? null]));
const fromRow = <T>(r: Obj): T =>
  Object.fromEntries(
    Object.entries(r)
      .filter(([k, v]) => v !== null && k !== "study_id")
      .map(([k, v]) => [camel(k), v]),
  ) as T;

// Untyped view of the client: tables are addressed by name from the maps above.
const from = (t: string) => supabase.from(t as "components");

const IN_CHUNK = 100;

/** Reads a table for one study, optionally only rows whose column is in a list of ids. */
async function fetchAll<T>(
  table: string,
  study: string,
  opt: { order?: string; col?: string; ids?: string[]; eq?: [string, string] } = {},
): Promise<T[]> {
  const order = opt.order ?? "id";
  const page = async (ids?: string[]) => {
    const out: T[] = [];
    for (let start = 0; ; start += 1000) {
      let q = from(table)
        .select("*")
        .eq("study_id" as never, study);
      if (opt.eq) q = q.eq(opt.eq[0] as never, opt.eq[1]);
      if (ids && opt.col) q = q.in(opt.col as never, ids as never);
      const { data, error } = await q.order(order).range(start, start + 999);
      if (error) {
        log.error(`read ${table} failed`, error, { code: error.code });
        throw new Error(error.message);
      }
      out.push(...(data as Obj[]).map((r) => fromRow<T>(r)));
      if (data.length < 1000) return out;
    }
  };
  if (!opt.ids) return page();
  if (!opt.ids.length) return [];
  const parts: string[][] = [];
  for (let i = 0; i < opt.ids.length; i += IN_CHUNK) parts.push(opt.ids.slice(i, i + IN_CHUNK));
  return (await Promise.all(parts.map((c) => page(c)))).flat();
}
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

export async function getYear(study: string, period: string): Promise<BudgetPeriod | null> {
  return (await fetchAll<BudgetPeriod>(TABLE.period, study, { eq: ["id", period] }))[0] ?? null;
}

/** All workplan years of a study, oldest first. */
export async function listYears(study: string): Promise<BudgetPeriod[]> {
  const rows = await fetchAll<BudgetPeriod>(TABLE.period, study, { order: "start_date" });
  return rows.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
}

// Loads are shared per study and year, so a switch never receives another year's data.
const inflight = new Map<string, Promise<StoreData>>();
/** Concurrent callers for the same study and year share one load. */
export function loadRemote(study: string, period: string | null): Promise<StoreData> {
  const k = `${study}:${period ?? ""}`;
  let p = inflight.get(k);
  if (!p) {
    p = log
      .time(
        "load budget",
        () => doLoad(study, period),
        (d) => ({
          period: d.period?.name ?? null,
          activities: d.activities.length,
          lines: d.lines.length,
          deliveries: d.deliveries.length,
          events: d.events.length,
          attachments: d.attachments.length,
        }),
      )
      .finally(() => {
        inflight.delete(k);
      });
    inflight.set(k, p);
  }
  return p.then((d) => JSON.parse(JSON.stringify(d)) as StoreData);
}
async function doLoad(study: string, periodId: string | null): Promise<StoreData> {
  const none: StoreData = {
    period: null,
    objectives: [],
    outcomes: [],
    activities: [],
    sites: [],
    activitySites: [],
    indicators: [],
    lines: [],
    deliveries: [],
    results: [],
    events: [],
    attachments: [],
    audit: [],
  };
  if (!periodId) return none;
  const periods = await fetchAll<BudgetPeriod>(TABLE.period, study, { eq: ["id", periodId] });
  const period = periods[0] ?? null;
  if (!period) return none;
  // Children are read through their parents, so another year's rows are never loaded.
  const objectives = await fetchAll<StoreData["objectives"][number]>(TABLE.objectives, study, {
    eq: ["period_id", periodId],
  });
  const outcomes = await fetchAll<StoreData["outcomes"][number]>(TABLE.outcomes, study, {
    col: "objective_id",
    ids: ids(objectives),
  });
  const activities = await fetchAll<StoreData["activities"][number]>(TABLE.activities, study, {
    col: "outcome_id",
    ids: ids(outcomes),
  });
  const actIds = ids(activities);
  const [lines, deliveries, indicators, activitySites, sites] = await Promise.all([
    fetchAll<StoreData["lines"][number]>(TABLE.lines, study, { col: "activity_id", ids: actIds }),
    fetchAll<StoreData["deliveries"][number]>(TABLE.deliveries, study, {
      col: "activity_id",
      ids: actIds,
    }),
    fetchAll<StoreData["indicators"][number]>(TABLE.indicators, study, {
      col: "activity_id",
      ids: actIds,
    }),
    fetchAll<ActivitySite>(TABLE.activitySites, study, {
      col: "activity_id",
      ids: actIds,
      order: "activity_id",
    }),
    actIds.length ? fetchAll<StoreData["sites"][number]>(TABLE.sites, study) : [],
  ]);
  const [events, results] = await Promise.all([
    fetchAll<StoreData["events"][number]>(TABLE.events, study, { col: "line_id", ids: ids(lines) }),
    fetchAll<DeliveryResult>(TABLE.results, study, {
      col: "delivery_id",
      ids: ids(deliveries),
      order: "delivery_id",
    }),
  ]);
  const [receipts, proof] = await Promise.all([
    fetchAll<Attachment>(TABLE.attachments, study, { col: "event_id", ids: ids(events) }),
    fetchAll<Attachment>(TABLE.attachments, study, { col: "delivery_id", ids: ids(deliveries) }),
  ]);
  if (!activities.length) log.info("year has no activities yet");
  return {
    period,
    objectives,
    outcomes,
    activities,
    sites,
    activitySites,
    indicators,
    lines,
    deliveries,
    results,
    events,
    attachments: [...receipts, ...proof],
    audit: [],
  };
}

type RunResult = PromiseLike<{ error: { message: string } | null }>;
const run = async (p: RunResult) => {
  const { error } = await p;
  if (error) {
    log.error("sync failed", error);
    throw new Error(error.message);
  }
};
const diff = <K extends string>(
  before: Record<K, { id: string }[]>,
  after: Record<K, { id: string }[]>,
  k: K,
  cols: readonly string[],
  studyId: string,
) => {
  const b = new Map(before[k].map((r) => [r.id, JSON.stringify(toRow(r, cols))]));
  return after[k]
    .map((r) => toRow(r, cols))
    .filter((r) => b.get(r.id as string) !== JSON.stringify(r))
    .map((r) => ({ ...r, study_id: studyId }));
};
const removedIds = <K extends string>(
  before: Record<K, { id: string }[]>,
  after: Record<K, { id: string }[]>,
  k: K,
) => {
  const keep = new Set(after[k].map((r) => r.id));
  return before[k].filter((r) => !keep.has(r.id)).map((r) => r.id);
};
const upsertRows = async (table: string, rows: Obj[], onConflict?: string) => {
  for (let i = 0; i < rows.length; i += 500)
    await run(
      from(table).upsert(rows.slice(i, i + 500) as never, onConflict ? { onConflict } : undefined),
    );
};
const resultKey = (r: DeliveryResult) => `${r.deliveryId}:${r.indicatorId}`;
const deleteIds = async (table: string, studyId: string, list: string[]) => {
  for (let i = 0; i < list.length; i += 200)
    await run(
      from(table)
        .delete()
        .eq("study_id" as never, studyId)
        .in("id", list.slice(i, i + 200)),
    );
};
const insertAudit = async (list: AuditEntry[], studyId: string) => {
  const rows = list.map((a) => ({ ...toRow(a, COLS.audit), study_id: studyId }));
  for (let i = 0; i < rows.length; i += 500)
    await run(from(TABLE.audit).insert(rows.slice(i, i + 500) as never));
  return rows.length;
};

/**
 * Writes the rows that changed. Years are never written here; they go through functions.
 * Parents are written before children that point at them, and deleted after them.
 */
export async function syncRemote(before: StoreData, after: StoreData, studyId: string) {
  const written: Record<string, number> = {};
  const upsert = async (k: "lines" | "deliveries" | "events" | "attachments") => {
    const rows = diff(before, after, k, COLS[k], studyId);
    if (rows.length) written[`${k} upserted`] = rows.length;
    await upsertRows(TABLE[k], rows);
  };
  await upsert("lines");
  await upsert("deliveries");

  const had = new Map(
    before.results.map((r) => [resultKey(r), JSON.stringify(toRow(r, COLS.results))]),
  );
  const resultRows = after.results
    .map((r) => toRow(r, COLS.results))
    .filter((r) => had.get(`${r.delivery_id}:${r.indicator_id}`) !== JSON.stringify(r))
    .map((r) => ({ ...r, study_id: studyId }));
  if (resultRows.length) written["results upserted"] = resultRows.length;
  await upsertRows(TABLE.results, resultRows, "delivery_id,indicator_id");

  await upsert("events");
  await upsert("attachments");

  const keep = new Set(after.results.map(resultKey));
  const goneResults = before.results.filter((r) => !keep.has(resultKey(r)));
  if (goneResults.length) written["results deleted"] = goneResults.length;
  for (const r of goneResults)
    await run(
      from(TABLE.results)
        .delete()
        .eq("study_id" as never, studyId)
        .eq("delivery_id" as never, r.deliveryId)
        .eq("indicator_id" as never, r.indicatorId),
    );
  const gone = before.attachments.filter(
    (a) => !after.attachments.some((x) => x.id === a.id),
  ) as Attachment[];
  for (const k of ["attachments", "events", "deliveries", "lines"] as const) {
    const list = removedIds(before, after, k);
    if (list.length) written[`${k} deleted`] = list.length;
    await deleteIds(TABLE[k], studyId, list);
  }
  const audit = await insertAudit(after.audit, studyId);
  await removeEvidence(gone.map((a) => a.fileUrl));
  log.info("sync ok", { ...written, audit });
}

/** Sites for the whole study, plus the active year's workplan. */
export async function loadWorkplan(study: string, period: string | null): Promise<WorkplanData> {
  const sites = await fetchAll<WorkplanData["sites"][number]>(TABLE.sites, study);
  if (!period)
    return {
      sites,
      objectives: [],
      outcomes: [],
      activities: [],
      indicators: [],
      responsibles: [],
      activitySites: [],
      audit: [],
    };
  const objectives = await fetchAll<WorkplanData["objectives"][number]>(TABLE.objectives, study, {
    eq: ["period_id", period],
  });
  const outcomes = await fetchAll<WorkplanData["outcomes"][number]>(TABLE.outcomes, study, {
    col: "objective_id",
    ids: ids(objectives),
  });
  const activities = await fetchAll<WorkplanData["activities"][number]>(TABLE.activities, study, {
    col: "outcome_id",
    ids: ids(outcomes),
  });
  const actIds = ids(activities);
  const [indicators, responsibles, activitySites] = await Promise.all([
    fetchAll<WorkplanData["indicators"][number]>(TABLE.indicators, study, {
      col: "activity_id",
      ids: actIds,
    }),
    fetchAll<WorkplanData["responsibles"][number]>(TABLE.responsibles, study, {
      col: "activity_id",
      ids: actIds,
    }),
    fetchAll<ActivitySite>(TABLE.activitySites, study, {
      col: "activity_id",
      ids: actIds,
      order: "activity_id",
    }),
  ]);
  return {
    sites,
    objectives,
    outcomes,
    activities,
    indicators,
    responsibles,
    activitySites,
    audit: [],
  };
}

const pairKey = (s: ActivitySite) => `${s.activityId}:${s.siteId}`;

export async function syncWorkplan(before: WorkplanData, after: WorkplanData, studyId: string) {
  const written: Record<string, number> = {};
  const keys = [
    "sites",
    "objectives",
    "outcomes",
    "activities",
    "indicators",
    "responsibles",
  ] as const;
  const had = new Set(before.activitySites.map(pairKey));
  const has = new Set(after.activitySites.map(pairKey));
  const removedPairs = before.activitySites.filter((s) => !has.has(pairKey(s)));
  const addedPairs = after.activitySites.filter((s) => !had.has(pairKey(s)));

  // Site selections go first, so an activity can change kind after its sites are cleared.
  for (const s of removedPairs)
    await run(
      from(TABLE.activitySites)
        .delete()
        .eq("study_id" as never, studyId)
        .eq("activity_id" as never, s.activityId)
        .eq("site_id" as never, s.siteId),
    );
  for (const k of keys as readonly WKey[]) {
    const rows = diff(before, after, k, COLS[k], studyId);
    if (rows.length) written[`${k} upserted`] = rows.length;
    await upsertRows(TABLE[k], rows);
  }
  if (addedPairs.length)
    await run(
      from(TABLE.activitySites).insert(
        addedPairs.map((s) => ({
          study_id: studyId,
          activity_id: s.activityId,
          site_id: s.siteId,
        })) as never,
      ),
    );
  for (const k of ["responsibles", "indicators", "activities", "outcomes", "objectives"] as const) {
    const list = removedIds(before, after, k);
    if (list.length) written[`${k} deleted`] = list.length;
    await deleteIds(TABLE[k], studyId, list);
  }
  const audit = await insertAudit(after.audit, studyId);
  log.info("workplan sync ok", {
    ...written,
    "sites linked": addedPairs.length,
    "sites unlinked": removedPairs.length,
    audit,
  });
}

export async function listAudit(study: string): Promise<AuditEntry[]> {
  const { data, error } = await from(TABLE.audit)
    .select("*")
    .eq("study_id" as never, study)
    .order("changed_at" as never, { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data as Obj[]).map((r) => fromRow<AuditEntry>(r));
}

export async function currentUserLabel() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? "unknown";
}

/** Folder is the event id for a receipt, or `deliveries/<id>` for proof of delivery. */
export async function uploadEvidence(study: string, folder: string, file: File) {
  const path = `${study}/${folder}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (error) {
    log.error("evidence upload failed", error, { bytes: file.size });
    throw new Error(error.message);
  }
  log.info("evidence uploaded", { bytes: file.size, type: file.type });
  return STORAGE + path;
}

export async function removeEvidence(urls: string[]) {
  const paths = urls.filter((u) => u.startsWith(STORAGE)).map((u) => u.slice(STORAGE.length));
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) log.warn("evidence delete failed", { files: paths.length, error: error.message });
}

/** Swap stored file references for short-lived download links. */
export async function signUrls(list: Attachment[]): Promise<Attachment[]> {
  const paths = list
    .filter((a) => a.fileUrl.startsWith(STORAGE))
    .map((a) => a.fileUrl.slice(STORAGE.length));
  if (!paths.length) return list;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error)
    log.warn("signing evidence links failed", { files: paths.length, error: error.message });
  const m = new Map((data ?? []).map((s) => [s.path, s.signedUrl]));
  return list.map((a) =>
    a.fileUrl.startsWith(STORAGE)
      ? { ...a, fileUrl: m.get(a.fileUrl.slice(STORAGE.length)) ?? "" }
      : a,
  );
}

// Study tables and RPCs are newer than the generated types, so they are called through untyped views.
type RpcResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
const rpc = (fn: string, args: object): RpcResult =>
  (supabase.rpc as unknown as (f: string, a: object) => RpcResult).call(supabase, fn, args);

async function mySession() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export async function listStudies(): Promise<Study[]> {
  const me = await mySession();
  if (!me) return [];
  const [studies, members] = await Promise.all([
    from("studies")
      .select("id,name")
      .order("created_at" as never),
    from("study_members")
      .select("study_id,role")
      .eq("user_id" as never, me.id),
  ]);
  if (studies.error) throw new Error(studies.error.message);
  if (members.error) throw new Error(members.error.message);
  const roles = new Map(
    (members.data as unknown as Obj[]).map((m) => [m.study_id as string, m.role]),
  );
  return (studies.data as unknown as { id: string; name: string }[])
    .filter((s) => roles.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, role: roles.get(s.id) as StudyRole }));
}

/** Fails closed: any error counts as not allowed. */
export async function isPlatformAdmin(): Promise<boolean> {
  try {
    const { data, error } = await rpc("is_platform_admin", {});
    if (error) throw new Error(error.message);
    return data === true;
  } catch (e) {
    log.warn("platform admin check failed", { error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

export async function createStudy(name: string): Promise<string> {
  const { data, error } = await rpc("create_study", { _name: name });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listStudyMembers(study: string): Promise<StudyMember[]> {
  const me = await mySession();
  const { data, error } = await from("study_members")
    .select("user_id,email,role")
    .eq("study_id" as never, study)
    .order("added_at" as never);
  if (error) throw new Error(error.message);
  return (data as unknown as { user_id: string; email: string; role: StudyRole }[]).map((m) => ({
    userId: m.user_id,
    email: m.email,
    role: m.role,
    isMe: m.user_id === me?.id,
  }));
}

/** Resolves false when no account has that email. */
export async function addStudyMember(study: string, email: string): Promise<boolean> {
  const { data, error } = await rpc("add_study_member", { _study_id: study, _email: email });
  if (error) throw new Error(error.message);
  return !!data;
}

export async function removeStudyMember(study: string, userId: string) {
  const { error } = await rpc("remove_study_member", { _study_id: study, _user_id: userId });
  if (error) throw new Error(error.message);
}

export async function setStudyAdmin(study: string, userId: string, isAdmin: boolean) {
  const { error } = await rpc("set_study_admin", {
    _study_id: study,
    _user_id: userId,
    _is_admin: isAdmin,
  });
  if (error) throw new Error(error.message);
}

export interface YearInput {
  name: string;
  startDate: string;
  endDate: string;
  fxRate: number;
  currency: string;
}

/** Creates a year, optionally copying the workplan of an earlier one. Returns the new year id. */
export async function createYear(
  study: string,
  v: YearInput,
  copyFromId: string | null,
  copyBudgetLines = false,
): Promise<string> {
  const { data, error } = await rpc("create_workplan_year", {
    _study_id: study,
    _name: v.name,
    _start_date: v.startDate,
    _end_date: v.endDate,
    _fx_rate: v.fxRate,
    _currency: v.currency,
    _copy_from_period_id: copyFromId,
    _copy_budget_lines: copyBudgetLines && copyFromId !== null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function updateYear(id: string, v: YearInput & { projectName: string }) {
  const { error } = await rpc("update_workplan_year", {
    _period_id: id,
    _project_name: v.projectName,
    _name: v.name,
    _start_date: v.startDate,
    _end_date: v.endDate,
    _fx_rate: v.fxRate,
    _currency: v.currency,
  });
  if (error) throw new Error(error.message);
}

export async function setYearStatus(id: string, status: "open" | "closed") {
  const { error } = await rpc("set_workplan_year_status", { _period_id: id, _status: status });
  if (error) throw new Error(error.message);
}
