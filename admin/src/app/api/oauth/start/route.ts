import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerId, credentialId, appId } = body;

    if (!providerId || !credentialId || !appId) {
      return NextResponse.json(
        { error: "providerId, credentialId, and appId are required" },
        { status: 400 }
      );
    }

    // Fetch provider config
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    if (provider.authType !== "oauth") {
      return NextResponse.json(
        { error: "Provider does not use OAuth authentication" },
        { status: 400 }
      );
    }

    if (!provider.authUrl) {
      return NextResponse.json(
        { error: "Provider has no authUrl configured" },
        { status: 400 }
      );
    }

    // Fetch credential for clientId
    const credential = await prisma.credential.findUnique({
      where: { id: credentialId },
    });

    if (!credential) {
      return NextResponse.json(
        { error: "Credential not found" },
        { status: 404 }
      );
    }

    if (!credential.clientId) {
      return NextResponse.json(
        { error: "Credential has no clientId configured" },
        { status: 400 }
      );
    }

    // Generate state parameter (encodes context for the callback)
    const state = Buffer.from(
      JSON.stringify({
        providerId,
        credentialId,
        appId,
        nonce: crypto.randomUUID(),
      })
    ).toString("base64url");

    // Build authorization URL
    const authUrlObj = new URL(provider.authUrl);
    authUrlObj.searchParams.set("client_id", credential.clientId);
    authUrlObj.searchParams.set("response_type", "code");
    authUrlObj.searchParams.set("state", state);

    if (provider.redirectUrl) {
      authUrlObj.searchParams.set("redirect_uri", provider.redirectUrl);
    }

    if (provider.scopes) {
      try {
        const scopesArray = JSON.parse(provider.scopes);
        authUrlObj.searchParams.set("scope", scopesArray.join(" "));
      } catch {
        authUrlObj.searchParams.set("scope", provider.scopes);
      }
    }

    return NextResponse.json({
      authUrl: authUrlObj.toString(),
      state,
    });
  } catch (error) {
    console.error("Failed to start OAuth flow:", error);
    return NextResponse.json(
      { error: "Failed to start OAuth flow" },
      { status: 500 }
    );
  }
}
