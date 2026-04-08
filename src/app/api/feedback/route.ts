import { NextResponse } from "next/server";
import { FeedbackRequestSchema } from "@/lib/validations/feedback";
import { getDataService } from "@/services/data";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = FeedbackRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const dataService = getDataService();
    const feedback = await dataService.createFeedback({
      type: parsed.data.type,
      content: parsed.data.content,
      status: "new",
    });

    return NextResponse.json({ id: feedback.id, success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
