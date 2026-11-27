import { useState } from "react";
import { toast } from "sonner";
import { Lock, LockOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useYear } from "@/components/app/active-year-context";
import { CreateYearDialog } from "@/components/app/create-year-dialog";
import { useSetYearStatus } from "@/data/hooks";

export function YearsPanel() {
  const { years, isAdmin, year, select } = useYear();
  const setStatus = useSetYearStatus();
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<{ id: string; name: string; to: "open" | "closed" } | null>(
    null,
  );
  const sorted = [...years].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const nameOf = (id?: string) => years.find((y) => y.id === id)?.name;
  const confirm = () => {
    if (!target) return;
    const t = target;
    setStatus.mutate(
      { id: t.id, status: t.to },
      {
        onSuccess: () =>
          toast.success(t.to === "closed" ? `${t.name} closed` : `${t.name} reopened`),
      },
    );
    setTarget(null);
  };
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Years</CardTitle>
          <CardDescription>
            Each year has its own workplan and budget. A closed year is read-only until an admin
            reopens it.
            {!isAdmin && " Only study admins can create, close or reopen a year."}
          </CardDescription>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            {years.length ? "Start a new year" : "Create the first year"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!sorted.length && <p className="text-sm text-muted-foreground">No years yet.</p>}
        <ul className="divide-y rounded-md border text-sm">
          {sorted.map((y) => (
            <li key={y.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <div className="mr-auto min-w-0">
                <p className="font-medium">
                  {y.name}
                  {y.id === year?.id && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">Viewing</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {y.startDate} to {y.endDate} · {y.currency}
                  {y.copiedFromId &&
                    nameOf(y.copiedFromId) &&
                    ` · Copied from ${nameOf(y.copiedFromId)}`}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs">
                {y.status === "closed" ? (
                  <>
                    <Lock className="h-3 w-3" aria-hidden />
                    Closed
                  </>
                ) : (
                  "Open"
                )}
              </span>
              {y.id !== year?.id && (
                <Button size="sm" variant="ghost" onClick={() => select(y.id)}>
                  View
                </Button>
              )}
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setTarget({
                      id: y.id,
                      name: y.name,
                      to: y.status === "closed" ? "open" : "closed",
                    })
                  }
                >
                  {y.status === "closed" ? (
                    <>
                      <LockOpen className="h-4 w-4" />
                      Reopen
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Close
                    </>
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
      {isAdmin && <CreateYearDialog open={creating} onOpenChange={setCreating} />}
      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target?.to === "closed" ? `Close ${target.name}?` : `Reopen ${target?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {target?.to === "closed"
                ? "Nobody can add, edit or delete anything in this year, including spending and evidence, until it is reopened."
                : "Team members can change this year again. The reopening is recorded in the audit log."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>
              {target?.to === "closed" ? "Close year" : "Reopen year"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
