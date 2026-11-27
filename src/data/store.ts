import type {
  Attachment,
  AuditEntry,
  BudgetEvent,
  BudgetLine,
  BudgetPeriod,
  Objective,
  Outcome,
  Activity,
} from "@/lib/types";

export interface StoreData {
  period: BudgetPeriod | null;
  /** The year's workplan, read only here. It is written through the workplan repository. */
  objectives: Objective[];
  outcomes: Outcome[];
  activities: Activity[];
  lines: BudgetLine[];
  events: BudgetEvent[];
  attachments: Attachment[];
  audit: AuditEntry[];
}

export const eventTitle = (desc: string, seq: number, occ: number) =>
  occ === 1 ? desc : `${desc} – occurrence ${seq} of ${occ}`;
