import { getYear, listYears, createYear, setYearStatus, updateYear } from "../remote";
import { CLOSED, NO_YEAR, read, scopeNow } from "./core";
import type { PeriodRepo, YearRepo } from "./types";

export const periodRepo: PeriodRepo = {
  get: () => read((d) => d.period),
  update: async (patch) => {
    const { study, period } = scopeNow();
    if (!period) throw new Error(NO_YEAR);
    const cur = await getYear(study, period);
    if (!cur) throw new Error(NO_YEAR);
    if (cur.status === "closed") throw new Error(CLOSED);
    await updateYear(period, { ...cur, ...patch });
  },
};

export const yearRepo: YearRepo = {
  list: listYears,
  create: createYear,
  setStatus: setYearStatus,
};
