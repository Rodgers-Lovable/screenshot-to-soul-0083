// The study every data call is scoped to. Set by the study gate before the app renders.
const KEY = "pbt-active-study";
let active: string | null = null;

export function activeStudyId(): string {
  if (!active) throw new Error("No active study");
  return active;
}
/** Safe to call during render: it does not touch storage. */
export function setActiveStudyId(id: string | null) {
  active = id;
}
export function rememberStudy(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Storage can be blocked; the choice just isn't remembered.
  }
}
export function savedStudyId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

// The workplan year every data call is scoped to. It can be null while a study has no year yet.
const YEAR_KEY = "pbt-active-year:";
let activeYear: string | null = null;

export function activePeriodId(): string | null {
  return activeYear;
}
/** Safe to call during render: it does not touch storage. */
export function setActivePeriodId(id: string | null) {
  activeYear = id;
}
export function rememberYear(studyId: string, periodId: string) {
  try {
    localStorage.setItem(YEAR_KEY + studyId, periodId);
  } catch {
    // Storage can be blocked; the choice just isn't remembered.
  }
}
export function savedYearId(studyId: string): string | null {
  try {
    return localStorage.getItem(YEAR_KEY + studyId);
  } catch {
    return null;
  }
}
