import { NextResponse } from "next/server";
import { z } from "zod";
import { backendMode, submitResponse } from "@/lib/form-backend";
import { consumeRateLimit, requestFingerprint } from "@/lib/security";
import { readJson } from "@/lib/http";

const responseSchema = z.object({ answers: z.record(z.string().max(10_000)).refine(value => Object.keys(value).length <= 200, "Too many answers") });

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return NextResponse.json({ error: "Form not found" }, { status: 404 });
    const allowed = await consumeRateLimit(requestFingerprint(request, "responses"), 20, 3600);
    if (!allowed) return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
    const payload = responseSchema.parse(await readJson(request, 200000));
    const response = await submitResponse(token, payload.answers);
    if (!response) return NextResponse.json({ error: "Form not found" }, { status: 404 });
    return NextResponse.json({ response, mode: backendMode() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not submit response" }, { status: 400 });
  }
}
