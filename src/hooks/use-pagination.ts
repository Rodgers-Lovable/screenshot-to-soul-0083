import { useState } from "react";

export const PAGE_SIZES = [25, 50, 100, 200] as const;

export interface Pager {
  page: number;
  pages: number;
  size: number;
  start: number;
  end: number;
  total: number;
  setPage: (page: number) => void;
  setSize: (size: number) => void;
  reset: () => void;
}

/** Page state for a client-side list of `total` rows. Slice with `start` and `end`. */
export function usePagination(total: number, initialSize: number = PAGE_SIZES[1]): Pager {
  const [page, setPage] = useState(0);
  const [size, setSizeState] = useState(initialSize);
  const pages = Math.max(1, Math.ceil(total / size));
  // Filters can shrink the list below the current page.
  const current = Math.min(page, pages - 1);
  const start = current * size;
  return {
    page: current,
    pages,
    size,
    start,
    end: Math.min(start + size, total),
    total,
    setPage,
    setSize: (n) => {
      // Keep the first visible row on screen.
      setPage(Math.floor(start / n));
      setSizeState(n);
    },
    reset: () => setPage(0),
  };
}
