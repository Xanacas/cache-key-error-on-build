"use client";

import { useState } from "react";
import Link from "next/link";

export default function NewAppPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdApp, setCreatedApp] = useState<{
    id: string;
    name: string;
    dummyApiKey: string;
  } | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to create app (${res.status})`);
      }

      const data = await res.json();
      setCreatedApp(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  if (createdApp) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link
            href="/apps"
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
          >
            &larr; Back to Apps
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-100">
            App Created Successfully
          </h1>
        </div>

        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-6">
          <h2 className="mb-2 text-lg font-semibold text-green-300">
            {createdApp.name}
          </h2>
          <p className="mb-4 text-sm text-zinc-400">
            Save your dummy API key below. You will use this key to identify
            your application when making requests through the proxy.
          </p>
          <div className="rounded-lg border border-zinc-600 bg-zinc-800 p-4">
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Dummy API Key
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-zinc-700 px-3 py-2 font-mono text-sm text-zinc-100">
                {createdApp.dummyApiKey}
              </code>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(createdApp.dummyApiKey)
                }
                className="shrink-0 rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
              >
                Copy
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Link
            href={`/apps/${createdApp.id}`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            View App Details
          </Link>
          <Link
            href="/apps"
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            Back to Apps
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/apps"
          className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          &larr; Back to Apps
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-100">
          Create New App
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Register a new application instance to use with the proxy
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
              App Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. My Web App, Backend Service"
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Brief description of what this app does"
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create App"}
            </button>
            <Link
              href="/apps"
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
