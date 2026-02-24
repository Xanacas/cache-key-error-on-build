import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const alerts = await prisma.alertConfig.findMany({
      include: {
        app: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(alerts);
  } catch (error) {
    console.error("Failed to list alert configs:", error);
    return NextResponse.json(
      { error: "Failed to list alert configs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appId, limitType, providerId, threshold, hardLimit, isActive } = body;

    if (!appId || !limitType || threshold === undefined) {
      return NextResponse.json(
        { error: "appId, limitType, and threshold are required" },
        { status: 400 }
      );
    }

    const alert = await prisma.alertConfig.create({
      data: {
        appId,
        limitType,
        providerId: providerId ?? null,
        threshold,
        hardLimit: hardLimit ?? null,
        isActive: isActive ?? true,
      },
      include: {
        app: true,
      },
    });

    return NextResponse.json(alert, { status: 201 });
  } catch (error) {
    console.error("Failed to create alert config:", error);
    return NextResponse.json(
      { error: "Failed to create alert config" },
      { status: 500 }
    );
  }
}
