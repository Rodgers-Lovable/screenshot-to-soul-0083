import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TablePagination } from "@/components/app/table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useAudit } from "@/data/hooks";

export function AuditLog() {
  const { data = [] } = useAudit();
  const [entity, setEntity] = useState("__all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const entities = useMemo(() => [...new Set(data.map((a) => a.entity))].sort(), [data]);
  const rows = data.filter(
    (a) =>
      (entity === "__all" || a.entity === entity) &&
      (!from || a.changedAt.slice(0, 10) >= from) &&
      (!to || a.changedAt.slice(0, 10) <= to),
  );
  const pager = usePagination(rows.length);
  const shown = rows.slice(pager.start, pager.end);
  // A new filter starts back on the first page.
  const filterBy =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      pager.reset();
    };
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-end gap-3 space-y-0">
        <CardTitle className="mr-auto text-base">
          Audit log{" "}
          <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
        </CardTitle>
        <Select value={entity} onValueChange={filterBy(setEntity)}>
          <SelectTrigger className="h-9 w-40" aria-label="Entity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All entities</SelectItem>
            {entities.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          aria-label="From"
          className="h-9 w-40"
          value={from}
          onChange={(e) => filterBy(setFrom)(e.target.value)}
        />
        <Input
          type="date"
          aria-label="To"
          className="h-9 w-40"
          value={to}
          onChange={(e) => filterBy(setTo)(e.target.value)}
        />
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-200 text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
              <th>When</th>
              <th>Entity</th>
              <th>Field</th>
              <th>Old</th>
              <th>New</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id} className="border-t [&>td]:px-3 [&>td]:py-1.5">
                <td className="whitespace-nowrap tabular-nums">
                  {new Date(a.changedAt).toLocaleString()}
                </td>
                <td>{a.entity}</td>
                <td className="font-mono text-xs">{a.field}</td>
                <td className="max-w-60 truncate text-muted-foreground" title={a.oldValue ?? ""}>
                  {a.oldValue ?? "—"}
                </td>
                <td className="max-w-60 truncate" title={a.newValue ?? ""}>
                  {a.newValue ?? "—"}
                </td>
                <td>{a.changedBy}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No changes recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <TablePagination pager={pager} />
      </CardContent>
    </Card>
  );
}
