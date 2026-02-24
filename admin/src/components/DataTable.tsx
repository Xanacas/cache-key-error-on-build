"use client";

import { type ReactNode } from "react";

export interface Column<T = unknown> {
  key: string;
  label: string;
  render?: (value: unknown, item: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-card-border bg-card-bg p-12 text-center">
        <div className="text-2xl text-zinc-600">&#x2205;</div>
        <p className="mt-2 text-sm text-zinc-500">No data to display</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-card-border bg-card-bg">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800/80">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {data.map((item, rowIndex) => (
              <tr
                key={rowIndex}
                onClick={() => onRowClick?.(item)}
                className={`transition-colors ${
                  onRowClick
                    ? "cursor-pointer hover:bg-zinc-800/40"
                    : "hover:bg-zinc-800/20"
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="whitespace-nowrap px-4 py-3 text-zinc-300"
                  >
                    {col.render
                      ? col.render(item[col.key], item)
                      : (String(item[col.key] ?? "-"))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
