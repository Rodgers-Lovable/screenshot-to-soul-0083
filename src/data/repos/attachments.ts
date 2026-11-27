import type { Attachment } from "@/lib/types";
import { getYear, removeEvidence, signUrls, uploadEvidence } from "../remote";
import { CLOSED, audit, clone, db, read, scopeNow, tx, uid } from "./core";
import type { AttachmentRepo } from "./types";

export const attachmentRepo: AttachmentRepo = {
  list: async () => signUrls(await read((d) => d.attachments)),
  add: async (target, file, label) => {
    const scope = scopeNow();
    const year = scope.period && (await getYear(scope.study, scope.period));
    if (year && year.status === "closed") throw new Error(CLOSED);
    const owner =
      "deliveryId" in target ? { deliveryId: target.deliveryId } : { eventId: target.eventId };
    const folder = "deliveryId" in target ? `deliveries/${target.deliveryId}` : target.eventId;
    const path = await uploadEvidence(scope.study, folder, file);
    return tx(() => {
      if ("deliveryId" in target && !db().deliveries.some((x) => x.id === target.deliveryId))
        throw new Error("Round not found");
      const a: Attachment = {
        id: uid(),
        ...owner,
        fileName: file.name,
        fileUrl: path,
        mimeType: file.type,
        sizeBytes: file.size,
        label,
        uploadedAt: new Date().toISOString(),
      };
      db().attachments.push(a);
      audit("attachment", a.id, "(created)", null, `${a.fileName}${label ? ` · ${label}` : ""}`);
      return clone(a);
    }, scope).catch(async (e) => {
      await removeEvidence([path]);
      throw e;
    });
  },
  remove: (id) =>
    tx(() => {
      const d = db();
      const a = d.attachments.find((x) => x.id === id);
      d.attachments = d.attachments.filter((x) => x.id !== id);
      audit("attachment", id, "(deleted)", a?.fileName, null);
    }),
};
