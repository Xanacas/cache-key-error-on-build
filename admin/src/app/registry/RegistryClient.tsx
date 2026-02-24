"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RegistryRule {
  id: string;
  appId: string;
  appName: string;
  domain: string;
  allowedMethods: string;
  pathPattern: string;
  rateLimit: number | null;
  isActive: boolean;
  createdAt: string;
}

interface AppOption {
  id: string;
  name: string;
}

export default function RegistryClient({
  initialRules,
  apps,
}: {
  initialRules: RegistryRule[];
  apps: AppOption[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [appId, setAppId] = useState("");
  const [domain, setDomain] = useState("");
  const [allowedMethods, setAllowedMethods] = useState("GET,POST");
  const [pathPattern, setPathPattern] = useState(".*");
  const [rateLimit, setRateLimit] = useState("");

  // Group rules by app
  const groupedRules: Record<string, RegistryRule[]> = {};
  for (const rule of initialRules) {
    const key = rule.appName;
    if (!groupedRules[key]) groupedRules[key] = [];
    groupedRules[key].push(rule);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const methods = allowedMethods
        .split(",")
        .map((m) => m.trim().toUpperCase())
        .filter(Boolean);

      const res = await fetch("/api/registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId,
          domain,
          allowedMethods: JSON.stringify(methods),
          pathPattern,
          rateLimit: rateLimit ? parseInt(rateLimit) : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create rule");
      }

      setShowForm(false);
      setDomain("");
      setAllowedMethods("GET,POST");
      setPathPattern(".*");
      setRateLimit("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(ruleId: string) {
    try {
      const res = await fetch(`/api/registry/${ruleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.refresh();
    } catch {
      alert("Failed to delete rule");
    }
  }

  async function handleToggle(ruleId: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/registry/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
      router.refresh();
    } catch {
      alert("Failed to toggle rule");
    }
  }

  function parseMethodsDisplay(methodsJson: string): string {
    try {
      const arr = JSON.parse(methodsJson);
      return Array.isArray(arr) ? arr.join(", ") : methodsJson;
    } catch {
      return methodsJson;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Registry Rules</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Define allowed domains, methods, and path patterns per app
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          {showForm ? "Cancel" : "Add Rule"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {showForm && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-100">
            New Registry Rule
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                  App
                </label>
                <select
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  required
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
                  Domain
                </label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  required
                  placeholder="api.example.com"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Allowed Methods (comma-separated)
                </label>
                <input
                  type="text"
                  value={allowedMethods}
                  onChange={(e) => setAllowedMethods(e.target.value)}
                  required
                  placeholder="GET,POST,PUT"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Path Pattern (regex)
                </label>
                <input
                  type="text"
                  value={pathPattern}
                  onChange={(e) => setPathPattern(e.target.value)}
                  required
                  placeholder=".*"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Rate Limit (req/min, optional)
                </label>
                <input
                  type="number"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(e.target.value)}
                  placeholder="Unlimited"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Rule"}
            </button>
          </form>
        </div>
      )}

      {/* Rules grouped by app */}
      {Object.keys(groupedRules).length === 0 ? (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-8 text-center text-zinc-500">
          No registry rules configured yet.
        </div>
      ) : (
        Object.entries(groupedRules).map(([appName, rules]) => (
          <div key={appName} className="space-y-2">
            <h3 className="text-sm font-medium text-zinc-300">{appName}</h3>
            <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-700 bg-zinc-800/50">
                  <tr>
                    <th className="px-4 py-3 font-medium text-zinc-300">
                      Domain
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-300">
                      Allowed Methods
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-300">
                      Path Pattern
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-300">
                      Rate Limit
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-300">
                      Active
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-300">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700">
                  {rules.map((rule) => (
                    <tr
                      key={rule.id}
                      className="transition-colors hover:bg-zinc-700/30"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-zinc-300">
                        {rule.domain}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {parseMethodsDisplay(rule.allowedMethods)
                            .split(", ")
                            .map((m, i) => (
                              <span
                                key={i}
                                className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300"
                              >
                                {m}
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="font-mono text-xs text-zinc-400">
                          {rule.pathPattern}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {rule.rateLimit
                          ? `${rule.rateLimit}/min`
                          : "Unlimited"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggle(rule.id, rule.isActive)}
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                            rule.isActive
                              ? "bg-green-500/20 text-green-300 hover:bg-green-500/30"
                              : "bg-zinc-600/50 text-zinc-400 hover:bg-zinc-600"
                          }`}
                        >
                          {rule.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="text-sm text-red-400 transition-colors hover:text-red-300"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
