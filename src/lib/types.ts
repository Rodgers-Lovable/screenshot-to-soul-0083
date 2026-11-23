export type DurationUnit = "days" | "months" | "one-off";
export type QuantityUnit = "pax" | "SMS" | "units" | "lines" | "vehicles" | "sets";
export type EventStatus = "planned" | "done" | "cancelled";
export type CostCategory = "Personnel" | "Travel" | "Supplies" | "Contractual" | "Other";

export const DURATION_UNITS: DurationUnit[] = ["days", "months", "one-off"];
export const QUANTITY_UNITS: QuantityUnit[] = ["pax", "SMS", "units", "lines", "vehicles", "sets"];
export const COST_CATEGORIES: CostCategory[] = [
  "Personnel",
  "Travel",
  "Supplies",
  "Contractual",
  "Other",
];

export type YearStatus = "open" | "closed";

/** A workplan year. */
export interface BudgetPeriod {
  id: string;
  projectName: string;
  name: string;
  startDate: string;
  endDate: string;
  fxRate: number;
  currency: string;
  status: YearStatus;
  copiedFromId?: string;
}

export interface Component {
  id: string;
  periodId: string;
  code: string;
  name: string;
  sortOrder: number;
}

export interface BudgetLine {
  id: string;
  componentId: string;
  groupLabel?: string;
  description: string;
  quantity: number;
  quantityUnit: QuantityUnit;
  unitCostCents: number;
  duration: number;
  durationUnit: DurationUnit;
  occurrences: number;
  justification?: string;
  costCategory?: CostCategory;
  financePostedCents?: number;
  sortOrder: number;
}

export interface BudgetEvent {
  id: string;
  lineId: string;
  sequence: number;
  title: string;
  plannedDate?: string;
  location?: string;
  status: EventStatus;
  actualDate?: string;
  actualQuantity?: number;
  actualUnitCostCents?: number;
  actualDuration?: number;
  notes?: string;
}

export interface Attachment {
  id: string;
  eventId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  label?: string;
  uploadedAt: string;
}

export interface AuditEntry {
  id: string;
  entity: string;
  entityId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
  changedBy: string;
}

export type StudyRole = "admin" | "member";

export interface Study {
  id: string;
  name: string;
  role: StudyRole;
}

export interface StudyMember {
  userId: string;
  email: string;
  role: StudyRole;
  isMe: boolean;
}

export type ActivityKind = "general" | "site";
export type RepeatUnit = "weeks" | "months";

export interface Site {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt?: string;
}
export interface Objective {
  id: string;
  periodId: string;
  code: string;
  title: string;
  sortOrder: number;
  copiedFromId?: string;
}
export interface Outcome {
  id: string;
  objectiveId: string;
  code: string;
  title: string;
  sortOrder: number;
  copiedFromId?: string;
}
export interface Activity {
  id: string;
  outcomeId: string;
  code: string;
  title: string;
  kind: ActivityKind;
  output: string;
  meansOfVerification: string;
  frequencyLabel: string;
  repeatEvery?: number;
  repeatUnit?: RepeatUnit;
  notes: string;
  sortOrder: number;
  copiedFromId?: string;
}
export interface ActivityIndicator {
  id: string;
  activityId: string;
  name: string;
  target?: number;
  sortOrder: number;
  copiedFromId?: string;
}
export interface ActivityResponsible {
  id: string;
  activityId: string;
  name: string;
  userId?: string;
  sortOrder: number;
}
export interface ActivitySite {
  activityId: string;
  siteId: string;
}

/** The workplan rows of one year, plus the study's site list. */
export interface WorkplanData {
  sites: Site[];
  objectives: Objective[];
  outcomes: Outcome[];
  activities: Activity[];
  indicators: ActivityIndicator[];
  responsibles: ActivityResponsible[];
  activitySites: ActivitySite[];
  audit: AuditEntry[];
}
