import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptIfAvailable } from "@/lib/crypto";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const credential = await prisma.credential.findUnique({
      where: { id },
      include: {
        provider: true,
      },
    });

    if (!credential) {
      return NextResponse.json(
        { error: "Credential not found" },
        { status: 404 },
      );
    }

    // Mask secrets
    return NextResponse.json({
      ...credential,
      apiKeyEncrypted: credential.apiKeyEncrypted ? "***encrypted***" : null,
      clientSecretEncrypted: credential.clientSecretEncrypted
        ? "***encrypted***"
        : null,
    });
  } catch (error) {
    console.error("Failed to get credential:", error);
    return NextResponse.json(
      { error: "Failed to get credential" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.apiKey !== undefined)
      updateData.apiKeyEncrypted = body.apiKey
        ? encryptIfAvailable(body.apiKey)
        : null;
    if (body.clientId !== undefined) updateData.clientId = body.clientId;
    if (body.clientSecret !== undefined)
      updateData.clientSecretEncrypted = body.clientSecret
        ? encryptIfAvailable(body.clientSecret)
        : null;
    if (body.label !== undefined) updateData.label = body.label;
    if (body.providerId !== undefined) updateData.providerId = body.providerId;

    const credential = await prisma.credential.update({
      where: { id },
      data: updateData,
      include: {
        provider: true,
      },
    });

    return NextResponse.json({
      ...credential,
      apiKeyEncrypted: credential.apiKeyEncrypted ? "***encrypted***" : null,
      clientSecretEncrypted: credential.clientSecretEncrypted
        ? "***encrypted***"
        : null,
    });
  } catch (error) {
    console.error("Failed to update credential:", error);
    return NextResponse.json(
      { error: "Failed to update credential" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prisma.credential.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete credential:", error);
    return NextResponse.json(
      { error: "Failed to delete credential" },
      { status: 500 },
    );
  }
}
