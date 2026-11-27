import * as XLSX from "xlsx";
import { parseMoney } from "./format";
import { lineSummary, sumSummaries, type Summary } from "./calc";
import { activityLabel, buildBudgetTree, cleanUnit } from "./budget-tree";
import type {
  Activity,
  Attachment,
  BudgetEvent,
  BudgetLine,
  BudgetPeriod,
  DurationUnit,
  Objective,
  Outcome,
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
    (s.includes("person") || s.includes("people") ? "pax" : (cleanUnit(String(v ?? "")) ?? "units"))
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

type Cell = string | number;
const TEMPLATE_HEADER = [
  "Description",
  "Quantity",
  "Units",
  "Unit cost (KES)",
  "Duration",
  "Duration unit",
  "Occurrences",
  "Total (KES)",
];
const TEMPLATE_ROWS: (string | number | null)[][] = [
  ["Training workshop", null, null, null, null, null, null],
  ["Venue hire", 1, "units", 15000, 2, "days", 1],
  ["Participant lunch", 25, "pax", 800, 2, "days", 1],
  ["Field follow-up", null, null, null, null, null, null],
  ["Fuel", 1, "units", 5000, 1, "one-off", 3],
  ["Airtime", 10, "lines", 1000, 3, "months", 1],
];

/** Sheets of the import template. The first sheet is the one the import reads. */
export function buildImportTemplate(): { budget: unknown[][]; notes: string[][] } {
  // Header sits on row 2 and examples start on row 3, so formulas start at 3.
  const budget: unknown[][] = [
    ["Budget import template"],
    TEMPLATE_HEADER,
    ...TEMPLATE_ROWS.map((r, i) => {
      if (r[1] === null) return r;
      const n = i + 3;
      const total = Number(r[1]) * Number(r[3]) * Number(r[4]) * Number(r[6]);
      return [...r, { t: "n", v: total, f: `B${n}*D${n}*E${n}*G${n}` }];
    }),
  ];
  const notes = [
    ["How to fill in the Budget sheet"],
    ["Keep the header row. Columns can be in any order."],
    ["Each row with a quantity or unit cost becomes one budget line."],
    ["A row with only a description starts a group for the rows under it."],
    ["All lines are added to the one activity you pick when importing."],
    [`Units: free text, for example ${QUANTITY_UNITS.join(", ")}.`],
    ["Duration unit: days, months or one-off. One-off counts as a duration of 1."],
    ["Unit cost is in KES. Total is only a check; the app calculates its own."],
    ["Delete the example rows before importing."],
  ];
  return { budget, notes };
}

export function downloadImportTemplate() {
  const { budget, notes } = buildImportTemplate();
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(budget);
  ws["!cols"] = [
    { wch: 28 },
    { wch: 10 },
    { wch: 10 },
    { wch: 16 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Budget");
  const wn = XLSX.utils.aoa_to_sheet(notes);
  wn["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wn, "How to use");
  XLSX.writeFile(wb, "budget-import-template.xlsx");
}

export interface ExportData {
  objectives: Objective[];
  outcomes: Outcome[];
  activities: Activity[];
  lines: BudgetLine[];
  events: BudgetEvent[];
}

/** The sheets of the Excel export, as rows. Lines are grouped by objective, outcome and activity. */
export function buildExportSheets(
  period: BudgetPeriod,
  data: ExportData,
  attachments: Attachment[],
): { budget: Cell[][]; summary: Cell[][]; events: Cell[][] } {
  const k = (c: number) => c / 100;
  const tree = buildBudgetTree(
    data.objectives,
    data.outcomes,
    data.activities,
    data.lines,
    data.events,
  );
  const budget: Cell[][] = [
    [
      "Objective",
      "Outcome",
      "Activity",
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
  const summary: Cell[][] = [
    [
      "Objective",
      "Outcome",
      "Activity",
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
  const sumRow = (o: string, oc: string, a: string, label: string, s: Summary): Cell[] => [
    o,
    oc,
    a,
    label,
    k(s.planned),
    k(s.actualToDate),
    k(s.remaining),
    k(s.stillToSpend),
    k(s.projectedBalance),
    s.planned / 100 / period.fxRate,
    s.actualToDate / 100 / period.fxRate,
  ];
  for (const o of tree) {
    const ol = activityLabel(o.objective);
    for (const oc of o.outcomes) {
      const ocl = activityLabel(oc.outcome);
      for (const a of oc.activities) {
        const al = activityLabel(a.activity);
        for (const l of a.lines) {
          const s = lineSummary(l, data.events);
          budget.push([
            ol,
            ocl,
            al,
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
          summary.push(sumRow(ol, ocl, al, l.description, s));
        }
        summary.push(
          sumRow(ol, ocl, al, a.funded ? "ACTIVITY TOTAL" : "ACTIVITY TOTAL (unfunded)", a.summary),
        );
      }
      summary.push(sumRow(ol, ocl, "", "OUTCOME TOTAL", oc.summary));
    }
    summary.push(sumRow(ol, "", "", "OBJECTIVE TOTAL", o.summary));
  }
  const grand = sumSummaries(tree.map((o) => o.summary));
  budget.push([
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    k(grand.planned),
    k(grand.actualToDate),
    k(grand.remaining),
    "",
  ]);
  summary.push(sumRow("TOTAL", "", "", "", grand));

  const lineById = new Map(data.lines.map((l) => [l.id, l]));
  const actById = new Map(data.activities.map((a) => [a.id, a]));
  const ocById = new Map(data.outcomes.map((o) => [o.id, o]));
  const objById = new Map(data.objectives.map((o) => [o.id, o]));
  const events: Cell[][] = [
    [
      "Objective",
      "Outcome",
      "Activity",
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
  for (const e of data.events) {
    const l = lineById.get(e.lineId);
    const a = l && actById.get(l.activityId);
    const oc = a && ocById.get(a.outcomeId);
    const o = oc && objById.get(oc.objectiveId);
    events.push([
      o ? activityLabel(o) : "",
      oc ? activityLabel(oc) : "",
      a ? activityLabel(a) : "",
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
      attachments.filter((x) => x.eventId === e.id).length,
      e.notes ?? "",
    ]);
  }
  return { budget, summary, events };
}

export function exportWorkbook(period: BudgetPeriod, data: ExportData, attachments: Attachment[]) {
  const sheets = buildExportSheets(period, data, attachments);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.budget), "Budget");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.summary), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.events), "Events");
  XLSX.writeFile(wb, `${period.projectName} ${period.name} budget.xlsx`.replace(/[\\/]/g, "-"));
}
