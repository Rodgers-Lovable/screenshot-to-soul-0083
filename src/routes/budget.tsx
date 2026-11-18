import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Info, MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBudgetData, useCreateComponent, useDuplicateLine, useRemoveComponent, useRemoveLine, useUpdateComponent } from "@/data/hooks";
import { lineFlags, lineSummary, sumSummaries, type Summary } from "@/lib/calc";
import { durationLabel } from "@/lib/format";
import type { BudgetLine, Component } from "@/lib/types";
import { Money, useFmt } from "@/components/app/currency";
import { Flags } from "@/components/app/chips";
import { LineEditor } from "@/components/app/line-editor";
import { PageHeader } from "@/components/app/shell";

export const Route = createFileRoute("/budget")({
  head: () => ({
    meta: [
      { title: "Budget · Project Budget Tracker" },
      { name: "description", content: "Components and budget lines with planned, actual and remaining amounts." },
      { property: "og:title", content: "Budget · Project Budget Tracker" },
      { property: "og:description", content: "Components and budget lines with planned, actual and remaining amounts." },
    ],
  }),
  component: BudgetPage,
});

function BudgetPage() {
  const d = useBudgetData();
  const f = useFmt();
  const [q, setQ] = useState("");
  const [editor, setEditor] = useState<{ open: boolean; line?: BudgetLine; componentId?: string }>({ open: false });
  const [del, setDel] = useState<BudgetLine | null>(null);
  const [compOpen, setCompOpen] = useState(false);
  const [delComp, setDelComp] = useState<Component | null>(null);
  const [editComp, setEditComp] = useState<Component | null>(null);

  const sums = useMemo(() => new Map(d.lines.map((l) => [l.id, lineSummary(l, d.events)])), [d.lines, d.events]);
  const total = useMemo(() => sumSummaries([...sums.values()]), [sums]);
  const filtered = d.lines.filter((l) => l.description.toLowerCase().includes(q.toLowerCase()));

  if (!d.ready) return null;
  return (
    <div>
      <PageHeader title="Budget" sub={d.period ? `${d.period.projectName} · ${d.period.name}` : undefined}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Search lines" placeholder="Search lines" className="w-56 pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => setCompOpen(true)}><Plus className="h-4 w-4" />Add component</Button>
      </PageHeader>

      <div className="space-y-4">
        {d.components.map((c) => {
          const lines = filtered.filter((l) => l.componentId === c.id);
          const all = d.lines.filter((l) => l.componentId === c.id);
          const s = sumSummaries(all.map((l) => sums.get(l.id)!));
          const groups = [...new Set(lines.map((l) => l.groupLabel ?? ""))];
          return (
            <Collapsible key={c.id} defaultOpen className="rounded-lg border bg-card">
              <div className="sticky top-14 z-20 flex items-center gap-3 rounded-t-lg border-b bg-card px-4 py-2.5">
                <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 text-left font-semibold">
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=closed]:-rotate-90" />
                  <span className="truncate">{c.code}. {c.name}</span>
                </CollapsibleTrigger>
                <span className="hidden text-xs text-muted-foreground sm:inline">Planned</span>
                <Money cents={s.planned} size="md" />
                <Button size="sm" variant="ghost" onClick={() => setEditor({ open: true, componentId: c.id })}><Plus className="h-4 w-4" />Add line</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Component actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditComp(c)}><Pencil className="h-4 w-4" />Edit component</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onSelect={() => setDelComp(c)}>Delete component</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <CollapsibleContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-275 text-sm">
                    <thead className="bg-muted/60 text-xs text-muted-foreground">
                      <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                        <th className="text-left">Description</th><th className="text-right">Qty</th><th className="text-left">Unit</th><th className="text-right">Unit cost</th>
                        <th className="text-left">Duration</th><th className="text-right">Occ.</th><th className="text-right">Planned</th><th className="text-right">Actual</th>
                        <th className="text-right">Remaining</th><th className="text-left">Progress</th><th className="text-left">Flags</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g) => {
                        const gl = lines.filter((l) => (l.groupLabel ?? "") === g);
                        const gs = sumSummaries(gl.map((l) => sums.get(l.id)!));
                        return [
                          g && (
                            <tr key={`g-${g}`} className="bg-secondary/60">
                              <td colSpan={6} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</td>
                              <td className="px-3 py-1.5 text-right"><Money cents={gs.planned} /></td>
                              <td className="px-3 py-1.5 text-right"><Money cents={gs.actualToDate} /></td>
                              <td className="px-3 py-1.5 text-right"><Money cents={gs.remaining} /></td>
                              <td colSpan={3} />
                            </tr>
                          ),
                          ...gl.map((l) => <LineRow key={l.id} line={l} s={sums.get(l.id)!} onEdit={() => setEditor({ open: true, line: l })} onDelete={() => setDel(l)} />),
                        ];
                      })}
                      {!lines.length && <tr><td colSpan={12} className="px-3 py-4 text-center text-muted-foreground">{q ? "No matching lines." : "No lines yet."}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      <div className="sticky bottom-14 mt-4 flex items-center justify-between rounded-lg border bg-card px-4 py-3 shadow-sm md:bottom-0">
        <span className="font-semibold">Period total</span>
        <span className="text-right tabular-nums">
          <span className="block font-semibold" data-testid="grand-total-kes">{f.kes(total.planned)}</span>
          <span className="block text-xs text-muted-foreground" data-testid="grand-total-usd">{f.usd(total.planned)}</span>
        </span>
      </div>

      <LineEditor open={editor.open} onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))} line={editor.line} componentId={editor.componentId} />
      <DeleteLineDialog line={del} onClose={() => setDel(null)} hasDone={!!del && d.events.some((e) => e.lineId === del.id && e.status === "done")} />
      <DeleteComponentDialog component={delComp} onClose={() => setDelComp(null)} lineCount={delComp ? d.lines.filter((l) => l.componentId === delComp.id).length : 0} eventCount={delComp ? d.events.filter((e) => d.lines.some((l) => l.id === e.lineId && l.componentId === delComp.id)).length : 0} />
      <ComponentDialog open={compOpen} onOpenChange={setCompOpen} nextCode={String(d.components.length + 1)} />
      <ComponentDialog open={!!editComp} onOpenChange={(o) => { if (!o) setEditComp(null); }} nextCode="" component={editComp} />
    </div>
  );
}

