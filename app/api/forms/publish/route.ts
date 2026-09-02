import { NextResponse } from "next/server";
import { z } from "zod";
import { backendMode, publishForm } from "@/lib/form-backend";
import { requireUser, UnauthorizedError } from "@/lib/auth";

const questionSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  type: z.enum(["open", "single", "scale"]),
  options: z.array(z.string()).default([]),
  logic: z.object({ option: z.string().optional(), targetSectionId: z.string().optional() }).optional()
});

const publishSchema = z.object({
  formId: z.string().optional(),
  name: z.string().min(1),
  slug: z.string().min(1),
  sections: z.array(z.object({
    id: z.string(),
    title: z.string().min(1),
    questions: z.array(questionSchema)
  })).min(1)
});

export async function POST(request: Request) {
  try {
    // Publishing mints a public link to a form and stamps its owner, so it
    // must never run for an anonymous caller.
    const user = await requireUser();
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
