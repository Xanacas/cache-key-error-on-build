import { prisma } from "@/lib/prisma";

async function checkProxyStatus(): Promise<{
  connected: boolean;
  error?: string;
}> {
  try {
    const proxyUrl = process.env.PROXY_MANAGEMENT_URL || "http://localhost:4000";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${proxyUrl}/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    return { connected: res.ok };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

export default async function SettingsPage() {
  const [
    proxyStatus,
    providerCount,
    appCount,
    credentialCount,
    tokenCount,
    usageCount,
    logCount,
    firewallCount,
    registryCount,
    mockCount,
  ] = await Promise.all([
    checkProxyStatus(),
    prisma.provider.count(),
    prisma.appInstance.count(),
    prisma.credential.count(),
    prisma.token.count(),
    prisma.tokenUsage.count(),
    prisma.requestLog.count(),
    prisma.firewallRule.count(),
    prisma.registryRule.count(),
    prisma.mockCapture.count(),
  ]);

  const proxyPort = process.env.PROXY_PORT || "8080";
  const masterKeyStatus = process.env.MASTER_KEY ? "Configured" : "Not Set";

  const stats = [
    { label: "Providers", count: providerCount },
    { label: "Apps", count: appCount },
    { label: "Credentials", count: credentialCount },
    { label: "OAuth Tokens", count: tokenCount },
    { label: "Usage Records", count: usageCount },
    { label: "Request Logs", count: logCount },
    { label: "Firewall Rules", count: firewallCount },
    { label: "Registry Rules", count: registryCount },
    { label: "Mock Captures", count: mockCount },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">
          System status and configuration overview
        </p>
      </div>

      {/* Proxy Status */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Proxy Status
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-600 bg-zinc-700/30 p-4">
            <p className="text-sm text-zinc-400">Connection</p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`h-3 w-3 rounded-full ${
                  proxyStatus.connected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span
                className={`text-lg font-semibold ${
                  proxyStatus.connected ? "text-green-300" : "text-red-300"
                }`}
              >
                {proxyStatus.connected ? "Connected" : "Disconnected"}
              </span>
            </div>
            {proxyStatus.error && (
              <p className="mt-1 text-xs text-red-400">{proxyStatus.error}</p>
            )}
          </div>

          <div className="rounded-lg border border-zinc-600 bg-zinc-700/30 p-4">
            <p className="text-sm text-zinc-400">Proxy Port</p>
            <p className="mt-2 text-lg font-semibold text-zinc-100">
              {proxyPort}
            </p>
          </div>

          <div className="rounded-lg border border-zinc-600 bg-zinc-700/30 p-4">
            <p className="text-sm text-zinc-400">Master Key</p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`h-3 w-3 rounded-full ${
                  masterKeyStatus === "Configured"
                    ? "bg-green-500"
                    : "bg-yellow-500"
                }`}
              />
              <span
                className={`text-lg font-semibold ${
                  masterKeyStatus === "Configured"
                    ? "text-green-300"
                    : "text-yellow-300"
                }`}
              >
                {masterKeyStatus}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Database Stats */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Database Statistics
        </h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-zinc-600 bg-zinc-700/30 p-4"
            >
              <p className="text-sm text-zinc-400">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-100">
                {stat.count.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Environment Info */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Environment
        </h2>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between border-b border-zinc-700 pb-3">
            <dt className="text-zinc-400">Node Environment</dt>
            <dd className="rounded bg-zinc-700 px-2 py-0.5 font-mono text-xs text-zinc-300">
              {process.env.NODE_ENV || "development"}
            </dd>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-700 pb-3">
            <dt className="text-zinc-400">Proxy Management URL</dt>
            <dd className="font-mono text-xs text-zinc-300">
              {process.env.PROXY_MANAGEMENT_URL || "http://localhost:4000"}
            </dd>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-700 pb-3">
            <dt className="text-zinc-400">Database</dt>
            <dd className="font-mono text-xs text-zinc-300">SQLite</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-zinc-400">Admin Panel</dt>
            <dd className="font-mono text-xs text-zinc-300">
              {process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
