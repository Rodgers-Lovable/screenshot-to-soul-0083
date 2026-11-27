// Repository contracts. The UI reaches these only through hooks in src/data/hooks.ts.
import type {
  Activity,
  Attachment,
  AuditEntry,
  BudgetEvent,
  BudgetLine,
  BudgetPeriod,
  Delivery,
  DeliveryResult,
  Objective,
  Outcome,
  Site,
  Study,
  StudyMember,
  WorkplanData,
} from "@/lib/types";
import type { Repeat } from "@/lib/calc";
import type { YearInput } from "../remote";

export interface PeriodRepo {
  get(): Promise<BudgetPeriod | null>;
  /** Admins only. Goes through a database function, never a direct table write. */
  update(patch: Partial<BudgetPeriod>): Promise<void>;
}
export interface YearRepo {
  list(studyId: string): Promise<BudgetPeriod[]>;
  create(
    studyId: string,
    v: YearInput,
    copyFromId: string | null,
    copyBudgetLines?: boolean,
  ): Promise<string>;
  setStatus(id: string, status: "open" | "closed"): Promise<void>;
}
export type ObjectiveInput = Pick<Objective, "code" | "title">;
export type OutcomeInput = Pick<Outcome, "code" | "title">;
export type ActivityInput = Pick<Activity, "code" | "title" | "kind"> &
  Partial<
    Pick<
      Activity,
      "output" | "meansOfVerification" | "frequencyLabel" | "repeatEvery" | "repeatUnit" | "notes"
    >
  >;
export type MoveDir = "up" | "down";
export interface MultiAdd {
  added: number;
  skipped: string[];
}
export interface WorkplanRepo {
  get(): Promise<Omit<WorkplanData, "audit">>;
  addObjective(input: ObjectiveInput): Promise<Objective>;
  updateObjective(id: string, patch: Partial<ObjectiveInput>): Promise<Objective>;
  removeObjective(id: string): Promise<void>;
  moveObjective(id: string, dir: MoveDir): Promise<void>;
  addOutcome(objectiveId: string, input: OutcomeInput): Promise<Outcome>;
  updateOutcome(id: string, patch: Partial<OutcomeInput>): Promise<Outcome>;
  removeOutcome(id: string): Promise<void>;
  moveOutcome(id: string, dir: MoveDir): Promise<void>;
  addActivity(outcomeId: string, input: ActivityInput): Promise<Activity>;
  /** Changing a site activity to general clears its sites in the same write. */
  updateActivity(id: string, patch: Partial<ActivityInput>): Promise<Activity>;
  removeActivity(id: string): Promise<void>;
  moveActivity(id: string, dir: MoveDir): Promise<void>;
  /** Comma-separated names, one transaction. Target applies only to a single name. */
  addIndicators(activityId: string, input: { text: string; target?: number }): Promise<MultiAdd>;
  updateIndicator(id: string, patch: { name?: string; target?: number | null }): Promise<void>;
  removeIndicator(id: string): Promise<void>;
  /** Comma-separated names, one transaction. A user link applies only to a single name. */
  addResponsibles(activityId: string, input: { text: string; userId?: string }): Promise<MultiAdd>;
  updateResponsible(id: string, patch: { name?: string; userId?: string | null }): Promise<void>;
  removeResponsible(id: string): Promise<void>;
  setActivitySites(activityId: string, siteIds: string[]): Promise<void>;
}
export interface SiteRepo {
  add(name: string): Promise<Site>;
  rename(id: string, name: string): Promise<void>;
  setArchived(id: string, archived: boolean): Promise<void>;
}
export type LineInput = Omit<BudgetLine, "id" | "sortOrder" | "copiedFromId">;
export interface LineRepo {
  list(): Promise<BudgetLine[]>;
  create(input: LineInput): Promise<BudgetLine>;
  update(id: string, patch: Partial<BudgetLine>): Promise<BudgetLine>;
  duplicate(id: string): Promise<BudgetLine>;
  remove(id: string): Promise<void>;
}
export interface EventRepo {
  list(): Promise<BudgetEvent[]>;
  update(id: string, patch: Partial<BudgetEvent>): Promise<BudgetEvent>;
  /** Sets planned dates by sequence. Done and cancelled events are left alone. */
  schedule(lineId: string, dates: { sequence: number; plannedDate?: string }[]): Promise<number>;
}
/** A receipt goes on a spending record, proof of delivery on a delivery. */
export type AttachmentTarget = { eventId: string } | { deliveryId: string };
export interface AttachmentRepo {
  list(): Promise<Attachment[]>;
  add(target: AttachmentTarget, file: File, label?: string): Promise<Attachment>;
  remove(id: string): Promise<void>;
}
export interface DeliveryData {
  deliveries: Delivery[];
  results: DeliveryResult[];
}
export interface GenerateInput {
  rounds: number;
  firstDate?: string;
  repeat?: Repeat | null;
}
export interface GenerateResult {
  created: number;
  existing: number;
  outsideYear: number;
}
export interface DeliveryInput {
  roundNumber?: number;
  roundLabel?: string;
  siteId?: string;
  plannedDate?: string;
}
export type DeliveryPatch = Partial<
  Pick<Delivery, "status" | "plannedDate" | "actualDate" | "notes" | "roundLabel">
>;
export interface DeliveryRepo {
  list(): Promise<DeliveryData>;
  /** Adds the missing round and site combinations only. Safe to run again. */
  generate(activityId: string, input: GenerateInput): Promise<GenerateResult>;
  add(activityId: string, input: DeliveryInput): Promise<Delivery>;
  update(id: string, patch: DeliveryPatch): Promise<Delivery>;
  /** Blocked while spending is linked or proof files exist. */
  remove(id: string): Promise<void>;
  /** A null value clears the result. */
  setResult(
    deliveryId: string,
    indicatorId: string,
    value: number | null,
    notes?: string,
  ): Promise<void>;
  linkEvents(deliveryId: string, eventIds: string[]): Promise<number>;
  unlinkEvents(eventIds: string[]): Promise<number>;
}
export interface AuditRepo {
  list(): Promise<AuditEntry[]>;
}
export interface StudyRepo {
  list(): Promise<Study[]>;
  canCreate(): Promise<boolean>;
  myEmail(): Promise<string>;
  create(name: string): Promise<string>;
  members(studyId: string): Promise<StudyMember[]>;
  addMember(studyId: string, email: string): Promise<boolean>;
  removeMember(studyId: string, userId: string): Promise<void>;
  setAdmin(studyId: string, userId: string, isAdmin: boolean): Promise<void>;
}
export interface AdminRepo {
  /** Adds every row as a line of one activity in the active year. */
  importLines(activityId: string, rows: Omit<LineInput, "activityId">[]): Promise<number>;
}
