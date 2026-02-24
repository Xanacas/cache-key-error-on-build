import Link from "next/link";
import { prisma } from "@/lib/prisma";

interface Props {
  searchParams: Promise<{
    appId?: string;
    providerId?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function UsagePage({ searchParams }: Props) {
  const params = await searchParams;
  const { appId, providerId, from, to } = params;

  const where: Record<string, unknown> = {};
  if (appId) where.appId = appId;
  if (providerId) where.providerId = providerId;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to + "T23:59:59Z") } : {}),
    };
  }

  const [records, totals, apps, providers] = await Promise.all([
    prisma.tokenUsage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        app: { select: { name: true } },
        provider: { select: { name: true } },
      },
    }),
    prisma.tokenUsage.aggregate({
      where,
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
      _count: true,
    }),
    prisma.appInstance.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.provider.findMany({
      where: { isLlmProvider: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Token Usage</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Monitor LLM token consumption across apps and providers
        </p>
      </div>

      {/* Filters */}
      <form className="rounded-lg border border-zinc-700 bg-zinc-800 p-4">
        <div className="grid gap-4 sm:grid-cols-4">
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
              Provider
            </label>
            <select
              name="providerId"
              defaultValue={providerId || ""}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Providers</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              From
            </label>
            <input
              type="date"
              name="from"
              defaultValue={from || ""}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              To
            </label>
            <input
              type="date"
              name="to"
              defaultValue={to || ""}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            Apply Filters
          </button>
          <Link
            href="/usage"
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            Clear
          </Link>
        </div>
      </form>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-5">
          <p className="text-sm text-zinc-400">Total Input Tokens</p>
          <p className="mt-1 text-3xl font-bold text-zinc-100">
            {(totals._sum.inputTokens || 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-5">
          <p className="text-sm text-zinc-400">Total Output Tokens</p>
          <p className="mt-1 text-3xl font-bold text-zinc-100">
            {(totals._sum.outputTokens || 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-5">
          <p className="text-sm text-zinc-400">Total Requests</p>
          <p className="mt-1 text-3xl font-bold text-zinc-100">
            {totals._count.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Usage Table */}
      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-700 bg-zinc-800/50">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-300">Date</th>
              <th className="px-4 py-3 font-medium text-zinc-300">App</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Provider</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Model</th>
              <th className="px-4 py-3 font-medium text-zinc-300 text-right">
                Input
              </th>
              <th className="px-4 py-3 font-medium text-zinc-300 text-right">
                Output
              </th>
              <th className="px-4 py-3 font-medium text-zinc-300 text-right">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-700">
            {records.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No usage records found.
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr
                  key={r.id}
                  className="transition-colors hover:bg-zinc-700/30"
                >
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{r.app.name}</td>
                  <td className="px-4 py-3 text-zinc-300">{r.provider.name}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.model || "--"}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400">
                    {r.inputTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400">
                    {r.outputTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-zinc-100">
                    {r.totalTokens.toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {records.length === 100 && (
        <p className="text-center text-sm text-zinc-500">
          Showing the latest 100 records. Use filters to narrow results.
        </p>
      )}
    </div>
  );
}
