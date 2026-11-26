"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, MapPin, Search } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { Input, Select } from "@/components/ui/field";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { FreshnessBadge, ProviderTag, TimeAgo } from "./status";
import { getMetric } from "@/lib/metrics/registry";
import { PROVIDERS, PROVIDER_META } from "@/lib/integrations/contracts";
import type { StationRow } from "@/lib/overview";

const FRESH_ORDER = { live: 0, stale: 1, offline: 2, error: 3 };

export function StationsTable({ rows, initialQuery = "", lockProvider }: { rows: StationRow[]; initialQuery?: string; lockProvider?: boolean }) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([{ id: "freshness", desc: false }]);
  const [globalFilter, setGlobalFilter] = useState(initialQuery);
  const [provider, setProvider] = useState("");
  const [fresh, setFresh] = useState("");
  const data = useMemo(() => rows.filter((r) => (!provider || r.provider === provider) && (!fresh || r.freshness === fresh)), [rows, provider, fresh]);

  const columns = useMemo<ColumnDef<StationRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Station / device",
        cell: ({ row }) => (
          <div className="min-w-48">
            <Link href={`/stations/${encodeURIComponent(row.original.id)}`} className="font-medium text-text hover:underline" onClick={(e) => e.stopPropagation()}>
              {row.original.name}
            </Link>
            {row.original.providerStatus && <p className="text-[11px] text-text-3">{row.original.providerStatus}</p>}
          </div>
        ),
      },
      { accessorKey: "provider", header: "Provider", cell: ({ row }) => <ProviderTag provider={row.original.provider} /> },
      { accessorKey: "projectName", header: "Project / site", cell: ({ getValue }) => (getValue() as string | null) ?? <span className="text-text-3">—</span> },
      { accessorKey: "externalId", header: "External ID", cell: ({ getValue }) => <code className="font-mono text-xs">{getValue() as string}</code> },
      {
        id: "metrics",
        accessorFn: (r) => r.metrics.map((m) => getMetric(m).label).join(", "),
        header: "Measurements",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block max-w-72 truncate text-xs" title={row.original.metrics.map((m) => getMetric(m).label).join(", ")}>
            {row.original.seriesCount} · {row.original.metrics.slice(0, 4).map((m) => getMetric(m).shortLabel ?? getMetric(m).label).join(", ")}
            {row.original.metrics.length > 4 ? "…" : ""}
          </span>
        ),
      },
      { accessorKey: "lastSeenAt", header: "Last observation", cell: ({ row }) => <TimeAgo iso={row.original.lastSeenAt} className="text-xs" /> },
      { id: "freshness", accessorFn: (r) => FRESH_ORDER[r.freshness], header: "Status", cell: ({ row }) => <FreshnessBadge value={row.original.freshness} /> },
      {
        id: "coords",
        accessorFn: (r) => (r.latitude !== null ? 1 : 0),
        header: "Location",
        cell: ({ row }) =>
          row.original.latitude !== null && row.original.longitude !== null ? (
            <span className="tabular inline-flex items-center gap-1 text-xs">
              <MapPin className="size-3 text-text-3" aria-hidden />
              {row.original.latitude.toFixed(4)}, {row.original.longitude.toFixed(4)}
            </span>
          ) : (
            <span className="text-xs text-text-3">not provided</span>
          ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _id, value) => {
      const v = String(value).toLowerCase();
      const r = row.original;
      return [r.name, r.externalId, r.projectName ?? "", PROVIDER_META[r.provider].name].some((x) => x.toLowerCase().includes(v));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
    autoResetPageIndex: true,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-3" aria-hidden />
          <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder="Search name, ID, project…" aria-label="Search stations" className="w-64 pl-8" />
        </div>
        {!lockProvider && (
          <Select aria-label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">All providers</option>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_META[p].name}
              </option>
            ))}
          </Select>
        )}
        <Select aria-label="Status" value={fresh} onChange={(e) => setFresh(e.target.value)}>
          <option value="">Any status</option>
          <option value="live">Reporting</option>
          <option value="stale">Stale</option>
          <option value="offline">Offline</option>
          <option value="error">Error</option>
        </Select>
        <span className="ml-auto text-xs text-text-3">{table.getFilteredRowModel().rows.length} of {rows.length}</span>
      </div>
      <TableWrap className="rounded-lg border border-border">
        <Table>
          <thead className="bg-surface-2">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <Th key={h.id} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}>
                      {h.column.getCanSort() ? (
                        <button className="inline-flex items-center gap-1 uppercase hover:text-text" onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </Th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="cursor-pointer transition-colors hover:bg-surface-2/60" onClick={() => router.push(`/stations/${encodeURIComponent(r.original.id)}`)}>
                {r.getVisibleCells().map((c) => (
                  <Td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</Td>
                ))}
              </tr>
            ))}
            {!table.getRowModel().rows.length && (
              <tr>
                <Td colSpan={columns.length} className="py-8 text-center text-text-3">
                  No stations match.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </TableWrap>
      <Pagination
        page={table.getState().pagination.pageIndex + 1}
        pageCount={Math.max(1, table.getPageCount())}
        total={table.getFilteredRowModel().rows.length}
        pageSize={table.getState().pagination.pageSize}
        onPage={(p) => table.setPageIndex(p - 1)}
        onPageSize={(n) => table.setPageSize(n)}
        pageSizes={[10, 25, 50]}
        label="stations"
      />
    </div>
  );
}
