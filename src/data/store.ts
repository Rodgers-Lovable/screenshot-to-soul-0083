import type {
  Attachment,
  AuditEntry,
  BudgetEvent,
  BudgetLine,
  BudgetPeriod,
  Component,
} from "@/lib/types";

export interface StoreData {
  period: BudgetPeriod | null;
  components: Component[];
  lines: BudgetLine[];
  events: BudgetEvent[];
  attachments: Attachment[];
  audit: AuditEntry[];
}

export const eventTitle = (desc: string, seq: number, occ: number) =>
  occ === 1 ? desc : `${desc} – occurrence ${seq} of ${occ}`;
