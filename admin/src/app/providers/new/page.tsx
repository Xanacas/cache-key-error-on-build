"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const PROVIDER_TEMPLATES: Record<
  string,
  {
    name: string;
    authType: string;
    baseUrls: string[];
    isLlmProvider: boolean;
    authUrl?: string;
    tokenUrl?: string;
    refreshUrl?: string;
    scopes?: string[];
    redirectUrl?: string;
  }
> = {
  google: {
    name: "Google",
    authType: "oauth",
    baseUrls: ["https://www.googleapis.com"],
    isLlmProvider: false,
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    refreshUrl: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "profile", "email"],
    redirectUrl: "http://localhost:3000/api/oauth/callback",
  },
  microsoft: {
    name: "Microsoft",
    authType: "oauth",
    baseUrls: ["https://graph.microsoft.com"],
    isLlmProvider: false,
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    refreshUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["openid", "profile", "User.Read"],
    redirectUrl: "http://localhost:3000/api/oauth/callback",
  },
  github: {
    name: "GitHub",
    authType: "oauth",
    baseUrls: ["https://api.github.com"],
    isLlmProvider: false,
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    refreshUrl: "",
    scopes: ["repo", "user"],
    redirectUrl: "http://localhost:3000/api/oauth/callback",
  },
  slack: {
    name: "Slack",
    authType: "oauth",
    baseUrls: ["https://slack.com/api"],
    isLlmProvider: false,
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    refreshUrl: "",
    scopes: ["chat:write", "channels:read"],
    redirectUrl: "http://localhost:3000/api/oauth/callback",
  },
  zoom: {
    name: "Zoom",
    authType: "oauth",
    baseUrls: ["https://api.zoom.us/v2"],
    isLlmProvider: false,
    authUrl: "https://zoom.us/oauth/authorize",
    tokenUrl: "https://zoom.us/oauth/token",
    refreshUrl: "https://zoom.us/oauth/token",
    scopes: ["meeting:read", "meeting:write"],
    redirectUrl: "http://localhost:3000/api/oauth/callback",
  },
  asana: {
    name: "Asana",
    authType: "oauth",
    baseUrls: ["https://app.asana.com/api/1.0"],
    isLlmProvider: false,
    authUrl: "https://app.asana.com/-/oauth_authorize",
    tokenUrl: "https://app.asana.com/-/oauth_token",
    refreshUrl: "https://app.asana.com/-/oauth_token",
    scopes: ["default"],
    redirectUrl: "http://localhost:3000/api/oauth/callback",
  },
  miro: {
    name: "Miro",
    authType: "oauth",
    baseUrls: ["https://api.miro.com/v2"],
    isLlmProvider: false,
    authUrl: "https://miro.com/oauth/authorize",
    tokenUrl: "https://api.miro.com/v1/oauth/token",
    refreshUrl: "https://api.miro.com/v1/oauth/token",
    scopes: ["boards:read", "boards:write"],
    redirectUrl: "http://localhost:3000/api/oauth/callback",
  },
  teams: {
    name: "Teams",
    authType: "oauth",
    baseUrls: ["https://graph.microsoft.com/v1.0"],
    isLlmProvider: false,
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    refreshUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["Chat.ReadWrite", "ChannelMessage.Send"],
    redirectUrl: "http://localhost:3000/api/oauth/callback",
  },
};

export default function NewProviderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [authType, setAuthType] = useState("api_key");
  const [baseUrls, setBaseUrls] = useState("");
  const [isLlmProvider, setIsLlmProvider] = useState(false);
  const [authUrl, setAuthUrl] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [refreshUrl, setRefreshUrl] = useState("");
  const [scopes, setScopes] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");

  function applyTemplate(templateKey: string) {
    if (!templateKey) return;
    const t = PROVIDER_TEMPLATES[templateKey];
    if (!t) return;
    setName(t.name);
    setAuthType(t.authType);
    setBaseUrls(t.baseUrls.join("\n"));
    setIsLlmProvider(t.isLlmProvider);
    setAuthUrl(t.authUrl || "");
    setTokenUrl(t.tokenUrl || "");
    setRefreshUrl(t.refreshUrl || "");
    setScopes(t.scopes?.join("\n") || "");
    setRedirectUrl(t.redirectUrl || "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

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

      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to create provider (${res.status})`);
      }

      router.push("/providers");
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
          href="/providers"
          className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          &larr; Back to Providers
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-100">
          Add New Provider
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Configure a new API provider for the proxy
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            Pre-fill from Template
          </label>
          <select
            onChange={(e) => applyTemplate(e.target.value)}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            defaultValue=""
          >
            <option value="">Select a template...</option>
            <option value="google">Google</option>
            <option value="microsoft">Microsoft</option>
            <option value="github">GitHub</option>
            <option value="slack">Slack</option>
            <option value="zoom">Zoom</option>
            <option value="asana">Asana</option>
            <option value="miro">Miro</option>
            <option value="teams">Teams</option>
          </select>
        </div>

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
              placeholder="e.g. OpenAI, GitHub"
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              placeholder={"https://api.example.com\nhttps://api2.example.com"}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isLlmProvider"
              checked={isLlmProvider}
              onChange={(e) => setIsLlmProvider(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-800"
            />
            <label htmlFor="isLlmProvider" className="text-sm text-zinc-300">
              This is an LLM provider (enables token usage tracking)
            </label>
          </div>

          {authType === "oauth" && (
            <div className="space-y-5 rounded-lg border border-zinc-600 bg-zinc-700/30 p-4">
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
                  required
                  placeholder="https://provider.com/oauth/authorize"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                  required
                  placeholder="https://provider.com/oauth/token"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Refresh URL (optional)
                </label>
                <input
                  type="url"
                  value={refreshUrl}
                  onChange={(e) => setRefreshUrl(e.target.value)}
                  placeholder="https://provider.com/oauth/token"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                  placeholder={"openid\nprofile\nemail"}
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                  placeholder="http://localhost:3000/api/oauth/callback"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Provider"}
            </button>
            <Link
              href="/providers"
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
