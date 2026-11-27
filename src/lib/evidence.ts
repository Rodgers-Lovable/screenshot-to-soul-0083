// Receipts and proof of delivery share one set of upload rules.
export const EVIDENCE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.xlsx";
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
const EVIDENCE_TYPES = /\.(pdf|jpe?g|png|xlsx)$/i;

/** Why a file can't be uploaded, or null when it can. */
export function evidenceFileProblem(file: Pick<File, "name" | "size">): string | null {
  if (!EVIDENCE_TYPES.test(file.name)) return `${file.name}: only PDF, JPG, PNG or XLSX`;
  if (file.size > EVIDENCE_MAX_BYTES) return `${file.name} is over 10 MB`;
  return null;
}

/** Splits picked files into the ones to keep and messages for the rest. */
export function checkEvidenceFiles<F extends Pick<File, "name" | "size">>(files: Iterable<F>) {
  const ok: F[] = [];
  const problems: string[] = [];
  for (const file of files) {
    const problem = evidenceFileProblem(file);
    if (problem) problems.push(problem);
    else ok.push(file);
  }
  return { ok, problems };
}
