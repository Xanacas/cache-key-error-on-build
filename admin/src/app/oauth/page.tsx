"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface AppOption {
  id: string;
  name: string;
}

interface ProviderOption {
  id: string;
  name: string;
  authType: string;
}

interface CredentialOption {
  id: string;
  label: string | null;
  providerId: string;
  clientId: string | null;
}

interface TokenInfo {
  id: string;
  providerId: string;
  appId: string;
  expiresAt: string | null;
  tokenType: string;
  scope: string | null;
  createdAt: string;
  provider: { name: string };
  app: { name: string };
}

export default function OAuthPage() {
  const [apps, setApps] = useState<AppOption[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [credentials, setCredentials] = useState<CredentialOption[]>([]);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);

  const [selectedApp, setSelectedApp] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedCredential, setSelectedCredential] = useState("");

  const [authUrl, setAuthUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/apps").then((r) => r.json()),
      fetch("/api/providers").then((r) => r.json()),
      fetch("/api/credentials").then((r) => r.json()),
    ]).then(([appsData, providersData, credsData]) => {
      setApps(Array.isArray(appsData) ? appsData : appsData.apps || []);
      const provList = Array.isArray(providersData)
        ? providersData
        : providersData.providers || [];
      setProviders(provList);
      setCredentials(
        Array.isArray(credsData) ? credsData : credsData.credentials || []
      );
    });

    fetch("/api/oauth")
      .then((r) => r.json())
      .then((data) => setTokens(Array.isArray(data) ? data : data.tokens || []))
      .catch(() => setTokens([]));
  }, []);

  const oauthProviders = providers.filter((p) => p.authType === "oauth");
  const filteredCredentials = credentials.filter(
    (c) => c.providerId === selectedProvider && c.clientId
  );

  async function handleStartOAuth() {
    if (!selectedApp || !selectedProvider || !selectedCredential) return;
    setLoading(true);
    setError("");
    setAuthUrl("");

    try {
      const res = await fetch("/api/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: selectedApp,
          providerId: selectedProvider,
          credentialId: selectedCredential,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start OAuth flow");
      }

      const data = await res.json();
      setAuthUrl(data.authUrl || data.url || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">OAuth Flows</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Initiate OAuth authorization flows and manage active tokens
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Start OAuth Flow */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Start OAuth Flow
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              App
            </label>
            <select
              value={selectedApp}
              onChange={(e) => setSelectedApp(e.target.value)}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select app...</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Provider (OAuth only)
            </label>
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                setSelectedCredential("");
              }}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select provider...</option>
              {oauthProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Credential
            </label>
            <select
              value={selectedCredential}
              onChange={(e) => setSelectedCredential(e.target.value)}
              disabled={!selectedProvider}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="">Select credential...</option>
              {filteredCredentials.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || c.clientId || c.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleStartOAuth}
          disabled={
            !selectedApp || !selectedProvider || !selectedCredential || loading
          }
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Starting..." : "Start OAuth Flow"}
        </button>

        {authUrl && (
          <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
            <p className="mb-2 text-sm font-medium text-blue-300">
              Authorization URL Generated
            </p>
            <p className="mb-3 text-sm text-zinc-400">
              Open this URL in your browser to authorize the application:
            </p>
            <div className="flex items-start gap-2">
              <code className="flex-1 break-all rounded bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-300">
                {authUrl}
              </code>
              <a
                href={authUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Open
              </a>
              <button
                onClick={() => navigator.clipboard.writeText(authUrl)}
                className="shrink-0 rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active Tokens */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Active Tokens ({tokens.length})
        </h2>
        {tokens.length === 0 ? (
          <p className="text-sm text-zinc-500">No active OAuth tokens.</p>
        ) : (
          <div className="overflow-hidden rounded border border-zinc-700">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-700 bg-zinc-700/30">
                <tr>
                  <th className="px-3 py-2 font-medium text-zinc-300">App</th>
                  <th className="px-3 py-2 font-medium text-zinc-300">
                    Provider
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-300">Type</th>
                  <th className="px-3 py-2 font-medium text-zinc-300">
                    Scope
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-300">
                    Expires
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-300">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700">
                {tokens.map((token) => (
                  <tr key={token.id}>
                    <td className="px-3 py-2 text-zinc-100">
                      <Link
                        href={`/apps/${token.appId}`}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {token.app.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-zinc-300">
                      {token.provider.name}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {token.tokenType}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {token.scope || "--"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {token.expiresAt
                        ? new Date(token.expiresAt).toLocaleString()
                        : "Never"}
                    </td>
                    <td className="px-3 py-2">
                      {isExpired(token.expiresAt) ? (
                        <span className="inline-flex rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-300">
                          Expired
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-300">
                          Active
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
