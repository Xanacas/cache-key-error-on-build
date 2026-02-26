import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptIfAvailable } from "@/lib/crypto";

export async function GET() {
  try {
    const credentials = await prisma.credential.findMany({
      include: {
        provider: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Mask encrypted fields for display – never return raw secrets
    const masked = credentials.map((c: typeof credentials[number]) => ({
      ...c,
      apiKeyEncrypted: c.apiKeyEncrypted ? "***encrypted***" : null,
      clientSecretEncrypted: c.clientSecretEncrypted
        ? "***encrypted***"
        : null,
    }));

    return NextResponse.json(masked);
  } catch (error) {
    console.error("Failed to list credentials:", error);
    return NextResponse.json(
      { error: "Failed to list credentials" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerId, apiKey, clientId, clientSecret, label } = body;

    if (!providerId) {
      return NextResponse.json(
        { error: "providerId is required" },
        { status: 400 },
      );
    }

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });
    if (!provider) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 },
      );
    }

    // Encrypt secrets before storage
    const credential = await prisma.credential.create({
      data: {
        providerId,
        apiKeyEncrypted: apiKey ? encryptIfAvailable(apiKey) : null,
        clientId: clientId ?? null,
        clientSecretEncrypted: clientSecret
          ? encryptIfAvailable(clientSecret)
          : null,
        label: label ?? null,
      },
      include: {
        provider: true,
      },
    });

    return NextResponse.json(
      {
        ...credential,
        apiKeyEncrypted: credential.apiKeyEncrypted
          ? "***encrypted***"
          : null,
        clientSecretEncrypted: credential.clientSecretEncrypted
          ? "***encrypted***"
          : null,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create credential:", error);
    return NextResponse.json(
      { error: "Failed to create credential" },
      { status: 500 },
    );
  }
}
