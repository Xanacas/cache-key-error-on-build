import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Get start of today (UTC)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [totalApps, totalProviders, requestsToday, tokenUsageToday] =
      await Promise.all([
        prisma.appInstance.count(),
        prisma.provider.count(),
        prisma.requestLog.count({
          where: {
            createdAt: {
              gte: todayStart,
            },
          },
        }),
        prisma.tokenUsage.aggregate({
          where: {
            createdAt: {
              gte: todayStart,
            },
          },
          _sum: {
            totalTokens: true,
          },
        }),
      ]);

    return NextResponse.json({
      totalApps,
      totalProviders,
      requestsToday,
      tokenUsageToday: tokenUsageToday._sum.totalTokens ?? 0,
    });
  } catch (error) {
    console.error("Failed to get stats:", error);
    return NextResponse.json(
      { error: "Failed to get stats" },
      { status: 500 }
    );
  }
}
