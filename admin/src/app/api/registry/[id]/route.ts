import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rule = await prisma.registryRule.findUnique({
      where: { id },
      include: {
        app: true,
      },
    });

    if (!rule) {
      return NextResponse.json(
        { error: "Registry rule not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(rule);
  } catch (error) {
    console.error("Failed to get registry rule:", error);
    return NextResponse.json(
      { error: "Failed to get registry rule" },
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

    // If allowedMethods is an array, stringify it
    if (Array.isArray(body.allowedMethods)) {
      body.allowedMethods = JSON.stringify(body.allowedMethods);
    }

    const rule = await prisma.registryRule.update({
      where: { id },
      data: body,
      include: {
        app: true,
      },
    });

    return NextResponse.json(rule);
  } catch (error) {
    console.error("Failed to update registry rule:", error);
    return NextResponse.json(
      { error: "Failed to update registry rule" },
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
    await prisma.registryRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete registry rule:", error);
    return NextResponse.json(
      { error: "Failed to delete registry rule" },
      { status: 500 }
    );
  }
}
