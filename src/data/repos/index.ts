// Repository interfaces backed by Supabase.
// UI must only reach these through hooks in src/data/hooks.ts.
export * from "./types";
export { periodRepo, yearRepo } from "./years";
export { adminRepo, lineRepo } from "./lines";
export { eventRepo } from "./events";
export { attachmentRepo } from "./attachments";
export { workplanRepo } from "./workplan";
export { siteRepo } from "./sites";
export { deliveryRepo } from "./deliveries";
export { auditRepo, studyRepo } from "./studies";
