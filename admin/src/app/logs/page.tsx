import Link from "next/link";
import { prisma } from "@/lib/prisma";

interface Props {
  searchParams: Promise<{
    appId?: string;
    action?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 50;

export default async function LogsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { appId, action } = params;
  const page = Math.max(1, parseInt(params.page || "1"));

  const where: Record<string, unknown> = {};
  if (appId) where.appId = appId;
  if (action) where.action = action;

  const [logs, totalCount, apps] = await Promise.all([
    prisma.requestLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        app: { select: { name: true } },
      },
    }),
    prisma.requestLog.count({ where }),
    prisma.appInstance.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  function buildUrl(params: Record<string, string>): string {
    const sp = new URLSearchParams();
    if (appId) sp.set("appId", appId);
    if (action) sp.set("action", action);
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    return `/logs?${sp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Request Logs</h1>
        <p className="mt-1 text-sm text-zinc-400">
          View proxy request activity and outcomes
        </p>
      </div>

      {/* Filters */}
      <form className="rounded-lg border border-zinc-700 bg-zinc-800 p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              App
            </label>
            <select
              name="appId"
              defaultValue={appId || ""}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Apps</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Action
            </label>
            <select
              name="action"
              defaultValue={action || ""}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Actions</option>
              <option value="forwarded">Forwarded</option>
              <option value="blocked">Blocked</option>
              <option value="manipulated">Manipulated</option>
              <option value="mocked">Mocked</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Filter
            </button>
            <Link
              href="/logs"
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              Clear
            </Link>
          </div>
        </div>
      </form>

      {/* Count */}
      <p className="text-sm text-zinc-400">
        {totalCount.toLocaleString()} total logs
        {totalPages > 1 && ` (page ${page} of ${totalPages})`}
      </p>

      {/* Logs Table */}
      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-700 bg-zinc-800/50">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-300">Time</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Method</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Host</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Path</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Status</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Action</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Duration</th>
              <th className="px-4 py-3 font-medium text-zinc-300">App</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-700">
            {logs.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No request logs found.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr
                  key={log.id}
                  className="transition-colors hover:bg-zinc-700/30"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-zinc-700 px-1.5 py-0.5 font-mono text-xs text-zinc-300">
                      {log.method}
                    </span>
                  </td>
                  <td className="max-w-[150px] truncate px-4 py-3 font-mono text-xs text-zinc-300">
                    {log.host}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-zinc-400">
                    {log.path}
                  </td>
                  <td className="px-4 py-3">
                    {log.statusCode ? (
                      <span
                        className={`font-mono text-xs ${
                          log.statusCode >= 200 && log.statusCode < 300
                            ? "text-green-400"
                            : log.statusCode >= 400
                              ? "text-red-400"
                              : "text-yellow-400"
                        }`}
                      >
                        {log.statusCode}
                      </span>
                    ) : (
                      <span className="text-zinc-500">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        log.action === "forwarded"
                          ? "bg-green-500/20 text-green-300"
                          : log.action === "blocked"
                            ? "bg-red-500/20 text-red-300"
                            : log.action === "manipulated"
                              ? "bg-yellow-500/20 text-yellow-300"
                              : "bg-purple-500/20 text-purple-300"
                      }`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {log.duration != null ? `${log.duration}ms` : "--"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {log.app?.name || "--"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={buildUrl({ page: String(page - 1) })}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              Previous
            </Link>
          )}
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 7) {
              pageNum = i + 1;
            } else if (page <= 4) {
              pageNum = i + 1;
            } else if (page >= totalPages - 3) {
              pageNum = totalPages - 6 + i;
            } else {
              pageNum = page - 3 + i;
            }
            return (
              <Link
                key={pageNum}
                href={buildUrl({ page: String(pageNum) })}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  pageNum === page
                    ? "bg-blue-600 font-medium text-white"
                    : "border border-zinc-600 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {pageNum}
              </Link>
            );
          })}
          {page < totalPages && (
            <Link
              href={buildUrl({ page: String(page + 1) })}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
