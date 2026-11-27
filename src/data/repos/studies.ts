import { activeStudyId } from "../active-study";
import {
  addStudyMember,
  createStudy,
  currentUserLabel,
  isPlatformAdmin,
  listAudit,
  listStudies,
  listStudyMembers,
  removeStudyMember,
  setStudyAdmin,
} from "../remote";
import type { AuditRepo, StudyRepo } from "./types";

export const auditRepo: AuditRepo = { list: () => listAudit(activeStudyId()) };

export const studyRepo: StudyRepo = {
  list: listStudies,
  canCreate: isPlatformAdmin,
  myEmail: currentUserLabel,
  create: createStudy,
  members: listStudyMembers,
  addMember: addStudyMember,
  removeMember: removeStudyMember,
  setAdmin: setStudyAdmin,
};
