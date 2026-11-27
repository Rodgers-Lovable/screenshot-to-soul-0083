import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminRepo,
  attachmentRepo,
  auditRepo,
  componentRepo,
  eventRepo,
  lineRepo,
  periodRepo,
  studyRepo,
} from "./repos";
import { activeStudyId } from "./active-study";

// Keys carry the study id, computed at render, so each study has its own cache.
const key = (name: string) => ["pbt", activeStudyId(), name] as const;

export const usePeriod = () =>
  useQuery({ queryKey: key("period"), queryFn: () => periodRepo.get() });
export const useComponents = () =>
  useQuery({ queryKey: key("components"), queryFn: () => componentRepo.list() });
export const useLines = () => useQuery({ queryKey: key("lines"), queryFn: () => lineRepo.list() });
export const useEvents = () =>
  useQuery({ queryKey: key("events"), queryFn: () => eventRepo.list() });
export const useAttachments = () =>
  useQuery({ queryKey: key("attachments"), queryFn: () => attachmentRepo.list() });
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
    components = useComponents(),
    lines = useLines(),
    events = useEvents(),
    attachments = useAttachments();
  const ready = [period, components, lines, events, attachments].every((q) => q.isSuccess);
  return {
    ready,
    period: period.data ?? null,
    components: components.data ?? [],
    lines: lines.data ?? [],
    events: events.data ?? [],
    attachments: attachments.data ?? [],
  };
}

function useM<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pbt"] }),
  });
}

export const useUpdatePeriod = () => useM(periodRepo.update);
export const useCreateComponent = () => useM(componentRepo.create);
export const useUpdateComponent = () =>
  useM((a: { id: string; patch: Parameters<typeof componentRepo.update>[1] }) =>
    componentRepo.update(a.id, a.patch),
  );
export const useRemoveComponent = () => useM(componentRepo.remove);
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
  useM((a: { eventId: string; file: File; label?: string }) =>
    attachmentRepo.add(a.eventId, a.file, a.label),
  );
export const useRemoveAttachment = () => useM(attachmentRepo.remove);
export const useImportLines = () => useM(adminRepo.importLines);

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
