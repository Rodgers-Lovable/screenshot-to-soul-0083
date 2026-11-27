import { createContext, useContext } from "react";
import type { BudgetPeriod } from "@/lib/types";

export interface ActiveYear {
  year: BudgetPeriod | null;
  years: BudgetPeriod[];
  select: (id: string) => void;
  /** Admin of the active study. */
  isAdmin: boolean;
  closed: boolean;
  /** False when there is no year, or it is closed. */
  canEdit: boolean;
}
export const ActiveYearCtx = createContext<ActiveYear | null>(null);

export function useYear(): ActiveYear {
  const v = useContext(ActiveYearCtx);
  if (!v) throw new Error("useYear needs a YearGate");
  return v;
}

/** Message for a control that is off because of the year or the role. */
export const CLOSED_HINT = "This year is closed. A study admin can reopen it.";
