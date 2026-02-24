"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface FirewallRule {
  id: string;
  appId: string | null;
  appName: string | null;
  ruleType: string;
  pattern: string;
  action: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
}

interface AppOption {
  id: string;
  name: string;
}

export default function FirewallClient({
  initialRules,
  apps,
}: {
  initialRules: FirewallRule[];
  apps: AppOption[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [ruleType, setRuleType] = useState("domain");
  const [pattern, setPattern] = useState("");
  const [action, setAction] = useState("block");
  const [appId, setAppId] = useState("");
  const [priority, setPriority] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/firewall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleType,
          pattern,
          action,
          appId: appId || undefined,
          priority,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create rule");
      }

      setShowForm(false);
      setPattern("");
      setPriority(0);
      setAppId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(ruleId: string) {
    try {
      const res = await fetch(`/api/firewall/${ruleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.refresh();
    } catch {
      alert("Failed to delete rule");
    }
  }

  async function handleToggle(ruleId: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/firewall/${ruleId}`, {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Firewall Rules</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Control which requests are blocked or bypassed
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
            New Firewall Rule
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Rule Type
                </label>
                <select
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value)}
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="domain">Domain</option>
                  <option value="path">Path</option>
                  <option value="header">Header</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Action
                </label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="block">Block</option>
                  <option value="bypass">Bypass</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                Pattern (regex or exact match)
              </label>
              <input
                type="text"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                required
                placeholder="e.g. *.evil.com, /admin/*, X-Custom-Header: bad"
                className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                  App (optional, leave empty for global)
                </label>
                <select
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Global (all apps)</option>
                  {apps.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Priority
                </label>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Higher priority rules are evaluated first.
                </p>
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

      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-700 bg-zinc-800/50">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-300">Type</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Pattern</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Action</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Scope</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Active</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Priority</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-700">
            {initialRules.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No firewall rules configured.
                </td>
              </tr>
            ) : (
              initialRules.map((rule) => (
                <tr
                  key={rule.id}
                  className="transition-colors hover:bg-zinc-700/30"
                >
                  <td className="px-4 py-3">
                    <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
                      {rule.ruleType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="font-mono text-xs text-zinc-300">
                      {rule.pattern}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        rule.action === "block"
                          ? "bg-red-500/20 text-red-300"
                          : "bg-green-500/20 text-green-300"
                      }`}
                    >
                      {rule.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {rule.appName ? (
                      <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs">
                        {rule.appName}
                      </span>
                    ) : (
                      <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-xs text-blue-300">
                        Global
                      </span>
                    )}
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
                  <td className="px-4 py-3 text-zinc-400">{rule.priority}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="text-sm text-red-400 transition-colors hover:text-red-300"
                    >
                      Delete
                    </button>
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
