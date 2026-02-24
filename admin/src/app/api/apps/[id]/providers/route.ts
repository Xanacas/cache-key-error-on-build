import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const appProviders = await prisma.appProvider.findMany({
      where: { appId: id },
      include: {
        provider: true,
        credential: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(appProviders);
  } catch (error) {
    console.error("Failed to list app providers:", error);
    return NextResponse.json(
      { error: "Failed to list app providers" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { providerId, credentialId } = body;

    if (!providerId) {
      return NextResponse.json(
        { error: "providerId is required" },
        { status: 400 }
      );
    }

    // Verify the app exists
    const app = await prisma.appInstance.findUnique({ where: { id } });
    if (!app) {
      return NextResponse.json(
        { error: "App not found" },
        { status: 404 }
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

    const appProvider = await prisma.appProvider.create({
      data: {
        appId: id,
        providerId,
        credentialId: credentialId ?? null,
      },
      include: {
        provider: true,
        credential: true,
      },
    });

    return NextResponse.json(appProvider, { status: 201 });
  } catch (error) {
    console.error("Failed to link provider to app:", error);
    return NextResponse.json(
      { error: "Failed to link provider to app" },
      { status: 500 }
    );
  }
}
