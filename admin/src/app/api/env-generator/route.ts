import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appId, providerIds } = body;

    if (!appId || !providerIds || !Array.isArray(providerIds) || providerIds.length === 0) {
      return NextResponse.json(
        { error: "appId and providerIds (non-empty array) are required" },
        { status: 400 }
      );
    }

    // Fetch the app
    const app = await prisma.appInstance.findUnique({
      where: { id: appId },
    });

    if (!app) {
      return NextResponse.json(
        { error: "App not found" },
        { status: 404 }
      );
    }

    // Fetch selected providers
    const providers = await prisma.provider.findMany({
      where: {
        id: { in: providerIds },
      },
    });

    if (providers.length === 0) {
      return NextResponse.json(
        { error: "No valid providers found" },
        { status: 404 }
      );
    }

    // Generate .env content
    const lines: string[] = [
      "# ─── Generated Environment Variables ───────────────────────",
      `# App: ${app.name} (${app.id})`,
      `# Generated at: ${new Date().toISOString()}`,
      "",
      "# Proxy configuration",
      `PROXY_APP_ID=${app.id}`,
      `PROXY_API_KEY=${app.dummyApiKey}`,
      "",
    ];

    for (const provider of providers) {
      const envPrefix = provider.name.toUpperCase().replace(/[^A-Z0-9]/g, "_");

      lines.push(`# ─── ${provider.name} ───`);
      lines.push(`${envPrefix}_PROVIDER_ID=${provider.id}`);

      if (provider.authType === "api_key") {
        lines.push(`${envPrefix}_API_KEY=your_${provider.name.toLowerCase().replace(/\s+/g, "_")}_api_key_here`);
      } else if (provider.authType === "oauth") {
        lines.push(`${envPrefix}_CLIENT_ID=your_client_id_here`);
        lines.push(`${envPrefix}_CLIENT_SECRET=your_client_secret_here`);
      }

      // Parse and include base URLs
      try {
        const baseUrls = JSON.parse(provider.baseUrls);
        if (Array.isArray(baseUrls) && baseUrls.length > 0) {
          lines.push(`${envPrefix}_BASE_URL=${baseUrls[0]}`);
        }
      } catch {
        lines.push(`${envPrefix}_BASE_URL=${provider.baseUrls}`);
      }

      lines.push("");
    }

    const envContent = lines.join("\n");

    return NextResponse.json({
      envContent,
      appName: app.name,
      providerCount: providers.length,
    });
  } catch (error) {
    console.error("Failed to generate env:", error);
    return NextResponse.json(
      { error: "Failed to generate env" },
      { status: 500 }
    );
  }
}
