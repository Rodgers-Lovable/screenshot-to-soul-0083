// Console logger with a scope prefix. Info logs show in dev, or in production
// when localStorage "pbt-debug" is "1". Warnings and errors always show.
type Data = Record<string, unknown>;

function verbose() {
  if (import.meta.env.DEV) return true;
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("pbt-debug") === "1";
  } catch {
    return false;
  }
}

export function logger(scope: string) {
  const tag = `[budget:${scope}]`;
  return {
    info: (msg: string, data?: Data) => {
      if (verbose()) console.info(tag, msg, ...(data ? [data] : []));
    },
    warn: (msg: string, data?: Data) => console.warn(tag, msg, ...(data ? [data] : [])),
    error: (msg: string, err?: unknown, data?: Data) =>
      console.error(tag, msg, ...(data ? [data] : []), ...(err ? [err] : [])),
    /** Time an async step and log how long it took, or its error. */
    async time<T>(msg: string, fn: () => Promise<T>, summary?: (r: T) => Data): Promise<T> {
      const start = performance.now();
      try {
        const r = await fn();
        this.info(`${msg} ok`, { ms: Math.round(performance.now() - start), ...summary?.(r) });
        return r;
      } catch (e) {
        this.error(`${msg} failed`, e, { ms: Math.round(performance.now() - start) });
        throw e;
      }
    },
  };
}

/** Host only, so logs never carry keys or paths. */
export const hostOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).host : "(missing)";
  } catch {
    return "(invalid url)";
  }
};
