import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminRepo,
  attachmentRepo,
  auditRepo,
  deliveryRepo,
  eventRepo,
  lineRepo,
  periodRepo,
  siteRepo,
  studyRepo,
  workplanRepo,
  yearRepo,
} from "./repos";
import { activePeriodId, activeStudyId } from "./active-study";

// Keys carry the study and year ids, computed at render, so each year has its own cache.
const key = (name: string) => ["pbt", activeStudyId(), activePeriodId() ?? "none", name] as const;

export const usePeriod = () =>
  useQuery({ queryKey: key("period"), queryFn: () => periodRepo.get() });
export const useLines = () => useQuery({ queryKey: key("lines"), queryFn: () => lineRepo.list() });
export const useEvents = () =>
  useQuery({ queryKey: key("events"), queryFn: () => eventRepo.list() });
export const useAttachments = () =>
  useQuery({ queryKey: key("attachments"), queryFn: () => attachmentRepo.list() });
export const useDeliveries = () =>
  useQuery({ queryKey: key("deliveries"), queryFn: () => deliveryRepo.list() });
export const useWorkplan = () =>
  useQuery({ queryKey: key("workplan"), queryFn: () => workplanRepo.get() });
export const useYears = (studyId: string) =>
  useQuery({ queryKey: ["years", studyId], queryFn: () => yearRepo.list(studyId) });
export const useAudit = () => useQuery({ queryKey: key("audit"), queryFn: () => auditRepo.list() });

export const useStudies = () =>
  useQuery({ queryKey: ["studies"], queryFn: () => studyRepo.list() });
export const useCanCreateStudy = () =>
  useQuery({ queryKey: ["studies", "can-create"], queryFn: () => studyRepo.canCreate() });
export const useMyEmail = () =>
  useQuery({ queryKey: ["studies", "me"], queryFn: () => studyRepo.myEmail() });
export const useStudyMembers = (studyId: string) =>
  useQuery({
    queryKey: ["study-members", studyId],
    queryFn: () => studyRepo.members(studyId),
  });

/** All budget data at once; `ready` is false until every query resolves. */
export function useBudgetData() {
  const period = usePeriod(),
    workplan = useWorkplan(),
    lines = useLines(),
    events = useEvents(),
    attachments = useAttachments(),
    deliveries = useDeliveries();
  const ready = [period, workplan, lines, events, attachments, deliveries].every(
    (q) => q.isSuccess,
  );
  return {
    ready,
    period: period.data ?? null,
    objectives: workplan.data?.objectives ?? [],
    outcomes: workplan.data?.outcomes ?? [],
    activities: workplan.data?.activities ?? [],
    lines: lines.data ?? [],
    events: events.data ?? [],
    attachments: attachments.data ?? [],
    deliveries: deliveries.data?.deliveries ?? [],
    results: deliveries.data?.results ?? [],
  };
}

/** Shows a database error as a toast. The id stops the same message showing twice. */
export const notifyError = (e: unknown) => {
  const msg = e instanceof Error && e.message ? e.message : "Something went wrong. Try again.";
  toast.error(msg, { id: msg });
};

function useM<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pbt"] }),
    onError: notifyError,
  });
}

function useYearM<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["years"] }),
        qc.invalidateQueries({ queryKey: ["pbt"] }),
      ]),
    onError: notifyError,
  });
}
export const useUpdatePeriod = () => useYearM(periodRepo.update);
export const useCreateYear = () =>
  useYearM(
    (a: {
      studyId: string;
      value: Parameters<typeof yearRepo.create>[1];
      copyFromId: string | null;
      copyBudgetLines?: boolean;
    }) => yearRepo.create(a.studyId, a.value, a.copyFromId, a.copyBudgetLines),
  );
export const useSetYearStatus = () =>
  useYearM((a: { id: string; status: "open" | "closed" }) => yearRepo.setStatus(a.id, a.status));

type WP = typeof workplanRepo;
export const useAddObjective = () => useM(workplanRepo.addObjective);
export const useUpdateObjective = () =>
  useM((a: { id: string; patch: Parameters<WP["updateObjective"]>[1] }) =>
    workplanRepo.updateObjective(a.id, a.patch),
  );
export const useRemoveObjective = () => useM(workplanRepo.removeObjective);
export const useMoveObjective = () =>
  useM((a: { id: string; dir: "up" | "down" }) => workplanRepo.moveObjective(a.id, a.dir));
export const useAddOutcome = () =>
  useM((a: { objectiveId: string; input: Parameters<WP["addOutcome"]>[1] }) =>
    workplanRepo.addOutcome(a.objectiveId, a.input),
  );
export const useUpdateOutcome = () =>
  useM((a: { id: string; patch: Parameters<WP["updateOutcome"]>[1] }) =>
    workplanRepo.updateOutcome(a.id, a.patch),
  );
export const useRemoveOutcome = () => useM(workplanRepo.removeOutcome);
export const useMoveOutcome = () =>
  useM((a: { id: string; dir: "up" | "down" }) => workplanRepo.moveOutcome(a.id, a.dir));
export const useAddActivity = () =>
  useM((a: { outcomeId: string; input: Parameters<WP["addActivity"]>[1] }) =>
    workplanRepo.addActivity(a.outcomeId, a.input),
  );
