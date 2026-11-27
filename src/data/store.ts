import type {
  ActivityIndicator,
  ActivitySite,
  Attachment,
  AuditEntry,
  BudgetEvent,
  BudgetLine,
  BudgetPeriod,
  Objective,
  Outcome,
  Activity,
  Delivery,
  DeliveryResult,
  Site,
} from "@/lib/types";

export interface StoreData {
  period: BudgetPeriod | null;
  /** The year's workplan, read only here. It is written through the workplan repository. */
  objectives: Objective[];
  outcomes: Outcome[];
  activities: Activity[];
  /** Read only here, so deliveries can be checked against sites and indicators. */
  sites: Site[];
  activitySites: ActivitySite[];
  indicators: ActivityIndicator[];
  lines: BudgetLine[];
  deliveries: Delivery[];
  results: DeliveryResult[];
  events: BudgetEvent[];
  attachments: Attachment[];
  audit: AuditEntry[];
}

export const eventTitle = (desc: string, seq: number, occ: number) =>
  occ === 1 ? desc : `${desc} – occurrence ${seq} of ${occ}`;
