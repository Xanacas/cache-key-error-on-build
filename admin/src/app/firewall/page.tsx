import { prisma } from "@/lib/prisma";
import FirewallClient from "./FirewallClient";

export default async function FirewallPage() {
  const rules = await prisma.firewallRule.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    include: {
      app: { select: { id: true, name: true } },
    },
  });

  const apps = await prisma.appInstance.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const serializedRules = rules.map((r) => ({
    id: r.id,
    appId: r.appId,
    appName: r.app?.name || null,
    ruleType: r.ruleType,
    pattern: r.pattern,
    action: r.action,
    priority: r.priority,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <FirewallClient
      initialRules={serializedRules}
      apps={apps}
    />
  );
}
