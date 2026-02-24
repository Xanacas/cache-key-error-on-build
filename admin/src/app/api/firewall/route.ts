import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rules = await prisma.firewallRule.findMany({
      include: {
        app: true,
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(rules);
  } catch (error) {
    console.error("Failed to list firewall rules:", error);
    return NextResponse.json(
      { error: "Failed to list firewall rules" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appId, ruleType, pattern, action, priority, isActive } = body;

    if (!ruleType || !pattern || !action) {
      return NextResponse.json(
        { error: "ruleType, pattern, and action are required" },
        { status: 400 }
      );
    }

    const rule = await prisma.firewallRule.create({
      data: {
        appId: appId ?? null,
        ruleType,
        pattern,
        action,
        priority: priority ?? 0,
        isActive: isActive ?? true,
      },
      include: {
        app: true,
      },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error("Failed to create firewall rule:", error);
    return NextResponse.json(
      { error: "Failed to create firewall rule" },
      { status: 500 }
    );
  }
}
