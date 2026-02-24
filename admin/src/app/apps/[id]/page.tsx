import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import CopyButton from "./CopyButton";
import LinkProviderForm from "./LinkProviderForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AppDetailPage({ params }: Props) {
  const { id } = await params;

  const app = await prisma.appInstance.findUnique({
    where: { id },
    include: {
      appProviders: {
        include: {
          provider: true,
          credential: true,
        },
      },
      usageRecords: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { provider: true },
      },
      _count: {
        select: { usageRecords: true, requestLogs: true },
      },
    },
  });

  if (!app) {
    notFound();
  }

  const totalTokens = await prisma.tokenUsage.aggregate({
    where: { appId: id },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
    },
    _count: true,
  });

  const allProviders = await prisma.provider.findMany({
    orderBy: { name: "asc" },
  });

  const linkedProviderIds = new Set(app.appProviders.map((ap) => ap.providerId));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/apps"
          className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          &larr; Back to Apps
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">{app.name}</h1>
          {app.isActive ? (
            <span className="inline-flex rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-300">
              Active
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-zinc-600/50 px-2 py-0.5 text-xs font-medium text-zinc-400">
              Inactive
            </span>
          )}
        </div>
        {app.description && (
          <p className="mt-1 text-sm text-zinc-400">{app.description}</p>
        )}
      </div>

      {/* API Key Card */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
        <h2 className="mb-3 text-lg font-semibold text-zinc-100">
          Dummy API Key
        </h2>
        <p className="mb-3 text-sm text-zinc-400">
          Use this key as the API key when configuring your app to route through
          the proxy.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 break-all rounded-lg bg-zinc-900 px-4 py-2.5 font-mono text-sm text-zinc-100">
            {app.dummyApiKey}
          </code>
          <CopyButton text={app.dummyApiKey} />
        </div>
      </div>

      {/* Usage Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4">
          <p className="text-sm text-zinc-400">Total Requests</p>
          <p className="mt-1 text-2xl font-bold text-zinc-100">
            {totalTokens._count.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4">
          <p className="text-sm text-zinc-400">Input Tokens</p>
          <p className="mt-1 text-2xl font-bold text-zinc-100">
            {(totalTokens._sum.inputTokens || 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4">
          <p className="text-sm text-zinc-400">Output Tokens</p>
          <p className="mt-1 text-2xl font-bold text-zinc-100">
            {(totalTokens._sum.outputTokens || 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4">
          <p className="text-sm text-zinc-400">Request Logs</p>
          <p className="mt-1 text-2xl font-bold text-zinc-100">
            {app._count.requestLogs.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Linked Providers */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">
            Linked Providers ({app.appProviders.length})
          </h2>
        </div>

        {app.appProviders.length > 0 && (
          <div className="mb-4 overflow-hidden rounded border border-zinc-700">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-700 bg-zinc-700/30">
                <tr>
                  <th className="px-3 py-2 font-medium text-zinc-300">
                    Provider
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-300">
                    Auth Type
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-300">
                    Credential
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-300">
                    Linked
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700">
                {app.appProviders.map((ap) => (
                  <tr key={ap.id}>
                    <td className="px-3 py-2">
                      <Link
                        href={`/providers/${ap.providerId}`}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {ap.provider.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          ap.provider.authType === "oauth"
                            ? "bg-purple-500/20 text-purple-300"
                            : "bg-blue-500/20 text-blue-300"
                        }`}
                      >
                        {ap.provider.authType === "oauth" ? "OAuth" : "API Key"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {ap.credential?.label || "None"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {new Date(ap.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <LinkProviderForm
          appId={app.id}
          availableProviders={allProviders
            .filter((p) => !linkedProviderIds.has(p.id))
            .map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>

      {/* Recent Usage */}
      {app.usageRecords.length > 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-100">
            Recent Usage
          </h2>
          <div className="overflow-hidden rounded border border-zinc-700">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-700 bg-zinc-700/30">
                <tr>
                  <th className="px-3 py-2 font-medium text-zinc-300">Time</th>
                  <th className="px-3 py-2 font-medium text-zinc-300">
                    Provider
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-300">Model</th>
                  <th className="px-3 py-2 font-medium text-zinc-300">
                    Input
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-300">
                    Output
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-300">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700">
                {app.usageRecords.map((record) => (
                  <tr key={record.id}>
                    <td className="px-3 py-2 text-zinc-400">
                      {new Date(record.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-zinc-300">
                      {record.provider.name}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {record.model || "--"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {record.inputTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {record.outputTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-zinc-100">
                      {record.totalTokens.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
