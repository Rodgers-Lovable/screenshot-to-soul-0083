// Radix Select can't hold an empty value, so "all" and "none" options use these.
export const SELECT_ALL = "__all";
export const SELECT_NONE = "__none";

/** The picked value, or undefined when the "all" or "none" option is picked. */
export const fromSelect = (v: string): string | undefined =>
  v === SELECT_ALL || v === SELECT_NONE ? undefined : v;
