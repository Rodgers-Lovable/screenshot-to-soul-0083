import { Check, ChevronsUpDown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useYear } from "./active-year-context";

/** Shows the active year and lets people switch. Closed years carry a marker. */
export function YearSwitcher({ className }: { className?: string }) {
  const { year, years, select } = useYear();
  if (!year) return null;
  const list = [...years].sort((a, b) => b.startDate.localeCompare(a.startDate));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Switch year"
          data-tour="year-switcher"
          className={cn("h-8 min-w-0 max-w-40 justify-between gap-1.5 px-2", className)}
        >
          <span className="truncate">{year.name || "Year"}</span>
          {year.status === "closed" && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-muted px-1 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden />
              Closed
            </span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-w-[calc(100vw-1.5rem)]">
        <DropdownMenuLabel>Years</DropdownMenuLabel>
        {list.map((y) => (
          <DropdownMenuItem key={y.id} onSelect={() => select(y.id)}>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{y.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {y.startDate} to {y.endDate}
              </span>
            </span>
            {y.status === "closed" && (
              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" aria-hidden />
                Closed
              </span>
            )}
            {y.id === year.id && <Check className="h-4 w-4" aria-label="Current year" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
