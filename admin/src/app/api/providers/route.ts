import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    const providers = await prisma.provider.findMany({
      where: search
        ? {
            name: {
              contains: search,
            },
          }
        : undefined,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(providers);
  } catch (error) {
    console.error("Failed to list providers:", error);
    return NextResponse.json(
      { error: "Failed to list providers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      authType,
      baseUrls,
      authUrl,
      tokenUrl,
      refreshUrl,
      scopes,
      redirectUrl,
      isLlmProvider,
      isBuiltIn,
    } = body;

    if (!name || !authType || !baseUrls) {
      return NextResponse.json(
        { error: "name, authType, and baseUrls are required" },
        { status: 400 }
      );
    }

    const provider = await prisma.provider.create({
      data: {
        name,
        authType,
        baseUrls: typeof baseUrls === "string" ? baseUrls : JSON.stringify(baseUrls),
        authUrl,
        tokenUrl,
        refreshUrl,
        scopes: scopes ? (typeof scopes === "string" ? scopes : JSON.stringify(scopes)) : null,
        redirectUrl,
        isLlmProvider: isLlmProvider ?? false,
        isBuiltIn: isBuiltIn ?? false,
      },
    });

    return NextResponse.json(provider, { status: 201 });
  } catch (error) {
    console.error("Failed to create provider:", error);
    return NextResponse.json(
      { error: "Failed to create provider" },
      { status: 500 }
    );
  }
}
