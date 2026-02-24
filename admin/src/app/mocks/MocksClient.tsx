"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface MockCapture {
  id: string;
  method: string;
  urlPattern: string;
  responseStatus: number;
  isSimulation: boolean;
  providerName: string | null;
  appName: string | null;
  requestHeaders: string | null;
  requestBody: string | null;
  responseHeaders: string | null;
  responseBody: string | null;
  createdAt: string;
}

export default function MocksClient({
  initialMocks,
}: {
  initialMocks: MockCapture[];
}) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleToggleSimulation(mockId: string, current: boolean) {
    try {
      const res = await fetch(`/api/mocks/${mockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSimulation: !current }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
      router.refresh();
    } catch {
      alert("Failed to toggle simulation");
    }
  }

  async function handleDelete(mockId: string) {
    try {
      const res = await fetch(`/api/mocks/${mockId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.refresh();
    } catch {
      alert("Failed to delete mock");
    }
  }

  function formatJson(raw: string | null): string {
    if (!raw) return "N/A";
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">
          Mocks & Captures
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          View captured requests/responses and manage mock simulations
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-700 bg-zinc-800/50">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-300">Method</th>
              <th className="px-4 py-3 font-medium text-zinc-300">
                URL Pattern
              </th>
              <th className="px-4 py-3 font-medium text-zinc-300">Status</th>
              <th className="px-4 py-3 font-medium text-zinc-300">
                Provider
              </th>
              <th className="px-4 py-3 font-medium text-zinc-300">App</th>
              <th className="px-4 py-3 font-medium text-zinc-300">
                Simulation
              </th>
              <th className="px-4 py-3 font-medium text-zinc-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-700">
            {initialMocks.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No mock captures found. Captured requests will appear here.
                </td>
              </tr>
            ) : (
              initialMocks.map((mock) => (
                <>
                  <tr
                    key={mock.id}
                    className="cursor-pointer transition-colors hover:bg-zinc-700/30"
                    onClick={() =>
                      setExpandedId(
                        expandedId === mock.id ? null : mock.id
                      )
                    }
                  >
                    <td className="px-4 py-3">
                      <span className="rounded bg-zinc-700 px-1.5 py-0.5 font-mono text-xs text-zinc-300">
                        {mock.method}
                      </span>
                    </td>
                    <td className="max-w-[250px] truncate px-4 py-3 font-mono text-xs text-zinc-300">
                      {mock.urlPattern}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-mono text-xs ${
                          mock.responseStatus >= 200 &&
                          mock.responseStatus < 300
                            ? "text-green-400"
                            : mock.responseStatus >= 400
                              ? "text-red-400"
                              : "text-yellow-400"
                        }`}
                      >
                        {mock.responseStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {mock.providerName || "--"}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {mock.appName || "--"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSimulation(
                            mock.id,
                            mock.isSimulation
                          );
                        }}
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                          mock.isSimulation
                            ? "bg-green-500/20 text-green-300 hover:bg-green-500/30"
                            : "bg-zinc-600/50 text-zinc-400 hover:bg-zinc-600"
                        }`}
                      >
                        {mock.isSimulation ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(mock.id);
                        }}
                        className="text-sm text-red-400 transition-colors hover:text-red-300"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expandedId === mock.id && (
                    <tr key={`${mock.id}-detail`}>
                      <td colSpan={7} className="bg-zinc-900 px-4 py-4">
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div>
                            <h4 className="mb-2 text-sm font-medium text-zinc-300">
                              Request Headers
                            </h4>
                            <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-800 p-3 font-mono text-xs text-zinc-400">
                              {formatJson(mock.requestHeaders)}
                            </pre>
                          </div>
                          <div>
                            <h4 className="mb-2 text-sm font-medium text-zinc-300">
                              Request Body
                            </h4>
                            <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-800 p-3 font-mono text-xs text-zinc-400">
                              {formatJson(mock.requestBody)}
                            </pre>
                          </div>
                          <div>
                            <h4 className="mb-2 text-sm font-medium text-zinc-300">
                              Response Headers
                            </h4>
                            <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-800 p-3 font-mono text-xs text-zinc-400">
                              {formatJson(mock.responseHeaders)}
                            </pre>
                          </div>
                          <div>
                            <h4 className="mb-2 text-sm font-medium text-zinc-300">
                              Response Body
                            </h4>
                            <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-800 p-3 font-mono text-xs text-zinc-400">
                              {formatJson(mock.responseBody)}
                            </pre>
                          </div>
                        </div>
                        <p className="mt-3 text-xs text-zinc-500">
                          Captured: {new Date(mock.createdAt).toLocaleString()}
                        </p>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
