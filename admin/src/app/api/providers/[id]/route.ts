import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const provider = await prisma.provider.findUnique({
      where: { id },
      include: {
        credentials: true,
        appProviders: true,
      },
    });

    if (!provider) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(provider);
  } catch (error) {
    console.error("Failed to get provider:", error);
    return NextResponse.json(
      { error: "Failed to get provider" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // If baseUrls or scopes are arrays, stringify them
    if (Array.isArray(body.baseUrls)) {
      body.baseUrls = JSON.stringify(body.baseUrls);
    }
    if (Array.isArray(body.scopes)) {
      body.scopes = JSON.stringify(body.scopes);
    }

    const provider = await prisma.provider.update({
      where: { id },
      data: body,
    });

    return NextResponse.json(provider);
  } catch (error) {
    console.error("Failed to update provider:", error);
    return NextResponse.json(
      { error: "Failed to update provider" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.provider.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete provider:", error);
    return NextResponse.json(
      { error: "Failed to delete provider" },
      { status: 500 }
    );
  }
}
