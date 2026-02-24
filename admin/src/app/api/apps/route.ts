import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function GET() {
  try {
    const apps = await prisma.appInstance.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        appProviders: {
          include: {
            provider: true,
          },
        },
      },
    });

    return NextResponse.json(apps);
  } catch (error) {
    console.error("Failed to list apps:", error);
    return NextResponse.json(
      { error: "Failed to list apps" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    // Create the app first to get the id, then update with the dummy key
    const app = await prisma.appInstance.create({
      data: {
        name,
        description,
        dummyApiKey: `proxy_temp_${crypto.randomUUID()}`,
      },
    });

    // Update with the proper dummy API key containing the app ID
    const updatedApp = await prisma.appInstance.update({
      where: { id: app.id },
      data: {
        dummyApiKey: `proxy_${app.id}_${crypto.randomUUID()}`,
      },
    });

    return NextResponse.json(updatedApp, { status: 201 });
  } catch (error) {
    console.error("Failed to create app:", error);
    return NextResponse.json(
      { error: "Failed to create app" },
      { status: 500 }
    );
  }
}
