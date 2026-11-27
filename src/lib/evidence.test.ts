import { describe, expect, it } from "vitest";
import { EVIDENCE_MAX_BYTES, checkEvidenceFiles, evidenceFileProblem } from "./evidence";

const file = (name: string, size = 1000) => ({ name, size });

describe("evidence files", () => {
  it("accepts the allowed types in any case", () => {
    for (const name of ["a.pdf", "b.JPG", "c.jpeg", "d.png", "e.xlsx"])
      expect(evidenceFileProblem(file(name))).toBeNull();
  });

  it("rejects other types and files over 10 MB", () => {
    expect(evidenceFileProblem(file("notes.docx"))).toBe("notes.docx: only PDF, JPG, PNG or XLSX");
    expect(evidenceFileProblem(file("big.pdf", EVIDENCE_MAX_BYTES + 1))).toBe(
      "big.pdf is over 10 MB",
    );
    expect(evidenceFileProblem(file("edge.pdf", EVIDENCE_MAX_BYTES))).toBeNull();
  });

  it("splits a picked list into files to keep and problems", () => {
    const { ok, problems } = checkEvidenceFiles([file("a.pdf"), file("b.exe"), file("c.png")]);
    expect(ok.map((f) => f.name)).toEqual(["a.pdf", "c.png"]);
    expect(problems).toEqual(["b.exe: only PDF, JPG, PNG or XLSX"]);
  });
});
