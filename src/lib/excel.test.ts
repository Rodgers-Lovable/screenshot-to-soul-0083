import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildImportTemplate, parseBudgetRows } from "./excel";

function roundTrip(rows: unknown[][]): unknown[][] {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Budget");
  const back = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  const ws = back.Sheets[back.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
}

describe("import template", () => {
  it("parses back into the example lines and groups", () => {
    const { blocks, rows } = parseBudgetRows(roundTrip(buildImportTemplate().budget));
    expect(blocks.map((b) => b.heading)).toEqual(["Training workshop", "Field follow-up"]);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toMatchObject({
      description: "Participant lunch",
      quantity: 25,
      quantityUnit: "pax",
      unitCost: 800,
      duration: 2,
      durationUnit: "days",
      occurrences: 1,
      fileAmount: 40000,
    });
    expect(rows[2]).toMatchObject({ durationUnit: "one-off", duration: 1, occurrences: 3 });
    expect(rows[3]).toMatchObject({ quantityUnit: "lines", durationUnit: "months", duration: 3 });
  });

  it("writes totals that match the app's own maths", () => {
    const { rows } = parseBudgetRows(roundTrip(buildImportTemplate().budget));
    for (const r of rows) {
      expect(r.fileAmount).toBe(r.quantity * r.unitCost * r.duration * r.occurrences);
    }
  });
});
