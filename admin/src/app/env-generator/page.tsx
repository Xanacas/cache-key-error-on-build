"use client";

import { useState, useEffect } from "react";

interface AppOption {
  id: string;
  name: string;
}

interface ProviderOption {
  id: string;
  name: string;
  authType: string;
}

export default function EnvGeneratorPage() {
  const [apps, setApps] = useState<AppOption[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedApp, setSelectedApp] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [envContent, setEnvContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/apps").then((r) => r.json()),
      fetch("/api/providers").then((r) => r.json()),
    ]).then(([appsData, providersData]) => {
      setApps(Array.isArray(appsData) ? appsData : appsData.apps || []);
      setProviders(
        Array.isArray(providersData)
          ? providersData
          : providersData.providers || []
      );
    });
  }, []);

  function toggleProvider(id: string) {
    setSelectedProviders((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleGenerate() {
    if (!selectedApp || selectedProviders.length === 0) return;
    setLoading(true);
    setError("");
    setEnvContent("");

    try {
      const res = await fetch("/api/env-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: selectedApp,
          providerIds: selectedProviders,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate ENV");
      }

      const data = await res.json();
      setEnvContent(data.env || data.content || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(envContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">ENV Generator</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Generate environment variable configurations for your apps
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Select App
            </label>
            <select
              value={selectedApp}
              onChange={(e) => setSelectedApp(e.target.value)}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select an app...</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Select Providers
            </label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {providers.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    selectedProviders.includes(p.id)
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-zinc-600 bg-zinc-700/50 hover:bg-zinc-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedProviders.includes(p.id)}
                    onChange={() => toggleProvider(p.id)}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-800"
                  />
                  <div>
                    <span className="text-sm font-medium text-zinc-100">
                      {p.name}
                    </span>
                    <span
                      className={`ml-2 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        p.authType === "oauth"
                          ? "bg-purple-500/20 text-purple-300"
                          : "bg-blue-500/20 text-blue-300"
                      }`}
                    >
                      {p.authType === "oauth" ? "OAuth" : "API Key"}
                    </span>
                  </div>
                </label>
              ))}
            </div>
            {providers.length === 0 && (
              <p className="text-sm text-zinc-500">
                No providers available. Create providers first.
              </p>
            )}
          </div>

          <button
            onClick={handleGenerate}
            disabled={!selectedApp || selectedProviders.length === 0 || loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate ENV"}
          </button>
        </div>
      </div>

      {envContent && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">
              Generated .env
            </h2>
            <button
              onClick={handleCopy}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              {copied ? "Copied!" : "Copy to Clipboard"}
            </button>
          </div>
          <pre className="overflow-auto rounded-lg bg-zinc-900 p-4 font-mono text-sm text-zinc-300">
            {envContent}
          </pre>
        </div>
      )}

      {/* Example Output */}
      {!envContent && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
          <h2 className="mb-3 text-sm font-medium text-zinc-400">
            Example Output
          </h2>
          <pre className="overflow-auto rounded-lg bg-zinc-900 p-4 font-mono text-xs text-zinc-500">
{`# Provider: OpenAI
OPENAI_API_KEY=proxy_app123_abc456

# Provider: GitHub (OAuth)
GITHUB_CLIENT_ID=proxy_oauth_app123_def789
GITHUB_CLIENT_SECRET=dummy_not_used`}
          </pre>
        </div>
      )}
    </div>
  );
}
