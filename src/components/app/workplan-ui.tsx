import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Circle, Layers, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActivityKind, RepeatUnit } from "@/lib/types";
import {
  activityFormValid,
  blankActivity,
  validateRepeat,
  type ActivityFormValue,
} from "@/lib/workplan";
import { cn } from "@/lib/utils";

export function KindChip({ kind }: { kind: ActivityKind }) {
  const I = kind === "site" ? MapPin : Layers;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded border bg-card px-1.5 py-0.5 text-[11px] font-medium">
      <I className="h-3 w-3" aria-hidden />
      {kind === "site" ? "Site" : "General"}
    </span>
  );
}

/** Delivery tracking comes later, so every activity reads as planned for now. */
export function PlannedChip() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded border bg-card px-1.5 py-0.5 text-[11px] font-medium">
      <Circle className="h-3 w-3" aria-hidden />
      Planned
    </span>
  );
}

export function DuplicateCodeWarning({ className }: { className?: string }) {
  return (
    <span
      title="Another item at this level uses the same code"
      className={cn("inline-flex items-center text-warning-foreground", className)}
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">Another item at this level uses the same code</span>
    </span>
  );
}

export function ConfirmDelete({
  open,
  title,
  description,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Code and title, used for both objectives and outcomes. */
export function CodeTitleDialog({
  open,
  heading,
  description,
  initial,
  onClose,
  onSave,
  pending,
}: {
  open: boolean;
  heading: string;
  description?: string;
  initial?: { code: string; title: string };
  onClose: () => void;
  onSave: (v: { code: string; title: string }) => void;
  pending?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {open && (
          <CodeTitleForm
            key={initial?.title ?? "new"}
            initial={initial}
            onSave={onSave}
            pending={pending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
function CodeTitleForm({
  initial,
  onSave,
  pending,
}: {
  initial?: { code: string; title: string };
  onSave: (v: { code: string; title: string }) => void;
  pending?: boolean;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) onSave({ code, title });
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="wp-code">Code (optional)</Label>
        <Input id="wp-code" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="wp-title">Title</Label>
        <Textarea
          id="wp-title"
          rows={3}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={!title.trim() || pending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

const NONE = "__none";

/** All activity fields. Used by the add dialog and the detail page. */
export function ActivityFields({
  value,
  onChange,
  idPrefix,
}: {
  value: ActivityFormValue;
  onChange: (v: ActivityFormValue) => void;
  idPrefix: string;
}) {
  const set = (patch: Partial<ActivityFormValue>) => onChange({ ...value, ...patch });
  const repeatError = validateRepeat(value.repeatEvery, value.repeatUnit);
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={id("code")}>Code (optional)</Label>
          <Input
            id={id("code")}
            value={value.code}
            onChange={(e) => set({ code: e.target.value })}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Kind</Label>
          <Select value={value.kind} onValueChange={(k) => set({ kind: k as ActivityKind })}>
            <SelectTrigger aria-label="Kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="site">Site: happens at chosen sites</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={id("title")}>Title</Label>
        <Textarea
          id={id("title")}
          rows={2}
          value={value.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={id("output")}>Output</Label>
        <Textarea
          id={id("output")}
          rows={2}
          value={value.output}
          onChange={(e) => set({ output: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={id("mov")}>Means of verification</Label>
        <Textarea
          id={id("mov")}
          rows={2}
          value={value.meansOfVerification}
          onChange={(e) => set({ meansOfVerification: e.target.value })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={id("freq")}>Frequency</Label>
          <Input
            id={id("freq")}
            placeholder="Monthly, Ad hoc, Varied"
            value={value.frequencyLabel}
            onChange={(e) => set({ frequencyLabel: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={id("every")}>Repeats every</Label>
          <Input
            id={id("every")}
            type="number"
            min={1}
            step={1}
            value={value.repeatEvery ?? ""}
            onChange={(e) =>
              set({ repeatEvery: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </div>
        <div className="space-y-1">
          <Label>Unit</Label>
          <Select
            value={value.repeatUnit ?? NONE}
            onValueChange={(u) => set({ repeatUnit: u === NONE ? undefined : (u as RepeatUnit) })}
          >
            <SelectTrigger aria-label="Repeat unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No repeat rule</SelectItem>
              <SelectItem value="weeks">Weeks</SelectItem>
              <SelectItem value="months">Months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {repeatError && <p className="text-sm text-destructive">{repeatError}</p>}
      <div className="space-y-1">
        <Label htmlFor={id("notes")}>Notes</Label>
        <Textarea
          id={id("notes")}
          rows={2}
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
    </div>
  );
}

export function ActivityDialog({
  open,
  heading,
  onClose,
  onSave,
  pending,
}: {
  open: boolean;
  heading: string;
  onClose: () => void;
  onSave: (v: ActivityFormValue) => void;
  pending?: boolean;
}) {
  const [v, setV] = useState<ActivityFormValue>(blankActivity);
  useEffect(() => {
    if (!open) setV(blankActivity);
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-dvh overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            Indicators, responsible people and sites are added on the activity's page.
          </DialogDescription>
        </DialogHeader>
        <ActivityFields value={v} onChange={setV} idPrefix="new-activity" />
        <DialogFooter>
          <Button disabled={!activityFormValid(v) || pending} onClick={() => onSave(v)}>
            Add activity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
