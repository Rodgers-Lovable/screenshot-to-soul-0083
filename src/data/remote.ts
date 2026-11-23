// Supabase persistence for the repositories: load the shared budget, write back row diffs.
import { supabase } from "@/integrations/supabase/client";
import type { Attachment, AuditEntry, Study, StudyMember, StudyRole } from "@/lib/types";
import type { StoreData } from "./store";
import { logger } from "@/lib/log";

const log = logger("data");

type Key = "components" | "lines" | "events" | "attachments";
const COLS = {
  period: ["id", "projectName", "name", "startDate", "endDate", "fxRate"],
  components: ["id", "periodId", "code", "name", "sortOrder"],
  lines: [
    "id",
    "componentId",
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
  ],
  attachments: [
    "id",
    "eventId",
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
  components: "components",
  lines: "budget_lines",
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

async function fetchAll<T>(table: string, study: string, order = "id"): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await from(table)
      .select("*")
      .eq("study_id" as never, study)
      .order(order)
      .range(start, start + 999);
    if (error) {
      log.error(`read ${table} failed`, error, { code: error.code });
      throw new Error(error.message);
    }
    out.push(...(data as Obj[]).map((r) => fromRow<T>(r)));
    if (data.length < 1000) return out;
  }
}

// Loads are shared per study, so a study switch never receives another study's data.
const inflight = new Map<string, Promise<StoreData>>();
/** Concurrent callers for the same study share one load. */
export function loadRemote(study: string): Promise<StoreData> {
  let p = inflight.get(study);
  if (!p) {
    p = log
      .time(
        "load budget",
        () => doLoad(study),
        (d) => ({
          period: d.period?.name ?? null,
          components: d.components.length,
          lines: d.lines.length,
          events: d.events.length,
          attachments: d.attachments.length,
        }),
      )
      .finally(() => {
        inflight.delete(study);
      });
    inflight.set(study, p);
  }
  return p.then((d) => JSON.parse(JSON.stringify(d)) as StoreData);
}
async function doLoad(study: string): Promise<StoreData> {
  const [periods, components, lines, events, attachments] = await Promise.all([
    fetchAll<NonNullable<StoreData["period"]>>(TABLE.period, study),
    fetchAll<StoreData["components"][number]>(TABLE.components, study),
    fetchAll<StoreData["lines"][number]>(TABLE.lines, study),
    fetchAll<StoreData["events"][number]>(TABLE.events, study),
    fetchAll<Attachment>(TABLE.attachments, study),
  ]);
  const d: StoreData = {
    period: periods[0] ?? null,
    components,
    lines,
    events,
    attachments,
    audit: [],
  };
  if (!d.period && !components.length) log.info("budget is empty");
  return d;
}

export async function syncRemote(before: StoreData, after: StoreData, studyId: string) {
  const changed = (k: Key | "period") => {
    const a = k === "period" ? (after.period ? [after.period] : []) : after[k];
    const b = new Map(
      (k === "period" ? (before.period ? [before.period] : []) : before[k]).map((r) => [
        r.id,
        JSON.stringify(toRow(r, COLS[k])),
      ]),
    );
    return a
      .map((r) => toRow(r, COLS[k]))
      .filter((r) => b.get(r.id as string) !== JSON.stringify(r))
      .map((r) => ({ ...r, study_id: studyId }));
  };
  const removed = <K extends Key>(k: K): StoreData[K] => {
    const ids = new Set((after[k] as { id: string }[]).map((r) => r.id));
    return (before[k] as { id: string }[]).filter((r) => !ids.has(r.id)) as StoreData[K];
  };
  const written: Record<string, number> = {};
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (error) {
      log.error("sync failed", error);
      throw new Error(error.message);
    }
  };

  for (const k of ["period", "components", "lines", "events", "attachments"] as const) {
    const rows = changed(k);
    if (rows.length) written[`${k} upserted`] = rows.length;
    for (let i = 0; i < rows.length; i += 500)
      await run(from(TABLE[k]).upsert(rows.slice(i, i + 500) as never));
  }
  const gone: Attachment[] = removed("attachments");
  for (const k of ["attachments", "events", "lines", "components"] as const) {
    const ids = removed(k).map((r) => r.id);
    if (ids.length) written[`${k} deleted`] = ids.length;
    for (let i = 0; i < ids.length; i += 200)
      await run(
        from(TABLE[k])
          .delete()
          .eq("study_id" as never, studyId)
          .in("id", ids.slice(i, i + 200)),
      );
  }
  const audit = after.audit.map((a) => ({ ...toRow(a, COLS.audit), study_id: studyId }));
  for (let i = 0; i < audit.length; i += 500)
    await run(from(TABLE.audit).upsert(audit.slice(i, i + 500) as never));
  await removeEvidence(gone.map((a) => a.fileUrl));
  log.info("sync ok", { ...written, audit: audit.length });
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

export async function uploadEvidence(study: string, eventId: string, file: File) {
  const path = `${study}/${eventId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
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
