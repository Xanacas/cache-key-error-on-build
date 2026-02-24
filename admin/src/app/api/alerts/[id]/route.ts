import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const alert = await prisma.alertConfig.findUnique({
      where: { id },
      include: {
        app: true,
      },
    });

    if (!alert) {
      return NextResponse.json(
        { error: "Alert config not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(alert);
  } catch (error) {
    console.error("Failed to get alert config:", error);
    return NextResponse.json(
      { error: "Failed to get alert config" },
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

    const alert = await prisma.alertConfig.update({
      where: { id },
      data: body,
      include: {
        app: true,
      },
    });

    return NextResponse.json(alert);
  } catch (error) {
    console.error("Failed to update alert config:", error);
    return NextResponse.json(
      { error: "Failed to update alert config" },
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
    await prisma.alertConfig.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete alert config:", error);
    return NextResponse.json(
      { error: "Failed to delete alert config" },
      { status: 500 }
    );
  }
}
