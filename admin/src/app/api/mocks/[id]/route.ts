import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const mock = await prisma.mockCapture.findUnique({
      where: { id },
      include: {
        provider: true,
        app: true,
      },
    });

    if (!mock) {
      return NextResponse.json(
        { error: "Mock capture not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(mock);
  } catch (error) {
    console.error("Failed to get mock capture:", error);
    return NextResponse.json(
      { error: "Failed to get mock capture" },
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

    // Stringify JSON fields if they are objects
    if (body.requestHeaders != null && typeof body.requestHeaders !== "string") {
      body.requestHeaders = JSON.stringify(body.requestHeaders);
    }
    if (body.responseHeaders != null && typeof body.responseHeaders !== "string") {
      body.responseHeaders = JSON.stringify(body.responseHeaders);
    }

    const mock = await prisma.mockCapture.update({
      where: { id },
      data: body,
      include: {
        provider: true,
        app: true,
      },
    });

    return NextResponse.json(mock);
  } catch (error) {
    console.error("Failed to update mock capture:", error);
    return NextResponse.json(
      { error: "Failed to update mock capture" },
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
    await prisma.mockCapture.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete mock capture:", error);
    return NextResponse.json(
      { error: "Failed to delete mock capture" },
      { status: 500 }
    );
  }
}
