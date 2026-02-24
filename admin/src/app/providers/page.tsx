import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function ProvidersPage() {
  const providers = await prisma.provider.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { credentials: true, appProviders: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Providers</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage API providers and their configurations
          </p>
        </div>
        <Link
          href="/providers/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          Add Provider
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-700 bg-zinc-800/50">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-300">Name</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Auth Type</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Base URLs</th>
              <th className="px-4 py-3 font-medium text-zinc-300">LLM Provider</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Credentials</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-700">
            {providers.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No providers configured yet.{" "}
                  <Link href="/providers/new" className="text-blue-400 hover:underline">
                    Add your first provider
                  </Link>
                </td>
              </tr>
            ) : (
              providers.map((provider) => {
                let baseUrls: string[] = [];
                try {
                  baseUrls = JSON.parse(provider.baseUrls);
                } catch {
                  baseUrls = [provider.baseUrls];
                }

                return (
                  <tr
                    key={provider.id}
                    className="transition-colors hover:bg-zinc-700/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-100">
                          {provider.name}
                        </span>
                        {provider.isBuiltIn && (
                          <span className="rounded bg-zinc-600 px-1.5 py-0.5 text-xs text-zinc-300">
                            Built-in
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          provider.authType === "oauth"
                            ? "bg-purple-500/20 text-purple-300"
                            : "bg-blue-500/20 text-blue-300"
                        }`}
                      >
                        {provider.authType === "oauth" ? "OAuth" : "API Key"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      <div className="max-w-xs truncate">
                        {baseUrls.join(", ")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {provider.isLlmProvider ? (
                        <span className="inline-flex rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-300">
                          LLM
                        </span>
                      ) : (
                        <span className="text-zinc-500">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {provider._count.credentials}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/providers/${provider.id}`}
                        className="text-blue-400 transition-colors hover:text-blue-300"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
