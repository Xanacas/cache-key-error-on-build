import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const mocks = await prisma.mockCapture.findMany({
      include: {
        provider: true,
        app: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(mocks);
  } catch (error) {
    console.error("Failed to list mock captures:", error);
    return NextResponse.json(
      { error: "Failed to list mock captures" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      providerId,
      appId,
      method,
      urlPattern,
      requestHeaders,
      requestBody,
      responseStatus,
      responseHeaders,
      responseBody,
      isSimulation,
    } = body;

    if (!method || !urlPattern || responseStatus === undefined) {
      return NextResponse.json(
        { error: "method, urlPattern, and responseStatus are required" },
        { status: 400 }
      );
    }

    const mock = await prisma.mockCapture.create({
      data: {
        providerId: providerId ?? null,
        appId: appId ?? null,
        method,
        urlPattern,
        requestHeaders:
          requestHeaders != null
            ? typeof requestHeaders === "string"
              ? requestHeaders
              : JSON.stringify(requestHeaders)
            : null,
        requestBody: requestBody ?? null,
        responseStatus,
        responseHeaders:
          responseHeaders != null
            ? typeof responseHeaders === "string"
              ? responseHeaders
              : JSON.stringify(responseHeaders)
            : null,
        responseBody: responseBody ?? null,
        isSimulation: isSimulation ?? false,
      },
      include: {
        provider: true,
        app: true,
      },
    });

    return NextResponse.json(mock, { status: 201 });
  } catch (error) {
    console.error("Failed to create mock capture:", error);
    return NextResponse.json(
      { error: "Failed to create mock capture" },
      { status: 500 }
    );
  }
}
