import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      return NextResponse.json(
        { error: "code and state query parameters are required" },
        { status: 400 }
      );
    }

    // Decode state to get context
    let stateData: { providerId?: string; credentialId?: string; appId?: string } = {};
    try {
      stateData = JSON.parse(Buffer.from(state, "base64url").toString());
    } catch {
      return NextResponse.json(
        { error: "Invalid state parameter" },
        { status: 400 }
      );
    }

    // Log the callback for debugging
    console.log("OAuth callback received:", {
      code: code.substring(0, 8) + "...",
      providerId: stateData.providerId,
      credentialId: stateData.credentialId,
      appId: stateData.appId,
    });

    // The actual token exchange happens in the Rust proxy.
    // This endpoint just acknowledges the callback.
    return NextResponse.json({
      success: true,
      message: "OAuth callback received. Token exchange is handled by the proxy.",
      providerId: stateData.providerId,
      appId: stateData.appId,
    });
  } catch (error) {
    console.error("Failed to handle OAuth callback:", error);
    return NextResponse.json(
      { error: "Failed to handle OAuth callback" },
      { status: 500 }
    );
  }
}
