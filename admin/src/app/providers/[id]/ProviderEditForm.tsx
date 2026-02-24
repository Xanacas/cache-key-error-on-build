"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ProviderFormData {
  id: string;
  name: string;
  authType: string;
  baseUrls: string;
  isLlmProvider: boolean;
  authUrl: string;
  tokenUrl: string;
  refreshUrl: string;
  scopes: string;
  redirectUrl: string;
}

export default function ProviderEditForm({
  provider,
}: {
  provider: ProviderFormData;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const [name, setName] = useState(provider.name);
  const [authType, setAuthType] = useState(provider.authType);
  const [baseUrls, setBaseUrls] = useState(provider.baseUrls);
  const [isLlmProvider, setIsLlmProvider] = useState(provider.isLlmProvider);
  const [authUrl, setAuthUrl] = useState(provider.authUrl);
  const [tokenUrl, setTokenUrl] = useState(provider.tokenUrl);
  const [refreshUrl, setRefreshUrl] = useState(provider.refreshUrl);
  const [scopes, setScopes] = useState(provider.scopes);
  const [redirectUrl, setRedirectUrl] = useState(provider.redirectUrl);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const body: Record<string, unknown> = {
        name,
        authType,
        baseUrls: baseUrls
          .split("\n")
          .map((u) => u.trim())
          .filter(Boolean),
        isLlmProvider,
      };

      if (authType === "oauth") {
        body.authUrl = authUrl;
        body.tokenUrl = tokenUrl;
        body.refreshUrl = refreshUrl || undefined;
        body.scopes = scopes
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        body.redirectUrl = redirectUrl;
      }

      const res = await fetch(`/api/providers/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to update provider (${res.status})`);
      }

      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-6 text-left"
      >
        <h2 className="text-lg font-semibold text-zinc-100">Edit Provider</h2>
        <span className="text-zinc-400">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="border-t border-zinc-700 p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
              Provider updated successfully.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                Auth Type
              </label>
              <select
                value={authType}
                onChange={(e) => setAuthType(e.target.value)}
                className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="api_key">API Key</option>
                <option value="oauth">OAuth</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                Base URLs (one per line)
              </label>
              <textarea
                value={baseUrls}
                onChange={(e) => setBaseUrls(e.target.value)}
                required
                rows={3}
                className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="editIsLlmProvider"
                checked={isLlmProvider}
                onChange={(e) => setIsLlmProvider(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-800"
              />
              <label htmlFor="editIsLlmProvider" className="text-sm text-zinc-300">
                LLM Provider
              </label>
            </div>

            {authType === "oauth" && (
              <div className="space-y-4 rounded-lg border border-zinc-600 bg-zinc-700/30 p-4">
                <h3 className="text-sm font-medium text-zinc-200">
                  OAuth Configuration
                </h3>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Authorization URL
                  </label>
                  <input
                    type="url"
                    value={authUrl}
                    onChange={(e) => setAuthUrl(e.target.value)}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Token URL
                  </label>
                  <input
                    type="url"
                    value={tokenUrl}
                    onChange={(e) => setTokenUrl(e.target.value)}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Refresh URL
                  </label>
                  <input
                    type="url"
                    value={refreshUrl}
                    onChange={(e) => setRefreshUrl(e.target.value)}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Scopes (one per line)
                  </label>
                  <textarea
                    value={scopes}
                    onChange={(e) => setScopes(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Redirect URL
                  </label>
                  <input
                    type="url"
                    value={redirectUrl}
                    onChange={(e) => setRedirectUrl(e.target.value)}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
