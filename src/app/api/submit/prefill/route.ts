import { NextResponse } from "next/server";
import { PrefillRequestSchema } from "@/lib/validations/submission";

// STUB: MVP implementation extracts domain name. Replace with real AI prefill later.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = PrefillRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { url, text } = parsed.data;

    // Stub: extract basic info from URL or text
    let name = "";
    let tagline = "";

    if (url) {
      try {
        const domain = new URL(url).hostname.replace("www.", "");
        name = domain.split(".")[0] ?? domain;
        // Capitalize first letter
        name = name.charAt(0).toUpperCase() + name.slice(1);
      } catch {
        name = "My Product";
      }
      tagline = `A product at ${url}`;
    } else if (text) {
      // Use first sentence as name, rest as tagline
      const sentences = text.split(/[。.！!？?]/);
      name = sentences[0]?.trim().slice(0, 30) ?? "My Product";
      tagline = sentences[1]?.trim() ?? text.slice(0, 80);
    }

    return NextResponse.json({
      name,
      tagline,
      description: "",
      suggestedCategories: {},
      suggestedTags: [],
      confidence: 0.3, // Low confidence since this is a stub
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
