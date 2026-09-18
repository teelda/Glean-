import { NextResponse } from "next/server";
import { backendMode, getPublicForm } from "@/lib/form-backend";
import { consumeRateLimit, requestFingerprint } from "@/lib/security";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!await consumeRateLimit(requestFingerprint(request, `form:${token}`), 120, 3600)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  const form = await getPublicForm(token);
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  return NextResponse.json({ form, mode: backendMode() });
}
