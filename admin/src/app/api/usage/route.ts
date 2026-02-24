import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const appId = searchParams.get("appId");
    const providerId = searchParams.get("providerId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Build where clause based on filters
    const where: Record<string, unknown> = {};

    if (appId) {
      where.appId = appId;
    }
    if (providerId) {
      where.providerId = providerId;
    }
    if (from || to) {
      where.createdAt = {};
      if (from) {
        (where.createdAt as Record<string, unknown>).gte = new Date(from);
      }
      if (to) {
        (where.createdAt as Record<string, unknown>).lte = new Date(to);
      }
    }

    // Get individual records
    const records = await prisma.tokenUsage.findMany({
      where,
      include: {
        provider: true,
        app: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Compute aggregated totals
    const aggregated = await prisma.tokenUsage.aggregate({
      where,
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
      _count: true,
    });

    return NextResponse.json({
      records,
      aggregation: {
        totalInputTokens: aggregated._sum.inputTokens ?? 0,
        totalOutputTokens: aggregated._sum.outputTokens ?? 0,
        totalTokens: aggregated._sum.totalTokens ?? 0,
        recordCount: aggregated._count,
      },
    });
  } catch (error) {
    console.error("Failed to get usage data:", error);
    return NextResponse.json(
      { error: "Failed to get usage data" },
      { status: 500 }
    );
  }
}
