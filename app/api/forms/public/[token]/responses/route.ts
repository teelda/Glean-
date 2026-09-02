import { NextResponse } from "next/server";
import { z } from "zod";
import { backendMode, submitResponse } from "@/lib/form-backend";

const responseSchema = z.object({ answers: z.record(z.string()) });

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const payload = responseSchema.parse(await request.json());
    const response = await submitResponse(token, payload.answers);
    if (!response) return NextResponse.json({ error: "Form not found" }, { status: 404 });
    return NextResponse.json({ response, mode: backendMode() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not submit response" }, { status: 400 });
  }
}