export const useUpdateActivity = () =>
  useM((a: { id: string; patch: Parameters<WP["updateActivity"]>[1] }) =>
    workplanRepo.updateActivity(a.id, a.patch),
  );
export const useRemoveActivity = () => useM(workplanRepo.removeActivity);
export const useMoveActivity = () =>
  useM((a: { id: string; dir: "up" | "down" }) => workplanRepo.moveActivity(a.id, a.dir));
export const useAddIndicators = () =>
  useM((a: { activityId: string; input: Parameters<WP["addIndicators"]>[1] }) =>
    workplanRepo.addIndicators(a.activityId, a.input),
  );
export const useUpdateIndicator = () =>
  useM((a: { id: string; patch: Parameters<WP["updateIndicator"]>[1] }) =>
    workplanRepo.updateIndicator(a.id, a.patch),
  );
export const useRemoveIndicator = () => useM(workplanRepo.removeIndicator);
export const useAddResponsibles = () =>
  useM((a: { activityId: string; input: Parameters<WP["addResponsibles"]>[1] }) =>
    workplanRepo.addResponsibles(a.activityId, a.input),
  );
export const useUpdateResponsible = () =>
  useM((a: { id: string; patch: Parameters<WP["updateResponsible"]>[1] }) =>
    workplanRepo.updateResponsible(a.id, a.patch),
  );
export const useRemoveResponsible = () => useM(workplanRepo.removeResponsible);
export const useSetActivitySites = () =>
  useM((a: { activityId: string; siteIds: string[] }) =>
    workplanRepo.setActivitySites(a.activityId, a.siteIds),
  );
export const useAddSite = () => useM(siteRepo.add);
export const useRenameSite = () =>
  useM((a: { id: string; name: string }) => siteRepo.rename(a.id, a.name));
export const useArchiveSite = () =>
  useM((a: { id: string; archived: boolean }) => siteRepo.setArchived(a.id, a.archived));
export const useCreateLine = () => useM(lineRepo.create);
export const useUpdateLine = () =>
  useM((a: { id: string; patch: Parameters<typeof lineRepo.update>[1] }) =>
    lineRepo.update(a.id, a.patch),
  );
export const useDuplicateLine = () => useM(lineRepo.duplicate);
export const useRemoveLine = () => useM(lineRepo.remove);
export const useUpdateEvent = () =>
  useM((a: { id: string; patch: Parameters<typeof eventRepo.update>[1] }) =>
    eventRepo.update(a.id, a.patch),
  );
export const useScheduleLine = () =>
  useM((a: { lineId: string; dates: Parameters<typeof eventRepo.schedule>[1] }) =>
    eventRepo.schedule(a.lineId, a.dates),
  );
export const useAddAttachment = () =>
  useM((a: { target: Parameters<typeof attachmentRepo.add>[0]; file: File; label?: string }) =>
    attachmentRepo.add(a.target, a.file, a.label),
  );
export const useGenerateDeliveries = () =>
  useM((a: { activityId: string; input: Parameters<typeof deliveryRepo.generate>[1] }) =>
    deliveryRepo.generate(a.activityId, a.input),
  );
export const useAddDelivery = () =>
  useM((a: { activityId: string; input: Parameters<typeof deliveryRepo.add>[1] }) =>
    deliveryRepo.add(a.activityId, a.input),
  );
export const useUpdateDelivery = () =>
  useM((a: { id: string; patch: Parameters<typeof deliveryRepo.update>[1] }) =>
    deliveryRepo.update(a.id, a.patch),
  );
export const useRemoveDelivery = () => useM(deliveryRepo.remove);
export const useSetDeliveryResult = () =>
  useM((a: { deliveryId: string; indicatorId: string; value: number | null; notes?: string }) =>
    deliveryRepo.setResult(a.deliveryId, a.indicatorId, a.value, a.notes),
  );
export const useLinkEvents = () =>
  useM((a: { deliveryId: string; eventIds: string[] }) =>
    deliveryRepo.linkEvents(a.deliveryId, a.eventIds),
  );
export const useUnlinkEvents = () => useM(deliveryRepo.unlinkEvents);
export const useRemoveAttachment = () => useM(attachmentRepo.remove);
export const useImportLines = () =>
  useM((a: { activityId: string; rows: Parameters<typeof adminRepo.importLines>[1] }) =>
    adminRepo.importLines(a.activityId, a.rows),
  );

export function useCreateStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: studyRepo.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studies"] }),
  });
}
function useMemberM<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["study-members"] }),
        qc.invalidateQueries({ queryKey: ["studies"] }),
      ]),
  });
}
export const useAddMember = () =>
  useMemberM((a: { studyId: string; email: string }) => studyRepo.addMember(a.studyId, a.email));
export const useRemoveMember = () =>
  useMemberM((a: { studyId: string; userId: string }) =>
    studyRepo.removeMember(a.studyId, a.userId),
  );
export const useSetAdmin = () =>
  useMemberM((a: { studyId: string; userId: string; isAdmin: boolean }) =>
    studyRepo.setAdmin(a.studyId, a.userId, a.isAdmin),
  );
