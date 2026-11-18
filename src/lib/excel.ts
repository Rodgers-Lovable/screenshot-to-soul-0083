import * as XLSX from "xlsx";
import { parseMoney } from "./format";
import { lineSummary, sumSummaries } from "./calc";
import type {
  Attachment,
  BudgetEvent,
  BudgetLine,
  BudgetPeriod,
  Component,
  DurationUnit,
  QuantityUnit,
} from "./types";
import { QUANTITY_UNITS } from "./types";

export interface ParsedRow {
  block: number;
  description: string;
  quantity: number;
  quantityUnit: QuantityUnit;
  unitCost: number; // KES
  duration: number;
  durationUnit: DurationUnit;
  occurrences: number;
  fileAmount: number | null;
}
export interface ParsedBlock {
  index: number;
  heading: string;
}

const has = (h: string, ...k: string[]) => k.some((x) => h.includes(x));

function unitOf(v: unknown): QuantityUnit {
  const s = String(v ?? "").toLowerCase();
  return (
    QUANTITY_UNITS.find((u) => s.includes(u.toLowerCase())) ??
    (s.includes("person") || s.includes("people") ? "pax" : "units")
  );
}
function durUnitOf(header: string, cell: unknown): DurationUnit {
  const s = `${header} ${String(cell ?? "")}`.toLowerCase();
  if (s.includes("month")) return "months";
  if (s.includes("day")) return "days";
  return "one-off";
}

/** Parse the first sheet of a budget workbook into editable rows grouped into blocks. */
export function parseBudgetRows(rows: unknown[][]): { blocks: ParsedBlock[]; rows: ParsedRow[] } {
  const hi = rows.findIndex((r) =>
    r.some((c) => typeof c === "string" && /descr|activity|item/i.test(c)),
  );
  const header = (rows[hi] ?? []).map((c) => String(c ?? "").toLowerCase());
  const col = (...k: string[]) => header.findIndex((h) => has(h, ...k));
  const cDesc = Math.max(0, col("descr", "activity", "item"));
  const cQty = col("qty", "quantity", "no.", "number");
  const cUnit = col("unit type", "units", "unit of");
  const cCost = col("unit cost", "rate", "cost/unit", "unit price");
  const cDur = col("duration", "days", "months");
  const cDurUnit = col("duration unit", "period");
  const cOcc = col("occurrence", "frequency", "times", "freq");
  const cAmt = col("total", "amount");
  const out: ParsedRow[] = [];
  const blocks: ParsedBlock[] = [{ index: 0, heading: "Imported" }];
  for (const r of rows.slice(hi + 1)) {
    const desc = String(r[cDesc] ?? "").trim();
    const cost = cCost >= 0 ? parseMoney(r[cCost]) : null;
    const qty = cQty >= 0 ? parseMoney(r[cQty]) : null;
    if (!desc) continue;
    if (cost === null && qty === null) {
      if (/^total|^sub-?total/i.test(desc)) continue;
      blocks.push({ index: blocks.length, heading: desc });
      continue;
    }
    const du = durUnitOf(cDur >= 0 ? header[cDur] : "", cDurUnit >= 0 ? r[cDurUnit] : "");
    out.push({
      block: blocks.length - 1,
      description: desc,
      quantity: qty ?? 1,
      quantityUnit: unitOf(cUnit >= 0 ? r[cUnit] : ""),
      unitCost: cost ?? 0,
      duration: du === "one-off" ? 1 : ((cDur >= 0 ? parseMoney(r[cDur]) : null) ?? 1),
      durationUnit: du,
      occurrences: Math.max(1, Math.round((cOcc >= 0 ? parseMoney(r[cOcc]) : null) ?? 1)),
      fileAmount: cAmt >= 0 ? parseMoney(r[cAmt]) : null,
    });
  }
  return { blocks: blocks.filter((b) => out.some((r) => r.block === b.index)), rows: out };
}

export async function readWorkbook(file: File): Promise<unknown[][]> {
  const wb = XLSX.read(await file.arrayBuffer());
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
}

export function exportWorkbook(
  period: BudgetPeriod,
  components: Component[],
  lines: BudgetLine[],
  events: BudgetEvent[],
  attachments: Attachment[],
) {
  const wb = XLSX.utils.book_new();
  const k = (c: number) => c / 100;
  const summary: (string | number)[][] = [
    [
      "Component",
      "Line",
      "Planned KES",
      "Actual KES",
      "Remaining KES",
      "Still to spend KES",
      "Projected carryover KES",
      "Planned USD",
      "Actual USD",
    ],
  ];
  for (const c of components) {
    const cl = lines.filter((l) => l.componentId === c.id);
    const rows: (string | number)[][] = [
      [
        "Group",
        "Description",
        "Qty",
        "Unit",
        "Unit cost KES",
        "Duration",
        "Duration unit",
        "Occurrences",
        "Planned KES",
        "Actual KES",
        "Remaining KES",
        "Finance posted KES",
      ],
    ];
    const sums = cl.map((l) => {
      const s = lineSummary(l, events);
      rows.push([
        l.groupLabel ?? "",
        l.description,
        l.quantity,
        l.quantityUnit,
        k(l.unitCostCents),
        l.duration,
        l.durationUnit,
        l.occurrences,
        k(s.planned),
        k(s.actualToDate),
        k(s.remaining),
        l.financePostedCents !== undefined ? k(l.financePostedCents) : "",
      ]);
      summary.push([
        `${c.code}. ${c.name}`,
        l.description,
        k(s.planned),
        k(s.actualToDate),
        k(s.remaining),
        k(s.stillToSpend),
        k(s.projectedBalance),
        s.planned / 100 / period.fxRate,
        s.actualToDate / 100 / period.fxRate,
      ]);
      return s;
    });
    const t = sumSummaries(sums);
    summary.push([
      `${c.code}. ${c.name} — TOTAL`,
      "",
      k(t.planned),
      k(t.actualToDate),
      k(t.remaining),
      k(t.stillToSpend),
      k(t.projectedBalance),
      t.planned / 100 / period.fxRate,
      t.actualToDate / 100 / period.fxRate,
    ]);
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(rows),
      `${c.code} ${c.name}`.replace(/[\\/?*[\]:]/g, "").slice(0, 31),
    );
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const evRows: (string | number)[][] = [
    [
      "Line",
      "#",
      "Title",
      "Status",
      "Planned date",
      "Actual date",
      "Actual qty",
      "Actual unit cost KES",
      "Actual duration",
      "Location",
      "Evidence files",
      "Notes",
    ],
  ];
  for (const e of events) {
    const l = lineById.get(e.lineId);
    evRows.push([
      l?.description ?? "",
      e.sequence,
      e.title,
      e.status,
      e.plannedDate ?? "",
      e.actualDate ?? "",
      e.actualQuantity ?? "",
      e.actualUnitCostCents !== undefined ? k(e.actualUnitCostCents) : "",
      e.actualDuration ?? "",
      e.location ?? "",
      attachments.filter((a) => a.eventId === e.id).length,
      e.notes ?? "",
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(evRows), "Events");
  XLSX.writeFile(wb, `${period.projectName} ${period.name} budget.xlsx`.replace(/[\\/]/g, "-"));
}
