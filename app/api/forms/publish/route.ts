import { NextResponse } from "next/server";
import { z } from "zod";
import { backendMode, publishForm } from "@/lib/form-backend";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { consumeRateLimit, hasTrustedOrigin } from "@/lib/security";

const questionSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(2_000),
  type: z.enum(["open", "single", "scale"]),
  options: z.array(z.string().max(500)).max(100).default([]),
  logic: z.object({ option: z.string().optional(), targetSectionId: z.string().optional() }).optional()
});

const publishSchema = z.object({
  formId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  sections: z.array(z.object({
    id: z.string().min(1).max(100),
    title: z.string().trim().min(1).max(200),
    questions: z.array(questionSchema).max(200)
  })).min(1).max(50)
});

export async function POST(request: Request) {
  try {
    if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    // Publishing mints a public link to a form and stamps its owner, so it
    // must never run for an anonymous caller.
    const user = await requireUser();
    if (!await consumeRateLimit(`publish:${user.id}`, 30, 3600)) {
      return NextResponse.json({ error: "Too many publish attempts. Please try again later." }, { status: 429 });
    }
    const payload = publishSchema.parse(await request.json());
    const form = await publishForm({ ...payload, ownerId: user.id });
    return NextResponse.json({ form, mode: backendMode() });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not publish form" }, { status: 400 });
  }
}
