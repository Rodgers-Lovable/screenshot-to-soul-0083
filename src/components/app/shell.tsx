import { createContext, useContext, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardCheck,
  CircleHelp,
  LayoutDashboard,
  ListChecks,
  ListTree,
  Lock,
  LogOut,
  Receipt,
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
import { StudySwitcher } from "./study-switcher";
import { YearSwitcher } from "./year-switcher";
import { CreateYearDialog } from "./create-year-dialog";
import { CLOSED_HINT, useYear } from "./active-year-context";
import { TourProvider, useTour } from "./tour";

const RecordCtx = createContext<{ open: (id: string) => void; pick: () => void }>({
  open: () => {},
  pick: () => {},
});
export const useRecord = () => useContext(RecordCtx);

const NAV = [
  { to: "/", label: "Dashboard", tour: "dashboard", I: LayoutDashboard },
  { to: "/activities", label: "Activities", tour: "activities", I: ListChecks },
  { to: "/budget", label: "Budget", tour: "budget", I: ListTree },
  { to: "/spending", label: "Spending", tour: "spending", I: Receipt },
  { to: "/settings", label: "Settings", tour: "settings", I: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <CurrencyProvider>
      <TourProvider>
        <ShellInner>{children}</ShellInner>
      </TourProvider>
    </CurrencyProvider>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const { events, lines } = useBudgetData();
  const { year, closed, canEdit, isAdmin } = useYear();
  const [newYear, setNewYear] = useState(false);
  const { cur, setCur } = useCurrency();
  const tour = useTour();
  const [recordId, setRecordId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const recordEv = events.find((e) => e.id === recordId);

  const navLink = (n: (typeof NAV)[number], compact = false) => (
    <Link
      key={n.to}
      to={n.to}
      search={n.to === "/spending" ? {} : undefined}
      activeOptions={{ exact: n.to === "/" }}
      data-tour={compact ? `nav-m-${n.tour}` : `nav-${n.tour}`}
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
            <div className="-mx-2 mt-1">
              <StudySwitcher variant="sidebar" />
            </div>
            <div className="mt-1">
              <YearSwitcher className="w-full" />
            </div>
          </div>
          <nav className="flex flex-col gap-1" aria-label="Main">
            {NAV.map((n) => navLink(n))}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-6">
            <StudySwitcher variant="header" />
            <YearSwitcher className="md:hidden" />
            <div className="hidden flex-1 md:block" />
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={cur}
              onValueChange={(v) => v && setCur(v as "KES" | "USD")}
              aria-label="Display currency"
              data-tour="currency"
            >
              <ToggleGroupItem value="KES">KES</ToggleGroupItem>
              <ToggleGroupItem value="USD">USD</ToggleGroupItem>
            </ToggleGroup>
            <Button
              size="sm"
              data-tour="record-actuals"
              aria-label="Record actuals"
              disabled={!canEdit}
              title={closed ? CLOSED_HINT : undefined}
              onClick={() => setPicker(true)}
            >
              <ClipboardCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Record actuals</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="User manual"
              title="User manual"
              asChild
            >
              <Link to="/help">
                <BookOpen className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Take the tour"
              data-tour="tour-replay"
              onClick={tour.start}
            >
              <CircleHelp className="h-4 w-4" />
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
          <main className="flex-1 px-3 py-5 pb-24 sm:px-6 md:pb-8">
            {closed && (
              <div
                role="status"
                className="mb-4 flex items-start gap-2 rounded-md border bg-muted px-3 py-2 text-sm"
              >
                <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {year?.name} is closed, so it is read-only.{" "}
                  {isAdmin
                    ? "Reopen it under Settings, Years to make changes."
                    : "A study admin can reopen it."}
                </span>
              </div>
            )}
            {!year && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-3 text-sm">
                <span className="mr-auto">
                  {isAdmin
                    ? "This study has no year yet. Create the first year to start planning."
                    : "This study has no year yet. Ask a study admin to create one."}
                </span>
                {isAdmin && <Button onClick={() => setNewYear(true)}>Create the first year</Button>}
              </div>
            )}
            {children}
          </main>
        </div>
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background md:hidden"
          aria-label="Main mobile"
        >
          {NAV.map((n) => navLink(n, true))}
        </nav>
      </div>

      {isAdmin && <CreateYearDialog open={newYear} onOpenChange={setNewYear} />}
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
                  <span className="min-w-0 flex-1 wrap-break-word">{e.title}</span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {e.plannedDate ?? "no date"}
                  </span>
                  <span className="shrink-0">
                    <StatusChip status={e.status} />
                  </span>
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
