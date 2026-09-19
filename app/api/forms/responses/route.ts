import { NextResponse } from "next/server";
import { formAccess, canReadResponses } from "@/lib/form-workspace";
import { apiError, HttpError } from "@/lib/http";
import { z } from "zod";
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
    z.string().uuid().parse(formId);
    const page = z.coerce.number().int().min(0).max(10000).parse(searchParams.get("page") ?? 0);
    const { db, role } = await formAccess(formId, user.id);
    if (!canReadResponses(role)) throw new HttpError("Reviewers cannot read respondent data.", 403);
    const { data, count, error } = await db.from("form_responses").select("id,answers,created_at,question_snapshot", { count: "exact" }).eq("form_id", formId).order("created_at", { ascending: false }).order("id").range(page * 50, page * 50 + 49);
    if (error) throw error;
    return NextResponse.json({ responses: (data ?? []).map(r => ({ id: r.id, answers: r.answers, createdAt: r.created_at, sections: r.question_snapshot })), total: count ?? 0, page, hasMore: (page + 1) * 50 < (count ?? 0) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return apiError(error);
  }
}
