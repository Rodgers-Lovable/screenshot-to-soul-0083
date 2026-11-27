import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useYear } from "@/components/app/active-year-context";
import { ActivityPicker, UnitInput } from "@/components/app/budget-fields";
import { useBudgetData, useImportLines } from "@/data/hooks";
import { activityOptions, unitSuggestions } from "@/lib/budget-tree";
import {
  downloadImportTemplate,
  parseBudgetRows,
  readWorkbook,
  type ParsedBlock,
  type ParsedRow,
} from "@/lib/excel";
import { formatKES, kesToCents } from "@/lib/format";
import { DURATION_UNITS, QUANTITY_UNITS } from "@/lib/types";

export function ImportPanel() {
  const { objectives, outcomes, activities, lines } = useBudgetData();
  const { canEdit } = useYear();
  const imp = useImportLines();
  const [activityId, setActivityId] = useState("");
  const [blocks, setBlocks] = useState<(ParsedBlock & { group: string })[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const options = useMemo(
    () => activityOptions({ objectives, outcomes, activities }),
    [objectives, outcomes, activities],
  );
  const qtyUnits = useMemo(
    () =>
      unitSuggestions(
        QUANTITY_UNITS,
        lines.map((l) => l.quantityUnit),
      ),
    [lines],
  );
  const durUnits = useMemo(
    () =>
      unitSuggestions(
        DURATION_UNITS,
        lines.map((l) => l.durationUnit),
      ),
    [lines],
  );

  async function onFile(file?: File) {
    if (!file) return;
    try {
      const parsed = parseBudgetRows(await readWorkbook(file));
      if (!parsed.rows.length) {
        toast.error(
          "No budget rows found. The sheet needs a header row with a Description column.",
        );
        return;
      }
      setFileName(file.name);
      setRows(parsed.rows);
      setBlocks(parsed.blocks.map((b) => ({ ...b, group: b.heading })));
    } catch {
      toast.error("Couldn't read that file. Upload an .xlsx workbook.");
    }
  }
  const setRow = (i: number, patch: Partial<ParsedRow>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const calc = (r: ParsedRow) => r.quantity * r.unitCost * r.duration * r.occurrences;

  function confirm() {
    const payload = rows.map((r) => {
      const b = blocks.find((x) => x.index === r.block)!;
      return {
        description: r.description,
        groupLabel: b.group.trim() || undefined,
        quantity: r.quantity,
        quantityUnit: r.quantityUnit,
        unitCostCents: kesToCents(r.unitCost),
        duration: r.duration,
        durationUnit: r.durationUnit,
        occurrences: r.occurrences,
      };
    });
    imp.mutate(
      { activityId, rows: payload },
      {
        onSuccess: (n) => {
          toast.success(`Imported ${n} line(s)`);
          setRows([]);
          setBlocks([]);
          setFileName("");
        },
      },
    );
  }
  const numCell = (
    i: number,
    k: "quantity" | "unitCost" | "duration" | "occurrences",
    val: number,
  ) => (
    <Input
      type="number"
      step="any"
      aria-label={k}
      className="h-8 w-24 text-right tabular-nums"
      value={val}
      onChange={(e) => setRow(i, { [k]: Number(e.target.value) })}
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import from Excel</CardTitle>
        <CardDescription>
          Upload an .xlsx budget and choose the one activity every row is added to. Rows without
          numbers become group labels you can edit. Not sure of the layout? Start from the template.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canEdit && (
          <p className="text-sm text-muted-foreground">
            Import is off because there is no open year to import into.
          </p>
        )}
        <div className="max-w-md space-y-1">
          <Label>Add the lines to this activity</Label>
          <ActivityPicker
            value={activityId}
            onChange={setActivityId}
            options={options}
            disabled={!canEdit}
            label="Import into activity"
          />
          {!options.length && canEdit && (
            <p className="text-xs text-muted-foreground">
              This year has no activities. Add one under Activities first.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${canEdit ? "cursor-pointer hover:bg-muted" : "pointer-events-none opacity-50"}`}
          >
            <Upload className="h-4 w-4" />
            {fileName || "Choose .xlsx file"}
            <input
              type="file"
              accept=".xlsx"
              disabled={!canEdit}
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </Label>
          <Button variant="ghost" size="sm" onClick={downloadImportTemplate}>
            <Download className="h-4 w-4" />
            Download template
          </Button>
        </div>
        {blocks.map((b) => (
          <div key={b.index} className="rounded-md border">
            <div className="flex flex-wrap items-end gap-3 border-b bg-muted/50 p-3">
              <p className="mr-auto font-medium">{b.heading}</p>
              <div className="space-y-1">
                <Label className="text-xs">Group (optional)</Label>
                <Input
                  className="h-8 w-44"
                  value={b.group}
                  onChange={(e) =>
                    setBlocks((all) =>
                      all.map((x) => (x.index === b.index ? { ...x, group: e.target.value } : x)),
                    )
                  }
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-275 text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Unit cost</th>
                    <th>Duration</th>
                    <th>Dur. unit</th>
                    <th>Occ.</th>
                    <th className="text-right!">Calculated</th>
                    <th className="text-right!">In file</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) =>
                    r.block !== b.index ? null : (
                      <tr key={i} className="border-t [&>td]:px-2 [&>td]:py-1">
                        <td>
                          <Input
                            className="h-8 min-w-56"
                            value={r.description}
                            onChange={(e) => setRow(i, { description: e.target.value })}
                          />
                        </td>
                        <td>{numCell(i, "quantity", r.quantity)}</td>
                        <td>
                          <UnitInput
                            aria-label="Unit"
                            className="h-8 min-w-28"
                            value={r.quantityUnit}
                            suggestions={qtyUnits}
                            onChange={(v) => setRow(i, { quantityUnit: v })}
                          />
                        </td>
                        <td>{numCell(i, "unitCost", r.unitCost)}</td>
                        <td>{numCell(i, "duration", r.duration)}</td>
                        <td>
                          <UnitInput
                            aria-label="Duration unit"
                            className="h-8 min-w-28"
                            value={r.durationUnit}
                            suggestions={durUnits}
                            onChange={(v) => setRow(i, { durationUnit: v })}
                          />
                        </td>
                        <td>{numCell(i, "occurrences", r.occurrences)}</td>
                        <td className="num">{formatKES(kesToCents(calc(r)))}</td>
                        <td className="num">
                          {r.fileAmount === null ? "—" : formatKES(kesToCents(r.fileAmount))}
                          {r.fileAmount !== null && Math.abs(r.fileAmount - calc(r)) > 0.5 && (
                            <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-warning-soft px-1 text-[11px] text-warning-foreground">
                              <AlertTriangle className="h-3 w-3" />
                              differs
                            </span>
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {rows.length > 0 && (
          <Button onClick={confirm} loading={imp.isPending} disabled={!canEdit || !activityId}>
            Import {rows.length} line(s)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
