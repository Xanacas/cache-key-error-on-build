"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AvailableProvider {
  id: string;
  name: string;
}

export default function LinkProviderForm({
  appId,
  availableProviders,
}: {
  appId: string;
  availableProviders: AvailableProvider[];
}) {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLink() {
    if (!selectedProvider) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/apps/${appId}/providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: selectedProvider }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to link provider");
      }

      setSelectedProvider("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  if (availableProviders.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        All providers are already linked to this app.
      </p>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <select
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select a provider to link...</option>
          {availableProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleLink}
          disabled={!selectedProvider || loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Linking..." : "Link Provider"}
        </button>
      </div>
    </div>
  );
}
