"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ProviderOption {
  id: string;
  name: string;
  authType: string;
}

export default function NewCredentialPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [fetchingProviders, setFetchingProviders] = useState(true);

  const [providerId, setProviderId] = useState("");
  const [label, setLabel] = useState("");
  const [credType, setCredType] = useState<"api_key" | "oauth">("api_key");
  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  useEffect(() => {
    fetch("/api/providers")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.providers || [];
        setProviders(list);
      })
      .catch(() => setProviders([]))
      .finally(() => setFetchingProviders(false));
  }, []);

  useEffect(() => {
    const selected = providers.find((p) => p.id === providerId);
    if (selected) {
      setCredType(selected.authType === "oauth" ? "oauth" : "api_key");
    }
  }, [providerId, providers]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const body: Record<string, unknown> = {
        providerId,
        label: label || undefined,
      };

      if (credType === "api_key") {
        body.apiKey = apiKey;
      } else {
        body.clientId = clientId;
        body.clientSecret = clientSecret;
      }

      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || `Failed to create credential (${res.status})`
        );
      }

      router.push("/credentials");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/credentials"
          className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          &larr; Back to Credentials
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-100">
          Add New Credential
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Store API keys or OAuth client credentials for a provider
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Provider
            </label>
            {fetchingProviders ? (
              <div className="text-sm text-zinc-500">Loading providers...</div>
            ) : (
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select a provider...</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.authType === "oauth" ? "OAuth" : "API Key"})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Label (optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Production Key, Dev OAuth Client"
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Credential Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="radio"
                  name="credType"
                  value="api_key"
                  checked={credType === "api_key"}
                  onChange={() => setCredType("api_key")}
                  className="text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-800"
                />
                API Key
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="radio"
                  name="credType"
                  value="oauth"
                  checked={credType === "oauth"}
                  onChange={() => setCredType("oauth")}
                  className="text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-800"
                />
                OAuth Client
              </label>
            </div>
          </div>

          {credType === "api_key" ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                placeholder="sk-..."
                className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-zinc-500">
                The key will be encrypted before storage.
              </p>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-zinc-600 bg-zinc-700/30 p-4">
              <h3 className="text-sm font-medium text-zinc-200">
                OAuth Client Credentials
              </h3>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Client ID
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  placeholder="Your OAuth client ID"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Client Secret
                </label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  required
                  placeholder="Your OAuth client secret"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  The secret will be encrypted before storage.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Credential"}
            </button>
            <Link
              href="/credentials"
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