function LineRow({ line: l, s, onEdit, onDelete }: { line: BudgetLine; s: Summary; onEdit: () => void; onDelete: () => void }) {
  const f = useFmt();
  const nav = useNavigate();
  const dup = useDuplicateLine();
  const go = () => nav({ to: "/budget/lines/$id", params: { id: l.id } });
  return (
    <tr className="h-10 cursor-pointer border-t hover:bg-muted/40 [&>td]:px-3 [&>td]:py-1" onClick={go} onKeyDown={(e) => e.key === "Enter" && go()} tabIndex={0}>
      <td className="max-w-[320px]">
        <span className="flex items-center gap-1.5">
          <span className="truncate">{l.description}</span>
          {l.justification && (
            <Tooltip>
              <TooltipTrigger onClick={(e) => e.stopPropagation()} aria-label="Justification"><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
              <TooltipContent className="max-w-xs">{l.justification}</TooltipContent>
            </Tooltip>
          )}
        </span>
      </td>
      <td className="num">{l.quantity.toLocaleString()}</td>
      <td className="text-muted-foreground">{l.quantityUnit}</td>
      <td className="num">{f.kes(l.unitCostCents)}</td>
      <td className="text-muted-foreground">{durationLabel(l.duration, l.durationUnit)}</td>
      <td className="num">{l.occurrences}</td>
      <td className="text-right"><Money cents={s.planned} /></td>
      <td className="text-right"><Money cents={s.actualToDate} tone={s.actualToDate > s.planned ? "danger" : undefined} /></td>
      <td className="text-right"><Money cents={s.remaining} tone="auto" /></td>
      <td>
        <div className="h-1.5 w-20 rounded-full bg-muted" title={`${Math.round(s.progressPct * 100)}%`}>
          <div className={`h-1.5 rounded-full ${s.progressPct > 1 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, s.progressPct * 100)}%` }} />
        </div>
      </td>
      <td><Flags flags={lineFlags(s)} /></td>
      <td onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Line actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => dup.mutate(l.id, { onSuccess: () => toast.success("Line duplicated") })}>Duplicate</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onSelect={onDelete}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function DeleteLineDialog({ line, onClose, hasDone }: { line: BudgetLine | null; onClose: () => void; hasDone: boolean }) {
  const rm = useRemoveLine();
  const [typed, setTyped] = useState("");
  const ok = !hasDone || typed.trim() === line?.description;
  useEffect(() => { setTyped(""); }, [line?.id]);
  return (
    <Dialog open={!!line} onOpenChange={(o) => { if (!o) { setTyped(""); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete line?</DialogTitle>
          <DialogDescription>This deletes “{line?.description}”, its events and their evidence files.</DialogDescription>
        </DialogHeader>
        {hasDone && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">This line has completed events.</p>
            <ConfirmLabel id="confirm-name" text={line?.description} />
            <Input id="confirm-name" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={line?.description} autoComplete="off" />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={!ok} onClick={() => line && rm.mutate(line.id, { onSuccess: () => { toast.success("Line deleted"); setTyped(""); onClose(); } })}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ComponentDialog({ open, onOpenChange, nextCode, component }: { open: boolean; onOpenChange: (o: boolean) => void; nextCode: string; component?: Component | null }) {
  const create = useCreateComponent();
  const update = useUpdateComponent();
  const [name, setName] = useState("");
  const [code, setCode] = useState(nextCode);
  useEffect(() => { if (open) { setCode(component?.code ?? nextCode); setName(component?.name ?? ""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (msg: string) => ({ onSuccess: () => { toast.success(msg); onOpenChange(false); }, onError: (e: Error) => toast.error(e.message) });
  const save = () => {
    const input = { code: code.trim(), name: name.trim() };
    if (component) update.mutate({ id: component.id, patch: input }, done("Component updated"));
    else create.mutate(input, done("Component added"));
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{component ? "Edit component" : "Add component"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-[80px_1fr] gap-3">
          <div className="space-y-1"><Label htmlFor="ccode">Code</Label><Input id="ccode" value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="cname">Name</Label><Input id="cname" value={name} onChange={(e) => setName(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button disabled={!name.trim() || create.isPending || update.isPending} onClick={save}>{component ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmLabel({ id, text }: { id: string; text?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    // Stop the label from moving focus to the input.
    e.preventDefault();
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
      () => toast.error("Could not copy"),
    );
  };
  return (
    <Label htmlFor={id} className="block text-sm/6 font-normal text-muted-foreground">
      Type <code className="rounded bg-muted box-decoration-clone px-1 py-0.5 font-mono text-xs text-foreground">{text}</code>
      <button type="button" onClick={copy} aria-label={copied ? "Copied" : "Copy name"} className="mx-1 inline-flex size-5 items-center justify-center rounded align-middle text-muted-foreground hover:bg-muted hover:text-foreground">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      to confirm.
    </Label>
  );
}

function DeleteComponentDialog({ component, onClose, lineCount, eventCount }: { component: Component | null; onClose: () => void; lineCount: number; eventCount: number }) {
  const rm = useRemoveComponent();
  const [typed, setTyped] = useState("");
  const close = () => { setTyped(""); onClose(); };
  useEffect(() => { setTyped(""); }, [component?.id]);
  const ok = typed.trim() === component?.name;
  return (
    <Dialog open={!!component} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete component?</DialogTitle>
          <DialogDescription>
            This permanently deletes “{component?.code}. {component?.name}” with its {lineCount} line{lineCount === 1 ? "" : "s"}, {eventCount} event{eventCount === 1 ? "" : "s"} and all their evidence files.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <ConfirmLabel id="confirm-comp" text={component?.name} />
          <Input id="confirm-comp" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={component?.name} autoComplete="off" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button variant="destructive" disabled={!ok || rm.isPending} onClick={() => component && rm.mutate(component.id, { onSuccess: () => { toast.success("Component deleted"); close(); }, onError: (e) => toast.error(e.message) })}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
