import { NextResponse } from "next/server";
import { SubmitRequestSchema } from "@/lib/validations/submission";
import { getDataService } from "@/services/data";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = SubmitRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const dataService = getDataService();
    const submission = await dataService.createSubmission({
      type: "self_submit",
      url: parsed.data.url,
      additionalText: parsed.data.additionalText,
      confirmedData: parsed.data.confirmedData,
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
