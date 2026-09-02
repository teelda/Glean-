import { NextResponse } from "next/server";
import { backendMode, listResponses } from "@/lib/form-backend";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const formId = searchParams.get("formId");

  // Without this guard the handler returned every response in the database.
  if (!formId) {
    return NextResponse.json({ error: "A formId is required." }, { status: 400 });
  }

  try {
    const responses = await listResponses(formId);
    return NextResponse.json({ responses, mode: backendMode() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load responses" },
      { status: 500 }
    );
  }
}
