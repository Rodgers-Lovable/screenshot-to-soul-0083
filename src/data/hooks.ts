import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminRepo, attachmentRepo, auditRepo, componentRepo, eventRepo, lineRepo, periodRepo } from "./repos";

const K = {
  period: ["pbt", "period"], components: ["pbt", "components"], lines: ["pbt", "lines"],
  events: ["pbt", "events"], attachments: ["pbt", "attachments"], audit: ["pbt", "audit"],
} as const;

export const usePeriod = () => useQuery({ queryKey: K.period, queryFn: () => periodRepo.get() });
export const useComponents = () => useQuery({ queryKey: K.components, queryFn: () => componentRepo.list() });
export const useLines = () => useQuery({ queryKey: K.lines, queryFn: () => lineRepo.list() });
export const useEvents = () => useQuery({ queryKey: K.events, queryFn: () => eventRepo.list() });
export const useAttachments = () => useQuery({ queryKey: K.attachments, queryFn: () => attachmentRepo.list() });
export const useAudit = () => useQuery({ queryKey: K.audit, queryFn: () => auditRepo.list() });

/** All budget data at once; `ready` is false until every query resolves. */
export function useBudgetData() {
  const period = usePeriod(), components = useComponents(), lines = useLines(), events = useEvents(), attachments = useAttachments();
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
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ["pbt"] }) });
}

export const useUpdatePeriod = () => useM(periodRepo.update);
export const useCreateComponent = () => useM(componentRepo.create);
export const useUpdateComponent = () => useM((a: { id: string; patch: Parameters<typeof componentRepo.update>[1] }) => componentRepo.update(a.id, a.patch));
export const useRemoveComponent = () => useM(componentRepo.remove);
export const useCreateLine = () => useM(lineRepo.create);
export const useUpdateLine = () => useM((a: { id: string; patch: Parameters<typeof lineRepo.update>[1] }) => lineRepo.update(a.id, a.patch));
export const useDuplicateLine = () => useM(lineRepo.duplicate);
export const useRemoveLine = () => useM(lineRepo.remove);
export const useUpdateEvent = () => useM((a: { id: string; patch: Parameters<typeof eventRepo.update>[1] }) => eventRepo.update(a.id, a.patch));
export const useAddAttachment = () => useM((a: { eventId: string; file: File; label?: string }) => attachmentRepo.add(a.eventId, a.file, a.label));
export const useRemoveAttachment = () => useM(attachmentRepo.remove);
export const useImportLines = () => useM(adminRepo.importLines);
