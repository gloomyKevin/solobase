import { NextResponse } from "next/server";
import { RecommendRequestSchema } from "@/lib/validations/feedback";
import { getDataService } from "@/services/data";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RecommendRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const dataService = getDataService();
    const submission = await dataService.createSubmission({
      type: "recommend",
      url: parsed.data.url,
      recommendedBy: parsed.data.recommendedBy,
      recommendReason: parsed.data.recommendReason,
      additionalText: parsed.data.additionalNotes,
      status: "pending_review",
    });

    return NextResponse.json({ id: submission.id, success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
