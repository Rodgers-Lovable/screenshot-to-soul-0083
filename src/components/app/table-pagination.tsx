import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZES, type Pager } from "@/hooks/use-pagination";

/** Rows-per-page picker and page buttons. Hidden while everything fits on the smallest page. */
export function TablePagination({
  pager,
  sizes = PAGE_SIZES,
}: {
  pager: Pager;
  sizes?: readonly number[];
}) {
  const { page, pages, size, start, end, total, setPage, setSize } = pager;
  if (total <= (sizes[0] ?? 0)) return null;
  const first = page === 0;
  const last = page >= pages - 1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>Rows per page</span>
        <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}>
          <SelectTrigger className="h-8 w-20" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sizes.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="tabular-nums">
          {start + 1}–{end} of {total}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <PageButton label="First page" disabled={first} onClick={() => setPage(0)}>
          <ChevronsLeft className="h-4 w-4" />
        </PageButton>
        <PageButton label="Previous page" disabled={first} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </PageButton>
        <span className="px-2 tabular-nums text-muted-foreground">
          Page {page + 1} of {pages}
        </span>
        <PageButton label="Next page" disabled={last} onClick={() => setPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </PageButton>
        <PageButton label="Last page" disabled={last} onClick={() => setPage(pages - 1)}>
          <ChevronsRight className="h-4 w-4" />
        </PageButton>
      </div>
    </div>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="icon"
      variant="outline"
      className="size-8"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
