import { prisma } from "@/lib/prisma";
import MocksClient from "./MocksClient";

export default async function MocksPage() {
  const mocks = await prisma.mockCapture.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      provider: { select: { name: true } },
      app: { select: { name: true } },
    },
  });

  const serialized = mocks.map((m) => ({
    id: m.id,
    method: m.method,
    urlPattern: m.urlPattern,
    responseStatus: m.responseStatus,
    isSimulation: m.isSimulation,
    providerName: m.provider?.name || null,
    appName: m.app?.name || null,
    requestHeaders: m.requestHeaders,
    requestBody: m.requestBody,
    responseHeaders: m.responseHeaders,
    responseBody: m.responseBody,
    createdAt: m.createdAt.toISOString(),
  }));

  return <MocksClient initialMocks={serialized} />;
}
