const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatKES(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const body = abs % 100 === 0 ? nf0.format(abs / 100) : nf2.format(abs / 100);
  return `${neg ? "−" : ""}KES ${body}`;
}

export function formatUSD(cents: number, fxRate: number): string {
  const usd = cents / 100 / fxRate;
  const neg = usd < 0;
  const abs = Math.round(Math.abs(usd) * 100) / 100;
  const body = Number.isInteger(abs) ? nf0.format(abs) : nf2.format(abs);
  return `${neg ? "−" : ""}$${body}`;
}

export const formatSigned = (cents: number, fn: (c: number) => string) => (cents > 0 ? "+" : "") + fn(cents);
export const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Parse "Ksh120,000", " Ksh 30,000.00 ", "$923" → 923 (in currency units). */
export function parseMoney(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[\u00a0\s,]/g, "").replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export const kesToCents = (kes: number) => Math.round(kes * 100);
export const centsToKes = (c: number) => c / 100;

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function durationLabel(d: number, unit: string) {
  if (unit === "one-off") return "one-off";
  return `${d} ${unit === "days" ? (d === 1 ? "day" : "days") : d === 1 ? "month" : "months"}`;
}
