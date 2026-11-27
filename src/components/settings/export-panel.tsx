import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBudgetData } from "@/data/hooks";
import { exportWorkbook } from "@/lib/excel";

export function ExportPanel() {
  const d = useBudgetData();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Export to Excel</CardTitle>
        <CardDescription>
          A budget sheet and a summary sheet grouped by objective, outcome and activity, with
          carryover per line, and an events sheet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          disabled={!d.period}
          onClick={() => d.period && exportWorkbook(d.period, d, d.attachments)}
        >
          <Download className="h-4 w-4" />
          Download .xlsx
        </Button>
      </CardContent>
    </Card>
  );
}
