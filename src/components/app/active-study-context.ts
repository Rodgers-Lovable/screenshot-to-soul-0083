import { createContext, useContext } from "react";
import type { Study } from "@/lib/types";

export interface ActiveStudy {
  study: Study;
  studies: Study[];
  select: (id: string) => void;
}
export const ActiveStudyCtx = createContext<ActiveStudy | null>(null);

export function useActiveStudy(): ActiveStudy {
  const v = useContext(ActiveStudyCtx);
  if (!v) throw new Error("useActiveStudy needs a StudyGate");
  return v;
}
