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

export interface BudgetPeriod {
  id: string;
  projectName: string;
  name: string;
  startDate: string;
  endDate: string;
  fxRate: number;
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
