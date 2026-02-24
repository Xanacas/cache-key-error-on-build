import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AppsPage() {
  const apps = await prisma.appInstance.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { appProviders: true, usageRecords: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Apps</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage application instances and their API keys
          </p>
        </div>
        <Link
          href="/apps/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          Create App
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-700 bg-zinc-800/50">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-300">Name</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Dummy API Key</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Active</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Providers</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Created</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-700">
            {apps.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No apps created yet.{" "}
                  <Link href="/apps/new" className="text-blue-400 hover:underline">
                    Create your first app
                  </Link>
                </td>
              </tr>
            ) : (
              apps.map((app) => (
                <tr
                  key={app.id}
                  className="transition-colors hover:bg-zinc-700/30"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-zinc-100">{app.name}</span>
                    {app.description && (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {app.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-xs text-zinc-300">
                      {app.dummyApiKey.substring(0, 20)}...
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    {app.isActive ? (
                      <span className="inline-flex rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-300">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-zinc-600/50 px-2 py-0.5 text-xs font-medium text-zinc-400">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {app._count.appProviders}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(app.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/apps/${app.id}`}
                      className="text-blue-400 transition-colors hover:text-blue-300"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
