// Lovable Cloud persistence for the repositories: load the shared budget, write back row diffs.
import { supabase } from "@/integrations/supabase/client";
import type { Attachment, AuditEntry } from "@/lib/types";
import { makeSeed, type StoreData } from "./seed";

type Key = "components" | "lines" | "events" | "attachments";
const COLS = {
  period: ["id", "projectName", "name", "startDate", "endDate", "fxRate"],
  components: ["id", "periodId", "code", "name", "sortOrder"],
  lines: ["id", "componentId", "groupLabel", "description", "quantity", "quantityUnit", "unitCostCents", "duration", "durationUnit", "occurrences", "justification", "costCategory", "financePostedCents", "sortOrder"],
  events: ["id", "lineId", "sequence", "title", "plannedDate", "location", "status", "actualDate", "actualQuantity", "actualUnitCostCents", "actualDuration", "notes"],
  attachments: ["id", "eventId", "fileName", "fileUrl", "mimeType", "sizeBytes", "label", "uploadedAt"],
  audit: ["id", "entity", "entityId", "field", "oldValue", "newValue", "changedAt", "changedBy"],
} as const;
const TABLE = { period: "budget_periods", components: "components", lines: "budget_lines", events: "budget_events", attachments: "attachments", audit: "audit_log" } as const;
const BUCKET = "evidence";
const STORAGE = "storage:";

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
type Obj = Record<string, unknown>;
const toRow = (o: object, cols: readonly string[]) => Object.fromEntries(cols.map((c) => [snake(c), (o as Obj)[c] ?? null]));
const fromRow = <T,>(r: Obj): T => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null).map(([k, v]) => [camel(k), v])) as T;

// Untyped view of the client: tables are addressed by name from the maps above.
const from = (t: string) => supabase.from(t as "components");

async function fetchAll<T>(table: string, order = "id"): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await from(table).select("*").order(order).range(start, start + 999);
    if (error) throw new Error(error.message);
    out.push(...(data as Obj[]).map((r) => fromRow<T>(r)));
    if (data.length < 1000) return out;
  }
}

const empty = (): StoreData => ({ period: null, components: [], lines: [], events: [], attachments: [], audit: [] });

let inflight: Promise<StoreData> | null = null;
/** Concurrent callers share one load. */
export function loadRemote(): Promise<StoreData> {
  inflight ??= doLoad().finally(() => { inflight = null; });
  return inflight.then((d) => JSON.parse(JSON.stringify(d)) as StoreData);
}
async function doLoad(): Promise<StoreData> {
  const [periods, components, lines, events, attachments] = await Promise.all([
    fetchAll<NonNullable<StoreData["period"]>>(TABLE.period),
    fetchAll<StoreData["components"][number]>(TABLE.components),
    fetchAll<StoreData["lines"][number]>(TABLE.lines),
    fetchAll<StoreData["events"][number]>(TABLE.events),
    fetchAll<Attachment>(TABLE.attachments),
  ]);
  const d: StoreData = { period: periods[0] ?? null, components, lines, events, attachments, audit: [] };
  if (!d.period && !components.length) return bootstrap();
  return d;
}

/** First run: move this browser's earlier local budget into the cloud, or start from the demo budget. */
async function bootstrap(): Promise<StoreData> {
  let start = makeSeed();
  try {
    const raw = window.localStorage.getItem("pbt-store-v1");
    if (raw) {
      const local = JSON.parse(raw) as StoreData;
      local.attachments = local.attachments.filter((a) => !a.fileUrl.startsWith("blob:"));
      start = local;
    }
  } catch { /* keep demo */ }
  await syncRemote(empty(), start);
  return { ...start, audit: [] };
}

export async function syncRemote(before: StoreData, after: StoreData) {
  const changed = (k: Key | "period") => {
    const a = k === "period" ? (after.period ? [after.period] : []) : after[k];
    const b = new Map((k === "period" ? (before.period ? [before.period] : []) : before[k]).map((r) => [r.id, JSON.stringify(toRow(r, COLS[k]))]));
    return a.map((r) => toRow(r, COLS[k])).filter((r) => b.get(r.id as string) !== JSON.stringify(r));
  };
  const removed = <K extends Key>(k: K): StoreData[K] => {
    const ids = new Set((after[k] as { id: string }[]).map((r) => r.id));
    return (before[k] as { id: string }[]).filter((r) => !ids.has(r.id)) as StoreData[K];
  };
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; if (error) throw new Error(error.message); };

  for (const k of ["period", "components", "lines", "events", "attachments"] as const) {
    const rows = changed(k);
    for (let i = 0; i < rows.length; i += 500) await run(from(TABLE[k]).upsert(rows.slice(i, i + 500) as never));
  }
  const gone: Attachment[] = removed("attachments");
  for (const k of ["attachments", "events", "lines", "components"] as const) {
    const ids = removed(k).map((r) => r.id);
    for (let i = 0; i < ids.length; i += 200) await run(from(TABLE[k]).delete().in("id", ids.slice(i, i + 200)));
  }
  const audit = after.audit.map((a) => toRow(a, COLS.audit));
  for (let i = 0; i < audit.length; i += 500) await run(from(TABLE.audit).upsert(audit.slice(i, i + 500) as never));
  await removeEvidence(gone.map((a) => a.fileUrl));
}

export async function listAudit(): Promise<AuditEntry[]> {
  const { data, error } = await from(TABLE.audit).select("*").order("changed_at" as never, { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  return (data as Obj[]).map((r) => fromRow<AuditEntry>(r));
}

export async function currentUserLabel() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? "unknown";
}

export async function uploadEvidence(eventId: string, file: File) {
  const path = `${eventId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return STORAGE + path;
}

export async function removeEvidence(urls: string[]) {
  const paths = urls.filter((u) => u.startsWith(STORAGE)).map((u) => u.slice(STORAGE.length));
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

/** Swap stored file references for short-lived download links. */
export async function signUrls(list: Attachment[]): Promise<Attachment[]> {
  const paths = list.filter((a) => a.fileUrl.startsWith(STORAGE)).map((a) => a.fileUrl.slice(STORAGE.length));
  if (!paths.length) return list;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  const m = new Map((data ?? []).map((s) => [s.path, s.signedUrl]));
  return list.map((a) => (a.fileUrl.startsWith(STORAGE) ? { ...a, fileUrl: m.get(a.fileUrl.slice(STORAGE.length)) ?? "" } : a));
}
