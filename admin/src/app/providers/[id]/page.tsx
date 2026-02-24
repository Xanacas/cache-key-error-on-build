import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ProviderEditForm from "./ProviderEditForm";
import DeleteProviderButton from "./DeleteProviderButton";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProviderDetailPage({ params }: Props) {
  const { id } = await params;

  const provider = await prisma.provider.findUnique({
    where: { id },
    include: {
      credentials: {
        orderBy: { createdAt: "desc" },
      },
      appProviders: {
        include: { app: true },
      },
    },
  });

  if (!provider) {
    notFound();
  }

  let baseUrls: string[] = [];
  try {
    baseUrls = JSON.parse(provider.baseUrls);
  } catch {
    baseUrls = [provider.baseUrls];
  }

  let scopes: string[] = [];
  if (provider.scopes) {
    try {
      scopes = JSON.parse(provider.scopes);
    } catch {
      scopes = [provider.scopes];
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/providers"
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
          >
            &larr; Back to Providers
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-100">
            {provider.name}
            {provider.isBuiltIn && (
              <span className="ml-2 rounded bg-zinc-600 px-2 py-0.5 text-xs font-normal text-zinc-300">
                Built-in
              </span>
            )}
          </h1>
        </div>
        <DeleteProviderButton providerId={provider.id} providerName={provider.name} />
      </div>

      {/* Provider Details Card */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-100">Details</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-400">Auth Type</dt>
              <dd>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    provider.authType === "oauth"
                      ? "bg-purple-500/20 text-purple-300"
                      : "bg-blue-500/20 text-blue-300"
                  }`}
                >
                  {provider.authType === "oauth" ? "OAuth" : "API Key"}
                </span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-400">LLM Provider</dt>
              <dd className="text-zinc-100">
                {provider.isLlmProvider ? (
                  <span className="inline-flex rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-300">
                    Yes
                  </span>
                ) : (
                  "No"
                )}
              </dd>
            </div>
            <div>
              <dt className="mb-1 text-zinc-400">Base URLs</dt>
              <dd className="space-y-1">
                {baseUrls.map((url, i) => (
                  <div
                    key={i}
                    className="rounded bg-zinc-700/50 px-2 py-1 font-mono text-xs text-zinc-300"
                  >
                    {url}
                  </div>
                ))}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-400">Created</dt>
              <dd className="text-zinc-300">
                {new Date(provider.createdAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>

        {provider.authType === "oauth" && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
            <h2 className="mb-4 text-lg font-semibold text-zinc-100">
              OAuth Configuration
            </h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-zinc-400">Auth URL</dt>
                <dd className="mt-0.5 truncate font-mono text-xs text-zinc-300">
                  {provider.authUrl || "--"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Token URL</dt>
                <dd className="mt-0.5 truncate font-mono text-xs text-zinc-300">
                  {provider.tokenUrl || "--"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Refresh URL</dt>
                <dd className="mt-0.5 truncate font-mono text-xs text-zinc-300">
                  {provider.refreshUrl || "--"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Scopes</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {scopes.length > 0 ? (
                    scopes.map((scope, i) => (
                      <span
                        key={i}
                        className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300"
                      >
                        {scope}
                      </span>
                    ))
                  ) : (
                    <span className="text-zinc-500">None</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Redirect URL</dt>
                <dd className="mt-0.5 truncate font-mono text-xs text-zinc-300">
                  {provider.redirectUrl || "--"}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      {/* Edit Form */}
      <ProviderEditForm provider={{
        id: provider.id,
        name: provider.name,
        authType: provider.authType,
        baseUrls: baseUrls.join("\n"),
        isLlmProvider: provider.isLlmProvider,
        authUrl: provider.authUrl || "",
        tokenUrl: provider.tokenUrl || "",
        refreshUrl: provider.refreshUrl || "",
        scopes: scopes.join("\n"),
        redirectUrl: provider.redirectUrl || "",
      }} />

      {/* Linked Credentials */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">
            Credentials ({provider.credentials.length})
          </h2>
          <Link
            href="/credentials/new"
            className="text-sm text-blue-400 transition-colors hover:text-blue-300"
          >
            Add Credential
          </Link>
        </div>
        {provider.credentials.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No credentials linked to this provider.
          </p>
        ) : (
          <div className="overflow-hidden rounded border border-zinc-700">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-700 bg-zinc-700/30">
                <tr>
                  <th className="px-3 py-2 font-medium text-zinc-300">Label</th>
                  <th className="px-3 py-2 font-medium text-zinc-300">Type</th>
                  <th className="px-3 py-2 font-medium text-zinc-300">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700">
                {provider.credentials.map((cred) => (
                  <tr key={cred.id}>
                    <td className="px-3 py-2 text-zinc-100">
                      {cred.label || "Unlabeled"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {cred.apiKeyEncrypted ? "API Key" : "OAuth"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {new Date(cred.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Linked Apps */}
      {provider.appProviders.length > 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-100">
            Linked Apps ({provider.appProviders.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {provider.appProviders.map((ap) => (
              <Link
                key={ap.id}
                href={`/apps/${ap.appId}`}
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
              >
                {ap.app.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
