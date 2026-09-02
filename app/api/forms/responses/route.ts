import { NextResponse } from "next/server";
import { backendMode, listResponses } from "@/lib/form-backend";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const formId = searchParams.get("formId");

  // Without this guard the handler returned every response in the database.
  if (!formId) {
    return NextResponse.json({ error: "A formId is required." }, { status: 400 });
  }

  try {
    // A form id is not a secret, so it cannot be the only thing standing
    // between a caller and someone else's respondent answers.
    const user = await requireUser();
    const responses = await listResponses(formId, user.id);
    return NextResponse.json({ responses, mode: backendMode() });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load responses" },
      { status: 500 }
    );
  }
}
