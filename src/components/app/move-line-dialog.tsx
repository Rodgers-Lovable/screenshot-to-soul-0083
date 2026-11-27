import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useBudgetData, useUpdateLine } from "@/data/hooks";
import { activityOptions, validateLineMove } from "@/lib/budget-tree";
import type { BudgetLine } from "@/lib/types";
import { ActivityPicker } from "./budget-fields";

/** Moves a line to another activity of the same year. */
export function MoveLineDialog({
  line,
  onClose,
}: {
  line: BudgetLine | null;
  onClose: () => void;
}) {
  const { objectives, outcomes, activities } = useBudgetData();
  const update = useUpdateLine();
  const [target, setTarget] = useState("");
  const chain = useMemo(
    () => ({ objectives, outcomes, activities }),
    [objectives, outcomes, activities],
  );
  const options = useMemo(() => activityOptions(chain), [chain]);
  useEffect(() => setTarget(""), [line?.id]);
  const problem = line && target ? validateLineMove(line, target, chain) : null;
  return (
    <Dialog open={!!line} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move line</DialogTitle>
          <DialogDescription>
            Moves “{line?.description}” with its spending records and evidence to another activity
            of this year.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Move to</Label>
          <ActivityPicker
            value={target}
            onChange={setTarget}
            options={options}
            exclude={line?.activityId}
            label="Move to activity"
          />
          {problem && <p className="text-xs text-destructive">{problem}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={update.isPending}
            disabled={!line || !target || !!problem}
            onClick={() =>
              line &&
              update.mutate(
                { id: line.id, patch: { activityId: target } },
                {
                  onSuccess: () => {
                    toast.success("Line moved");
                    onClose();
                  },
                },
              )
            }
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
