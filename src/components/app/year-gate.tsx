import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { rememberYear, savedYearId, setActivePeriodId } from "@/data/active-study";
import { useYears } from "@/data/hooks";
import { todayISO } from "@/lib/format";
import { pickDefaultYear } from "@/lib/workplan";
import { ActiveYearCtx } from "./active-year-context";
import { useActiveStudy } from "./active-study-context";

/** Picks the active year for the study and remounts the app when it changes. */
export function YearGate({ children }: { children: ReactNode }) {
  const { study } = useActiveStudy();
  const years = useYears(study.id);
  const [chosen, setChosen] = useState<string | null>(null);

  if (years.isPending)
    return <div className="p-8 text-sm text-muted-foreground">Loading years…</div>;
  if (years.isError)
    return (
      <div className="space-y-3 p-8 text-sm">
        <p className="text-muted-foreground">Could not load the years: {years.error.message}</p>
        <Button onClick={() => years.refetch()}>Try again</Button>
      </div>
    );

  const list = years.data;
  const year = pickDefaultYear(list, todayISO(), chosen ?? savedYearId(study.id));
  setActivePeriodId(year?.id ?? null);
  const closed = year?.status === "closed";
  const select = (id: string) => {
    rememberYear(study.id, id);
    setChosen(id);
  };
  return (
    <ActiveYearCtx.Provider
      value={{
        year,
        years: list,
        select,
        isAdmin: study.role === "admin",
        closed,
        canEdit: !!year && !closed,
      }}
    >
      <div key={year?.id ?? "none"} className="contents">
        {children}
      </div>
    </ActiveYearCtx.Provider>
  );
}
