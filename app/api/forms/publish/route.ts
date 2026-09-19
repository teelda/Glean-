import { NextResponse } from "next/server";
import { formSaveSchema } from "@/lib/form-validation";
import { saveForm } from "@/lib/form-workspace";
import { apiError, readJson } from "@/lib/http";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { consumeRateLimit, hasTrustedOrigin } from "@/lib/security";

export async function POST(request: Request) {
  try {
    if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    // Publishing mints a public link to a form and stamps its owner, so it
    // must never run for an anonymous caller.
    const user = await requireUser();
    if (!await consumeRateLimit(`publish:${user.id}`, 30, 3600)) {
      return NextResponse.json({ error: "Too many publish attempts. Please try again later." }, { status: 429 });
    }
    const payload = formSaveSchema.parse({ ...await readJson(request), publish: true });
    const form = await saveForm(payload, user.id);
    return NextResponse.json({ form, mode: "supabase" });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return apiError(error);
  }
}
