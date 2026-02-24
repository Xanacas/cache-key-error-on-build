import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/PageHeader";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  change?: string;
}

function StatCard({ label, value, icon, change }: StatCardProps) {
  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-400">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">
            {value}
          </p>
          {change && (
            <p className="mt-1 text-xs text-zinc-500">{change}</p>
          )}
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800/80 text-lg">
          {icon}
        </span>
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getStatusColor(statusCode: number | null): string {
  if (statusCode === null) return "text-zinc-500";
  if (statusCode >= 200 && statusCode < 300) return "text-emerald-400";
  if (statusCode >= 300 && statusCode < 400) return "text-amber-400";
  if (statusCode >= 400 && statusCode < 500) return "text-orange-400";
  return "text-red-400";
}

export default async function DashboardPage() {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [activeApps, providerCount, recentRequests, tokenUsageAgg] =
    await Promise.all([
      prisma.appInstance.count({ where: { isActive: true } }),
      prisma.provider.count(),
      prisma.requestLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.tokenUsage.aggregate({
        where: { createdAt: { gte: twentyFourHoursAgo } },
        _sum: { totalTokens: true, inputTokens: true, outputTokens: true },
        _count: true,
      }),
    ]);

  const totalRequests24h = await prisma.requestLog.count({
    where: { createdAt: { gte: twentyFourHoursAgo } },
  });

  const totalTokens24h = tokenUsageAgg._sum.totalTokens ?? 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your API proxy system"
      />

      {/* Stats Grid */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Apps"
          value={activeApps}
          icon={"\u25A1"}
          change="Configured applications"
        />
        <StatCard
          label="Providers"
          value={providerCount}
          icon={"\u2601"}
          change="API providers"
        />
        <StatCard
          label="Requests (24h)"
          value={formatNumber(totalRequests24h)}
          icon={"\u25CE"}
          change="Last 24 hours"
        />
        <StatCard
          label="Token Usage (24h)"
          value={formatNumber(totalTokens24h)}
          icon={"\u2261"}
          change={`${formatNumber(tokenUsageAgg._sum.inputTokens ?? 0)} in / ${formatNumber(tokenUsageAgg._sum.outputTokens ?? 0)} out`}
        />
      </div>

      {/* Recent Request Logs */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">
            Recent Requests
          </h2>
          <a
            href="/logs"
            className="text-sm text-indigo-400 transition-colors hover:text-indigo-300"
          >
            View all &rarr;
          </a>
        </div>
        <div className="overflow-hidden rounded-xl border border-card-border bg-card-bg">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/80">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Method
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Host
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Path
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {recentRequests.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-zinc-500"
                    >
                      No requests logged yet
                    </td>
                  </tr>
                ) : (
                  recentRequests.map((log) => (
                    <tr
                      key={log.id}
                      className="transition-colors hover:bg-zinc-800/20"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs font-semibold text-zinc-300">
                          {log.method}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                        {log.host ?? "-"}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-zinc-300">
                        {log.path}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`font-mono text-xs font-semibold ${getStatusColor(log.statusCode)}`}
                        >
                          {log.statusCode ?? "-"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                        {formatDuration(log.duration)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                        {log.createdAt.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Token Usage Chart Placeholder */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">
            Token Usage Trend
          </h2>
          <a
            href="/usage"
            className="text-sm text-indigo-400 transition-colors hover:text-indigo-300"
          >
            View details &rarr;
          </a>
        </div>
        <div className="flex h-64 items-center justify-center rounded-xl border border-card-border bg-card-bg">
          <div className="text-center">
            <p className="text-3xl text-zinc-700">&#x2500;&#x2500;&#x2500;&#x2571;&#x2572;&#x2500;&#x2571;&#x2572;&#x2500;&#x2500;</p>
            <p className="mt-3 text-sm text-zinc-500">
              Token usage chart will be rendered here
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Connect a charting library (e.g. recharts) for visualization
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
