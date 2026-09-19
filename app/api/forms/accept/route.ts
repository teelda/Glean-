import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { adminClient } from "@/lib/form-workspace";
import { apiError, HttpError, readJson } from "@/lib/http";
import { hasTrustedOrigin, hashPublicToken, consumeRateLimit } from "@/lib/security";

export async function POST(request: Request) {
  try {
    if (!hasTrustedOrigin(request)) throw new HttpError("Request origin is not allowed.", 403);
    const user = await requireUser();
    if (!user.email) throw new HttpError("Sign in with the invited email address.", 403);
    if (!await consumeRateLimit(`accept:${user.id}`, 30, 3600)) throw new HttpError("Too many attempts. Try again later.", 429);
    const { token } = z.object({ token: z.string().min(24).max(64) }).parse(await readJson(request, 1000));
    const { data, error } = await adminClient().rpc("accept_form_invitation", { invite_hash: hashPublicToken(token), accepting_user: user.id, accepting_email: user.email });
    if (error) throw error;
    if (!data) throw new HttpError("This invitation expired, was revoked, or belongs to a different email address.", 403);
    return NextResponse.json({ formId: data });
  } catch (error) { return apiError(error); }
}
