import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rule = await prisma.firewallRule.findUnique({
      where: { id },
      include: {
        app: true,
      },
    });

    if (!rule) {
      return NextResponse.json(
        { error: "Firewall rule not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(rule);
  } catch (error) {
    console.error("Failed to get firewall rule:", error);
    return NextResponse.json(
      { error: "Failed to get firewall rule" },
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

    const rule = await prisma.firewallRule.update({
      where: { id },
      data: body,
      include: {
        app: true,
      },
    });

    return NextResponse.json(rule);
  } catch (error) {
    console.error("Failed to update firewall rule:", error);
    return NextResponse.json(
      { error: "Failed to update firewall rule" },
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
    await prisma.firewallRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete firewall rule:", error);
    return NextResponse.json(
      { error: "Failed to delete firewall rule" },
      { status: 500 }
    );
  }
}
