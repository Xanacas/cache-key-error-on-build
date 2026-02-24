import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rules = await prisma.registryRule.findMany({
      include: {
        app: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(rules);
  } catch (error) {
    console.error("Failed to list registry rules:", error);
    return NextResponse.json(
      { error: "Failed to list registry rules" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appId, domain, allowedMethods, pathPattern, rateLimit, isActive } = body;

    if (!appId || !domain || !allowedMethods || !pathPattern) {
      return NextResponse.json(
        { error: "appId, domain, allowedMethods, and pathPattern are required" },
        { status: 400 }
      );
    }

    const rule = await prisma.registryRule.create({
      data: {
        appId,
        domain,
        allowedMethods:
          typeof allowedMethods === "string"
            ? allowedMethods
            : JSON.stringify(allowedMethods),
        pathPattern,
        rateLimit: rateLimit ?? null,
        isActive: isActive ?? true,
      },
      include: {
        app: true,
      },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error("Failed to create registry rule:", error);
    return NextResponse.json(
      { error: "Failed to create registry rule" },
      { status: 500 }
    );
  }
}
