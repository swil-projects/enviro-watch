"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Client-side pagination state. The page is clamped when the item count shrinks (e.g. after filtering). */
export function usePagination<T>(items: T[], initialPageSize = 10) {
  const [page, setPageRaw] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(initialPageSize);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  return {
    page: current,
    pageSize,
    pageCount,
    total,
    pageItems: items.slice(start, start + pageSize),
    setPage: (p: number) => setPageRaw(Math.max(1, Math.min(p, pageCount))),
    setPageSize: (s: number) => {
      setPageSizeRaw(s);
      setPageRaw(1);
    },
  };
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  onPageSize,
  pageSizes = [10, 25, 50],
  label = "items",
  className,
  compact = false,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize?: (s: number) => void;
  pageSizes?: number[];
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  if (total <= Math.min(pageSize, ...(onPageSize ? pageSizes : [pageSize]))) return null;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = "grid size-7 place-items-center rounded-md text-text-2 transition-colors hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-4";
  return (
    <nav aria-label={`${label} pagination`} className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-text-3", className)}>
      <span className="tabular" aria-live="polite">
        {from}–{to} of {total.toLocaleString()} {label}
      </span>
      <div className="flex items-center gap-3">
        {onPageSize && !compact && (
          <label className="flex items-center gap-1.5">
            Per page
            <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs text-text" aria-label="Items per page">
              {pageSizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-center gap-0.5">
          {!compact && (
            <button className={btn} onClick={() => onPage(1)} disabled={page <= 1} aria-label="First page">
              <ChevronsLeft />
            </button>
          )}
          <button className={btn} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft />
          </button>
          <span className="tabular px-1.5 text-text-2">
            {page} / {pageCount}
          </span>
          <button className={btn} onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">
            <ChevronRight />
          </button>
          {!compact && (
            <button className={btn} onClick={() => onPage(pageCount)} disabled={page >= pageCount} aria-label="Last page">
              <ChevronsRight />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

/** Paginate pre-rendered table rows (works with rows rendered by Server Components). */
export function PaginatedTable({ head, rows, pageSize = 10, label = "rows", className, caption }: { head: React.ReactNode; rows: React.ReactNode[]; pageSize?: number; label?: string; className?: string; caption?: string }) {
  const p = usePagination(rows, pageSize);
  return (
    <div className={className}>
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>{head}</thead>
          <tbody>{p.pageItems}</tbody>
        </table>
      </div>
      <Pagination {...p} onPage={p.setPage} onPageSize={p.setPageSize} pageSizes={[pageSize, pageSize * 2.5, pageSize * 5].map(Math.round)} label={label} className="border-t border-border px-4 py-2.5" />
    </div>
  );
}

/** Paginate pre-rendered cards/items in a grid or list. */
export function PaginatedGrid({ items, pageSize = 6, label = "items", className, footerClassName }: { items: React.ReactNode[]; pageSize?: number; label?: string; className?: string; footerClassName?: string }) {
  const p = usePagination(items, pageSize);
  return (
    <div className="space-y-3">
      <div className={className}>{p.pageItems}</div>
      <Pagination {...p} onPage={p.setPage} onPageSize={p.setPageSize} pageSizes={[pageSize, pageSize * 2, pageSize * 4]} label={label} className={footerClassName} />
    </div>
  );
}
