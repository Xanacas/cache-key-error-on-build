import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const credentials = await prisma.credential.findMany({
      include: {
        provider: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(credentials);
  } catch (error) {
    console.error("Failed to list credentials:", error);
    return NextResponse.json(
      { error: "Failed to list credentials" },
      { status: 500 }
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
        { status: 400 }
      );
    }

    // Verify the provider exists
    const provider = await prisma.provider.findUnique({ where: { id: providerId } });
    if (!provider) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    // TODO: In a real implementation, apiKey and clientSecret would be encrypted before storage.
    // For now, store as-is.
    const credential = await prisma.credential.create({
      data: {
        providerId,
        apiKeyEncrypted: apiKey ?? null,
        clientId: clientId ?? null,
        clientSecretEncrypted: clientSecret ?? null,
        label: label ?? null,
      },
      include: {
        provider: true,
      },
    });

    return NextResponse.json(credential, { status: 201 });
  } catch (error) {
    console.error("Failed to create credential:", error);
    return NextResponse.json(
      { error: "Failed to create credential" },
      { status: 500 }
    );
  }
}
