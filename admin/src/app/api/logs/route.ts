import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const appId = searchParams.get("appId");
    const action = searchParams.get("action");
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    // Build where clause based on filters
    const where: Record<string, unknown> = {};

    if (appId) {
      where.appId = appId;
    }
    if (action) {
      where.action = action;
    }

    const [logs, total] = await Promise.all([
      prisma.requestLog.findMany({
        where,
        include: {
          app: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.requestLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Failed to get request logs:", error);
    return NextResponse.json(
      { error: "Failed to get request logs" },
      { status: 500 }
    );
  }
}
