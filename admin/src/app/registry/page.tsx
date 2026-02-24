import { prisma } from "@/lib/prisma";
import RegistryClient from "./RegistryClient";

export default async function RegistryPage() {
  const rules = await prisma.registryRule.findMany({
    orderBy: [{ createdAt: "desc" }],
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
    appName: r.app.name,
    domain: r.domain,
    allowedMethods: r.allowedMethods,
    pathPattern: r.pathPattern,
    rateLimit: r.rateLimit,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  }));

  return <RegistryClient initialRules={serializedRules} apps={apps} />;
}
