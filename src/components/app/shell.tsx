import { createContext, useContext, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  ListTree,
  LogOut,
  Settings,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBudgetData } from "@/data/hooks";
import { CurrencyProvider, useCurrency } from "./currency";
import { RecordActualsForm } from "./record-actuals";
import { StatusChip } from "./chips";

const RecordCtx = createContext<{ open: (id: string) => void; pick: () => void }>({
  open: () => {},
  pick: () => {},
});
export const useRecord = () => useContext(RecordCtx);

const NAV = [
  { to: "/", label: "Dashboard", I: LayoutDashboard },
  { to: "/budget", label: "Budget", I: ListTree },
  { to: "/events", label: "Events", I: CalendarDays },
  { to: "/settings", label: "Settings", I: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <CurrencyProvider>
      <ShellInner>{children}</ShellInner>
    </CurrencyProvider>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const { period, events, lines } = useBudgetData();
  const { cur, setCur } = useCurrency();
  const [recordId, setRecordId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const recordEv = events.find((e) => e.id === recordId);

  const navLink = (n: (typeof NAV)[number], compact = false) => (
    <Link
      key={n.to}
      to={n.to}
      search={n.to === "/events" ? {} : undefined}
      activeOptions={{ exact: n.to === "/" }}
      className={
        compact
          ? "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground data-[status=active]:text-primary"
          : "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground data-[status=active]:font-medium"
      }
    >
      <n.I className="h-4 w-4" aria-hidden />
      {n.label}
    </Link>
  );

  return (
    <RecordCtx.Provider value={{ open: setRecordId, pick: () => setPicker(true) }}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar p-4 md:flex">
          <div className="mb-6 px-2">
            <p className="text-xs uppercase tracking-widest text-sidebar-primary">Budget Tracker</p>
            <p className="mt-1 text-sm font-medium text-sidebar-accent-foreground">
              {period ? `${period.projectName} · ${period.name}` : "No period"}
            </p>
          </div>
          <nav className="flex flex-col gap-1" aria-label="Main">
            {NAV.map((n) => navLink(n))}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-6">
            <p className="min-w-0 flex-1 truncate text-sm font-medium md:hidden">
              {period ? `${period.projectName} · ${period.name}` : "Budget"}
            </p>
            <div className="hidden flex-1 md:block" />
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={cur}
              onValueChange={(v) => v && setCur(v as "KES" | "USD")}
              aria-label="Display currency"
            >
              <ToggleGroupItem value="KES">KES</ToggleGroupItem>
              <ToggleGroupItem value="USD">USD</ToggleGroupItem>
            </ToggleGroup>
            <Button size="sm" onClick={() => setPicker(true)}>
              <ClipboardCheck className="h-4 w-4" />
              Record actuals
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Sign out"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </header>
          <main className="flex-1 px-3 py-5 pb-24 sm:px-6 md:pb-8">{children}</main>
        </div>
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background md:hidden"
          aria-label="Main mobile"
        >
          {NAV.map((n) => navLink(n, true))}
        </nav>
      </div>

      <CommandDialog open={picker} onOpenChange={setPicker}>
        <CommandInput placeholder="Find an event…" />
        <CommandList>
          <CommandEmpty>No events found.</CommandEmpty>
          <CommandGroup heading="Events">
            {[...events]
              .sort((a, b) => (a.plannedDate ?? "9").localeCompare(b.plannedDate ?? "9"))
              .map((e) => (
                <CommandItem
                  key={e.id}
                  value={`${e.title} ${e.plannedDate ?? ""} ${e.id}`}
                  onSelect={() => {
                    setPicker(false);
                    setRecordId(e.id);
                  }}
                >
                  <span className="flex-1 truncate">{e.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.plannedDate ?? "no date"}
                  </span>
                  <StatusChip status={e.status} />
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <Dialog open={!!recordId} onOpenChange={(o) => !o && setRecordId(null)}>
        <DialogContent className="h-dvh max-h-dvh w-full max-w-full overflow-y-auto rounded-none p-4 sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-lg sm:p-6">
          <DialogHeader className="text-left">
            <DialogTitle className="pr-6">Record actuals</DialogTitle>
            <DialogDescription>
              {recordEv?.title}
              {recordEv && ` · ${lines.find((l) => l.id === recordEv.lineId)?.quantityUnit ?? ""}`}
            </DialogDescription>
          </DialogHeader>
          {recordId && <RecordActualsForm eventId={recordId} onDone={() => setRecordId(null)} />}
        </DialogContent>
      </Dialog>
    </RecordCtx.Provider>
  );
}

export function PageHeader({
  title,
  children,
  sub,
}: {
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
