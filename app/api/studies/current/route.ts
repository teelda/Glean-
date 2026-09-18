import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consumeRateLimit, hasTrustedOrigin } from "@/lib/security";

const studySchema = z.object({
  title: z.string().trim().min(1).max(200), goal: z.string().max(10_000),
  context: z.string().max(20_000).optional().default(""), targetUsers: z.string().max(10_000).optional().default(""),
  hypotheses: z.string().max(20_000).optional().default(""), questions: z.array(z.string().max(2_000)).max(100).optional().default([]),
  status: z.enum(["draft", "analysed", "stale"]), interviews: z.array(z.unknown()).max(500),
  themes: z.array(z.unknown()).max(500), updatedAt: z.string().max(100)
}).passthrough();

async function clientAndUser() {
  const user = await requireUser();
  const client = await createSupabaseServerClient();
  if (!client) throw new Error("Study storage is not configured.");
  return { user, client };
}

export async function GET() {
  try {
    const { user, client } = await clientAndUser();
    const { data, error } = await client.from("studies").select("id, snapshot, updated_at")
      .eq("owner_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ study: data?.snapshot ?? null, id: data?.id ?? null, updatedAt: data?.updated_at ?? null });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json({ error: "Glean could not load this study." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    const { user, client } = await clientAndUser();
    if (!await consumeRateLimit(`study-save:${user.id}`, 300, 3600)) return NextResponse.json({ error: "Too many saves. Wait a moment and try again." }, { status: 429 });
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 2_000_000) return NextResponse.json({ error: "This study is too large to save." }, { status: 413 });
    const study = studySchema.parse(await request.json());
    const { data: existing, error: findError } = await client.from("studies").select("id")
      .eq("owner_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (findError) throw findError;
    const values = { owner_id: user.id, title: study.title, goal: study.goal, context: study.context,
      target_users: study.targetUsers, hypotheses: study.hypotheses, questions: study.questions,
      status: study.status, snapshot: study, updated_at: new Date().toISOString() };
    const query = existing ? client.from("studies").update(values).eq("id", existing.id).eq("owner_id", user.id) : client.from("studies").insert(values);
    const { data, error } = await query.select("id, updated_at").single();
    if (error) throw error;
    return NextResponse.json({ id: data.id, updatedAt: data.updated_at });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Some study data is invalid or too large." }, { status: 400 });
    return NextResponse.json({ error: "Glean could not save this study." }, { status: 500 });
  }
}
