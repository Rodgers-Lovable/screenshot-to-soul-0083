import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { formatKES, formatUSD } from "@/lib/format";
import { usePeriod } from "@/data/hooks";
import { cn } from "@/lib/utils";

type Cur = "KES" | "USD";
const Ctx = createContext<{ cur: Cur; setCur: (c: Cur) => void }>({ cur: "KES", setCur: () => {} });

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [cur, setCurState] = useState<Cur>("KES");
  useEffect(() => {
    const v = localStorage.getItem("pbt-currency");
    if (v === "USD" || v === "KES") setCurState(v);
  }, []);
  const setCur = (c: Cur) => {
    setCurState(c);
    localStorage.setItem("pbt-currency", c);
  };
  return <Ctx.Provider value={{ cur, setCur }}>{children}</Ctx.Provider>;
}
export const useCurrency = () => useContext(Ctx);

export function useFmt() {
  const { cur } = useCurrency();
  const fx = usePeriod().data?.fxRate ?? 125;
  const kes = (c: number) => formatKES(c);
  const usd = (c: number) => formatUSD(c, fx);
  return {
    cur,
    fx,
    kes,
    usd,
    primary: cur === "KES" ? kes : usd,
    secondary: cur === "KES" ? usd : kes,
  };
}

/** Primary currency, with the other currency smaller beneath. */
export function Money({
  cents,
  size = "sm",
  signed,
  className,
  tone,
}: {
  cents: number;
  size?: "sm" | "lg" | "md";
  signed?: boolean;
  className?: string;
  tone?: "danger" | "auto";
}) {
  const f = useFmt();
  const sign = signed && cents > 0 ? "+" : "";
  const danger = tone === "danger" || (tone === "auto" && cents < 0);
  return (
    <span className={cn("inline-flex flex-col items-end leading-tight tabular-nums", className)}>
      <span
        className={cn(
          size === "lg"
            ? "text-2xl font-semibold"
            : size === "md"
              ? "text-base font-medium"
              : "text-sm",
          danger && "text-destructive",
        )}
      >
        {sign}
        {f.primary(cents)}
      </span>
      <span className={cn("text-muted-foreground", size === "lg" ? "text-xs" : "text-[10px]")}>
        {sign}
        {f.secondary(cents)}
      </span>
    </span>
  );
}

/**
 * Planned minus actual. Under plan shows green with a down trend, over plan red with an up trend.
 * Amounts are shown without a sign; the icon and colour give the direction.
 */
export function Variance({ cents, className }: { cents: number; className?: string }) {
  const f = useFmt();
  const under = cents > 0;
  const over = cents < 0;
  const Icon = under ? TrendingDown : over ? TrendingUp : Minus;
  const word = under ? "under plan" : over ? "over plan" : "on plan";
  const abs = Math.abs(cents);
  return (
    <span
      className={cn("inline-flex flex-col items-end leading-tight tabular-nums", className)}
      title={`${f.primary(abs)} ${word}`}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 text-sm",
          under && "text-success",
          over && "text-destructive",
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {f.primary(abs)}
        <span className="sr-only"> {word}</span>
      </span>
      <span className="text-[10px] text-muted-foreground">{f.secondary(abs)}</span>
    </span>
  );
}
