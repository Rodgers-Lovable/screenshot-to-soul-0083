import { useRef, useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Cut-off text that shows the full text in a tooltip, only when it doesn't fit. */
export function Truncated({
  text,
  children,
  lines = 1,
  className,
}: {
  text: string;
  children?: ReactNode;
  lines?: 1 | 2;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const isCut = () => {
    const el = ref.current;
    return !!el && (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
  };
  return (
    <Tooltip open={open} onOpenChange={(o) => setOpen(o && isCut())}>
      <TooltipTrigger asChild>
        <span
          ref={ref}
          className={cn("block", lines === 2 ? "line-clamp-2" : "truncate", className)}
        >
          {children ?? text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm wrap-break-word whitespace-normal">{text}</TooltipContent>
    </Tooltip>
  );
}
